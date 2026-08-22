// lib/avanzamento.ts
import { aspettoDi } from '@/types/calendario'
import type { AspettiTipo } from '@/types/calendario'

/**
 * Avanzamento di una commessa: ogni attività programmata è una fase, e vale
 * la stessa fetta di torta delle altre. Quattro attività fanno 25% l'una,
 * cinque ne fanno 20%: la percentuale non è un campo da tenere allineato, si
 * ricalcola da sola quando si aggiunge o si toglie un'attività.
 */

/** Una fetta dell'anello: il colore è quello del tipo di attività. */
export type FettaAvanzamento = {
  colore: string
  completata: boolean
}

export type Avanzamento = {
  totale: number
  completate: number
  /** Intero 0-100, arrotondato. */
  percentuale: number
  fette: FettaAvanzamento[]
}

/** Commessa senza attività programmate: anello grigio, nessuna percentuale. */
export const AVANZAMENTO_VUOTO: Avanzamento = {
  totale: 0,
  completate: 0,
  percentuale: 0,
  fette: [],
}

/** Il minimo che serve per pesare un'attività: che tipo è e a che punto sta. */
export type AttivitaPesabile = {
  tipo: string
  stato: string
}

/**
 * Le fette nell'ordine in cui arrivano — chi chiama passa le attività in
 * ordine di calendario, così l'anello si legge come la linea del tempo.
 * Le attività annullate non arrivano fin qui: non sono fasi da svolgere.
 */
export function calcolaAvanzamento(
  attivita: AttivitaPesabile[],
  aspetti: AspettiTipo
): Avanzamento {
  const fasi = attivita.filter((a) => a.stato !== 'annullato')
  if (fasi.length === 0) return AVANZAMENTO_VUOTO

  const fette: FettaAvanzamento[] = fasi.map((a) => ({
    colore: aspettoDi(aspetti, a.tipo).sfondo,
    completata: a.stato === 'completato',
  }))
  const completate = fette.filter((f) => f.completata).length

  return {
    totale: fette.length,
    completate,
    percentuale: Math.round((completate / fette.length) * 100),
    fette,
  }
}
