'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import type { FormaSerramentoDb } from '@/types/rilievo'
import { shapeToPath } from '@/types/rilievo'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (forma: FormaSerramentoDb) => void
  forme: FormaSerramentoDb[]
}

function ShapeSvg({ forma }: { forma: FormaSerramentoDb }) {
  const d = shapeToPath(forma.shape, 56)
  if (!d) return (
    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">?</div>
  )
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function SelettoreForma({ open, onClose, onSelect, forme }: Props) {
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div>
            <p className="text-base font-semibold text-gray-900">Seleziona la forma</p>
            <p className="text-xs text-gray-500 mt-0.5">Scegli la forma del serramento da rilevare</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {forme.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 mb-2">Nessuna forma configurata.</p>
              <Link
                href="/rilievo/impostazioni"
                onClick={onClose}
                className="text-sm text-teal-600 font-medium hover:underline"
              >
                Vai in Database e impostazioni →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {forme.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { onSelect(f); onClose() }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-teal-400 hover:bg-teal-50 active:scale-95 transition-all group"
                >
                  <div className="w-14 h-14 text-gray-500 group-hover:text-teal-600 transition-colors">
                    <ShapeSvg forma={f} />
                  </div>
                  <span className="text-xs font-medium text-gray-600 group-hover:text-teal-700 text-center leading-tight">
                    {f.nome}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
