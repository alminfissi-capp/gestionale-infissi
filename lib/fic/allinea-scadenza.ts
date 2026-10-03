import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { creaClientFic, FicErrore, FicNonAutorizzato, type FicClient } from '@/lib/fic/client'
import { mappaDocumento } from '@/lib/fic/mappa'
import { salvaDocumenti } from '@/lib/fic/salvataggio'
import { tabelleSupabase } from '@/lib/fic/tabelle-supabase'
import { applicaPagamento, annullaPagamento, costruisciScrittura, type ScritturaFic } from '@/lib/fic/pagamenti-fic'
import { decidiAzione, avvisoImporti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { formatEuro } from '@/lib/pricing'
import type { DocumentoFic } from '@/lib/fic/tipi'
import type { EsitoFic, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'

/*
 * Unico punto in cui WinStudio scrive o toglie pagamenti su FiC. Tutte le azioni
 * sulle scadenze passano da qui (vedi actions/scadenze.ts e actions/fic-pagamenti.ts).
 * Non e' un file 'use server': non deve diventare un endpoint chiamabile dal browser.
 */

type Riga = {
  id: string
  fic_documento_id: number
  tipo_documento: TipoFatturaFornitore
  importo: number
  stato_fic: StatoFic
  scrittura_fic: ScritturaFic | null
}

const TIPO_FIC = { fattura: 'expense', nota_credito: 'passive_credit_note' } as const

class Problema extends Error {
  constructor(readonly stato: 'da_allineare' | 'da_verificare', messaggio: string) {
    super(messaggio)
  }
}

function classifica(e: unknown): Problema {
  if (e instanceof Problema) return e
  if (e instanceof FicNonAutorizzato) return new Problema('da_allineare', 'Token FiC rifiutato: ricollega in Impostazioni')
  if (e instanceof FicErrore && e.status === 404) return new Problema('da_verificare', 'Documento non piu\' presente su FiC')
  if (e instanceof FicErrore) return new Problema('da_allineare', e.message)
  return new Problema('da_allineare', 'FiC non ha risposto: riprova')
}

async function aggiorna(svc: SupabaseClient, id: string, campi: Record<string, unknown>) {
  const { error } = await svc.from('scadenze_fatture').update({ ...campi, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** La pagina Fatture fornitori vede subito il pagamento, senza aspettare la sincronizzazione. */
async function aggiornaCopiaLocale(svc: SupabaseClient, orgId: string, doc: DocumentoFic, tipo: TipoFatturaFornitore) {
  await salvaDocumenti(tabelleSupabase(svc), orgId, [mappaDocumento(doc, TIPO_FIC[tipo], new Date().toISOString())])
}

async function annulla(client: FicClient, companyId: number, r: Riga): Promise<DocumentoFic> {
  const doc = await client.spesa(companyId, r.fic_documento_id)
  const a = annullaPagamento(doc.payments_list ?? [], r.scrittura_fic!)
  if (!a.ok) throw new Problema('da_verificare', a.motivo)
  return client.aggiornaRate(companyId, r.fic_documento_id, a.rate)
}

async function scrivi(
  client: FicClient, companyId: number, r: Riga, data: string, metodoId: number,
): Promise<{ doc: DocumentoFic; scrittura: ScritturaFic }> {
  const doc = await client.spesa(companyId, r.fic_documento_id)
  const prima = doc.payments_list ?? []
  const e = applicaPagamento(prima, r.importo, data, metodoId)
  if (!e.ok) {
    throw new Problema('da_verificare', `Su FiC restano ${formatEuro(e.disponibile)} €, servono ${formatEuro(r.importo)} €`)
  }
  const dopo = await client.aggiornaRate(companyId, r.fic_documento_id, e.rate)
  return { doc: dopo, scrittura: costruisciScrittura(prima, e, dopo.payments_list ?? [], data, metodoId) }
}

export async function allineaScadenzaFic(svc: SupabaseClient, orgId: string, scadenzaId: string): Promise<EsitoFic> {
  const esito: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }

  const { data: sc, error: errSc } = await svc
    .from('scadenze')
    .select('importo, pagato, annullata, data_scadenza, fic_metodo_id')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errSc) throw new Error(errSc.message)
  if (!sc) return esito

  const { data: righe, error: errRighe } = await svc
    .from('scadenze_fatture')
    .select('id, fic_documento_id, tipo_documento, importo, stato_fic, scrittura_fic')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (errRighe) throw new Error(errRighe.message)
  const collegamenti: Riga[] = (righe ?? []).map((x) => ({
    ...(x as Riga), fic_documento_id: Number(x.fic_documento_id), importo: Number(x.importo),
  }))
  if (collegamenti.length === 0) return esito

  const avviso = avvisoImporti(Number(sc.importo), collegamenti)
  if (avviso) esito.avvisi.push(avviso)

  const desiderato = {
    pagare: sc.pagato && !sc.annullata,
    data: (sc.data_scadenza as string | null) ?? oggiRoma(),
    metodoId: sc.fic_metodo_id === null ? null : Number(sc.fic_metodo_id),
  }

  const { data: coll } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, stato')
    .eq('organization_id', orgId)
    .maybeSingle()

  let client: FicClient | null = null
  const ottieniClient = async (): Promise<FicClient> => {
    if (client) return client
    if (!coll) throw new Problema('da_allineare', 'Fatture in Cloud non e\' collegato')
    if (coll.stato !== 'attivo') throw new Problema('da_allineare', 'Collegamento FiC da rinnovare in Impostazioni')
    const { data: token, error } = await svc.rpc('fic_leggi_token', { p_org: orgId })
    if (error || !token) throw new Problema('da_allineare', 'Token FiC non disponibile')
    client = creaClientFic(token as string)
    return client
  }

  for (const r of collegamenti) {
    const azione = decidiAzione(r, desiderato)
    if (azione === 'niente') {
      // Mai scritto e non da pagare: il collegamento torna "pronto", senza vecchi errori.
      if (!desiderato.pagare && !r.scrittura_fic && r.stato_fic !== 'non_scritto') {
        await aggiorna(svc, r.id, { stato_fic: 'non_scritto', messaggio_fic: null })
      }
      continue
    }
    try {
      if ((azione === 'scrivi' || azione === 'riscrivi') && desiderato.metodoId === null) {
        throw new Problema('da_allineare', 'Scegli il metodo di pagamento nella finestra Fatture')
      }
      const c = await ottieniClient()
      const companyId = Number(coll!.fic_company_id)

      if (azione === 'annulla' || azione === 'riscrivi') {
        const doc = await annulla(c, companyId, r)
        await aggiornaCopiaLocale(svc, orgId, doc, r.tipo_documento)
        await aggiorna(svc, r.id, { stato_fic: 'non_scritto', messaggio_fic: null, scrittura_fic: null, scritto_at: null })
        r.scrittura_fic = null
        if (azione === 'annulla') esito.annullati++
      }
      if (azione === 'scrivi' || azione === 'riscrivi') {
        const { doc, scrittura } = await scrivi(c, companyId, r, desiderato.data, desiderato.metodoId!)
        await aggiornaCopiaLocale(svc, orgId, doc, r.tipo_documento)
        await aggiorna(svc, r.id, {
          stato_fic: 'scritto', messaggio_fic: null, scrittura_fic: scrittura, scritto_at: new Date().toISOString(),
        })
        esito.scritti++
      }
    } catch (e) {
      const p = classifica(e)
      if (e instanceof FicNonAutorizzato) {
        await svc.from('fic_collegamenti').update({ stato: 'da_ricollegare' }).eq('organization_id', orgId)
      }
      await aggiorna(svc, r.id, { stato_fic: p.stato, messaggio_fic: p.message })
      esito.problemi.push(p.message)
    }
  }
  return esito
}

/** Per le azioni delle scadenze: niente lavoro (e niente query FiC) se la scadenza non e' collegata. */
export async function allineaSeCollegata(orgId: string, scadenzaId: string): Promise<EsitoFic | null> {
  const svc = createServiceClient()
  const { count } = await svc
    .from('scadenze_fatture')
    .select('id', { count: 'exact', head: true })
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (!count) return null
  return allineaScadenzaFic(svc, orgId, scadenzaId)
}

/**
 * Prima di eliminare una scadenza: toglie da FiC tutto cio' che WinStudio ha
 * scritto e cancella i collegamenti. Se un annullamento non riesce si ferma:
 * dopo non resterebbe traccia di cosa togliere.
 */
export async function liberaPerEliminazione(
  orgId: string, scadenzaId: string,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const svc = createServiceClient()
  const { data: righe } = await svc
    .from('scadenze_fatture')
    .select('id, scrittura_fic')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (!righe?.length) return { ok: true }
  if (righe.some((r) => r.scrittura_fic)) {
    // Trattare la scadenza come "non piu' da pagare" porta ad annullare tutto.
    const { error } = await svc.from('scadenze').update({ pagato: false }).eq('id', scadenzaId).eq('organization_id', orgId)
    if (error) return { ok: false, errore: error.message }
    const esito = await allineaScadenzaFic(svc, orgId, scadenzaId)
    if (esito.problemi.length) {
      return { ok: false, errore: `Prima va tolto il pagamento da Fatture in Cloud: ${esito.problemi.join(' · ')}` }
    }
  }
  const { error } = await svc.from('scadenze_fatture').delete().eq('scadenza_id', scadenzaId).eq('organization_id', orgId)
  return error ? { ok: false, errore: error.message } : { ok: true }
}

/** Toglie da FiC il pagamento di un solo collegamento (scollegamento da una scadenza pagata). Null se riuscito. */
export async function annullaSingolo(
  svc: SupabaseClient, orgId: string, scadenzaId: string, ficDocumentoId: number,
): Promise<string | null> {
  const { data: x } = await svc.from('scadenze_fatture')
    .select('id, fic_documento_id, tipo_documento, importo, stato_fic, scrittura_fic')
    .eq('scadenza_id', scadenzaId).eq('fic_documento_id', ficDocumentoId).eq('organization_id', orgId).maybeSingle()
  if (!x?.scrittura_fic) return null
  const { data: coll } = await svc.from('fic_collegamenti').select('fic_company_id').eq('organization_id', orgId).maybeSingle()
  const { data: token } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (!coll || !token) return 'Fatture in Cloud non e\' collegato'
  const r: Riga = { ...(x as Riga), fic_documento_id: Number(x.fic_documento_id), importo: Number(x.importo) }
  try {
    const doc = await annulla(creaClientFic(token as string), Number(coll.fic_company_id), r)
    await aggiornaCopiaLocale(svc, orgId, doc, r.tipo_documento)
    return null
  } catch (e) {
    return classifica(e).message
  }
}
