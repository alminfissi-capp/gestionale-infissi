// Riga tracciata col dito -> montante o traverso nella zona che attraversa.
import type { PosizioneTagli, Pt, Verso } from '@/types/rilievo-grafico'
import { ingombro } from './forma'
import { zonaNelPunto, type DisegnoCalcolato } from './geometria'

export interface TracciaLetta { zonaId: string; verso: Verso; posizione: PosizioneTagli }

/** Vicino alla meta' (entro il 6% della zona) si aggancia a "a meta'"; altrimenti quota ogni 5 mm */
export function interpretaTraccia(calc: DisegnoCalcolato, punti: Pt[]): TracciaLetta | null {
  if (punti.length < 2) return null
  const b = ingombro(punti)
  const dx = b.maxX - b.minX, dy = b.maxY - b.minY
  if (Math.max(dx, dy) < 40) return null
  const verso: Verso = dy > dx ? 'montante' : 'traverso'
  const centro = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  const zona = zonaNelPunto(calc, centro)
  if (!zona) return null
  const z = ingombro(zona.poligono.p)
  const [inizio, fine, lungo, corto] = verso === 'montante'
    ? [z.minX, z.maxX, dy, z.maxY - z.minY]
    : [z.minY, z.maxY, dx, z.maxX - z.minX]
  // Una riga troppo corta rispetto alla zona e' un tocco sbagliato, non una divisione.
  if (lungo < corto * 0.35) return null
  const media = punti.reduce((s, p) => s + (verso === 'montante' ? p.x : p.y), 0) / punti.length
  const ampiezza = fine - inizio
  const rel = media - inizio
  if (rel < 40 || rel > ampiezza - 40) return null
  if (Math.abs(rel - ampiezza / 2) < ampiezza * 0.06) return { zonaId: zona.id, verso, posizione: { modo: 'uguali' } }
  return { zonaId: zona.id, verso, posizione: { modo: 'quote', da: 'inizio', quote: [Math.round(rel / 5) * 5] } }
}
