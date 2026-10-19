// Dal disegno (forma + albero delle zone) a zone e pezzi da disegnare e da assegnare.
// Le zone si dividono all'asse dei profili, come le quote di FP PRO; gli spessori qui
// sono solo per il disegno (in ufficio i profili veri decidono le misure).
import type { Apertura, DisegnoGrafico, Materiale, Pt, RuoloPezzo, Zona } from '@/types/rilievo-grafico'
import { contornoForma, ingombro, lunghezzaLato, puntiLato } from './forma'
import type { LatoContorno } from './prm'

/** Spessori di disegno, mm (fascia vista del profilo) */
export const SPESSORE = { telaio: 70, divisione: 70, anta: 60, riporto: 30, fermo: 20 } as const

/** Di che pezzo e' il bordo che parte da un vertice, e quanto e' coperto dai profili */
export interface Bordo { tag: string; copertura: number }
export interface Poligono { p: Pt[]; b: Bordo[] }

export interface ZonaCalcolata {
  id: string
  poligono: Poligono
  profondita: number
  /** Zona finale (vuota o riempita) */
  foglia: boolean
  materiale: Materiale | null
  numero: number
}

export interface PezzoCalcolato {
  id: string
  ruolo: RuoloPezzo
  nome: string
  /** Linee del pezzo (all'asse per montanti e traversi, sul bordo per gli altri) */
  tratti: Pt[][]
  /** Il pezzo si disegna con un tratto di questa larghezza, ritagliato su `clip` */
  larghezzaTratto: number
  clip: Pt[]
  profondita: number
  /** Elemento dell'albero a cui appartiene (divisione, anta, zona) o 'telaio' */
  elemento: string
  /** Lunghezza lungo l'asse o il bordo, mm (indicativa: i tagli veri dipendono dai profili) */
  lunghezza: number
}

export interface QuotaCalcolata {
  /** id del taglio (`${divisione}#${i}`) */
  id: string
  verso: 'montante' | 'traverso'
  valore: number
  da: 'inizio' | 'fine'
  posizione: Pt
}

export interface AntaCalcolata {
  id: string
  indice: number
  numero: number
  apertura: Apertura
  mano: 'sx' | 'dx' | null
  poligono: Pt[]
}

export interface DisegnoCalcolato {
  contorno: LatoContorno[]
  poligono: Pt[]
  larghezza: number
  altezza: number
  zone: ZonaCalcolata[]
  pezzi: PezzoCalcolato[]
  quote: QuotaCalcolata[]
  ante: AntaCalcolata[]
}

const EPS = 1e-6

/**
 * Taglia un poligono con la retta x = c (asse 'x') o y = c (asse 'y'). Restituisce la
 * parte prima (x <= c o y <= c) e quella dopo; i nuovi bordi sul taglio prendono `bordo`.
 */
export function taglia(pol: Poligono, asse: 'x' | 'y', c: number, bordo: Bordo): [Poligono, Poligono] {
  const k = (p: Pt) => (asse === 'x' ? p.x : p.y)
  const parte = (prima: boolean): Poligono => {
    const dentro = (p: Pt) => (prima ? k(p) <= c + EPS : k(p) >= c - EPS)
    const p: Pt[] = [], b: Bordo[] = []
    const n = pol.p.length
    for (let i = 0; i < n; i++) {
      const P = pol.p[i], Q = pol.p[(i + 1) % n], bi = pol.b[i]
      const inP = dentro(P), inQ = dentro(Q)
      const inter = (): Pt => {
        const t = (c - k(P)) / (k(Q) - k(P))
        return asse === 'x' ? { x: c, y: P.y + t * (Q.y - P.y) } : { x: P.x + t * (Q.x - P.x), y: c }
      }
      if (inP && inQ) { p.push(P); b.push(bi) }
      else if (inP && !inQ) { p.push(P); b.push(bi); p.push(inter()); b.push(bordo) }
      else if (!inP && inQ) { p.push(inter()); b.push(bi) }
    }
    // Via i vertici doppi (il bordo che resta e' quello del vertice che si tiene)
    const pp: Pt[] = [], bb: Bordo[] = []
    for (let i = 0; i < p.length; i++) {
      const prev = pp[pp.length - 1]
      if (prev && Math.abs(prev.x - p[i].x) < 1e-6 && Math.abs(prev.y - p[i].y) < 1e-6) { bb[bb.length - 1] = b[i]; continue }
      pp.push(p[i]); bb.push(b[i])
    }
    if (pp.length > 1 && Math.abs(pp[0].x - pp[pp.length - 1].x) < 1e-6 && Math.abs(pp[0].y - pp[pp.length - 1].y) < 1e-6) { pp.pop(); bb.pop() }
    return { p: pp, b: bb }
  }
  return [parte(true), parte(false)]
}

