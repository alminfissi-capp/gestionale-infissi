// ============================================================
// Tipi per il sistema rilievo misure — editor grafico forme
// ============================================================

export interface GridPoint {
  id: string
  gx: number  // indice griglia 0..(GRID_N-1)
  gy: number
}

/** Classificazione visiva di un arco circolare singolo */
export type TipoArco = 'tutto_sesto' | 'ribassato' | 'rialzato' | 'acuto' | 'libero'

export interface ShapeSegment {
  id: string
  fromId: string
  toId: string
  // 'retta' = linea dritta
  // 'curva' = curva bezier quadratica (cpDx/cpDy = punto di controllo)
  // 'arco'  = arco circolare vero (cpDx/cpDy = offset del vertice/freccia dal punto medio della corda)
  tipo: 'retta' | 'curva' | 'arco'
  // Per tipo='arco': classificazione tipologia (influenza il rendering per 'acuto')
  tipoArco?: TipoArco
  // Offset del punto di controllo / vertice arco dal punto medio del segmento (in unità griglia)
  cpDx: number
  cpDy: number
  // Misura del lato/corda
  misuraNome: string           // es. "Larghezza"
  misuraTipo: 'input' | 'calcolato'
  misuraFormula: string
  // Misura della freccia / vertice (solo per tipo='arco')
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
 * R = (L²/4 + F²) / (2F)  —  equivalente a (L² + 4F²) / (8F)
 * Per semicerchio (arco a tutto sesto): F = L/2 → R = L/2
 */
export function arcRadius(chord: number, sagitta: number): number {
  if (sagitta <= 0) return Infinity
  return (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta)
}

/**
 * Calcola il raggio per un arco spezzato (acuto / gotico) con i due centri
 * posizionati sui lati della corda.
 * R = (L² + 4V²) / (4L)
 * dove L = larghezza totale (corda), V = altezza del vertice sopra l'imposta
 */
export function arcRadiusSpezzato(larghezza: number, vertice: number): number {
  if (larghezza <= 0) return Infinity
  return (larghezza * larghezza + 4 * vertice * vertice) / (4 * larghezza)
}

/**
 * Classifica automaticamente un arco in base al rapporto sagitta/half-chord.
 * - ribassato:   ratio < 0.85
 * - tutto_sesto: 0.85 ≤ ratio ≤ 1.15  (±15% attorno al semicerchio)
 * - rialzato:    ratio > 1.15
 */
export function classifyArco(chord: number, sagitta: number): 'ribassato' | 'tutto_sesto' | 'rialzato' {
  if (chord <= 0) return 'ribassato'
  const ratio = (2 * sagitta) / chord   // 1.0 = tutto sesto esatto
  if (ratio > 1.15) return 'rialzato'
  if (ratio < 0.85) return 'ribassato'
  return 'tutto_sesto'
}

// ============================================================
// Preset cpDx/cpDy per le tipologie di arco
// ============================================================

/**
 * Calcola cpDx, cpDy per un arco a tutto sesto (semicerchio).
 * Sagitta = chord/2, perpendicolare alla corda verso l'alto (verso sinistra
 * per corda orizzontale che va da sx a dx → verso l'alto per finestre).
 */
export function cpForTuttoSesto(
  fromGx: number, fromGy: number,
  toGx: number, toGy: number
): { cpDx: number; cpDy: number } {
  const dxGrid = toGx - fromGx
  const dyGrid = toGy - fromGy
  const chordGrid = Math.sqrt(dxGrid * dxGrid + dyGrid * dyGrid)
  if (chordGrid < 0.001) return { cpDx: 0, cpDy: 0 }
  // perp destra = (dy, -dx)/chord; sagitta = chord/2 → cpDx = dyGrid/2, cpDy = -dxGrid/2
  return { cpDx: dyGrid / 2, cpDy: -dxGrid / 2 }
}

/**
 * Arco ribassato (piatto). ratio = sagitta / half-chord.
 * Default ratio=0.30 → freccia = 30% della semi-corda (arco molto schiacciato).
 */
export function cpForRibassato(
  fromGx: number, fromGy: number,
  toGx: number, toGy: number,
  ratio = 0.30
): { cpDx: number; cpDy: number } {
  const dxGrid = toGx - fromGx
  const dyGrid = toGy - fromGy
  const chordGrid = Math.sqrt(dxGrid * dxGrid + dyGrid * dyGrid)
  if (chordGrid < 0.001) return { cpDx: 0, cpDy: 0 }
  // cpDx = (dyGrid/chord) * sagitta = (dyGrid/chord) * (chord/2 * ratio) = dyGrid/2 * ratio
  return { cpDx: (dyGrid / 2) * ratio, cpDy: (-dxGrid / 2) * ratio }
}

/**
 * Arco rialzato (alto). ratio = sagitta / half-chord.
 * Default ratio=0.75 → freccia = 75% della semi-corda (arco alto, quasi verticale).
 */
export function cpForRialzato(
  fromGx: number, fromGy: number,
  toGx: number, toGy: number,
  ratio = 0.75
): { cpDx: number; cpDy: number } {
  return cpForRibassato(fromGx, fromGy, toGx, toGy, ratio)
}

/**
 * Arco acuto / gotico. cpDx/cpDy punta all'apice.
 * Default ratio=0.65 → altezza apice = 65% della semi-corda.
 * Per equilaterale gotico classico: ratio = sqrt(3)/2 ≈ 0.866
 */
export function cpForAcuto(
  fromGx: number, fromGy: number,
  toGx: number, toGy: number,
  ratio = 0.65
): { cpDx: number; cpDy: number } {
  return cpForRibassato(fromGx, fromGy, toGx, toGy, ratio)
}

// ============================================================
// Costruzione path SVG per archi
// ============================================================

/**
 * Costruisce il path SVG "A" per un arco circolare singolo.
 * cpDx/cpDy = offset del vertice dal punto medio della corda (grid units).
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
  const cross = dx * cpDy - dy * cpDx
  const sweep = cross < 0 ? 1 : 0

  const Rf = R.toFixed(2)
  const x2f = x2.toFixed(1), y2f = y2.toFixed(1)
  return includeMove
    ? `M ${x1} ${y1} A ${Rf} ${Rf} 0 ${large} ${sweep} ${x2f} ${y2f}`
    : `A ${Rf} ${Rf} 0 ${large} ${sweep} ${x2f} ${y2f}`
}

/**
 * Versione di arcSvgPath per coordinate già scalate (usata in shapeToPath).
 * cpDx/cpDy sono in grid units; scale converte da grid a SVG path coords.
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
  // FIX: calcolo sagittaScaled (era bug: variabile non definita)
  const sagX = cpDx * scale
  const sagY = cpDy * scale
  const sagittaScaled = Math.sqrt(sagX * sagX + sagY * sagY)

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
 * Costruisce il path SVG per un arco acuto/gotico a due centri.
 * cpDx/cpDy definisce l'offset del punto-apice dal midpoint della corda (grid units).
 * Genera: M x1 y1  A R1 R1 0 0 sweep1 apexX apexY  A R2 R2 0 0 sweep2 x2 y2
 * I raggi R1, R2 sono calcolati come arcRadiusSpezzato(corda, altezza_vertice)
 * in modo che i centri cadano sulla linea di imposta (ai piedi della corda).
 */
export function arcSvgPathAcuto(
  x1: number, y1: number,
  x2: number, y2: number,
  cpDx: number, cpDy: number,
  cellSize: number,
  includeMove = true
): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const apexX = mx + cpDx * cellSize
  const apexY = my + cpDy * cellSize

