'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import type { VanoMisurato } from '@/lib/rilievo'
import { computeRealDimensions, calcolaRaggi, evaluaFormule, extractCampiRilievo } from '@/lib/rilievo'
import { shapeToPathProportional } from '@/types/rilievo'
import type { FormaShape } from '@/types/rilievo'

const PAD_LEFT   = 62
const PAD_BOTTOM = 54
const PAD_TOP    = 20
const PAD_RIGHT  = 20

function getPrimaryMeasureNames(shape: FormaShape, valori: Record<string, number>) {
  let widthName: string | null = null
  let heightName: string | null = null
  let maxH = 0, maxV = 0
  for (const seg of shape.segmenti) {
    const from = shape.punti.find((p) => p.id === seg.fromId)
    const to   = shape.punti.find((p) => p.id === seg.toId)
    if (!from || !to || !seg.misuraNome) continue
    const dgx = Math.abs(to.gx - from.gx)
    const dgy = Math.abs(to.gy - from.gy)
    const val = valori[seg.misuraNome] ?? 0
    if (val <= 0) continue
    if (dgx >= dgy && val > maxH) { maxH = val; widthName  = seg.misuraNome }
    if (dgy >  dgx && val > maxV) { maxV = val; heightName = seg.misuraNome }
  }
  return { widthName, heightName }
}

interface EditState { field: string; value: string; cx: number; cy: number }
interface Props { vano: VanoMisurato }

