'use client'

import type { FormaSerramento, LatoInclinazione, TipoApertura, VersoApertura } from '@/types/winconfig'

type Props = {
  forma: FormaSerramento
  latoInclinazione: LatoInclinazione | null
  larghezza_mm: number
  altezza_sx_mm: number
  altezza_dx_mm: number
  tipoApertura: TipoApertura
  versoApertura: VersoApertura | null
  nAnte: number
  className?: string
}

const PADDING = 40
const LABEL_H = 24
const ARROW_SIZE = 6

export default function CanvasSerramento({
  forma,
  latoInclinazione,
  larghezza_mm,
  altezza_sx_mm,
  altezza_dx_mm,
  tipoApertura,
  versoApertura,
  nAnte,
  className,
}: Props) {
  const Hmedia = (altezza_sx_mm + altezza_dx_mm) / 2
  const isFuoriSquadro = forma === 'fuori_squadro' && altezza_sx_mm !== altezza_dx_mm

  // Scala: fit in 280×260 px
  const maxW = 280
  const maxH = 260
  const scaleX = maxW / larghezza_mm
  const scaleY = maxH / Math.max(altezza_sx_mm, altezza_dx_mm)
  const scale = Math.min(scaleX, scaleY, 0.25) // max 1:4

  const W = larghezza_mm * scale
  const Hsx = altezza_sx_mm * scale
  const Hdx = altezza_dx_mm * scale
  const Hmax = Math.max(Hsx, Hdx)

  const svgW = W + PADDING * 2 + 30  // +30 per quota dx
  const svgH = Hmax + PADDING * 2 + LABEL_H * 2

  // Coordinate SVG: origine top-left, Y verso il basso
  // Il serramento è disegnato con:
  //   - angolo bottom-left = (PADDING, PADDING + Hmax)
  //   - bottom-right = (PADDING + W, PADDING + Hmax)
  const bx = PADDING       // x base sx
  const by = PADDING + Hmax // y base (bottom)
  const tx_sx = PADDING              // x testa sx
  const ty_sx = PADDING + Hmax - Hsx // y testa sx
  const tx_dx = PADDING + W          // x testa dx
  const ty_dx = PADDING + Hmax - Hdx // y testa dx

  // Path del perimetro del serramento
  // Senso orario: bottom-left → bottom-right → top-right → top-left → chiuso
  const perimetroPath = `M ${bx},${by} L ${bx + W},${by} L ${tx_dx},${ty_dx} L ${tx_sx},${ty_sx} Z`

  // Spessore telaio fisso (proporzione)
  const telW = Math.max(4, W * 0.06)
  const telH = Math.max(4, Hmax * 0.05)

  // ---- Linee di apertura (indicazione verso) ----
  const aperturaCross: React.ReactNode[] = []
  if (tipoApertura !== 'fisso') {
    const antaW = W / nAnte
    for (let i = 0; i < nAnte; i++) {
      const ax = bx + telW + i * antaW
      const aw = antaW - telW * (i === nAnte - 1 ? 2 : 1)
      const ay_b = by - telH
      const ay_t = ty_sx + telH + (i > 0 ? (Hsx - Hdx) * (i / nAnte) : 0)
      const ax_center = ax + aw / 2
      const ay_center = (ay_b + ay_t) / 2

      if (tipoApertura === 'battente' || tipoApertura === 'anta_ribalta') {
        // Diagonale che indica il verso
        const fromX = versoApertura === 'dx' ? ax : ax + aw
        const fromY = ay_b
        const toX = ax_center
        const toY = ay_center
        aperturaCross.push(
          <line key={`diag-${i}`} x1={fromX} y1={fromY} x2={toX} y2={toY}
            stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.7} />
        )
      } else if (tipoApertura === 'vasistas') {
        // Linea dalla testa verso il centro
        aperturaCross.push(
          <line key={`vas-${i}`} x1={ax} y1={ay_t} x2={ax_center} y2={ay_center}
            stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.7} />,
          <line key={`vas2-${i}`} x1={ax + aw} y1={ay_t} x2={ax_center} y2={ay_center}
            stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.7} />
        )
      }
    }
  }

  // ---- Quote ----
  const quotaLarghezza = (
    <g>
      {/* linea quota L */}
      <line x1={bx} y1={by + 18} x2={bx + W} y2={by + 18} stroke="#64748b" strokeWidth={1} />
      <line x1={bx} y1={by + 12} x2={bx} y2={by + 24} stroke="#64748b" strokeWidth={1} />
      <line x1={bx + W} y1={by + 12} x2={bx + W} y2={by + 24} stroke="#64748b" strokeWidth={1} />
      <text x={bx + W / 2} y={by + 32} textAnchor="middle" fontSize={10} fill="#475569">
        {larghezza_mm} mm
      </text>
    </g>
  )

  const quotaHsx = (
    <g>
      <line x1={bx - 18} y1={ty_sx} x2={bx - 18} y2={by} stroke="#64748b" strokeWidth={1} />
      <line x1={bx - 24} y1={ty_sx} x2={bx - 12} y2={ty_sx} stroke="#64748b" strokeWidth={1} />
      <line x1={bx - 24} y1={by} x2={bx - 12} y2={by} stroke="#64748b" strokeWidth={1} />
      <text
        x={bx - 22} y={ty_sx + (by - ty_sx) / 2}
        textAnchor="middle" fontSize={10} fill="#475569"
        transform={`rotate(-90,${bx - 22},${ty_sx + (by - ty_sx) / 2})`}
      >
        {altezza_sx_mm}
      </text>
    </g>
  )

  const quotaHdx = isFuoriSquadro ? (
    <g>
      <line x1={bx + W + 18} y1={ty_dx} x2={bx + W + 18} y2={by} stroke="#64748b" strokeWidth={1} />
      <line x1={bx + W + 12} y1={ty_dx} x2={bx + W + 24} y2={ty_dx} stroke="#64748b" strokeWidth={1} />
      <line x1={bx + W + 12} y1={by} x2={bx + W + 24} y2={by} stroke="#64748b" strokeWidth={1} />
      <text
        x={bx + W + 22} y={ty_dx + (by - ty_dx) / 2}
        textAnchor="middle" fontSize={10} fill="#475569"
        transform={`rotate(90,${bx + W + 22},${ty_dx + (by - ty_dx) / 2})`}
      >
        {altezza_dx_mm}
      </text>
    </g>
  ) : null

  // ---- Divisori ante ----
  const divisoriAnte: React.ReactNode[] = []
  for (let i = 1; i < nAnte; i++) {
    const x = bx + (W / nAnte) * i
    const yTop = ty_sx + (ty_dx - ty_sx) * (i / nAnte)
    divisoriAnte.push(
      <line key={`div-${i}`} x1={x} y1={yTop} x2={x} y2={by}
        stroke="#1e3a5f" strokeWidth={1.5} />
    )
  }

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-auto max-h-72"
        aria-label="Schema serramento"
      >
        {/* Sfondo */}
        <rect width={svgW} height={svgH} fill="#f8fafc" />

        {/* Riempimento vetro */}
        <path d={perimetroPath} fill="#dbeafe" fillOpacity={0.5} />

        {/* Perimetro serramento */}
        <path d={perimetroPath} fill="none" stroke="#1e3a5f" strokeWidth={3} />

        {/* Divisori ante */}
        {divisoriAnte}

        {/* Linee apertura */}
        {aperturaCross}

        {/* Quote */}
        {quotaLarghezza}
        {quotaHsx}
        {quotaHdx}

        {/* Label tipo apertura */}
        <text x={bx + W / 2} y={PADDING - 8} textAnchor="middle" fontSize={10} fill="#6b7280">
          {tipoApertura.replace('_', ' ')}
          {isFuoriSquadro ? ` — fuori squadro (${latoInclinazione})` : ''}
        </text>
      </svg>
    </div>
  )
}
