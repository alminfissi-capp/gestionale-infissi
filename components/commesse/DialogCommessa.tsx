'use client'

import { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCommessa, updateCommessa } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, CommessaInput, PreventivoPerCommessa, UtentePerCommessa } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa?: CommessaCompleta | null
  preventivi: PreventivoPerCommessa[]
  utenti: UtentePerCommessa[]
  preventivoDaConvertire?: PreventivoPerCommessa | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = (): CommessaInput => ({
  numero_commessa: '',
  preventivo_id: null,
  numero_preventivo: null,
  cliente_nome: '',
  imponibile: 0,
  iva_totale: 0,
  totale: 0,
  data_conferma: today(),
  operatore_id: null,
  operatore_nome: null,
  note: null,
})

export default function DialogCommessa({
  open,
  onOpenChange,
  commessa,
  preventivi,
  utenti,
  preventivoDaConvertire,
}: Props) {
  const router = useRouter()
  const [form, setForm] = useState<CommessaInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (commessa) {
      setForm({
        numero_commessa: commessa.numero_commessa,
        preventivo_id: commessa.preventivo_id,
        numero_preventivo: commessa.numero_preventivo,
        cliente_nome: commessa.cliente_nome,
        imponibile: commessa.imponibile,
        iva_totale: commessa.iva_totale,
        totale: commessa.totale,
        data_conferma: commessa.data_conferma,
        operatore_id: commessa.operatore_id,
        operatore_nome: commessa.operatore_nome,
        note: commessa.note,
      })
    } else if (preventivoDaConvertire) {
      const imp = round2(preventivoDaConvertire.imponibile)
      const iva = round2(preventivoDaConvertire.iva_totale)
      setForm({
        ...emptyForm(),
        preventivo_id: preventivoDaConvertire.id,
        numero_preventivo: preventivoDaConvertire.numero,
        cliente_nome: preventivoDaConvertire.cliente_nome,
        imponibile: imp,
        iva_totale: iva,
        totale: round2(imp + iva),
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, commessa, preventivoDaConvertire])

  const setPreventivoSelezionato = (pid: string) => {
    if (pid === '__nessuno__') {
      setForm((f) => ({
        ...f,
        preventivo_id: null,
        numero_preventivo: null,
      }))
      return
    }
    const prev = preventivi.find((p) => p.id === pid)
    if (!prev) return
    const imp = round2(prev.imponibile)
    const iva = round2(prev.iva_totale)
    setForm((f) => ({
      ...f,
      preventivo_id: prev.id,
      numero_preventivo: prev.numero,
      cliente_nome: prev.cliente_nome,
      imponibile: imp,
      iva_totale: iva,
      totale: round2(imp + iva),
    }))
  }

  const setOperatore = (uid: string) => {
    if (uid === '__nessuno__') {
      setForm((f) => ({ ...f, operatore_id: null, operatore_nome: null }))
      return
    }
    const u = utenti.find((u) => u.id === uid)
    setForm((f) => ({ ...f, operatore_id: uid, operatore_nome: u?.nome ?? null }))
  }

  const setField = (k: keyof CommessaInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  const setNumber = (k: 'imponibile' | 'iva_totale') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value) || 0
    setForm((f) => {
      const next = { ...f, [k]: v }
      next.totale = next.imponibile + next.iva_totale
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.cliente_nome.trim()) {
      toast.error('Il nome cliente è obbligatorio')
      return
    }
    setLoading(true)
    try {
      if (commessa) {
        await updateCommessa(commessa.id, form)
        toast.success('Commessa aggiornata')
      } else {
        await createCommessa(form)
        toast.success('Commessa creata')
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const totale = form.imponibile + form.iva_totale

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{commessa ? 'Modifica commessa' : 'Nuova commessa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Collegamento preventivo */}
          <div className="space-y-2">
            <Label>Preventivo accettato (opzionale)</Label>
            <Select
              value={form.preventivo_id ?? '__nessuno__'}
              onValueChange={setPreventivoSelezionato}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona preventivo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nessuno__">— Nessuno —</SelectItem>
                {preventivi.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.numero ? `${p.numero} — ` : ''}{p.cliente_nome || 'Cliente senza nome'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cliente */}
          <div className="space-y-2">
            <Label htmlFor="cliente_nome">Cliente *</Label>
            <Input
              id="cliente_nome"
              value={form.cliente_nome}
              onChange={setField('cliente_nome')}
              placeholder="Nome cliente o azienda"
            />
          </div>

          {/* Importi */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="imponibile">Imponibile (€)</Label>
              <Input
                id="imponibile"
                type="number"
                step="0.01"
                min="0"
                value={form.imponibile}
                onChange={setNumber('imponibile')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iva_totale">IVA (€)</Label>
              <Input
                id="iva_totale"
                type="number"
                step="0.01"
                min="0"
                value={form.iva_totale}
                onChange={setNumber('iva_totale')}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 -mt-2">
            Totale: <span className="font-semibold text-gray-800">{formatEuro(totale)}</span>
          </p>

          {/* N. commessa e data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="numero_commessa">N. Commessa</Label>
              <Input
                id="numero_commessa"
                value={form.numero_commessa}
                onChange={setField('numero_commessa')}
                placeholder="es. C-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_conferma">Data conferma</Label>
              <Input
                id="data_conferma"
                type="date"
                value={form.data_conferma}
                onChange={setField('data_conferma')}
              />
            </div>
          </div>

          {/* Operatore */}
          <div className="space-y-2">
            <Label>Operatore</Label>
            <Select
              value={form.operatore_id ?? '__nessuno__'}
              onValueChange={setOperatore}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona operatore..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nessuno__">— Nessuno —</SelectItem>
                {utenti.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <textarea
              id="note"
              value={form.note ?? ''}
              onChange={setField('note')}
              placeholder="Note interne..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : commessa ? 'Salva' : 'Crea commessa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
