'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type FinituraInput = { nome: string; aumento: number; aumento_euro: number }

interface Props {
  finiture: FinituraInput[]
  onChange: (finiture: FinituraInput[]) => void
}

export default function FormFiniture({ finiture, onChange }: Props) {
  const add = () => onChange([...finiture, { nome: '', aumento: 0, aumento_euro: 0 }])

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

      {finiture.length > 0 && (
        <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2 text-xs text-gray-400 px-1">
          <span>Nome finitura</span>
          <span className="text-right">+ %</span>
          <span className="text-right">+ €</span>
          <span />
        </div>
      )}

      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
      {finiture.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
          <Input
            placeholder="es. Bicolore Standard"
            value={f.nome}
            onChange={(e) => update(i, 'nome', e.target.value)}
          />
          <div className="flex items-center gap-0.5">
            <Input
              type="number"
              min={0}
              max={200}
              step={0.5}
              value={f.aumento}
              onChange={(e) => update(i, 'aumento', parseFloat(e.target.value) || 0)}
              className="text-right pr-1"
            />
            <span className="text-xs text-gray-400 shrink-0">%</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={f.aumento_euro}
              onChange={(e) => update(i, 'aumento_euro', parseFloat(e.target.value) || 0)}
              className="text-right pr-1"
            />
            <span className="text-xs text-gray-400 shrink-0">€</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-red-400 hover:text-red-600 h-8 w-8"
            onClick={() => remove(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi finitura
      </Button>

      {finiture.length > 0 && (
        <p className="text-xs text-gray-400">
          Puoi usare % oppure €, o entrambi contemporaneamente.
        </p>
      )}
    </div>
  )
}
