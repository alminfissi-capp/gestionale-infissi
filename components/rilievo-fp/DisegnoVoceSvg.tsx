'use client'

import { useId, useMemo } from 'react'
import { disegnoVoce } from '@/lib/fppro/disegno-voce'
import { haRibalta } from '@/lib/fppro/rilievo-fp'
import { simboliApertura } from '@/lib/fppro/simboli-apertura'
import type { StrutturaLocale, VoceFpDati } from '@/types/rilievo-fp'

interface Props {
  struttura: Pick<StrutturaLocale, 'albero' | 'poligoni' | 'l_nominale' | 'h_nominale'>
  voce: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'> & Partial<Pick<VoceFpDati, 'mano' | 'kit'>>
  className?: string
}

const BLU = '#1e3a8a'

/** Disegno della voce: profili della struttura alle misure del rilievo e simboli di apertura. */
export default function DisegnoVoceSvg({ struttura, voce, className }: Props) {
  const d = disegnoVoce(struttura, voce)
  // Molti disegni nella stessa pagina (riepilogo): ogni freccia ha il suo id.
  const idFreccia = `freccia-${useId().replace(/:/g, '')}`
  const simboli = useMemo(() => {
    if (!d) return []
    try {
      return simboliApertura(
        struttura.albero,
        { L: d.larghezza, H: d.altezza, L0: struttura.l_nominale ?? d.larghezza, H0: struttura.h_nominale ?? d.altezza, quote: voce.quote ?? {} },
        { mano: voce.mano ?? null, ribalta: haRibalta(struttura.albero, voce.kit ?? {}) },
      )
    } catch {
      // I simboli sono un di piu': una struttura strana non deve togliere il disegno.
      return []
    }
  }, [d, struttura.albero, struttura.l_nominale, struttura.h_nominale, voce.quote, voce.mano, voce.kit])

  if (!d) return <div className={`grid place-items-center text-xs text-muted-foreground ${className ?? ''}`}>Disegno non disponibile</div>
  return (
    <svg viewBox={d.viewBox} className={className} role="img" aria-label={`Disegno ${d.larghezza} per ${d.altezza} mm`}>
      <defs>
        <marker id={idFreccia} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={BLU} />
        </marker>
      </defs>
      <rect x={0} y={0} width={d.larghezza} height={d.altezza} fill="#bfdbfe" />
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
