// Accostamento delle sezioni come l'ha disegnato FP PRO.
// FP PRO non calcola le ante e i vetri con una formula: l'operatore accosta graficamente i DXF
// dei profili con le tolleranze, e FP PRO ha cosi' la misura esatta di ogni pezzo. In una struttura
// ben definita quegli accostamenti sono costanti: cambiando L e H cambiano solo le lunghezze.
// Qui si leggono da una commessa calcolata (pezzi con RealX/RealY/RealL/RealH nel file JOB) e si
// scrivono sui nodi della stessa struttura: il calcolo li usa al posto delle stime di WinStudio.
import type { AccostamentoNodo, NodoStruttura, PezzoStruttura } from '../strutture-xml'
import { pezziECampi, type Larghezze } from './geometria'
import type { SezioneProfilo } from '../dxf-sezione'

const RIPORTI = new Set([8150, 8210, 8240, 8250])
const tondo = (v: number) => Math.round(v * 100) / 100

interface Rett { x0: number; y0: number; x1: number; y1: number }
const rettangolo = (pezzi: PezzoStruttura[]): Rett | null => {
  const r = pezzi.map(p => p.reale).filter(x => x !== undefined)
  if (r.length === 0) return null
  return {
    x0: Math.min(...r.map(p => p.x)), x1: Math.max(...r.map(p => p.x + p.l)),
    y0: Math.min(...r.map(p => p.y - p.h)), y1: Math.max(...r.map(p => p.y)),
  }
}

const visitaTutti = (nodi: NodoStruttura[], f: (n: NodoStruttura) => void) =>
  nodi.forEach(n => { f(n); visitaTutti(n.figli, f) })

/**
 * Accostamenti per codice di nodo, letti dall'albero di una commessa calcolata da FP PRO
 * (alle sue misure L x H). Due passaggi: prima le ante (dalla zona del telaio), poi i
 * riempimenti (dalla zona dentro le ante gia' accostate).
 */
export function accostamentiDaCampione(
  albero: NodoStruttura[],
  misure: { L: number; H: number },
  larghezze: Larghezze,
  sezione: (dxf: string) => SezioneProfilo | null,
): Record<string, AccostamentoNodo> {
  const copia = structuredClone(albero)
  const geo = () => pezziECampi(copia, { ...misure, L0: misure.L, H0: misure.H, quote: {} }, larghezze, sezione)
  const esito: Record<string, AccostamentoNodo> = {}

  let { zone } = geo()
  visitaTutti(copia, n => {
    if (n.tipo !== 8610 && n.tipo !== 8620) return
    const z = zone[n.codice]?.zona
    const k = Math.max(1, n.elementi)
    const ante = Array.from({ length: k }, (_, i) => rettangolo(n.pezzi.filter(p => !RIPORTI.has(p.tipo) && p.indice === i && p.tipo !== 8510 && p.tipo !== 8500)))
    if (!z || ante.some(a => a === null)) return
    const a = ante as Rett[]
    const fughe = a.slice(1).map((r, i) => r.x0 - a[i].x1)
    const acc = {
      sx: tondo(a[0].x0 - z.x0), dx: tondo(z.x1 - a[k - 1].x1),
      basso: tondo(a[0].y0 - z.y0), alto: tondo(z.y1 - a[0].y1),
      fuga: tondo(fughe.length ? fughe.reduce((s, v) => s + v, 0) / fughe.length : 0),
    }
    n.accostamento = { ...n.accostamento, ante: acc }
    esito[n.codice] = { ...esito[n.codice], ante: acc }
  })

  zone = geo().zone
  visitaTutti(copia, n => {
    const r = n.pezzi.find(p => (p.tipo === 8510 || p.tipo === 8500) && p.reale)
    const z = zone[n.codice]
    if (!r?.reale || !z) return
    const acc = { l: tondo(z.L - r.reale.l), h: tondo(z.H - r.reale.h) }
    esito[n.codice] = { ...esito[n.codice], riempimento: acc }
  })
  return esito
}

/** Scrive gli accostamenti sui nodi (per codice): i nodi senza accostamento restano con la stima. */
export function applicaAccostamenti(albero: NodoStruttura[], accostamenti: Record<string, AccostamentoNodo>): NodoStruttura[] {
  const copia = structuredClone(albero)
  visitaTutti(copia, n => {
    const a = accostamenti[n.codice]
    if (a) n.accostamento = a
  })
  return copia
}
