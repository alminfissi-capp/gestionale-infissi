// Contorno della forma esterna: dai modelli FP PRO o dai punti misurati in cantiere a
// un elenco di lati chiuso, in senso antiorario, con l'angolo in basso a sinistra in 0,0.
import type { Forma, Pt, PuntoForma } from '@/types/rilievo-grafico'
import { eseguiModello, type LatoContorno } from './prm'
import { MODELLI, modelloPerId } from './modelli'

const EPS = 1e-6
const uguali = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3

/** Angolo percorso da un arco (radianti, sempre positivo) */
export function ampiezzaArco(l: Extract<LatoContorno, { tipo: 'arco' }>): number {
  const a1 = Math.atan2(l.da.y - l.centro.y, l.da.x - l.centro.x)
  const a2 = Math.atan2(l.a.y - l.centro.y, l.a.x - l.centro.x)
  let s = l.orario ? a1 - a2 : a2 - a1
  while (s <= EPS) s += 2 * Math.PI
  while (s > 2 * Math.PI + EPS) s -= 2 * Math.PI
  return s
}

/** Punti di un lato, il primo compreso e l'ultimo escluso. Archi a passi di 3 gradi */
export function puntiLato(l: LatoContorno): Pt[] {
  if (l.tipo === 'retta') return [l.da]
  const r = Math.hypot(l.da.x - l.centro.x, l.da.y - l.centro.y)
  const a1 = Math.atan2(l.da.y - l.centro.y, l.da.x - l.centro.x)
  const s = ampiezzaArco(l)
  const n = Math.max(4, Math.ceil(s / (3 * Math.PI / 180)))
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = a1 + (l.orario ? -1 : 1) * s * (i / n)
    out.push({ x: l.centro.x + r * Math.cos(a), y: l.centro.y + r * Math.sin(a) })
  }
  return out
}

export function lunghezzaLato(l: LatoContorno): number {
  if (l.tipo === 'retta') return Math.hypot(l.a.x - l.da.x, l.a.y - l.da.y)
  return Math.hypot(l.da.x - l.centro.x, l.da.y - l.centro.y) * ampiezzaArco(l)
}

const area = (p: Pt[]) => {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

const inverti = (l: LatoContorno): LatoContorno =>
  l.tipo === 'retta' ? { tipo: 'retta', da: l.a, a: l.da } : { tipo: 'arco', da: l.a, a: l.da, centro: l.centro, orario: !l.orario }

const sposta = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy })

/**
 * Pulisce un contorno: toglie i lati nulli, lo chiude, lo gira in senso antiorario e lo
 * porta con il minimo di x e y in 0,0.
 */
export function normalizzaContorno(lati: LatoContorno[]): LatoContorno[] {
  let l = lati.filter(x => !uguali(x.da, x.a) || x.tipo === 'arco')
  if (l.length === 0) return []
  const primo = l[0].da, ultimo = l[l.length - 1].a
  if (!uguali(primo, ultimo)) l.push({ tipo: 'retta', da: ultimo, a: primo })
  if (area(l.flatMap(puntiLato)) < 0) l = l.slice().reverse().map(inverti)
  const pts = l.flatMap(puntiLato)
  const dx = -Math.min(...pts.map(p => p.x)), dy = -Math.min(...pts.map(p => p.y))
  // Si parte dal lato che comincia piu' in basso a sinistra: i numeri dei lati restano
  // gli stessi anche se il modello parte da un altro punto.
  const indice = l.reduce((m, x, i) => {
    const a = l[m].da, b = x.da
    return b.y < a.y - 1e-3 || (Math.abs(b.y - a.y) < 1e-3 && b.x < a.x) ? i : m
  }, 0)
  l = [...l.slice(indice), ...l.slice(0, indice)]
  return l.map(x => x.tipo === 'retta'
    ? { tipo: 'retta', da: sposta(x.da, dx, dy), a: sposta(x.a, dx, dy) }
    : { tipo: 'arco', da: sposta(x.da, dx, dy), a: sposta(x.a, dx, dy), centro: sposta(x.centro, dx, dy), orario: x.orario })
}

/** Lato ad arco da corda e freccia. Freccia positiva = verso l'esterno della forma */
function arcoDaFreccia(da: Pt, a: Pt, freccia: number, antiorario: boolean): LatoContorno {
  const c = Math.hypot(a.x - da.x, a.y - da.y)
  if (c < EPS || Math.abs(freccia) < 0.5) return { tipo: 'retta', da, a }
  const f = Math.abs(freccia)
  const r = (c * c / 4 + f * f) / (2 * f)
  const u = { x: (a.x - da.x) / c, y: (a.y - da.y) / c }
  const destra = { x: u.y, y: -u.x }
  // In un contorno antiorario l'esterno e' a destra di chi lo percorre.
  const s = (antiorario ? 1 : -1) * Math.sign(freccia)
  const n = { x: destra.x * s, y: destra.y * s }
  const m = { x: (da.x + a.x) / 2, y: (da.y + a.y) / 2 }
  const centro = { x: m.x - n.x * (r - f), y: m.y - n.y * (r - f) }
  // Gobba a destra di chi va da `da` ad `a` = senso antiorario attorno al centro.
  return { tipo: 'arco', da, a, centro, orario: s < 0 }
}

export function latiDaPunti(punti: PuntoForma[]): LatoContorno[] {
  if (punti.length < 3) return []
  const p = punti.map(q => ({ x: q.x, y: q.h }))
  const antiorario = area(p) > 0
  return p.map((da, i) => arcoDaFreccia(da, p[(i + 1) % p.length], punti[i].freccia ?? 0, antiorario))
}

/** Misure del modello con i valori di esempio di FP PRO dove mancano */
export function misureModello(id: string, misure: Record<string, number> = {}): Record<string, number> {
  const m = modelloPerId(id)
  if (!m) return {}
  const { variabili } = eseguiModello(m.script)
  const out: Record<string, number> = {}
  for (const v of variabili) if (!m.nascoste?.includes(v.nome)) out[v.nome] = misure[v.nome] ?? v.valore
  return out
}

/** Contorno della forma, pulito (vedi normalizzaContorno). Vuoto se la forma non torna */
export function contornoForma(forma: Forma): LatoContorno[] {
  try {
    if (forma.tipo === 'punti') return normalizzaContorno(latiDaPunti(forma.punti))
    const m = modelloPerId(forma.modello) ?? MODELLI[0]
    const lati = eseguiModello(m.script, forma.misure).lati
    const ok = lati.every(l => [l.da, l.a, ...(l.tipo === 'arco' ? [l.centro] : [])].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    return ok ? normalizzaContorno(lati) : []
  } catch {
    return []
  }
}

export function poligonoContorno(lati: LatoContorno[]): Pt[] {
  return lati.flatMap(puntiLato)
}

export function ingombro(p: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...p.map(q => q.x)), minY: Math.min(...p.map(q => q.y)),
    maxX: Math.max(...p.map(q => q.x)), maxY: Math.max(...p.map(q => q.y)),
  }
}

export const formaIniziale = (): Forma => ({ tipo: 'modello', modello: 'MODEL-00', misure: { L: 1200, H: 1400 } })
