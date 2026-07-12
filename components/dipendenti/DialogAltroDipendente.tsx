'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createAltroDipendente, updateAltroDipendente } from '@/actions/altri-dipendenti'
import { CADENZA_LABELS } from '@/lib/altri-dipendenti'
import type { AltroDipendente, AltroDipendenteInput, CadenzaAltro } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendente: AltroDipendente | null
  onSaved?: (d: AltroDipendente) => void
}

const emptyForm = (): AltroDipendenteInput => ({
  nome: '',
  cognome: '',
  cadenza: 'mensile',
  attivo: true,
  note: null,
})

export default function DialogAltroDipendente({ open, onOpenChange, dipendente, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<AltroDipendenteInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        dipendente
          ? {
              nome: dipendente.nome,
              cognome: dipendente.cognome,
              cadenza: dipendente.cadenza,
              attivo: dipendente.attivo,
              note: dipendente.note,
            }
          : emptyForm(),
      )
    }
  }, [open, dipendente])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.cognome.trim()) {
      toast.error('Nome e cognome sono obbligatori')
      return
    }
    setLoading(true)
    try {
      if (dipendente) {
        await updateAltroDipendente(dipendente.id, form)
        toast.success('Dipendente aggiornato')
        onSaved?.({ ...dipendente, ...form })
      } else {
        const nuovo = await createAltroDipendente(form)
        toast.success('Dipendente creato')
        onSaved?.(nuovo)
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dipendente ? 'Modifica dipendente' : 'Nuovo altro dipendente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="alt-nome">Nome *</Label>
              <Input id="alt-nome" value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="alt-cognome">Cognome *</Label>
              <Input id="alt-cognome" value={form.cognome}
                onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cadenza *</Label>
            <Select value={form.cadenza}
              onValueChange={(v) => setForm((f) => ({ ...f, cadenza: v as CadenzaAltro }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CADENZA_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alt-note">Note</Label>
            <Input id="alt-note" value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value || null }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.attivo}
              onChange={(e) => setForm((f) => ({ ...f, attivo: e.target.checked }))} />
            Dipendente attivo
          </label>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : 'Salva'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
