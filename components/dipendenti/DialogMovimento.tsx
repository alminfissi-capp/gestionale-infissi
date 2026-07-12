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
import { addMovimentoAltro } from '@/actions/altri-dipendenti'
import { formatPeriodoAltro, normalizzaPeriodo } from '@/lib/altri-dipendenti'
import type {
  AltroDipendente, MetodoPagamentoDipendente, TipoMovimentoAltro,
} from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendente: AltroDipendente
  tipo: TipoMovimentoAltro
}

const oggi = () => new Date().toISOString().slice(0, 10)

const METODI: { value: MetodoPagamentoDipendente; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti' },
  { value: 'altro', label: 'Altro' },
]

export default function DialogMovimento({ open, onOpenChange, dipendente, tipo }: Props) {
  const router = useRouter()
  const [dataPeriodo, setDataPeriodo] = useState(oggi())
  const [importo, setImporto] = useState('')
  const [dataPagamento, setDataPagamento] = useState(oggi())
  const [metodo, setMetodo] = useState<MetodoPagamentoDipendente>('bonifico')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setDataPeriodo(oggi())
      setImporto('')
      setDataPagamento(oggi())
      setMetodo('bonifico')
      setNote('')
    }
  }, [open])

  const etichettaPeriodo = formatPeriodoAltro(
    normalizzaPeriodo(dataPeriodo, dipendente.cadenza),
    dipendente.cadenza,
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const imp = parseFloat(importo.replace(',', '.'))
    if (!imp || imp <= 0) {
      toast.error('Importo non valido')
      return
    }
    setLoading(true)
    try {
      await addMovimentoAltro({
        altro_dipendente_id: dipendente.id,
        tipo,
        data_periodo: dataPeriodo,
        importo: imp,
        data_pagamento: tipo === 'pagamento' ? dataPagamento : null,
        metodo: tipo === 'pagamento' ? metodo : null,
        note: note || null,
      })
      toast.success(tipo === 'stipendio' ? 'Stipendio aggiunto' : 'Pagamento aggiunto')
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
          <DialogTitle>{tipo === 'stipendio' ? 'Aggiungi stipendio' : 'Aggiungi pagamento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mov-periodo">
              {tipo === 'stipendio' ? 'Periodo' : 'Periodo di competenza'} *
            </Label>
            <Input id="mov-periodo" type="date" value={dataPeriodo}
              onChange={(e) => setDataPeriodo(e.target.value)} />
            <p className="text-xs text-muted-foreground">{etichettaPeriodo}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mov-importo">Importo (€) *</Label>
            <Input id="mov-importo" inputMode="decimal" value={importo}
              onChange={(e) => setImporto(e.target.value)} />
          </div>
          {tipo === 'pagamento' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="mov-datapag">Data pagamento *</Label>
                <Input id="mov-datapag" type="date" value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)} />
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
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="mov-note">Note</Label>
            <Input id="mov-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : 'Salva'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
