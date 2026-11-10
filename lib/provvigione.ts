// Provvigione del preventivo (agente) — logica pura, nessuna dipendenza React/Supabase.
//
// La provvigione e' un unico fattore k = 1 + pct/100 applicato in modo uniforme a ogni
// riga e al trasporto: base = "mio prezzo" (voci + trasporto, prima dello sconto).
// Le righe in DB sono salvate GIA' maggiorate (cosi' PDF, stampa, link pubblico ed email
// mostrano i prezzi cliente senza saperne nulla); il mio prezzo si ricava dividendo per k.
// Lo sconto globale si applica dopo, sui prezzi maggiorati: pesa anche sull'agente.

import { calcolaSubtotale, calcolaRiepilogoIva, calcolaTotalePreventivo, type RiepilogoIvaItem } from '@/lib/pricing'

type RigaPrezzo = { prezzo_unitario: number; prezzo_totale_riga: number }
type RigaConQuantita = RigaPrezzo & { quantita: number; sconto_articolo?: number; omaggio?: boolean }

/** Arrotonda ai centesimi (le colonne prezzo in DB sono NUMERIC(…,2)) */
export function arrotondaCent(n: number): number {
  return Math.round(n * 100) / 100
}

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

/**
 * Mio prezzo → prezzo cliente. L'unitario si arrotonda ai centesimi (come verra' salvato) e il
 * totale riga si ricava da quello (unitario × qty × (1 − sconto%)): cosi' righe, subtotale e PDF
 * tornano al centesimo, e riaprire + risalvare da' gli stessi numeri
 * (arrotondaCent(arrotondaCent(x) / k × k) = arrotondaCent(x)).
 */
export function applicaProvvigione<T extends RigaConQuantita>(righe: T[], pct: number): T[] {
  const k = fattoreProvvigione(pct)
  if (k === 1) return righe
  return righe.map((r) => {
    const unitario = arrotondaCent(r.prezzo_unitario * k)
    const totale = r.omaggio ? 0 : arrotondaCent(unitario * r.quantita * (1 - (r.sconto_articolo ?? 0) / 100))
    return { ...r, prezzo_unitario: unitario, prezzo_totale_riga: totale }
  })
}

/** Prezzo cliente → mio prezzo (unitario e totale riga), senza arrotondare */
export function togliProvvigione<T extends RigaPrezzo>(righe: T[], pct: number): T[] {
  const k = fattoreProvvigione(pct)
  if (k === 1) return righe
  return righe.map((r) => ({ ...r, prezzo_unitario: r.prezzo_unitario / k, prezzo_totale_riga: r.prezzo_totale_riga / k }))
}

/** Il preventivo per il link pubblico: senza nessun dato della provvigione */
export function senzaDatiProvvigione<T extends object>(p: T): Omit<T, 'provvigione_percentuale' | 'provvigione_importo' | 'provvigione_importo_fisso'> {
  const { provvigione_percentuale: _a, provvigione_importo: _b, provvigione_importo_fisso: _c, ...resto } =
    p as T & { provvigione_percentuale?: unknown; provvigione_importo?: unknown; provvigione_importo_fisso?: unknown }
  return resto
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

/**
 * Totali completi del preventivo partendo dal MIO prezzo: applica la provvigione a righe,
 * trasporto e quote di trasporto, poi sconto, IVA e totali come sempre.
 * Unica fonte per server (salvataggio) e wizard (anteprima): i numeri devono coincidere.
 * `quoteBase` = quote di trasporto per riga (parallele ad articoliBase), senza provvigione.
 */
export function calcolaTotaliConProvvigione<T extends RigaConQuantita & { aliquota_iva: number | null }>(p: {
  articoliBase: T[]
  trasportoBase: number
  quoteBase: number[]
  scontoGlobale: number
  scontoImportoFisso: number | null
  provvigionePct: number
  provvigioneImportoFisso: number | null
}): {
  articoli: T[]
  quoteTrasporto: number[]
  provvigionePct: number
  subtotale: number
  speseTrasporto: number
  riepilogoIva: RiepilogoIvaItem[]
  ivaTotale: number
  importoSconto: number
  totaleArticoli: number
  totaleFinale: number
  provvigioneImporto: number
} {
  const lordoBase = calcolaSubtotale(p.articoliBase) + p.trasportoBase
  const provvigionePct = percentualeProvvigione(lordoBase, p.provvigionePct, p.provvigioneImportoFisso)
  const k = fattoreProvvigione(provvigionePct)
  const articoli = applicaProvvigione(p.articoliBase, provvigionePct)
  const quoteTrasporto = p.articoliBase.map((_, i) => (p.quoteBase[i] ?? 0) * k)
  const speseTrasporto = k === 1 ? p.trasportoBase : arrotondaCent(p.trasportoBase * k)
  const subtotale = calcolaSubtotale(articoli)
  const riepilogoIva = calcolaRiepilogoIva(
    articoli.map((a, i) => ({ ...a, quota_trasporto: quoteTrasporto[i] })),
    p.scontoGlobale,
    p.scontoImportoFisso,
  )
  const ivaTotale = riepilogoIva.reduce((sum, r) => sum + r.iva, 0)
  const { importoSconto, totaleArticoli, totaleFinale } = calcolaTotalePreventivo(
    subtotale, p.scontoGlobale, speseTrasporto, ivaTotale, p.scontoImportoFisso,
  )
  return {
    articoli, quoteTrasporto, provvigionePct, subtotale, speseTrasporto, riepilogoIva, ivaTotale,
    importoSconto, totaleArticoli, totaleFinale,
    provvigioneImporto: importoProvvigione(subtotale + speseTrasporto, totaleArticoli, provvigionePct),
  }
}
