// Codici di misura delle regole accessori di FP PRO (RefDim / dim_rif e seguenti).
// Etichette da C:\FP_PRO\FP_PRO.MSG e FP_GUI.MSG ("Larghezza anta %d (maniglia)", "Peso anta %d",
// "Altezza anta %d lato cerniera", "Larghezza anta %d compreso riporto", "Peso scorrevole %d"...).
// Anta 1 = quella con la maniglia (principale), anta 2 = la passiva, come in FP PRO.
// Un codice che qui non c'e' NON diventa mai "altezza": la riga non vale e si segnala.
import type { CondizioneRiga } from '../strutture-xml'

export interface MisuraAnta { l: number; h: number; peso: number }

export interface MisureRif {
  /** Zona del nodo (mm) */
  L: number
  H: number
  /** Peso del serramento (kg) */
  peso: number
  /** Ante battenti del nodo, la principale per prima */
  ante: MisuraAnta[]
  /** Ante scorrevoli del nodo */
  scorrevoli: MisuraAnta[]
}

const anta = (m: MisureRif, n: number) => m.ante[n - 1] ?? null

/** Misura per il codice di FP PRO; null = codice sconosciuto o anta che non esiste. */
export function misuraRif(codice: number, m: MisureRif): number | null {
  switch (codice) {
    case 1: return m.H
    case 2: return m.L
    case 3: return 2 * (m.L + m.H)
    case 4: return 2 * m.H + m.L
    case 200: return m.peso
    case 22: return m.scorrevoli[0]?.l ?? null
    case 23: return m.scorrevoli[0]?.peso ?? null
    case 24: return m.scorrevoli[0]?.h ?? null
  }
  const gruppo = Math.floor(codice / 100)
  const n = codice % 100
  if (n < 1 || n > 3) return null
  const a = anta(m, n)
  if (gruppo === 1 || gruppo === 4) return a?.l ?? null
  if (gruppo === 2) return a?.peso ?? null
  if (gruppo === 3) return a?.h ?? null
  return null
}

/** Codici che il motore sa misurare (servono al banco di prova e agli avvisi). */
export const codiceNoto = (codice: number) =>
  misuraRif(codice, { L: 1, H: 1, peso: 1, ante: [{ l: 1, h: 1, peso: 1 }, { l: 1, h: 1, peso: 1 }, { l: 1, h: 1, peso: 1 }], scorrevoli: [{ l: 1, h: 1, peso: 1 }] }) !== null

/** Condizione senza fascia: vale sempre. Codice sconosciuto con fascia: non vale e si segnala. */
export function condizioneVera(c: CondizioneRiga, m: MisureRif): { vera: boolean; ignoto?: number } {
  if (c.min === null || c.max === null || c.max <= 0) return { vera: true }
  if (!codiceNoto(c.dim)) return { vera: false, ignoto: c.dim }
  const v = misuraRif(c.dim, m)
  if (v === null) return { vera: false }
  return { vera: v >= c.min && v <= c.max }
}
