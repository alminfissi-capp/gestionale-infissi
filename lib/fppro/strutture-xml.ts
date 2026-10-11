/**
 * Lettura delle strutture (.STR) di FP PRO.
 *
 * Lo usa il ponte (Node, senza build): NESSUN import. Il ponte passa qui l'oggetto
 * prodotto da `new XMLParser(OPZIONI_XML).parse(testo)` di fast-xml-parser.
 *
 * Codici tipo (tabella tipi_utilizzi di FP PRO): 8050 telaio, 8060 montante,
 * 8070 traverso, 8090 anta battente, 8100 anta scorrevole, 8180 fermavetro,
 * 8500 pannello, 8510 vetro; nodi "macro": 8600 telaio, 8610 battente,
 * 8620 scorrevole, 8650 riempimento; -1 = foglia vuota.
 */

const RIPETUTI = new Set([
  'FP_NODE', 'FP_PIECE', 'FP_FITTING', 'FP_KIT', 'FP_PRM', 'FP_PRM_VAR', 'FP_IRD',
  'FP_MACRO_SASH', 'FP_PREV_PIECE', 'FP_VERTEX', 'FP_PATH_VERTEX', 'FP_VAR',
])

export const OPZIONI_XML = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
  isArray: (nome: string, _percorso: string, _foglia: boolean, attributo: boolean) =>
    !attributo && RIPETUTI.has(nome),
}

export interface PezzoStruttura {
  tipo: number
  dxf: string
  /** Cartella DXF in maiuscolo = nome della serie in FP PRO (es. AL_50PLU) */
  serie: string
  /** Anta a cui appartiene il pezzo nei nodi con piu' ante (ElementIndex) */
  indice: number
}

export interface AccessorioStruttura {
  codice: string
  descrizione: string
  serie: string
  /** 1 = a pezzo, 2/4 = a metro */
  tipo: number
  quantita: number
  dimRif: number
  dimCalcolo: number
  min: number | null
  max: number | null
  passo: number | null
  formula: string | null
  opzionale: boolean
  confermato: boolean
}

export interface KitStruttura {
  codice: string
  descrizione: string
  serie: string
  opzionale: boolean
  /** Per i kit opzionali: quello scelto nella struttura */
  confermato: boolean
  accessori: AccessorioStruttura[]
}

export interface NodoStruttura {
  tipo: number
  codice: number
  /** Numero di elementi (es. ante) del nodo */
  elementi: number
  x: number | null
  y: number | null
  prm: { nome: string; variabili: Record<string, number> }[]
  macro: Record<string, string> | null
  ante: Record<string, string>[]
  ird: string[]
  pezzi: PezzoStruttura[]
  accessori: AccessorioStruttura[]
  kit: KitStruttura[]
  figli: NodoStruttura[]
}

export interface StrutturaLetta {
  codice: string | null
  descrizione: string | null
  lNominale: number | null
  hNominale: number | null
  serie: string[]
  albero: NodoStruttura[]
  /** Un poligono per pezzo, piatto: [x1, y1, x2, y2, ...] */
  poligoni: number[][]
  immagineBase64: string | null
}

type Ogg = Record<string, unknown>

const ogg = (v: unknown): Ogg => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Ogg) : {})
const lista = (v: unknown): Ogg[] => (Array.isArray(v) ? v.map(ogg) : v === undefined || v === '' ? [] : [ogg(v)])
const testo = (v: unknown): string | null => {
  if (v === undefined || v === null) return null
  // Postgres rifiuta il carattere nullo (U+0000) in text e jsonb: uno solo bloccherebbe la sync.
  const s = String(v).replace(/\u0000/g, '').trim()
  return s === '' ? null : s
}
const num = (v: unknown): number | null => {
  const s = testo(v)
  if (s === null) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const vero = (v: unknown): boolean => {
  const n = num(v)
  return n !== null && n !== 0
}
const tondo = (n: number) => Math.round(n * 10) / 10

function serieDaDxf(dxf: string): string {
  const i = dxf.indexOf('\\')
  return i > 0 ? dxf.slice(0, i).toUpperCase() : ''
}

function daBase64(b64: string): string | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''))
    const byte = Uint8Array.from(bin, c => c.charCodeAt(0))
    return testo(new TextDecoder('windows-1252').decode(byte))
  } catch {
    return null
  }
}

function attributi(o: Ogg): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string') out[k] = v
  return out
}

function accessorio(f: Ogg): AccessorioStruttura {
  return {
    codice: testo(f.Code) ?? '',
    descrizione: testo(f.Description) ?? '',
    serie: testo(f.Serie) ?? '',
    tipo: num(f.Type) ?? 1,
    quantita: num(f.Multiply) ?? 1,
    dimRif: num(f.RefDim) ?? 0,
    dimCalcolo: num(f.CalcDim) ?? 0,
    min: num(f.RMin),
    max: num(f.RMax),
    passo: num(f.Step),
    formula: testo(f.RFormula),
    opzionale: vero(f.Optional),
    confermato: f.Confirmed === undefined ? true : vero(f.Confirmed),
  }
}

