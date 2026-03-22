'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import type { VanoMisurato } from '@/lib/rilievo'
import { computeRealDimensions, calcolaRaggi, evaluaFormule, extractCampiRilievo, computeRealPositions } from '@/lib/rilievo'
import { shapeToPathProportional, arcSvgPathScaled, arcSvgPathAcutoScaled } from '@/types/rilievo'

const PAD_LEFT   = 62
const PAD_BOTTOM = 54
const PAD_TOP    = 20
const PAD_RIGHT  = 20

// ── Componenti serramento ─────────────────────────────────────
export type ComponenteId =
  | 'telaio'
  | 'anta_battente'
  | 'anta_scorrevole'
  | 'traverso'
  | 'montante'
  | 'ferma_vetro'

const COMPONENTI: { id: ComponenteId; label: string; desc: string }[] = [
  { id: 'telaio',          label: 'Telaio',              desc: 'Cornice/profilo perimetrale' },
  { id: 'anta_battente',   label: 'Anta battente',       desc: 'Anta a cerniera' },
  { id: 'anta_scorrevole', label: 'Anta scorrevole',     desc: 'Anta a scorrimento' },
  { id: 'traverso',        label: 'Traverso',            desc: 'Profilo orizzontale interno' },
  { id: 'montante',        label: 'Montante',            desc: 'Profilo verticale interno' },
  { id: 'ferma_vetro',     label: 'Ferma Vetro',         desc: 'Ferma vetro / ferma pannello' },
]


