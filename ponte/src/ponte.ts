// Ponte FP PRO <-> WinStudio. Avvio:
//   node --env-file=<.env> ponte/src/ponte.ts             (servizio: segnale + coda)
//   node --env-file=<.env> ponte/src/ponte.ts --una-volta (una sincronizzazione e basta)
import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'
import { conTempoMassimo, devoAccodareSyncGiornaliera, giornoRoma, richiestaBloccata } from '../../lib/fppro/ponte-regole.ts'
import { leggiConfig } from './config.ts'
import { impostaLog, log } from './log.ts'
import { sincronizza } from './sincronizza.ts'

const VERSIONE = '1.1.0'
const GIRO_MS = 30_000
// Una sync dura meno di un minuto: oltre 20 minuti e' appesa (query o rete senza risposta).
const SYNC_MAX_MS = 20 * 60 * 1000

const cfg = leggiConfig()
impostaLog(cfg.logDir)
const supabase = createClient(cfg.supabaseUrl, cfg.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const db = mysql.createPool({ ...cfg.mysql, connectionLimit: 2 })

const messaggio = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function segnale(): Promise<void> {
  const { error } = await supabase
    .from('fp_ponte_stato')
    .upsert(
      { organization_id: cfg.orgId, ultimo_segnale_at: new Date().toISOString(), versione: VERSIONE },
      { onConflict: 'organization_id' },
    )
  if (error) throw new Error(error.message)
}

/** Una richiesta rimasta "in corso" vuol dire che il ponte si e' fermato a meta'. */
async function chiudiInterrotte(): Promise<void> {
  const { error } = await supabase
    .from('fp_ponte_richieste')
    .update({ stato: 'errore', finita_at: new Date().toISOString(), errore: 'Interrotta: il ponte si e\' riavviato a meta\' lavoro. Riprova.' })
    .eq('organization_id', cfg.orgId)
    .eq('stato', 'in_corso')
  if (error) throw new Error(error.message)
}

async function accodaGiornaliera(ora: Date): Promise<void> {
  const { data: stato, error: e1 } = await supabase
    .from('fp_ponte_stato').select('ultimo_giorno_auto').eq('organization_id', cfg.orgId).maybeSingle()
  if (e1) throw new Error(e1.message)
  const { count, error: e2 } = await supabase
    .from('fp_ponte_richieste').select('id', { count: 'exact', head: true })
    .eq('organization_id', cfg.orgId).in('stato', ['in_attesa', 'in_corso'])
  if (e2) throw new Error(e2.message)
  if (!devoAccodareSyncGiornaliera(stato?.ultimo_giorno_auto ?? null, ora, (count ?? 0) > 0)) return

  const { error: e3 } = await supabase
    .from('fp_ponte_stato').update({ ultimo_giorno_auto: giornoRoma(ora) }).eq('organization_id', cfg.orgId)
  if (e3) throw new Error(e3.message)
  const { error: e4 } = await supabase
    .from('fp_ponte_richieste').insert({ organization_id: cfg.orgId, tipo: 'sincronizza', automatica: true })
  // 23505 = nel frattempo qualcuno ha premuto Sincronizza: va bene cosi'.
  if (e4 && e4.code !== '23505') throw new Error(e4.message)
  log('Accodata la sincronizzazione giornaliera')
}

async function eseguiProssima(): Promise<void> {
  const { data: prossima, error } = await supabase
    .from('fp_ponte_richieste').select('id, tipo')
    .eq('organization_id', cfg.orgId).eq('stato', 'in_attesa')
    .order('created_at').limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!prossima) return

  const { data: presa, error: e2 } = await supabase
    .from('fp_ponte_richieste')
    .update({ stato: 'in_corso', iniziata_at: new Date().toISOString() })
    .eq('id', prossima.id).eq('stato', 'in_attesa')
    .select('id').maybeSingle()
  if (e2) throw new Error(e2.message)
  if (!presa) return

  log(`Richiesta ${prossima.id} (${prossima.tipo}) iniziata`)
  try {
    if (prossima.tipo !== 'sincronizza') throw new Error(`Tipo di richiesta sconosciuto: ${prossima.tipo}`)
    const esito = await conTempoMassimo(
      sincronizza(db, supabase, cfg.orgId), SYNC_MAX_MS,
      'Sincronizzazione bloccata da oltre 20 minuti: interrotta. Riprova.',
    )
    const fine = new Date().toISOString()
    chiusuraInSospeso = { id: prossima.id, valori: { stato: 'completata', finita_at: fine, esito }, ultimaSync: { ultima_sync_at: fine, ultima_sync_esito: esito } }
    log(`Richiesta ${prossima.id} completata`)
  } catch (e) {
    log(`Richiesta ${prossima.id} fallita: ${messaggio(e)}`)
    chiusuraInSospeso = { id: prossima.id, valori: { stato: 'errore', finita_at: new Date().toISOString(), errore: messaggio(e) } }
  }
  await chiudiInSospeso()
}

