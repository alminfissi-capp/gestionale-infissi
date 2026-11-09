'use client'

import { useState } from 'react'
import { Spline, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Ancora } from './CasellaQuota'

interface Props {
  ancora: Ancora
  /** Il lato e' gia' un arco */
  arco: boolean
  onArco: () => void
  onDritto: () => void
  onChiudi: () => void
  /** Scritta libera del lato (es. "L MAG"): si conferma con Invio o uscendo */
  scritta: string
  onScritta: (testo: string) => void
}

/** Piccolo menù che si apre toccando un lato del telaio */
export default function MenuLato({ ancora, arco, onArco, onDritto, onChiudi, scritta, onScritta }: Props) {
  const [testo, setTesto] = useState(scritta)
  const salva = () => { if (testo.trim() !== scritta.trim()) onScritta(testo.trim()) }
  return (
    <>
      <button type="button" aria-label="Chiudi" className="absolute inset-0 z-10 cursor-default" onClick={() => { salva(); onChiudi() }} />
      <div className="absolute z-20 w-60 -translate-x-1/2 -translate-y-full space-y-1 rounded-lg border bg-white p-1 shadow-lg" style={{ left: ancora.x, top: ancora.y - 8 }}>
        <div className="flex gap-1">
          <Button size="sm" variant={arco ? 'default' : 'outline'} className="gap-1" onClick={() => { salva(); onArco() }}><Spline className="size-4" />Arco</Button>
          {arco && <Button size="sm" variant="outline" className="gap-1" onClick={() => { salva(); onDritto() }}><Minus className="size-4" />Dritto</Button>}
          <Button size="icon" variant="ghost" className="ml-auto size-8" aria-label="Chiudi" onClick={() => { salva(); onChiudi() }}><X className="size-4" /></Button>
        </div>
        <Input className="h-9 text-base" placeholder="Scritta sul lato (es. L MAG)" aria-label="Scritta sul lato" value={testo}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salva(); onChiudi() } }} />
      </div>
    </>
  )
}
