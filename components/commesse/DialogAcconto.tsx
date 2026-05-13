'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addAcconto, deleteAcconto } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { AccontoCommessa, AccontoInput, MetodoPagamento } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessaId: string
  clienteNome: string
  acconti: AccontoCommessa[]
}

const METODI: { value: MetodoPagamento; label: string }[] = [
  { value: 'contanti', label: 'Contanti' },
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'riba', label: 'Ri.Ba.' },
  { value: 'altro', label: 'Altro' },
]

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = (): AccontoInput => ({
  importo: 0,
  data_pagamento: today(),
  metodo_pagamento: 'contanti',
  note: null,
})

export default function DialogAcconto({ open, onOpenChange, commessaId, clienteNome, acconti }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<AccontoInput>(emptyForm())
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.importo || form.importo <= 0) {
      toast.error("Inserisci un importo valido")
      return
    }
    setLoading(true)
    try {
      await addAcconto(commessaId, form)
      toast.success('Acconto registrato')
      setForm(emptyForm())
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteAcconto(id)
      toast.success('Acconto eliminato')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeletingId(null)
    }
  }

  const totale = acconti.reduce((s, a) => s + a.importo, 0)

  const formatData = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('it-IT')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acconti — {clienteNome}</DialogTitle>
        </DialogHeader>

        {/* Lista acconti esistenti */}
        {acconti.length > 0 ? (
          <div className="space-y-2">
            {acconti.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border p-2.5 bg-gray-50">
                <div>
                  <p className="font-semibold text-sm">{formatEuro(a.importo)}</p>
                  <p className="text-xs text-gray-500">
                    {formatData(a.data_pagamento)} · {METODI.find((m) => m.value === a.metodo_pagamento)?.label ?? a.metodo_pagamento}
                    {a.note ? ` · ${a.note}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-600"
                  disabled={deletingId === a.id}
                  onClick={() => handleDelete(a.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-right text-gray-500 font-medium">
              Totale acconti: <span className="text-gray-800">{formatEuro(totale)}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-2">Nessun acconto registrato</p>
        )}

        <hr />

        {/* Form nuovo acconto */}
        <form onSubmit={handleAdd} className="space-y-3">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Plus className="h-4 w-4" /> Nuovo acconto
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="acc-importo">Importo (€) *</Label>
              <Input
                id="acc-importo"
                type="number"
                step="0.01"
                min="0.01"
                value={form.importo || ''}
                onChange={(e) => setForm((f) => ({ ...f, importo: parseFloat(e.target.value) || 0 }))}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-data">Data</Label>
              <Input
                id="acc-data"
                type="date"
                value={form.data_pagamento}
                onChange={(e) => setForm((f) => ({ ...f, data_pagamento: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Metodo di pagamento</Label>
            <Select
              value={form.metodo_pagamento}
              onValueChange={(v) => setForm((f) => ({ ...f, metodo_pagamento: v as MetodoPagamento }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODI.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-note">Note</Label>
            <Input
              id="acc-note"
              value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value || null }))}
              placeholder="Riferimento, descrizione..."
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Registrazione...' : 'Registra acconto'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
