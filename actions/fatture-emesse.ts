'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { creaClientFic } from '@/lib/fic/client'
import { erroreAnticipo } from '@/lib/fic/validazione'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { leggiToken, messaggioErrore } from '@/lib/fic/servizio'
import { dalEmesse, eseguiGiro } from '@/lib/fic/giro-sincronizzazione'
import { abbinaMetodiIncasso } from '@/lib/fic/incassi'
import { CONTEGGI_VUOTI, type EsitoSincronizzazione, type MetodoFic } from '@/types/fatture-fornitori'
import type { FatturaEmessa, MetodiIncassoFic, SyncEmesse } from '@/types/fatture-emesse'

/*
 * Scheda "Clienti" della pagina Fatture: copia locale delle fatture emesse su FiC.
 * Stesso motore e stesse regole della scheda Fornitori, ma sincronizzazione
 * separata (colonne emesse_* di fic_collegamenti).
 */

export type RisultatoEmesse = { ok: true } | { ok: false; errore: string }

export async function getSyncEmesse(): Promise<SyncEmesse | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fic_collegamenti')
    .select('sincronizza_dal, emesse_sincronizza_dal, emesse_sync_automatica, emesse_sync_in_corso_da, emesse_ultima_sync_at, emesse_ultimo_esito, emesse_ultimo_esito_at, emesse_ultimo_messaggio, emesse_ultimi_conteggi')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    sincronizza_dal: dalEmesse(data),
    sync_automatica: data.emesse_sync_automatica,
    sync_in_corso_da: data.emesse_sync_in_corso_da,
    ultima_sync_at: data.emesse_ultima_sync_at,
    ultimo_esito: data.emesse_ultimo_esito,
    ultimo_esito_at: data.emesse_ultimo_esito_at,
    ultimo_messaggio: data.emesse_ultimo_messaggio,
    ultimi_conteggi: data.emesse_ultimi_conteggi,
  }
}

export async function sincronizzaFattureEmesse(): Promise<EsitoSincronizzazione> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori !== 'scrittura') {
    return { esito: 'errore', messaggio: 'Non autorizzato a sincronizzare', conteggi: CONTEGGI_VUOTI }
  }
  const esito = await eseguiGiro(createServiceClient(), await getOrgId(), 'emesse')
  revalidatePath('/fatture-fornitori')
  return esito
}

/** Come per i fornitori: la data si puo' solo anticipare, mai posticipare. */
export async function anticipaSincronizzaDalEmesse(data: string): Promise<RisultatoEmesse> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori !== 'scrittura') return { ok: false, errore: 'Non autorizzato a sincronizzare' }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll, error: errColl } = await svc
    .from('fic_collegamenti').select('sincronizza_dal, emesse_sincronizza_dal').eq('organization_id', orgId).maybeSingle()
  if (errColl) return { ok: false, errore: errColl.message }
  if (!coll) return { ok: false, errore: "Fatture in Cloud non e' collegato" }

  const errore = erroreAnticipo(data, dalEmesse(coll), oggiRoma())
  if (errore) return { ok: false, errore }

  const [a, m, g] = data.split('-')
  const { error } = await svc
    .from('fic_collegamenti')
    .update({
      emesse_sincronizza_dal: data,
      emesse_ultimo_esito: 'parziale',
      emesse_ultimo_esito_at: new Date().toISOString(),
      emesse_ultimo_messaggio: `Data anticipata al ${g}/${m}/${a}: premi Sincronizza per scaricare le fatture precedenti`,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/fatture-fornitori')
  return { ok: true }
}

// ── Elenco ──────────────────────────────────────────────────────────────────

const COLONNE =
  'id, fic_id, tipo, numero, data, cliente_fic_id, cliente_nome, cliente_piva, importo_netto, importo_iva, ritenuta, importo_lordo, prossima_scadenza, elettronica, sincronizzata_at, rate:fatture_emesse_rate(id, fattura_id, fic_id, importo, scadenza, stato, pagata_il, conto_fic_id, conto_nome, ordine)'

export type FatturaEmessaElenco = FatturaEmessa & {
  commesse: { commessa_id: string; numero_commessa: string; quota: number }[]
}

export async function getFattureEmesse(anno: number): Promise<FatturaEmessaElenco[]> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const [righe, collegamenti] = await Promise.all([
    selectAll<FatturaEmessa>((da, a) =>
      supabase
        .from('fatture_emesse')
        .select(COLONNE)
        .eq('organization_id', orgId)
        .gte('data', `${anno}-01-01`)
        .lte('data', `${anno}-12-31`)
        .order('data', { ascending: false })
        .order('id')
        .range(da, a),
    ),
    selectAll<{ commessa_id: string; fic_documento_id: number | string; quota: number | string; commesse: unknown }>((da, a) =>
      supabase
        .from('commesse_fatture')
        .select('commessa_id, fic_documento_id, quota, commesse(numero_commessa)')
        .eq('organization_id', orgId)
        .order('id')
        .range(da, a),
    ),
  ])
  const perDocumento = new Map<number, FatturaEmessaElenco['commesse']>()
  for (const c of collegamenti) {
    const rel = (Array.isArray(c.commesse) ? c.commesse[0] : c.commesse) as { numero_commessa?: string } | null
    const id = Number(c.fic_documento_id)
    const lista = perDocumento.get(id) ?? []
    lista.push({ commessa_id: c.commessa_id, numero_commessa: rel?.numero_commessa ?? '?', quota: Number(c.quota) })
    perDocumento.set(id, lista)
  }
  return righe.map((f) => ({
    ...f,
    fic_id: Number(f.fic_id),
    cliente_fic_id: f.cliente_fic_id === null ? null : Number(f.cliente_fic_id),
    importo_netto: Number(f.importo_netto),
    importo_iva: Number(f.importo_iva),
    ritenuta: Number(f.ritenuta),
    importo_lordo: Number(f.importo_lordo),
    rate: [...(f.rate ?? [])].map((r) => ({ ...r, importo: Number(r.importo) })).sort((x, y) => x.ordine - y.ordine),
    commesse: perDocumento.get(Number(f.fic_id)) ?? [],
  }))
}

