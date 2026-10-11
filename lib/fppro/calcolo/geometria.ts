// Pezzi (profili con lunghezza) e campi (vetri/pannelli) di una struttura alle misure
// del rilievo. Stima per il preventivo: le misure esatte di produzione sono di FP PRO.
// Lunghezze sui bordi esterni della zona occupata (taglio a 45°): FP PRO aggiunge a volte
// qualche centimetro per le alette dei profili, che raramente cambia il numero di barre.
import type { NodoStruttura } from '../strutture-xml'

export interface PezzoCalcolo { dxf: string; tipo: number; lunghezza: number }
export interface CampoCalcolo { codiceNodo: string; tipo: 'vetro' | 'pannello'; dxf: string; l: number; h: number }
/** Larghezze in vista (mm) usate per ridurre le zone interne */
export interface Larghezze { telaio: number; anta: number; divisione: number; fermavetro: number; zoccolo: number }

export const LARGHEZZE_PREDEFINITE: Larghezze = { telaio: 50, anta: 55, divisione: 50, fermavetro: 20, zoccolo: 100 }

interface Zona { x0: number; y0: number; x1: number; y1: number }
const larg = (z: Zona) => z.x1 - z.x0
const alt = (z: Zona) => z.y1 - z.y0
/** Riporti centrali e simili: corrono per tutta l'altezza della zona delle ante */
const RIPORTI = new Set([8150, 8210, 8240, 8250])

/**
 * Larghezze delle ante: quelle con SashDim > 0 sono fisse (come in FP PRO), le altre si
 * dividono in parti uguali quello che resta. Se le fisse non ci stanno, tutte uguali.
 */
export function larghezzeAnte(totale: number, k: number, ante: Record<string, string>[]): number[] {
  const fisse = Array.from({ length: k }, (_, i) => {
    const v = Number(ante[i]?.SashDim)
    return Number.isFinite(v) && v > 0 ? v : null
  })
  const somma = fisse.reduce<number>((s, v) => s + (v ?? 0), 0)
  const libere = fisse.filter(v => v === null).length
  if (somma >= totale || (libere === 0 && somma !== totale)) return Array(k).fill(totale / k)
  return fisse.map(v => v ?? (totale - somma) / libere)
}

/** Spessore del telaio letto dai poligoni dell'anteprima: pezzo verticale appoggiato al bordo sinistro. */
export function larghezzeDaPoligoni(poligoni: number[][]): Larghezze {
  for (const p of poligoni) {
    const xs = p.filter((_, i) => i % 2 === 0)
    const ys = p.filter((_, i) => i % 2 === 1)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    if (Math.min(...xs) === 0 && h > w * 5 && w > 10 && w < 200) return { ...LARGHEZZE_PREDEFINITE, telaio: w }
  }
  return { ...LARGHEZZE_PREDEFINITE }
}

