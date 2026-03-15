'use client'

import { useMemo } from 'react'
import type { VanoMisurato } from '@/lib/rilievo'
import { computeRealDimensions, calcolaRaggi } from '@/lib/rilievo'
import { shapeToPathProportional } from '@/types/rilievo'

const CANVAS_MAX_W = 320
const CANVAS_MAX_H = 380

interface Props {
  vano: VanoMisurato
}

const COMPONENTI = [
  { label: 'Telaio', desc: 'Cornice esterna' },
  { label: 'Anta', desc: 'Elemento apribile' },
  { label: 'Traverso', desc: 'Barra orizzontale' },
  { label: 'Vetro', desc: 'Pannello vetro' },
]

export default function CanvasVano({ vano }: Props) {
  const { widthMm, heightMm } = useMemo(
    () => computeRealDimensions(vano.forma.shape, vano.valori),
    [vano]
  )

  // Calcola pixel dimensions mantenendo aspect ratio reale
  const ratio = widthMm / heightMm
  const maxRatio = CANVAS_MAX_W / CANVAS_MAX_H
  const canvasW = ratio > maxRatio ? CANVAS_MAX_W : Math.round(CANVAS_MAX_H * ratio)
  const canvasH = ratio > maxRatio ? Math.round(CANVAS_MAX_W / ratio) : CANVAS_MAX_H

  const shapePath = useMemo(
    () => shapeToPathProportional(vano.forma.shape, canvasW, canvasH),
    [vano.forma.shape, canvasW, canvasH]
  )

  const raggi = useMemo(
    () => calcolaRaggi(vano.forma.shape, vano.valori),
    [vano]
  )

  return (
    <div className="flex flex-col items-center gap-5 py-5 px-4">

      {/* Canvas con outline tratteggiato proporzionato */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 flex items-center justify-center">
        <svg
          width={canvasW}
          height={canvasH}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          className="block"
        >
          {/* Griglia di sfondo */}
          <defs>
            <pattern id={`grid-${vano.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#f3f4f6" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width={canvasW} height={canvasH} fill={`url(#grid-${vano.id})`} />

          {/* Outline vano — tratteggiato, proporzionato alle misure reali */}
          {shapePath && (
            <path
              d={shapePath}
              fill="rgba(13, 148, 136, 0.06)"
              stroke="#0d9488"
              strokeWidth="2.5"
              strokeDasharray="10 6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Label dimensioni */}
          <text
            x={canvasW / 2}
            y={canvasH - 6}
            textAnchor="middle"
            fontSize="10"
            fill="#6b7280"
            fontFamily="monospace"
          >
            {widthMm} mm
          </text>
          <text
            x={8}
            y={canvasH / 2}
            textAnchor="middle"
            fontSize="10"
            fill="#6b7280"
            fontFamily="monospace"
            transform={`rotate(-90, 8, ${canvasH / 2})`}
          >
            {heightMm} mm
          </text>
        </svg>
      </div>

      {/* Raggi archi (se presenti) */}
      {raggi.length > 0 && (
        <div className="w-full max-w-xs flex flex-wrap gap-2 justify-center">
          {raggi.map((r) => (
            <div
              key={r.segmentoId}
              className="text-[11px] bg-orange-50 border border-orange-100 text-orange-700 rounded-lg px-2.5 py-1"
            >
              R {r.nomeCorda}: <span className="font-bold">{r.R} mm</span>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: aggiungi componenti */}
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2.5 text-center">
          Aggiungi componente
        </p>
        <div className="grid grid-cols-4 gap-2">
          {COMPONENTI.map(({ label, desc }) => (
            <button
              key={label}
              disabled
              title={desc}
              className="flex flex-col items-center gap-1 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-[11px] bg-gray-50 cursor-not-allowed hover:border-gray-300 transition-colors"
            >
              <span className="text-base font-bold">{label[0]}</span>
              <span className="leading-tight text-center px-0.5">{label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-300 text-center mt-2">
          Configurazione in arrivo
        </p>
      </div>
    </div>
  )
}
