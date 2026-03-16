/**
 * lib/shapeRecognition.ts
 * Riconosce forme geometriche da un tracciato a mano libera.
 *
 * Algoritmo:
 *   1. Ramer-Douglas-Peucker → riduce i punti grezzi ai vertici significativi
 *   2. Per ogni segmento analizza i punti originali → dritto vs arco
 *   3. Snap angoli vicini a 0°/90° → linee perfettamente orizzontali/verticali
 *   4. Mappa i vertici sulla griglia 0-8 usata da FormaShape
 *   5. Genera FormaShape compatibile con il resto del modulo rilievo
 */

import type { FormaShape, GridPoint, ShapeSegment, AngoloConfig } from '@/types/rilievo'

export interface RawPoint { x: number; y: number }

// ── Ramer-Douglas-Peucker ─────────────────────────────────────────────────────

function ptToLineDist(p: RawPoint, a: RawPoint, b: RawPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.sqrt(len2)
}

function rdp(points: RawPoint[], epsilon: number): RawPoint[] {
  if (points.length < 3) return [...points]
  let maxDist = 0
  let maxIdx = 0
  const start = points[0]
  const end = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = ptToLineDist(points[i], start, end)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left  = rdp(points.slice(0, maxIdx + 1), epsilon)
    const right = rdp(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [start, end]
}

// ── Analisi segmenti ──────────────────────────────────────────────────────────

/** Max deviazione di un gruppo di punti grezzi dalla corda start→end.
 *  Restituisce anche il vettore dalla mezzeria della corda verso il punto di max deviazione. */
function segmentDeviation(
  rawSeg: RawPoint[],
  start: RawPoint,
  end: RawPoint
): { dist: number; cpVec: RawPoint } {
  const mx = (start.x + end.x) / 2
  const my = (start.y + end.y) / 2
  let maxDist = 0
  let maxPt: RawPoint = { x: mx, y: my }
  for (const p of rawSeg) {
    const d = ptToLineDist(p, start, end)
    if (d > maxDist) { maxDist = d; maxPt = p }
  }
  return { dist: maxDist, cpVec: { x: maxPt.x - mx, y: maxPt.y - my } }
}

/** Trova i punti grezzi che appartengono al segmento tra due vertici semplificati.
 *  Usa reference equality (RDP restituisce riferimenti ai punti originali). */
function rawPointsForSegment(
  raw: RawPoint[],
  from: RawPoint,
  to: RawPoint
): RawPoint[] {
  const findIdx = (target: RawPoint) => {
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === target) return i
    }
    // fallback: punto più vicino
    let minD = Infinity, idx = 0
    for (let i = 0; i < raw.length; i++) {
      const d = Math.hypot(raw[i].x - target.x, raw[i].y - target.y)
      if (d < minD) { minD = d; idx = i }
    }
    return idx
  }
  const fi = findIdx(from)
  const ti = findIdx(to)
  if (fi <= ti) return raw.slice(fi, ti + 1)
  // ultimo segmento di una forma chiusa: wrap-around
  return [...raw.slice(fi), ...raw.slice(0, ti + 1)]
}

// ── Snap di griglia ───────────────────────────────────────────────────────────

/** Arrotonda al multiplo più vicino di `step`. */
function snapTo(v: number, step: number): number {
  return Math.round(v / step) * step
}

// ── Naming dei segmenti ───────────────────────────────────────────────────────

interface SegmentNames {
  misuraNome: string
  sagittaNome: string
}

function assignNames(
  segments: Array<{ tipo: 'retta' | 'arco'; dgx: number; dgy: number }>
): SegmentNames[] {
  let hCount = 0, vCount = 0, dCount = 0, arcCount = 0
  return segments.map(({ tipo, dgx, dgy }) => {
    if (tipo === 'arco') {
      arcCount++
      return {
        misuraNome: arcCount === 1 ? 'Arco' : `Arco_${arcCount}`,
        sagittaNome: arcCount === 1 ? 'Freccia' : `Freccia_${arcCount}`,
      }
    }
    const angle = Math.atan2(Math.abs(dgy), Math.abs(dgx)) * (180 / Math.PI)
    if (angle < 20) {
      hCount++
      return { misuraNome: hCount === 1 ? 'Larghezza' : `Larghezza_${hCount}`, sagittaNome: '' }
    } else if (angle > 70) {
      vCount++
      return { misuraNome: vCount === 1 ? 'Altezza' : `Altezza_${vCount}`, sagittaNome: '' }
    } else {
      dCount++
      return { misuraNome: `Lato_${dCount}`, sagittaNome: '' }
    }
  })
}

// ── Funzione principale ───────────────────────────────────────────────────────

/**
 * Riconosce una FormaShape da un array di punti grezzi del tracciato a mano libera.
 * Restituisce null se il tracciato non è riconoscibile (troppo piccolo, troppi vertici, ecc.).
 */
