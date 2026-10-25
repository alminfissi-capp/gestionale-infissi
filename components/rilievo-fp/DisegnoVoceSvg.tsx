'use client'

import { useId, useMemo } from 'react'
import { BLU, PANNELLO, VETRO, elementiDisegno, type StrutturaDisegno, type VoceDisegno } from '@/lib/fppro/svg-voce'

interface Props {
  struttura: StrutturaDisegno
  voce: VoceDisegno
  className?: string
}

/** Disegno della voce: profili della struttura alle misure del rilievo e simboli di apertura. */
export default function DisegnoVoceSvg({ struttura, voce, className }: Props) {
  // Molti disegni nella stessa pagina (riepilogo): ogni freccia ha il suo id.
  const idFreccia = `freccia-${useId().replace(/:/g, '')}`
  const e = useMemo(() => elementiDisegno(struttura, voce), [struttura, voce])
  const d = e?.d ?? null
  const simboli = e?.simboli ?? []
  const pannelli = e?.pannelli ?? []
  const idTratteggio = `${idFreccia}-pannello`

  if (!d) return <div className={`grid place-items-center text-xs text-muted-foreground ${className ?? ''}`}>Disegno non disponibile</div>
  return (
    <svg viewBox={d.viewBox} className={className} role="img" aria-label={`Disegno ${d.larghezza} per ${d.altezza} mm`}>
      <defs>
        <marker id={idFreccia} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={BLU} />
        </marker>
        <pattern id={idTratteggio} width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="40" height="40" fill={PANNELLO} />
          <line x1="0" y1="0" x2="0" y2="40" stroke="#a8a29e" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={d.larghezza} height={d.altezza} fill={VETRO} />
      {pannelli.map(c => (
        <rect key={c.codiceNodo} x={c.x} y={c.y} width={c.w} height={c.h} fill={`url(#${idTratteggio})`} />
      ))}
      {d.profili.map((p, i) => (
        <polygon key={i} points={p} fill="#d4d4d8" stroke="#3f3f46" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
      {simboli.map((s, i) => {
        if ('x1' in s) {
          return s.tipo === 'scorrimento'
            ? <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={BLU} strokeWidth={1.5}
                markerEnd={`url(#${idFreccia})`} vectorEffect="non-scaling-stroke" />
            : <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={BLU} strokeWidth={1}
                strokeDasharray={s.tipo === 'apertura' ? '6 4' : '2 3'} vectorEffect="non-scaling-stroke" />
        }
        return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.tipo === 'maniglia' ? 6 : 2}
          fill={s.tipo === 'maniglia' ? '#111827' : '#52525b'} />
      })}
    </svg>
  )
}
