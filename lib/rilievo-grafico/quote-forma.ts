// Quote della forma esterna da scrivere sul disegno, come in FP PRO: una per lato, gli
// scarti quando un lato non copre tutto l'ingombro. Si lavora sui punti della forma
// (vertici + freccia, vedi formaInPunti); ogni modifica restituisce i punti nuovi oppure
// null se la forma non torna.
import type { PuntoForma, Pt } from '@/types/rilievo-grafico'
import { ampiezzaArco, latiDaPunti, normalizzaPunti } from './forma'
import type { LatoContorno } from './prm'

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

const allineato = (l: Lato) => Math.abs(l.a.x - l.b.x) < TOLL || Math.abs(l.a.h - l.b.h) < TOLL

/**
 * Con piu' di 4 lati un lato si centra (con gli scarti) solo se nessuno dei due vicini e'
 * orizzontale o verticale; altrimenti si muove un estremo e i lati a squadra restano tali.
 * Sul quadrilatero si centra sempre, come FP PRO.
 */
const centrato = (lati: Lato[], i: number) => {
  const n = lati.length
  return n <= 4 || (!allineato(lati[(i + n - 1) % n]) && !allineato(lati[(i + 1) % n]))
}

/**
 * Sposta i vertici `indici` di `d` lungo `k`. Con piu' di 4 lati si portano dietro l'altro
 * estremo dei lati che restano a squadra: verticali se si sposta in x, orizzontali in h.
 */
function muovi(orig: PuntoForma[], p: PuntoForma[], indici: number[], k: Asse, d: number) {
  const n = orig.length
  const fatti = new Set<number>()
  const coda = [...indici]
  while (coda.length) {
    const j = coda.pop()!
    if (fatti.has(j)) continue
    fatti.add(j)
    p[j][k] += d
    if (n <= 4) continue
    for (const v of [(j + n - 1) % n, (j + 1) % n]) {
      const fermo = k === 'x' ? Math.abs(orig[v].x - orig[j].x) < TOLL : Math.abs(orig[v].h - orig[j].h) < TOLL
      if (fermo && !fatti.has(v)) coda.push(v)
    }
  }
}

