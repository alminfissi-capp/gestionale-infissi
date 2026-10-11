'use client'

import { disegnoVoce } from '@/lib/fppro/disegno-voce'
import type { StrutturaLocale, VoceFpDati } from '@/types/rilievo-fp'

interface Props {
  struttura: Pick<StrutturaLocale, 'albero' | 'poligoni' | 'l_nominale' | 'h_nominale'>
  voce: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'>
  className?: string
}

export default function DisegnoVoceSvg({ struttura, voce, className }: Props) {
  const d = disegnoVoce(struttura, voce)
  if (!d) return <div className={`grid place-items-center text-xs text-muted-foreground ${className ?? ''}`}>Disegno non disponibile</div>
  return (
    <svg viewBox={d.viewBox} className={className} role="img" aria-label={`Disegno ${d.larghezza} per ${d.altezza} mm`}>
      <rect x={0} y={0} width={d.larghezza} height={d.altezza} fill="#bfdbfe" />
      {d.profili.map((p, i) => (
        <polygon key={i} points={p} fill="#d4d4d8" stroke="#3f3f46" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}
