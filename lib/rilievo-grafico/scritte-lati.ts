// Scritte libere sui lati della voce disegnata (es. "L MAG", "soglia ribassata"): chiave =
// indice del lato, lo stesso dei pezzi telaio T0, T1... (la forma a punti non rinumera i lati).
import type { LatoContorno } from './prm'
import type { Forma } from '@/types/rilievo-grafico'
import type { VoceGraficoDati } from '@/types/rilievo-fp'
import { ampiezzaArco, formaInPunti, lunghezzaLato } from './forma'

/** Angolo leggibile in gradi (y verso l'alto): mai a testa in giu' */
const leggibile = (gradi: number) => (gradi > 90 + 1e-6 ? gradi - 180 : gradi <= -90 + 1e-6 ? gradi + 180 : gradi)

/**
 * Dove scrivere il testo di un lato: a meta' del lato (a meta' dell'arco per gli archi),
 * spostato verso l'esterno di `distanza` mm. Contorno antiorario: l'esterno e' a destra.
 * Coordinate in mm con y verso l'alto; `angolo` in gradi lungo il lato.
 */
export function posizioneScritta(l: LatoContorno, distanza: number): { x: number; y: number; angolo: number } {
  if (l.tipo === 'retta') {
    const dx = l.a.x - l.da.x, dy = l.a.y - l.da.y
    const len = Math.hypot(dx, dy) || 1
    const u = { x: dx / len, y: dy / len }
    return {
      x: (l.da.x + l.a.x) / 2 + u.y * distanza,
      y: (l.da.y + l.a.y) / 2 - u.x * distanza,
      angolo: leggibile((Math.atan2(u.y, u.x) * 180) / Math.PI),
    }
  }
  const r = Math.hypot(l.da.x - l.centro.x, l.da.y - l.centro.y)
  const a1 = Math.atan2(l.da.y - l.centro.y, l.da.x - l.centro.x)
  const am = a1 + ((l.orario ? -1 : 1) * ampiezzaArco(l)) / 2
  const radiale = { x: Math.cos(am), y: Math.sin(am) }
  // Arco che esce (antiorario attorno al centro): l'esterno e' lontano dal centro; che rientra: verso il centro.
  const verso = l.orario ? -1 : 1
  return {
    x: l.centro.x + radiale.x * (r + verso * distanza),
    y: l.centro.y + radiale.y * (r + verso * distanza),
    angolo: leggibile((Math.atan2(radiale.x, -radiale.y) * 180) / Math.PI),
  }
}

/** Solo le scritte dei lati che esistono ancora, senza quelle vuote */
export function notePulite(note: Record<string, string> | undefined, nLati: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, t] of Object.entries(note ?? {})) {
    const i = Number(k)
    if (Number.isInteger(i) && i >= 0 && i < nLati && t.trim()) out[k] = t.trim()
  }
  return out
}

/**
 * Carattere e distanza dal lato per una scritta: il testo sta dentro la lunghezza del lato
 * (si rimpicciolisce se serve) e su un serramento stretto non va oltre un quarto del lato corto.
 * Larghezza di un carattere stimata a 0,6 volte la sua altezza.
 */
export function misuraScritta(l: LatoContorno, testo: string, base: number, W: number, H: number): { carattere: number; distanza: number } {
  const massimo = (0.9 * lunghezzaLato(l)) / (0.6 * Math.max(1, testo.length))
  const carattere = Math.min(base, massimo)
  return { carattere, distanza: Math.min(base * 2.2, Math.min(W, H) * 0.25) }
}

/**
 * Forma nuova con le scritte dei lati: restano se il numero dei lati non cambia (quote, archi);
 * se cambia (forma scelta da Forme) si tolgono, perche' l'indice indicherebbe un altro lato.
 */
export function graficoConForma(g: VoceGraficoDati, forma: Forma): VoceGraficoDati {
  const nuovo: VoceGraficoDati = { ...g, forma }
  if (!g.noteLati) return nuovo
  const prima = formaInPunti(g.forma).length, dopo = formaInPunti(forma).length
  if (prima !== dopo) delete nuovo.noteLati
  else nuovo.noteLati = notePulite(g.noteLati, dopo)
  return nuovo
}

/** Scritta di un lato aggiunta, cambiata o tolta (testo vuoto) */
export function conNotaLato(g: VoceGraficoDati, lato: number, testo: string): VoceGraficoDati {
  return { ...g, noteLati: notePulite({ ...g.noteLati, [lato]: testo }, formaInPunti(g.forma).length) }
}
