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

  const lEff = larghezzeOrd.find((l) => l >= L)
  if (lEff === undefined) {
    throw new Error(
      `Larghezza ${L} mm supera il massimo del listino (${larghezzeOrd[larghezzeOrd.length - 1]} mm)`
    )
  }

  const hEff = altezzeOrd.find((h) => h >= H)
  if (hEff === undefined) {
    throw new Error(
      `Altezza ${H} mm supera il massimo del listino (${altezzeOrd[altezzeOrd.length - 1]} mm)`
    )
  }

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

/** Applica la percentuale e/o l'importo fisso di finitura al prezzo base */
export function applicaFinitura(prezzoBase: number, percentuale: number, euro = 0): number {
  return prezzoBase * (1 + percentuale / 100) + euro
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

/** Somma delle quantità (pezzi totali) */
export function calcolaTotalePezzi(articoli: { quantita: number }[]): number {
  return articoli.reduce((sum, a) => sum + a.quantita, 0)
}

/**
 * Calcola spese di trasporto per una singola categoria con regole configurabili.
 *
 * - 0 pezzi              → €0
 * - pezzi <= minPezzi    → costoMinimo (flat)
 * - pezzi >  minPezzi    → costoMinimo + (pezzi - minPezzi) × costoUnitario
 *
 * Con valori default (tutti 0): trasporto = €0.
 */
export function calcolaSpeseTrasportoPezzi(
  pezzi: number,
  costoUnitario: number,
  costoMinimo: number,
  minPezzi: number
): number {
  if (pezzi === 0) return 0
  if (pezzi <= minPezzi) return costoMinimo
  return costoMinimo + (pezzi - minPezzi) * costoUnitario
}

/** Calcola sconto globale, totale articoli e totale finale */
export function calcolaTotalePreventivo(
  subtotale: number,
  scontoGlobale: number,
  speseTrasporto: number,
  ivaTotale = 0
): { importoSconto: number; totaleArticoli: number; totaleFinale: number } {
  const importoSconto = subtotale * (scontoGlobale / 100)
  const totaleArticoli = subtotale - importoSconto
  const totaleFinale = totaleArticoli + speseTrasporto + ivaTotale
  return { importoSconto, totaleArticoli, totaleFinale }
}

export type RiepilogoIvaItem = { aliquota: number; imponibile: number; iva: number }

/** Calcola il riepilogo IVA raggruppando per aliquota, applicando lo sconto globale */
export function calcolaRiepilogoIva(
  articoli: { prezzo_totale_riga: number; aliquota_iva: number | null }[],
  scontoGlobale: number
): RiepilogoIvaItem[] {
  const factor = 1 - scontoGlobale / 100
  const map = new Map<number, number>()
  for (const a of articoli) {
    if (a.aliquota_iva == null) continue
    map.set(a.aliquota_iva, (map.get(a.aliquota_iva) ?? 0) + a.prezzo_totale_riga * factor)
  }
  return [...map.entries()]
    .map(([aliquota, imponibile]) => ({ aliquota, imponibile, iva: imponibile * (aliquota / 100) }))
    .sort((a, b) => b.aliquota - a.aliquota)
}

/**
 * Costo di acquisto unitario da fornitore (listino griglia):
 * prezzoBase × (1 - scontoFornitore / 100)
 */
export function calcolaCostoAcquistoUnitario(prezzoBase: number, scontoFornitore: number): number {
  return prezzoBase * (1 - scontoFornitore / 100)
}

/**
 * Prezzo unitario per articolo da listino libero:
 * prodotto.prezzo + Σ(accessorio.prezzo × qty)
 */
export function calcolaPrezzoUnitarioLibero(
  prezzoProdotto: number,
  accessori: { prezzo: number; qty: number }[]
): number {
  return prezzoProdotto + accessori.reduce((sum, a) => sum + a.prezzo * a.qty, 0)
}

/**
 * Calcola il costo di un accessorio griglia in base al tipo di prezzo:
 * - pezzo: prezzo fisso per pezzo
 * - mq: prezzo × mq effettivi (con eventuale minimo)
 * - percentuale: percentuale del prezzo base
 */
export function calcolaAccessorioGriglia(
  accessorio: { tipo_prezzo: 'pezzo' | 'mq' | 'percentuale'; prezzo: number; mq_minimo: number | null },
  larghezza: number,
  altezza: number,
  prezzoBase: number
): number {
  switch (accessorio.tipo_prezzo) {
    case 'pezzo':
      return accessorio.prezzo
    case 'mq': {
      const mq = (larghezza * altezza) / 1_000_000
      const mqEffettivo = accessorio.mq_minimo ? Math.max(mq, accessorio.mq_minimo) : mq
      return accessorio.prezzo * mqEffettivo
    }
    case 'percentuale':
      return prezzoBase * (accessorio.prezzo / 100)
  }
}

/** Formatta un numero come euro italiano (es. 1.234,56) — non dipende dalla locale di sistema */
export function formatEuro(value: number): string {
  const fixed = Math.abs(value).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${value < 0 ? '-' : ''}${intFormatted},${decPart}`
}
