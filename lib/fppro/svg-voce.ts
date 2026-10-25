// Disegno della voce come nel rilievo (profili alle misure vere, pannelli, simboli di apertura):
// gli stessi elementi per il componente del telefono e per l'immagine che va nel preventivo.
import { campiDisegno, disegnoVoce, type DisegnoVoce } from './disegno-voce'
import { haRibalta } from './rilievo-fp'
import { simboliApertura, type Simbolo } from './simboli-apertura'
import type { StrutturaLocale, VoceFpDati } from '@/types/rilievo-fp'

export type StrutturaDisegno = Pick<StrutturaLocale, 'albero' | 'poligoni' | 'l_nominale' | 'h_nominale'>
export type VoceDisegno = Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'> & Partial<Pick<VoceFpDati, 'mano' | 'kit' | 'vetri' | 'pannelli'>>

export const BLU = '#1e3a8a'
/** Pannello: pieno chiaro con tratteggio, per distinguerlo dal vetro azzurro */
export const PANNELLO = '#e7e5e4'
export const VETRO = '#bfdbfe'

export interface ElementiDisegno {
  d: DisegnoVoce
  simboli: Simbolo[]
  /** Riempimenti che sono pannelli (della struttura o scelti nella voce) */
  pannelli: { codiceNodo: string; x: number; y: number; w: number; h: number }[]
}

export function elementiDisegno(struttura: StrutturaDisegno, voce: VoceDisegno): ElementiDisegno | null {
  const d = disegnoVoce(struttura, voce)
  if (!d) return null
  const misure = { L: d.larghezza, H: d.altezza, L0: struttura.l_nominale ?? d.larghezza, H0: struttura.h_nominale ?? d.altezza, quote: voce.quote ?? {} }
  let simboli: Simbolo[] = []
  try {
    simboli = simboliApertura(struttura.albero, misure, { mano: voce.mano ?? null, ribalta: haRibalta(struttura.albero, voce.kit ?? {}) })
  } catch {
    // I simboli sono un di piu': una struttura strana non deve togliere il disegno.
  }
  let pannelli: ElementiDisegno['pannelli'] = []
  try {
    pannelli = campiDisegno(struttura.albero, misure, { vetri: voce.vetri, pannelli: voce.pannelli }).filter(c => c.tipo === 'pannello')
  } catch {
    pannelli = []
  }
  return { d, simboli, pannelli }
}

const att = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * SVG completo del disegno, largo `lato` pixel sul lato lungo. Gli spessori delle linee sono
 * in pixel (come vector-effect non-scaling-stroke nel telefono), per i convertitori in PNG.
 */
export function svgVoce(struttura: StrutturaDisegno, voce: VoceDisegno, lato = 800): string | null {
  const e = elementiDisegno(struttura, voce)
  if (!e) return null
  const [vx, vy, vw, vh] = e.d.viewBox.split(/\s+/).map(Number)
  if (![vx, vy, vw, vh].every(Number.isFinite) || vw <= 0 || vh <= 0) return null
  const k = Math.max(vw, vh) / lato
  const w = Math.round(vw / k)
  const h = Math.round(vh / k)
  const px = (n: number) => Math.round(n * k * 100) / 100
  const parti: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${att(e.d.viewBox)}" width="${w}" height="${h}">`,
    '<defs>',
    `<marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${BLU}"/></marker>`,
    `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="40" height="40" fill="${PANNELLO}"/><line x1="0" y1="0" x2="0" y2="40" stroke="#a8a29e" stroke-width="${px(1)}"/></pattern>`,
    '</defs>',
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>`,
    `<rect x="0" y="0" width="${e.d.larghezza}" height="${e.d.altezza}" fill="${VETRO}"/>`,
    ...e.pannelli.map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#p)"/>`),
    ...e.d.profili.map(p => `<polygon points="${att(p)}" fill="#d4d4d8" stroke="#3f3f46" stroke-width="${px(1.5)}"/>`),
    ...e.simboli.map(s => {
      if ('x1' in s) {
        const base = `x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${BLU}"`
        return s.tipo === 'scorrimento'
          ? `<line ${base} stroke-width="${px(1.5)}" marker-end="url(#f)"/>`
          : `<line ${base} stroke-width="${px(1)}" stroke-dasharray="${s.tipo === 'apertura' ? `${px(6)} ${px(4)}` : `${px(2)} ${px(3)}`}"/>`
      }
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.tipo === 'maniglia' ? 6 : 2}" fill="${s.tipo === 'maniglia' ? '#111827' : '#52525b'}"/>`
    }),
    '</svg>',
  ]
  return parti.join('')
}
