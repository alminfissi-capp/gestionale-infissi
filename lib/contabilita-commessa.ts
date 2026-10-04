// Calcoli della contabilita' di commessa: logica pura, nessun accesso al database.
// Riproduce il foglio Excel "Calcolo Costi-Utili" (vedi la spec 2026-10-04).

import {
  CATEGORIE_COSTO,
  type CategoriaCosto,
  type RigaManodopera,
  type StimaCommessa,
  type VoceManodopera,
} from '@/types/contabilita'

const cent = (v: number) => Math.round(v * 100) / 100

export function totaliPerCategoria(
  costi: { categoria: CategoriaCosto; importo: number }[],
): { perCategoria: Record<CategoriaCosto, number>; totale: number } {
  const perCategoria = Object.fromEntries(CATEGORIE_COSTO.map((c) => [c.value, 0])) as Record<CategoriaCosto, number>
  for (const c of costi) perCategoria[c.categoria] = cent(perCategoria[c.categoria] + c.importo)
  const totale = cent(Object.values(perCategoria).reduce((s, v) => s + v, 0))
  return { perCategoria, totale }
}

export function costoManodopera(
  voci: Record<VoceManodopera, RigaManodopera>,
  tariffa: number,
): Record<VoceManodopera, number> & { totale: number } {
  const costo = (r: RigaManodopera) => cent((r.persone ?? 0) * (r.giorni ?? 0) * tariffa)
  const posa = costo(voci.posa)
  const produzione = costo(voci.produzione)
  const altro = costo(voci.altro)
  return { posa, produzione, altro, totale: cent(posa + produzione + altro) }
}

export type Riepilogo = {
  costiFissi: number
  totaleCosti: number
  utile: number
  /** utile ÷ costi, in %: la percentuale del foglio Excel */
  ricarico: number | null
  /** utile ÷ totale lavoro, in % */
  margine: number | null
  imprevisti: number
}

/** Costi fissi = percentuale di (materiali e spese + manodopera), come nel foglio Excel. */
export function riepilogo(p: {
  totaleLavoro: number
  materiali: number
  manodopera: number
  percFissi: number
  imprevisti: number
}): Riepilogo {
  const costiFissi = cent((p.materiali + p.manodopera) * p.percFissi / 100)
  const totaleCosti = cent(p.materiali + p.manodopera + costiFissi)
  const utile = cent(p.totaleLavoro - totaleCosti)
  return {
    costiFissi,
    totaleCosti,
    utile,
    ricarico: totaleCosti > 0 ? (utile / totaleCosti) * 100 : null,
    margine: p.totaleLavoro > 0 ? (utile / p.totaleLavoro) * 100 : null,
    imprevisti: cent(p.imprevisti),
  }
}

/** Pezzi di una riga di fattura ancora liberi per questa commessa. */
export function rimanente(quantitaFattura: number, usataAltrove: number): number {
  return Math.max(0, Math.round((quantitaFattura - usataAltrove) * 1000) / 1000)
}

/** Da quale voce di manodopera viene il tempo di ogni tipo di attivita'. */
const VOCE_DI_ATTIVITA: Record<string, VoceManodopera> = {
  posa: 'posa',
  lavorazione: 'produzione',
  carico: 'altro',
  ricez_alluminio: 'altro',
  ricez_accessori: 'altro',
  ricez_vetri: 'altro',
  rilievo_misure: 'altro',
}

/**
 * Giornate proposte dal cronometro delle attivita': ore ÷ 8, al quarto di giornata.
 * Il cronometro misura la durata, non le persone: quelle le decide l'operatore.
 */
export function propostaCronometro(eventi: { tipo: string; secondi: number }[]): Record<VoceManodopera, number> {
  const secondi: Record<VoceManodopera, number> = { posa: 0, produzione: 0, altro: 0 }
  for (const e of eventi) {
    const voce = VOCE_DI_ATTIVITA[e.tipo]
    if (voce) secondi[voce] += e.secondi
  }
  const giornate = (s: number) => Math.round((s / 3600 / 8) * 4) / 4
  return { posa: giornate(secondi.posa), produzione: giornate(secondi.produzione), altro: giornate(secondi.altro) }
}

const normCodice = (c: string | null | undefined) => (c ?? '').trim().toUpperCase()

/** L'ultima categoria usata per lo stesso codice articolo. */
export function categoriaProposta(
  codice: string | null,
  storico: { codice: string | null; categoria: CategoriaCosto; quando: string }[],
): CategoriaCosto | null {
  const k = normCodice(codice)
  if (!k) return null
  const usi = storico.filter((s) => normCodice(s.codice) === k).sort((a, b) => b.quando.localeCompare(a.quando))
  return usi[0]?.categoria ?? null
}

/** Importo di una riga attribuita: negativo per le note di credito. */
export function importoRiga(quantita: number, prezzoNetto: number, tipo: 'fattura' | 'nota_credito'): number {
  const segno = tipo === 'nota_credito' ? -1 : 1
  return cent(segno * quantita * Math.abs(prezzoNetto))
}

/** Avviso se la riga di fattura su FiC non e' piu' quella copiata al momento dell'attribuzione. */
export function confrontoFattura(
  salvato: { quantita_fattura: number | null; prezzo_unitario: number | null },
  riga: { qty?: number | null; net_price?: number | null } | null,
  tipo: 'fattura' | 'nota_credito',
): string | null {
  if (!riga) return 'riga non più presente su FiC'
  const segno = tipo === 'nota_credito' ? -1 : 1
  const prezzoAttuale = segno * Math.abs(Number(riga.net_price ?? 0))
  if (Math.abs(prezzoAttuale - Number(salvato.prezzo_unitario ?? 0)) > 0.00005) return 'prezzo cambiato su FiC'
  if (Math.abs(Number(riga.qty ?? 0) - Number(salvato.quantita_fattura ?? 0)) > 0.0005) return 'quantità cambiata su FiC'
  return null
}

/** Stima di partenza dal preventivo WinStudio: il preventivo non conosce le categorie. */
export function stimaDaPreventivo(c: { materiali: number; posa: number; spese: number; trasporto: number }): StimaCommessa {
  const stima: StimaCommessa = { materiali_preventivo: cent(c.materiali + c.spese), manodopera: cent(c.posa) }
  if (c.trasporto) stima.trasporti = cent(c.trasporto)
  return stima
}

export function totaliStima(stima: StimaCommessa | null): { materiali: number; manodopera: number } {
  if (!stima) return { materiali: 0, manodopera: 0 }
  const categorie = CATEGORIE_COSTO.reduce((s, c) => s + (stima[c.value] ?? 0), 0)
  return { materiali: cent(categorie + (stima.materiali_preventivo ?? 0)), manodopera: cent(stima.manodopera ?? 0) }
}
