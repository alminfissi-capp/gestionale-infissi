// Opzioni semplici della voce (spec 2026-10-25-opzioni-semplici-voce-design.md): dai kit
// facoltativi della struttura a poche domande chiare. Le scelte si salvano come sempre in
// fp.kit e fp.accessori: il calcolo non cambia. Funzioni pure, usate dal telefono (offline).
import type { NodoStruttura, KitStruttura } from './strutture-xml'
import { chiaveKit } from './kit-catalogo'
import type { AccessorioOpzionale, GruppoAccessoriOpzionali } from './rilievo-fp'

const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])

export type FamigliaCerniera = 'vista' | 'scomparsa'
export type TipoDomanda = 'unica' | 'facoltativa' | 'multipla' | 'cerniere'

export interface KitVoce {
  /** `${nodo}:${indice}`: chiave di fp.kit */
  chiave: string
  nodo: number
  codice: string
  descrizione: string
  /** Confermato nella struttura di FP PRO */
  predefinito: boolean
  famiglia: FamigliaCerniera
}

export interface Domanda {
  id: string
  titolo: string
  tipo: TipoDomanda
  kit: KitVoce[]
}

export interface SchemaOpzioni {
  domande: Domanda[]
  /** Aggiunte vere senza alternative: caselle si'/no */
  altre: KitVoce[]
  /** Kit base sempre attivi (confermati e senza alternative): solo in Avanzate */
  base: KitVoce[]
}

const SCOMPARSA = /SCOMPARSA|SECRET|(^|[-_ ])SCF([-_ ]|$)/i
const famigliaDi = (k: Pick<KitStruttura, 'codice' | 'descrizione'>): FamigliaCerniera =>
  SCOMPARSA.test(`${k.codice} ${k.descrizione}`) ? 'scomparsa' : 'vista'

/** Famiglie riconosciute dal nome, solo per i kit senza gruppo di FP PRO (es. Easy Door). */
const FAMIGLIE_NOME: [RegExp, string][] = [
  [/SERR/i, 'Serratura'],
  [/CERN|PIVOT/i, 'Cerniere'],
  [/MANIGL|MARTELL|CREMON|EXENS/i, 'Maniglia'],
  [/\b\d\s*ANT[AE]\b/i, 'Tipo anta'],
]
export const famigliaDaNome = (k: Pick<KitStruttura, 'codice' | 'descrizione'>): string | null =>
  FAMIGLIE_NOME.find(([re]) => re.test(`${k.codice} ${k.descrizione}`))?.[1] ?? null

