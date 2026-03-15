'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ShapeEditor, { EMPTY_SHAPE } from '@/components/rilievo/ShapeEditor'
import type { FormaSerramentoDb, FormaSerramentoInput, FormaShape } from '@/types/rilievo'
import { createForma, updateForma } from '@/actions/rilievo'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  forma?: FormaSerramentoDb
  maxOrdine: number
}

export default function DialogForma({ open, onClose, forma, maxOrdine }: Props) {
  const isEdit = !!forma
  const [nome, setNome] = useState(forma?.nome ?? '')
  const [shape, setShape] = useState<FormaShape>(forma?.shape ?? EMPTY_SHAPE)
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  const canSave = nome.trim().length > 0 && shape.chiusa

  const handleSave = () => {
    if (!canSave) return
    const input: FormaSerramentoInput = {
      nome: nome.trim(),
      attiva: forma?.attiva ?? true,
      ordine: forma?.ordine ?? maxOrdine,
      shape,
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateForma(forma.id, input)
          toast.success('Forma aggiornata')
        } else {
          await createForma(input)
          toast.success('Forma creata')
        }
        onClose()
      } catch {
        toast.error('Errore nel salvataggio')
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[96vh] flex flex-col sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl sm:max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <p className="text-base font-semibold text-gray-900">
            {isEdit ? 'Modifica forma' : 'Nuova forma'}
          </p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome forma</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="es. Arco ribassato personalizzato"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Disegna la forma</label>
            <ShapeEditor value={shape} onChange={setShape} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-3 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending}>
            {isPending ? 'Salvataggio...' : isEdit ? 'Aggiorna' : 'Crea forma'}
          </Button>
        </div>
      </div>
    </>
  )
}
