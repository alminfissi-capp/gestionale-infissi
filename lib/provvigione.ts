// Provvigione del preventivo (agente) — logica pura, nessuna dipendenza React/Supabase.
//
// La provvigione e' un unico fattore k = 1 + pct/100 applicato in modo uniforme a ogni
// riga e al trasporto: base = "mio prezzo" (voci + trasporto, prima dello sconto).
// Le righe in DB sono salvate GIA' maggiorate (cosi' PDF, stampa, link pubblico ed email
// mostrano i prezzi cliente senza saperne nulla); il mio prezzo si ricava dividendo per k.
// Lo sconto globale si applica dopo, sui prezzi maggiorati: pesa anche sull'agente.

type RigaPrezzo = { prezzo_unitario: number; prezzo_totale_riga: number }

/**
 * Percentuale effettiva della provvigione. Se e' stata scritta in euro (importoFisso),
 * diventa la percentuale equivalente sul mio prezzo (lordoBase = voci + trasporto).
 */
export function percentualeProvvigione(lordoBase: number, pct: number, importoFisso: number | null): number {
  if (importoFisso != null) {
    if (lordoBase <= 0 || importoFisso <= 0) return 0
    return (importoFisso / lordoBase) * 100
  }
  return Number.isFinite(pct) && pct > 0 ? pct : 0
}

export function fattoreProvvigione(pct: number): number {
  return 1 + (pct > 0 ? pct : 0) / 100
}

function scala<T extends RigaPrezzo>(righe: T[], f: number): T[] {
  if (f === 1) return righe
  return righe.map((r) => ({ ...r, prezzo_unitario: r.prezzo_unitario * f, prezzo_totale_riga: r.prezzo_totale_riga * f }))
}

/** Mio prezzo → prezzo cliente (unitario e totale riga) */
export function applicaProvvigione<T extends RigaPrezzo>(righe: T[], pct: number): T[] {
  return scala(righe, fattoreProvvigione(pct))
}

/** Prezzo cliente → mio prezzo (unitario e totale riga) */
export function togliProvvigione<T extends RigaPrezzo>(righe: T[], pct: number): T[] {
  return scala(righe, 1 / fattoreProvvigione(pct))
}

/** Un importo cliente riportato al mio prezzo */
export function senzaProvvigione(valore: number, pct: number): number {
  return valore / fattoreProvvigione(pct)
}

/**
 * Quanto spetta all'agente, dopo lo sconto: la parte di provvigione nel lordo cliente,
 * ridotta nella stessa proporzione dello sconto. Arrotondata ai centesimi.
 */
export function importoProvvigione(lordoCliente: number, totaleArticoli: number, pct: number): number {
  if (lordoCliente <= 0 || pct <= 0) return 0
  const quotaLorda = lordoCliente - lordoCliente / fattoreProvvigione(pct)
  return Math.round(quotaLorda * (totaleArticoli / lordoCliente) * 100) / 100
}
