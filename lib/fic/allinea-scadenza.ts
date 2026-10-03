import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { creaClientFic, FicErrore, FicNonAutorizzato, type FicClient } from '@/lib/fic/client'
import { mappaDocumento } from '@/lib/fic/mappa'
import { salvaDocumenti } from '@/lib/fic/salvataggio'
import { tabelleSupabase } from '@/lib/fic/tabelle-supabase'
import {
  applicaPagamento, annullaPagamento, giaAnnullato, intenzioneDa, ritrovaScrittura,
  type IntenzioneFic, type ScritturaFic,
} from '@/lib/fic/pagamenti-fic'
import { decidiAzione, avvisoImporti, ESITO_VUOTO, type Desiderato } from '@/lib/fic/allineamento'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { formatEuro } from '@/lib/pricing'
import type { DocumentoFic } from '@/lib/fic/tipi'
import type { EsitoFic, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'

/*
 * Unico punto in cui WinStudio scrive o toglie pagamenti su FiC. Tutte le azioni
 * sulle scadenze passano da qui (vedi actions/scadenze.ts e actions/fic-pagamenti.ts).
 * Non e' un file 'use server': non deve diventare un endpoint chiamabile dal browser.
 *
 * Un PUT su FiC non si puo' ripetere alla cieca: ripeterlo pagherebbe due volte.
 * Per questo, per ogni collegamento:
 * 1. lo si "prende" (stato in_corso) perche' due clic o due utenti non lavorino insieme;
 * 2. prima di scrivere si salva l'intenzione; subito dopo il PUT la scrittura;
 * 3. se un tentativo precedente ha lasciato un'intenzione, si rilegge FiC e si
 *    riconosce la scrittura gia' avvenuta invece di rifarla;
 * 4. la copia locale si aggiorna per ultima e senza bloccare: la sincronizzazione
 *    la sistemerebbe comunque.
 */

type Riga = {
  id: string
  fic_documento_id: number
  tipo_documento: TipoFatturaFornitore
  importo: number
  stato_fic: StatoFic
  scrittura_fic: ScritturaFic | null
  intenzione_fic: IntenzioneFic | null
}

const TIPO_FIC = { fattura: 'expense', nota_credito: 'passive_credit_note' } as const
/** Un collegamento "in corso" da piu' di cosi' e' rimasto appeso (funzione interrotta). */
const PRESA_SCADUTA_MS = 2 * 60_000
const COLONNE_RIGA = 'id, fic_documento_id, tipo_documento, importo, stato_fic, scrittura_fic, intenzione_fic'

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

function aRiga(x: Record<string, unknown>): Riga {
  return {
    ...(x as Riga),
    fic_documento_id: Number(x.fic_documento_id),
    importo: Number(x.importo),
  }
}

async function aggiorna(svc: SupabaseClient, id: string, campi: Record<string, unknown>) {
  const { error } = await svc.from('scadenze_fatture').update({ ...campi, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Prende il collegamento: riesce solo se nessun'altra operazione lo sta usando. */
async function prendi(svc: SupabaseClient, id: string): Promise<boolean> {
  const scaduta = new Date(Date.now() - PRESA_SCADUTA_MS).toISOString()
  const { data, error } = await svc
    .from('scadenze_fatture')
    .update({ stato_fic: 'in_corso', updated_at: new Date().toISOString() })
    .eq('id', id)
    .or(`stato_fic.neq.in_corso,updated_at.lt.${scaduta}`)
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

/** La pagina Fatture fornitori vede subito il pagamento. Mai bloccante: lo sistema la sincronizzazione. */
async function aggiornaCopiaLocale(svc: SupabaseClient, orgId: string, doc: DocumentoFic, tipo: TipoFatturaFornitore) {
  try {
    await salvaDocumenti(tabelleSupabase(svc), orgId, [mappaDocumento(doc, TIPO_FIC[tipo], new Date().toISOString())])
  } catch {
    // la copia locale e' solo una comodita': FiC e la scrittura registrata sono gia' a posto
  }
}

type Contesto = {
  svc: SupabaseClient
  orgId: string
  ottieniClient: () => Promise<{ client: FicClient; companyId: number }>
}

/**
 * Porta un collegamento allo stato desiderato. Restituisce cosa e' successo;
 * gli errori diventano lo stato del collegamento e un messaggio.
 */
async function trattaCollegamento(
  ctx: Contesto, r: Riga, d: Desiderato,
): Promise<{ scritto: boolean; annullato: boolean; problema: string | null }> {
  const { svc, orgId } = ctx
  const nulla = { scritto: false, annullato: false, problema: null }
  let azione = decidiAzione(r, d)

  if (azione === 'niente' && !r.intenzione_fic) {
    // FiC e' gia' come deve essere: si ripuliscono solo stati rimasti indietro
    // (un "da allineare" superato, una presa rimasta appesa). "Da verificare" resta:
    // li' serve una persona.
    const atteso: StatoFic = r.scrittura_fic ? 'scritto' : 'non_scritto'
    if (r.stato_fic === 'da_allineare' || r.stato_fic === 'in_corso') {
      await aggiorna(svc, r.id, { stato_fic: atteso, messaggio_fic: null })
    } else if (!d.pagare && !r.scrittura_fic && r.stato_fic !== 'non_scritto' && r.stato_fic !== 'da_verificare') {
      await aggiorna(svc, r.id, { stato_fic: 'non_scritto', messaggio_fic: null })
    }
    return nulla
  }

  if (!(await prendi(svc, r.id))) {
    return { ...nulla, problema: 'Un\'altra operazione su FiC e\' in corso per questo documento: riprova fra poco' }
  }

  let scritto = false
  let annullato = false
  try {
    if ((azione === 'scrivi' || azione === 'riscrivi') && d.metodoId === null) {
      throw new Problema('da_allineare', 'Scegli il metodo di pagamento nella finestra Fatture')
    }
    const { client, companyId } = await ctx.ottieniClient()

    // Un tentativo precedente si e' interrotto dopo aver deciso di scrivere:
    // prima di tutto si guarda se FiC ha gia' il pagamento.
    if (r.intenzione_fic) {
      const doc = await client.spesa(companyId, r.fic_documento_id)
      const ritrovata = ritrovaScrittura(doc.payments_list ?? [], r.intenzione_fic)
      if (ritrovata) r.scrittura_fic = ritrovata
      r.intenzione_fic = null
      await aggiorna(svc, r.id, { scrittura_fic: r.scrittura_fic, intenzione_fic: null })
      azione = decidiAzione(r, d)
    }

    if (azione === 'annulla' || azione === 'riscrivi') {
      const doc = await client.spesa(companyId, r.fic_documento_id)
      const rate = doc.payments_list ?? []
      let dopo: DocumentoFic = doc
      if (!giaAnnullato(rate, r.scrittura_fic!)) {
        const a = annullaPagamento(rate, r.scrittura_fic!)
        if (!a.ok) throw new Problema('da_verificare', a.motivo)
        dopo = await client.aggiornaRate(companyId, r.fic_documento_id, a.rate)
      }
      // Subito dopo il PUT: da qui in poi WinStudio sa che su FiC non c'e' piu' niente di suo.
      r.scrittura_fic = null
      await aggiorna(svc, r.id, { scrittura_fic: null, scritto_at: null })
      annullato = azione === 'annulla'
      await aggiornaCopiaLocale(svc, orgId, dopo, r.tipo_documento)
    }

    if (azione === 'scrivi' || azione === 'riscrivi') {
      const doc = await client.spesa(companyId, r.fic_documento_id)
      const prima = doc.payments_list ?? []
      const e = applicaPagamento(prima, r.importo, d.data, d.metodoId!)
      if (!e.ok) {
        throw new Problema('da_verificare', `Su FiC restano ${formatEuro(e.disponibile)} €, servono ${formatEuro(r.importo)} €`)
      }
      const intenzione = intenzioneDa(prima, e, d.data, d.metodoId!)
      // Prima del PUT: se la risposta si perde, il prossimo tentativo sapra' cosa cercare.
      await aggiorna(svc, r.id, { intenzione_fic: intenzione })
      await client.aggiornaRate(companyId, r.fic_documento_id, e.rate)
      // Si rilegge invece di fidarsi della risposta del PUT (forma non garantita).
      const riletto = await client.spesa(companyId, r.fic_documento_id)
      const scrittura = ritrovaScrittura(riletto.payments_list ?? [], intenzione)
      if (!scrittura) {
        throw new Problema('da_verificare', 'FiC ha accettato il pagamento ma le rate non risultano come previsto: controlla la fattura')
      }
      r.scrittura_fic = scrittura
      await aggiorna(svc, r.id, { scrittura_fic: scrittura, intenzione_fic: null, scritto_at: new Date().toISOString() })
      scritto = true
      await aggiornaCopiaLocale(svc, orgId, riletto, r.tipo_documento)
    }

    await aggiorna(svc, r.id, { stato_fic: r.scrittura_fic ? 'scritto' : 'non_scritto', messaggio_fic: null })
    return { scritto, annullato, problema: null }
  } catch (e) {
    const p = classifica(e)
    if (e instanceof FicNonAutorizzato) {
      await svc.from('fic_collegamenti').update({ stato: 'da_ricollegare' }).eq('organization_id', orgId)
    }
    // Rilascia la presa con lo stato del problema. intenzione_fic resta se c'era:
    // il prossimo tentativo verifichera' su FiC prima di rifare il PUT.
    await aggiorna(svc, r.id, { stato_fic: p.stato, messaggio_fic: p.message })
    return { scritto, annullato, problema: p.message }
  }
}

function creaContesto(svc: SupabaseClient, orgId: string): Contesto {
  let pronto: { client: FicClient; companyId: number } | null = null
  return {
    svc,
    orgId,
    async ottieniClient() {
      if (pronto) return pronto
      const { data: coll } = await svc
        .from('fic_collegamenti')
        .select('fic_company_id, stato')
        .eq('organization_id', orgId)
        .maybeSingle()
      if (!coll) throw new Problema('da_allineare', 'Fatture in Cloud non e\' collegato')
      if (coll.stato !== 'attivo') throw new Problema('da_allineare', 'Collegamento FiC da rinnovare in Impostazioni')
      const { data: token, error } = await svc.rpc('fic_leggi_token', { p_org: orgId })
      if (error || !token) throw new Problema('da_allineare', 'Token FiC non disponibile')
      pronto = { client: creaClientFic(token as string), companyId: Number(coll.fic_company_id) }
      return pronto
    },
  }
}

async function leggiDesiderato(
  svc: SupabaseClient, orgId: string, scadenzaId: string, forzaNonPagata: boolean,
): Promise<{ desiderato: Desiderato; importo: number } | null> {
  const { data: sc, error } = await svc
    .from('scadenze')
    .select('importo, pagato, annullata, data_scadenza, fic_metodo_id')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!sc) return null
  return {
    importo: Number(sc.importo),
    desiderato: {
      pagare: !forzaNonPagata && sc.pagato && !sc.annullata,
      data: (sc.data_scadenza as string | null) ?? oggiRoma(),
      metodoId: sc.fic_metodo_id === null ? null : Number(sc.fic_metodo_id),
    },
  }
}

export async function allineaScadenzaFic(
  svc: SupabaseClient,
  orgId: string,
  scadenzaId: string,
  opz: { forzaNonPagata?: boolean } = {},
): Promise<EsitoFic> {
  const esito: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  const ctx = creaContesto(svc, orgId)

  // Due passate al massimo: se durante la prima la scadenza e' cambiata (un
  // secondo clic su "pagato"), la seconda porta FiC allo stato nuovo.
  let precedente: string | null = null
  for (let passata = 0; passata < 2; passata++) {
    const stato = await leggiDesiderato(svc, orgId, scadenzaId, opz.forzaNonPagata ?? false)
    if (!stato) return esito
    const chiave = JSON.stringify(stato.desiderato)
    if (chiave === precedente) break
    precedente = chiave

    const { data: righe, error } = await svc
      .from('scadenze_fatture')
      .select(COLONNE_RIGA)
      .eq('scadenza_id', scadenzaId)
      .eq('organization_id', orgId)
    if (error) throw new Error(error.message)
    const collegamenti = (righe ?? []).map((x) => aRiga(x as Record<string, unknown>))
    if (collegamenti.length === 0) return esito

    if (passata === 0) {
      const avviso = avvisoImporti(stato.importo, collegamenti)
      if (avviso && !opz.forzaNonPagata) esito.avvisi.push(avviso)
    }

    for (const r of collegamenti) {
      const e = await trattaCollegamento(ctx, r, stato.desiderato)
      if (e.scritto) esito.scritti++
      if (e.annullato) esito.annullati++
      if (e.problema) esito.problemi.push(e.problema)
    }
  }
  return esito
}

/** Per le azioni delle scadenze: niente lavoro (e niente query FiC) se la scadenza non e' collegata. */
export async function allineaSeCollegata(orgId: string, scadenzaId: string): Promise<EsitoFic | null> {
  const svc = createServiceClient()
  const { count, error } = await svc
    .from('scadenze_fatture')
    .select('id', { count: 'exact', head: true })
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  if (!count) return null
  return allineaScadenzaFic(svc, orgId, scadenzaId)
}

/**
 * Prima di eliminare una scadenza: toglie da FiC tutto cio' che WinStudio ha
 * scritto e cancella i collegamenti. La scadenza non viene toccata. Se un
 * annullamento non riesce si ferma: dopo non resterebbe traccia di cosa togliere.
 */
export async function liberaPerEliminazione(
  orgId: string, scadenzaId: string,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const svc = createServiceClient()
  const { data: righe, error: errRighe } = await svc
    .from('scadenze_fatture')
    .select('id, scrittura_fic, intenzione_fic')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (errRighe) return { ok: false, errore: errRighe.message }
  if (!righe?.length) return { ok: true }
  if (righe.some((r) => r.scrittura_fic || r.intenzione_fic)) {
    const esito = await allineaScadenzaFic(svc, orgId, scadenzaId, { forzaNonPagata: true })
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
  const { data: x, error } = await svc
    .from('scadenze_fatture')
    .select(COLONNE_RIGA)
    .eq('scadenza_id', scadenzaId)
    .eq('fic_documento_id', ficDocumentoId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) return error.message
  if (!x) return null
  const r = aRiga(x as Record<string, unknown>)
  if (!r.scrittura_fic && !r.intenzione_fic) return null
  const e = await trattaCollegamento(creaContesto(svc, orgId), r, { pagare: false, data: oggiRoma(), metodoId: null })
  return e.problema
}
