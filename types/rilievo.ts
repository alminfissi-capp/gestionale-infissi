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
  // 'retta' = linea dritta
  // 'curva' = curva bezier quadratica (cpDx/cpDy = punto di controllo)
  // 'arco'  = arco circolare vero (cpDx/cpDy = offset del vertice/freccia dal punto medio della corda)
  tipo: 'retta' | 'curva' | 'arco'
  // Offset del punto di controllo / vertice arco dal punto medio del segmento (in unità griglia)
  cpDx: number
  cpDy: number
  // Misura del lato/corda
  misuraNome: string           // es. "Larghezza"
  misuraTipo: 'input' | 'calcolato'
  misuraFormula: string
  // Misura della freccia (solo per tipo='arco')
  // sagittaTipo='calcolato' con sagittaFormula = "Larghezza / 2" → arco a tutto sesto
  sagittaNome: string          // es. "Freccia", "Vertice"
  sagittaTipo: 'input' | 'calcolato'
  sagittaFormula: string       // es. "Larghezza / 2" per tutto sesto
}

export interface AngoloConfig {
  puntoId: string
  tipo: 'fisso' | 'automatico'
  gradi: number | null
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
// Helper geometria archi circolari
// ============================================================

/**
 * Calcola il raggio di un arco circolare dato corda e freccia.
 * Valida per arco singolo (es. arco a tutto sesto, ribassato, generico).
 * R = (L² + 4F²) / (8F)
 * Per semicerchio (arco a tutto sesto): F = L/2 → R = L/2
 */
export function arcRadius(chord: number, sagitta: number): number {
  if (sagitta <= 0) return Infinity
  return (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta)
}

/**
 * Calcola il raggio per un arco spezzato (arco acuto / gotico).
 * I centri degli archi sono sulla linea d'imposta.
 * R = (L² + 4V²) / (4L)
 * dove L = larghezza totale, V = altezza del vertice sopra l'imposta
 */
export function arcRadiusSpezzato(larghezza: number, vertice: number): number {
  if (larghezza <= 0) return Infinity
  return (larghezza * larghezza + 4 * vertice * vertice) / (4 * larghezza)
}

/**
 * Costruisce il path SVG "A" per un arco circolare.
 * @param x1,y1  punto iniziale (SVG coords)
 * @param x2,y2  punto finale
 * @param cpDx,cpDy  offset del vertice dal punto medio della corda (in grid units)
 * @param cellSize  pixel per grid unit nel canvas (CELL)
 * @param includeMove  se true, aggiunge M x1 y1 prima dell'arco
 */
export function arcSvgPath(
  x1: number, y1: number,
  x2: number, y2: number,
  cpDx: number, cpDy: number,
  cellSize: number,
  includeMove = true
): string {
  const dx = x2 - x1, dy = y2 - y1
  const chord = Math.sqrt(dx * dx + dy * dy)
  const sagX = cpDx * cellSize
  const sagY = cpDy * cellSize
  const sagitta = Math.sqrt(sagX * sagX + sagY * sagY)

  if (sagitta < 0.1) {
    return includeMove
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `L ${x2} ${y2}`
  }

  const R = arcRadius(chord, sagitta)
  const large = sagitta > chord / 2 ? 1 : 0
  // Prodotto vettoriale: dx * cpDy - dy * cpDx
  // Negativo → l'arco bows "sopra" la corda per chord orizzontale → sweep=1
  const cross = dx * cpDy - dy * cpDx
  const sweep = cross < 0 ? 1 : 0

  const Rf = R.toFixed(2)
  const x2f = x2.toFixed(1), y2f = y2.toFixed(1)
  return includeMove
    ? `M ${x1} ${y1} A ${Rf} ${Rf} 0 ${large} ${sweep} ${x2f} ${y2f}`
    : `A ${Rf} ${Rf} 0 ${large} ${sweep} ${x2f} ${y2f}`
}

/**
 * Stessa logica, ma lavora in unità griglia normalizzate (per shapeToPath).
 * cpDx/cpDy sono in unità griglia, scale converte da grid a SVG path.
 */
export function arcSvgPathScaled(
  fx: number, fy: number,
  tx: number, ty: number,
  cpDx: number, cpDy: number,
  scale: number,
  includeMove = false
): string {
  const dx = tx - fx, dy = ty - fy
  const chord = Math.sqrt(dx * dx + dy * dy)
  if (sagittaScaled < 0.01) {
    return includeMove
      ? `M ${fx.toFixed(1)} ${fy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`
      : `L ${tx.toFixed(1)} ${ty.toFixed(1)}`
  }

  const R = arcRadius(chord, sagittaScaled)
  const large = sagittaScaled > chord / 2 ? 1 : 0
  const cross = dx * cpDy - dy * cpDx
  const sweep = cross < 0 ? 1 : 0
  const Rf = R.toFixed(2)

  return includeMove
    ? `M ${fx.toFixed(1)} ${fy.toFixed(1)} A ${Rf} ${Rf} 0 ${large} ${sweep} ${tx.toFixed(1)} ${ty.toFixed(1)}`
    : `A ${Rf} ${Rf} 0 ${large} ${sweep} ${tx.toFixed(1)} ${ty.toFixed(1)}`
}

/**
 * Calcola cpDx, cpDy per un arco a tutto sesto (semicerchio).
 * Il vertice si trova esattamente a chord/2 perpendicolare alla corda,
 * bowing "a sinistra" per chord che va da sx a dx (cioè verso l'alto per finestre).
 */
export function cpForTuttoSesto(
  fromGx: number, fromGy: number,
  toGx: number, toGy: number
): { cpDx: number; cpDy: number } {
  const dxGrid = toGx - fromGx
  const dyGrid = toGy - fromGy
  // Perp "destra" (verso l'alto per corda orizzontale da sx a dx)
  const chordGrid = Math.sqrt(dxGrid * dxGrid + dyGrid * dyGrid)
  if (chordGrid < 0.001) return { cpDx: 0, cpDy: 0 }
  // sagitta = chord/2; direzione = perp destra = (dy, -dx) / chord
  const cpDx = dyGrid / 2
  const cpDy = -dxGrid / 2
  return { cpDx, cpDy }
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
    } else if (seg.tipo === 'arco') {
      d += ' ' + arcSvgPathScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, scale, false)
    } else {
      d += ` L ${tx.toFixed(1)} ${ty.toFixed(1)}`
    }
  })
  return d ? d + ' Z' : null
}