/** Tratto della retta x = c (o y = c) dentro il poligono: dal primo all'ultimo incrocio */
export function segmentoDentro(p: Pt[], asse: 'x' | 'y', c: number): [Pt, Pt] | null {
  const vals: number[] = []
  for (let i = 0; i < p.length; i++) {
    const P = p[i], Q = p[(i + 1) % p.length]
    const kp = asse === 'x' ? P.x : P.y, kq = asse === 'x' ? Q.x : Q.y
    if ((kp - c) * (kq - c) <= 0 && Math.abs(kq - kp) > EPS) {
      const t = (c - kp) / (kq - kp)
      vals.push(asse === 'x' ? P.y + t * (Q.y - P.y) : P.x + t * (Q.x - P.x))
    }
  }
  if (vals.length < 2) return null
  const a = Math.min(...vals), b = Math.max(...vals)
  return asse === 'x' ? [{ x: c, y: a }, { x: c, y: b }] : [{ x: a, y: c }, { x: b, y: c }]
}

export function puntoNelPoligono(q: Pt, p: Pt[]): boolean {
  let dentro = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j]
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

const baricentro = (p: Pt[]): Pt => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length })

/** Tratti consecutivi con lo stesso tag (un pezzo puo' averne piu' d'uno nelle forme rientranti) */
function trattiPerTag(pol: Poligono): Map<string, { tratti: Pt[][]; copertura: number }> {
  const n = pol.p.length
  const out = new Map<string, { tratti: Pt[][]; copertura: number }>()
  if (n === 0) return out
  // Si parte da un vertice dove cambia il tag, cosi' un pezzo non si spezza a cavallo dell'inizio.
  let inizio = 0
  for (let i = 0; i < n; i++) if (pol.b[i].tag !== pol.b[(i - 1 + n) % n].tag) { inizio = i; break }
  let corrente: Pt[] | null = null, tagCorrente = ''
  for (let s = 0; s < n; s++) {
    const i = (inizio + s) % n
    const { tag, copertura } = pol.b[i]
    if (tag !== tagCorrente || !corrente) {
      corrente = [pol.p[i]]
      tagCorrente = tag
      const r = out.get(tag) ?? { tratti: [], copertura }
      r.tratti.push(corrente)
      out.set(tag, r)
    }
    corrente.push(pol.p[(i + 1) % n])
  }
  return out
}

const lunghezzaTratti = (t: Pt[][]) => t.reduce((s, l) => s + l.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - l[i].x, q.y - l[i].y), 0), 0)

/** Nome di un lato rispetto al centro della sua zona: sinistro, superiore, inclinato... */
export function nomeLato(tratti: Pt[][], centro: Pt): string {
  const tutti = tratti.flat()
  if (tutti.length < 2) return ''
  const a = tratti[0][0], b = tratti[tratti.length - 1][tratti[tratti.length - 1].length - 1]
  const m = baricentro(tutti)
  const curvo = tratti.some(t => t.length > 2)
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
  let nome: string
  if (curvo && tratti.length === 1 && tratti[0].length > 3 && Math.hypot(b.x - a.x, b.y - a.y) < 1) nome = 'circolare'
  else if (dy > dx) nome = m.x < centro.x ? 'sinistro' : 'destro'
  else nome = m.y > centro.y ? 'superiore' : 'inferiore'
  if (curvo) return `${nome} (arco)`
  const angolo = Math.atan2(dy, dx) * 180 / Math.PI
  if (angolo > 1 && angolo < 89) return `${nome} (inclinato)`
  return nome
}

