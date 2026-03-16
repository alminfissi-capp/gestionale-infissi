'use client'

import { useRef, useState, useCallback } from 'react'
import { X, RotateCcw, Check, Pencil } from 'lucide-react'
import { recognizeShape } from '@/lib/shapeRecognition'
import type { RawPoint } from '@/lib/shapeRecognition'
import type { FormaSerramentoDb } from '@/types/rilievo'
import { shapeToPath } from '@/types/rilievo'

interface Props {
  open: boolean
  onClose: () => void
  onConferma: (forma: FormaSerramentoDb) => void
}

type Stato = 'vuoto' | 'disegno' | 'riconosciuto' | 'errore'

export default function DisegnaForma({ open, onClose, onConferma }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const isDrawingRef  = useRef(false)
  const rawRef        = useRef<RawPoint[]>([])

  const [stato,        setStato]        = useState<Stato>('vuoto')
  const [riconosciuta, setRiconosciuta] = useState<FormaSerramentoDb | null>(null)

  // ── Disegno su canvas ────────────────────────────────────────────────────────

  const getCanvasPoint = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): RawPoint | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width  / rect.width
    const sy = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0] ?? (e as React.TouchEvent).changedTouches[0]
      if (!t) return null
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy }
    }
    const m = e as React.MouseEvent
    return { x: (m.clientX - rect.left) * sx, y: (m.clientY - rect.top) * sy }
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pts = rawRef.current
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.strokeStyle = '#0d9488'
    ctx.lineWidth   = 3
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    // pallino iniziale
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#0d9488'
    ctx.fill()
  }, [])

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e)
    if (!pt) return
    isDrawingRef.current = true
    rawRef.current = [pt]
    setStato('disegno')
    setRiconosciuta(null)
    // cancella canvas
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  const moveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const pt = getCanvasPoint(e)
    if (!pt) return
    const pts = rawRef.current
    if (pts.length > 0) {
      const last = pts[pts.length - 1]
      if (Math.hypot(pt.x - last.x, pt.y - last.y) < 3) return
    }
    rawRef.current = [...rawRef.current, pt]
    redraw()
  }

  const endDraw = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    const pts = rawRef.current
    if (pts.length < 10) { setStato('errore'); return }

    const shape = recognizeShape(pts)
    if (!shape) { setStato('errore'); return }

    const forma: FormaSerramentoDb = {
      id: `freehand-${Date.now()}`,
      organization_id: '',
      nome: 'Forma disegnata',
      attiva: true,
      ordine: 999,
      shape,
      created_at: new Date().toISOString(),
    }
    setRiconosciuta(forma)
    setStato('riconosciuto')
  }

  const handleRidisegna = () => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    rawRef.current = []
    setStato('vuoto')
    setRiconosciuta(null)
  }

  const handleConferma = () => {
    if (!riconosciuta) return
    onConferma(riconosciuta)
    onClose()
  }

  if (!open) return null

  const previewPath = riconosciuta ? shapeToPath(riconosciuta.shape, 240) : null

  const statoLabel: Record<Stato, string> = {
    vuoto:        'Disegna il contorno del serramento a mano libera',
    disegno:      'Continua a disegnare...',
    riconosciuto: 'Forma riconosciuta — conferma o ridisegna',
    errore:       'Forma non riconoscibile — prova a ridisegnare più lentamente',
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div>
            <p className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Pencil className="h-4 w-4 text-teal-600" />
              Disegna la forma
            </p>
            <p className={`text-xs mt-0.5 ${stato === 'errore' ? 'text-red-500' : stato === 'riconosciuto' ? 'text-teal-600 font-medium' : 'text-gray-500'}`}>
              {statoLabel[stato]}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Canvas + preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-5 min-h-0 gap-4">
          <div className="relative w-full max-w-[300px] aspect-square">

            {/* Canvas di disegno */}
            <canvas
              ref={canvasRef}
              width={300}
              height={300}
              className={`w-full h-full rounded-2xl border-2 touch-none select-none ${
                stato === 'errore'       ? 'border-red-300 bg-red-50/30' :
                stato === 'riconosciuto' ? 'border-teal-300 opacity-20'  :
                stato === 'disegno'      ? 'border-teal-400 bg-gray-50'  :
                'border-dashed border-gray-300 bg-gray-50'
              }`}
              style={{ cursor: 'crosshair', display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
            />

            {/* Overlay SVG della forma riconosciuta */}
            {stato === 'riconosciuto' && previewPath && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <svg viewBox="0 0 240 240" className="w-[80%] h-[80%]">
                  <path
                    d={previewPath}
                    fill="rgba(13,148,136,0.08)"
                    stroke="#0d9488"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}

            {/* Stato vuoto: istruzioni */}
            {stato === 'vuoto' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Pencil className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400 text-center leading-tight px-4">
                  Disegna il contorno<br />
                  <span className="text-gray-300">chiudi la forma tornando al punto di partenza</span>
                </p>
              </div>
            )}

            {/* Badge "Riconosciuto" */}
            {stato === 'riconosciuto' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-teal-500 text-white text-[11px] font-semibold px-3 py-1 rounded-full shadow pointer-events-none">
                ✓ Riconosciuta
              </div>
            )}
          </div>

          {/* Info misure riconosciute */}
          {stato === 'riconosciuto' && riconosciuta && (() => {
            const segs = riconosciuta.shape.segmenti
            const rette = segs.filter(s => s.tipo === 'retta').length
            const archi = segs.filter(s => s.tipo === 'arco').length
            return (
              <div className="flex gap-3 text-center">
                <div className="flex flex-col items-center px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-lg font-bold text-gray-800">{segs.length}</span>
                  <span className="text-[10px] text-gray-500">lati</span>
                </div>
                {rette > 0 && (
                  <div className="flex flex-col items-center px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-lg font-bold text-gray-800">{rette}</span>
                    <span className="text-[10px] text-gray-500">rette</span>
                  </div>
                )}
                {archi > 0 && (
                  <div className="flex flex-col items-center px-3 py-2 bg-teal-50 rounded-xl border border-teal-200">
                    <span className="text-lg font-bold text-teal-700">{archi}</span>
                    <span className="text-[10px] text-teal-600">archi</span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Azioni */}
        <div className="px-5 pb-6 pt-3 border-t shrink-0 flex gap-3">
          <button
            onClick={handleRidisegna}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 font-medium transition-all text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            Ridisegna
          </button>
          <button
            onClick={handleConferma}
            disabled={stato !== 'riconosciuto'}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 disabled:opacity-35 disabled:cursor-not-allowed transition-all text-sm"
          >
            <Check className="h-4 w-4" />
            Conferma
          </button>
        </div>
      </div>
    </>
  )
}
