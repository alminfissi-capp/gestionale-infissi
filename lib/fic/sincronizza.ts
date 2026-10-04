import type { ConteggiSync } from '@/types/fatture-fornitori'
import { FicTroppeRichieste, type FicClient } from '@/lib/fic/client'
import { confronta, type VoceLocale } from '@/lib/fic/confronto'
import { mappaDocumento, mappaEmesso, type DocumentoMappato, type EmessoMappato } from '@/lib/fic/mappa'
import type { DocumentoFic, TipoEmessoFic, TipoSpesaFic } from '@/lib/fic/tipi'

/** Dove finiscono i dati: Supabase nelle Server Action, un finto nei test. */
export type ArchivioFatture<M = DocumentoMappato> = {
  vociLocali: () => Promise<VoceLocale[]>
  salva: (documenti: M[]) => Promise<void>
  elimina: (ficIds: number[]) => Promise<void>
}

/** Da dove si leggono i documenti e come diventano righe: fatture ricevute o emesse. */
export type FonteDocumenti<M> = {
  tipi: string[]
  elenco: (tipo: string, dal: string) => Promise<DocumentoFic[]>
  dettaglio: (id: number) => Promise<DocumentoFic>
  mappa: (doc: DocumentoFic, tipo: string, ora: string) => M
}

export function fonteFornitori(client: FicClient, companyId: number): FonteDocumenti<DocumentoMappato> {
  return {
    tipi: ['expense', 'passive_credit_note'],
    elenco: (tipo, dal) => client.elencoSpese(companyId, tipo as TipoSpesaFic, dal),
    dettaglio: (id) => client.spesa(companyId, id),
    mappa: (doc, tipo, ora) => mappaDocumento(doc, tipo as TipoSpesaFic, ora),
  }
}

export function fonteEmesse(client: FicClient, companyId: number): FonteDocumenti<EmessoMappato> {
  return {
    tipi: ['invoice', 'credit_note'],
    elenco: (tipo, dal) => client.elencoEmessi(companyId, tipo as TipoEmessoFic, dal),
    dettaglio: (id) => client.emesso(companyId, id),
    mappa: (doc, tipo, ora) => mappaEmesso(doc, tipo as TipoEmessoFic, ora),
  }
}

export type MotivoStop = 'budget' | 'tempo' | 'troppe_richieste'

export type RisultatoSync = {
  completa: boolean
  conteggi: ConteggiSync
  daScaricare: number
  scaricate: number
  motivoStop: MotivoStop | null
}

export type OpzioniSync<M = DocumentoMappato> = {
  client: FicClient
  archivio: ArchivioFatture<M>
  companyId: number
  dal: string
  budgetChiamate: number
  limiteMs: number
  adesso?: () => number
  /** Senza fonte: fatture dei fornitori. */
  fonte?: FonteDocumenti<M>
}

export const LOTTO_SALVATAGGIO = 50

/**
 * Un giro di sincronizzazione.
 *
 * 1. Legge l'elenco completo da FiC. Se fallisce a meta', l'errore risale
 *    prima di qualunque scrittura: nessuna eliminazione su un elenco monco.
 * 2. Confronta con la copia locale ed elimina le sparite.
 * 3. Salva nuove e modificate, piu' recenti prima, a lotti. Se l'elenco non
 *    porta le rate chiede il dettaglio, entro budget di chiamate e di tempo:
 *    esaurito il budget il giro e' parziale e il successivo riprende da solo,
 *    perche' il confronto ritrova le mancanti.
 */
export async function sincronizza<M = DocumentoMappato>(o: OpzioniSync<M>): Promise<RisultatoSync> {
  const adesso = o.adesso ?? Date.now
  const inizio = adesso()
  const ora = new Date().toISOString()
  const fonte = o.fonte ?? (fonteFornitori(o.client, o.companyId) as unknown as FonteDocumenti<M>)

  const perId = new Map<number, { doc: DocumentoFic; tipo: string }>()
  for (const tipo of fonte.tipi) {
    for (const doc of await fonte.elenco(tipo, o.dal)) {
      perId.set(doc.id, { doc, tipo })
    }
  }

  const locali = await o.archivio.vociLocali()
  const diff = confronta(
    [...perId.values()].map(({ doc }) => ({ fic_id: doc.id, updated_at: doc.updated_at })),
    locali,
  )
  if (diff.eliminate.length > 0) await o.archivio.elimina(diff.eliminate)

  const nuove = new Set(diff.nuove)
  const daScaricare = [...diff.nuove, ...diff.modificate].sort((a, b) => {
    const da = perId.get(a)!.doc.date
    const db = perId.get(b)!.doc.date
    return da < db ? 1 : da > db ? -1 : a - b
  })

  const conteggi: ConteggiSync = { nuove: 0, aggiornate: 0, eliminate: diff.eliminate.length }
  let motivoStop: MotivoStop | null = null
  let scaricate = 0
  let lotto: M[] = []
  const svuota = async () => {
    if (lotto.length === 0) return
    const daSalvare = lotto
    lotto = []
    await o.archivio.salva(daSalvare)
  }

  for (const id of daScaricare) {
    const { doc, tipo } = perId.get(id)!
    let completo = doc
    if (!Array.isArray(doc.payments_list)) {
      if (o.client.chiamate() >= o.budgetChiamate) { motivoStop = 'budget'; break }
      if (adesso() - inizio >= o.limiteMs) { motivoStop = 'tempo'; break }
      try {
        completo = await fonte.dettaglio(id)
      } catch (e) {
        if (e instanceof FicTroppeRichieste) { motivoStop = 'troppe_richieste'; break }
        await svuota()
        throw e
      }
    }
    // Si salva la data di modifica dell'elenco, la stessa che il confronto usera' al giro dopo:
    // se il dettaglio la riportasse in un altro formato, ogni giro rivedrebbe la fattura come modificata.
    lotto.push(fonte.mappa({ ...completo, updated_at: doc.updated_at }, tipo, ora))
    scaricate++
    if (nuove.has(id)) conteggi.nuove++
    else conteggi.aggiornate++
    if (lotto.length >= LOTTO_SALVATAGGIO) await svuota()
  }
  await svuota()

  return { completa: motivoStop === null, conteggi, daScaricare: daScaricare.length, scaricate, motivoStop }
}

// Non toLocaleString('it-IT'): in italiano i numeri di 4 cifre non si raggruppano (1340, non 1.340).
const numero = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function messaggioParziale(r: RisultatoSync): string {
  const quante = `Sincronizzate ${numero(r.scaricate)} fatture su ${numero(r.daScaricare)}`
  if (r.motivoStop === 'troppe_richieste') {
    return `${quante}. Fatture in Cloud ha chiesto una pausa: riprova fra qualche minuto`
  }
  return `${quante}: premi di nuovo Sincronizza per continuare`
}
