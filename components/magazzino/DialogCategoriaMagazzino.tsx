'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createCategoriaMagazzino, updateCategoriaMagazzino } from '@/actions/magazzino'
import type { CategoriaMagazzinoInput } from '@/actions/magazzino'
import type { CategoriaMagazzino, TipoCategoriaMagazzino } from '@/types/magazzino'
import { TIPO_CATEGORIA_LABELS } from '@/types/magazzino'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoria?: CategoriaMagazzino | null
}

const empty = (): CategoriaMagazzinoInput => ({ nome: '', tipo: 'alluminio', ordine: 0 })

export default function DialogCategoriaMagazzino({ open, onOpenChange, categoria }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<CategoriaMagazzinoInput>(empty())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(categoria
      ? { nome: categoria.nome, tipo: categoria.tipo, ordine: categoria.ordine }
      : empty()
    )
  }, [open, categoria])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Il nome è obbligatorio'); return }
    setLoading(true)
    try {
      if (categoria) {
        await updateCategoriaMagazzino(categoria.id, form)
        toast.success('Categoria aggiornata')
      } else {
        await createCategoriaMagazzino(form)
        toast.success('Categoria creata')
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{categoria ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Es. Alluminio anodizzato"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoCategoriaMagazzino }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TIPO_CATEGORIA_LABELS) as [TipoCategoriaMagazzino, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordine">Ordine di visualizzazione</Label>
            <Input
              id="ordine"
              type="number"
              min="0"
              value={form.ordine ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, ordine: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : categoria ? 'Salva' : 'Crea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
