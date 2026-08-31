'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MIN = 1
const MAX = 8

/**
 * Visualizzatore a schermo intero per le pagine di un documento (immagini).
 * Zoom + pan: pinch-to-zoom e trascinamento su touch, rotellina e doppio click su
 * desktop, pulsanti +/−/adatta. Frecce per sfogliare le pagine. Nessuna dipendenza esterna.
 *
 * `titolo` e `azioni` servono a chi mostra una sola immagine (es. l'allegato di
 * una scadenza): l'intestazione dice cosa si sta guardando e ospita i comandi
 * propri del contesto, come "Rimuovi allegato".
 */
export default function VisualizzatoreDocumento({
  immagini,
  indiceIniziale = 0,
  titolo,
  azioni,
  onClose,
}: {
  immagini: string[]
  indiceIniziale?: number
  titolo?: string
  azioni?: React.ReactNode
  onClose: () => void
}) {
  const [indice, setIndice] = useState(indiceIniziale)
  const contRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const s = useRef(1)
  const tx = useRef(0)
  const ty = useRef(0)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{ dist: number; mx: number; my: number } | null>(null)

  const apply = useCallback(() => {
    if (wrapRef.current) {
      wrapRef.current.style.transform = `translate(${tx.current}px, ${ty.current}px) scale(${s.current})`
    }
  }, [])

  const reset = useCallback(() => {
    s.current = 1
    tx.current = 0
    ty.current = 0
    apply()
  }, [apply])

  const zoomAt = useCallback(
    (target: number, clientX: number, clientY: number) => {
      const ns = Math.min(MAX, Math.max(MIN, target))
      const cont = contRef.current
      if (!cont || ns === s.current) return
      const r = cont.getBoundingClientRect()
      const ux = clientX - (r.left + r.width / 2)
      const uy = clientY - (r.top + r.height / 2)
      tx.current = ux - (ux - tx.current) * (ns / s.current)
      ty.current = uy - (uy - ty.current) * (ns / s.current)
      s.current = ns
      if (ns === MIN) {
        tx.current = 0
        ty.current = 0
      }
      apply()
    },
    [apply],
  )

  const zoomBy = useCallback(
    (factor: number) => {
      const cont = contRef.current
      if (!cont) return
      const r = cont.getBoundingClientRect()
      zoomAt(s.current * factor, r.left + r.width / 2, r.top + r.height / 2)
    },
    [zoomAt],
  )

  // Reset di zoom/pan al cambio pagina
  useEffect(() => {
    reset()
  }, [indice, reset])

  // Blocca lo scroll del body + ESC per chiudere + frecce per navigare
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIndice((i) => Math.min(immagini.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndice((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, immagini.length])

  // Rotellina = zoom (listener nativo non-passive per poter chiamare preventDefault)
  useEffect(() => {
    const cont = contRef.current
    if (!cont) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(s.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)
    }
    cont.addEventListener('wheel', onWheel, { passive: false })
    return () => cont.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 1 && s.current > 1) {
      // Pan con un dito / mouse
      tx.current += e.clientX - prev.x
      ty.current += e.clientY - prev.y
      apply()
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      // Pan seguendo il centro delle due dita
      tx.current += mx - gesture.current.mx
      ty.current += my - gesture.current.my
      apply()
      // Zoom in base al rapporto tra le distanze, centrato sul midpoint
      if (gesture.current.dist > 0) zoomAt(s.current * (dist / gesture.current.dist), mx, my)
      gesture.current = { dist, mx, my }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (s.current > 1) reset()
    else zoomAt(2.5, e.clientX, e.clientY)
  }

  const vaiA = (i: number) => setIndice(Math.min(immagini.length - 1, Math.max(0, i)))

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 select-none">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
        <span className="text-sm tabular-nums truncate">
          {immagini.length > 1
            ? `Pagina ${indice + 1} / ${immagini.length}`
            : (titolo || 'Anteprima')}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {azioni}
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => zoomBy(1 / 1.4)} aria-label="Riduci">
            <ZoomOut className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => zoomBy(1.4)} aria-label="Ingrandisci">
            <ZoomIn className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={reset} aria-label="Adatta">
            <Maximize className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose} aria-label="Chiudi">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div
        ref={contRef}
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div ref={wrapRef} style={{ transformOrigin: 'center center', willChange: 'transform' }}>
          { }
          <img
            src={immagini[indice]}
            alt={`Pagina ${indice + 1}`}
            draggable={false}
            className="block max-h-[calc(100dvh-8rem)] max-w-full object-contain"
          />
        </div>

        {immagini.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 disabled:opacity-30"
              onClick={() => vaiA(indice - 1)}
              disabled={indice === 0}
              aria-label="Pagina precedente"
            >
              <ChevronLeft className="h-7 w-7" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 disabled:opacity-30"
              onClick={() => vaiA(indice + 1)}
              disabled={indice === immagini.length - 1}
              aria-label="Pagina successiva"
            >
              <ChevronRight className="h-7 w-7" />
            </Button>
          </>
        )}
      </div>

      <p className="pb-2 text-center text-xs text-white/60">
        Pizzica per ingrandire · trascina per spostare · doppio tap per adattare
      </p>
    </div>
  )
}
