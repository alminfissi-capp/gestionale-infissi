import type { AnteprimaProfilo } from '@/types/rilievo-fp'

/** Sezione del profilo disegnata dal DXF di FP PRO; riquadro vuoto se manca. */
export default function MiniaturaProfilo({ anteprima, className = 'size-10' }: { anteprima: AnteprimaProfilo | null | undefined; className?: string }) {
  if (!anteprima) return <span className={`inline-block shrink-0 rounded border border-dashed bg-muted/40 ${className}`} aria-hidden />
  return (
    <svg viewBox={anteprima.viewBox} className={`shrink-0 rounded border bg-white p-0.5 text-foreground ${className}`} aria-hidden preserveAspectRatio="xMidYMid meet">
      <path d={anteprima.d} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