interface EditState { field: string; value: string; cx: number; cy: number }
interface TelaioAggiunto { id: string; tipo: 'scorrevole' | 'battente'; lati: TelaioLatiId }
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
  const [editing, setEditing]   = useState<EditState | null>(null)
  const [menuStep, setMenuStep] = useState<null | 'componenti' | 'telaio_tipo' | 'telaio_lati'>(null)
  const [telaioTipo, setTelaioTipo] = useState<'scorrevole' | 'battente' | null>(null)
  const [telai, setTelai] = useState<TelaioAggiunto[]>([])

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
    return { shapePxW, shapePxH, shapeOffX, shapeOffY }
  }, [cSize, widthMm, heightMm])

  // Fallback path (coordinate griglia) — usato solo se misure incomplete
  const shapePath = useMemo(
    () => layout ? shapeToPathProportional(vano.forma.shape, layout.shapePxW, layout.shapePxH) : null,
    [vano.forma.shape, layout]
  )

  // Posizioni reali dai valori inseriti
  const realPos = useMemo(
    () => computeRealPositions(vano.forma.shape, localValori),
    [vano.forma.shape, localValori]
  )
  const allPlaced = useMemo(
    () => vano.forma.shape.punti.every((p) => realPos.has(p.id)),
    [vano.forma.shape, realPos]
  )

  // Path reale (coordinate mm → pixel, nello spazio locale shapePxW×shapePxH)
  const realShapePath = useMemo(() => {
    if (!layout || !allPlaced) return null
    const xs = Array.from(realPos.values()).map((p) => p.x)
    const ys = Array.from(realPos.values()).map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const sc = Math.min(layout.shapePxW / rangeX, layout.shapePxH / rangeY)
    const lx = (x: number) => (layout.shapePxW - rangeX * sc) / 2 + (x - minX) * sc
    const ly = (y: number) => (layout.shapePxH - rangeY * sc) / 2 + (y - minY) * sc
    let d = ''
    vano.forma.shape.segmenti.forEach((seg, i) => {
      const fR = realPos.get(seg.fromId), tR = realPos.get(seg.toId)
      if (!fR || !tR) return
      const fx = lx(fR.x), fy = ly(fR.y), tx = lx(tR.x), ty = ly(tR.y)
      if (i === 0) d += `M ${fx.toFixed(1)} ${fy.toFixed(1)}`
      if (seg.tipo === 'curva') {
        const cpx = (fx + tx) / 2 + seg.cpDx * sc
        const cpy = (fy + ty) / 2 + seg.cpDy * sc
        d += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`
      } else if (seg.tipo === 'arco') {
        d += ' ' + (seg.tipoArco === 'acuto'
          ? arcSvgPathAcutoScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, sc, false)
          : arcSvgPathScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, sc, false))
      } else {
        d += ` L ${tx.toFixed(1)} ${ty.toFixed(1)}`
      }
    })
    return d ? d + ' Z' : null
  }, [layout, allPlaced, realPos, vano.forma.shape])

  // Dati per etichette per-segmento (posizioni in coordinate gruppo SVG)
  // Funziona sia con posizioni reali (allPlaced) sia con coordinate griglia (fallback)
  interface SegLabel { id: string; nome: string; midX: number; midY: number; perpX: number; perpY: number }
  const segLabels = useMemo((): SegLabel[] => {
    if (!layout) return []

    let getPtX: (id: string) => number | null
    let getPtY: (id: string) => number | null

    if (allPlaced) {
      const xs = Array.from(realPos.values()).map((p) => p.x)
      const ys = Array.from(realPos.values()).map((p) => p.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const rangeX = maxX - minX || 1
      const rangeY = maxY - minY || 1
      const sc = Math.min(layout.shapePxW / rangeX, layout.shapePxH / rangeY)
      const offLX = (layout.shapePxW - rangeX * sc) / 2
      const offLY = (layout.shapePxH - rangeY * sc) / 2
      getPtX = (id) => { const r = realPos.get(id); return r != null ? layout.shapeOffX + offLX + (r.x - minX) * sc : null }
      getPtY = (id) => { const r = realPos.get(id); return r != null ? layout.shapeOffY + offLY + (r.y - minY) * sc : null }
    } else {
      // Fallback: usa coordinate griglia proporzionali
      const punti = vano.forma.shape.punti
      const gxs = punti.map((p) => p.gx), gys = punti.map((p) => p.gy)
      const minGx = Math.min(...gxs), maxGx = Math.max(...gxs)
      const minGy = Math.min(...gys), maxGy = Math.max(...gys)
      const rangeGx = maxGx - minGx || 1, rangeGy = maxGy - minGy || 1
      const scX = layout.shapePxW / rangeGx, scY = layout.shapePxH / rangeGy
      getPtX = (id) => { const p = punti.find((pt) => pt.id === id); return p != null ? layout.shapeOffX + (p.gx - minGx) * scX : null }
      getPtY = (id) => { const p = punti.find((pt) => pt.id === id); return p != null ? layout.shapeOffY + (p.gy - minGy) * scY : null }
    }

    const seen = new Set<string>()
    const result: SegLabel[] = []
    for (const seg of vano.forma.shape.segmenti) {
      if (!seg.misuraNome || seen.has(seg.misuraNome)) continue
      const fx = getPtX(seg.fromId), fy = getPtY(seg.fromId)
      const tx = getPtX(seg.toId),   ty = getPtY(seg.toId)
      if (fx == null || fy == null || tx == null || ty == null) continue
      seen.add(seg.misuraNome)
      const midX = (fx + tx) / 2, midY = (fy + ty) / 2
      const ddx = tx - fx, ddy = ty - fy
      const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1
      result.push({ id: seg.id, nome: seg.misuraNome, midX, midY, perpX: -ddy / dlen, perpY: ddx / dlen })
    }
    return result
  }, [layout, allPlaced, realPos, vano.forma.shape])

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

  const { shapeOffX, shapeOffY, shapePxW, shapePxH } = layout
  const s = (n: number) => n / zoom   // visual-constant size

  // Screen position of edit popup
  const editLeft = editing ? editing.cx * zoom + pan.x : 0
  const editTop  = editing ? editing.cy * zoom + pan.y : 0

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ background: '#dde0e3' }}>
      <svg
        ref={svgRef}
        width="100%" height="100%"
        className="block select-none"
        style={{ cursor: 'grab', touchAction: 'none' }}
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
          {(realShapePath ?? shapePath) && (
            <g transform={`translate(${shapeOffX},${shapeOffY})`}>
              <path
                d={(realShapePath ?? shapePath)!}
                fill="rgba(255,255,255,0.10)"
                stroke="#4b5563"
                strokeWidth={s(2.5)}
                strokeDasharray={`${s(11)} ${s(6)}`}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* ── telai aggiunti ── */}
          {telai.map((t, idx) => {
            const bw  = Math.max(8, Math.min(shapePxW, shapePxH) * 0.07)
            const oi  = 2 + idx * bw                          // outer inset
            const ox1 = shapeOffX + oi,       oy1 = shapeOffY + oi
            const ox2 = shapeOffX + shapePxW - oi, oy2 = shapeOffY + shapePxH - oi
            const { top, bottom, left, right } = latiAttivi(t.lati)
            const fill = '#d1d5db'
            const str  = '#374151'
            const sw   = s(0.8)
            return (
              <g key={t.id} pointerEvents="none">
                {top    && <rect x={ox1}    y={oy1}    width={ox2-ox1} height={bw}      fill={fill} stroke={str} strokeWidth={sw} />}
                {bottom && <rect x={ox1}    y={oy2-bw} width={ox2-ox1} height={bw}      fill={fill} stroke={str} strokeWidth={sw} />}
                {left   && <rect x={ox1}    y={oy1}    width={bw}      height={oy2-oy1} fill={fill} stroke={str} strokeWidth={sw} />}
                {right  && <rect x={ox2-bw} y={oy1}    width={bw}      height={oy2-oy1} fill={fill} stroke={str} strokeWidth={sw} />}
              </g>
            )
          })}

          {/* ── etichette misure per-segmento ── */}
          {segLabels.map(({ id, nome, midX, midY, perpX, perpY }) => {
            const val = localValori[nome]
            if (!val) return null
            const OFFSET = s(32)
            const lx = midX + perpX * OFFSET
            const ly = midY + perpY * OFFSET
            const isInput = inputFieldNames.has(nome)
            return (
              <g key={`slbl-${id}`}>
                <line
                  x1={midX} y1={midY} x2={lx} y2={ly}
                  stroke="#6b7280" strokeWidth={s(1)}
                  strokeDasharray={`${s(3)} ${s(2)}`}
                  pointerEvents="none"
                />
                <DimLabel
                  x={lx} y={ly}
                  value={Math.round(val)}
                  zoom={zoom}
                  editable={isInput}
                  onClick={() => openEdit(nome, lx, ly)}
                />
              </g>
            )
          })}

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

          {/* ── + button al centro della forma ── */}
          {(() => {
            const cx = shapeOffX + shapePxW / 2
            const cy = shapeOffY + shapePxH / 2
            const r  = s(22)
            return (
              <g
                style={{ cursor: 'pointer' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!wasDragRef.current) setMenuStep('componenti')
                }}
              >
                <circle cx={cx} cy={cy} r={r} fill="rgba(13,148,136,0.13)" stroke="#0d9488" strokeWidth={s(2)} />
                <text
                  x={cx} y={cy}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={s(30)} fontWeight="300" fill="#0d9488"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  +
                </text>
              </g>
            )
          })()}
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

      {/* ── menu componenti (bottom sheet) ── */}
      {menuStep !== null && (
        <>
          {/* backdrop */}
          <div
            className="absolute inset-0 z-30 bg-black/20"
            onClick={() => setMenuStep(null)}
          />
          {/* sheet */}
          <div className="absolute inset-x-0 bottom-0 z-40 bg-white rounded-t-2xl shadow-2xl">
            {/* handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* ── step: lista componenti ── */}
            {menuStep === 'componenti' && (
              <div className="px-5 pb-6 pt-2">
                <p className="text-sm font-semibold text-gray-700 mb-4">Aggiungi componente</p>
                <div className="grid grid-cols-3 gap-3">
                  {COMPONENTI.map(({ id, label, desc }) => (
                    <button
                      key={id}
                      onClick={() => {
                        if (id === 'telaio') {
                          setMenuStep('telaio_tipo')
                        } else {
                          setMenuStep(null)
                          // TODO: aprire schermata configurazione per `id`
                        }
                      }}
                      className="flex flex-col items-center gap-2 px-2 py-3 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all"
                    >
                      <ComponenteIcon id={id} />
                      <span className="text-[11px] font-semibold text-gray-700 text-center leading-tight">
                        {label}
                      </span>
                      <span className="text-[10px] text-gray-400 text-center leading-tight hidden sm:block">
                        {desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── step: lati telaio ── */}
            {menuStep === 'telaio_lati' && (
              <div className="px-5 pb-6 pt-2">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setMenuStep('telaio_tipo')}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <p className="text-sm font-semibold text-gray-700">
                    Telaio {telaioTipo === 'scorrevole' ? 'scorrevole' : 'battente'} — lati
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {TELAIO_LATI.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setTelai(prev => [...prev, {
                          id: Math.random().toString(36).slice(2),
                          tipo: telaioTipo!,
                          lati: id,
                        }])
                        setMenuStep(null)
                      }}
                      className="flex items-center gap-3 px-3 py-3 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all text-left"
                    >
                      <TelaioLatiIcon lati={id} />
                      <span className="text-[12px] font-semibold text-gray-700 leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── step: tipo telaio ── */}
            {menuStep === 'telaio_tipo' && (
              <div className="px-5 pb-6 pt-2">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setMenuStep('componenti')}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <p className="text-sm font-semibold text-gray-700">Telaio — tipo apertura</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setTelaioTipo('scorrevole')
                      setMenuStep('telaio_lati')
                    }}
                    className="flex flex-col items-center gap-3 px-4 py-5 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all"
                  >
                    <svg viewBox="0 0 48 48" className="w-12 h-12">
                      {/* cornice */}
                      <rect x="3" y="3" width="42" height="42" rx="3" fill="none" stroke="#0d9488" strokeWidth="3.5" />
                      {/* due ante scorrevoli */}
                      <rect x="6"  y="8" width="20" height="32" rx="1.5" fill="none" stroke="#0d9488" strokeWidth="2.5" />
                      <rect x="22" y="8" width="20" height="32" rx="1.5" fill="none" stroke="#0d9488" strokeWidth="2.5" />
                      {/* frecce opposte */}
                      <line x1="10" y1="24" x2="17" y2="24" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
                      <polyline points="14,20 18,24 14,28" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="38" y1="24" x2="31" y2="24" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
                      <polyline points="34,20 30,24 34,28" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-800">Scorrevole</span>
                  </button>

                  <button
                    onClick={() => {
                      setTelaioTipo('battente')
                      setMenuStep('telaio_lati')
                    }}
                    className="flex flex-col items-center gap-3 px-4 py-5 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all"
                  >
                    <svg viewBox="0 0 48 48" className="w-12 h-12">
                      {/* cornice */}
                      <rect x="3" y="3" width="42" height="42" rx="3" fill="none" stroke="#0d9488" strokeWidth="3.5" />
                      {/* anta */}
                      <rect x="9" y="8" width="30" height="32" rx="1.5" fill="none" stroke="#0d9488" strokeWidth="2.5" />
                      {/* arco apertura */}
                      <path d="M 39 8 A 30 30 0 0 0 9 38" fill="none" stroke="#0d9488" strokeWidth="1.5" strokeDasharray="3 2" />
                      {/* cerniere sx */}
                      <rect x="9" y="12" width="4" height="6" rx="1" fill="#0d9488" />
                      <rect x="9" y="30" width="4" height="6" rx="1" fill="#0d9488" />
                      {/* maniglia dx */}
                      <rect x="35" y="22" width="4" height="4" rx="2" fill="#0d9488" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-800">Battente</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <p className="absolute bottom-2 right-3 text-[10px] text-gray-500/50 pointer-events-none select-none">
        rotella / pizzica = zoom &middot; doppio click = reset
      </p>
    </div>
  )
}

// ── Telaio lati ──────────────────────────────────────────────
type TelaioLatiId = '4_lati' | '3_lati_testa' | '3_lati_base' | 'solo_dx' | 'solo_sx' | 'solo_testa' | 'solo_base'

const TELAIO_LATI: { id: TelaioLatiId; label: string }[] = [
  { id: '4_lati',      label: 'Tutti e 4 i lati' },
  { id: '3_lati_testa', label: '3 lati (dx, sx, testa)' },
  { id: '3_lati_base',  label: '3 lati (dx, sx, base)' },
  { id: 'solo_dx',     label: 'Solo lato destro' },
  { id: 'solo_sx',     label: 'Solo lato sinistro' },
  { id: 'solo_testa',  label: 'Solo testa' },
  { id: 'solo_base',   label: 'Solo base' },
]

function TelaioLatiIcon({ lati }: { lati: TelaioLatiId }) {
  const S = '#0d9488'
  const W = 3
  const D = '#d1d5db'
  // 28×22 viewBox, outer rect 0,0 → 28,22
  const top    = lati === '4_lati' || lati === '3_lati_testa' || lati === 'solo_testa'
  const bottom = lati === '4_lati' || lati === '3_lati_base'  || lati === 'solo_base'
  const left   = lati === '4_lati' || lati === '3_lati_testa' || lati === '3_lati_base' || lati === 'solo_sx'
  const right  = lati === '4_lati' || lati === '3_lati_testa' || lati === '3_lati_base' || lati === 'solo_dx'
  return (
    <svg viewBox="0 0 28 22" className="w-9 h-7 shrink-0">
      {/* lato testa (top) */}
      <line x1="1" y1="1" x2="27" y2="1" stroke={top    ? S : D} strokeWidth={W} strokeLinecap="round" />
      {/* lato base (bottom) */}
      <line x1="1" y1="21" x2="27" y2="21" stroke={bottom ? S : D} strokeWidth={W} strokeLinecap="round" />
      {/* lato sinistro */}
      <line x1="1" y1="1" x2="1" y2="21" stroke={left   ? S : D} strokeWidth={W} strokeLinecap="round" />
      {/* lato destro */}
      <line x1="27" y1="1" x2="27" y2="21" stroke={right  ? S : D} strokeWidth={W} strokeLinecap="round" />
    </svg>
  )
}

function latiAttivi(lati: TelaioLatiId) {
  return {
    top:    lati === '4_lati' || lati === '3_lati_testa' || lati === 'solo_testa',
    bottom: lati === '4_lati' || lati === '3_lati_base'  || lati === 'solo_base',
    left:   lati === '4_lati' || lati === '3_lati_testa' || lati === '3_lati_base' || lati === 'solo_sx',
    right:  lati === '4_lati' || lati === '3_lati_testa' || lati === '3_lati_base' || lati === 'solo_dx',
  }
}

// ── ComponenteIcon ───────────────────────────────────────────
function ComponenteIcon({ id }: { id: ComponenteId }) {
  const cls = "w-10 h-10"
  switch (id) {
    case 'telaio':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          <rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#0d9488" strokeWidth="3.5" />
          <rect x="8" y="8" width="24" height="24" rx="1" fill="none" stroke="#0d9488" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      )
    case 'anta_battente':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          <rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#2563eb" strokeWidth="2.5" />
          <line x1="3"  y1="3"  x2="37" y2="37" stroke="#2563eb" strokeWidth="1.5" />
          <line x1="37" y1="3"  x2="3"  y2="37" stroke="#2563eb" strokeWidth="1.5" />
          {/* cerniera sx */}
          <rect x="3" y="9" width="3" height="5" rx="1" fill="#2563eb" />
          <rect x="3" y="26" width="3" height="5" rx="1" fill="#2563eb" />
        </svg>
      )
    case 'anta_scorrevole':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          <rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#7c3aed" strokeWidth="2.5" />
          {/* due ante sovrapposte */}
          <rect x="6"  y="7" width="18" height="26" rx="1" fill="none" stroke="#7c3aed" strokeWidth="2" />
          <rect x="16" y="7" width="18" height="26" rx="1" fill="none" stroke="#7c3aed" strokeWidth="2" />
          {/* frecce */}
          <line x1="9" y1="20" x2="14" y2="20" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
          <polyline points="12,17 15,20 12,23" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'traverso':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          <rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#d97706" strokeWidth="2.5" />
          {/* barra orizzontale centrale */}
          <rect x="3" y="17" width="34" height="6" rx="0" fill="#d97706" opacity="0.25" />
          <line x1="3" y1="20" x2="37" y2="20" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'montante':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          <rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#d97706" strokeWidth="2.5" />
          {/* barra verticale centrale */}
          <rect x="17" y="3" width="6" height="34" rx="0" fill="#d97706" opacity="0.25" />
          <line x1="20" y1="3" x2="20" y2="37" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'ferma_vetro':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          <rect x="3"  y="3"  width="34" height="34" rx="2" fill="none" stroke="#059669" strokeWidth="2.5" />
          {/* vetro (riempimento) */}
          <rect x="9"  y="9"  width="22" height="22" rx="1" fill="#bfdbfe" opacity="0.7" />
          {/* ferma vetro (profilo stretto interno) */}
          <rect x="9"  y="9"  width="22" height="22" rx="1" fill="none" stroke="#059669" strokeWidth="2.5" />
          <rect x="12" y="12" width="16" height="16" rx="1" fill="none" stroke="#059669" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      )
  }
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
