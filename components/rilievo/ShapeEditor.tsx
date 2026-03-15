'use client'

import { useState, useRef, useCallback } from 'react'
import { Undo2, RotateCcw, X } from 'lucide-react'
import type { GridPoint, ShapeSegment, AngoloConfig, FormaShape } from '@/types/rilievo'

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
    } else {
      d += ` L ${tx} ${ty}`
    }
  })
  return d ? d + ' Z' : ''
}

// ============================================================
// Pannello configurazione lato
// ============================================================
function PannelloLato({
  seg,
  onChange,
  onClose,
}: {
  seg: ShapeSegment
  onChange: (patch: Partial<ShapeSegment>) => void
  onClose: () => void
}) {
  return (
    <div className="bg-white border border-teal-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Configura lato</p>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nome misura</label>
          <input
            type="text"
            value={seg.misuraNome}
            onChange={(e) => onChange({ misuraNome: e.target.value })}
            placeholder="es. Larghezza"
            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tipo misura</label>
          <select
            value={seg.misuraTipo}
            onChange={(e) => onChange({ misuraTipo: e.target.value as 'input' | 'calcolato' })}
            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="input">Da rilevare sul posto</option>
            <option value="calcolato">Calcolato dal sistema</option>
          </select>
        </div>
      </div>

      {seg.misuraTipo === 'calcolato' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Formula (usa i nomi misura degli altri lati)</label>
          <input
            type="text"
            value={seg.misuraFormula}
            onChange={(e) => onChange({ misuraFormula: e.target.value })}
            placeholder="es. Larghezza / 2"
            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Tipo lato</label>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ tipo: 'retta', cpDx: 0, cpDy: 0 })}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              seg.tipo === 'retta'
                ? 'bg-teal-50 border-teal-400 text-teal-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            Retta
          </button>
          <button
            onClick={() =>
              onChange({
                tipo: 'curva',
                cpDx: seg.cpDx,
                cpDy: seg.cpDy === 0 && seg.cpDx === 0 ? -1.2 : seg.cpDy,
              })
            }
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              seg.tipo === 'curva'
                ? 'bg-teal-50 border-teal-400 text-teal-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            Curva
          </button>
        </div>
        {seg.tipo === 'curva' && (
          <p className="text-xs text-gray-400 mt-1.5">
            Trascina il punto ● sul disegno per regolare la curva
          </p>
        )}
      </div>
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
            config.tipo === 'automatico'
              ? 'bg-blue-50 border-blue-400 text-blue-700'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          Automatico
        </button>
        <button
          onClick={() => onChange({ tipo: 'fisso', gradi: config.gradi ?? 90 })}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            config.tipo === 'fisso'
              ? 'bg-blue-50 border-blue-400 text-blue-700'
              : 'bg-gray-50 border-gray-200 text-gray-600'
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
              placeholder="°"
              min={0}
              max={360}
            />
            <span className="text-sm text-gray-400">gradi</span>
          </div>
        </div>
      )}
      {config.tipo === 'automatico' && (
        <p className="text-xs text-gray-400">
          Il sistema calcolerà i gradi in base alle misure inserite.
        </p>
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

interface Props {
  value: FormaShape
  onChange: (shape: FormaShape) => void
}

export default function ShapeEditor({ value: shape, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverGrid, setHoverGrid] = useState<{ gx: number; gy: number } | null>(null)
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null)
  const [selectedPtId, setSelectedPtId] = useState<string | null>(null)

  // Drag bezier CP
  const dragRef = useRef<{
    segId: string
    startCpDx: number
    startCpDy: number
    startSvgX: number
    startSvgY: number
  } | null>(null)

  const getSvgCoords = useCallback((clientX: number, clientY: number) => {
    return svgRef.current ? clientToSvg(svgRef.current, clientX, clientY) : null
  }, [])

  // ---- Disegno (click su griglia) ----
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (shape.chiusa) return
    if (dragRef.current) return
    const pt = getSvgCoords(e.clientX, e.clientY)
    if (!pt) return
    const { gx, gy } = snap(pt.x, pt.y)

    // Chiudi forma (click sul primo punto, almeno 3 punti)
    if (shape.punti.length >= 3) {
      const first = shape.punti[0]
      if (first.gx === gx && first.gy === gy) {
        const lastPt = shape.punti[shape.punti.length - 1]
        const closingSeg: ShapeSegment = {
          id: uid(), fromId: lastPt.id, toId: first.id,
          tipo: 'retta', cpDx: 0, cpDy: 0,
          misuraNome: '', misuraTipo: 'input', misuraFormula: '',
        }
        const angoliConfig: AngoloConfig[] = shape.punti.map((p) => ({
          puntoId: p.id, tipo: 'automatico', gradi: null,
        }))
        onChange({ ...shape, segmenti: [...shape.segmenti, closingSeg], angoliConfig, chiusa: true })
        return
      }
    }

    // Non aggiungere duplicati
    if (shape.punti.some((p) => p.gx === gx && p.gy === gy)) return

    const newPt: GridPoint = { id: uid(), gx, gy }
    const newSegs = [...shape.segmenti]
    if (shape.punti.length >= 1) {
      const last = shape.punti[shape.punti.length - 1]
      newSegs.push({
        id: uid(), fromId: last.id, toId: newPt.id,
        tipo: 'retta', cpDx: 0, cpDy: 0,
        misuraNome: '', misuraTipo: 'input', misuraFormula: '',
      })
    }
    onChange({ ...shape, punti: [...shape.punti, newPt], segmenti: newSegs })
  }

  // ---- Hover (draw mode) & drag update ----
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pt = getSvgCoords(e.clientX, e.clientY)
    if (!pt) return

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

  const handlePointerUp = () => { dragRef.current = null }
  const handlePointerLeave = () => { setHoverGrid(null); dragRef.current = null }

  // ---- Drag CP ----
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
    onChange({
      ...shape,
      punti: shape.punti.slice(0, -1),
      segmenti: shape.segmenti.slice(0, -1),
    })
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
            const cp = seg.tipo === 'curva' && shape.chiusa ? cpPos(seg, shape.punti) : null
            return (
              <g key={seg.id}>
                {/* Linea visibile */}
                <path
                  d={segPath(seg, shape.punti)}
                  fill="none"
                  stroke={isSelected ? '#0d9488' : '#1e293b'}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {/* Hit area invisibile (solo dopo chiusura) */}
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
                {/* Label misura al centro lato */}
                {seg.misuraNome && shape.chiusa && (() => {
                  const mid = cpPos(seg, shape.punti)
                  if (!mid) return null
                  return (
                    <text
                      x={mid.x}
                      y={mid.y - 7}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight="600"
                      fill={seg.misuraTipo === 'calcolato' ? '#2563eb' : '#0d9488'}
                      style={{ pointerEvents: 'none' }}
                    >
                      {seg.misuraNome}
                    </text>
                  )
                })()}
                {/* CP handle curva */}
                {cp && (
                  <circle
                    cx={cp.x}
                    cy={cp.y}
                    r={8}
                    fill="#0d9488"
                    stroke="white"
                    strokeWidth={2}
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
                  cx={x}
                  cy={y}
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
                    cursor: shape.chiusa ? 'pointer' : (isFirst && shape.punti.length >= 3 ? 'pointer' : 'crosshair'),
                  }}
                  onClick={(e) => {
                    if (shape.chiusa) {
                      e.stopPropagation()
                      setSelectedPtId(pt.id)
                      setSelectedSegId(null)
                    }
                  }}
                />
                {/* Badge angolo fisso */}
                {shape.chiusa && angleCfg?.tipo === 'fisso' && angleCfg.gradi != null && (
                  <text
                    x={x}
                    y={y + 16}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#7c3aed"
                    fontWeight="600"
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
              strokeWidth={1.5}
              strokeDasharray="5,4"
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Indicatore hover */}
          {!shape.chiusa && hoverGrid && (
            <circle
              cx={hoverGrid.gx * CELL}
              cy={hoverGrid.gy * CELL}
              r={5}
              fill={canClose ? '#22c55e' : '#0d9488'}
              opacity={0.45}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* Legenda colori (dopo chiusura) */}
        {shape.chiusa && (
          <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-teal-600 inline-block" /> misura da rilevare
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-blue-600 inline-block" /> misura calcolata
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" /> angolo fisso
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
                ? 'Aggiungi almeno 3 punti'
                : 'Tocca il primo punto ○ per chiudere la forma'}
            </span>
          </>
        )}
        {shape.chiusa && (
          <>
            <span className="text-xs text-gray-500">
              Tocca un <span className="font-medium text-teal-700">lato</span> per configurare la misura ·
              Tocca un <span className="font-medium text-gray-700">vertice</span> per l&apos;angolo
            </span>
            <button
              onClick={handleReset}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-500 hover:bg-red-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ridisegna
            </button>
          </>
        )}
      </div>

      {/* Pannello lato selezionato */}
      {selectedSeg && (
        <PannelloLato
          seg={selectedSeg}
          onChange={(patch) => { updateSeg(patch) }}
          onClose={() => setSelectedSegId(null)}
        />
      )}

      {/* Pannello angolo selezionato */}
      {selectedPtId && selectedAngoloConfig && (
        <PannelloAngolo
          config={selectedAngoloConfig}
          onChange={(patch) => { updateAngolo(patch) }}
          onClose={() => setSelectedPtId(null)}
        />
      )}
    </div>
  )
}
