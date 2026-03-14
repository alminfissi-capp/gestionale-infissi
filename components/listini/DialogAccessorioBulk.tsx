'use client'

import { useState, useTransition } from 'react'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { addAccessorioATuttiListini } from '@/actions/listini'
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

export default function DialogAccessorioBulk({
  open,
  onOpenChange,
  categoriaId,
  categoriaNome,
  listinoCount,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition()

  const [gruppo, setGruppo] = useState('')
  const [gruppoTipo, setGruppoTipo] = useState<'multiplo' | 'unico'>('multiplo')
  const [nome, setNome] = useState('')
  const [tipoPrezzo, setTipoPrezzo] = useState<'pezzo' | 'mq' | 'percentuale'>('pezzo')
  const [prezzo, setPrezzo] = useState('')
  const [prezzoAcquisto, setPrezzoAcquisto] = useState('')
  const [mqMinimo, setMqMinimo] = useState('')

  const canSave = gruppo.trim().length > 0 && nome.trim().length > 0

  const resetForm = () => {
    setGruppo('')
    setGruppoTipo('multiplo')
    setNome('')
    setTipoPrezzo('pezzo')
    setPrezzo('')
    setPrezzoAcquisto('')
    setMqMinimo('')
  }

  const handleSave = () => {
    if (!canSave) return
    startTransition(async () => {
      try {
        const { count } = await addAccessorioATuttiListini(categoriaId, {
          gruppo: gruppo.trim(),
          gruppo_tipo: gruppoTipo,
          nome: nome.trim(),
          tipo_prezzo: tipoPrezzo,
          prezzo: parseFloat(prezzo),
          prezzo_acquisto: parseFloat(prezzoAcquisto) || 0,
          mq_minimo: tipoPrezzo === 'mq' && mqMinimo ? parseFloat(mqMinimo) : null,
        })
        toast.success(`Accessorio aggiunto a ${count} listini`)
        resetForm()
        onOpenChange(false)
        onSuccess()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore durante il salvataggio')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            Aggiungi accessorio a tutti i listini
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1">
          Verrà aggiunto a tutti i <strong>{listinoCount}</strong> listini della categoria{' '}
          <strong>{categoriaNome}</strong>.
        </p>

        <div className="space-y-3">
          {/* Gruppo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gruppo *</Label>
              <Input
                placeholder="es. Maniglie"
                value={gruppo}
                onChange={(e) => setGruppo(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo gruppo</Label>
              <Select value={gruppoTipo} onValueChange={(v) => setGruppoTipo(v as 'multiplo' | 'unico')}>
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

          {/* Nome */}
          <div className="space-y-1.5">
            <Label>Nome accessorio *</Label>
            <Input
              placeholder="es. Maniglia argento"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          {/* Tipo prezzo */}
          <div className="space-y-1.5">
            <Label>Tipo prezzo</Label>
            <Select value={tipoPrezzo} onValueChange={(v) => setTipoPrezzo(v as 'pezzo' | 'mq' | 'percentuale')}>
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

          {/* Prezzi */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Prezzo vendita *{' '}
                <span className="text-gray-400 font-normal">
                  ({tipoPrezzo === 'pezzo' ? '€/pz' : tipoPrezzo === 'mq' ? '€/m²' : '%'})
                </span>
              </Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0,00"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-amber-700">Prezzo acquisto (€)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0,00"
                value={prezzoAcquisto}
                onChange={(e) => setPrezzoAcquisto(e.target.value)}
                className="border-amber-200 focus-visible:ring-amber-400"
              />
            </div>
          </div>

          {/* MQ minimo — solo se tipo è mq */}
          {tipoPrezzo === 'mq' && (
            <div className="space-y-1.5">
              <Label>MQ minimo fatturabile</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="es. 1.00"
                value={mqMinimo}
                onChange={(e) => setMqMinimo(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }} disabled={isPending}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending}>
            <Layers className="h-4 w-4 mr-1" />
            Aggiungi a tutti ({listinoCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
