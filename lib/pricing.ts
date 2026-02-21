// Logica di business pura — nessuna dipendenza React/Next/Supabase

export type CalcoloPrezzoResult = {
  prezzo: number
  larghezzaEffettiva: number
  altezzaEffettiva: number
  arrotondata: boolean
}

/**
 * Trova il prezzo nella griglia per le misure L×H.
 * Arrotonda per eccesso alla prima misura disponibile >= L e >= H.
 * Se la misura supera il massimo disponibile, usa il massimo.
 */
export function calcolaPrezzoBase(
  griglia: Record<string, Record<string, number>>,
  larghezze: number[],
  altezze: number[],
  L: number,
  H: number
): CalcoloPrezzoResult {
  if (larghezze.length === 0 || altezze.length === 0) {
    throw new Error('Griglia prezzi vuota')
  }

  const larghezzeOrd = [...larghezze].sort((a, b) => a - b)
  const altezzeOrd = [...altezze].sort((a, b) => a - b)

  const lEff = larghezzeOrd.find((l) => l >= L) ?? larghezzeOrd[larghezzeOrd.length - 1]
  const hEff = altezzeOrd.find((h) => h >= H) ?? altezzeOrd[altezzeOrd.length - 1]

  // Le chiavi JSON sono sempre stringhe
  const prezzo = griglia[hEff.toString()]?.[lEff.toString()]

  if (!prezzo || prezzo === 0) {
    throw new Error('Misura non realizzabile con il listino selezionato')
  }

  return {
    prezzo,
    larghezzaEffettiva: lEff,
    altezzaEffettiva: hEff,
    arrotondata: lEff !== L || hEff !== H,
  }
}

/** Applica la percentuale di finitura al prezzo base */
export function applicaFinitura(prezzoBase: number, percentuale: number): number {
  return prezzoBase * (1 + percentuale / 100)
}

/** Prezzo totale di una riga: unitario × qty × (1 - sconto%) */
export function calcolaTotaleRiga(
  prezzoUnitario: number,
  quantita: number,
  scontoArticolo: number
): number {
  return prezzoUnitario * quantita * (1 - scontoArticolo / 100)
}

/** Somma dei prezzi_totale_riga di tutti gli articoli */
export function calcolaSubtotale(articoli: { prezzo_totale_riga: number }[]): number {
  return articoli.reduce((sum, a) => sum + a.prezzo_totale_riga, 0)
}

/** Somma delle quantità (pezzi totali, usata per il trasporto) */
export function calcolaTotalePezzi(articoli: { quantita: number }[]): number {
  return articoli.reduce((sum, a) => sum + a.quantita, 0)
}

/**
 * Spese di trasporto:
 * 0 pezzi → €0 | 1-10 pezzi → €350 fissi | >10 pezzi → €350 + €30/pz oltre i 10
 */
export function calcolaSpeseTrasporto(totalePezzi: number): number {
  if (totalePezzi === 0) return 0
  if (totalePezzi <= 10) return 350
  return 350 + (totalePezzi - 10) * 30
}

/** Calcola sconto globale, totale articoli e totale finale */
export function calcolaTotalePreventivo(
  subtotale: number,
  scontoGlobale: number,
  speseTrasporto: number
): { importoSconto: number; totaleArticoli: number; totaleFinale: number } {
  const importoSconto = subtotale * (scontoGlobale / 100)
  const totaleArticoli = subtotale - importoSconto
  const totaleFinale = totaleArticoli + speseTrasporto
  return { importoSconto, totaleArticoli, totaleFinale }
}

/** Formatta un numero come euro (es. 1.234,56) */
export function formatEuro(value: number): string {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
