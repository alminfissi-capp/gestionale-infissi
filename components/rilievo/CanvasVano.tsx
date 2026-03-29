'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import type { VanoMisurato } from '@/lib/rilievo'
import { computeRealDimensions, calcolaRaggi, evaluaFormule, extractCampiRilievo, computeRealPositions } from '@/lib/rilievo'
import { shapeToPathProportional, arcSvgPathScaled, arcSvgPathAcutoScaled, arcRadius, arcRadiusSpezzato } from '@/types/rilievo'
import { db } from '@/lib/db'

const PAD_LEFT   = 62
const PAD_BOTTOM = 54
const PAD_TOP    = 20
const PAD_RIGHT  = 20

// ── Componenti serramento ─────────────────────────────────────
export type ComponenteId =
  | 'telaio'
  | 'anta'
  | 'traverso'
  | 'montante'
  | 'ferma_vetro'

const COMPONENTI: { id: ComponenteId; label: string; desc: string }[] = [
  { id: 'telaio',      label: 'Telaio',      desc: 'Cornice/profilo perimetrale' },
  { id: 'anta',        label: 'Anta',        desc: 'Battente o scorrevole' },
  { id: 'traverso',    label: 'Traverso',    desc: 'Profilo orizzontale interno' },
  { id: 'montante',    label: 'Montante',    desc: 'Profilo verticale interno' },
  { id: 'ferma_vetro', label: 'Ferma Vetro', desc: 'Ferma vetro / ferma pannello' },
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
  const [menuStep, setMenuStep] = useState<null | 'componenti' | 'telaio_tipo' | 'telaio_lati' | 'anta_tipo' | 'anta_battente_num' | 'anta_battente_lati' | 'anta_battente_config'>(null)
  const [telaioTipo, setTelaioTipo] = useState<'scorrevole' | 'battente' | null>(null)
  const [antaBattenteNum, setAntaBattenteNum] = useState(0)
  const [antaBattenteNumStr, setAntaBattenteNumStr] = useState('')
  const [antaBattenteLatoId, setAntaBattenteLatoId] = useState<AntaBattenteLatoId | null>(null)
  const [antaBattentePrincipaleIdx, setAntaBattentePrincipaleIdx] = useState<number | null>(null)
  const [antaBattenteIdx, setAntaBattenteIdx] = useState(0)
  const [antaBattenteConfigs, setAntaBattenteConfigs] = useState<AntaBattenteConfig[]>([])
  const [antaBattenteWip, setAntaBattenteWip] = useState<Partial<AntaBattenteConfig>>({})
  const [telai, setTelai] = useState<TelaioAggiunto[]>([])
  const [selectedTelaioId, setSelectedTelaioId] = useState<string | null>(null)
  const [selectedMenuPos, setSelectedMenuPos]   = useState<{ x: number; y: number } | null>(null)

  const panRef     = useRef({ x: 0, y: 0 })
  const dragRef    = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const touchRef   = useRef<{ dist: number; mx: number; my: number } | null>(null)
  const wasDragRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { panRef.current = pan }, [pan])

  // ── Dexie persistence ────────────────────────────────────────
  // Load canvas state (telai + localInput overrides) on mount
  useEffect(() => {
    db.vanoCanvas.get(vano.id).then((state) => {
      if (!state) return
      if (state.telai.length > 0) setTelai(state.telai as TelaioAggiunto[])
      if (Object.keys(state.localInput).length > 0) setLocalInput(state.localInput)
    })
  }, [vano.id])

  // Auto-save with 400ms debounce
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      db.vanoCanvas.put({ vanoId: vano.id, telai, localInput, updatedAt: new Date().toISOString() })
    }, 400)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [vano.id, telai, localInput])

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
    // Espande il bounding box includendo gli apici reali degli archi
    for (const seg of vano.forma.shape.segmenti) {
      if (seg.tipo !== 'arco' || !seg.sagittaNome) continue
      const sagittaMm = localValori[seg.sagittaNome]
      if (!sagittaMm || sagittaMm <= 0) continue
      const fp = realPos.get(seg.fromId), tp = realPos.get(seg.toId)
      if (!fp || !tp) continue
      const cpLen = Math.sqrt(seg.cpDx ** 2 + seg.cpDy ** 2) || 1
      xs.push((fp.x + tp.x) / 2 + (seg.cpDx / cpLen) * sagittaMm)
      ys.push((fp.y + tp.y) / 2 + (seg.cpDy / cpLen) * sagittaMm)
    }
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
        // cpDx/cpDy sono in grid units; sc è px/mm → convertiamo in mm
        // usando la sagitta reale misurata, mantenendo solo la direzione
        let effCpDx = seg.cpDx, effCpDy = seg.cpDy
        if (seg.sagittaNome) {
          const sagittaMm = localValori[seg.sagittaNome]
          if (sagittaMm && sagittaMm > 0) {
            const cpLen = Math.sqrt(seg.cpDx ** 2 + seg.cpDy ** 2) || 1
            effCpDx = (seg.cpDx / cpLen) * sagittaMm
            effCpDy = (seg.cpDy / cpLen) * sagittaMm
          }
        }
        d += ' ' + (seg.tipoArco === 'acuto'
          ? arcSvgPathAcutoScaled(fx, fy, tx, ty, effCpDx, effCpDy, sc, false)
          : arcSvgPathScaled(fx, fy, tx, ty, effCpDx, effCpDy, sc, false))
      } else {
        d += ` L ${tx.toFixed(1)} ${ty.toFixed(1)}`
      }
    })
    return d ? d + ' Z' : null
  }, [layout, allPlaced, realPos, localValori, vano.forma.shape])

  // Fattore scala px/mm (identico a quello usato in realShapePath, necessario per telai su archi)
  const realSc = useMemo(() => {
    if (!layout || !allPlaced || realPos.size === 0) return 1
    const xs = Array.from(realPos.values()).map((p) => p.x)
    const ys = Array.from(realPos.values()).map((p) => p.y)
    for (const seg of vano.forma.shape.segmenti) {
      if (seg.tipo !== 'arco' || !seg.sagittaNome) continue
      const sagittaMm = localValori[seg.sagittaNome]
      if (!sagittaMm || sagittaMm <= 0) continue
      const fp = realPos.get(seg.fromId), tp = realPos.get(seg.toId)
      if (!fp || !tp) continue
      const cpLen = Math.sqrt(seg.cpDx ** 2 + seg.cpDy ** 2) || 1
      xs.push((fp.x + tp.x) / 2 + (seg.cpDx / cpLen) * sagittaMm)
      ys.push((fp.y + tp.y) / 2 + (seg.cpDy / cpLen) * sagittaMm)
    }
    const rangeX = Math.max(...xs) - Math.min(...xs) || 1
    const rangeY = Math.max(...ys) - Math.min(...ys) || 1
    return Math.min(layout.shapePxW / rangeX, layout.shapePxH / rangeY)
  }, [layout, allPlaced, realPos, localValori, vano.forma.shape])

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
      for (const seg of vano.forma.shape.segmenti) {
        if (seg.tipo !== 'arco' || !seg.sagittaNome) continue
        const sagittaMm = localValori[seg.sagittaNome]
        if (!sagittaMm || sagittaMm <= 0) continue
        const fp = realPos.get(seg.fromId), tp = realPos.get(seg.toId)
        if (!fp || !tp) continue
        const cpLen = Math.sqrt(seg.cpDx ** 2 + seg.cpDy ** 2) || 1
        xs.push((fp.x + tp.x) / 2 + (seg.cpDx / cpLen) * sagittaMm)
        ys.push((fp.y + tp.y) / 2 + (seg.cpDy / cpLen) * sagittaMm)
      }
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
  }, [layout, allPlaced, realPos, localValori, vano.forma.shape])

  // ── pixel positions di ogni punto della forma (per rendering telai) ──
  const ptPx = useMemo((): Map<string, { x: number; y: number }> => {
    if (!layout) return new Map()
    const shape = vano.forma.shape
    if (allPlaced && realPos.size > 0) {
      const xs = Array.from(realPos.values()).map((p) => p.x)
      const ys = Array.from(realPos.values()).map((p) => p.y)
      // Stesso bounding box di realShapePath: include apici degli archi
      for (const seg of shape.segmenti) {
        if (seg.tipo !== 'arco' || !seg.sagittaNome) continue
        const sagittaMm = localValori[seg.sagittaNome]
        if (!sagittaMm || sagittaMm <= 0) continue
        const fp = realPos.get(seg.fromId), tp = realPos.get(seg.toId)
        if (!fp || !tp) continue
        const cpLen = Math.sqrt(seg.cpDx ** 2 + seg.cpDy ** 2) || 1
        xs.push((fp.x + tp.x) / 2 + (seg.cpDx / cpLen) * sagittaMm)
        ys.push((fp.y + tp.y) / 2 + (seg.cpDy / cpLen) * sagittaMm)
      }
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
      const sc = Math.min(layout.shapePxW / rangeX, layout.shapePxH / rangeY)
      const offLX = (layout.shapePxW - rangeX * sc) / 2
      const offLY = (layout.shapePxH - rangeY * sc) / 2
      const res = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of realPos) {
        res.set(id, {
          x: layout.shapeOffX + offLX + (pos.x - minX) * sc,
          y: layout.shapeOffY + offLY + (pos.y - minY) * sc,
        })
      }
      return res
    }
    const punti = shape.punti
    const gxs = punti.map((p) => p.gx), gys = punti.map((p) => p.gy)
    const minGx = Math.min(...gxs), maxGx = Math.max(...gxs)
    const minGy = Math.min(...gys), maxGy = Math.max(...gys)
    const rangeGx = maxGx - minGx || 1, rangeGy = maxGy - minGy || 1
    const scX = layout.shapePxW / rangeGx, scY = layout.shapePxH / rangeGy
    const res = new Map<string, { x: number; y: number }>()
    for (const p of punti) {
      res.set(p.id, {
        x: layout.shapeOffX + (p.gx - minGx) * scX,
        y: layout.shapeOffY + (p.gy - minGy) * scY,
      })
    }
    return res
  }, [layout, allPlaced, realPos, localValori, vano.forma.shape])

  // Verso di avvolgimento dalla forma (1=CW su schermo, -1=CCW)
  const pxWinding = useMemo(() => {
    const pts = vano.forma.shape.punti
    let sl = 0
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      const pi = ptPx.get(pts[i].id), pj = ptPx.get(pts[j].id)
      if (!pi || !pj) continue
      sl += pi.x * pj.y - pj.x * pi.y
    }
    return sl >= 0 ? 1 : -1
  }, [ptPx, vano.forma.shape.punti])

  // Classificazione segmento → lato (testa/base/sx/dx)
  const segLatoMap = useMemo(() => {
    const shape = vano.forma.shape
    const cx = shape.punti.reduce((s, p) => s + p.gx, 0) / (shape.punti.length || 1)
    const cy = shape.punti.reduce((s, p) => s + p.gy, 0) / (shape.punti.length || 1)
    const res = new Map<string, 'testa' | 'base' | 'sx' | 'dx'>()
    for (const seg of shape.segmenti) {
      const from = shape.punti.find((p) => p.id === seg.fromId)
      const to   = shape.punti.find((p) => p.id === seg.toId)
      if (!from || !to) continue
      const dgx = Math.abs(to.gx - from.gx), dgy = Math.abs(to.gy - from.gy)
      const midX = (from.gx + to.gx) / 2, midY = (from.gy + to.gy) / 2
      if (dgx >= dgy) res.set(seg.id, midY < cy ? 'testa' : 'base')
      else            res.set(seg.id, midX < cx ? 'sx'    : 'dx')
    }
    return res
  }, [vano.forma.shape])

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
        onClick={() => { if (!wasDragRef.current) { setSelectedTelaioId(null); setSelectedMenuPos(null) } }}
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

          {/* ── telai aggiunti (shape-following) ── */}
          {telai.map((t, telaioIdx) => {
            const bw = Math.max(8, Math.min(shapePxW, shapePxH) * 0.07)
            const activeLatiSet = new Set(latiAttiviList(t.lati))
            const shape = vano.forma.shape
            const isSelected = selectedTelaioId === t.id
            const fill = isSelected ? '#FDE047' : '#d1d5db'
            const str  = '#374151', sw = s(0.8)

            // profili totali su un lato fino a telaioIdx (esclude il corrente)
            const prevCountForLato = (lato: string) =>
              telai.slice(0, telaioIdx).filter((p) => latiAttiviList(p.lati).includes(lato as never)).length

            return (
              <g
                key={t.id}
                style={{ cursor: 'pointer' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (wasDragRef.current) return
                  const rect = svgRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setSelectedTelaioId(isSelected ? null : t.id)
                  setSelectedMenuPos(isSelected ? null : { x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
              >
                {shape.segmenti.map((seg) => {
                  const lato = segLatoMap.get(seg.id)
                  if (!lato || !activeLatiSet.has(lato)) return null

                  const from = ptPx.get(seg.fromId), to = ptPx.get(seg.toId)
                  if (!from || !to) return null

                  // BASE: offset fisso dal contorno tratteggiato → elementi sempre dentro
                  const BASE  = 2
                  const dOuter = BASE + prevCountForLato(lato) * bw
                  const dInner = dOuter + bw

                  const cur = segInfo(seg, ptPx, pxWinding)
                  if (!cur) return null

                  // segmenti adiacenti — info geometrica sempre (non solo se attivi)
                  const prevSeg = shape.segmenti.find((s) => s.toId   === seg.fromId) ?? null
                  const nextSeg = shape.segmenti.find((s) => s.fromId === seg.toId)   ?? null
                  const prevLatoAdj = prevSeg ? segLatoMap.get(prevSeg.id) : null
                  const nextLatoAdj = nextSeg ? segLatoMap.get(nextSeg.id) : null
                  const prevInfo = prevSeg ? segInfo(prevSeg, ptPx, pxWinding) : null
                  const nextInfo = nextSeg ? segInfo(nextSeg, ptPx, pxWinding) : null

                  // profondità del lato adiacente al corner (include BASE)
                  const adjDepths = (adjLato: string | null | undefined, adjActive: boolean) => {
                    if (!adjLato) return { dOut: 0, dIn: 0 }
                    const pc = prevCountForLato(adjLato)
                    return adjActive
                      ? { dOut: BASE + pc * bw, dIn: BASE + (pc + 1) * bw }
                      : { dOut: BASE + pc * bw, dIn: BASE + pc * bw }
                  }
                  const { dOut: dA_out, dIn: dA_in } = adjDepths(prevLatoAdj, prevLatoAdj ? activeLatiSet.has(prevLatoAdj) : false)
                  const { dOut: dC_out, dIn: dC_in } = adjDepths(nextLatoAdj, nextLatoAdj ? activeLatiSet.has(nextLatoAdj) : false)

                  // 4 vertici con miter asimmetrico (profondità diverse per i due lati)
                  const [oFx, oFy] = miterPtAdj(from.x, from.y, prevInfo, dA_out, cur,      dOuter)
                  const [oTx, oTy] = miterPtAdj(to.x,   to.y,   cur,      dOuter, nextInfo, dC_out)
                  const [iFx, iFy] = miterPtAdj(from.x, from.y, prevInfo, dA_in,  cur,      dInner)
                  const [iTx, iTy] = miterPtAdj(to.x,   to.y,   cur,      dInner, nextInfo, dC_in)

                  // Segmenti arco: spessore uniforme tramite offset radiale
                  // Gli archi interni/esterni sono concentrici: i vertici vengono
                  // spostati lungo il raggio (verso il centro del cerchio) di dOuter/dInner,
                  // evitando il miter che causa spessore variabile agli angoli.
                  if (seg.tipo === 'arco' && seg.sagittaNome) {
                    const sagittaMm = localValori[seg.sagittaNome]
                    if (sagittaMm && sagittaMm > 0) {
                      const cpLen = Math.sqrt(seg.cpDx ** 2 + seg.cpDy ** 2) || 1
                      const cpDirX = seg.cpDx / cpLen
                      const cpDirY = seg.cpDy / cpLen
                      const sagPx = sagittaMm * realSc
                      const chord = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
                      const oSag = Math.max(0.5, sagPx - dOuter)
                      const iSag = Math.max(0.5, sagPx - dInner)

                      // Offset radiale per archi circolari semplici (non acuto)
                      let oFxR = oFx, oFyR = oFy, oTxR = oTx, oTyR = oTy
                      let iFxR = iFx, iFyR = iFy, iTxR = iTx, iTyR = iTy
                      if (seg.tipoArco !== 'acuto' && chord > 0.01 && sagPx > 0.01) {
                        const R = arcRadius(chord, sagPx)
                        // Centro: midpoint - (R - sag) * cpDir
                        const midX = (from.x + to.x) / 2
                        const midY = (from.y + to.y) / 2
                        const ccx = midX - (R - sagPx) * cpDirX
                        const ccy = midY - (R - sagPx) * cpDirY
                        // Vettori dal centro ai due vertici (= raggio, lunghezza R)
                        const r0x = from.x - ccx, r0y = from.y - ccy
                        const r1x = to.x   - ccx, r1y = to.y   - ccy
                        const r0 = Math.sqrt(r0x*r0x + r0y*r0y) || 1
                        const r1 = Math.sqrt(r1x*r1x + r1y*r1y) || 1
                        // Sposta verso il centro di dOuter/dInner lungo il raggio
                        oFxR = from.x - (dOuter/r0)*r0x;  oFyR = from.y - (dOuter/r0)*r0y
                        oTxR = to.x   - (dOuter/r1)*r1x;  oTyR = to.y   - (dOuter/r1)*r1y
                        iFxR = from.x - (dInner/r0)*r0x;  iFyR = from.y - (dInner/r0)*r0y
                        iTxR = to.x   - (dInner/r1)*r1x;  iTyR = to.y   - (dInner/r1)*r1y
                      }

                      // Arco esterno → lato radiale → arco interno inverso → chiudi
                      // cpDir non viene negato: con chord invertito il cross product
                      // produce automaticamente il sweep corretto per entrambi gli archi.
                      const pathD =
                        `M ${oFxR.toFixed(1)} ${oFyR.toFixed(1)} ` +
                        telaioArcCmd(oFxR, oFyR, oTxR, oTyR, oSag, cpDirX, cpDirY, seg.tipoArco) +
                        ` L ${iTxR.toFixed(1)} ${iTyR.toFixed(1)} ` +
                        telaioArcCmd(iTxR, iTyR, iFxR, iFyR, iSag, cpDirX, cpDirY, seg.tipoArco) +
                        ' Z'
                      return <path key={seg.id} d={pathD} fill={fill} stroke={str} strokeWidth={sw} />
                    }
                  }

                  const pts = `${oFx},${oFy} ${oTx},${oTy} ${iTx},${iTy} ${iFx},${iFy}`
                  return <polygon key={seg.id} points={pts} fill={fill} stroke={str} strokeWidth={sw} />
                })}
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

      {/* ── menu contestuale elemento selezionato ── */}
      {selectedTelaioId && selectedMenuPos && (
        <div
          className="absolute z-50 bg-white shadow-xl rounded-xl border border-gray-200 flex items-center gap-0.5 p-1"
          style={{
            left: Math.max(4, Math.min(cSize.w - 90, selectedMenuPos.x - 18)),
            top:  Math.max(4, Math.min(cSize.h - 50, selectedMenuPos.y - 52)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setTelai((prev) => prev.filter((t) => t.id !== selectedTelaioId))
              setSelectedTelaioId(null)
              setSelectedMenuPos(null)
            }}
            className="p-2 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-600 active:scale-95 transition-all"
            title="Elimina"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
          </button>
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl w-80 max-w-[calc(100%-2rem)]">
            {/* handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* ── step: lista componenti ── */}
            {menuStep === 'componenti' && (
              <div className="px-4 pb-4 pt-2">
                <p className="text-xs font-semibold text-gray-600 mb-2">Aggiungi componente</p>
                <div className="grid grid-cols-3 gap-2">
                  {COMPONENTI.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => {
                        if (id === 'telaio') {
                          setMenuStep('telaio_tipo')
                        } else if (id === 'anta') {
                          setMenuStep('anta_tipo')
                        } else {
                          setMenuStep(null)
                          // TODO: aprire schermata configurazione per `id`
                        }
                      }}
                      className="flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all"
                    >
                      <ComponenteIcon id={id} />
                      <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight">
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── step: lati telaio ── */}
            {menuStep === 'telaio_lati' && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
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
                      className="flex items-center gap-2 px-2 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all text-left"
                    >
                      <TelaioLatiIcon lati={id} />
                      <span className="text-[11px] font-semibold text-gray-700 leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── step: tipo telaio ── */}
            {menuStep === 'telaio_tipo' && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setMenuStep('componenti')}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <p className="text-xs font-semibold text-gray-700">Telaio — tipo apertura</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setTelaioTipo('scorrevole')
                      setMenuStep('telaio_lati')
                    }}
                    className="flex flex-col items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all"
                  >
                    <svg viewBox="0 0 48 48" className="w-9 h-9">
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
                    <span className="text-xs font-semibold text-gray-800">Scorrevole</span>
                  </button>

                  <button
                    onClick={() => {
                      setTelaioTipo('battente')
                      setMenuStep('telaio_lati')
                    }}
                    className="flex flex-col items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-teal-50 hover:border-teal-300 active:scale-95 transition-all"
                  >
                    <svg viewBox="0 0 48 48" className="w-9 h-9">
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
                    <span className="text-xs font-semibold text-gray-800">Battente</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── step: numero ante battenti ── */}
            {menuStep === 'anta_battente_num' && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setMenuStep('anta_tipo')}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <p className="text-xs font-semibold text-gray-700">Anta battente — numero di ante</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    placeholder="es. 2"
                    value={antaBattenteNumStr}
                    onChange={(e) => {
                      setAntaBattenteNumStr(e.target.value)
                      const v = parseInt(e.target.value)
                      setAntaBattenteNum(isNaN(v) || v < 1 ? 0 : v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && antaBattenteNum >= 1) {
                        setAntaBattenteLatoId(null)
                        setMenuStep('anta_battente_lati')
                      }
                    }}
                    className="w-20 text-center text-xl font-bold text-blue-600 border border-gray-300 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                  <span className="text-sm text-gray-500">{antaBattenteNum === 1 ? 'anta' : 'ante'}</span>
                  <button
                    disabled={antaBattenteNum < 1}
                    onClick={() => {
                      setAntaBattenteLatoId(null)
                      setMenuStep('anta_battente_lati')
                    }}
                    className="ml-auto px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all"
                  >
                    Avanti
                  </button>
                </div>
              </div>
            )}

            {/* ── step: lati anta battente ── */}
            {menuStep === 'anta_battente_lati' && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setMenuStep('anta_battente_num')}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <p className="text-xs font-semibold text-gray-700">Anta battente — tipologia</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ANTA_BATTENTE_LATI.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setAntaBattenteLatoId(id)
                        setAntaBattenteIdx(0)
                        setAntaBattentePrincipaleIdx(null)
                        setAntaBattenteConfigs([])
                        setAntaBattenteWip({})
                        setMenuStep('anta_battente_config')
                      }}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 active:scale-95 transition-all text-left"
                    >
                      <AntaLatoIcon lato={id} />
                      <span className="text-[11px] font-semibold text-gray-700 leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── step: configurazione anta battente ── */}
            {menuStep === 'anta_battente_config' && (() => {
              const isLast = antaBattenteIdx === antaBattenteNum - 1
              const canConfirm = !!antaBattenteWip.lato && !!antaBattenteWip.verso
              const sel = 'border-blue-500 bg-blue-50 text-blue-700'
              const unsel = 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:border-blue-300'
              return (
                <div className="px-4 pb-4 pt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => {
                        if (antaBattenteIdx === 0) {
                          setMenuStep('anta_battente_lati')
                        } else {
                          setAntaBattenteIdx(antaBattenteIdx - 1)
                          setAntaBattenteWip(antaBattenteConfigs[antaBattenteIdx - 1] ?? {})
                          setAntaBattenteConfigs(antaBattenteConfigs.slice(0, antaBattenteIdx - 1))
                        }
                      }}
                      className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <p className="text-xs font-semibold text-gray-700">
                      Anta {antaBattenteIdx + 1}{antaBattenteNum > 1 ? ` di ${antaBattenteNum}` : ''}
                      {antaBattenteLatoId && <span className="ml-1 font-normal text-gray-400">· {ANTA_BATTENTE_LATI.find(l => l.id === antaBattenteLatoId)?.label}</span>}
                    </p>
                  </div>

                  {/* anta principale (solo se ci sono più ante) */}
                  {antaBattenteNum > 1 && (
                    <>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Anta principale</p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button
                          onClick={() => setAntaBattentePrincipaleIdx(antaBattenteIdx)}
                          className={`py-2 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${antaBattentePrincipaleIdx === antaBattenteIdx ? sel : unsel}`}
                        >
                          Sì
                        </button>
                        <button
                          onClick={() => {
                            if (antaBattentePrincipaleIdx === antaBattenteIdx) setAntaBattentePrincipaleIdx(null)
                          }}
                          className={`py-2 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${antaBattentePrincipaleIdx !== antaBattenteIdx ? sel : unsel}`}
                        >
                          No
                        </button>
                      </div>
                    </>
                  )}

                  {/* lato apertura */}
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Lato apertura</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {([['sx', 'Sinistra'], ['dx', 'Destra']] as const).map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setAntaBattenteWip(w => ({ ...w, lato: v }))}
                        className={`py-2 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${antaBattenteWip.lato === v ? sel : unsel}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* verso apertura */}
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Verso apertura</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {([['dentro', 'Verso dentro'], ['fuori', 'Verso fuori']] as const).map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setAntaBattenteWip(w => ({
                          ...w,
                          verso: v,
                          // ribalta non disponibile verso fuori
                          ribalta: v === 'fuori' ? false : w.ribalta,
                        }))}
                        className={`py-2 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${antaBattenteWip.verso === v ? sel : unsel}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* tipo (solo se verso dentro) */}
                  {antaBattenteWip.verso === 'dentro' && (
                    <>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button
                          onClick={() => setAntaBattenteWip(w => ({ ...w, ribalta: false }))}
                          className={`py-2 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${antaBattenteWip.ribalta === false ? sel : unsel}`}
                        >
                          Normale
                        </button>
                        <button
                          onClick={() => setAntaBattenteWip(w => ({ ...w, ribalta: true }))}
                          className={`py-2 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${antaBattenteWip.ribalta === true ? sel : unsel}`}
                        >
                          Con ribalta
                        </button>
                      </div>
                    </>
                  )}

                  {/* CTA */}
                  <button
                    disabled={!canConfirm}
                    onClick={() => {
                      if (!antaBattenteWip.lato || !antaBattenteWip.verso) return
                      const config: AntaBattenteConfig = {
                        lato: antaBattenteWip.lato,
                        verso: antaBattenteWip.verso,
                        ribalta: antaBattenteWip.ribalta ?? false,
                        principale: antaBattenteNum <= 1 || antaBattentePrincipaleIdx === antaBattenteIdx,
                      }
                      const newConfigs = [...antaBattenteConfigs, config]
                      setAntaBattenteConfigs(newConfigs)
                      if (!isLast) {
                        setAntaBattenteIdx(antaBattenteIdx + 1)
                        setAntaBattenteWip({})
                      } else {
                        setMenuStep(null)
                        // TODO: aggiungere ante al canvas con newConfigs
                      }
                    }}
                    className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-40 hover:bg-blue-700 active:scale-[0.98] transition-all"
                  >
                    {isLast ? 'Conferma' : `Avanti — anta ${antaBattenteIdx + 2}`}
                  </button>
                </div>
              )
            })()}

            {/* ── step: tipo anta ── */}
            {menuStep === 'anta_tipo' && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setMenuStep('componenti')}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <p className="text-xs font-semibold text-gray-700">Anta — tipo apertura</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setAntaBattenteNum(0)
                      setAntaBattenteNumStr('')
                      setAntaBattenteLatoId(null)
                      setAntaBattentePrincipaleIdx(null)
                      setAntaBattenteIdx(0)
                      setAntaBattenteConfigs([])
                      setAntaBattenteWip({})
                      setMenuStep('anta_battente_num')
                    }}
                    className="flex flex-col items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 active:scale-95 transition-all"
                  >
                    <svg viewBox="0 0 48 48" className="w-9 h-9">
                      {/* cornice */}
                      <rect x="3" y="3" width="42" height="42" rx="3" fill="none" stroke="#2563eb" strokeWidth="3.5" />
                      {/* anta */}
                      <rect x="9" y="8" width="30" height="32" rx="1.5" fill="none" stroke="#2563eb" strokeWidth="2.5" />
                      {/* arco apertura */}
                      <path d="M 39 8 A 30 30 0 0 0 9 38" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="3 2" />
                      {/* cerniere sx */}
                      <rect x="9" y="12" width="4" height="6" rx="1" fill="#2563eb" />
                      <rect x="9" y="30" width="4" height="6" rx="1" fill="#2563eb" />
                      {/* maniglia dx */}
                      <rect x="35" y="22" width="4" height="4" rx="2" fill="#2563eb" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-800">Battente</span>
                  </button>

                  <button
                    onClick={() => {
                      setMenuStep(null)
                      // TODO: aggiungere anta scorrevole
                    }}
                    className="flex flex-col items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-violet-50 hover:border-violet-300 active:scale-95 transition-all"
                  >
                    <svg viewBox="0 0 48 48" className="w-9 h-9">
                      {/* cornice */}
                      <rect x="3" y="3" width="42" height="42" rx="3" fill="none" stroke="#7c3aed" strokeWidth="3.5" />
                      {/* due ante scorrevoli */}
                      <rect x="6"  y="8" width="20" height="32" rx="1.5" fill="none" stroke="#7c3aed" strokeWidth="2.5" />
                      <rect x="22" y="8" width="20" height="32" rx="1.5" fill="none" stroke="#7c3aed" strokeWidth="2.5" />
                      {/* frecce opposte */}
                      <line x1="10" y1="24" x2="17" y2="24" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
                      <polyline points="14,20 18,24 14,28" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="38" y1="24" x2="31" y2="24" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
                      <polyline points="34,20 30,24 34,28" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-800">Scorrevole</span>
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

// ── Anta battente ────────────────────────────────────────────
type AntaBattenteLatoId = 'a_giro' | '3_lati_no_base' | '3_lati_no_testa' | 'solo_laterali'

const ANTA_BATTENTE_LATI: { id: AntaBattenteLatoId; label: string }[] = [
  { id: 'a_giro',          label: 'A giro (4 lati)' },
  { id: '3_lati_no_base',  label: '3 lati (senza base)' },
  { id: '3_lati_no_testa', label: '3 lati (senza testa)' },
  { id: 'solo_laterali',   label: 'Solo lati (sx + dx)' },
]

type AntaBattenteConfig = {
  lato: 'sx' | 'dx'
  verso: 'dentro' | 'fuori'
  ribalta: boolean
  principale: boolean
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

function AntaLatoIcon({ lato }: { lato: AntaBattenteLatoId }) {
  const S = '#2563eb'
  const W = 3
  const D = '#d1d5db'
  const top    = lato === 'a_giro' || lato === '3_lati_no_base'
  const bottom = lato === 'a_giro' || lato === '3_lati_no_testa'
  return (
    <svg viewBox="0 0 28 22" className="w-9 h-7 shrink-0">
      <line x1="1" y1="1"  x2="27" y2="1"  stroke={top    ? S : D} strokeWidth={W} strokeLinecap="round" />
      <line x1="1" y1="21" x2="27" y2="21" stroke={bottom ? S : D} strokeWidth={W} strokeLinecap="round" />
      <line x1="1" y1="1"  x2="1"  y2="21" stroke={S}             strokeWidth={W} strokeLinecap="round" />
      <line x1="27" y1="1" x2="27" y2="21" stroke={S}             strokeWidth={W} strokeLinecap="round" />
    </svg>
  )
}

// ── Geometry helpers per telai ────────────────────────────────
import type { ShapeSegment, TipoArco } from '@/types/rilievo'

function lineIntersect(
  p1x:number,p1y:number,d1x:number,d1y:number,
  p2x:number,p2y:number,d2x:number,d2y:number
): [number,number] {
  const det = d1x*d2y - d1y*d2x
  if (Math.abs(det) < 0.001) return [(p1x+p2x)/2,(p1y+p2y)/2]
  const t = ((p2x-p1x)*d2y - (p2y-p1y)*d2x) / det
  return [p1x + t*d1x, p1y + t*d1y]
}

interface SegInfo { dx:number; dy:number; nx:number; ny:number }

function segInfo(
  seg: ShapeSegment,
  ptPx: Map<string,{x:number;y:number}>,
  winding: number
): SegInfo | null {
  const from = ptPx.get(seg.fromId), to = ptPx.get(seg.toId)
  if (!from || !to) return null
  const rx = to.x - from.x, ry = to.y - from.y
  const len = Math.sqrt(rx*rx + ry*ry) || 1
  const dx = rx/len, dy = ry/len
  // normale inward: per CW (winding=1) è la sinistra della direzione = (-dy, dx)
  const nx = winding >= 0 ? -dy :  dy
  const ny = winding >= 0 ?  dx : -dx
  return { dx, dy, nx, ny }
}

function _miterPt(
  vx:number, vy:number,
  inSeg: SegInfo | null,
  outSeg: SegInfo | null,
  depth: number
): [number,number] {
  return miterPtAdj(vx, vy, inSeg, depth, outSeg, depth)
}

/**
 * Genera il comando SVG A (o due A per acuto) per un arco del telaio.
 * sag = sagitta in pixel (già offset rispetto al contorno originale).
 * cpDirX/Y = direzione normalizzata del rigonfiamento arco.
 * Per l'arco interno (percorso inverso) passare -cpDirX/-cpDirY.
 */
function telaioArcCmd(
  fx: number, fy: number,
  tx: number, ty: number,
  sag: number,
  cpDirX: number, cpDirY: number,
  tipoArco?: TipoArco
): string {
  const dx = tx - fx, dy = ty - fy
  const chord = Math.sqrt(dx * dx + dy * dy)
  if (chord < 0.01 || sag < 0.01) return `L ${tx.toFixed(1)} ${ty.toFixed(1)}`
  const cross = dx * cpDirY - dy * cpDirX
  if (tipoArco === 'acuto') {
    const mx = (fx + tx) / 2 + cpDirX * sag
    const my = (fy + ty) / 2 + cpDirY * sag
    const R = arcRadiusSpezzato(chord, sag)
    const Rf = R.toFixed(2)
    const sweepL = cross < 0 ? 1 : 0
    const sweepR = cross < 0 ? 0 : 1
    return `A ${Rf} ${Rf} 0 0 ${sweepL} ${mx.toFixed(1)} ${my.toFixed(1)} A ${Rf} ${Rf} 0 0 ${sweepR} ${tx.toFixed(1)} ${ty.toFixed(1)}`
  } else {
    const R = arcRadius(chord, sag)
    const large = sag > chord / 2 ? 1 : 0
    const sweep = cross < 0 ? 1 : 0
    return `A ${R.toFixed(2)} ${R.toFixed(2)} 0 ${large} ${sweep} ${tx.toFixed(1)} ${ty.toFixed(1)}`
  }
}

/**
 * Miter asimmetrico: i due lati possono essere a profondità diverse.
 * Questo permette di connettere correttamente un nuovo profilo a dei
 * profili adiacenti già esistenti (dIn ≠ dOut).
 */
function miterPtAdj(
  vx:number, vy:number,
  inSeg: SegInfo | null, inDepth: number,
  outSeg: SegInfo | null, outDepth: number
): [number,number] {
  if (inSeg && outSeg) {
    return lineIntersect(
      vx + inSeg.nx*inDepth,   vy + inSeg.ny*inDepth,   inSeg.dx,  inSeg.dy,
      vx + outSeg.nx*outDepth, vy + outSeg.ny*outDepth, outSeg.dx, outSeg.dy
    )
  }
  if (inSeg)  return [vx + inSeg.nx*inDepth,   vy + inSeg.ny*inDepth]
  if (outSeg) return [vx + outSeg.nx*outDepth, vy + outSeg.ny*outDepth]
  return [vx, vy]
}

function latiAttiviList(lati: TelaioLatiId): Array<'testa'|'base'|'sx'|'dx'> {
  const { top, bottom, left, right } = latiAttivi(lati)
  const r: Array<'testa'|'base'|'sx'|'dx'> = []
  if (top)    r.push('testa')
  if (bottom) r.push('base')
  if (left)   r.push('sx')
  if (right)  r.push('dx')
  return r
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
    case 'anta':
      return (
        <svg viewBox="0 0 40 40" className={cls}>
          {/* cornice */}
          <rect x="3" y="3" width="34" height="34" rx="2" fill="none" stroke="#2563eb" strokeWidth="2.5" />
          {/* anta battente (sx) */}
          <rect x="5" y="5" width="14" height="30" rx="1" fill="none" stroke="#2563eb" strokeWidth="1.8" />
          {/* arco apertura battente */}
          <path d="M 19 5 A 14 14 0 0 0 5 19" fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="2 2" />
          {/* cerniera battente */}
          <rect x="5" y="8"  width="2.5" height="4" rx="0.5" fill="#2563eb" />
          <rect x="5" y="28" width="2.5" height="4" rx="0.5" fill="#2563eb" />
          {/* anta scorrevole (dx) */}
          <rect x="21" y="5" width="14" height="30" rx="1" fill="none" stroke="#7c3aed" strokeWidth="1.8" />
          {/* freccia scorrevole */}
          <line x1="24" y1="20" x2="30" y2="20" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
          <polyline points="28,17 31,20 28,23" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
