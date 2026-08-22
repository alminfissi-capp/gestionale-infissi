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
  /** Quante sono in corso adesso: e' la luce verde del semaforo. */
  inCorso: number
  /** Quante sono bloccate: e' la luce rossa. */
  bloccate: number
  /** Intero 0-100, arrotondato. */
  percentuale: number
  fette: FettaAvanzamento[]
}

/** Commessa senza attività programmate: anello grigio, nessuna percentuale. */
export const AVANZAMENTO_VUOTO: Avanzamento = {
  totale: 0,
  completate: 0,
  inCorso: 0,
  bloccate: 0,
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
    inCorso: fasi.filter((a) => a.stato === 'in_corso').length,
    bloccate: fasi.filter((a) => a.stato === 'bloccato').length,
    percentuale: Math.round((completate / fette.length) * 100),
    fette,
  }
}

/**
 * Le tre luci del semaforo di commessa.
 *
 * Verde: qualcuno ci sta lavorando adesso. Giallo: nessuno ci sta lavorando,
 * la commessa e' ferma in stand-by. Sono l'una il contrario dell'altra, e una
 * delle due e' sempre accesa.
 *
 * Rosso: c'e' qualcosa di bloccato. E' una luce a se', non spegne le altre —
 * un blocco mentre nessuno lavora da' giallo e rosso, un blocco mentre altri
 * lavorano da' verde e rosso.
 */
export type Semaforo = { verde: boolean; giallo: boolean; rosso: boolean }

export function calcolaSemaforo(avanzamento: Avanzamento): Semaforo {
  const verde = avanzamento.inCorso > 0
  return { verde, giallo: !verde, rosso: avanzamento.bloccate > 0 }
}

/**
 * Durata in forma leggibile: `2h 05m`, `12m`, `45s`. I secondi si mostrano
 * solo sotto il minuto, altrimenti la riga balla a ogni battito.
 */
export function formattaDurata(secondi: number): string {
  const totale = Math.max(0, Math.floor(secondi))
  if (totale < 60) return `${totale}s`
  const minuti = Math.floor(totale / 60)
  if (minuti < 60) return `${minuti}m`
  const ore = Math.floor(minuti / 60)
  return `${ore}h ${String(minuti % 60).padStart(2, '0')}m`
}
