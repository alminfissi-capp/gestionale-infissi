'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type FinituraInput = { nome: string; aumento: number }

interface Props {
  finiture: FinituraInput[]
  onChange: (finiture: FinituraInput[]) => void
}

export default function FormFiniture({ finiture, onChange }: Props) {
  const add = () => onChange([...finiture, { nome: '', aumento: 0 }])

  const update = (i: number, field: keyof FinituraInput, value: string | number) => {
    const next = finiture.map((f, idx) => (idx === i ? { ...f, [field]: value } : f))
    onChange(next)
  }

  const remove = (i: number) => onChange(finiture.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {finiture.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          Nessuna finitura. Il listino usa il prezzo base senza maggiorazioni.
        </p>
      )}

      {finiture.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              placeholder="Nome finitura (es. Bicolore Standard)"
              value={f.nome}
              onChange={(e) => update(i, 'nome', e.target.value)}
            />
          </div>
          <div className="w-28 flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={200}
              step={0.5}
              value={f.aumento}
              onChange={(e) => update(i, 'aumento', parseFloat(e.target.value) || 0)}
              className="text-right"
            />
            <span className="text-sm text-gray-500 shrink-0">%</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-red-400 hover:text-red-600 shrink-0"
            onClick={() => remove(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {finiture.length > 0 && (
        <div className="flex gap-4 text-xs text-gray-400 px-1">
          <span className="flex-1">Nome finitura</span>
          <span className="w-28">Maggiorazione %</span>
          <span className="w-8" />
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi finitura
      </Button>

      {finiture.length > 0 && (
        <p className="text-xs text-gray-400">
          Es: "Bicolore Standard/Bianco" con +15% → prezzo base × 1.15
        </p>
      )}
    </div>
  )
}
