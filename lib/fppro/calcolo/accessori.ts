// Quantita' degli accessori di una voce secondo le regole di FP PRO (ricavate dalle commesse
// vere 170-26G e 172-26G):
// - kit opzionali e accessori opzionali solo se scelti;
// - una riga di kit vale solo per le serie dei profili elencate (nessuna = tutte);
// - le misure (L, H, perimetro) sono quelle della zona del nodo che porta l'accessorio;
// - nelle formule w e' il PESO del serramento (kg), h l'altezza;
// - accessori "contenitore" (kit cerniere) sostituiti dai loro accessori, se non gia' presenti;
// - un kit scelto senza righe nello STR (FP PRO scrive solo quelle del kit confermato) prende le
//   righe dal catalogo dei kit; tra le alternative di uno stesso gruppo vale la prima.
import type { AccessorioStruttura, CondizioneRiga, NodoStruttura } from '../strutture-xml'
import { chiaveKit } from '../kit-catalogo'
import { condizioneVera, misuraRif, type MisuraAnta, type MisureRif } from './misure-riferimento'
import type { DatiFissaggi } from './fissaggi'

/**
 * Chiave della scelta di un accessorio opzionale nella voce (VoceFpDati.accessori): nodo,
 * indice del kit (null = accessorio sciolto del nodo) e codice.
 */
export const chiaveAccessorio = (nodo: number, kit: number | null, codice: string): string =>
  kit === null ? `${nodo}:a:${codice}` : `${nodo}:${kit}:${codice}`

/** Maggiorazione degli accessori a metro (guarnizioni, spazzolini) */
export const MAGGIORAZIONE_METRO = 1.06

export interface QuantitaAccessorio {
  codice: string
  serie: string
  descrizione: string
  /** Pezzi, oppure metri se `metri`, oppure metri quadri se `mq` */
  quantita: number
  metri: boolean
  /** Accessorio a metro quadro (FP PRO tipo 3, es. tapparelle): quantita' in m² */
  mq?: boolean
  regolaIgnota: boolean
  /** Regola di FP PRO che il motore non sa applicare: la riga non e' contata (quantita 0) */
  avviso?: string
}

/** Mano della voce e misure delle ante per nodo (codice nodo -> ante, la principale per prima). */
export interface OpzioniAccessori {
  mano?: 'sx' | 'dx' | null
  ante?: Record<number, { ante: MisuraAnta[]; scorrevoli: MisuraAnta[] }>
}

export interface RegoleAccessori {
  serieStruttura: string[]
  /** Serie a cui vale la riga del kit; null = tutte */
  serieRigaKit: (kit: string, codice: string) => string[] | null
  collegati: (codice: string) => { codice: string; serie: string; quantita: number }[]
  /** Righe del kit dal catalogo di FP PRO, per i kit che nello STR non hanno righe */
  righeCatalogo: (kit: string) => AccessorioStruttura[]
  /**
   * Fissaggi dei profili (squadrette, cavallotti: tabella fissaggi di FP PRO) per profilo e filtro,
   * contati per angolo da lib/fppro/calcolo/fissaggi.ts. Assente = nessun fissaggio (calcoli vecchi).
   */
  fissaggi?: DatiFissaggi
}

/** Riga della tabella fissaggi: dimRif 1 = angolo a 90 gradi, 2 = angolo inclinato (0 non usato da FP PRO qui). */
export interface FissaggioProfilo { codice: string; quantita: number; dimRif: number; serie?: string; descrizione?: string }

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
      gruppo: gruppo > 0 ? gruppo : null,
      apertura: numero(d.apertura),
      altreCondizioni: altreCondizioniCatalogo(d),
      condizioniAlternative: numero(d.condparam) === 1,
      numMax: numero(d.num_max) > 0 ? numero(d.num_max) : null,
      parametro: numero(d.parametrica) === 1 && d.codice_param ? { codice: String(d.codice_param), valore: String(d.valore_param ?? '') } : null,
      formulaL: d.formulal ? String(d.formulal) : null,
      formulaH: d.formulah ? String(d.formulah) : null,
      corrMl: numero(d.corr_ml),
    }
  })
}

