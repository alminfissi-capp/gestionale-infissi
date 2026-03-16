/**
 * lib/shapeRecognition.ts
 * Riconosce forme geometriche da un tracciato a mano libera.
 *
 * Pipeline:
 *   1. Ramer-Douglas-Peucker → vertici significativi
 *   2. Analisi curvatura per ogni segmento → retta vs arco
 *   3. Snap angoli 0°/90° → allineamento griglia
 *   4. Mapping pixel → griglia 0-8
 *   5. Genera FormaShape grezza (tutti input indipendenti)
 *   6. applyGeometricConstraints → riduce alle sole misure necessarie:
 *      - Lati paralleli con stessa lunghezza → stesso nome (deduplicazione)
 *      - Vincolo di chiusura → un lato H e/o un lato V come calcolato
 *      - Lato obliquo singolo → calcolato con formula sqrt(dx²+dy²)
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

function segmentDeviation(rawSeg: RawPoint[], start: RawPoint, end: RawPoint) {
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

function rawPointsForSegment(raw: RawPoint[], from: RawPoint, to: RawPoint): RawPoint[] {
  const findIdx = (target: RawPoint) => {
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === target) return i
    }
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
  return [...raw.slice(fi), ...raw.slice(0, ti + 1)]
}

function snapTo(v: number, step: number): number {
  return Math.round(v / step) * step
}

// ── Naming grezzo (numeri progressivi) ───────────────────────────────────────

interface SegmentNames { misuraNome: string; sagittaNome: string }

function assignNamesRaw(
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

// ── Vincoli geometrici ────────────────────────────────────────────────────────

/**
 * Riduce la FormaShape alle sole misure indipendenti necessarie.
 *
 * Regole applicate:
 * A) Lati paralleli con stessa lunghezza griglia → stesso nome (uno solo come input)
 * B) Vincolo di chiusura vettoriale (Σ displacement = 0):
 *    - Se un gruppo direzionale (H o V) ha un lato in più rispetto all'opposto,
 *      l'ultimo di quel gruppo diventa calcolato come differenza degli altri.
 * C) Lato obliquo singolo → calcolato con sqrt dai lati H/V della forma.
 */
