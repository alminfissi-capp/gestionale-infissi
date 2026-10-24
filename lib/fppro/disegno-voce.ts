// Disegno della voce: i poligoni della struttura adattati alle misure del rilievo.
import type { VoceFpDati } from '@/types/rilievo-fp'
import { divisioniStruttura } from './rilievo-fp'
import type { NodoStruttura } from './strutture-xml'

/** Fascia lungo il bordo che si sposta senza deformarsi (telaio, anta, fermavetro). */
export const ZONA_BORDO = 150
/** Mezza fascia rigida attorno all'asse di un traverso o montante. */
export const MEZZA_ZONA = 75

const tondo = (n: number) => Math.round(n * 10) / 10

/**
 * Mappa a tratti di un asse. Le divisioni (traversi, montanti) vanno SEMPRE alla loro quota;
 * attorno a loro e al bordo restano zone rigide (profili che non si deformano) e i tratti
 * intermedi (i vetri) si allungano. Dove le zone rigide non ci stanno (es. sopraluce di 200 mm
 * sotto il bordo) si stringono, senza mai rinunciare alla quota. Quote fuori ordine o fuori
 * dal telaio si ignorano (la divisione resta proporzionale).
 */
export function mappaAsse(
  nominale: number,
  reale: number,
  ancore: { nominale: number; reale: number }[],
): (v: number) => number {
  if (nominale <= 0 || reale <= 0) return v => v
  // Punti fissi: estremi e divisioni valide, in ordine e crescenti su entrambi gli assi.
  const fissi: [number, number][] = [[0, 0]]
  for (const a of [...ancore].sort((x, y) => x.nominale - y.nominale)) {
    const [n0, r0] = fissi[fissi.length - 1]
    if (a.nominale > n0 && a.nominale < nominale && a.reale > r0 && a.reale < reale) fissi.push([a.nominale, a.reale])
  }
  fissi.push([nominale, reale])

  const punti: [number, number][] = [fissi[0]]
  for (let i = 1; i < fissi.length; i++) {
    const [n0, r0] = fissi[i - 1]
    const [n1, r1] = fissi[i]
    const sx = i === 1 ? ZONA_BORDO : MEZZA_ZONA
    const dx = i === fissi.length - 1 ? ZONA_BORDO : MEZZA_ZONA
    // Zone rigide intere se ci stanno, altrimenti ristrette (resta sempre un tratto che si allunga).
    const k = Math.min(1, (0.9 * (n1 - n0)) / (sx + dx), (0.9 * (r1 - r0)) / (sx + dx))
    punti.push([n0 + sx * k, r0 + sx * k], [n1 - dx * k, r1 - dx * k], [n1, r1])
  }
  return v => {
    if (v <= 0) return v
    for (let i = 1; i < punti.length; i++) {
      const [x0, y0] = punti[i - 1]
      const [x1, y1] = punti[i]
      if (v <= x1) return x1 > x0 ? y0 + ((v - x0) * (y1 - y0)) / (x1 - x0) : y1
    }
    return v - nominale + reale
  }
}

export interface DisegnoVoce {
  viewBox: string
  larghezza: number
  altezza: number
  /** Punti SVG (y verso il basso) di ogni profilo */
  profili: string[]
}

export function disegnoVoce(
  s: { albero: NodoStruttura[]; poligoni: number[][]; l_nominale: number | null; h_nominale: number | null },
  v: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'>,
): DisegnoVoce | null {
  if (s.poligoni.length === 0 || !s.l_nominale || !s.h_nominale) return null
  const xs = s.poligoni.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = s.poligoni.flatMap(p => p.filter((_, i) => i % 2 === 1))
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const L0 = s.l_nominale
  const H0 = s.h_nominale
  const L = v.larghezza && v.larghezza > 0 ? v.larghezza : L0
  const H = v.altezza && v.altezza > 0 ? v.altezza : H0

  // Due montanti alla stessa x (in zone diverse della struttura) sono un'unica ancora.
  const divisioni = divisioniStruttura(s.albero)
  const ancore = (tipo: 'traverso' | 'montante', nom: number, rea: number) => {
    const viste = new Set<number>()
    const out: { nominale: number; reale: number }[] = []
    for (const d of divisioni.filter(x => x.tipo === tipo)) {
      const k = Math.round(d.nominale)
      if (viste.has(k)) continue
      viste.add(k)
      out.push({ nominale: d.nominale, reale: v.quote[d.codice] ?? (d.nominale * rea) / nom })
    }
    return out
  }
  const fx = mappaAsse(L0, L, ancore('montante', L0, L))
  const fy = mappaAsse(H0, H, ancore('traverso', H0, H))

  const profili = s.poligoni.map(p => {
    const coppie: string[] = []
    for (let i = 0; i < p.length; i += 2) coppie.push(`${tondo(fx(p[i] - x0))},${tondo(H - fy(p[i + 1] - y0))}`)
    return coppie.join(' ')
  })
  const margine = Math.max(5, Math.round(Math.min(L, H) * 0.02))
  return { viewBox: `${-margine} ${-margine} ${L + 2 * margine} ${H + 2 * margine}`, larghezza: L, altezza: H, profili }
}