export function pezziECampi(
  albero: NodoStruttura[],
  misure: { L: number; H: number; L0: number; H0: number; quote: Record<string, number> },
  larghezze: Larghezze,
): { pezzi: PezzoCalcolo[]; campi: CampoCalcolo[]; zone: Record<number, { L: number; H: number }> } {
  const pezzi: PezzoCalcolo[] = []
  // Misure della zona di ogni nodo: le regole dei kit (L, H, perimetro) si misurano sul nodo.
  const zone: Record<number, { L: number; H: number }> = {}
  const campi: CampoCalcolo[] = []
  const aggiungi = (dxf: string, tipo: number, lunghezza: number) => {
    if (lunghezza > 0) pezzi.push({ dxf, tipo, lunghezza: Math.round(lunghezza * 10) / 10 })
  }
  const scalaX = misure.L0 > 0 ? misure.L / misure.L0 : 1
  const scalaY = misure.H0 > 0 ? misure.H / misure.H0 : 1

  const visita = (n: NodoStruttura, z: Zona, inFermavetro: boolean) => {
    if (larg(z) <= 0 || alt(z) <= 0) return
    zone[n.codice] = { L: larg(z), H: alt(z) }
    const riempimento = n.pezzi.find(p => p.tipo === 8510 || p.tipo === 8500)
    if (riempimento) {
      const r = inFermavetro ? larghezze.fermavetro : 0
      const l = larg(z) - 2 * r
      const h = alt(z) - 2 * r
      if (l > 0 && h > 0) {
        campi.push({ codiceNodo: String(n.codice), tipo: riempimento.tipo === 8510 ? 'vetro' : 'pannello', dxf: riempimento.dxf, l, h })
      }
    }
    const profili = n.pezzi.filter(p => p.tipo !== 8510 && p.tipo !== 8500)

    if (n.tipo === 8600) {
      // Pezzi del telaio nell'ordine sinistra, alto, destra, basso (un telaio a 3 lati non ha il basso).
      const telai = profili.filter(p => p.tipo === 8050)
      const lati = ['sinistra', 'alto', 'destra', 'basso'] as const
      telai.slice(0, 4).forEach((p, i) => aggiungi(p.dxf, p.tipo, lati[i] === 'sinistra' || lati[i] === 'destra' ? alt(z) : larg(z)))
      const ha = (lato: (typeof lati)[number]) => telai.length > lati.indexOf(lato)
      const dentro: Zona = {
        x0: z.x0 + (ha('sinistra') ? larghezze.telaio : 0), x1: z.x1 - (ha('destra') ? larghezze.telaio : 0),
        y0: z.y0 + (ha('basso') ? larghezze.telaio : 0), y1: z.y1 - (ha('alto') ? larghezze.telaio : 0),
      }
      profili.filter(p => p.tipo !== 8050).forEach(p => aggiungi(p.dxf, p.tipo, larg(dentro)))
      n.figli.forEach(f => visita(f, dentro, false))
      return
    }

    if ((n.tipo === 8070 && n.y !== null) || (n.tipo === 8060 && n.x !== null)) {
      // Traverso (8070) o montante (8060): divide la zona in due all'asse.
      const traverso = n.tipo === 8070
      const nominale = traverso ? n.y! : n.x!
      const asse = misure.quote[String(n.codice)] ?? nominale * (traverso ? scalaY : scalaX)
      profili.forEach(p => aggiungi(p.dxf, p.tipo, traverso ? larg(z) : alt(z)))
      const mezza = larghezze.divisione / 2
      for (const f of n.figli) {
        const pos = traverso ? f.y : f.x
        const primaParte = pos !== null && pos < nominale
        const parte: Zona = traverso
          ? (primaParte ? { ...z, y1: Math.min(z.y1, asse - mezza) } : { ...z, y0: Math.max(z.y0, asse + mezza) })
          : (primaParte ? { ...z, x1: Math.min(z.x1, asse - mezza) } : { ...z, x0: Math.max(z.x0, asse + mezza) })
        visita(f, parte, false)
      }
      return
    }

    if (n.tipo === 8610 || n.tipo === 8620) {
      // Battente o scorrevole con n ante uguali affiancate.
      const k = Math.max(1, n.elementi)
      const ante: Zona[] = []
      let x = z.x0
      for (const w of larghezzeAnte(larg(z), k, n.ante)) {
        ante.push({ ...z, x0: x, x1: x + w })
        x += w
      }
      for (let i = 0; i < k; i++) {
        profili.filter(p => !RIPORTI.has(p.tipo) && p.indice === i)
          .forEach((p, j) => aggiungi(p.dxf, p.tipo, j % 2 === 0 ? alt(ante[i]) : larg(ante[i])))
      }
      profili.filter(p => RIPORTI.has(p.tipo)).forEach(p => aggiungi(p.dxf, p.tipo, alt(z)))
      n.figli.forEach((f, i) => {
        const a = ante[Math.min(i, k - 1)]
        visita(f, { x0: a.x0 + larghezze.anta, x1: a.x1 - larghezze.anta, y0: a.y0 + larghezze.anta, y1: a.y1 - larghezze.anta }, false)
      })
      return
    }

    if (n.tipo === 8180 || n.tipo === 8270) {
      // Fermavetro / fermapannello: 4 pezzi intorno al campo.
      profili.forEach((p, j) => aggiungi(p.dxf, p.tipo, j % 2 === 0 ? alt(z) : larg(z)))
      n.figli.forEach(f => visita(f, z, true))
      return
    }

    if (n.tipo === 8110 && n.y !== null && n.figli.some(f => f.y !== null && f.y < n.y!) && n.figli.some(f => f.y !== null && f.y > n.y!)) {
      // Fascia con riempimenti sopra e sotto: divide la zona come un traverso.
      const asse = misure.quote[String(n.codice)] ?? n.y * scalaY
      profili.forEach(p => aggiungi(p.dxf, p.tipo, larg(z)))
      const mezza = larghezze.divisione / 2
      for (const f of n.figli) {
        const sotto = f.y !== null && f.y < n.y
        visita(f, sotto ? { ...z, y1: Math.min(z.y1, asse - mezza) } : { ...z, y0: Math.max(z.y0, asse + mezza) }, false)
      }
      return
    }

    if (n.tipo === 8120) {
      // Zoccolo: in basso, sotto ai riempimenti.
      profili.forEach(p => aggiungi(p.dxf, p.tipo, larg(z)))
      n.figli.forEach(f => visita(f, { ...z, y0: Math.min(z.y1, z.y0 + larghezze.zoccolo) }, inFermavetro))
      return
    }

    // Fasce, soglie e nodi sconosciuti: pezzi lunghi quanto la zona.
    profili.forEach(p => aggiungi(p.dxf, p.tipo, larg(z)))
    n.figli.forEach(f => visita(f, z, inFermavetro))
  }

  albero.forEach(n => visita(n, { x0: 0, y0: 0, x1: misure.L, y1: misure.H }, false))
  return { pezzi, campi, zone }
}