function applyGeometricConstraints(shape: FormaShape): FormaShape {
  const { punti } = shape

  // Copia mutabile dei segmenti
  type MutSeg = ShapeSegment & { dgx: number; dgy: number; axis: 'H' | 'V' | 'O' }
  const segs: MutSeg[] = shape.segmenti.map((seg) => {
    const from = punti.find((p) => p.id === seg.fromId)!
    const to   = punti.find((p) => p.id === seg.toId)!
    const dgx = to.gx - from.gx
    const dgy = to.gy - from.gy
    const axis: 'H' | 'V' | 'O' = Math.abs(dgy) < 0.05 ? 'H'
      : Math.abs(dgx) < 0.05 ? 'V' : 'O'
    return { ...seg, dgx, dgy, axis }
  })

  // ── A. Lati paralleli con stessa lunghezza → stesso nome ─────────────────
  // Raggruppa H per |dgx| e V per |dgy|; all'interno dello stesso gruppo
  // tutti i segmenti prendono il nome del primo (il nome più "base").

  const roundKey = (v: number) => (Math.round(Math.abs(v) * 4) / 4).toFixed(2)

  const groupH = new Map<string, MutSeg[]>()
  const groupV = new Map<string, MutSeg[]>()

  segs.forEach((s) => {
    if (s.axis === 'H') {
      const k = roundKey(s.dgx)
      if (!groupH.has(k)) groupH.set(k, [])
      groupH.get(k)!.push(s)
    } else if (s.axis === 'V') {
      const k = roundKey(s.dgy)
      if (!groupV.has(k)) groupV.set(k, [])
      groupV.get(k)!.push(s)
    }
  })

  // Rinomina: tutti i membri del gruppo usano il nome del primo
  for (const group of groupH.values()) {
    if (group.length > 1) {
      const name = group[0].misuraNome
      group.slice(1).forEach((s) => { s.misuraNome = name })
    }
  }
  for (const group of groupV.values()) {
    if (group.length > 1) {
      const name = group[0].misuraNome
      group.slice(1).forEach((s) => { s.misuraNome = name })
    }
  }

  // ── B. Vincolo di chiusura H e V ─────────────────────────────────────────
  // Per ogni asse (H e V):
  //   - segmenti con dgx/dgy > 0 → gruppo "positivo"
  //   - segmenti con dgx/dgy < 0 → gruppo "negativo"
  //   - Σ(positivi reali) = Σ(negativi reali)
  //   - Se un gruppo ha un nome in più rispetto all'altro,
  //     l'ultimo nome di quel gruppo è calcolato.
  //
  // "Un nome in più" significa: dopo deduplicazione, ci sono più nomi unici
  // in un verso che nell'altro. L'ultimo viene espresso come somma/differenza.

  applyClosureConstraint(segs, 'H')
  applyClosureConstraint(segs, 'V')

  // ── C. Lato obliquo singolo ───────────────────────────────────────────────
  const obliqui = segs.filter((s) => s.axis === 'O' && s.misuraTipo === 'input')
  if (obliqui.length === 1) {
    const ob = obliqui[0]

    // Contributo x dell'obliquo = −Σ(contributi x di tutti gli H)
    // Contributo y dell'obliquo = −Σ(contributi y di tutti gli V)
    // Il contributo di ogni nome = quel nome × sign(dgx) o sign(dgy)
    // Per la lunghezza: L = sqrt(dx_reale² + dy_reale²)

    const xTerms = buildClosureTerms(segs, 'H')  // contributo x dell'obliquo
    const yTerms = buildClosureTerms(segs, 'V')  // contributo y dell'obliquo

    const xExpr = buildLinearExpr(xTerms)
    const yExpr = buildLinearExpr(yTerms)

    if (xExpr || yExpr) {
      let formula: string
      if (!xExpr) {
        formula = yExpr!
      } else if (!yExpr) {
        formula = xExpr
      } else {
        // sqrt((xExpr)² + (yExpr)²)
        // Per evitare problemi di precedenza con operatori, usiamo * esplicito
        const xSq = `(${xExpr}) * (${xExpr})`
        const ySq = `(${yExpr}) * (${yExpr})`
        formula = `sqrt(${xSq} + ${ySq})`
      }
      ob.misuraTipo = 'calcolato'
      ob.misuraFormula = formula
    }
  }

  return {
    ...shape,
    segmenti: segs.map((s): ShapeSegment => ({
      id: s.id, fromId: s.fromId, toId: s.toId,
      tipo: s.tipo, tipoArco: s.tipoArco, cpDx: s.cpDx, cpDy: s.cpDy,
      misuraNome: s.misuraNome, misuraTipo: s.misuraTipo, misuraFormula: s.misuraFormula,
      sagittaNome: s.sagittaNome, sagittaTipo: s.sagittaTipo, sagittaFormula: s.sagittaFormula,
    })),
  }
}

/** Raccoglie per ogni nome unico nel gruppo il "coefficiente netto" di contributo
 *  all'asse: somma dei sign(dgx) per H, o sign(dgy) per V, per tutti i segmenti con quel nome.
 *  Restituisce i termini della formula per il contributo del lato obliquo (con segno invertito). */
