// ============================================================
// Tipi per il sistema rilievo misure — editor grafico forme
// ============================================================

export interface GridPoint {
  id: string
  gx: number  // indice griglia 0..(GRID_N-1)
  gy: number
}

export interface ShapeSegment {
  id: string
  fromId: string
  toId: string
  tipo: 'retta' | 'curva'
  // Offset del punto di controllo bezier dal punto medio del segmento (in unità griglia)
  cpDx: number
  cpDy: number
  // Configurazione misura
  misuraNome: string           // es. "Larghezza"
  misuraTipo: 'input' | 'calcolato'
  misuraFormula: string        // vuoto se input; espressione se calcolato
}

export interface AngoloConfig {
  puntoId: string
  tipo: 'fisso' | 'automatico'
  gradi: number | null         // solo se fisso
}

export interface FormaShape {
  punti: GridPoint[]
  segmenti: ShapeSegment[]
  angoliConfig: AngoloConfig[]
  chiusa: boolean
}

export interface FormaSerramentoDb {
  id: string
  organization_id: string
  nome: string
  attiva: boolean
  ordine: number
  shape: FormaShape
  created_at: string
}

export type FormaSerramentoInput = {
  nome: string
  attiva: boolean
  ordine: number
  shape: FormaShape
}

// ============================================================
// Helper: converte FormaShape → SVG path d attribute
// per uso in anteprima (viewBox 0 0 viewBoxSize viewBoxSize)
// ============================================================
export function shapeToPath(shape: FormaShape, viewBoxSize = 60): string | null {
  if (!shape.chiusa || shape.segmenti.length < 3 || shape.punti.length < 3) return null

  const gxs = shape.punti.map((p) => p.gx)
  const gys = shape.punti.map((p) => p.gy)
  const minGx = Math.min(...gxs), maxGx = Math.max(...gxs)
  const minGy = Math.min(...gys), maxGy = Math.max(...gys)
  const rangeGx = maxGx - minGx || 1
  const rangeGy = maxGy - minGy || 1

  const pad = viewBoxSize * 0.1
  const availW = viewBoxSize - pad * 2
  const availH = viewBoxSize - pad * 2
  const scale = Math.min(availW / rangeGx, availH / rangeGy)
  const ox = pad + (availW - rangeGx * scale) / 2
  const oy = pad + (availH - rangeGy * scale) / 2

  const px = (gx: number) => ox + (gx - minGx) * scale
  const py = (gy: number) => oy + (gy - minGy) * scale

  let d = ''
  shape.segmenti.forEach((seg, i) => {
    const from = shape.punti.find((p) => p.id === seg.fromId)
    const to = shape.punti.find((p) => p.id === seg.toId)
    if (!from || !to) return
    const fx = px(from.gx), fy = py(from.gy)
    const tx = px(to.gx), ty = py(to.gy)
    if (i === 0) d += `M ${fx.toFixed(1)} ${fy.toFixed(1)}`
    if (seg.tipo === 'curva') {
      const midGx = (from.gx + to.gx) / 2
      const midGy = (from.gy + to.gy) / 2
      const cpx = (ox + (midGx - minGx) * scale) + seg.cpDx * scale
      const cpy = (oy + (midGy - minGy) * scale) + seg.cpDy * scale
      d += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`
    } else {
      d += ` L ${tx.toFixed(1)} ${ty.toFixed(1)}`
    }
  })
  return d ? d + ' Z' : null
}