export default function CanvasVano({ vano }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)

  const inputFieldNames = useMemo(() => {
    const campi = extractCampiRilievo(vano.forma.shape)
    return new Set(campi.filter((c) => c.tipoMisura === 'input').map((c) => c.nome))
  }, [vano.forma.shape])

  const [localInput, setLocalInput] = useState<Record<string, number>>(() => {
    const names = new Set(
      extractCampiRilievo(vano.forma.shape).filter((c) => c.tipoMisura === 'input').map((c) => c.nome)
    )
    return Object.fromEntries(Object.entries(vano.valori).filter(([k]) => names.has(k)))
  })

  const localValori = useMemo(
    () => evaluaFormule(vano.forma.shape, localInput),
    [vano.forma.shape, localInput]
  )

  const [cSize, setCSize] = useState({ w: 360, h: 480 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setCSize({ w: e.contentRect.width, h: e.contentRect.height })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [zoom, setZoom] = useState(1)
  const [pan,  setPan]  = useState({ x: 0, y: 0 })
  const [editing, setEditing] = useState<EditState | null>(null)

  const panRef     = useRef({ x: 0, y: 0 })
  const dragRef    = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const touchRef   = useRef<{ dist: number; mx: number; my: number } | null>(null)
  const wasDragRef = useRef(false)

  useEffect(() => { panRef.current = pan }, [pan])

  // ── geometry ──────────────────────────────────────────────
  const { widthMm, heightMm } = useMemo(
    () => computeRealDimensions(vano.forma.shape, localValori),
    [vano.forma.shape, localValori]
  )
  const { widthName, heightName } = useMemo(
    () => getPrimaryMeasureNames(vano.forma.shape, localValori),
    [vano.forma.shape, localValori]
  )
  const raggi = useMemo(
    () => calcolaRaggi(vano.forma.shape, localValori),
    [vano.forma.shape, localValori]
  )

  const layout = useMemo(() => {
    const availW = cSize.w - PAD_LEFT - PAD_RIGHT
    const availH = cSize.h - PAD_TOP  - PAD_BOTTOM
    if (availW < 10 || availH < 10) return null
    const scale    = Math.min(availW / widthMm, availH / heightMm)
    const shapePxW = widthMm  * scale
    const shapePxH = heightMm * scale
    const shapeOffX = PAD_LEFT + (availW - shapePxW) / 2
    const shapeOffY = PAD_TOP  + (availH - shapePxH) / 2
    const ip = Math.min(shapePxW, shapePxH) * 0.07   // innerPad from shapeToPathProportional
    return {
      shapePxW, shapePxH, shapeOffX, shapeOffY,
      dL: shapeOffX + ip,            // draw bounds
      dR: shapeOffX + shapePxW - ip,
      dT: shapeOffY + ip,
      dB: shapeOffY + shapePxH - ip,
    }
  }, [cSize, widthMm, heightMm])

  const shapePath = useMemo(
    () => layout ? shapeToPathProportional(vano.forma.shape, layout.shapePxW, layout.shapePxH) : null,
    [vano.forma.shape, layout]
  )

  // ── zoom/pan event handlers (passive:false) ───────────────
  const wheelHandler = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    setZoom((z) => {
      const nz = Math.min(8, Math.max(0.15, z * f))
      setPan((p) => ({ x: px - (px - p.x) * nz / z, y: py - (py - p.y) * nz / z }))
      return nz
    })
  }, [])

  const touchMoveHandler = useCallback((e: TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 2 && touchRef.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const f  = dist / touchRef.current.dist
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = mx - rect.left
      const py = my - rect.top
      setZoom((z) => {
        const nz = Math.min(8, Math.max(0.15, z * f))
        setPan((p) => ({ x: px - (px - p.x) * nz / z, y: py - (py - p.y) * nz / z }))
        return nz
      })
      touchRef.current = { dist, mx, my }
    } else if (e.touches.length === 1 && dragRef.current) {
      wasDragRef.current = true
      const dx = e.touches[0].clientX - dragRef.current.sx
      const dy = e.touches[0].clientY - dragRef.current.sy
      setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy })
    }
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel',     wheelHandler,     { passive: false })
    el.addEventListener('touchmove', touchMoveHandler, { passive: false })
    return () => {
      el.removeEventListener('wheel',     wheelHandler)
      el.removeEventListener('touchmove', touchMoveHandler)
    }
  }, [wheelHandler, touchMoveHandler])

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    wasDragRef.current = false
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y }
  }
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.sx
    const dy = e.clientY - dragRef.current.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragRef.current = true
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy })
  }
  const onMouseUp = () => { dragRef.current = null }

  const onTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      touchRef.current = {
        dist: Math.sqrt(dx * dx + dy * dy),
        mx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        my: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
      dragRef.current = null
    } else if (e.touches.length === 1) {
      touchRef.current  = null
      wasDragRef.current = false
      dragRef.current = {
        sx: e.touches[0].clientX, sy: e.touches[0].clientY,
        px: panRef.current.x,     py: panRef.current.y,
      }
    }
  }
  const onTouchEnd = () => { dragRef.current = null; touchRef.current = null }

  const onDoubleClick = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // ── edit label ────────────────────────────────────────────
  // cx/cy are SVG-group coordinates (before zoom/pan transform)
  const openEdit = (field: string, cx: number, cy: number) => {
    if (wasDragRef.current || !inputFieldNames.has(field)) return
    setEditing({ field, value: String(Math.round(localValori[field] ?? 0)), cx, cy })
  }

  const confirmEdit = () => {
    if (!editing) return
    const n = parseFloat(editing.value)
    if (!isNaN(n) && n > 0) setLocalInput((p) => ({ ...p, [editing.field]: n }))
    setEditing(null)
  }

  if (!layout) return null

  const { dL, dR, dT, dB, shapeOffX, shapeOffY, shapePxW, shapePxH } = layout
  const s   = (n: number) => n / zoom   // visual-constant size
  const dimVx = dL - 22
  const dimHy = dB + 24
  const midV  = (dT + dB) / 2
  const midH  = (dL + dR) / 2

  // Screen position of edit popup
  const editLeft = editing ? editing.cx * zoom + pan.x : 0
  const editTop  = editing ? editing.cy * zoom + pan.y : 0

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ background: '#dde0e3' }}>
      <svg
        ref={svgRef}
        width="100%" height="100%"
        className="block select-none"
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* ── shape outline ── */}
          {shapePath && (
            <g transform={`translate(${shapeOffX},${shapeOffY})`}>
              <path
                d={shapePath}
                fill="rgba(255,255,255,0.10)"
                stroke="#4b5563"
                strokeWidth={s(2.5)}
                strokeDasharray={`${s(11)} ${s(6)}`}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* ── vertical dim line (height) ── */}
          {heightName && (() => {
            const lx = dimVx
            const editable = inputFieldNames.has(heightName)
            const val = localValori[heightName] ?? heightMm
            return (
              <g key="dim-v" pointerEvents="none">
                <line x1={lx} y1={dT} x2={lx} y2={dB} stroke="#1f2937" strokeWidth={s(1.5)} />
                <line x1={lx - s(5)} y1={dT} x2={lx + s(5)} y2={dT} stroke="#1f2937" strokeWidth={s(1.5)} />
                <line x1={lx - s(5)} y1={dB} x2={lx + s(5)} y2={dB} stroke="#1f2937" strokeWidth={s(1.5)} />
                <circle cx={lx} cy={dT} r={s(4)} fill="#1f2937" />
                <circle cx={lx} cy={dB} r={s(4)} fill="#1f2937" />
                <g pointerEvents="auto">
                  <DimLabel
                    x={lx - s(30)} y={midV}
                    value={val} zoom={zoom} editable={editable}
                    onClick={() => openEdit(heightName, lx - s(30), midV)}
                  />
                </g>
              </g>
            )
          })()}

          {/* ── horizontal dim line (width) ── */}
          {widthName && (() => {
            const ly = dimHy
            const editable = inputFieldNames.has(widthName)
            const val = localValori[widthName] ?? widthMm
            return (
              <g key="dim-h" pointerEvents="none">
                <line x1={dL} y1={ly} x2={dR} y2={ly} stroke="#1f2937" strokeWidth={s(1.5)} />
                <line x1={dL} y1={ly - s(5)} x2={dL} y2={ly + s(5)} stroke="#1f2937" strokeWidth={s(1.5)} />
                <line x1={dR} y1={ly - s(5)} x2={dR} y2={ly + s(5)} stroke="#1f2937" strokeWidth={s(1.5)} />
                <circle cx={dL} cy={ly} r={s(4)} fill="#1f2937" />
                <circle cx={dR} cy={ly} r={s(4)} fill="#1f2937" />
                <g pointerEvents="auto">
                  <DimLabel
                    x={midH} y={ly + s(22)}
                    value={val} zoom={zoom} editable={editable}
                    onClick={() => openEdit(widthName, midH, ly + s(22))}
                  />
                </g>
              </g>
            )
          })()}

          {/* ── arc radii badges ── */}
          {raggi.map((r, i) => (
            <g key={r.segmentoId} transform={`translate(${shapeOffX + shapePxW + s(10)},${shapeOffY + s(8) + s(28) * i})`} pointerEvents="none">
              <rect x={0} y={0} width={s(76)} height={s(22)} rx={s(5)} fill="white" stroke="#fed7aa" strokeWidth={s(1)} />
              <text x={s(38)} y={s(11)} textAnchor="middle" dominantBaseline="middle"
                fontSize={s(10)} fontFamily="monospace" fill="#c2410c">
                R: {r.R} mm
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* ── edit popup (screen-space absolute) ── */}
      {editing && (
        <div
          className="absolute z-50 bg-white shadow-2xl rounded-xl border-2 border-teal-500 flex items-center gap-2 px-3 py-2"
          style={{
            left: Math.max(4, Math.min(cSize.w - 145, editLeft - 68)),
            top:  Math.max(4, Math.min(cSize.h - 54,  editTop  - 24)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            type="number"
            value={editing.value}
            onChange={(e) => setEditing((p) => p ? { ...p, value: e.target.value } : null)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditing(null) }}
            onBlur={confirmEdit}
            className="w-24 text-sm font-mono font-bold text-gray-900 text-center focus:outline-none"
          />
          <span className="text-xs text-gray-400 shrink-0">mm</span>
        </div>
      )}

      <p className="absolute bottom-2 right-3 text-[10px] text-gray-500/50 pointer-events-none select-none">
        rotella / pizzica = zoom &middot; doppio click = reset
      </p>
    </div>
  )
}

// ── DimLabel (SVG) ────────────────────────────────────────────
function DimLabel({ x, y, value, zoom, editable, onClick }: {
  x: number; y: number; value: number; zoom: number; editable: boolean; onClick: () => void
}) {
  const w = 62 / zoom
  const h = 28 / zoom
  return (
    <g
      style={{ cursor: editable ? 'pointer' : 'default' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (editable) onClick() }}
    >
      <rect
        x={x - w / 2} y={y - h / 2} width={w} height={h}
        rx={7 / zoom}
        fill="white"
        stroke={editable ? '#6b7280' : '#d1d5db'}
        strokeWidth={1.5 / zoom}
      />
      <text
        x={x} y={y}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={13 / zoom} fontWeight="600" fontFamily="monospace"
        fill={editable ? '#111827' : '#9ca3af'}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {value}
      </text>
      {/* invisible larger hit area for easier tapping */}
      {editable && (
        <rect
          x={x - w / 2 - 6 / zoom} y={y - h / 2 - 6 / zoom}
          width={w + 12 / zoom} height={h + 12 / zoom}
          fill="transparent"
        />
      )}
    </g>
  )
}
