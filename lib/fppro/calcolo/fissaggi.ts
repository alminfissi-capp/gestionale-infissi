// Fissaggi dei profili come FP PRO (squadrette, cavallotti), verificati con il banco di prova su
// 974 voci (2026-11-15). Regole da non ribaltare:
// 1. si contano PER ANGOLO, non per pezzo: i due pezzi che si incontrano possono scrivere lo stesso
//    filtro (in una finestra: traverso alto a dx + montante dx in alto) e vale una volta sola;
// 2. i filtri sono quelli scritti sull'estremita' del pezzo nella .STR (FP_PIECE_FLTSX/FLTDX):
//    nelle porte P2A le ante ne hanno 7 insieme, e un'estremita' senza filtri non ha fissaggi
//    (zoccolo delle ante, piede del telaio porta);
// 3. angolo a 90 gradi = righe con dim_rif 1, angolo inclinato (trapezi, archi) = dim_rif 2;
// 4. solo se la struttura non scrive NESSUN filtro valgono quelli predefiniti della serie
//    (ordine piu' basso, verificato su 183-26G: PLANET 62 = ACP 5008 + 5801M + 50153 per angolo);
// 5. angolo (giunzione 4) fra due profili diversi: conta solo l'estremita' del SECONDO profilo
//    (DXF2: zoccolo, soglia), con le righe sue o, se non ne ha, del primo. 12-2026G: lo zoccolo
//    TT51817A non scrive filtri = angolo senza squadrette anche se il montante li scrive; 04-2026G:
//    lo zoccolo UP61978B li scrive ma non ha righe = squadrette del montante UP61978;
// 6. pezzo cambiato dopo (la giunzione nomina altri profili, 158-26G): filtri predefiniti;
// 7. righe dim_rif 0 (TCE4819Z sui montanti) per angolo come le altre, a qualunque angolo;
// 8. accessori fittizi (VITE_FITT, SALD: fittizio = 1) non vanno in preventivo.
// Banco 2026-11-15: fissaggi uguali a FP PRO in 878 voci su 974.
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

/** fittizi = codici degli accessori fittizi di FP PRO (accessori.fittizio = 1): non si contano. */
export function datiFissaggi(righe: RigaFissaggio[], serie: RigaSerieFissaggio[], fittizi: Set<string> = new Set()): DatiFissaggi {
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
    const k = `${r.codice_profilo}|${r.filtro}`
    if (!r.codice_accessorio || fittizi.has(r.codice_accessorio)) continue
    const chiave = `${r.codice_profilo}|${r.codice_accessorio}|${r.filtro}|${r.dim_rif}`
    if (visti.has(chiave)) continue
    visti.add(chiave)
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
      const [p1, p2] = g.profili ?? ['', '']
      // Regola 6: la giunzione nomina altri profili = pezzo sostituito dopo, filtri non piu' validi.
      const sostituito = !!g.chiave && !!p1 && codice !== p1 && codice !== p2
      const filtri = g.filtri.length > 0 && !sostituito ? g.filtri : (nessunFiltro || sostituito) && g.chiave ? dati.predefiniti(codice) : []
      // Regola 5: angolo fra profili diversi, decide il secondo.
      const fraDiversi = !sostituito && g.tipo === 4 && !!p1 && !!p2 && p1 !== p2
      if (fraDiversi && codice !== p2) continue
      const dimRif = Math.abs(g.angolo - 90) < 0.01 ? 1 : 2
      for (const filtro of filtri) {
        // Estremita' senza giunzione: angolo proprio, non si fonde con altri.
        const angolo = `${g.chiave || `${i}:${lato}`}|${filtro}`
        if (angoli.has(angolo)) continue
        angoli.add(angolo)
        const daProfilo = g.tipo === 4 && dati.righe(codice, filtro).length === 0 && p1 && p1 !== codice ? p1 : codice
        dati.righe(daProfilo, filtro).filter(f => f.dimRif === dimRif || f.dimRif === 0).forEach(conta)
      }
    }
  })
  return out
}
