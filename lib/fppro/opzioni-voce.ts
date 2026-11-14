// Opzioni semplici della voce (spec 2026-10-25-opzioni-semplici-voce-design.md): dai kit
// facoltativi della struttura a poche domande chiare. Le scelte si salvano come sempre in
// fp.kit e fp.accessori: il calcolo non cambia. Funzioni pure, usate dal telefono (offline).
import type { NodoStruttura, KitStruttura } from './strutture-xml'
import { chiaveKit } from './kit-catalogo'
import { chiaveNomeKit, nomiBreviGruppo, sigla, titoloGruppo } from './nomi-brevi'

export { titoloGruppo }
import type { AccessorioOpzionale, GruppoAccessoriOpzionali } from './rilievo-fp'

const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])

export type TipoDomanda = 'unica' | 'facoltativa' | 'multipla'

export interface KitVoce {
  /** `${nodo}:${indice}`: chiave di fp.kit */
  chiave: string
  nodo: number
  codice: string
  descrizione: string
  /** Confermato nella struttura di FP PRO */
  predefinito: boolean
  /** Nome breve da cantiere (nomi-brevi.ts, o corretto a mano) */
  nome: string
  /** Variante di lato del kit (…-DX / …-SX): il lato lo decide la mano della voce */
  lato: 'dx' | 'sx' | null
}

export interface Domanda {
  id: string
  titolo: string
  tipo: TipoDomanda
  /** Sigla del gruppo di FP PRO per l'ordine ("01A", "01B"…; "99" senza sigla) */
  ordine: string
  kit: KitVoce[]
}

export interface SchemaOpzioni {
  domande: Domanda[]
  /** Aggiunte vere senza alternative: caselle si'/no */
  altre: KitVoce[]
  /** Kit base sempre attivi (confermati e senza alternative): solo in Avanzate */
  base: KitVoce[]
}

/** Famiglie riconosciute dal nome, solo per i kit senza gruppo di FP PRO (es. Easy Door). */
const FAMIGLIE_NOME: [RegExp, string][] = [
  [/SERR/i, 'Serratura'],
  [/CERN|PIVOT/i, 'Cerniere'],
  [/MANIGL|MARTELL|CREMON|EXENS/i, 'Maniglia'],
  [/\b\d\s*ANT[AE]\b/i, 'Tipo anta'],
]
export const famigliaDaNome = (k: Pick<KitStruttura, 'codice' | 'descrizione'>): string | null =>
  FAMIGLIE_NOME.find(([re]) => re.test(`${k.codice} ${k.descrizione}`))?.[1] ?? null

/** Lunghezza del prefisso comune (senza maiuscole): per ricondurre al gruppo un kit con nome storpiato. */
const prefissoComune = (a: string, b: string): number => {
  const x = chiaveKit(a)
  const y = chiaveKit(b)
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return i
}
const PREFISSO_STESSO_GRUPPO = 10

const tipoDaGruppo = (t: number | null | undefined): TipoDomanda => (t === 1 ? 'facoltativa' : t === 2 ? 'multipla' : 'unica')

/**
 * Domande della voce: una per gruppo di FP PRO, nell'ordine delle sigle (1A, 1B, 2A…), a scelta
 * unica dove FP PRO la vuole unica. `nomi` = nomi brevi corretti a mano (chiaveNomeKit -> nome).
 */
