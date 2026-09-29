import type { RataFatturaFornitore, StatoPagamento } from '@/types/fatture-fornitori'

export const ETICHETTA_STATO_PAGAMENTO: Record<StatoPagamento, string> = {
  pagata: 'Pagata',
  parziale: 'Parziale',
  da_pagare: 'Da pagare',
  scaduta: 'Scaduta',
}

/**
 * Stato di una fattura ricavato dalle rate. "Scaduta" vince su "parziale":
 * una rata non pagata oltre la scadenza e' la cosa da vedere per prima.
 * `oggi` e' 'YYYY-MM-DD' (vedi oggiRoma): la scadenza di oggi non e' ancora scaduta.
 */
export function statoPagamento(
  rate: Pick<RataFatturaFornitore, 'stato' | 'scadenza'>[],
  oggi: string,
): StatoPagamento {
  if (rate.length === 0) return 'da_pagare'
  const nonPagate = rate.filter((r) => r.stato !== 'pagata')
  if (nonPagate.length === 0) return 'pagata'
  if (nonPagate.some((r) => r.scadenza !== null && r.scadenza < oggi)) return 'scaduta'
  return nonPagate.length < rate.length ? 'parziale' : 'da_pagare'
}

/** Data di oggi a Roma come 'YYYY-MM-DD' (il server Vercel gira in UTC). */
export function oggiRoma(adesso: Date = new Date()): string {
  return adesso.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}