  // Distanza tra i due punti base (corda in pixel)
  const chordPx = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

  // Altezza del vertice rispetto alla linea d'imposta (proiezione perpendicolare)
  // Per il caso generale: dist del punto apice dalla retta passante per x1,y1 → x2,y2
  const vertexPx = chordPx > 0.01
    ? Math.abs((x2 - x1) * (y1 - apexY) - (x1 - apexX) * (y2 - y1)) / chordPx
    : 0

  if (vertexPx < 0.5 || chordPx < 0.5) {
    // Degenere: linee rette verso l'apice
    const prefix = includeMove ? `M ${x1} ${y1} ` : ''
    return `${prefix}L ${apexX.toFixed(1)} ${apexY.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  // Raggio calcolato con la formula dello spezzato (uguale per entrambi i lati per simmetria teorica)
  const R = arcRadiusSpezzato(chordPx, vertexPx)
  const Rf = R.toFixed(2)

  // Sweep flags: basati sul cross product tra la corda e l'offset dell'apice
  // cross < 0 → apice "sopra" corda orizzontale (da sx a dx) → sweep sinistro=1, destro=0
  const chordDx = x2 - x1, chordDy = y2 - y1
  const apexOffDx = apexX - mx, apexOffDy = apexY - my
  const cross = chordDx * apexOffDy - chordDy * apexOffDx
  const sweepL = cross < 0 ? 1 : 0
  const sweepR = cross < 0 ? 0 : 1

  const axf = apexX.toFixed(1), ayf = apexY.toFixed(1)
  const x2f = x2.toFixed(1), y2f = y2.toFixed(1)
  const prefix = includeMove ? `M ${x1} ${y1} ` : ''
  return `${prefix}A ${Rf} ${Rf} 0 0 ${sweepL} ${axf} ${ayf} A ${Rf} ${Rf} 0 0 ${sweepR} ${x2f} ${y2f}`
}

/**
 * Versione scalata di arcSvgPathAcuto per uso in shapeToPath.
 */
export function arcSvgPathAcutoScaled(
  fx: number, fy: number,
  tx: number, ty: number,
  cpDx: number, cpDy: number,
  scale: number,
  includeMove = false
): string {
  const mx = (fx + tx) / 2
  const my = (fy + ty) / 2
  const apexX = mx + cpDx * scale
  const apexY = my + cpDy * scale

  const chordPx = Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2)
  const vertexPx = chordPx > 0.01
    ? Math.abs((tx - fx) * (fy - apexY) - (fx - apexX) * (ty - fy)) / chordPx
    : 0

  if (vertexPx < 0.5 || chordPx < 0.5) {
    const prefix = includeMove ? `M ${fx.toFixed(1)} ${fy.toFixed(1)} ` : ''
    return `${prefix}L ${apexX.toFixed(1)} ${apexY.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`
  }

  const R = arcRadiusSpezzato(chordPx, vertexPx)
  const Rf = R.toFixed(2)

  const chordDx = tx - fx, chordDy = ty - fy
  const apexOffDx = apexX - mx, apexOffDy = apexY - my
  const cross = chordDx * apexOffDy - chordDy * apexOffDx
  const sweepL = cross < 0 ? 1 : 0
  const sweepR = cross < 0 ? 0 : 1

  const axf = apexX.toFixed(1), ayf = apexY.toFixed(1)
  const txf = tx.toFixed(1), tyf = ty.toFixed(1)
  const prefix = includeMove ? `M ${fx.toFixed(1)} ${fy.toFixed(1)} ` : ''
  return `${prefix}A ${Rf} ${Rf} 0 0 ${sweepL} ${axf} ${ayf} A ${Rf} ${Rf} 0 0 ${sweepR} ${txf} ${tyf}`
}

/**
 * Calcola cpDx, cpDy per un arco a tutto sesto (semicerchio).
 * Il vertice si trova esattamente a chord/2 perpendicolare alla corda,
 * bowing "a sinistra" per chord che va da sx a dx (cioè verso l'alto per finestre).
 */
// (Alias lasciato per compatibilità interna — implementazione nel corpo sopra)

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
      if (seg.tipoArco === 'acuto') {
        d += ' ' + arcSvgPathAcutoScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, scale, false)
      } else {
        d += ' ' + arcSvgPathScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, scale, false)
      }
    } else {
      d += ` L ${tx.toFixed(1)} ${ty.toFixed(1)}`
    }
  })
  return d ? d + ' Z' : null
}
