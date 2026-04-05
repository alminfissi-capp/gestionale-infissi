'use client'

import { cn } from '@/lib/utils'

// ─── Costanti disegno ─────────────────────────────────────────

const SVG_W     = 220
const FW        = 10    // spessore telaio esterno
const AW        = 4     // spessore telaio anta

const C_FRAME   = '#94a3b8'
const C_FBORDER = '#1e293b'
const C_BG      = '#e2e8f0'
const C_GLASS   = '#dbeafe'
const C_GLASS_S = '#93c5fd'
const C_ABORDER = '#475569'
const C_ABORD_S = '#1d4ed8'
const C_HANDLE  = '#1e3a5f'
const C_DIM     = '#64748b'

type PosManiglia = 'right' | 'left' | 'top' | 'bottom'

// ─── Componente ──────────────────────────────────────────────

interface Props {
  struttura: string | null
  nAnte: number | null
  larghezza: number | null
  altezza: number | null
  antaPrincipale: number | null
  posManiglia?: PosManiglia | null
  onSelectAnta?: (idx: number) => void
  className?: string
}

export default function PreviewSerramento({
  struttura, nAnte, larghezza, altezza,
  antaPrincipale, posManiglia, onSelectAnta, className,
}: Props) {
  const ratio  = larghezza && altezza && larghezza > 0 ? altezza / larghezza : 4 / 3
  const SVG_H  = Math.max(90, Math.min(320, Math.round(SVG_W * ratio)))
  const ix = FW, iy = FW
  const iw = SVG_W - FW * 2
  const ih = SVG_H - FW * 2

  const numAnte  = Math.max(0, Math.min(nAnte ?? 0, 8))
  const canClick = !!onSelectAnta && numAnte >= 1

  // Costruisce i rettangoli delle ante
  const ante = Array.from({ length: numAnte }, (_, i) => ({
    x: ix + Math.round((iw / numAnte) * i),
    y: iy,
    w: Math.round(iw / numAnte),
    h: ih,
    idx: i,
  }))

  // Lato maniglia di default (verso centro) — usato solo se posManiglia è null
  function defaultSide(idx: number): PosManiglia {
    if (numAnte === 1) return 'right'
    return idx < numAnte / 2 ? 'right' : 'left'
  }

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', maxWidth: SVG_W, display: 'block' }}
        aria-label="Anteprima serramento"
      >
        {/* Telaio esterno */}
        <rect x={0} y={0} width={SVG_W} height={SVG_H}
          fill={C_FRAME} stroke={C_FBORDER} strokeWidth={1} rx={1.5} />

        {/* Sfondo interno */}
        <rect x={ix} y={iy} width={iw} height={ih} fill={C_BG} />

        {/* Nessuna anta: vetro fisso */}
        {numAnte === 0 && (
          <>
            <rect x={ix + AW} y={iy + AW} width={iw - AW * 2} height={ih - AW * 2}
              fill={C_GLASS} stroke={C_ABORDER} strokeWidth={AW} />
            <line x1={ix + AW} y1={iy + AW} x2={ix + iw - AW} y2={iy + ih - AW}
              stroke="#93c5fd" strokeWidth={1} />
            <line x1={ix + iw - AW} y1={iy + AW} x2={ix + AW} y2={iy + ih - AW}
              stroke="#93c5fd" strokeWidth={1} />
            {struttura && (
              <text x={SVG_W / 2} y={iy + ih / 2 + 4} textAnchor="middle"
                fontSize={9} fill="#60a5fa" fontWeight="600">
                {struttura.toUpperCase()}
              </text>
            )}
          </>
        )}

        {/* Ante */}
        {ante.map((a) => {
          const isPrinc = antaPrincipale === a.idx
          const side: PosManiglia = isPrinc && posManiglia ? posManiglia : defaultSide(a.idx)
          return (
            <g key={a.idx}
              onClick={() => canClick && onSelectAnta?.(a.idx)}
              style={{ cursor: canClick ? 'pointer' : 'default' }}>
              {/* Frame anta */}
              <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={C_FRAME} />
              {/* Vetro */}
              <rect
                x={a.x + AW} y={a.y + AW}
                width={a.w - AW * 2} height={a.h - AW * 2}
                fill={isPrinc ? C_GLASS_S : C_GLASS}
                stroke={isPrinc ? C_ABORD_S : C_ABORDER}
                strokeWidth={isPrinc ? 1.5 : 0.5}
              />
              {/* Maniglia */}
              {isPrinc && <Handle a={a} side={side} />}
              {/* Indicatori */}
              {canClick && !isPrinc && (
                <text x={a.x + a.w / 2} y={a.y + a.h / 2 + 4}
                  textAnchor="middle" fontSize={14} fill="#94a3b8" opacity={0.8}>
                  ○
                </text>
              )}
              {isPrinc && numAnte > 1 && (
                <text x={a.x + a.w / 2} y={a.y + a.h / 2 + 4}
                  textAnchor="middle" fontSize={14} fill={C_ABORD_S}>
                  ●
                </text>
              )}
            </g>
          )
        })}

        {/* Quote */}
        {larghezza && (
          <text x={SVG_W / 2} y={SVG_H - 1.5}
            textAnchor="middle" fontSize={7.5} fill={C_DIM}>{larghezza} mm</text>
        )}
        {altezza && (
          <text x={SVG_W - 2.5} y={SVG_H / 2} textAnchor="middle" fontSize={7.5} fill={C_DIM}
            transform={`rotate(-90,${SVG_W - 2.5},${SVG_H / 2})`}>{altezza} mm</text>
        )}
      </svg>

      {canClick && (
        <p className="text-[10px] text-gray-400 text-center leading-tight">
          {numAnte > 1
            ? "Tocca un'anta per selezionarla · tocca quella selezionata per ruotare la maniglia"
            : "Tocca l'anta per ruotare la maniglia"}
        </p>
      )}
    </div>
  )
}

function Handle({ a, side }: { a: { x: number; y: number; w: number; h: number }; side: PosManiglia }) {
  const midX = a.x + a.w / 2
  const midY = a.y + a.h / 2

  if (side === 'right') {
    const plateX = a.x + a.w - AW - 3.5
    const leverX = plateX - 7
    return (
      <g fill={C_HANDLE}>
        <rect x={plateX} y={midY - 9} width={3.5} height={18} rx={1.75} />
        <rect x={leverX} y={midY - 2} width={8} height={4} rx={2} />
      </g>
    )
  }

  if (side === 'left') {
    const plateX = a.x + AW + 0.5
    const leverX = plateX + 3.5
    return (
      <g fill={C_HANDLE}>
        <rect x={plateX} y={midY - 9} width={3.5} height={18} rx={1.75} />
        <rect x={leverX} y={midY - 2} width={8} height={4} rx={2} />
      </g>
    )
  }

  if (side === 'top') {
    const plateY = a.y + AW + 0.5
    const leverY = plateY + 3.5
    return (
      <g fill={C_HANDLE}>
        <rect x={midX - 9} y={plateY} width={18} height={3.5} rx={1.75} />
        <rect x={midX - 2} y={leverY} width={4} height={8} rx={2} />
      </g>
    )
  }

  // bottom
  const plateY = a.y + a.h - AW - 4
  const leverY = plateY - 8
  return (
    <g fill={C_HANDLE}>
      <rect x={midX - 9} y={plateY} width={18} height={3.5} rx={1.75} />
      <rect x={midX - 2} y={leverY} width={4} height={8} rx={2} />
    </g>
  )
}
