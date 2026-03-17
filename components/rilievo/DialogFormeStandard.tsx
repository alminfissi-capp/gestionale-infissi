'use client'

import { useState, useTransition } from 'react'
import { X, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FORME_STANDARD } from '@/lib/formeStandard'
import { importaFormeStandard } from '@/actions/rilievo'
import { shapeToPath } from '@/types/rilievo'
import { extractCampiRilievo } from '@/lib/rilievo'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
}

export default function DialogFormeStandard({ open, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(FORME_STANDARD.map((_, i) => i))
  )
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const handleImport = () => {
    const toImport = FORME_STANDARD.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return
    startTransition(async () => {
      try {
        await importaFormeStandard(toImport)
        toast.success(`${toImport.length} form${toImport.length === 1 ? 'a importata' : 'e importate'}`)
        onClose()
      } catch {
        toast.error('Errore durante l\'importazione')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-xl flex flex-col max-h-[90vh]">

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Forme standard</h2>
            <p className="text-xs text-gray-500 mt-0.5">Seleziona le forme da aggiungere al tuo catalogo</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* lista */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {FORME_STANDARD.map((forma, i) => {
            const d = shapeToPath(forma.shape, 60)
            const campi = extractCampiRilievo(forma.shape)
            const inputCampi = campi.filter((c) => c.tipoMisura === 'input')
            const calcolatoCampi = campi.filter((c) => c.tipoMisura === 'calcolato')
            const isSelected = selected.has(i)

            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`w-full flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {/* checkbox */}
                <div className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                  isSelected ? 'bg-teal-500 border-teal-500' : 'border-gray-300'
                }`}>
                  {isSelected && (
                    <svg viewBox="0 0 10 10" className="w-3 h-3 text-white fill-current">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* preview */}
                <div className="h-10 w-10 shrink-0 flex items-center justify-center">
                  {d ? (
                    <svg viewBox="0 0 60 60" className="w-10 h-10 text-teal-600">
                      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100" />
                  )}
                </div>

                {/* info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{forma.nome}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="text-teal-700 font-medium">
                      {inputCampi.map((c) => c.nome).join(', ')}
                    </span>
                    {calcolatoCampi.length > 0 && (
                      <span className="text-gray-400">
                        {' · '}calcolato: {calcolatoCampi.map((c) => c.nome).join(', ')}
                      </span>
                    )}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() =>
              setSelected(
                selected.size === FORME_STANDARD.length
                  ? new Set()
                  : new Set(FORME_STANDARD.map((_, i) => i))
              )
            }
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {selected.size === FORME_STANDARD.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={isPending || selected.size === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Importa {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
