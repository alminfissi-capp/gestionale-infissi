'use client'

import { useState, useRef, useCallback } from 'react'
import { Undo2, RotateCcw, X, RefreshCw } from 'lucide-react'
import type { GridPoint, ShapeSegment, AngoloConfig, FormaShape, TipoArco } from '@/types/rilievo'
import { autoConstrainShape } from '@/lib/shapeRecognition'
import {
  arcSvgPath,
  arcSvgPathAcuto,
  arcRadius,
  arcRadiusSpezzato,
  cpForTuttoSesto,
  cpForRibassato,
  cpForRialzato,
  cpForAcuto,
  classifyArco,
} from '@/types/rilievo'

// ============================================================
// Costanti griglia
// ============================================================
export const GRID_N = 9    // 9 punti per lato (indici 0..8)
export const CELL = 35     // pixel SVG per cella (viewBox coords)
export const VIEW = (GRID_N - 1) * CELL  // 280

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const inv = svg.getScreenCTM()?.inverse()
  return inv ? pt.matrixTransform(inv) : null
}

function snap(svgX: number, svgY: number) {
  return {
    gx: Math.max(0, Math.min(GRID_N - 1, Math.round(svgX / CELL))),
    gy: Math.max(0, Math.min(GRID_N - 1, Math.round(svgY / CELL))),
  }
}

function segPath(seg: ShapeSegment, punti: GridPoint[]): string {
  const from = punti.find((p) => p.id === seg.fromId)
  const to = punti.find((p) => p.id === seg.toId)
  if (!from || !to) return ''
  const fx = from.gx * CELL, fy = from.gy * CELL
  const tx = to.gx * CELL, ty = to.gy * CELL

  if (seg.tipo === 'curva') {
    const cpx = (fx + tx) / 2 + seg.cpDx * CELL
    const cpy = (fy + ty) / 2 + seg.cpDy * CELL
    return `M ${fx} ${fy} Q ${cpx} ${cpy} ${tx} ${ty}`
  }
  if (seg.tipo === 'arco') {
    if (seg.tipoArco === 'acuto') {
      return arcSvgPathAcuto(fx, fy, tx, ty, seg.cpDx, seg.cpDy, CELL, true)
    }
    return arcSvgPath(fx, fy, tx, ty, seg.cpDx, seg.cpDy, CELL, true)
  }
  return `M ${fx} ${fy} L ${tx} ${ty}`
}

function cpPos(seg: ShapeSegment, punti: GridPoint[]) {
  const from = punti.find((p) => p.id === seg.fromId)
  const to = punti.find((p) => p.id === seg.toId)
  if (!from || !to) return null
  return {
    x: (from.gx + to.gx) / 2 * CELL + seg.cpDx * CELL,
    y: (from.gy + to.gy) / 2 * CELL + seg.cpDy * CELL,
  }
}

/** Sagitta in grid units per un segmento arco */
function segSagitta(seg: ShapeSegment) {
  return Math.sqrt(seg.cpDx * seg.cpDx + seg.cpDy * seg.cpDy)
}

/** Corda in grid units tra from e to */
function segChord(seg: ShapeSegment, punti: GridPoint[]) {
  const from = punti.find((p) => p.id === seg.fromId)
  const to = punti.find((p) => p.id === seg.toId)
  if (!from || !to) return 0
  const dx = to.gx - from.gx, dy = to.gy - from.gy
  return Math.sqrt(dx * dx + dy * dy)
}

function buildClosedPath(shape: FormaShape): string {
  if (!shape.chiusa || shape.segmenti.length < 3) return ''
  let d = ''
  shape.segmenti.forEach((seg, i) => {
    const from = shape.punti.find((p) => p.id === seg.fromId)
    const to = shape.punti.find((p) => p.id === seg.toId)
    if (!from || !to) return
    const fx = from.gx * CELL, fy = from.gy * CELL
    const tx = to.gx * CELL, ty = to.gy * CELL
    if (i === 0) d += `M ${fx} ${fy}`
    if (seg.tipo === 'curva') {
      const cpx = (fx + tx) / 2 + seg.cpDx * CELL
      const cpy = (fy + ty) / 2 + seg.cpDy * CELL
      d += ` Q ${cpx} ${cpy} ${tx} ${ty}`
    } else if (seg.tipo === 'arco') {
      if (seg.tipoArco === 'acuto') {
        d += ' ' + arcSvgPathAcuto(fx, fy, tx, ty, seg.cpDx, seg.cpDy, CELL, false)
      } else {
        d += ' ' + arcSvgPath(fx, fy, tx, ty, seg.cpDx, seg.cpDy, CELL, false)
      }
    } else {
      d += ` L ${tx} ${ty}`
    }
  })
  return d ? d + ' Z' : ''
}