export function recognizeShape(rawPoints: RawPoint[]): FormaShape | null {
  if (rawPoints.length < 10) return null

  // 1. Bounding box dei punti grezzi
  const xs = rawPoints.map((p) => p.x)
  const ys = rawPoints.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const bboxW = maxX - minX
  const bboxH = maxY - minY
  if (bboxW < 30 || bboxH < 30) return null  // disegno troppo piccolo

  // 2. RDP con epsilon proporzionale alla bounding box
  const epsilon = Math.min(bboxW, bboxH) * 0.07
  let simplified = rdp(rawPoints, epsilon)

  // Rimuovi punti consecutivi troppo vicini
  simplified = simplified.filter((p, i) => {
    if (i === 0) return true
    return Math.hypot(p.x - simplified[i - 1].x, p.y - simplified[i - 1].y) > 3
  })

  if (simplified.length < 3) return null

  // 3. Gestione chiusura: se start e end sono vicini, rimuovi il duplicato
  const closeDist = Math.hypot(
    simplified[0].x - simplified[simplified.length - 1].x,
    simplified[0].y - simplified[simplified.length - 1].y
  )
  let vertices = closeDist < epsilon * 2.5
    ? simplified.slice(0, -1)
    : simplified

  if (vertices.length < 3) return null

  // Troppi vertici: ri-semplifica più aggressivamente
  if (vertices.length > 9) {
    vertices = rdp(vertices, epsilon * 2.5)
    if (vertices.length > 9 || vertices.length < 3) return null
  }

  // 4. Mapping pixel → griglia (1-7, range 6 unità su 9)
  const scaleX = 6 / bboxW
  const scaleY = 6 / bboxH
  const toGridRaw = (p: RawPoint) => ({
    gx: 1 + (p.x - minX) * scaleX,
    gy: 1 + (p.y - minY) * scaleY,
  })

  let gridVerts = vertices.map(toGridRaw)

  // 5. Snap angoli vicini a 0° e 90° per ogni lato
  const n = gridVerts.length
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    const dgx = gridVerts[next].gx - gridVerts[i].gx
    const dgy = gridVerts[next].gy - gridVerts[i].gy
    const angle = Math.abs(Math.atan2(Math.abs(dgy), Math.abs(dgx)) * (180 / Math.PI))

    if (angle < 12) {
      // quasi orizzontale → forza stessa gy
      const avgGy = (gridVerts[i].gy + gridVerts[next].gy) / 2
      gridVerts[i].gy = avgGy
      gridVerts[next].gy = avgGy
    } else if (angle > 78) {
      // quasi verticale → forza stesso gx
      const avgGx = (gridVerts[i].gx + gridVerts[next].gx) / 2
      gridVerts[i].gx = avgGx
      gridVerts[next].gx = avgGx
    }
  }

  // Snap a 0.5 unità di griglia
  gridVerts = gridVerts.map((v) => ({
    gx: snapTo(v.gx, 0.5),
    gy: snapTo(v.gy, 0.5),
  }))

  // 6. Costruisci GridPoint[]
  const punti: GridPoint[] = gridVerts.map((v, i) => ({
    id: `p${i}`,
    gx: v.gx,
    gy: v.gy,
  }))

  // 7. Classifica ogni segmento (retta / arco)
  type SegInfo = { tipo: 'retta' | 'arco'; cpDx: number; cpDy: number; tipoArco?: 'ribassato' | 'tutto_sesto' | 'rialzato' | 'libero'; dgx: number; dgy: number }
  const segInfos: SegInfo[] = vertices.map((v, i) => {
    const nextI = (i + 1) % n
    const vNext = vertices[nextI]
    const rawSeg = rawPointsForSegment(rawPoints, v, vNext)
    const chord = Math.hypot(v.x - vNext.x, v.y - vNext.y)
    const { dist, cpVec } = segmentDeviation(rawSeg, v, vNext)

    // Soglia: se la deviazione è > 10% della corda, è un arco
    const isArc = chord > 5 && dist > Math.max(chord * 0.10, 8)

    const dgx = gridVerts[(i + 1) % n].gx - gridVerts[i].gx
    const dgy = gridVerts[(i + 1) % n].gy - gridVerts[i].gy

    if (!isArc) {
      return { tipo: 'retta', cpDx: 0, cpDy: 0, dgx, dgy }
    }

    // Converti vettore sagitta da pixel a unità griglia
    const cpDx = cpVec.x * scaleX
    const cpDy = cpVec.y * scaleY

    // Classifica tipo arco in base al rapporto sagitta/semi-corda
    const ratio = (2 * dist) / chord
    let tipoArco: 'ribassato' | 'tutto_sesto' | 'rialzato' | 'libero'
    if (ratio < 0.5)       tipoArco = 'ribassato'
    else if (ratio < 0.85) tipoArco = 'ribassato'
    else if (ratio < 1.15) tipoArco = 'tutto_sesto'
    else                   tipoArco = 'rialzato'

    return { tipo: 'arco', cpDx, cpDy, tipoArco, dgx, dgy }
  })

  // 8. Assegna nomi alle misure
  const names = assignNames(segInfos)

  // 9. Costruisci ShapeSegment[]
  const segmenti: ShapeSegment[] = segInfos.map((info, i) => ({
    id: `s${i}`,
    fromId: punti[i].id,
    toId: punti[(i + 1) % n].id,
    tipo: info.tipo,
    tipoArco: info.tipoArco,
    cpDx: info.cpDx,
    cpDy: info.cpDy,
    misuraNome: names[i].misuraNome,
    misuraTipo: 'input',
    misuraFormula: '',
    sagittaNome: names[i].sagittaNome,
    sagittaTipo: 'input',
    sagittaFormula: '',
  }))

  const angoliConfig: AngoloConfig[] = punti.map((p) => ({
    puntoId: p.id,
    tipo: 'automatico',
    gradi: null,
  }))

  return { punti, segmenti, angoliConfig, chiusa: true }
}