/** Seconda, terza e quarta condizione delle righe di fp_kit_righe (nomi delle colonne di FP PRO). */
function altreCondizioniCatalogo(d: Record<string, unknown>): CondizioneRiga[] {
  const campi: [string, string, string][] = [
    ['dimrif2', 'liminfrange2', 'limsuprange2'],
    ['dim_rif3', 'lim_inf_range3', 'lim_sup_range3'],
    ['dimrif4', 'liminfrange4', 'limsuprange4'],
  ]
  return campi.flatMap(([c, inf, sup]) => {
    const dim = numero(d[c])
    if (dim === 0) return []
    const min = numero(d[inf])
    const max = numero(d[sup])
    return [{ dim, min: min === 0 && max === 0 ? null : min, max: min === 0 && max === 0 ? null : max }]
  })
}

/** a = larghezza di UNA anta (nei nodi con piu' ante e' L diviso il numero di ante), per la formula O1 */
type Misure = { L: number; H: number; w: number; h: number; a?: number; rif?: MisureRif }

const rifDi = (d: Misure): MisureRif => d.rif ?? { L: d.L, H: d.H, peso: d.w, ante: [], scorrevoli: [] }

/** Regole costruite dagli elenchi letti dal database (o dalle fixture). */
export function regoleDaElenchi(
  serieStruttura: string[],
  righeKit: { kit: string; codice: string; serie: string[] | null }[],
  collegati: { principale: string; collegato: string; quantita: number; serie: string }[],
  catalogoKit: Record<string, RigaKitCatalogo[]> = {},
): RegoleAccessori {
  // Kit per nome senza maiuscole: lo STR e il catalogo non le scrivono sempre uguali.
  const catalogo = new Map(Object.entries(catalogoKit).map(([kit, righe]) => [chiaveKit(kit), accessoriDaCatalogo(righe)]))
  const perRiga = new Map<string, string[] | null>()
  for (const r of righeKit) {
    const chiave = `${chiaveKit(r.kit)}\u0000${r.codice}`
    const prima = perRiga.get(chiave)
    // Stesso codice su piu' righe: vale l'unione; una riga senza limiti vale per tutte.
    if (prima === null || r.serie === null) perRiga.set(chiave, null)
    else perRiga.set(chiave, [...(prima ?? []), ...r.serie])
  }
  const perPrincipale = new Map<string, { codice: string; serie: string; quantita: number }[]>()
  for (const c of collegati) {
    // Collegato a se stesso (A3532NEOPA.2 -> A3532NEOPA.2 in FP PRO): non e' un contenitore.
    if (c.collegato === c.principale) continue
    const l = perPrincipale.get(c.principale) ?? []
    l.push({ codice: c.collegato, serie: c.serie, quantita: c.quantita })
    perPrincipale.set(c.principale, l)
  }
  return {
    serieStruttura,
    serieRigaKit: (kit, codice) => {
      const s = perRiga.get(`${chiaveKit(kit)}\u0000${codice}`)
      return s === undefined ? null : s
    },
    collegati: codice => perPrincipale.get(codice) ?? [],
    righeCatalogo: kit => catalogo.get(chiaveKit(kit)) ?? [],
  }
}

/**
 * Formula semplice di FP PRO (w/2, L-43, 2*H+L…) con + - * / e parentesi.
 * null se non interpretabile: non si esegue mai codice.
 */
