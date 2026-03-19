'use client'

import { useEffect, useRef, useState } from 'react'

const DOC_WIDTH = 794

/**
 * Scala il contenuto (documento A4) per adattarlo alla larghezza del viewport
 * senza rompere il layout. L'utente può comunque fare pinch-zoom per leggere i dettagli.
 */
export default function ScaleToFit({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [outerHeight, setOuterHeight] = useState<number | null>(null)

  useEffect(() => {
    const recalc = () => {
      if (!outerRef.current || !innerRef.current) return
      const availW = outerRef.current.clientWidth
      const newScale = availW >= DOC_WIDTH ? 1 : availW / DOC_WIDTH
      const naturalH = innerRef.current.scrollHeight
      setScale(newScale)
      setOuterHeight(Math.ceil(naturalH * newScale))
    }

    recalc()
    window.addEventListener('resize', recalc)
    // ResizeObserver per aggiornare quando il contenuto cambia altezza (es. immagini)
    const ro = new ResizeObserver(recalc)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => {
      window.removeEventListener('resize', recalc)
      ro.disconnect()
    }
  }, [])

  return (
    <div
      ref={outerRef}
      style={{ position: 'relative', width: '100%', height: outerHeight ?? 'auto', overflow: 'hidden' }}
    >
      <div
        ref={innerRef}
        style={{
          position: outerHeight != null ? 'absolute' : 'relative',
          top: 0,
          left: 0,
          width: DOC_WIDTH,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