const NOMI_RUOLO: Record<RuoloPezzo, string> = {
  telaio: 'Telaio', montante: 'Montante', traverso: 'Traverso', anta: 'Anta', anta_scorrevole: 'Anta scorrevole',
  riporto: 'Riporto', fermavetro: 'Fermavetro', fermapannello: 'Fermapannello',
}
export const nomeRuolo = (r: RuoloPezzo) => NOMI_RUOLO[r]

/** Posizioni dei tagli (all'asse) dentro l'ingombro [inizio, fine] della zona */
export function posizioniTagli(
  pos: { modo: 'uguali' } | { modo: 'quote'; da: 'inizio' | 'fine'; quote: number[] },
  parti: number, inizio: number, fine: number,
): number[] {
  if (pos.modo === 'uguali') return Array.from({ length: parti - 1 }, (_, i) => inizio + ((fine - inizio) * (i + 1)) / parti)
  const v = pos.quote.slice(0, parti - 1).map(q => (pos.da === 'inizio' ? inizio + q : fine - q))
  return v.sort((a, b) => a - b)
}

export function calcolaDisegno(d: Pick<DisegnoGrafico, 'forma' | 'radice'>): DisegnoCalcolato {
  const contorno = contornoForma(d.forma)
  const poligono = contorno.flatMap(puntiLato)
  const out: DisegnoCalcolato = { contorno, poligono, larghezza: 0, altezza: 0, zone: [], pezzi: [], quote: [], ante: [] }
  if (poligono.length < 3) return out
  const box = ingombro(poligono)
  out.larghezza = box.maxX - box.minX
  out.altezza = box.maxY - box.minY
  const centro = baricentro(poligono)

  // Telaio: un pezzo per lato della forma
  const radice: Poligono = { p: [], b: [] }
  contorno.forEach((l, i) => {
    const pts = puntiLato(l)
    const tratto = [...pts, l.a]
    const id = `T${i}`
    out.pezzi.push({
      id, ruolo: 'telaio', nome: '', tratti: [tratto], larghezzaTratto: SPESSORE.telaio * 2, clip: poligono,
      profondita: -1, elemento: 'telaio', lunghezza: lunghezzaLato(l),
    })
    for (const p of pts) { radice.p.push(p); radice.b.push({ tag: id, copertura: SPESSORE.telaio }) }
  })
  for (const p of out.pezzi) p.nome = `Telaio ${nomeLato(p.tratti, centro)}`

  let numeroZona = 0
  const visita = (z: Zona, pol: Poligono, prof: number) => {
    const c = z.contenuto
    if (pol.p.length < 3) return
    if (c.tipo === 'vuoto' || c.tipo === 'riempimento') {
      numeroZona++
      out.zone.push({ id: z.id, poligono: pol, profondita: prof, foglia: true, materiale: c.tipo === 'riempimento' ? c.materiale : null, numero: numeroZona })
      if (c.tipo === 'riempimento') {
        const ruolo: RuoloPezzo = c.materiale === 'vetro' ? 'fermavetro' : 'fermapannello'
        const cz = baricentro(pol.p)
        for (const [tag, t] of trattiPerTag(pol)) {
          out.pezzi.push({
            id: `${z.id}:f:${tag}`, ruolo, nome: `${nomeRuolo(ruolo)} Z${numeroZona} ${nomeLato(t.tratti, cz)}`,
            tratti: t.tratti, larghezzaTratto: (t.copertura + SPESSORE.fermo) * 2, clip: pol.p,
            profondita: prof, elemento: z.id, lunghezza: lunghezzaTratti(t.tratti),
          })
        }
      }
      return
    }
    out.zone.push({ id: z.id, poligono: pol, profondita: prof, foglia: false, materiale: null, numero: 0 })
    const box = ingombro(pol.p)

    if (c.tipo === 'divisione') {
      const asse = c.verso === 'montante' ? 'x' : 'y'
      const [inizio, fine] = asse === 'x' ? [box.minX, box.maxX] : [box.minY, box.maxY]
      const tagli = posizioniTagli(c.posizione, c.parti.length, inizio, fine)
      let resto = pol
      tagli.forEach((t, i) => {
        const id = `${c.id}#${i}`
        const seg = segmentoDentro(resto.p, asse, t)
        const [prima, dopo] = taglia(resto, asse, t, { tag: id, copertura: SPESSORE.divisione / 2 })
        if (seg) {
          out.pezzi.push({
            id, ruolo: c.verso, nome: '', tratti: [seg], larghezzaTratto: SPESSORE.divisione, clip: resto.p,
            profondita: prof, elemento: c.id, lunghezza: Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y),
          })
          const daInizio = c.posizione.modo === 'quote' ? c.posizione.da === 'inizio' : true
          out.quote.push({
            id, verso: c.verso, valore: Math.round(daInizio ? t - inizio : fine - t), da: daInizio ? 'inizio' : 'fine',
            posizione: { x: (seg[0].x + seg[1].x) / 2, y: (seg[0].y + seg[1].y) / 2 },
          })
        }
        visita(c.parti[i], prima, prof + 1)
        resto = dopo
      })
      if (c.parti[tagli.length]) visita(c.parti[tagli.length], resto, prof + 1)
      return
    }

    // Anta (o ante): parti uguali in larghezza, una fascia di anta per lato di ogni parte
    const n = c.ante.length
    const tagli = posizioniTagli({ modo: 'uguali' }, n, box.minX, box.maxX)
    const ruolo: RuoloPezzo = c.apertura === 'scorrevole' ? 'anta_scorrevole' : 'anta'
    let resto = pol
    for (let k = 0; k < n; k++) {
      let parte = resto
      if (k < n - 1) {
        const tag = `${c.id}#${k}`
        const seg = segmentoDentro(resto.p, 'x', tagli[k])
        const [prima, dopo] = taglia(resto, 'x', tagli[k], { tag, copertura: 0 })
        parte = prima
        resto = dopo
        if (seg && c.apertura !== 'scorrevole') {
          out.pezzi.push({
            id: `${c.id}:r${k}`, ruolo: 'riporto', nome: `Riporto anta ${k + 1}/${k + 2}`, tratti: [seg],
            larghezzaTratto: SPESSORE.riporto, clip: pol.p, profondita: prof - 0.5, elemento: c.id,
            lunghezza: Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y),
          })
        }
      }
      if (parte.p.length < 3) continue
      out.ante.push({ id: c.id, indice: k, numero: n, apertura: c.apertura, mano: c.mano, poligono: parte.p })
      const cz = baricentro(parte.p)
      const interno: Poligono = { p: parte.p, b: [] }
      const perTag = trattiPerTag(parte)
      for (const [tag, t] of perTag) {
        const id = `${c.id}:${k}:${tag}`
        out.pezzi.push({
          id, ruolo, nome: `${nomeRuolo(ruolo)}${n > 1 ? ` ${k + 1}` : ''} ${nomeLato(t.tratti, cz)}`,
          tratti: t.tratti, larghezzaTratto: (t.copertura + SPESSORE.anta) * 2, clip: parte.p,
          profondita: prof, elemento: c.id, lunghezza: lunghezzaTratti(t.tratti),
        })
      }
      for (const b of parte.b) interno.b.push({ tag: `${c.id}:${k}:${b.tag}`, copertura: b.copertura + SPESSORE.anta })
      visita(c.ante[k], interno, prof + 1)
    }
  }
  visita(d.radice, radice, 0)

  // Montanti e traversi numerati da sinistra / dal basso
  for (const ruolo of ['montante', 'traverso'] as const) {
    const lista = out.pezzi.filter(p => p.ruolo === ruolo)
    const k = (p: PezzoCalcolato) => (ruolo === 'montante' ? p.tratti[0][0].x : p.tratti[0][0].y)
    lista.sort((a, b) => k(a) - k(b)).forEach((p, i) => { p.nome = `${nomeRuolo(ruolo)} ${i + 1}` })
  }
  return out
}

/** Zona finale (vuota o riempita) sotto il punto, la piu' interna */
export function zonaNelPunto(c: DisegnoCalcolato, q: Pt): ZonaCalcolata | null {
  const foglie = c.zone.filter(z => z.foglia && puntoNelPoligono(q, z.poligono.p))
  return foglie.sort((a, b) => b.profondita - a.profondita)[0] ?? null
}

/** Ordine di disegno: prima i pezzi piu' interni, il telaio per ultimo */
export function pezziInOrdine(c: DisegnoCalcolato): PezzoCalcolato[] {
  return [...c.pezzi].sort((a, b) => b.profondita - a.profondita)
}
