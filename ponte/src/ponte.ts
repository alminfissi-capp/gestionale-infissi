// Ponte FP PRO <-> WinStudio. Avvio:
//   node --env-file=<.env> ponte/src/ponte.ts             (servizio: segnale + coda)
//   node --env-file=<.env> ponte/src/ponte.ts --una-volta (una sincronizzazione e basta)
import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'
import { devoAccodareSyncGiornaliera, giornoRoma } from '../../lib/fppro/ponte-regole.ts'
import { leggiConfig } from './config.ts'
import { impostaLog, log } from './log.ts'
import { sincronizza } from './sincronizza.ts'

const VERSIONE = '1.0.0'
const GIRO_MS = 30_000

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
    const esito = await sincronizza(db, supabase, cfg.orgId)
    const fine = new Date().toISOString()
    await supabase.from('fp_ponte_richieste')
      .update({ stato: 'completata', finita_at: fine, esito }).eq('id', prossima.id)
    await supabase.from('fp_ponte_stato')
      .update({ ultima_sync_at: fine, ultima_sync_esito: esito }).eq('organization_id', cfg.orgId)
    log(`Richiesta ${prossima.id} completata`)
  } catch (e) {
    log(`Richiesta ${prossima.id} fallita: ${messaggio(e)}`)
    await supabase.from('fp_ponte_richieste')
      .update({ stato: 'errore', finita_at: new Date().toISOString(), errore: messaggio(e) })
      .eq('id', prossima.id)
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
