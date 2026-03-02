'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { saveAliquoteIva } from '@/actions/impostazioni'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  initialAliquote: number[]
}

export default function FormAliquoteIva({ initialAliquote }: Props) {
  const [aliquote, setAliquote] = useState<number[]>(initialAliquote)
  const [saving, setSaving] = useState(false)

  const addAliquota = () => {
    setAliquote((prev) => [...prev, 22])
  }

  const updateAliquota = (index: number, value: number) => {
    setAliquote((prev) => prev.map((a, i) => (i === index ? value : a)))
  }

  const removeAliquota = (index: number) => {
    setAliquote((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAliquoteIva(aliquote)
      toast.success('Aliquote IVA salvate')
    } catch {
      toast.error('Errore nel salvataggio delle aliquote')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {aliquote.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Nessuna aliquota configurata. Aggiungine una per abilitare la selezione IVA nei preventivi.
        </p>
      )}

      {aliquote.map((aliquota, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={aliquota}
            onChange={(e) => updateAliquota(index, parseFloat(e.target.value) || 0)}
            className="w-28"
          />
          <span className="text-sm text-gray-500">%</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-red-600 shrink-0"
            onClick={() => removeAliquota(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addAliquota}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi aliquota
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva aliquote'}
        </Button>
      </div>
    </div>
  )
}
