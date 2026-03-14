'use client'

import { useState, useTransition } from 'react'
import { Layers, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { addAccessoriATuttiListini } from '@/actions/listini'
import type { AccessorioGrigliaInput } from '@/actions/listini'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoriaId: string
  categoriaNome: string
  listinoCount: number
  onSuccess: () => void
}

const emptyForm = () => ({
  gruppo: '',
  gruppoTipo: 'multiplo' as 'multiplo' | 'unico',
  nome: '',
  tipoPrezzo: 'pezzo' as 'pezzo' | 'mq' | 'percentuale',
  prezzo: '',
  prezzoAcquisto: '',
  mqMinimo: '',
})

type FormState = ReturnType<typeof emptyForm>

export default function DialogAccessorioBulk({
  open,
  onOpenChange,
  categoriaId,
  categoriaNome,
  listinoCount,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState>(emptyForm())
  const [lista, setLista] = useState<AccessorioGrigliaInput[]>([])

  const canAdd = form.gruppo.trim().length > 0 && form.nome.trim().length > 0

  const resetAll = () => {
    setForm(emptyForm())
    setLista([])
  }

  const handleAggiungiAllaLista = () => {
    if (!canAdd) return
    const acc: AccessorioGrigliaInput = {
      gruppo: form.gruppo.trim(),
      gruppo_tipo: form.gruppoTipo,
      nome: form.nome.trim(),
      tipo_prezzo: form.tipoPrezzo,
      prezzo: parseFloat(form.prezzo) || 0,
      prezzo_acquisto: parseFloat(form.prezzoAcquisto) || 0,
      mq_minimo: form.tipoPrezzo === 'mq' && form.mqMinimo ? parseFloat(form.mqMinimo) : null,
    }
    setLista((prev) => [...prev, acc])
    setForm(emptyForm())
  }

  const handleRemove = (index: number) => {
    setLista((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (lista.length === 0) return
    startTransition(async () => {
      try {
        const { count } = await addAccessoriATuttiListini(categoriaId, lista)
        toast.success(`${lista.length} accessor${lista.length === 1 ? 'io aggiunto' : 'i aggiunti'} a ${count} listini`)
        resetAll()
        onOpenChange(false)
        onSuccess()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore durante il salvataggio')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAll(); onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            Aggiungi accessori a tutti i listini
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1">
          Verranno aggiunti a tutti i <strong>{listinoCount}</strong> listini della categoria{' '}
          <strong>{categoriaNome}</strong>.
        </p>

        {/* Form accessorio */}
        <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gruppo *</Label>
              <Input
                placeholder="es. Maniglie"
                value={form.gruppo}
                onChange={(e) => setForm((f) => ({ ...f, gruppo: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo gruppo</Label>
              <Select value={form.gruppoTipo} onValueChange={(v) => setForm((f) => ({ ...f, gruppoTipo: v as 'multiplo' | 'unico' }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiplo">Multiplo (checkbox)</SelectItem>
                  <SelectItem value="unico">Unico (radio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome accessorio *</Label>
            <Input
              placeholder="es. Maniglia argento"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo prezzo</Label>
            <Select value={form.tipoPrezzo} onValueChange={(v) => setForm((f) => ({ ...f, tipoPrezzo: v as 'pezzo' | 'mq' | 'percentuale' }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pezzo">A pezzo (€/pz)</SelectItem>
                <SelectItem value="mq">A superficie (€/m²)</SelectItem>
                <SelectItem value="percentuale">Percentuale (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Prezzo vendita{' '}
                <span className="text-gray-400 font-normal">
                  ({form.tipoPrezzo === 'pezzo' ? '€/pz' : form.tipoPrezzo === 'mq' ? '€/m²' : '%'})
                </span>
              </Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0,00"
                value={form.prezzo}
                onChange={(e) => setForm((f) => ({ ...f, prezzo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-amber-700">Prezzo acquisto (€)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0,00"
                value={form.prezzoAcquisto}
                onChange={(e) => setForm((f) => ({ ...f, prezzoAcquisto: e.target.value }))}
                className="border-amber-200 focus-visible:ring-amber-400"
              />
            </div>
          </div>

          {form.tipoPrezzo === 'mq' && (
            <div className="space-y-1.5">
              <Label>MQ minimo fatturabile</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="es. 1.00"
                value={form.mqMinimo}
                onChange={(e) => setForm((f) => ({ ...f, mqMinimo: e.target.value }))}
              />
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!canAdd}
            onClick={handleAggiungiAllaLista}
          >
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi alla lista
          </Button>
        </div>

        {/* Lista accessori in coda */}
        {lista.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Da aggiungere ({lista.length})
            </p>
            {lista.map((acc, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm bg-white">
                <span>
                  <span className="font-medium">{acc.gruppo}</span>
                  <span className="text-gray-400 mx-1">›</span>
                  {acc.nome}
                  {acc.prezzo > 0 && (
                    <span className="ml-2 text-gray-500 text-xs">
                      {acc.prezzo} {acc.tipo_prezzo === 'percentuale' ? '%' : '€'}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { resetAll(); onOpenChange(false) }} disabled={isPending}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={lista.length === 0 || isPending}>
            <Layers className="h-4 w-4 mr-1" />
            Salva tutti a tutti i listini ({lista.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