/** "1B -SCELTA CERNIERA 2 A/R" -> "Cerniera 2 A/R" */
export function titoloGruppo(nome: string | null | undefined): string {
  let t = (nome ?? '').trim().replace(/^\d*[A-Z]?\s*-\s*/i, '').replace(/^SCELTA\s+/i, '').replace(/^TIPO\s+/i, '').trim()
  if (!t) return 'Scelta'
  t = t.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

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

export function schemaOpzioni(albero: NodoStruttura[]): SchemaOpzioni {
  const domande: Domanda[] = []
  const altre: KitVoce[] = []
  const base: KitVoce[] = []
  for (const n of tutti(albero)) {
    const facoltativi = n.kit.map((k, i) => ({ k, i })).filter(x => x.k.opzionale)
    if (facoltativi.length === 0) continue
    const voce = ({ k, i }: { k: KitStruttura; i: number }): KitVoce => ({
      chiave: `${n.codice}:${i}`, nodo: n.codice, codice: k.codice, descrizione: k.descrizione, predefinito: k.confermato, famiglia: famigliaDi(k),
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
    const insiemi = new Map<string, { titolo: string; tipo: TipoDomanda; membri: typeof facoltativi }>()
    for (const x of facoltativi) {
      const g = gruppoDi.get(x.i)
      if (!g) continue
      const conNome = facoltativi.find(y => y.k.gruppo === g)?.k
      const e = insiemi.get(`g${g}`) ?? { titolo: titoloGruppo(conNome?.gruppoNome), tipo: tipoDaGruppo(conNome?.gruppoTipo), membri: [] }
      e.membri.push(x)
      insiemi.set(`g${g}`, e)
    }
    // 2. Senza gruppo: famiglie dal nome (Easy Door: serratura, cerniere, tipo anta).
    const senza = facoltativi.filter(x => !gruppoDi.has(x.i))
    for (const x of senza) {
      const f = famigliaDaNome(x.k)
      if (!f) continue
      const e = insiemi.get(`f${f}`) ?? { titolo: f, tipo: 'unica' as TipoDomanda, membri: [] }
      e.membri.push(x)
      insiemi.set(`f${f}`, e)
    }
    // 3. Domande con almeno 2 kit; gli altri tornano singoli.
    const inDomanda = new Set<number>()
    for (const [chiave, e] of insiemi) {
      if (e.membri.length < 2) continue
      const kit = e.membri.map(voce)
      const famiglie = new Set(kit.map(k => k.famiglia))
      const cerniere = e.tipo !== 'multipla' && famiglie.size === 2
      domande.push({ id: `${n.codice}:${chiave}`, titolo: cerniere ? 'Cerniere' : e.titolo, tipo: cerniere ? 'cerniere' : e.tipo, kit })
      e.membri.forEach(m => inDomanda.add(m.i))
    }
    for (const x of facoltativi) {
      if (inDomanda.has(x.i)) continue
      ;(x.k.confermato ? base : altre).push(voce(x))
    }
  }
  // Cerniere per prime; titoli ripetuti (piu' nodi) numerati.
  domande.sort((a, b) => Number(b.tipo === 'cerniere') - Number(a.tipo === 'cerniere'))
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
const parole = (codice: string) => chiaveKit(codice).split(/[-_ ]+/).filter(p => p && !/^(SCOMPARSA|SCF|SECRET|DX|SX)$/.test(p))

/**
 * Variante tecnica di una famiglia (a vista / a scomparsa), come la sceglierebbe chi conosce
 * FP PRO: 1) il lato della mano della voce, se le varianti cambiano per DX/SX (senza mano: il
 * lato del kit confermato, poi DX); 2) il kit confermato; 3) quello piu' simile al confermato
 * (complanare/sormonto, -DS/-RISTRUTT, maniglia 7.5); 4) il primo.
 */
export function varianteFamiglia(d: Domanda, famiglia: FamigliaCerniera, mano: 'sx' | 'dx' | null): KitVoce | null {
  let candidati = d.kit.filter(k => k.famiglia === famiglia)
  if (candidati.length === 0) return null
  const confermato = d.kit.find(k => k.predefinito) ?? null
  const lati = new Set(candidati.map(k => latoDi(k.codice)).filter(Boolean))
  if (lati.size > 1) {
    const voluto = mano ?? (confermato ? latoDi(confermato.codice) : null) ?? 'dx'
    const stessoLato = candidati.filter(k => latoDi(k.codice) === voluto)
    if (stessoLato.length > 0) candidati = stessoLato
  }
  const conf = candidati.find(k => k.predefinito)
  if (conf) return conf
  if (confermato) {
    const rif = new Set(parole(confermato.codice))
    const punti = (k: KitVoce) => parole(k.codice).filter(p => rif.has(p)).length
    return [...candidati].sort((a, b) => punti(b) - punti(a))[0]
  }
  return candidati[0]
}

export function scegliFamiglia(d: Domanda, famiglia: FamigliaCerniera, mano: 'sx' | 'dx' | null, scelte: Record<string, boolean>): Record<string, boolean> {
  const k = varianteFamiglia(d, famiglia, mano)
  return k ? scegliKit(d, k.chiave, scelte) : scelte
}

/** Cambiando la mano della voce, le cerniere DX/SX si riallineano (stessa famiglia). */
export function riallineaMano(schema: SchemaOpzioni, scelte: Record<string, boolean>, mano: 'sx' | 'dx' | null): Record<string, boolean> {
  let out = scelte
  for (const d of schema.domande) {
    if (d.tipo !== 'cerniere' || !mano) continue
    const attuale = sceltoIn(d, out)
    if (!attuale) continue
    const lato = latoDi(attuale.codice)
    if (lato && lato !== mano) out = scegliFamiglia(d, attuale.famiglia, mano, out)
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
  tipo: Exclude<TipoDomanda, 'cerniere'>
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
