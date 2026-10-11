// Quantita' degli accessori di una voce secondo le regole di FP PRO (ricavate dalle commesse
// vere 170-26G e 172-26G):
// - kit opzionali e accessori opzionali solo se scelti;
// - una riga di kit vale solo per le serie dei profili elencate (nessuna = tutte);
// - le misure (L, H, perimetro) sono quelle della zona del nodo che porta l'accessorio;
// - nelle formule w e' il PESO del serramento (kg), h l'altezza;
// - accessori "contenitore" (kit cerniere) sostituiti dai loro accessori, se non gia' presenti;
// - un kit scelto senza righe nello STR (FP PRO scrive solo quelle del kit confermato) prende le
//   righe dal catalogo dei kit; tra le alternative di uno stesso gruppo vale la prima.
import type { AccessorioStruttura, NodoStruttura } from '../strutture-xml'

/** Maggiorazione degli accessori a metro (guarnizioni, spazzolini) */
export const MAGGIORAZIONE_METRO = 1.06

export interface QuantitaAccessorio {
  codice: string
  serie: string
  descrizione: string
  /** Pezzi, oppure metri se `metri` */
  quantita: number
  metri: boolean
  regolaIgnota: boolean
}

export interface RegoleAccessori {
  serieStruttura: string[]
  /** Serie a cui vale la riga del kit; null = tutte */
  serieRigaKit: (kit: string, codice: string) => string[] | null
  collegati: (codice: string) => { codice: string; serie: string; quantita: number }[]
  /** Righe del kit dal catalogo di FP PRO, per i kit che nello STR non hanno righe */
  righeCatalogo: (kit: string) => AccessorioStruttura[]
}

/** Riga di fp_kit_righe come la legge il calcolo */
export interface RigaKitCatalogo {
  fp_id: number
  codice: string
  tipo: number | null
  quantita: number | string | null
  opzionale: boolean
  dim_rif: number | null
  lim_inf: number | string | null
  lim_sup: number | string | null
  passo: number | string | null
  formula_r: string | null
  formula_dist: string | null
  dati: Record<string, unknown> | null
}

const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Righe del catalogo nel formato della struttura. Le righe opzionali dello stesso gruppo
 * (gruppoid) sono alternative: FP PRO conferma la prima, le altre restano da scegliere.
 */
export function accessoriDaCatalogo(righe: RigaKitCatalogo[]): AccessorioStruttura[] {
  const gruppiPresi = new Set<number>()
  return [...righe].sort((a, b) => a.fp_id - b.fp_id).map(r => {
    const d = r.dati ?? {}
    const gruppo = numero(d.gruppoid)
    let confermato = !r.opzionale
    if (r.opzionale && gruppo > 0 && !gruppiPresi.has(gruppo)) {
      gruppiPresi.add(gruppo)
      confermato = true
    }
    const min = numero(r.lim_inf)
    const max = numero(r.lim_sup)
    const passo = numero(r.passo)
    return {
      codice: r.codice,
      descrizione: String(d.descr ?? ''),
      serie: '',
      tipo: numero(r.tipo),
      quantita: numero(r.quantita),
      dimRif: numero(r.dim_rif),
      dimCalcolo: numero(d.dim_calc),
      min: max > 0 ? min : null,
      max: max > 0 ? max : null,
      passo: passo > 0 ? passo : null,
      formula: r.formula_r || null,
      dimDistribuzione: numero(d.dimrifdist),
      formulaDistribuzione: r.formula_dist || null,
      opzionale: r.opzionale,
      confermato,
    }
  })
}

type Misure = { L: number; H: number; w: number; h: number }

/** Regole costruite dagli elenchi letti dal database (o dalle fixture). */
export function regoleDaElenchi(
  serieStruttura: string[],
  righeKit: { kit: string; codice: string; serie: string[] | null }[],
  collegati: { principale: string; collegato: string; quantita: number; serie: string }[],
  catalogoKit: Record<string, RigaKitCatalogo[]> = {},
): RegoleAccessori {
  const catalogo = new Map(Object.entries(catalogoKit).map(([kit, righe]) => [kit, accessoriDaCatalogo(righe)]))
  const perRiga = new Map<string, string[] | null>()
  for (const r of righeKit) {
    const chiave = `${r.kit}\u0000${r.codice}`
    const prima = perRiga.get(chiave)
    // Stesso codice su piu' righe: vale l'unione; una riga senza limiti vale per tutte.
    if (prima === null || r.serie === null) perRiga.set(chiave, null)
    else perRiga.set(chiave, [...(prima ?? []), ...r.serie])
  }
  const perPrincipale = new Map<string, { codice: string; serie: string; quantita: number }[]>()
  for (const c of collegati) {
    const l = perPrincipale.get(c.principale) ?? []
    l.push({ codice: c.collegato, serie: c.serie, quantita: c.quantita })
    perPrincipale.set(c.principale, l)
  }
  return {
    serieStruttura,
    serieRigaKit: (kit, codice) => {
      const s = perRiga.get(`${kit}\u0000${codice}`)
      return s === undefined ? null : s
    },
    collegati: codice => perPrincipale.get(codice) ?? [],
    righeCatalogo: kit => catalogo.get(kit) ?? [],
  }
}

/**
 * Formula semplice di FP PRO (w/2, L-43, 2*H+L…) con + - * / e parentesi.
 * null se non interpretabile: non si esegue mai codice.
 */
