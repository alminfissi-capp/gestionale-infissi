'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createFornitore, updateFornitore } from '@/actions/magazzino'
import type { Fornitore, FornitoreInput } from '@/types/magazzino'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  fornitore?: Fornitore | null
}

const empty: FornitoreInput = {
  nome: '',
  partita_iva: '',
  telefono: '',
  email: '',
  indirizzo: '',
  note: '',
}

export default function DialogFornitore({ open, onOpenChange, fornitore }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FornitoreInput>(
    fornitore
      ? {
          nome: fornitore.nome,
          partita_iva: fornitore.partita_iva ?? '',
          telefono: fornitore.telefono ?? '',
          email: fornitore.email ?? '',
          indirizzo: fornitore.indirizzo ?? '',
          note: fornitore.note ?? '',
        }
      : empty
  )
  const [loading, setLoading] = useState(false)

  const set = (k: keyof FornitoreInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) {
      toast.error('Il nome è obbligatorio')
      return
    }
    setLoading(true)
    try {
      if (fornitore) {
        await updateFornitore(fornitore.id, form)
        toast.success('Fornitore aggiornato')
      } else {
        await createFornitore(form)
        toast.success('Fornitore creato')
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{fornitore ? 'Modifica fornitore' : 'Nuovo fornitore'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={form.nome} onChange={set('nome')} placeholder="Ragione sociale" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="piva">Partita IVA</Label>
              <Input id="piva" value={form.partita_iva} onChange={set('partita_iva')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">Telefono</Label>
              <Input id="tel" value={form.telefono} onChange={set('telefono')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="indirizzo">Indirizzo</Label>
            <Input id="indirizzo" value={form.indirizzo} onChange={set('indirizzo')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={form.note} onChange={set('note')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : fornitore ? 'Salva' : 'Crea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