function buildClosureTerms(
  segs: Array<ShapeSegment & { dgx: number; dgy: number; axis: 'H' | 'V' | 'O' }>,
  axis: 'H' | 'V'
): Array<{ name: string; coeff: number }> {
  const netByName = new Map<string, number>()
  segs.filter((s) => s.axis === axis).forEach((s) => {
    const disp = axis === 'H' ? s.dgx : s.dgy
    netByName.set(s.misuraNome, (netByName.get(s.misuraNome) ?? 0) + disp)
  })
  // Il contributo dell'obliquo sull'asse = −Σ(netByName)
  // → ogni termine ha coefficiente invertito
  const terms: Array<{ name: string; coeff: number }> = []
  for (const [name, net] of netByName.entries()) {
    if (Math.abs(net) > 0.01) {
      // net > 0 → quel nome contribuisce +net → obliquo.disp -= net * name
      terms.push({ name, coeff: net > 0 ? -1 : 1 })
    }
  }
  return terms
}

/** Costruisce una stringa di espressione lineare da una lista di termini con coefficiente ±1. */
function buildLinearExpr(terms: Array<{ name: string; coeff: number }>): string | null {
  if (terms.length === 0) return null
  // Separa positivi e negativi
  const pos = terms.filter((t) => t.coeff > 0).map((t) => t.name)
  const neg = terms.filter((t) => t.coeff < 0).map((t) => t.name)
  if (pos.length === 0 && neg.length === 0) return null
  if (neg.length === 0) return pos.join(' + ')
  if (pos.length === 0) return neg.join(' + ')  // segno inverso, ma verrà quadrato
  return `${pos.join(' + ')} - ${neg.join(' - ')}`
}

/**
 * Applica il vincolo di chiusura per l'asse specificato (H o V).
 * Se un verso ha più nomi unici dell'altro, l'ultimo di quel verso
 * viene espresso come formula calcolata dagli altri.
 */
function applyClosureConstraint(
  segs: Array<ShapeSegment & { dgx: number; dgy: number; axis: 'H' | 'V' | 'O'; misuraTipo: 'input' | 'calcolato'; misuraFormula: string }>,
  axis: 'H' | 'V'
): void {
  const getDisp = (s: typeof segs[0]) => axis === 'H' ? s.dgx : s.dgy

  // Nomi unici per verso (positivo e negativo), nell'ordine in cui compaiono
  const seenPos = new Set<string>(), seenNeg = new Set<string>()
  const namesPos: string[] = [], namesNeg: string[] = []

  segs.filter((s) => s.axis === axis && s.misuraTipo === 'input').forEach((s) => {
    const d = getDisp(s)
    if (d > 0.01 && !seenPos.has(s.misuraNome)) { seenPos.add(s.misuraNome); namesPos.push(s.misuraNome) }
    if (d < -0.01 && !seenNeg.has(s.misuraNome)) { seenNeg.add(s.misuraNome); namesNeg.push(s.misuraNome) }
  })

  // Scegli quale gruppo ha "un nome in più" → l'ultimo di quel gruppo è calcolato
  // Caso A: 1 positivo, N≥2 negativi → l'ultimo negativo = positivo − altri negativi
  // Caso B: N≥2 positivi, 1 negativo → l'ultimo positivo = negativo − altri positivi
  let calcolatoName: string | null = null
  let formula: string | null = null

  if (namesPos.length === 1 && namesNeg.length >= 2) {
    calcolatoName = namesNeg[namesNeg.length - 1]
    const others = namesNeg.slice(0, -1)
    formula = namesPos[0] + (others.length > 0 ? ' - ' + others.join(' - ') : '')
  } else if (namesNeg.length === 1 && namesPos.length >= 2) {
    calcolatoName = namesPos[namesPos.length - 1]
    const others = namesPos.slice(0, -1)
    formula = namesNeg[0] + (others.length > 0 ? ' - ' + others.join(' - ') : '')
  }

  if (calcolatoName && formula) {
    segs.forEach((s) => {
      if (s.axis === axis && s.misuraNome === calcolatoName) {
        s.misuraTipo = 'calcolato'
        s.misuraFormula = formula!
      }
    })
  }
}

// ── Funzione principale ───────────────────────────────────────────────────────