/** Altezze dei vertici strettamente tra il punto piu' basso e il piu' alto (forme > 4 lati) */
function altezzeAngoli(p: PuntoForma[]): number[] {
  if (p.length <= 4) return []
  const box = ingombroPunti(p)
  return [...new Set(p.map(q => Math.round(q.h)))].filter(h => h > box.minH + TOLL && h < box.maxH - TOLL).sort((a, b) => a - b)
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

/** Punto piu' esterno dell'arco lungo l'asse `k`, verso `segno` (+1 = verso il massimo) */
function estremoArco(l: Extract<LatoContorno, { tipo: 'arco' }>, k: 'x' | 'y', segno: 1 | -1): number {
  const r = Math.hypot(l.da.x - l.centro.x, l.da.y - l.centro.y)
  const estremi = segno > 0 ? Math.max(l.da[k], l.a[k]) : Math.min(l.da[k], l.a[k])
  // Angolo del punto del cerchio piu' esterno: e' sull'arco?
  const t = k === 'x' ? (segno > 0 ? 0 : Math.PI) : (segno > 0 ? Math.PI / 2 : -Math.PI / 2)
  const a1 = Math.atan2(l.da.y - l.centro.y, l.da.x - l.centro.x)
  let delta = l.orario ? a1 - t : t - a1
  while (delta < 0) delta += 2 * Math.PI
  while (delta >= 2 * Math.PI) delta -= 2 * Math.PI
  if (delta > ampiezzaArco(l) + 1e-9) return estremi
  return l.centro[k] + segno * r
}

/** Altezza totale (lato orizzontale) o larghezza totale (verticale) fino alla gobba dell'arco */
function altezzaArco(l: Lato, arco: Extract<LatoContorno, { tipo: 'arco' }>, box: ReturnType<typeof ingombroPunti>): number {
  const dx = l.b.x - l.a.x, dy = l.b.h - l.a.h
  // Esterno a destra di chi percorre (contorno antiorario)
  if (l.direzione === 'x') return -dx > 0 ? estremoArco(arco, 'y', 1) - box.minH : box.maxH - estremoArco(arco, 'y', -1)
  return dy > 0 ? estremoArco(arco, 'x', 1) - box.minX : box.maxX - estremoArco(arco, 'x', -1)
}

export function quoteForma(punti: PuntoForma[]): QuotaForma[] {
  const lati = latiDi(punti)
  const contorno = latiDaPunti(punti)
  const box = ingombroPunti(punti)
  const off = Math.max(box.maxX - box.minX, box.maxH - box.minH) * 0.07
  const out: QuotaForma[] = []
  for (const l of lati) {
    // Fuori dal contorno: a destra di chi percorre il lato (contorno antiorario)
    const dx = l.b.x - l.a.x, dy = l.b.h - l.a.h, len = Math.hypot(dx, dy) || 1
    const nx = dy / len, ny = -dx / len
    const m = { x: (l.a.x + l.b.x) / 2, y: (l.a.h + l.b.h) / 2 }
    const f = l.a.freccia ?? 0
    const arco = contorno[l.i]
    const fuori = off + Math.max(f, 0)
    out.push({ id: `L${l.i}`, tipo: 'lato', lato: l.i, direzione: l.direzione, valore: Math.round(l.valore), modificabile: true, posizione: { x: m.x + nx * fuori, y: m.y + ny * fuori } })
    if (f && arco?.tipo === 'arco') {
      const r = (len * len / 4 + f * f) / (2 * Math.abs(f))
      const cima = { x: m.x + nx * f, y: m.y + ny * f }
      out.push({ id: `F${l.i}`, tipo: 'freccia', lato: l.i, direzione: l.direzione === 'x' ? 'y' : 'x', valore: Math.round(f), modificabile: true, posizione: { x: cima.x - nx * off * 0.8, y: cima.y - ny * off * 0.8 } })
      if (f > 0) {
        const at = altezzaArco(l, arco, box)
        const pos = l.direzione === 'x' ? { x: box.maxX + 2 * off, y: m.y + ny * f / 2 } : { x: m.x + nx * f / 2, y: box.maxH + 2 * off }
        out.push({ id: `AT${l.i}`, tipo: 'altezza_arco', lato: l.i, direzione: l.direzione === 'x' ? 'y' : 'x', valore: Math.round(at), modificabile: true, posizione: pos })
      }
      out.push({ id: `R${l.i}`, tipo: 'raggio', lato: l.i, direzione: l.direzione, valore: Math.round(r), modificabile: false, posizione: { x: cima.x - nx * off * 1.8, y: cima.y - ny * off * 1.8 } })
    }
    const [sa, sb] = scarti(l, box)
    if (centrato(lati, l.i) && (sa > TOLL || sb > TOLL)) {
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
  if (punti.length > 4) {
    for (const h of altezzeAngoli(punti)) {
      out.push({ id: `A${h}`, tipo: 'angolo', lato: null, direzione: 'y', valore: h, modificabile: true, posizione: { x: box.minX - 2 * off, y: h } })
    }
    // Il totale solo se nessun lato copre gia' tutta la larghezza / altezza (niente doppioni)
    const copre = (d: 'x' | 'y', tot: number) => lati.some(l => l.direzione === d && Math.abs(l.valore - tot) < TOLL)
    const W = box.maxX - box.minX, Ht = box.maxH - box.minH
    if (!copre('x', W)) out.push({ id: 'TL', tipo: 'totale', lato: null, direzione: 'x', valore: Math.round(W), modificabile: true, posizione: { x: (box.minX + box.maxX) / 2, y: box.minH - 2 * off } })
    if (!copre('y', Ht)) out.push({ id: 'TH', tipo: 'totale', lato: null, direzione: 'y', valore: Math.round(Ht), modificabile: true, posizione: { x: box.maxX + 2 * off, y: (box.minH + box.maxH) / 2 } })
  }
  return out
}

const copia = (p: PuntoForma[]) => p.map(q => ({ ...q }))

/** Il lato `lato` diventa un arco con questa freccia (0 = di nuovo dritto) */
export function impostaArco(punti: PuntoForma[], lato: number, freccia: number): PuntoForma[] | null {
  if (!Number.isFinite(freccia) || lato < 0 || lato >= punti.length) return null
  const p = copia(punti)
  if (Math.abs(freccia) < 0.5) delete p[lato].freccia
  else p[lato].freccia = freccia
  if (!formaValida(p)) return null
  const out = normalizzaPunti(p)
  return out.length === p.length ? out : null
}

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
    const ia = l.i, ib = (l.i + 1) % n
    const verso = p[ib][k] >= p[ia][k] ? 1 : -1
    if (centrato(lati, l.i)) {
      const d = (valore - l.valore) / 2
      muovi(punti, p, [ia], k, -verso * d)
      muovi(punti, p, [ib], k, verso * d)
    } else {
      // Resta fermo l'estremo attaccato a un lato a squadra (se lo sono entrambi, quello a
      // sinistra / in basso); l'altro si sposta
      const vicinoA = allineato(lati[(l.i + n - 1) % n]), vicinoB = allineato(lati[ib])
      const muoviB = vicinoA && vicinoB ? verso > 0 : vicinoA
      const d = valore - l.valore
      if (muoviB) muovi(punti, p, [ib], k, verso * d)
      else muovi(punti, p, [ia], k, -verso * d)
    }
  } else if ((m = id.match(/^S(\d+)([ab])$/))) {
    const l = lati[Number(m[1])]
    if (!l || valore < 0) return null
    const [sa, sb] = scarti(l, ingombroPunti(punti))
    const k = asseDi(l.direzione)
    const sposta = m[2] === 'a' ? valore - sa : -(valore - sb)
    muovi(punti, p, [l.i, (l.i + 1) % n], k, sposta)
  } else if ((m = id.match(/^A(-?\d+)$/))) {
    const h = Number(m[1])
    if (!altezzeAngoli(punti).includes(h) || valore <= 0) return null
    muovi(punti, p, punti.flatMap((q, j) => (Math.round(q.h) === h ? [j] : [])), 'h', valore - h)
  } else if ((m = id.match(/^F(\d+)$/))) {
    return impostaArco(punti, Number(m[1]), valore)
  } else if ((m = id.match(/^AT(\d+)$/))) {
    const q = quoteForma(punti).find(x => x.id === id)
    const i = Number(m[1])
    if (!q || valore <= 0) return null
    return impostaArco(punti, i, (punti[i].freccia ?? 0) + (valore - q.valore))
  } else if (id === 'TL' || id === 'TH') {
    if (n <= 4 || valore <= 0) return null
    const box = ingombroPunti(punti)
    const k: Asse = id === 'TL' ? 'x' : 'h'
    const max = k === 'x' ? box.maxX : box.maxH, min = k === 'x' ? box.minX : box.minH
    muovi(punti, p, punti.flatMap((q, j) => (q[k] > max - TOLL ? [j] : [])), k, valore - (max - min))
  } else {
    return null
  }
  if (!formaValida(p)) return null
  const out = normalizzaPunti(p)
  return out.length === n && formaValida(out) ? out : null
}