export function schemaOpzioni(albero: NodoStruttura[], nomi: Map<string, string> = new Map()): SchemaOpzioni {
  const domande: Domanda[] = []
  const altre: KitVoce[] = []
  const base: KitVoce[] = []
  for (const n of tutti(albero)) {
    const facoltativi = n.kit.map((k, i) => ({ k, i })).filter(x => x.k.opzionale)
    if (facoltativi.length === 0) continue
    const voce = ({ k, i }: { k: KitStruttura; i: number }, nome?: string): KitVoce => ({
      chiave: `${n.codice}:${i}`, nodo: n.codice, codice: k.codice, descrizione: k.descrizione, predefinito: k.confermato,
      nome: nomi.get(chiaveNomeKit(k.codice)) ?? nome ?? k.descrizione ?? k.codice, lato: latoDi(k.codice),
    })
    // 1. Gruppi di FP PRO; un kit senza gruppo con lo stesso inizio di nome di un kit di un gruppo
    //    (es. "2AR-SORMONTO-RISTUTT", nome storpiato) entra in quel gruppo.
    const gruppoDi = new Map<number, number>()
    for (const x of facoltativi) if (x.k.gruppo) gruppoDi.set(x.i, x.k.gruppo)
    for (const x of facoltativi) {
      if (gruppoDi.has(x.i)) continue
      const simile = facoltativi.find(y => y.k.gruppo && prefissoComune(y.k.codice, x.k.codice) >= PREFISSO_STESSO_GRUPPO)
      if (simile?.k.gruppo) gruppoDi.set(x.i, simile.k.gruppo)
    }
    const insiemi = new Map<string, { titolo: string; tipo: TipoDomanda; ordine: string; membri: typeof facoltativi }>()
    for (const x of facoltativi) {
      const g = gruppoDi.get(x.i)
      if (!g) continue
      const conNome = facoltativi.find(y => y.k.gruppo === g)?.k
      const e = insiemi.get(`g${g}`) ?? { titolo: titoloGruppo(conNome?.gruppoNome), tipo: tipoDaGruppo(conNome?.gruppoTipo), ordine: sigla(conNome?.gruppoNome), membri: [] }
      e.membri.push(x)
      insiemi.set(`g${g}`, e)
    }
    // 2. Senza gruppo: famiglie dal nome (Easy Door: serratura, cerniere, tipo anta).
    const senza = facoltativi.filter(x => !gruppoDi.has(x.i))
    for (const x of senza) {
      const f = famigliaDaNome(x.k)
      if (!f) continue
      const e = insiemi.get(`f${f}`) ?? { titolo: f, tipo: 'unica' as TipoDomanda, ordine: '98', membri: [] }
      e.membri.push(x)
      insiemi.set(`f${f}`, e)
    }
    // 3. Domande con almeno 2 kit; gli altri tornano singoli.
    const inDomanda = new Set<number>()
    for (const [chiave, e] of insiemi) {
      if (e.membri.length < 2) continue
      const brevi = nomiBreviGruppo(e.membri.map(m => ({ codice: m.k.codice, descrizione: m.k.descrizione })))
      const kit = e.membri.map((m, j) => voce(m, brevi[j]))
      domande.push({ id: `${n.codice}:${chiave}`, titolo: e.titolo, tipo: e.tipo, ordine: e.ordine, kit })
      e.membri.forEach(m => inDomanda.add(m.i))
    }
    for (const x of facoltativi) {
      if (inDomanda.has(x.i)) continue
      ;(x.k.confermato ? base : altre).push(voce(x))
    }
  }
  // Ordine dei gruppi di FP PRO (1A, 1B, 2A…); titoli ripetuti (piu' nodi) numerati.
  domande.sort((a, b) => a.ordine.localeCompare(b.ordine))
  const visti = new Map<string, number>()
  for (const d of domande) {
    const n = (visti.get(d.titolo) ?? 0) + 1
    visti.set(d.titolo, n)
    if (n > 1) d.titolo = `${d.titolo} (${n})`
  }
  return { domande, altre, base }
}

export const kitAttivo = (k: KitVoce, scelte: Record<string, boolean>): boolean => scelte[k.chiave] ?? k.predefinito

/** Kit scelto in una domanda a scelta unica (il primo attivo; null = nessuno). */
export const sceltoIn = (d: Domanda, scelte: Record<string, boolean>): KitVoce | null => d.kit.find(k => kitAttivo(k, scelte)) ?? null

/** Scelta unica: quel kit acceso, gli altri della domanda spenti (null = nessuno, solo se facoltativa). */
export function scegliKit(d: Domanda, chiave: string | null, scelte: Record<string, boolean>): Record<string, boolean> {
  const out = { ...scelte }
  for (const k of d.kit) out[k.chiave] = k.chiave === chiave
  return out
}

const LATO = /(^|[-_ ])(DX|SX)([-_ ]|$)/i
export const latoDi = (codice: string): 'dx' | 'sx' | null => {
  const m = codice.match(LATO)
  return m ? (m[2].toLowerCase() as 'dx' | 'sx') : null
}
/** Risposte da mostrare: le varianti di lato solo per la mano della voce (senza mano: destra). */
export const risposte = (d: Domanda, mano: 'sx' | 'dx' | null): KitVoce[] =>
  d.kit.filter(k => k.lato === null || k.lato === (mano ?? 'dx'))

/** La stessa risposta per l'altro lato (F2-DK-SCF-DX <-> F2-DK-SCF-SX). */
const gemello = (d: Domanda, k: KitVoce, lato: 'dx' | 'sx'): KitVoce | null =>
  d.kit.find(x => x.lato === lato && x.codice.replace(LATO, '$1$3').toUpperCase() === k.codice.replace(LATO, '$1$3').toUpperCase()) ?? null