export function recognizeShape(rawPoints: RawPoint[]): FormaShape | null {
  if (rawPoints.length < 10) return null

  const xs = rawPoints.map((p) => p.x)
  const ys = rawPoints.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const bboxW = maxX - minX
  const bboxH = maxY - minY
  if (bboxW < 30 || bboxH < 30) return null

  const epsilon = Math.min(bboxW, bboxH) * 0.07
  let simplified = rdp(rawPoints, epsilon)

  simplified = simplified.filter((p, i) => {
    if (i === 0) return true
    return Math.hypot(p.x - simplified[i - 1].x, p.y - simplified[i - 1].y) > 3
  })

  if (simplified.length < 3) return null

  const closeDist = Math.hypot(
    simplified[0].x - simplified[simplified.length - 1].x,
    simplified[0].y - simplified[simplified.length - 1].y
  )
  let vertices = closeDist < epsilon * 2.5
    ? simplified.slice(0, -1)
    : simplified

  if (vertices.length < 3) return null

  if (vertices.length > 9) {
    vertices = rdp(vertices, epsilon * 2.5)
    if (vertices.length > 9 || vertices.length < 3) return null
  }

  const scaleX = 6 / bboxW
  const scaleY = 6 / bboxH
  let gridVerts = vertices.map((p) => ({
    gx: 1 + (p.x - minX) * scaleX,
    gy: 1 + (p.y - minY) * scaleY,
  }))

  const n = gridVerts.length
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    const dgx = gridVerts[next].gx - gridVerts[i].gx
    const dgy = gridVerts[next].gy - gridVerts[i].gy
    const angle = Math.abs(Math.atan2(Math.abs(dgy), Math.abs(dgx)) * (180 / Math.PI))
    if (angle < 12) {
      const avg = (gridVerts[i].gy + gridVerts[next].gy) / 2
      gridVerts[i].gy = avg
      gridVerts[next].gy = avg
    } else if (angle > 78) {
      const avg = (gridVerts[i].gx + gridVerts[next].gx) / 2
      gridVerts[i].gx = avg
      gridVerts[next].gx = avg
    }
  }

  gridVerts = gridVerts.map((v) => ({ gx: snapTo(v.gx, 0.5), gy: snapTo(v.gy, 0.5) }))

  const punti: GridPoint[] = gridVerts.map((v, i) => ({ id: `p${i}`, gx: v.gx, gy: v.gy }))

  type SegInfo = { tipo: 'retta' | 'arco'; cpDx: number; cpDy: number; tipoArco?: 'ribassato' | 'tutto_sesto' | 'rialzato' | 'libero'; dgx: number; dgy: number }
  const segInfos: SegInfo[] = vertices.map((v, i) => {
    const nextI = (i + 1) % n
    const vNext = vertices[nextI]
    const rawSeg = rawPointsForSegment(rawPoints, v, vNext)
    const chord = Math.hypot(v.x - vNext.x, v.y - vNext.y)
    const { dist, cpVec } = segmentDeviation(rawSeg, v, vNext)
    const isArc = chord > 5 && dist > Math.max(chord * 0.10, 8)
    const dgx = gridVerts[(i + 1) % n].gx - gridVerts[i].gx
    const dgy = gridVerts[(i + 1) % n].gy - gridVerts[i].gy
    if (!isArc) return { tipo: 'retta', cpDx: 0, cpDy: 0, dgx, dgy }
    const cpDx = cpVec.x * scaleX
    const cpDy = cpVec.y * scaleY
    const ratio = (2 * dist) / chord
    const tipoArco = ratio < 0.85 ? 'ribassato' : ratio < 1.15 ? 'tutto_sesto' : 'rialzato'
    return { tipo: 'arco', cpDx, cpDy, tipoArco, dgx, dgy }
  })

  const names = assignNamesRaw(segInfos)

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

  const rawShape: FormaShape = { punti, segmenti, angoliConfig, chiusa: true }

  // Applica i vincoli geometrici per ridurre le misure necessarie
  return applyGeometricConstraints(rawShape)
}
