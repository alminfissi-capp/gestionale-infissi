/**
 * Miniatura della sezione di un profilo dal suo DXF di FP PRO: un path SVG con la y
 * ribaltata (nel DXF cresce verso l'alto, in SVG verso il basso) e il riquadro che lo
 * contiene. I DXF di FP PRO hanno solo LINE e ARC (verificato su 2000 file); per
 * sicurezza si leggono anche CIRCLE e LWPOLYLINE (senza curvature). Testi e ATTDEF no.
 *
 * Lo usa il ponte sul PC (Node senza build): niente import.
 */

export interface MiniaturaDxf {
  viewBox: string
  d: string
}

/** Oltre questa lunghezza la miniatura pesa troppo per il catalogo nel telefono. */
const MAX_CARATTERI = 40000

const num = (v: number): string => {
  const r = Math.round(v * 10) / 10
  return Object.is(r, -0) ? '0' : String(r)
}

export function dxfInSvg(testo: string): MiniaturaDxf | null {
  const righe = testo.replace(/\r/g, '').split('\n')
  const coppie: [number, string][] = []
  for (let i = 0; i + 1 < righe.length; i += 2) coppie.push([Number(righe[i].trim()), righe[i + 1].trim()])

  const parti: string[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  // Punto in coordinate SVG (y ribaltata), allargando il riquadro.
  const punto = (x: number, y: number): string => {
    const sy = -y
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
    return `${num(x)} ${num(sy)}`
  }

  const arco = (cx: number, cy: number, r: number, a1: number, a2: number) => {
    const rad = (g: number) => (g * Math.PI) / 180
    let ampiezza = (((a2 - a1) % 360) + 360) % 360
    if (ampiezza === 0) ampiezza = 360
    if (ampiezza === 360) {
      const p0 = punto(cx + r, cy), p1 = punto(cx - r, cy)
      punto(cx, cy + r); punto(cx, cy - r)
      parti.push(`M${p0}A${num(r)} ${num(r)} 0 1 0 ${p1}A${num(r)} ${num(r)} 0 1 0 ${p0}`)
      return
    }
    const inizio = punto(cx + r * Math.cos(rad(a1)), cy + r * Math.sin(rad(a1)))
    const fine = punto(cx + r * Math.cos(rad(a1 + ampiezza)), cy + r * Math.sin(rad(a1 + ampiezza)))
    // Estremi dell'arco sugli assi: entrano nel riquadro solo se l'arco ci passa.
    for (const g of [0, 90, 180, 270]) {
      const dist = (((g - a1) % 360) + 360) % 360
      if (dist <= ampiezza) punto(cx + r * Math.cos(rad(g)), cy + r * Math.sin(rad(g)))
    }
    // Antiorario nel DXF; con la y ribaltata in SVG diventa sweep-flag 0.
    parti.push(`M${inizio}A${num(r)} ${num(r)} 0 ${ampiezza > 180 ? 1 : 0} 0 ${fine}`)
  }

  let sezione = ''
  let i = 0
  while (i < coppie.length) {
    const [codice, valore] = coppie[i]
    if (codice !== 0) { i++; continue }
    if (valore === 'SECTION') {
      sezione = coppie[i + 1]?.[0] === 2 ? coppie[i + 1][1] : ''
      i += 2
      continue
    }
    // Gruppi dell'entita' fino al prossimo codice 0.
    let j = i + 1
    const gruppi: [number, string][] = []
    while (j < coppie.length && coppie[j][0] !== 0) gruppi.push(coppie[j++])
    i = j
    if (sezione !== 'ENTITIES') continue
    const val = (c: number) => {
      const g = gruppi.find(x => x[0] === c)
      return g ? Number(g[1]) : NaN
    }
    if (valore === 'LINE') {
      const [x1, y1, x2, y2] = [val(10), val(20), val(11), val(21)]
      if ([x1, y1, x2, y2].every(Number.isFinite)) parti.push(`M${punto(x1, y1)}L${punto(x2, y2)}`)
    } else if (valore === 'ARC' || valore === 'CIRCLE') {
      const [cx, cy, r] = [val(10), val(20), val(40)]
      const a1 = valore === 'ARC' ? val(50) : 0
      const a2 = valore === 'ARC' ? val(51) : 360
      if ([cx, cy, r, a1, a2].every(Number.isFinite) && r > 0) arco(cx, cy, r, a1, valore === 'CIRCLE' ? a1 : a2)
    } else if (valore === 'LWPOLYLINE') {
      const xs = gruppi.filter(g => g[0] === 10).map(g => Number(g[1]))
      const ys = gruppi.filter(g => g[0] === 20).map(g => Number(g[1]))
      const chiusa = (val(70) & 1) === 1
      const punti = xs.map((x, k) => [x, ys[k]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      if (punti.length >= 2) parti.push(`M${punti.map(([x, y]) => punto(x, y)).join('L')}${chiusa ? 'Z' : ''}`)
    }
  }

  if (parti.length === 0 || !Number.isFinite(minX)) return null
  const d = parti.join('')
  if (d.length > MAX_CARATTERI) return null
  return { viewBox: `${num(minX)} ${num(minY)} ${num(maxX - minX)} ${num(maxY - minY)}`, d }
}