/**
 * Chiusura della richiesta (completata/errore). Se la rete e' caduta proprio ora,
 * resta in sospeso e si riprova a ogni giro: una richiesta lasciata "in corso"
 * bloccherebbe tutte le sincronizzazioni.
 */
let chiusuraInSospeso: { id: string; valori: Record<string, unknown>; ultimaSync?: Record<string, unknown> } | null = null

async function chiudiInSospeso(): Promise<void> {
  if (!chiusuraInSospeso) return
  const { id, valori, ultimaSync } = chiusuraInSospeso
  const { error } = await supabase.from('fp_ponte_richieste').update(valori).eq('id', id)
  if (error) throw new Error(`Chiusura richiesta ${id} non riuscita, riprovo: ${error.message}`)
  if (ultimaSync) {
    const { error: e2 } = await supabase.from('fp_ponte_stato').update(ultimaSync).eq('organization_id', cfg.orgId)
    if (e2) throw new Error(`Stato ultima sincronizzazione non salvato, riprovo: ${e2.message}`)
  }
  chiusuraInSospeso = null
}

/** Richieste "in corso" da piu' di 30 minuti: il ponte non ci sta lavorando, si chiudono. */
async function sbloccaRichieste(ora: Date): Promise<void> {
  const { data, error } = await supabase
    .from('fp_ponte_richieste').select('id, iniziata_at')
    .eq('organization_id', cfg.orgId).eq('stato', 'in_corso')
  if (error) throw new Error(error.message)
  for (const r of data ?? []) {
    if (!richiestaBloccata(r.iniziata_at, ora)) continue
    const { error: e2 } = await supabase.from('fp_ponte_richieste')
      .update({ stato: 'errore', finita_at: ora.toISOString(), errore: 'Rimasta bloccata in corso: chiusa automaticamente. Riprova.' })
      .eq('id', r.id).eq('stato', 'in_corso')
    if (e2) throw new Error(e2.message)
    log(`Richiesta ${r.id} bloccata: chiusa`)
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--una-volta')) {
    const esito = await sincronizza(db, supabase, cfg.orgId)
    console.log(JSON.stringify(esito, null, 2))
    await db.end()
    return
  }

  log(`Ponte avviato (versione ${VERSIONE})`)
  await chiudiInterrotte()
  // Il segnale di vita gira per conto suo: una sync lunga non deve far
  // sembrare il PC spento.
  const battito = () => segnale().catch(e => log(`Segnale non inviato: ${messaggio(e)}`))
  await battito()
  setInterval(battito, GIRO_MS)

  for (;;) {
    try {
      await chiudiInSospeso()
      await sbloccaRichieste(new Date())
      await accodaGiornaliera(new Date())
      await eseguiProssima()
    } catch (e) {
      log(`Errore nel giro: ${messaggio(e)}`)
    }
    await new Promise(r => setTimeout(r, GIRO_MS))
  }
}

main().catch(e => {
  log(`Ponte fermato: ${messaggio(e)}`)
  process.exit(1)
})
