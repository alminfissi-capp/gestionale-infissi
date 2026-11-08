'use client'

import { Spline, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Ancora } from './CasellaQuota'

interface Props {
  ancora: Ancora
  /** Il lato e' gia' un arco */
  arco: boolean
  onArco: () => void
  onDritto: () => void
  onChiudi: () => void
}

/** Piccolo menù che si apre toccando un lato del telaio */
export default function MenuLato({ ancora, arco, onArco, onDritto, onChiudi }: Props) {
  return (
    <>
      <button type="button" aria-label="Chiudi" className="absolute inset-0 z-10 cursor-default" onClick={onChiudi} />
      <div className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-1 rounded-lg border bg-white p-1 shadow-lg" style={{ left: ancora.x, top: ancora.y - 8 }}>
        <Button size="sm" variant={arco ? 'default' : 'outline'} className="gap-1" onClick={onArco}><Spline className="size-4" />Arco</Button>
        {arco && <Button size="sm" variant="outline" className="gap-1" onClick={onDritto}><Minus className="size-4" />Dritto</Button>}
        <Button size="icon" variant="ghost" className="size-8" aria-label="Chiudi" onClick={onChiudi}><X className="size-4" /></Button>
      </div>
    </>
  )
}
