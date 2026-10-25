// Simboli di apertura nel disegno della voce, come in FP PRO (vista interna): triangolo
// tratteggiato con la punta sul lato della maniglia, triangolo della ribalta con la punta in
// alto, maniglia sull'anta principale, cerniere sul lato opposto, frecce per gli scorrevoli.
// Vasistas: cerniere in basso, maniglia in alto al centro, punta del triangolo in alto;
// a sporgere: l'opposto (cerniere in alto, maniglia in basso, punta in basso).
// Le ante e le loro posizioni vengono dalla stessa geometria del calcolo.
import { LARGHEZZE_PREDEFINITE, pezziECampi, type AntaGeometria } from './calcolo/geometria'
import type { NodoStruttura } from './strutture-xml'

export type Simbolo =
  | { tipo: 'apertura' | 'ribalta' | 'scorrimento'; x1: number; y1: number; x2: number; y2: number }
  | { tipo: 'maniglia' | 'cerniera'; x: number; y: number; w: number; h: number }

const MANIGLIA = { w: 20, h: 140, dal: 15 }
const CERNIERA = { w: 12, h: 70, dalBordo: 160 }

export function simboliApertura(
  albero: NodoStruttura[],
  misure: { L: number; H: number; L0: number; H0: number; quote: Record<string, number> },
  scelte: { mano: 'sx' | 'dx' | null; ribalta: boolean },
): Simbolo[] {
  const { ante } = pezziECampi(albero, misure, LARGHEZZE_PREDEFINITE)
  const H = misure.H
  const y = (v: number) => Math.round((H - v) * 10) / 10
  const tondo = (v: number) => Math.round(v * 10) / 10
  const out: Simbolo[] = []
  const bordo = LARGHEZZE_PREDEFINITE.anta

  const perNodo = new Map<number, AntaGeometria[]>()
  for (const a of ante) perNodo.set(a.nodo, [...(perNodo.get(a.nodo) ?? []), a])

  for (const gruppo of perNodo.values()) {
    const k = gruppo.length
    if (gruppo[0].tipo === 8620) {
      // Scorrevole: freccia a meta' altezza verso il centro della finestra.
      const centro = (gruppo[0].zona.x0 + gruppo[k - 1].zona.x1) / 2
      for (const a of gruppo) {
        const mezzo = (a.zona.x0 + a.zona.x1) / 2
        const lungo = (a.zona.x1 - a.zona.x0) * 0.3
        const verso = mezzo <= centro ? 1 : -1
        const ym = y((a.zona.y0 + a.zona.y1) / 2)
        out.push({ tipo: 'scorrimento', x1: tondo(mezzo - verso * lungo / 2), y1: ym, x2: tondo(mezzo + verso * lungo / 2), y2: ym })
      }
      continue
    }
    if (gruppo[0].apertura !== 'battente') {
      // Cerniere orizzontali: ogni anta ha la sua maniglia, la mano non conta.
      const inBasso = gruppo[0].apertura === 'vasistas'
      for (const a of gruppo) {
        const z = { x0: a.zona.x0 + bordo, x1: a.zona.x1 - bordo, y0: a.zona.y0 + bordo, y1: a.zona.y1 - bordo }
        if (z.x1 <= z.x0 || z.y1 <= z.y0) continue
        const yc = inBasso ? z.y0 : z.y1
        const yp = inBasso ? z.y1 : z.y0
        const xm = (z.x0 + z.x1) / 2
        out.push({ tipo: 'apertura', x1: tondo(z.x0), y1: y(yc), x2: tondo(xm), y2: y(yp) })
        out.push({ tipo: 'apertura', x1: tondo(z.x1), y1: y(yc), x2: tondo(xm), y2: y(yp) })
        // Cerniera = rettangolo coricato: alto CERNIERA.w, lungo CERNIERA.h
        const yCerniera = inBasso ? a.zona.y0 + 2 + CERNIERA.w : a.zona.y1 - 2
        for (const x of [a.zona.x0 + CERNIERA.dalBordo - CERNIERA.h, a.zona.x1 - CERNIERA.dalBordo]) {
          out.push({ tipo: 'cerniera', x: tondo(x), y: y(yCerniera), w: CERNIERA.h, h: CERNIERA.w })
        }
        const yManiglia = inBasso ? a.zona.y1 - MANIGLIA.dal : a.zona.y0 + MANIGLIA.dal + MANIGLIA.w
        out.push({ tipo: 'maniglia', x: tondo((a.zona.x0 + a.zona.x1) / 2 - MANIGLIA.h / 2), y: y(yManiglia), w: MANIGLIA.h, h: MANIGLIA.w })
      }
      continue
    }
    // Battente: anta principale dalla mano scelta, altrimenti quella di FP PRO.
    const principale = scelte.mano === 'sx' ? 0 : scelte.mano === 'dx' ? k - 1 : Math.min(Math.max(gruppo[0].principale, 0), k - 1)
    gruppo.forEach((a, i) => {
      const z = { x0: a.zona.x0 + bordo, x1: a.zona.x1 - bordo, y0: a.zona.y0 + bordo, y1: a.zona.y1 - bordo }
      if (z.x1 <= z.x0 || z.y1 <= z.y0) return
      // Cerniere sul lato esterno: a sinistra le ante della meta' sinistra, a destra le altre.
      const cerniereADestra = k === 1 ? scelte.mano === 'dx' : i > (k - 1) / 2
      const xc = cerniereADestra ? z.x1 : z.x0
      const xm = cerniereADestra ? z.x0 : z.x1
      const ym = y((z.y0 + z.y1) / 2)
      out.push({ tipo: 'apertura', x1: tondo(xc), y1: y(z.y1), x2: tondo(xm), y2: ym })
      out.push({ tipo: 'apertura', x1: tondo(xc), y1: y(z.y0), x2: tondo(xm), y2: ym })
      const xCerniera = cerniereADestra ? a.zona.x1 - CERNIERA.w - 2 : a.zona.x0 + 2
      for (const h of [a.zona.y1 - CERNIERA.dalBordo, a.zona.y0 + CERNIERA.dalBordo - CERNIERA.h]) {
        out.push({ tipo: 'cerniera', x: tondo(xCerniera), y: y(h + CERNIERA.h), w: CERNIERA.w, h: CERNIERA.h })
      }
      if (i !== principale) return
      const xManiglia = cerniereADestra ? a.zona.x0 + MANIGLIA.dal : a.zona.x1 - MANIGLIA.dal - MANIGLIA.w
      out.push({ tipo: 'maniglia', x: tondo(xManiglia), y: y((a.zona.y0 + a.zona.y1) / 2 + MANIGLIA.h / 2), w: MANIGLIA.w, h: MANIGLIA.h })
      if (scelte.ribalta) {
        const xt = (z.x0 + z.x1) / 2
        out.push({ tipo: 'ribalta', x1: tondo(z.x0), y1: y(z.y0), x2: tondo(xt), y2: y(z.y1) })
        out.push({ tipo: 'ribalta', x1: tondo(z.x1), y1: y(z.y0), x2: tondo(xt), y2: y(z.y1) })
      }
    })
  }
  return out
}
