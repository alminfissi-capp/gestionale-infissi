'use client'

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
  /** Scritta libera del lato (es. "L MAG"): la tiene l'editor, che la salva comunque si chiuda il menu */
  scritta: string
  onScritta: (testo: string) => void
}

/** Piccolo menù che si apre toccando un lato del telaio */
export default function MenuLato({ ancora, arco, onArco, onDritto, onChiudi, scritta, onScritta }: Props) {
  return (
    <>
      <button type="button" aria-label="Chiudi" className="absolute inset-0 z-10 cursor-default" onClick={onChiudi} />
      {/* Centrato sul lato ma sempre dentro il disegno (al telefono, vicino al bordo, usciva) */}
      <div className="absolute z-20 w-60 -translate-y-full space-y-1 rounded-lg border bg-white p-1 shadow-lg" style={{ left: `clamp(0px, ${ancora.x}px - 7.5rem, 100% - 15rem)`, top: ancora.y - 8 }}>
        <div className="flex gap-1">
          <Button size="sm" variant={arco ? 'default' : 'outline'} className="gap-1" onClick={onArco}><Spline className="size-4" />Arco</Button>
          {arco && <Button size="sm" variant="outline" className="gap-1" onClick={onDritto}><Minus className="size-4" />Dritto</Button>}
          <Button size="icon" variant="ghost" className="ml-auto size-8" aria-label="Chiudi" onClick={onChiudi}><X className="size-4" /></Button>
        </div>
        <Input className="h-9 text-base" placeholder="Scritta sul lato (es. L MAG)" aria-label="Scritta sul lato" value={scritta}
          onChange={e => onScritta(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onChiudi() } }} />
      </div>
    </>
  )
}