export function valutaFormula(f: string, d: Misure): number | null {
  const testo = f.replace(/,/g, '.').replace(/\s+/g, '')
  if (!/^[0-9wWhHlL.+\-*/()]+$/.test(testo)) return null
  let i = 0
  const variabile = (c: string): number | null =>
    c === 'w' || c === 'W' ? d.w : c === 'h' ? d.h : c === 'H' ? d.H : c === 'l' || c === 'L' ? d.L : null
  const fattore = (): number | null => {
    const c = testo[i]
    if (c === '(') {
      i++
      const v = somma()
      if (testo[i] !== ')') return null
      i++
      return v
    }
    if (c === '-') {
      i++
      const v = fattore()
      return v === null ? null : -v
    }
    const v = c === undefined ? null : variabile(c)
    if (v !== null) {
      i++
      return v
    }
    const m = /^[0-9]+(\.[0-9]+)?/.exec(testo.slice(i))
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }
  const prodotto = (): number | null => {
    let v = fattore()
    while (v !== null && (testo[i] === '*' || testo[i] === '/')) {
      const op = testo[i++]
      const b = fattore()
      if (b === null || (op === '/' && b === 0)) return null
      v = op === '*' ? v * b : v / b
    }
    return v
  }
  const somma = (): number | null => {
    let v = prodotto()
    while (v !== null && (testo[i] === '+' || testo[i] === '-')) {
      const op = testo[i++]
      const b = prodotto()
      if (b === null) return null
      v = op === '+' ? v + b : v - b
    }
    return v
  }
  const v = somma()
  return v !== null && i === testo.length && Number.isFinite(v) ? v : null
}

/** Misura di riferimento di FP PRO: 1 = H, 2 = L, 3 = perimetro, 4 = 2H + L (telaio senza il lato in basso). */
function misura(codice: number, d: Misure): number {
  if (codice === 2) return d.L
  if (codice === 3) return 2 * (d.L + d.H)
  if (codice === 4) return 2 * d.H + d.L
  return d.H
}

function quantitaDi(a: AccessorioStruttura, d: Misure): { quantita: number; ignota: boolean } {
  // Fascia di validita' (es. 4 chiusure per H tra 1500 e 2500).
  if (a.min !== null && a.max !== null && a.max > 0) {
    const rif = a.dimRif === 5 ? (a.formula ? valutaFormula(a.formula, d) : null) : misura(a.dimRif, d)
    if (rif === null) return { quantita: a.quantita, ignota: true }
    if (rif < a.min || rif > a.max) return { quantita: 0, ignota: false }
  }
  if (a.tipo === 2 || a.tipo === 4) {
    return { quantita: (a.quantita * misura(a.dimCalcolo || 1, d)) / 1000 * MAGGIORAZIONE_METRO, ignota: false }
  }
  if (a.passo !== null && a.passo > 0) {
    const rif = a.dimDistribuzione === 5
      ? (a.formulaDistribuzione ? valutaFormula(a.formulaDistribuzione, d) : null)
      : misura(a.dimDistribuzione || 3, d)
    if (rif === null) return { quantita: a.quantita, ignota: true }
    return { quantita: Math.max(a.quantita, Math.round(rif / a.passo)), ignota: false }
  }
  return { quantita: a.quantita, ignota: false }
}

export function accessoriVoce(
  albero: NodoStruttura[],
  kitScelti: Record<string, boolean>,
  zone: Record<number, { L: number; H: number }>,
  peso: number,
  regole: RegoleAccessori,
): QuantitaAccessorio[] {
  const trovati: QuantitaAccessorio[] = []
  const espliciti = new Set<string>()
  const usa = (a: AccessorioStruttura, d: Misure) => {
    const { quantita, ignota } = quantitaDi(a, d)
    if (quantita > 0) {
      trovati.push({ codice: a.codice, serie: a.serie, descrizione: a.descrizione, quantita, metri: a.tipo === 2 || a.tipo === 4, regolaIgnota: ignota })
    }
  }
  const scelto = (a: AccessorioStruttura) => !a.opzionale || a.confermato
  const valePerSerie = (kit: string, codice: string) => {
    const serie = regole.serieRigaKit(kit, codice)
    return serie === null || serie.some(s => regole.serieStruttura.includes(s))
  }
  const visita = (nodi: NodoStruttura[], ereditata: { L: number; H: number }) => {
    for (const n of nodi) {
      const z = zone[n.codice] ?? ereditata
      const d: Misure = { L: z.L, H: z.H, w: peso, h: z.H }
      for (const a of n.accessori) {
        espliciti.add(a.codice)
        if (scelto(a)) usa(a, d)
      }
      n.kit.forEach((k, i) => {
        const kitScelto = !k.opzionale || (kitScelti[`${n.codice}:${i}`] ?? k.confermato)
        if (!kitScelto) return
        const righe = k.accessori.length > 0 ? k.accessori : regole.righeCatalogo(k.codice)
        for (const a of righe) {
          espliciti.add(a.codice)
          if (scelto(a) && valePerSerie(k.codice, a.codice)) usa(a, d)
        }
      })
      visita(n.figli, z)
    }
  }
  visita(albero, { L: 0, H: 0 })

  // Contenitori: si contano i loro accessori, a meno che FP PRO non li abbia gia' messi nella struttura.
  const out: QuantitaAccessorio[] = []
  for (const a of trovati) {
    const figli = regole.collegati(a.codice)
    if (figli.length === 0) {
      out.push(a)
      continue
    }
    if (figli.some(f => espliciti.has(f.codice))) continue
    for (const f of figli) {
      out.push({ codice: f.codice, serie: f.serie, descrizione: a.descrizione, quantita: f.quantita * a.quantita, metri: false, regolaIgnota: a.regolaIgnota })
    }
  }
  return out
}
