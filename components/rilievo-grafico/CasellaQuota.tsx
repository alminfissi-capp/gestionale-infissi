'use client'

import { useRef, useState } from 'react'
import { leggiMisura } from '@/lib/rilievo-grafico/misura'

/** Punto sopra il disegno (px dal bordo del suo contenitore) dove aprire casellina o menù */
export interface Ancora { x: number; y: number }

interface Props {
  ancora: Ancora
  valore: number
  /** La misura puo' essere negativa (freccia di un arco che rientra): serve il tasto meno */
  conSegno?: boolean
  /** false = misura non possibile: la casellina resta aperta e rossa */
  onConferma: (n: number) => boolean
  onAnnulla: () => void
}

/**
 * Casellina per scrivere una misura direttamente sul disegno. La misura si applica solo alla
 * conferma (Invio o tocco fuori), mai cifra per cifra.
 */
export default function CasellaQuota({ ancora, valore, conSegno, onConferma, onAnnulla }: Props) {
  const [testo, setTesto] = useState(String(valore))
  const [errore, setErrore] = useState(false)
  // Dopo Invio la casellina si chiude: il blur che segue non deve applicare di nuovo
  const chiusa = useRef(false)

  const conferma = (): boolean => {
    if (chiusa.current) return true
    const n = leggiMisura(testo)
    if (n === null) { setErrore(true); return false }
    if (n === valore) { chiusa.current = true; onAnnulla(); return true }
    const ok = onConferma(n)
    chiusa.current = ok
    setErrore(!ok)
    return ok
  }

  return (
    <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: ancora.x, top: ancora.y }}>
      <input
        // Il tastierino decimale dell'iPhone non ha il meno: per la freccia serve la tastiera intera
        autoFocus inputMode={conSegno ? 'text' : 'decimal'} aria-label="Misura in mm"
        className={`h-10 w-24 rounded-md border-2 bg-white px-2 text-center text-base font-semibold shadow-lg outline-none ${errore ? 'border-red-500 text-red-700' : 'border-orange-500 text-orange-800'}`}
        value={testo}
        onFocus={e => e.currentTarget.select()}
        onChange={e => { setTesto(e.target.value); setErrore(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); conferma() }
          if (e.key === 'Escape') { e.preventDefault(); chiusa.current = true; onAnnulla() }
        }}
        // Toccando fuori: si applica se si puo', altrimenti si lascia com'era
        onBlur={() => { if (!conferma()) { chiusa.current = true; onAnnulla() } }}
      />
      {errore && <p className="mt-1 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-center text-xs text-white shadow">Misura non possibile</p>}
    </div>
  )
}
