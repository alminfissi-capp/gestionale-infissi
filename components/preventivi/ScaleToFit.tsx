'use client'

import { useEffect, useRef, useState } from 'react'

const DOC_WIDTH = 794

/**
 * Scala il contenuto (documento A4) per adattarlo alla larghezza del viewport
 * senza rompere il layout né tagliare contenuto caricato in modo asincrono (es. PDF allegati).
 *
 * Tecnica: transform:scale + margin-bottom negativo per compensare lo spazio
 * layout extra, senza mai usare overflow:hidden verticale.
 */
export default function ScaleToFit({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [marginBottom, setMarginBottom] = useState(0)

  useEffect(() => {
    const recalc = () => {
      if (!outerRef.current || !innerRef.current) return
      const availW = outerRef.current.clientWidth
      const newScale = availW >= DOC_WIDTH ? 1 : availW / DOC_WIDTH
      const naturalH = innerRef.current.offsetHeight
      setScale(newScale)
      // L'elemento scala visivamente a naturalH*scale, ma occupa naturalH in layout.
      // Il margin-bottom negativo elimina lo spazio extra: naturalH*(1-scale)
      setMarginBottom(-Math.floor(naturalH * (1 - newScale)))
    }

    recalc()
    window.addEventListener('resize', recalc)
    // ResizeObserver: si aggiorna quando il contenuto cambia (es. PDF allegati che caricano)
    const ro = new ResizeObserver(recalc)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => {
      window.removeEventListener('resize', recalc)
      ro.disconnect()
    }
  }, [])

  return (
    // overflow-x:hidden nasconde i 794px larghezza in layout; overflow-y lasciato libero
    <div ref={outerRef} style={{ width: '100%', overflowX: 'hidden' }}>
      <div
        ref={innerRef}
        style={{
          width: DOC_WIDTH,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          marginBottom,
        }}
      >
        {children}
      </div>
    </div>
  )
}