// ============================================================
// Pannello configurazione lato
// ============================================================

const TIPO_ARCO_LABELS: Record<TipoArco, string> = {
  ribassato:   'Ribassato',
  tutto_sesto: 'Tutto sesto',
  rialzato:    'Rialzato',
  acuto:       'Acuto / gotico',
  libero:      'Libero',
}


function PannelloLato({
  seg,
  punti,
  onChange,
  onClose,
}: {
  seg: ShapeSegment
  punti: GridPoint[]
  onChange: (patch: Partial<ShapeSegment>) => void
  onClose: () => void
}) {
  const chord = segChord(seg, punti)
  const sagitta = segSagitta(seg)
  const isAcuto = seg.tipoArco === 'acuto'

  // Raggio calcolato (informativo)
  const R = seg.tipo === 'arco' && sagitta > 0.01 && !isAcuto
    ? arcRadius(chord, sagitta).toFixed(2)
    : null

  // Per acuto: calcola R basato sulla altezza del vertice
  const fromPt = punti.find((p) => p.id === seg.fromId)
  const toPt = punti.find((p) => p.id === seg.toId)
  const R_acuto = (() => {
    if (!isAcuto || !fromPt || !toPt) return null
    const chordPx = chord * CELL
    const apexOffPx = sagitta * CELL
    // Per arco acuto simmetrico: vertice = offset perpendicolare ≈ apexOffPx
    if (chordPx < 0.5 || apexOffPx < 0.5) return null
    return arcRadiusSpezzato(chordPx, apexOffPx).toFixed(1)
  })()

  // Classificazione automatica (solo per archi singoli)
  const autoClass = !isAcuto && chord > 0 && sagitta > 0.01
    ? classifyArco(chord, sagitta)
    : null

  const applyPreset = (tipo: TipoArco) => {
    if (!fromPt || !toPt) return
    const base = { tipo: 'arco' as const, tipoArco: tipo }
    switch (tipo) {
      case 'tutto_sesto': {
        const cp = cpForTuttoSesto(fromPt.gx, fromPt.gy, toPt.gx, toPt.gy)
        onChange({
          ...base, ...cp,
          sagittaTipo: 'calcolato',
          sagittaFormula: (seg.misuraNome || 'Corda') + ' / 2',
          sagittaNome: seg.sagittaNome || 'Freccia',
        })
        break
      }
      case 'ribassato': {
        const cp = cpForRibassato(fromPt.gx, fromPt.gy, toPt.gx, toPt.gy)
        onChange({ ...base, ...cp, sagittaNome: seg.sagittaNome || 'Freccia', sagittaTipo: 'input' })
        break
      }
      case 'rialzato': {
        const cp = cpForRialzato(fromPt.gx, fromPt.gy, toPt.gx, toPt.gy)
        onChange({ ...base, ...cp, sagittaNome: seg.sagittaNome || 'Freccia', sagittaTipo: 'input' })
        break
      }
      case 'acuto': {
        const cp = cpForAcuto(fromPt.gx, fromPt.gy, toPt.gx, toPt.gy)
        onChange({ ...base, ...cp, sagittaNome: seg.sagittaNome || 'Vertice', sagittaTipo: 'input' })
        break
      }
      case 'libero': {
        onChange({ ...base })
        break
      }
    }
  }

  // Colore handle in base al tipo
  const handleColor = isAcuto ? '#7c3aed' : '#ea580c'

  return (
    <div className="bg-white border border-teal-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Configura lato</p>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tipo lato */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Tipo lato</label>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ tipo: 'retta', cpDx: 0, cpDy: 0, tipoArco: undefined })}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              seg.tipo === 'retta' ? 'bg-teal-50 border-teal-400 text-teal-700' : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            Retta
          </button>
          <button
            onClick={() => onChange({
              tipo: 'curva',
              tipoArco: undefined,
              cpDx: seg.cpDx,
              cpDy: seg.cpDy === 0 && seg.cpDx === 0 ? -1.2 : seg.cpDy,
            })}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              seg.tipo === 'curva' ? 'bg-teal-50 border-teal-400 text-teal-700' : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            Curva libera
          </button>
          <button
            onClick={() => { if (seg.tipo !== 'arco') applyPreset('tutto_sesto') }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              seg.tipo === 'arco' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            Arco
          </button>
        </div>
      </div>

      {/* Curva libera: hint */}
      {seg.tipo === 'curva' && (
        <p className="text-xs text-gray-400">Trascina il punto ● per regolare la curva</p>
      )}

      {/* ======= SEZIONE ARCO ======= */}
      {seg.tipo === 'arco' && (
        <>
          {/* Tipologia arco */}
          <div className="border border-orange-100 rounded-xl p-3 space-y-2 bg-orange-50/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-orange-800">Tipologia arco</label>
              {autoClass && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                  {TIPO_ARCO_LABELS[autoClass]}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {(['ribassato', 'tutto_sesto', 'rialzato', 'acuto', 'libero'] as TipoArco[]).map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => applyPreset(tipo)}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-medium border text-center transition-colors leading-tight ${
                    seg.tipoArco === tipo
                      ? tipo === 'acuto'
                        ? 'bg-violet-50 border-violet-400 text-violet-700'
                        : 'bg-orange-100 border-orange-400 text-orange-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50'
                  }`}
                >
                  {TIPO_ARCO_LABELS[tipo]}
                </button>
              ))}
            </div>
          </div>

          {/* ===== MISURE ARCO: sezione principale ===== */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">

            {/* Riga CORDA */}
            <div className="px-3 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-3 h-0.5 bg-slate-600 rounded" />
                <span className="text-xs font-semibold text-gray-700">
                  {isAcuto ? 'Corda (base del vano)' : 'Lato / Corda'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={seg.misuraNome}
                  onChange={(e) => onChange({ misuraNome: e.target.value })}
                  placeholder={isAcuto ? 'es. Larghezza' : 'es. Larghezza'}
                  className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <select
                  value={seg.misuraTipo}
                  onChange={(e) => onChange({ misuraTipo: e.target.value as 'input' | 'calcolato' })}
                  className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="input">Da rilevare</option>
                  <option value="calcolato">Calcolato</option>
                </select>
              </div>
              {seg.misuraTipo === 'calcolato' && (
                <input
                  type="text"
                  value={seg.misuraFormula}
                  onChange={(e) => onChange({ misuraFormula: e.target.value })}
                  placeholder="Formula (es. Larghezza * 2)"
                  className="mt-1.5 w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50/40 font-mono text-xs"
                />
              )}
            </div>

            {/* Riga FRECCIA / VERTICE */}
            <div className="px-3 py-2.5 bg-orange-50/30">
              <div className="flex items-center gap-2 mb-1.5">
                {/* Pallino colorato = handle draggabile */}
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="5" fill={handleColor} />
                </svg>
                <span className="text-xs font-semibold" style={{ color: handleColor }}>
                  {isAcuto ? 'Vertice (punto più alto)' : 'Freccia (vertice arco)'}
                </span>
                <span className="text-[10px] text-gray-400 ml-auto">← il punto ● sul disegno</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={seg.sagittaNome}
                  onChange={(e) => onChange({ sagittaNome: e.target.value })}
                  placeholder={isAcuto ? 'es. Vertice' : 'es. Freccia'}
                  className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2"
                  style={{
                    borderColor: seg.sagittaNome ? handleColor : '#d1d5db',
                    outlineColor: handleColor,
                  }}
                />
                <select
                  value={seg.sagittaTipo}
                  onChange={(e) => onChange({ sagittaTipo: e.target.value as 'input' | 'calcolato' })}
                  className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 bg-white"
                  style={{ outlineColor: handleColor }}
                >
                  <option value="input">Da rilevare</option>
                  <option value="calcolato">Calcolato</option>
                </select>
              </div>
              {seg.sagittaTipo === 'calcolato' && (
                <input
                  type="text"
                  value={seg.sagittaFormula}
                  onChange={(e) => onChange({ sagittaFormula: e.target.value })}
                  placeholder={isAcuto ? 'es. Larghezza * 0.65' : 'es. Larghezza / 2'}
                  className="mt-1.5 w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50/40 font-mono text-xs"
                />
              )}
              {/* Hint drag */}
              <p className="text-[10px] text-gray-400 mt-1.5">
                {isAcuto
                  ? 'Trascina ● sul disegno per posizionare il vertice'
                  : 'Trascina ● per regolare la freccia — o imposta un preset sopra'}
              </p>
            </div>
          </div>

          {/* Formula raggio (info compatta) */}
          <div className="flex items-center gap-2 text-[11px] text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
            <span className="font-mono font-semibold shrink-0">
              {isAcuto ? 'R=(L²+4V²)/(4L)' : 'R=(L²+4F²)/(8F)'}
            </span>
            <span className="text-orange-500">—</span>
            <span>
              {isAcuto
                ? `L=corda, V=altezza vertice${R_acuto ? ` → R≈${R_acuto}px` : ''}`
                : `L=corda, F=freccia${R ? ` → R≈${R}` : ''}`}
            </span>
          </div>
        </>
      )}

      {/* Misura lato retto */}
      {seg.tipo === 'retta' && (
        <div>
          <div className="flex gap-2">
            <input
              type="text"
              value={seg.misuraNome}
              onChange={(e) => onChange({ misuraNome: e.target.value })}
              placeholder="Nome misura (es. Larghezza)"
              className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <select
              value={seg.misuraTipo}
              onChange={(e) => onChange({ misuraTipo: e.target.value as 'input' | 'calcolato' })}
              className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="input">Da rilevare</option>
              <option value="calcolato">Calcolato</option>
            </select>
          </div>
          {seg.misuraTipo === 'calcolato' && (
            <input
              type="text"
              value={seg.misuraFormula}
              onChange={(e) => onChange({ misuraFormula: e.target.value })}
              placeholder="Formula (es. Larghezza * 2)"
              className="mt-1.5 w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50/40 font-mono text-xs"
            />
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Pannello configurazione angolo
// ============================================================
function PannelloAngolo({
  config,
  onChange,
  onClose,
}: {
  config: AngoloConfig
  onChange: (patch: Partial<AngoloConfig>) => void
  onClose: () => void
}) {
  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Configura angolo</p>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onChange({ tipo: 'automatico', gradi: null })}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            config.tipo === 'automatico' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          Automatico
        </button>
        <button
          onClick={() => onChange({ tipo: 'fisso', gradi: config.gradi ?? 90 })}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            config.tipo === 'fisso' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          Fisso
        </button>
      </div>
      {config.tipo === 'fisso' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Gradi</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={config.gradi ?? ''}
              onChange={(e) => onChange({ gradi: parseFloat(e.target.value) || null })}
              className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="°" min={0} max={360}
            />
            <span className="text-sm text-gray-400">gradi</span>
          </div>
        </div>
      )}
      {config.tipo === 'automatico' && (
        <p className="text-xs text-gray-400">Il sistema calcolerà i gradi in base alle misure inserite.</p>
      )}
    </div>
  )
}

// ============================================================
// ShapeEditor principale
// ============================================================
export const EMPTY_SHAPE: FormaShape = {
  punti: [],
  segmenti: [],
  angoliConfig: [],
  chiusa: false,
}

function newSegment(fromId: string, toId: string): ShapeSegment {
  return {
    id: uid(), fromId, toId,
    tipo: 'retta', cpDx: 0, cpDy: 0,
    misuraNome: '', misuraTipo: 'input', misuraFormula: '',
    sagittaNome: '', sagittaTipo: 'input', sagittaFormula: '',
  }
}

interface Props {
  value: FormaShape
  onChange: (shape: FormaShape) => void
}

export default function ShapeEditor({ value: shape, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverGrid, setHoverGrid] = useState<{ gx: number; gy: number } | null>(null)
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null)
  const [selectedPtId, setSelectedPtId] = useState<string | null>(null)

  const dragRef = useRef<{
    segId: string
    startCpDx: number
    startCpDy: number
    startSvgX: number
    startSvgY: number
  } | null>(null)

  const vertexDragRef = useRef<{ ptId: string; moved: boolean } | null>(null)

  const getSvgCoords = useCallback((clientX: number, clientY: number) => {
    return svgRef.current ? clientToSvg(svgRef.current, clientX, clientY) : null
  }, [])

  // ---- Click su griglia (disegno) ----
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (shape.chiusa) return
    if (dragRef.current) return
    const pt = getSvgCoords(e.clientX, e.clientY)
    if (!pt) return
    const { gx, gy } = snap(pt.x, pt.y)

    if (shape.punti.length >= 3) {
      const first = shape.punti[0]
      if (first.gx === gx && first.gy === gy) {
        const lastPt = shape.punti[shape.punti.length - 1]
        const closingSeg = newSegment(lastPt.id, first.id)
        const angoliConfig: AngoloConfig[] = shape.punti.map((p) => ({
          puntoId: p.id, tipo: 'automatico', gradi: null,
        }))
        const closedShape = { ...shape, segmenti: [...shape.segmenti, closingSeg], angoliConfig, chiusa: true }
        onChange(autoConstrainShape(closedShape))
        return
      }
    }

    if (shape.punti.some((p) => p.gx === gx && p.gy === gy)) return

    const newPt: GridPoint = { id: uid(), gx, gy }
    const newSegs = [...shape.segmenti]
    if (shape.punti.length >= 1) {
      const last = shape.punti[shape.punti.length - 1]
      newSegs.push(newSegment(last.id, newPt.id))
    }
    onChange({ ...shape, punti: [...shape.punti, newPt], segmenti: newSegs })
  }

  // ---- Hover + drag ----
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pt = getSvgCoords(e.clientX, e.clientY)
    if (!pt) return

    if (vertexDragRef.current) {
      const { gx, gy } = snap(pt.x, pt.y)
      const ptId = vertexDragRef.current.ptId
      const occupied = shape.punti.some((p) => p.id !== ptId && p.gx === gx && p.gy === gy)
      if (!occupied) {
        const existing = shape.punti.find((p) => p.id === ptId)
        if (existing && (existing.gx !== gx || existing.gy !== gy)) {
          vertexDragRef.current.moved = true
          onChange({ ...shape, punti: shape.punti.map((p) => p.id === ptId ? { ...p, gx, gy } : p) })
        }
      }
      return
    }

    if (dragRef.current) {
      const { segId, startCpDx, startCpDy, startSvgX, startSvgY } = dragRef.current
      const dx = (pt.x - startSvgX) / CELL
      const dy = (pt.y - startSvgY) / CELL
      onChange({
        ...shape,
        segmenti: shape.segmenti.map((s) =>
          s.id === segId ? { ...s, cpDx: startCpDx + dx, cpDy: startCpDy + dy } : s
        ),
      })
      return
    }

    if (!shape.chiusa) {
      const { gx, gy } = snap(pt.x, pt.y)
      setHoverGrid({ gx, gy })
    }
  }

  const handlePointerUp = () => {
    if (vertexDragRef.current) {
      const { ptId, moved } = vertexDragRef.current
      vertexDragRef.current = null
      if (!moved) {
        setSelectedPtId(ptId)
        setSelectedSegId(null)
      }
      return
    }
    dragRef.current = null
  }
  const handlePointerLeave = () => { setHoverGrid(null); dragRef.current = null; vertexDragRef.current = null }

  const handleCpPointerDown = (e: React.PointerEvent<SVGCircleElement>, seg: ShapeSegment) => {
    e.stopPropagation()
    const pt = getSvgCoords(e.clientX, e.clientY)
    if (!pt) return
    ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      segId: seg.id,
      startCpDx: seg.cpDx, startCpDy: seg.cpDy,
      startSvgX: pt.x, startSvgY: pt.y,
    }
  }

  // ---- Undo / Reset ----
  const handleUndo = () => {
    if (shape.chiusa || shape.punti.length === 0) return
    onChange({ ...shape, punti: shape.punti.slice(0, -1), segmenti: shape.segmenti.slice(0, -1) })
  }

  const handleReset = () => {
    onChange(EMPTY_SHAPE)
    setSelectedSegId(null)
    setSelectedPtId(null)
  }

  // ---- Update handlers ----
  const updateSeg = (patch: Partial<ShapeSegment>) => {
    if (!selectedSegId) return
    onChange({
      ...shape,
      segmenti: shape.segmenti.map((s) => (s.id === selectedSegId ? { ...s, ...patch } : s)),
    })
  }

  const updateAngolo = (patch: Partial<AngoloConfig>) => {
    if (!selectedPtId) return
    onChange({
      ...shape,
      angoliConfig: shape.angoliConfig.map((a) =>
        a.puntoId === selectedPtId ? { ...a, ...patch } : a
      ),
    })
  }

  // ---- Dati derivati ----
  const firstPt = shape.punti[0] ?? null
  const lastPt = shape.punti[shape.punti.length - 1] ?? null
  const canClose =
    !shape.chiusa && shape.punti.length >= 3 &&
    hoverGrid?.gx === firstPt?.gx && hoverGrid?.gy === firstPt?.gy

  const selectedSeg = shape.segmenti.find((s) => s.id === selectedSegId)
  const selectedAngoloConfig = selectedPtId
    ? shape.angoliConfig.find((a) => a.puntoId === selectedPtId)
    : null

  const closedPath = buildClosedPath(shape)

  return (
    <div className="flex flex-col gap-3">
      {/* Canvas SVG */}
      <div className="relative bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="w-full touch-none select-none"
          style={{ cursor: shape.chiusa ? 'default' : 'crosshair' }}
          onClick={handleSvgClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {/* Griglia */}
          {Array.from({ length: GRID_N }, (_, gy) =>
            Array.from({ length: GRID_N }, (_, gx) => (
              <circle key={`${gx}-${gy}`} cx={gx * CELL} cy={gy * CELL} r={2} fill="#d1d5db" />
            ))
          )}

          {/* Fill forma chiusa */}
          {closedPath && <path d={closedPath} fill="#ccf2f0" stroke="none" />}

          {/* Segmenti */}
          {shape.segmenti.map((seg) => {
            const isSelected = selectedSegId === seg.id
            const isAcuto = seg.tipoArco === 'acuto'
            const isArco = seg.tipo === 'arco'
            const showCp = (seg.tipo === 'curva' || isArco) && shape.chiusa
            const cp = showCp ? cpPos(seg, shape.punti) : null

            const strokeColor = isSelected
              ? isAcuto ? '#7c3aed' : isArco ? '#ea580c' : '#0d9488'
              : isAcuto ? '#6d28d9' : isArco ? '#c2410c' : '#1e293b'

            return (
              <g key={seg.id}>
                {/* Linea visibile */}
                <path
                  d={segPath(seg, shape.punti)}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {/* Hit area invisibile */}
                {shape.chiusa && (
                  <path
                    d={segPath(seg, shape.punti)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedSegId(seg.id)
                      setSelectedPtId(null)
                    }}
                  />
                )}
                {/* Label misura corda */}
                {seg.misuraNome && shape.chiusa && (() => {
                  const mid = cpPos(seg, shape.punti)
                  if (!mid) return null
                  return (
                    <text
                      x={mid.x} y={mid.y - 8}
                      textAnchor="middle" fontSize={9} fontWeight="600"
                      fill={seg.misuraTipo === 'calcolato' ? '#2563eb' : (isAcuto ? '#7c3aed' : isArco ? '#ea580c' : '#0d9488')}
                      style={{ pointerEvents: 'none' }}
                    >
                      {seg.misuraNome}
                    </text>
                  )
                })()}
                {/* Label freccia / vertice */}
                {isArco && seg.sagittaNome && shape.chiusa && (() => {
                  const mid = cpPos(seg, shape.punti)
                  if (!mid) return null
                  return (
                    <text
                      x={mid.x} y={mid.y + 15}
                      textAnchor="middle" fontSize={8}
                      fill={isAcuto ? '#7c3aed' : '#ea580c'} fontStyle="italic"
                      style={{ pointerEvents: 'none' }}
                    >
                      {seg.sagittaNome}
                    </text>
                  )
                })()}
                {/* Badge tipo arco */}
                {isArco && seg.tipoArco && shape.chiusa && (() => {
                  const mid = cpPos(seg, shape.punti)
                  if (!mid) return null
                  const label = TIPO_ARCO_LABELS[seg.tipoArco]
                  return (
                    <text
                      x={mid.x} y={mid.y + 26}
                      textAnchor="middle" fontSize={7}
                      fill={isAcuto ? '#7c3aed' : '#9a3412'}
                      opacity={0.7}
                      style={{ pointerEvents: 'none' }}
                    >
                      {label}
                    </text>
                  )
                })()}
                {/* CP handle */}
                {cp && (
                  <circle
                    cx={cp.x} cy={cp.y} r={8}
                    fill={isAcuto ? '#7c3aed' : isArco ? '#ea580c' : '#0d9488'}
                    stroke="white" strokeWidth={2}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => handleCpPointerDown(e, seg)}
                  />
                )}
              </g>
            )
          })}

          {/* Punti */}
          {shape.punti.map((pt, i) => {
            const x = pt.gx * CELL, y = pt.gy * CELL
            const isFirst = i === 0
            const isSelected = selectedPtId === pt.id
            const willClose = isFirst && canClose
            const angleCfg = shape.angoliConfig.find((a) => a.puntoId === pt.id)
            return (
              <g key={pt.id}>
                <circle
                  cx={x} cy={y}
                  r={isFirst && !shape.chiusa ? 8 : 5}
                  fill={
                    willClose ? '#22c55e'
                    : isSelected ? '#0d9488'
                    : isFirst && !shape.chiusa ? 'white'
                    : '#1e293b'
                  }
                  stroke={isFirst && !shape.chiusa ? '#1e293b' : 'none'}
                  strokeWidth={2}
                  style={{
                    cursor: shape.chiusa ? 'move' : (isFirst && shape.punti.length >= 3 ? 'pointer' : 'crosshair'),
                  }}
                  onPointerDown={(e) => {
                    if (!shape.chiusa) return
                    e.stopPropagation()
                    ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
                    vertexDragRef.current = { ptId: pt.id, moved: false }
                  }}
                />
                {shape.chiusa && angleCfg?.tipo === 'fisso' && angleCfg.gradi != null && (
                  <text
                    x={x} y={y + 16}
                    textAnchor="middle" fontSize={8} fill="#7c3aed" fontWeight="600"
                    style={{ pointerEvents: 'none' }}
                  >
                    {angleCfg.gradi}°
                  </text>
                )}
              </g>
            )
          })}

          {/* Preview linea tratteggiata */}
          {!shape.chiusa && lastPt && hoverGrid && !(hoverGrid.gx === lastPt.gx && hoverGrid.gy === lastPt.gy) && (
            <line
              x1={lastPt.gx * CELL} y1={lastPt.gy * CELL}
              x2={hoverGrid.gx * CELL} y2={hoverGrid.gy * CELL}
              stroke={canClose ? '#22c55e' : '#0d9488'}
              strokeWidth={1.5} strokeDasharray="5,4" opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Hover indicator */}
          {!shape.chiusa && hoverGrid && (
            <circle
              cx={hoverGrid.gx * CELL} cy={hoverGrid.gy * CELL} r={5}
              fill={canClose ? '#22c55e' : '#0d9488'} opacity={0.45}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* Legenda */}
        {shape.chiusa && (
          <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-slate-800 inline-block" /> lato retto
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-teal-600 inline-block" /> curva libera
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-orange-600 inline-block rounded" /> arco circolare
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-violet-600 inline-block rounded" /> arco acuto/gotico
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" /> calcolato
            </span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {!shape.chiusa && (
          <>
            <button
              onClick={handleUndo}
              disabled={shape.punti.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" /> Annulla
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ricomincia
            </button>
            <span className="text-xs text-gray-400 ml-1">
              {shape.punti.length === 0
                ? 'Tocca la griglia per posizionare i punti'
                : shape.punti.length < 3
                ? `${shape.punti.length} punto${shape.punti.length > 1 ? 'i' : ''} — aggiungi almeno 3`
                : 'Tocca il primo punto ○ per chiudere'}
            </span>
          </>
        )}
        {shape.chiusa && (
          <>
            <span className="text-xs text-gray-500">
              Tocca un <span className="font-medium text-teal-700">lato</span> per configurarlo ·
              Tocca un <span className="font-medium text-gray-700">vertice</span> per l&apos;angolo ·
              Trascina un <span className="font-medium text-gray-700">vertice</span> per spostarlo
            </span>
            <button
              onClick={() => onChange(autoConstrainShape(shape))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 text-sm text-teal-600 hover:bg-teal-50"
              title="Ricalcola automaticamente nomi e vincoli geometrici"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Ricalcola vincoli
            </button>
            <button
              onClick={handleReset}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-500 hover:bg-red-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ridisegna
            </button>
          </>
        )}
      </div>

      {/* Pannello lato */}
      {selectedSeg && (
        <PannelloLato
          seg={selectedSeg}
          punti={shape.punti}
          onChange={updateSeg}
          onClose={() => setSelectedSegId(null)}
        />
      )}

      {/* Pannello angolo */}
      {selectedPtId && selectedAngoloConfig && (
        <PannelloAngolo
          config={selectedAngoloConfig}
          onChange={updateAngolo}
          onClose={() => setSelectedPtId(null)}
        />
      )}
    </div>
  )
}
