'use client'

import { X } from 'lucide-react'
import type { FormaSerramentoCompleta } from '@/types/rilievo'

// Tipi e SVG predefiniti (usati anche in ImpostazioniRilievo per il template picker)
export type FormaSerramento =
  | 'rettangolo'
  | 'arco_pieno'
  | 'arco_ribassato'
  | 'arco_acuto'
  | 'trapezio'
  | 'parallelogramma'
  | 'triangolo'
  | 'semicerchio'
  | 'cerchio'
  | 'ovale'
  | 'forma_l'

export const FORME: { id: FormaSerramento; label: string; svg: React.ReactNode }[] = [
  {
    id: 'rettangolo',
    label: 'Rettangolo',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <rect x="8" y="10" width="44" height="40" rx="1" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: 'arco_pieno',
    label: 'Arco a tutto sesto',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <path
          d="M10,50 L10,28 A20,20 0 0,1 50,28 L50,50 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'arco_ribassato',
    label: 'Arco ribassato',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <path
          d="M10,50 L10,32 Q30,14 50,32 L50,50 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'arco_acuto',
    label: 'Arco acuto',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <path
          d="M10,50 L10,30 Q10,8 30,8 Q50,8 50,30 L50,50 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'trapezio',
    label: 'Trapezio',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <polygon
          points="16,50 44,50 52,12 8,12"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'parallelogramma',
    label: 'Parallelogramma',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <polygon
          points="18,50 52,50 42,10 8,10"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'triangolo',
    label: 'Triangolo',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <polygon
          points="30,8 54,52 6,52"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'semicerchio',
    label: 'Semicerchio',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <path
          d="M8,38 A22,22 0 0,1 52,38 Z"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
        <line x1="8" y1="38" x2="52" y2="38" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: 'cerchio',
    label: 'Cerchio',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: 'ovale',
    label: 'Ovale',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <ellipse cx="30" cy="30" rx="26" ry="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: 'forma_l',
    label: 'Forma a L',
    svg: (
      <svg viewBox="0 0 60 60" className="w-full h-full">
        <polygon
          points="10,10 10,50 50,50 50,32 28,32 28,10"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        />
      </svg>
    ),
  },
]

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (forma: FormaSerramentoCompleta) => void
  forme: FormaSerramentoCompleta[]
}

export default function SelettoreForma({ open, onClose, onSelect, forme }: Props) {
  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col">
        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div>
            <p className="text-base font-semibold text-gray-900">Seleziona la forma</p>
            <p className="text-xs text-gray-500 mt-0.5">Scegli la forma del serramento da rilevare</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Griglia forme */}
        <div className="overflow-y-auto p-4">
          {forme.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nessuna forma configurata. Vai in{' '}
              <span className="font-medium">Database e impostazioni</span> per aggiungerne.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {forme.map((f) => {
                const tmpl = FORME.find((x) => x.id === f.svg_template)
                return (
                  <button
                    key={f.id}
                    onClick={() => { onSelect(f); onClose() }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-teal-400 hover:bg-teal-50 active:scale-95 transition-all group"
                  >
                    <div className="w-14 h-14 text-gray-500 group-hover:text-teal-600 transition-colors">
                      {tmpl?.svg ?? null}
                    </div>
                    <span className="text-xs font-medium text-gray-600 group-hover:text-teal-700 text-center leading-tight">
                      {f.nome}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
