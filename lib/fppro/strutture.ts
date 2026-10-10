// Regole della pagina Strutture (solo app: il ponte non lo usa).
import type { AccessorioStruttura, KitStruttura, NodoStruttura } from './strutture-xml'

const ETICHETTE: Record<number, string> = {
  8050: 'Telaio', 8060: 'Montante', 8070: 'Traverso', 8080: 'Cambio battuta',
  8090: 'Anta battente', 8100: 'Anta scorrevole', 8101: 'Anta scorrevole fissa',
  8110: 'Fascia', 8120: 'Zoccolo', 8130: 'Soglia', 8150: 'Riporto verticale',
  8160: 'Riporto orizzontale', 8170: 'Profilo multiuso', 8180: 'Fermavetro',
  8190: 'Compensatore', 8210: 'Incrocio ante scorrevoli', 8240: 'Riporto bilico (anta)',
  8250: 'Riporto bilico (telaio)', 8260: 'Sottozoccolo', 8270: 'Fermapannello',
  8280: 'Guida', 8290: 'Cassonetto', 8300: 'Ovalina o doga', 8500: 'Pannello', 8510: 'Vetro',
}

export function etichettaTipo(tipo: number): string {
  return ETICHETTE[tipo] ?? `Tipo ${tipo}`
}

const numeri = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

function nomeProfilo(dxf: string): string {
  const base = dxf.slice(dxf.lastIndexOf('\\') + 1)
  return base.replace(/\.dxf$/i, '')
}

export function riassuntoPezzi(albero: NodoStruttura[]): { ruolo: string; profilo: string; serie: string; quantita: number }[] {
  const conta = new Map<string, { tipo: number; profilo: string; serie: string; quantita: number }>()
  const visita = (nodi: NodoStruttura[]) => {
    for (const n of nodi) {
      for (const p of n.pezzi) {
        const chiave = `${p.tipo}|${p.dxf}`
        const r = conta.get(chiave)
        if (r) r.quantita++
        else conta.set(chiave, { tipo: p.tipo, profilo: nomeProfilo(p.dxf), serie: p.serie, quantita: 1 })
      }
      visita(n.figli)
    }
  }
  visita(albero)
  return [...conta.values()]
    .sort((a, b) => a.tipo - b.tipo || a.profilo.localeCompare(b.profilo))
    .map(r => ({ ruolo: etichettaTipo(r.tipo), profilo: r.profilo, serie: r.serie, quantita: r.quantita }))
}

export function regolaQuantita(a: AccessorioStruttura): string {
  const q = numeri.format(a.quantita)
  if (a.tipo === 2 || a.tipo === 4) return `${q} × perimetro (m)`
  if (a.min !== null && a.max !== null) return `${q} pz se ${numeri.format(a.min)}–${numeri.format(a.max)} mm`
  if (a.passo !== null && a.passo > 0) return `${q} pz, 1 ogni ${numeri.format(a.passo)} mm`
  if (a.formula) return `${q} pz · formula ${a.formula}`
  return `${q} pz`
}

export function accessoriStruttura(albero: NodoStruttura[]): { accessori: AccessorioStruttura[]; kit: KitStruttura[] } {
  const accessori: AccessorioStruttura[] = []
  const kit: KitStruttura[] = []
  const visita = (nodi: NodoStruttura[]) => {
    for (const n of nodi) {
      accessori.push(...n.accessori)
      kit.push(...n.kit)
      visita(n.figli)
    }
  }
  visita(albero)
  return { accessori, kit }
}

/** Poligoni di FP PRO (y verso l'alto) -> punti SVG (y verso il basso), con un margine del 2% del lato corto, minimo 5 mm. */
export function vistaPoligoni(poligoni: number[][]): { viewBox: string; punti: string[] } | null {
  if (poligoni.length === 0) return null
  const xs = poligoni.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = poligoni.flatMap(p => p.filter((_, i) => i % 2 === 1))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const margine = Math.max(5, Math.round(Math.min(maxX - minX, maxY - minY) * 0.02))
  const punti = poligoni.map(p => {
    const coppie: string[] = []
    for (let i = 0; i < p.length; i += 2) coppie.push(`${p[i] - minX},${maxY - p[i + 1]}`)
    return coppie.join(' ')
  })
  return {
    viewBox: `${-margine} ${-margine} ${maxX - minX + 2 * margine} ${maxY - minY + 2 * margine}`,
    punti,
  }
}