export async function getAnniFattureEmesse(): Promise<number[]> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const righe = await selectAll<{ data: string }>((da, a) =>
    supabase.from('fatture_emesse').select('data').eq('organization_id', orgId).order('id').range(da, a),
  )
  const anni = new Set(righe.map((r) => Number(r.data.slice(0, 4))))
  anni.add(new Date().getFullYear())
  return [...anni].sort((a, b) => b - a)
}

/** Il link di FiC al PDF si chiede al momento del clic, non si archivia. */
export async function getUrlPdfFatturaEmessa(ficId: number): Promise<{ url: string | null; errore?: string }> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno' && permessi.commesse === 'nessuno') return { url: null, errore: 'Non autorizzato' }
  const supabase = await createClient()
  const { data: fattura, error } = await supabase.from('fatture_emesse').select('fic_id').eq('fic_id', ficId).maybeSingle()
  if (error) return { url: null, errore: error.message }
  if (!fattura) return { url: null, errore: 'Fattura non trovata' }

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll } = await svc.from('fic_collegamenti').select('fic_company_id').eq('organization_id', orgId).maybeSingle()
  if (!coll) return { url: null, errore: 'Fatture in Cloud non è collegato' }
  try {
    const token = await leggiToken(svc, orgId)
    const doc = await creaClientFic(token).emesso(Number(coll.fic_company_id), ficId)
    const url = typeof doc.url === 'string' ? doc.url : null
    return url ? { url } : { url: null, errore: 'PDF non disponibile su Fatture in Cloud' }
  } catch (e) {
    return { url: null, errore: messaggioErrore(e) }
  }
}

// ── Metodi d'incasso ────────────────────────────────────────────────────────

export type DatiMetodiIncasso = {
  metodiFic: MetodoFic[]
  abbinamento: MetodiIncassoFic
  /** false se l'abbinamento mostrato e' solo la proposta per nome, non ancora salvata. */
  salvato: boolean
}

export async function getMetodiIncasso(): Promise<DatiMetodiIncasso | { errore: string }> {
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll } = await svc
    .from('fic_collegamenti').select('fic_company_id, metodi_incasso').eq('organization_id', orgId).maybeSingle()
  if (!coll) return { errore: 'Fatture in Cloud non è collegato' }
  try {
    const token = await leggiToken(svc, orgId)
    const metodiFic = await creaClientFic(token).metodiPagamento(Number(coll.fic_company_id))
    const salvato = coll.metodi_incasso as MetodiIncassoFic | null
    return { metodiFic, abbinamento: salvato ?? abbinaMetodiIncasso(metodiFic), salvato: salvato !== null }
  } catch (e) {
    return { errore: messaggioErrore(e) }
  }
}

export async function salvaMetodiIncasso(abbinamento: MetodiIncassoFic): Promise<RisultatoEmesse> {
  const { permessi } = await getMyPermissions()
  if (permessi.impostazioni !== 'scrittura') return { ok: false, errore: 'Non autorizzato a modificare le impostazioni' }
  const pulito: MetodiIncassoFic = {
    bonifico: Number(abbinamento.bonifico) || null,
    contanti: Number(abbinamento.contanti) || null,
    riba: Number(abbinamento.riba) || null,
    altro: Number(abbinamento.altro) || null,
  }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { error } = await svc
    .from('fic_collegamenti')
    .update({ metodi_incasso: pulito, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/impostazioni')
  return { ok: true }
}
