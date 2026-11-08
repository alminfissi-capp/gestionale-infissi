// Quote della forma esterna da scrivere sul disegno, come in FP PRO: una per lato, gli
// scarti quando un lato non copre tutto l'ingombro. Si lavora sui punti della forma
// (vertici + freccia, vedi formaInPunti); ogni modifica restituisce i punti nuovi oppure
// null se la forma non torna.
import type { PuntoForma, Pt } from '@/types/rilievo-grafico'
import { normalizzaPunti } from './forma'

export type TipoQuotaForma = 'lato' | 'scarto' | 'angolo' | 'totale' | 'freccia' | 'altezza_arco' | 'raggio'

export interface QuotaForma {
  /** 'L{i}' lato · 'S{i}a' / 'S{i}b' scarti (a = verso il minimo di x o y) · 'A{y}' angolo · 'TL' / 'TH' totali · 'F{i}' freccia · 'AT{i}' altezza totale arco · 'R{i}' raggio */
  id: string
  tipo: TipoQuotaForma
  lato: number | null
  direzione: 'x' | 'y'
  /** mm, arrotondato al millimetro */
  valore: number
  /** false solo per il raggio */
  modificabile: boolean
  /** Dove disegnarla (mm, y verso l'alto), fuori dal contorno */
  posizione: Pt
}

const TOLL = 0.5

type Asse = 'x' | 'h'
const asseDi = (d: 'x' | 'y'): Asse => (d === 'x' ? 'x' : 'h')

interface Lato { i: number; a: PuntoForma; b: PuntoForma; direzione: 'x' | 'y'; valore: number }

function latiDi(p: PuntoForma[]): Lato[] {
  return p.map((a, i) => {
    const b = p[(i + 1) % p.length]
    const dx = b.x - a.x, dy = b.h - a.h
    const direzione = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
    return { i, a, b, direzione, valore: Math.abs(direzione === 'x' ? dx : dy) }
  })
}

function ingombroPunti(p: PuntoForma[]) {
  const xs = p.map(q => q.x), hs = p.map(q => q.h)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minH: Math.min(...hs), maxH: Math.max(...hs) }
}

/** Distanza degli estremi del lato dai bordi dell'ingombro dei vertici, nella sua direzione */
function scarti(l: Lato, box: ReturnType<typeof ingombroPunti>): [number, number] {
  const k = asseDi(l.direzione)
  const lo = Math.min(l.a[k], l.b[k]), hi = Math.max(l.a[k], l.b[k])
  return l.direzione === 'x' ? [lo - box.minX, box.maxX - hi] : [lo - box.minH, box.maxH - hi]
}

const segmentiSiIncrociano = (p1: PuntoForma, p2: PuntoForma, p3: PuntoForma, p4: PuntoForma) => {
  const o = (a: PuntoForma, b: PuntoForma, c: PuntoForma) => (b.x - a.x) * (c.h - a.h) - (b.h - a.h) * (c.x - a.x)
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4)
  return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))
}

/** La forma non si incrocia (corde dei lati non adiacenti) e i numeri sono veri */
export function formaValida(p: PuntoForma[]): boolean {
  if (p.length < 2 || !p.every(q => Number.isFinite(q.x) && Number.isFinite(q.h) && (q.freccia === undefined || Number.isFinite(q.freccia)))) return false
  const n = p.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentiSiIncrociano(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false
    }
  }
  return true
}

export function quoteForma(punti: PuntoForma[]): QuotaForma[] {
  const lati = latiDi(punti)
  const box = ingombroPunti(punti)
  const off = Math.max(box.maxX - box.minX, box.maxH - box.minH) * 0.07
  const out: QuotaForma[] = []
  for (const l of lati) {
    // Fuori dal contorno: a destra di chi percorre il lato (contorno antiorario)
    const dx = l.b.x - l.a.x, dy = l.b.h - l.a.h, len = Math.hypot(dx, dy) || 1
    const nx = dy / len, ny = -dx / len
    const m = { x: (l.a.x + l.b.x) / 2, y: (l.a.h + l.b.h) / 2 }
    out.push({ id: `L${l.i}`, tipo: 'lato', lato: l.i, direzione: l.direzione, valore: Math.round(l.valore), modificabile: true, posizione: { x: m.x + nx * off, y: m.y + ny * off } })
    const [sa, sb] = scarti(l, box)
    if (sa > TOLL || sb > TOLL) {
      const k = asseDi(l.direzione)
      const [pa, pb] = l.a[k] <= l.b[k] ? [l.a, l.b] : [l.b, l.a]
      const posA = l.direzione === 'x'
        ? { x: (box.minX + pa.x) / 2, y: pa.h + ny * off } : { x: pa.x + nx * off, y: (box.minH + pa.h) / 2 }
      const posB = l.direzione === 'x'
        ? { x: (pb.x + box.maxX) / 2, y: pb.h + ny * off } : { x: pb.x + nx * off, y: (pb.h + box.maxH) / 2 }
      out.push({ id: `S${l.i}a`, tipo: 'scarto', lato: l.i, direzione: l.direzione, valore: Math.round(sa), modificabile: true, posizione: posA })
      out.push({ id: `S${l.i}b`, tipo: 'scarto', lato: l.i, direzione: l.direzione, valore: Math.round(sb), modificabile: true, posizione: posB })
    }
  }
  return out
}

const copia = (p: PuntoForma[]) => p.map(q => ({ ...q }))

/** Applica la misura scritta nella quota `id`. null = misura impossibile */
export function applicaQuota(punti: PuntoForma[], id: string, valore: number): PuntoForma[] | null {
  if (!Number.isFinite(valore)) return null
  const lati = latiDi(punti)
  const n = punti.length
  const p = copia(punti)
  let m: RegExpMatchArray | null
  if ((m = id.match(/^L(\d+)$/))) {
    const l = lati[Number(m[1])]
    if (!l || valore <= 0) return null
    const k = asseDi(l.direzione)
    const d = (valore - l.valore) / 2
    const ia = l.i, ib = (l.i + 1) % n
    const verso = p[ib][k] >= p[ia][k] ? 1 : -1
    p[ia][k] -= verso * d
    p[ib][k] += verso * d
  } else if ((m = id.match(/^S(\d+)([ab])$/))) {
    const l = lati[Number(m[1])]
    if (!l || valore < 0) return null
    const [sa, sb] = scarti(l, ingombroPunti(punti))
    const k = asseDi(l.direzione)
    const sposta = m[2] === 'a' ? valore - sa : -(valore - sb)
    p[l.i][k] += sposta
    p[(l.i + 1) % n][k] += sposta
  } else {
    return null
  }
  if (!formaValida(p)) return null
  const out = normalizzaPunti(p)
  return out.length === n && formaValida(out) ? out : null
}