/**
 * Riallinea le varianti di lato alla mano della voce (senza mano: destra), in tutte le domande:
 * la risposta scelta resta la stessa, cambia solo il lato. Mai due lati accesi insieme.
 */
export function riallineaMano(schema: SchemaOpzioni, scelte: Record<string, boolean>, mano: 'sx' | 'dx' | null): Record<string, boolean> {
  let out = scelte
  const voluto = mano ?? 'dx'
  for (const d of schema.domande) {
    if (d.tipo === 'multipla' || !d.kit.some(k => k.lato)) continue
    const accesi = d.kit.filter(k => kitAttivo(k, out))
    const attuale = accesi.find(k => k.lato === voluto) ?? accesi[0]
    if (!attuale) continue
    const giusto = attuale.lato && attuale.lato !== voluto ? gemello(d, attuale, voluto) ?? attuale : attuale
    out = scegliKit(d, giusto.chiave, out)
  }
  return out
}

/** Domande con piu' di un kit acceso dove se ne vuole uno (voci salvate prima, o scelte in Avanzate). */
export const domandeDoppie = (schema: SchemaOpzioni, scelte: Record<string, boolean>): Domanda[] =>
  schema.domande.filter(d => d.tipo !== 'multipla' && d.kit.filter(k => kitAttivo(k, scelte)).length > 1)

// ---- Accessori facoltativi dentro un kit ----

export interface DomandaAccessori {
  id: string
  titolo: string
  tipo: TipoDomanda
  accessori: AccessorioOpzionale[]
}

/** Accessori facoltativi di un kit raggruppati per gruppo di FP PRO; senza gruppo = caselle. */
export function domandeAccessori(g: GruppoAccessoriOpzionali): { domande: DomandaAccessori[]; caselle: AccessorioOpzionale[] } {
  const perGruppo = new Map<number, AccessorioOpzionale[]>()
  for (const a of g.accessori) if (a.gruppo) perGruppo.set(a.gruppo, [...(perGruppo.get(a.gruppo) ?? []), a])
  const domande: DomandaAccessori[] = []
  const inDomanda = new Set<string>()
  for (const [gruppo, accessori] of perGruppo) {
    if (accessori.length < 2) continue
    const primo = accessori[0]
    const tipo = tipoDaGruppo(primo.gruppoTipo) as DomandaAccessori['tipo']
    domande.push({ id: `${g.kit ?? g.titolo}:a${gruppo}`, titolo: titoloGruppo(primo.gruppoNome), tipo, accessori })
    accessori.forEach(a => inDomanda.add(a.chiave))
  }
  return { domande, caselle: g.accessori.filter(a => !inDomanda.has(a.chiave)) }
}

export const accessorioAttivo = (a: AccessorioOpzionale, scelte: Record<string, boolean> | undefined): boolean => scelte?.[a.chiave] ?? a.predefinito

export function scegliAccessorio(d: DomandaAccessori, chiave: string | null, scelte: Record<string, boolean> | undefined): Record<string, boolean> {
  const out = { ...(scelte ?? {}) }
  for (const a of d.accessori) out[a.chiave] = a.chiave === chiave
  return out
}

// ---- Colori accessori ----

export interface AccessorioAColore { codice: string; colori: number[]; generale: boolean }

/** Codici degli accessori a colore della voce: sciolti dei nodi + kit attivi (obbligatori o scelti). */
export function codiciAColore(albero: NodoStruttura[], scelte: Record<string, boolean>): string[] {
  const out = new Set<string>()
  for (const n of tutti(albero)) {
    n.codiciColore?.forEach(c => out.add(c))
    n.kit.forEach((k, i) => {
      const attivo = !k.opzionale || (scelte[`${n.codice}:${i}`] ?? k.confermato)
      if (attivo) k.codiciColore?.forEach(c => out.add(c))
    })
  }
  return [...out]
}

/** Per ogni colore accessori: quanti accessori a colore della voce copre (solo quelli che ne coprono almeno uno). */
export function coperturaColori(codici: string[], mappa: Map<string, AccessorioAColore>): Map<number, number> {
  const out = new Map<number, number>()
  for (const c of codici) for (const id of mappa.get(c)?.colori ?? []) out.set(id, (out.get(id) ?? 0) + 1)
  return out
}

/** Accessori a colore che nessun colore scelto copre; `generale` = il calcolo usera' il prezzo generale. */
export function accessoriScoperti(codici: string[], colori: number[], mappa: Map<string, AccessorioAColore>): AccessorioAColore[] {
  return codici
    .map(c => mappa.get(c))
    .filter((a): a is AccessorioAColore => !!a && !a.colori.some(id => colori.includes(id)))
}