function nodo(n: Ogg): NodoStruttura {
  const macro = lista(n.FP_MACRO)[0]
  return {
    tipo: num(n.ElementType) ?? -1,
    codice: num(n.Code) ?? 0,
    elementi: num(n.ElementNumber) ?? 1,
    x: num(n.xinsert),
    y: num(n.yinsert),
    prm: lista(n.FP_PRM).map(p => ({
      nome: testo(p.Name) ?? '',
      variabili: Object.fromEntries(
        lista(p.FP_PRM_VAR).map(v => [testo(v.VarName) ?? '', num(v.VarValue) ?? 0]),
      ),
    })),
    macro: macro ? attributi(macro) : null,
    ante: macro ? lista(macro.FP_MACRO_SASH).map(attributi) : [],
    ird: lista(n.FP_IRD).map(i => testo(i.FileName) ?? ''),
    pezzi: lista(n.FP_PIECE).map(p => {
      const dxf = testo(p.DXF) ?? ''
      return { tipo: num(p.Type) ?? 0, dxf, serie: serieDaDxf(dxf), indice: num(p.ElementIndex) ?? 0 }
    }),
    accessori: lista(n.FP_FITTING).map(accessorio),
    kit: lista(n.FP_KIT).map(k => ({
      codice: testo(k.Code) ?? '',
      descrizione: testo(k.Description) ?? '',
      serie: testo(k.Serie) ?? '',
      opzionale: vero(k.Optional),
      confermato: k.Confirmed === undefined ? true : vero(k.Confirmed),
      accessori: lista(k.FP_FITTING).map(accessorio),
    })),
    figli: lista(n.FP_NODE).map(nodo),
  }
}

function tuttiPezzi(nodi: NodoStruttura[]): PezzoStruttura[] {
  return nodi.flatMap(n => [...n.pezzi, ...tuttiPezzi(n.figli)])
}

/** Serie = cartelle DXF dei profili di telaio; in mancanza, delle ante; poi di qualunque profilo. */
function serieStruttura(albero: NodoStruttura[]): string[] {
  const pezzi = tuttiPezzi(albero)
  const esclusi = new Set(['', 'GLASSES', 'PANELS'])
  const da = (tipi: number[] | null) => [...new Set(
    pezzi.filter(p => (tipi === null || tipi.includes(p.tipo)) && !esclusi.has(p.serie)).map(p => p.serie),
  )]
  for (const tipi of [[8050], [8090, 8100], null]) {
    const s = da(tipi)
    if (s.length > 0) return s
  }
  return []
}

function ingombro(punti: number[][]): { l: number; h: number } | null {
  const xs = punti.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = punti.flatMap(p => p.filter((_, i) => i % 2 === 1))
  if (xs.length === 0) return null
  return { l: tondo(Math.max(...xs) - Math.min(...xs)), h: tondo(Math.max(...ys) - Math.min(...ys)) }
}

export function strutturaDaXml(doc: unknown): StrutturaLetta {
  const radice = ogg(doc).FP_TREE
  if (radice === undefined) throw new Error('Non e\' una struttura di FP PRO: manca FP_TREE')
  const t = ogg(radice)

  const albero = lista(t.FP_NODE).map(nodo)
  const anteprima = ogg(t.FP_PREVIEW)
  const poligoni = lista(anteprima.FP_PREV_PIECE)
    .map(p => lista(p.FP_VERTEX).flatMap(v => [tondo(num(v.x) ?? 0), tondo(num(v.y) ?? 0)]))
    .filter(p => p.length >= 6)

  // Misure nominali: variabili L/H del modello del telaio, altrimenti ingombro dell'anteprima.
  const modello = albero.flatMap(n => n.prm).find(p => p.variabili.L !== undefined && p.variabili.H !== undefined)
  const percorso = lista(anteprima.FP_PATH_VERTEX).map(v => [num(v.x) ?? 0, num(v.y) ?? 0])
  const misure = modello
    ? { l: modello.variabili.L, h: modello.variabili.H }
    : ingombro(percorso.length > 0 ? [percorso.flat()] : poligoni)

  const descrizione = ogg(t.FP_DESCRIPTION)
  const cdata = testo(descrizione.__cdata)

  return {
    codice: testo(t.NameStr),
    descrizione: cdata === null ? null : descrizione.DescrB64 !== undefined ? daBase64(cdata) : cdata,
    lNominale: misure?.l ?? null,
    hNominale: misure?.h ?? null,
    serie: serieStruttura(albero),
    albero,
    poligoni,
    immagineBase64: testo(ogg(t.picture).__cdata),
  }
}
