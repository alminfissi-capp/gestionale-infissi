'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createSerie, updateSerie } from '@/actions/winconfig'
import type { WcSerie, WcSerieInput, Materiale } from '@/types/winconfig'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  serie?: WcSerie
}

const MATERIALI: { value: Materiale; label: string }[] = [
  { value: 'alluminio', label: 'Alluminio' },
  { value: 'pvc', label: 'PVC' },
  { value: 'legno_alluminio', label: 'Legno-Alluminio' },
]

export default function DialogSerie({ open, onOpenChange, serie }: Props) {
  const router = useRouter()
  const isEdit = !!serie

  const [nome, setNome] = useState(serie?.nome ?? '')
  const [materiale, setMateriale] = useState<Materiale>(serie?.materiale ?? 'alluminio')
  const [descrizione, setDescrizione] = useState(serie?.descrizione ?? '')
  const [sfridoNodo, setSfridoNodo] = useState(serie?.sfrido_nodo_mm ?? 0)
  const [sfridoAngolo, setSfridoAngolo] = useState(serie?.sfrido_angolo_mm ?? 0)
  const [lunghezzaBarra, setLunghezzaBarra] = useState(serie?.lunghezza_barra_mm ?? 6000)
  const [attiva, setAttiva] = useState(serie?.attiva ?? true)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!nome.trim()) { toast.error('Il nome è obbligatorio'); return }
    setSaving(true)
    try {
      const input: WcSerieInput = {
        nome: nome.trim(),
        materiale,
        descrizione: descrizione.trim() || null,
        sfrido_nodo_mm: sfridoNodo,
        sfrido_angolo_mm: sfridoAngolo,
        lunghezza_barra_mm: lunghezzaBarra,
        attiva,
        ordine: serie?.ordine ?? 0,
      }
      if (isEdit) {
        await updateSerie(serie!.id, input)
        toast.success('Serie aggiornata')
      } else {
        await createSerie(input)
        toast.success('Serie creata')
      }
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica serie' : 'Nuova serie profili'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome serie *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="es. EVO 80 Termico" />
            </div>
            <div className="space-y-1">
              <Label>Materiale</Label>
              <Select value={materiale} onValueChange={v => setMateriale(v as Materiale)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIALI.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrizione</Label>
            <Textarea
              value={descrizione}
              onChange={e => setDescrizione(e.target.value)}
              rows={2}
              placeholder="Note opzionali sulla serie..."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Sfrido nodo (mm)</Label>
              <Input
                type="number" min={0} max={500}
                value={sfridoNodo}
                onChange={e => setSfridoNodo(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>Sfrido angolo (mm)</Label>
              <Input
                type="number" min={0} max={500}
                value={sfridoAngolo}
                onChange={e => setSfridoAngolo(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>Barra std. (mm)</Label>
              <Input
                type="number" min={1000} max={12000}
                value={lunghezzaBarra}
                onChange={e => setLunghezzaBarra(parseInt(e.target.value) || 6000)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="attiva" checked={attiva} onCheckedChange={setAttiva} />
            <Label htmlFor="attiva" className="cursor-pointer">Serie attiva</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvataggio...' : isEdit ? 'Salva' : 'Crea serie'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
