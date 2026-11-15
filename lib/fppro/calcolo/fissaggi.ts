// Fissaggi dei profili come FP PRO (squadrette, cavallotti), verificati con il banco di prova su
// 974 voci (2026-11-15). Regole da non ribaltare:
// 1. si contano PER ANGOLO, non per pezzo: i due pezzi che si incontrano possono scrivere lo stesso
//    filtro (in una finestra: traverso alto a dx + montante dx in alto) e vale una volta sola;
// 2. i filtri sono quelli scritti sull'estremita' del pezzo nella .STR (FP_PIECE_FLTSX/FLTDX):
//    nelle porte P2A le ante ne hanno 7 insieme, e un'estremita' senza filtri non ha fissaggi
//    (zoccolo delle ante, piede del telaio porta);
// 3. angolo a 90 gradi = righe con dim_rif 1, angolo inclinato (trapezi, archi) = dim_rif 2;
// 4. solo se la struttura non scrive NESSUN filtro valgono quelli predefiniti della serie
//    (ordine piu' basso, verificato su 183-26G: PLANET 62 = ACP 5008 + 5801M + 50153 per angolo).
import type { FissaggioProfilo } from './accessori'
import type { PezzoStruttura } from '../strutture-xml'

export interface RigaFissaggio {
  codice_profilo: string | null
  codice_accessorio: string | null
  serie_fp_id: number | null
  quantita: number | string | null
  dim_rif: number | null
  filtro: string | null
}
export interface RigaSerieFissaggio { serie_fp_id: number | null; ordine: number | null; filtro: string | null }

export interface DatiFissaggi {
  /** Righe della tabella fissaggi per profilo e filtro (tutti i dim_rif) */
  righe: (codiceProfilo: string, filtro: string) => FissaggioProfilo[]
  /** Filtri predefiniti del profilo: quelli con l'ordine piu' basso nella sua serie */
  predefiniti: (codiceProfilo: string) => string[]
}

export function datiFissaggi(righe: RigaFissaggio[], serie: RigaSerieFissaggio[]): DatiFissaggi {
  const ordine = new Map<string, number>()
  for (const s of serie) if (s.serie_fp_id !== null && s.filtro) ordine.set(`${s.serie_fp_id}|${s.filtro}`, Number(s.ordine ?? 99))
  const perFiltro = new Map<string, FissaggioProfilo[]>()
  const visti = new Set<string>()
  const minimo = new Map<string, number>()
  const predefiniti = new Map<string, Set<string>>()
  for (const r of righe) {
    if (!r.codice_profilo || !r.filtro) continue
    const o = ordine.get(`${r.serie_fp_id}|${r.filtro}`)
    if (o !== undefined) minimo.set(r.codice_profilo, Math.min(minimo.get(r.codice_profilo) ?? Infinity, o))
    if (!r.codice_accessorio) continue
    const chiave = `${r.codice_profilo}|${r.codice_accessorio}|${r.filtro}|${r.dim_rif}`
    if (visti.has(chiave)) continue
    visti.add(chiave)
    const k = `${r.codice_profilo}|${r.filtro}`
    perFiltro.set(k, [...(perFiltro.get(k) ?? []), { codice: r.codice_accessorio, quantita: Number(r.quantita ?? 0), dimRif: Number(r.dim_rif ?? 0) }])
  }
  for (const r of righe) {
    if (!r.codice_profilo || !r.filtro) continue
    if (ordine.get(`${r.serie_fp_id}|${r.filtro}`) !== minimo.get(r.codice_profilo)) continue
    predefiniti.set(r.codice_profilo, (predefiniti.get(r.codice_profilo) ?? new Set()).add(r.filtro))
  }
  return {
    righe: (codice, filtro) => perFiltro.get(`${codice}|${filtro}`) ?? [],
    predefiniti: codice => [...(predefiniti.get(codice) ?? [])],
  }
}

export interface PezzoFissaggi { codice: string; pezzo: PezzoStruttura }
export interface FissaggioContato { codice: string; quantita: number }

/** Fissaggi di una voce dai pezzi della struttura (codice = codice del profilo dal DXF). */
export function fissaggiStruttura(pezzi: PezzoFissaggi[], dati: DatiFissaggi): FissaggioContato[] {
  const out: FissaggioContato[] = []
  const conta = (f: FissaggioProfilo) => {
    if (f.quantita > 0) out.push({ codice: f.codice, quantita: f.quantita })
  }
  // Strutture lette prima delle giunzioni (ponte < 8): come prima, filtri predefiniti su ogni pezzo.
  if (!pezzi.some(p => p.pezzo.giunti)) {
    for (const { codice } of pezzi) {
      for (const filtro of dati.predefiniti(codice)) dati.righe(codice, filtro).filter(f => f.dimRif === 1).forEach(conta)
    }
    return out
  }
  const nessunFiltro = !pezzi.some(p => p.pezzo.giunti?.sx?.filtri.length || p.pezzo.giunti?.dx?.filtri.length)
  const angoli = new Set<string>()
  pezzi.forEach(({ codice, pezzo }, i) => {
    for (const [lato, g] of [['sx', pezzo.giunti?.sx], ['dx', pezzo.giunti?.dx]] as const) {
      if (!g) continue
      const filtri = g.filtri.length > 0 ? g.filtri : nessunFiltro && g.chiave ? dati.predefiniti(codice) : []
      const dimRif = Math.abs(g.angolo - 90) < 0.01 ? 1 : 2
      for (const filtro of filtri) {
        // Estremita' senza giunzione: angolo proprio, non si fonde con altri.
        const angolo = `${g.chiave || `${i}:${lato}`}|${filtro}`
        if (angoli.has(angolo)) continue
        angoli.add(angolo)
        dati.righe(codice, filtro).filter(f => f.dimRif === dimRif).forEach(conta)
      }
    }
  })
  return out
}
