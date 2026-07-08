'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { addPagamento } from '@/actions/dipendenti'
import { MENSILITA_LABELS } from '@/lib/dipendenti'
import type { Mensilita, MetodoPagamentoDipendente } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendenteId: string
  periodoDefault?: string // 'YYYY-MM-01'
}

const METODI: { value: MetodoPagamentoDipendente; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti (acconto)' },
  { value: 'altro', label: 'Altro' },
]

const today = () => new Date().toISOString().split('T')[0]

export default function DialogPagamentoManuale({ open, onOpenChange, dipendenteId, periodoDefault }: Props) {
  const router = useRouter()
  const [importo, setImporto] = useState('')
  const [data, setData] = useState(today())
  const [metodo, setMetodo] = useState<MetodoPagamentoDipendente>('contanti')
  const [periodo, setPeriodo] = useState((periodoDefault ?? today()).slice(0, 7)) // 'YYYY-MM'
  const [mensilita, setMensilita] = useState<Mensilita>('mensile')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const imp = parseFloat(importo.replace(',', '.'))
    if (!imp || imp <= 0) {
      toast.error('Inserisci un importo valido')
      return
    }
    if (!periodo) {
      toast.error('Indica il mese di competenza')
      return
    }
    setLoading(true)
    try {
      await addPagamento({
        dipendente_id: dipendenteId,
        data_pagamento: data,
        importo: imp,
        metodo,
        periodo_competenza: `${periodo}-01`,
        mensilita,
        note: note || null,
      })
      toast.success('Pagamento registrato')
      setImporto('')
      setNote('')
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registra pagamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pag-importo">Importo (€) *</Label>
              <Input
                id="pag-importo"
                inputMode="decimal"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pag-data">Data pagamento</Label>
              <Input id="pag-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pag-periodo">Mese di competenza *</Label>
              <Input
                id="pag-periodo"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={mensilita} onValueChange={(v) => setMensilita(v as Mensilita)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Metodo</Label>
            <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoPagamentoDipendente)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METODI.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pag-note">Note</Label>
            <Input id="pag-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Registrazione...' : 'Registra pagamento'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