export function valutaFormula(f: string, d: Misure): number | null {
  // Variabili dei kit a fasce (bracci della ribalta): O1+AE+AE = larghezza dell'anta. O1 e'
  // la larghezza di UNA anta (la ribalta va su un'anta sola, anche nelle finestre a piu' ante),
  // AE la sovrapposizione, presa a 0: vicino ai limiti di fascia puo' uscire il braccio accanto.
  // Ante scorrevoli (TOPSLIDE): HSX/hsx = altezza, SX = larghezza dell'anta scorrevole (senza: la zona).
  const testo = f.replace(/,/g, '.').replace(/\s+/g, '').replace(/O1/g, 'a').replace(/AE/g, '0')
    .replace(/HSX/gi, 'y').replace(/SX/g, 'x')
  if (!/^[0-9wWhHlLaxy.+\-*/()]+$/.test(testo)) return null
  let i = 0
  const variabile = (c: string): number | null =>
    c === 'w' || c === 'W' ? d.w : c === 'h' ? d.h : c === 'H' ? d.H : c === 'l' || c === 'L' ? d.L : c === 'a' ? (d.a ?? d.L)
      : c === 'x' ? (d.rif?.scorrevoli[0]?.l ?? d.L) : c === 'y' ? (d.rif?.scorrevoli[0]?.h ?? d.H) : null
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

/**
 * Misura di riferimento di FP PRO (tabella in misure-riferimento.ts). 0 = altezza, come il motore
 * ha sempre fatto per le righe senza codice; null = codice che il motore non sa misurare.
 */
function misura(codice: number, d: Misure): number | null {
  return codice === 0 ? d.H : misuraRif(codice, rifDi(d))
}

type Esito = { quantita: number; ignota: boolean; avviso?: string }

const nonGestita = (dim: number, a: AccessorioStruttura): Esito =>
  ({ quantita: 0, ignota: false, avviso: `Regola FP PRO non gestita: misura ${dim} su ${a.codice}` })

function quantitaDi(a: AccessorioStruttura, d: Misure): Esito {
  // Condizioni della riga: la prima (fascia su dimRif; 5 = formula O1+AE+AE; 0 = H; 901-904 =
  // anta passiva) e le altre (seconda, terza, quarta). Di norma devono valere tutte; con
  // condizioni alternative (condparam = 1, es. ACP 5155 su 192-26G) basta una.
  const esiti: ('si' | 'no' | 'ignota')[] = []
  let avviso: Esito | null = null
  if (a.dimRif >= 901 && a.dimRif <= 904) {
    esiti.push(condizioneVera({ dim: a.dimRif, min: null, max: null }, rifDi(d)).vera ? 'si' : 'no')
  } else if (a.min !== null && a.max !== null && a.max > 0) {
    if (a.dimRif === 5 || a.dimRif === 0) {
      const rif = a.dimRif === 5 ? (a.formula ? valutaFormula(a.formula, d) : null) : d.H
      esiti.push(rif === null ? 'ignota' : rif >= a.min && rif <= a.max ? 'si' : 'no')
    } else {
      const c = condizioneVera({ dim: a.dimRif, min: a.min, max: a.max }, rifDi(d))
      if (c.ignoto !== undefined) avviso = nonGestita(c.ignoto, a)
      esiti.push(c.ignoto !== undefined ? 'no' : c.vera ? 'si' : 'no')
    }
  }
  for (const cond of a.altreCondizioni ?? []) {
    const c = condizioneVera(cond, rifDi(d))
    if (c.ignoto !== undefined) avviso ??= nonGestita(c.ignoto, a)
    esiti.push(c.ignoto !== undefined ? 'no' : c.vera ? 'si' : 'no')
  }
  const alternative = a.condizioniAlternative && esiti.length > 1
  const vale = alternative ? esiti.some(e => e !== 'no') : esiti.every(e => e !== 'no')
  if (!vale) return avviso ?? { quantita: 0, ignota: false }
  // Formula non interpretata: si conta come da kit, segnalata (come prima).
  const ignotaFascia = esiti.includes('ignota') && !(alternative && esiti.includes('si'))
  if (ignotaFascia) return { quantita: a.quantita, ignota: true }
  const limita = (q: number) => (a.numMax && a.numMax > 0 ? Math.min(q, a.numMax) : q)
  if (a.tipo === 2 || a.tipo === 4) {
    const lung = a.formulaL ? valutaFormula(a.formulaL, d) : misura(a.dimCalcolo || 1, d)
    if (lung === null) return { quantita: a.quantita, ignota: true }
    return { quantita: (a.quantita * (lung + (a.corrMl ?? 0))) / 1000 * MAGGIORAZIONE_METRO, ignota: false }
  }
  // Metro quadro (tipo 3, tapparelle): quantita' x L x H delle formule della riga, senza maggiorazione.
  // 117-26G voce 8: TAPPALL.FG LFormula 2312, HFormula 2000 = 4,624 m² x 37 EUR = 171,09 (come FP PRO).
  if (a.tipo === 3) {
    const l = a.formulaL ? valutaFormula(a.formulaL, d) : d.L
    const h = a.formulaH ? valutaFormula(a.formulaH, d) : d.H
    if (l === null || h === null) return { quantita: a.quantita, ignota: true }
    return { quantita: (a.quantita * l * h) / 1e6, ignota: false }
  }
  if (a.passo !== null && a.passo > 0) {
    const rif = a.dimDistribuzione === 5
      ? (a.formulaDistribuzione ? valutaFormula(a.formulaDistribuzione, d) : null)
      : misura(a.dimDistribuzione || 3, d)
    if (rif === null) return { quantita: a.quantita, ignota: true }
    return { quantita: limita(Math.max(a.quantita, Math.round(rif / a.passo))), ignota: false }
  }
  return { quantita: limita(a.quantita), ignota: false }
}

/** La riga vale per la mano della voce? 0 = sempre; 1 = destra; 2 = sinistra. Senza mano: destra. */
const valePerMano = (a: AccessorioStruttura, mano: 'sx' | 'dx' | null | undefined) =>
  !a.apertura || a.apertura === ((mano ?? 'dx') === 'dx' ? 1 : 2)

export function accessoriVoce(
  albero: NodoStruttura[],
  kitScelti: Record<string, boolean>,
  zone: Record<number, { L: number; H: number }>,
  peso: number,
  regole: RegoleAccessori,
  /** Scelte fatte nella voce sugli accessori opzionali (chiaveAccessorio); assente = come FP PRO */
  accessoriScelti: Record<string, boolean> = {},
  opzioni: OpzioniAccessori = {},
): QuantitaAccessorio[] {
  const trovati: QuantitaAccessorio[] = []
  const avvisi: QuantitaAccessorio[] = []
  const espliciti = new Set<string>()
  const usa = (a: AccessorioStruttura, d: Misure) => {
    if (!valePerMano(a, opzioni.mano)) return
    // Righe con misure dell'anta scorrevole (22-24): FP PRO le conta una volta per ogni anta scorrevole.
    const perScorrevole = [a.dimRif, ...(a.altreCondizioni ?? []).map(c => c.dim)].some(x => x >= 22 && x <= 24)
    const scorrevoli = d.rif?.scorrevoli ?? []
    const esiti = perScorrevole && scorrevoli.length > 1
      ? scorrevoli.map(s => quantitaDi(a, { ...d, rif: { ...rifDi(d), scorrevoli: [s] } }))
      : [quantitaDi(a, d)]
    const quantita = esiti.reduce((t, e) => t + e.quantita, 0)
    const ignota = esiti.some(e => e.ignota)
    const avviso = esiti.find(e => e.avviso)?.avviso
    const metri = a.tipo === 2 || a.tipo === 4
    const mq = a.tipo === 3
    if (avviso) avvisi.push({ codice: a.codice, serie: a.serie, descrizione: a.descrizione, quantita: 0, metri, mq, regolaIgnota: false, avviso })
    if (quantita > 0) trovati.push({ codice: a.codice, serie: a.serie, descrizione: a.descrizione, quantita, metri, mq, regolaIgnota: ignota })
  }
  // Righe parametriche (es. cilindro 25/30/35): una sola per parametro del kit. Senza valore
  // scelto vale il primo incontrato, mai tutti insieme.
  const parametriPresi = new Map<string, string>()
  const valeParametro = (a: AccessorioStruttura, chiaveKitNodo: string) => {
    if (!a.parametro) return true
    const chiave = `${chiaveKitNodo}:${a.parametro.codice.toLowerCase()}`
    const preso = parametriPresi.get(chiave)
    if (preso === undefined) {
      parametriPresi.set(chiave, a.parametro.valore)
      return true
    }
    return preso === a.parametro.valore
  }
  /** Ante del nodo o del primo discendente che le ha (un kit del telaio puo' guardare il peso dell'anta). */
  const anteDi = (n: NodoStruttura): { ante: MisuraAnta[]; scorrevoli: MisuraAnta[] } | null =>
    opzioni.ante?.[n.codice] ?? n.figli.map(anteDi).find(x => x !== null) ?? null
  const scelto = (a: AccessorioStruttura, chiave: string) => !a.opzionale || (accessoriScelti[chiave] ?? a.confermato)
  const valePerSerie = (kit: string, codice: string) => {
    const serie = regole.serieRigaKit(kit, codice)
    return serie === null || serie.some(s => regole.serieStruttura.includes(s))
  }
  const visita = (nodi: NodoStruttura[], ereditata: { L: number; H: number }) => {
    for (const n of nodi) {
      const z = zone[n.codice] ?? ereditata
      // Nodo anta di FP PRO che contiene piu' ante (2 ante = 8 profili d'anta): larghezza di una.
      const profiliAnta = n.pezzi.filter(p => p.tipo === 8090 || p.tipo === 8100).length
      const ante = profiliAnta >= 4 ? Math.round(profiliAnta / 4) : 1
      // Senza misure delle ante dal calcolo: ante uguali, peso del serramento diviso fra le ante.
      const uguali = Array.from({ length: ante }, () => ({ l: z.L / ante, h: z.H, peso: peso / ante }))
      const misureAnte = anteDi(n) ?? { ante: n.tipo === 8620 ? [] : uguali, scorrevoli: n.tipo === 8620 ? uguali : [] }
      const rif: MisureRif = { L: z.L, H: z.H, peso, ...misureAnte }
      const d: Misure = { L: z.L, H: z.H, w: peso, h: z.H, a: z.L / ante, rif }
      for (const a of n.accessori) {
        espliciti.add(a.codice)
        if (scelto(a, chiaveAccessorio(n.codice, null, a.codice)) && valeParametro(a, `${n.codice}:a`)) usa(a, d)
      }
      n.kit.forEach((k, i) => {
        const kitScelto = !k.opzionale || (kitScelti[`${n.codice}:${i}`] ?? k.confermato)
        if (!kitScelto) return
        const righe = k.accessori.length > 0 ? k.accessori : regole.righeCatalogo(k.codice)
        // Kit per anta (CodiceMacro = 1, es. cerniere ES40): le righe si contano su ogni anta,
        // con le misure di quell'anta (una cerniera ogni 600 mm della sua altezza).
        const anteKit = k.perAnta ? (misureAnte.ante.length > 0 ? misureAnte.ante : misureAnte.scorrevoli) : []
        const misurePer = anteKit.length > 0 ? anteKit.map(an => ({ ...d, L: an.l, H: an.h, h: an.h, a: an.l })) : [d]
        for (const a of righe) {
          espliciti.add(a.codice)
          if (!(scelto(a, chiaveAccessorio(n.codice, i, a.codice)) && valePerSerie(k.codice, a.codice) && valeParametro(a, `${n.codice}:${i}`))) continue
          for (const dd of misurePer) usa(a, dd)
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
  return [...out, ...avvisi]
}
