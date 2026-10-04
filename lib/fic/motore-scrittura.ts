import type { SupabaseClient } from '@supabase/supabase-js'
import { creaClientFic, FicErrore, FicNonAutorizzato, type FicClient } from '@/lib/fic/client'
import { mappaDocumento, mappaEmesso, type RigaFatturaEmessa } from '@/lib/fic/mappa'
import { salvaDocumenti } from '@/lib/fic/salvataggio'
import { tabelleSupabase, TABELLE_EMESSE } from '@/lib/fic/tabelle-supabase'
import {
  applicaPagamento, annullaPagamento, giaAnnullato, intenzioneDa, ritrovaScrittura,
  type IntenzioneFic, type ScritturaFic,
} from '@/lib/fic/pagamenti-fic'
import { decidiAzione, type Desiderato } from '@/lib/fic/allineamento'
import { formatEuro } from '@/lib/pricing'
import type { DocumentoFic, RataFic } from '@/lib/fic/tipi'
import type { StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'

/*
 * Unico punto in cui WinStudio scrive o toglie pagamenti su FiC, per le fatture
 * dei fornitori (scadenze_fatture) e per quelle emesse (incassi_fatture).
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

/** Cosa cambia fra fatture ricevute ed emesse: tabella dei collegamenti, endpoint FiC, copia locale. */
export type Canale = {
  tabella: 'scadenze_fatture' | 'incassi_fatture'
  leggi: (client: FicClient, companyId: number, id: number) => Promise<DocumentoFic>
  scrivi: (client: FicClient, companyId: number, id: number, rate: RataFic[]) => Promise<DocumentoFic>
  copiaLocale: (svc: SupabaseClient, orgId: string, doc: DocumentoFic, tipo: TipoFatturaFornitore) => Promise<void>
  /** Messaggio quando manca il metodo di pagamento. */
  senzaMetodo: string
}

const TIPO_RICEVUTO = { fattura: 'expense', nota_credito: 'passive_credit_note' } as const
const TIPO_EMESSO = { fattura: 'invoice', nota_credito: 'credit_note' } as const

export const CANALE_SCADENZE: Canale = {
  tabella: 'scadenze_fatture',
  leggi: (c, companyId, id) => c.spesa(companyId, id),
  scrivi: (c, companyId, id, rate) => c.aggiornaRate(companyId, id, rate),
  copiaLocale: (svc, orgId, doc, tipo) =>
    salvaDocumenti(tabelleSupabase(svc), orgId, [mappaDocumento(doc, TIPO_RICEVUTO[tipo], new Date().toISOString())]),
  senzaMetodo: 'Scegli il metodo di pagamento nella finestra Fatture',
}

export const CANALE_INCASSI: Canale = {
  tabella: 'incassi_fatture',
  leggi: (c, companyId, id) => c.emesso(companyId, id),
  scrivi: (c, companyId, id, rate) => c.aggiornaRateEmesso(companyId, id, rate),
  copiaLocale: (svc, orgId, doc, tipo) =>
    salvaDocumenti(tabelleSupabase<RigaFatturaEmessa>(svc, TABELLE_EMESSE), orgId, [mappaEmesso(doc, TIPO_EMESSO[tipo], new Date().toISOString())]),
  senzaMetodo: 'Metodo di incasso non abbinato a un conto FiC: impostalo in Impostazioni → Fatture in Cloud',
}

export type Riga = {
  id: string
  fic_documento_id: number
  tipo_documento: TipoFatturaFornitore
  importo: number
  stato_fic: StatoFic
  scrittura_fic: ScritturaFic | null
  intenzione_fic: IntenzioneFic | null
}

/** Un collegamento "in corso" da piu' di cosi' e' rimasto appeso (funzione interrotta). */
const PRESA_SCADUTA_MS = 2 * 60_000
export const COLONNE_RIGA = 'id, fic_documento_id, tipo_documento, importo, stato_fic, scrittura_fic, intenzione_fic'

export class Problema extends Error {
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

export function aRiga(x: Record<string, unknown>): Riga {
  return {
    ...(x as Riga),
    fic_documento_id: Number(x.fic_documento_id),
    importo: Number(x.importo),
  }
}

async function aggiorna(svc: SupabaseClient, tabella: Canale['tabella'], id: string, campi: Record<string, unknown>) {
  const { error } = await svc.from(tabella).update({ ...campi, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Prende il collegamento: riesce solo se nessun'altra operazione lo sta usando. */
async function prendi(svc: SupabaseClient, tabella: Canale['tabella'], id: string): Promise<boolean> {
  const scaduta = new Date(Date.now() - PRESA_SCADUTA_MS).toISOString()
  const { data, error } = await svc
    .from(tabella)
    .update({ stato_fic: 'in_corso', updated_at: new Date().toISOString() })
    .eq('id', id)
    .or(`stato_fic.neq.in_corso,updated_at.lt.${scaduta}`)
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

/** La pagina Fatture vede subito il pagamento. Mai bloccante: lo sistema la sincronizzazione. */
async function aggiornaCopiaLocale(ctx: Contesto, doc: DocumentoFic, tipo: TipoFatturaFornitore) {
  try {
    await ctx.canale.copiaLocale(ctx.svc, ctx.orgId, doc, tipo)
  } catch {
    // la copia locale e' solo una comodita': FiC e la scrittura registrata sono gia' a posto
  }
}

export type Contesto = {
  svc: SupabaseClient
  orgId: string
  canale: Canale
  ottieniClient: () => Promise<{ client: FicClient; companyId: number }>
}

/**
 * Porta un collegamento allo stato desiderato. Restituisce cosa e' successo;
 * gli errori diventano lo stato del collegamento e un messaggio.
 */
export async function trattaCollegamento(
  ctx: Contesto, r: Riga, d: Desiderato,
): Promise<{ scritto: boolean; annullato: boolean; problema: string | null }> {
  const { svc, orgId, canale } = ctx
  const tab = canale.tabella
  const nulla = { scritto: false, annullato: false, problema: null }
  let azione = decidiAzione(r, d)

  if (azione === 'niente' && !r.intenzione_fic) {
    // FiC e' gia' come deve essere: si ripuliscono solo stati rimasti indietro
    // (un "da allineare" superato, una presa rimasta appesa). "Da verificare" resta:
    // li' serve una persona.
    const atteso: StatoFic = r.scrittura_fic ? 'scritto' : 'non_scritto'
    if (r.stato_fic === 'da_allineare' || r.stato_fic === 'in_corso') {
      await aggiorna(svc, tab, r.id, { stato_fic: atteso, messaggio_fic: null })
    } else if (!d.pagare && !r.scrittura_fic && r.stato_fic !== 'non_scritto' && r.stato_fic !== 'da_verificare') {
      await aggiorna(svc, tab, r.id, { stato_fic: 'non_scritto', messaggio_fic: null })
    }
    return nulla
  }

  if (!(await prendi(svc, tab, r.id))) {
    return { ...nulla, problema: 'Un\'altra operazione su FiC e\' in corso per questo documento: riprova fra poco' }
  }

  let scritto = false
  let annullato = false
  try {
    if ((azione === 'scrivi' || azione === 'riscrivi') && d.metodoId === null) {
      throw new Problema('da_allineare', canale.senzaMetodo)
    }
    const { client, companyId } = await ctx.ottieniClient()

    // Un tentativo precedente si e' interrotto dopo aver deciso di scrivere:
    // prima di tutto si guarda se FiC ha gia' il pagamento.
    if (r.intenzione_fic) {
      const doc = await canale.leggi(client, companyId, r.fic_documento_id)
      const ritrovata = ritrovaScrittura(doc.payments_list ?? [], r.intenzione_fic)
      if (ritrovata) r.scrittura_fic = ritrovata
      r.intenzione_fic = null
      await aggiorna(svc, tab, r.id, { scrittura_fic: r.scrittura_fic, intenzione_fic: null })
      azione = decidiAzione(r, d)
    }

    if (azione === 'annulla' || azione === 'riscrivi') {
      const doc = await canale.leggi(client, companyId, r.fic_documento_id)
      const rate = doc.payments_list ?? []
      let dopo: DocumentoFic = doc
      if (!giaAnnullato(rate, r.scrittura_fic!)) {
        const a = annullaPagamento(rate, r.scrittura_fic!)
        if (!a.ok) throw new Problema('da_verificare', a.motivo)
        dopo = await canale.scrivi(client, companyId, r.fic_documento_id, a.rate)
      }
      // Subito dopo il PUT: da qui in poi WinStudio sa che su FiC non c'e' piu' niente di suo.
      r.scrittura_fic = null
      await aggiorna(svc, tab, r.id, { scrittura_fic: null, scritto_at: null })
      annullato = azione === 'annulla'
      await aggiornaCopiaLocale(ctx, dopo, r.tipo_documento)
    }

    if (azione === 'scrivi' || azione === 'riscrivi') {
      const doc = await canale.leggi(client, companyId, r.fic_documento_id)
      const prima = doc.payments_list ?? []
      const e = applicaPagamento(prima, r.importo, d.data, d.metodoId!)
      if (!e.ok) {
        throw new Problema('da_verificare', `Su FiC restano ${formatEuro(e.disponibile)} €, servono ${formatEuro(r.importo)} €`)
      }
      const intenzione = intenzioneDa(prima, e, d.data, d.metodoId!)
      // Prima del PUT: se la risposta si perde, il prossimo tentativo sapra' cosa cercare.
      await aggiorna(svc, tab, r.id, { intenzione_fic: intenzione })
      await canale.scrivi(client, companyId, r.fic_documento_id, e.rate)
      // Si rilegge invece di fidarsi della risposta del PUT (forma non garantita).
      const riletto = await canale.leggi(client, companyId, r.fic_documento_id)
      const scrittura = ritrovaScrittura(riletto.payments_list ?? [], intenzione)
      if (!scrittura) {
        throw new Problema('da_verificare', 'FiC ha accettato il pagamento ma le rate non risultano come previsto: controlla la fattura')
      }
      r.scrittura_fic = scrittura
      await aggiorna(svc, tab, r.id, { scrittura_fic: scrittura, intenzione_fic: null, scritto_at: new Date().toISOString() })
      scritto = true
      await aggiornaCopiaLocale(ctx, riletto, r.tipo_documento)
    }

    await aggiorna(svc, tab, r.id, { stato_fic: r.scrittura_fic ? 'scritto' : 'non_scritto', messaggio_fic: null })
    return { scritto, annullato, problema: null }
  } catch (e) {
    const p = classifica(e)
    if (e instanceof FicNonAutorizzato) {
      await svc.from('fic_collegamenti').update({ stato: 'da_ricollegare' }).eq('organization_id', orgId)
    }
    // Rilascia la presa con lo stato del problema. intenzione_fic resta se c'era:
    // il prossimo tentativo verifichera' su FiC prima di rifare il PUT.
    await aggiorna(svc, tab, r.id, { stato_fic: p.stato, messaggio_fic: p.message })
    return { scritto, annullato, problema: p.message }
  }
}

export function creaContesto(svc: SupabaseClient, orgId: string, canale: Canale): Contesto {
  let pronto: { client: FicClient; companyId: number } | null = null
  return {
    svc,
    orgId,
    canale,
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
