import type { ConteggiSync } from '@/types/fatture-fornitori'
import { FicTroppeRichieste, type FicClient } from '@/lib/fic/client'
import { confronta, type VoceLocale } from '@/lib/fic/confronto'
import { mappaDocumento, type DocumentoMappato } from '@/lib/fic/mappa'
import type { DocumentoFic, TipoSpesaFic } from '@/lib/fic/tipi'

/** Dove finiscono i dati: Supabase nelle Server Action, un finto nei test. */
export type ArchivioFatture = {
  vociLocali: () => Promise<VoceLocale[]>
  salva: (documenti: DocumentoMappato[]) => Promise<void>
  elimina: (ficIds: number[]) => Promise<void>
}

export type MotivoStop = 'budget' | 'tempo' | 'troppe_richieste'

export type RisultatoSync = {
  completa: boolean
  conteggi: ConteggiSync
  daScaricare: number
  scaricate: number
  motivoStop: MotivoStop | null
}

export type OpzioniSync = {
  client: FicClient
  archivio: ArchivioFatture
  companyId: number
  dal: string
  budgetChiamate: number
  limiteMs: number
  adesso?: () => number
}

export const LOTTO_SALVATAGGIO = 50

const TIPI: TipoSpesaFic[] = ['expense', 'passive_credit_note']

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
export async function sincronizza(o: OpzioniSync): Promise<RisultatoSync> {
  const adesso = o.adesso ?? Date.now
  const inizio = adesso()
  const ora = new Date().toISOString()

  const perId = new Map<number, { doc: DocumentoFic; tipo: TipoSpesaFic }>()
  for (const tipo of TIPI) {
    for (const doc of await o.client.elencoSpese(o.companyId, tipo, o.dal)) {
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
  let lotto: DocumentoMappato[] = []
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
        completo = await o.client.spesa(o.companyId, id)
      } catch (e) {
        if (e instanceof FicTroppeRichieste) { motivoStop = 'troppe_richieste'; break }
        await svuota()
        throw e
      }
    }
    lotto.push(mappaDocumento(completo, tipo, ora))
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
