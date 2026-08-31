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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createVenditaAnonima, updateVenditaAnonima } from '@/actions/vendite-anonime'
import {
  ALIQUOTA_IVA_DEFAULT,
  calcolaUtile,
  margine,
  scorporaIva,
} from '@/lib/vendite-anonime'
import { formatEuro } from '@/lib/pricing'
import { CANALI_VENDITA } from '@/types/commessa'
import type {
  CanaleVendita,
  MetodoPagamento,
  VenditaAnonima,
  VenditaAnonimaInput,
} from '@/types/commessa'

const METODI: { value: MetodoPagamento; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti' },
  { value: 'riba', label: 'Ri.Ba.' },
  { value: 'altro', label: 'Altro' },
]

const oggi = () => new Date().toISOString().split('T')[0]

interface Props {
  sezioneId: string
  /** null = nuova vendita */
  vendita: VenditaAnonima | null
  onClose: () => void
}

/** Montato solo quando serve: lo stato parte dai valori giusti senza useEffect. */
export default function DialogVenditaAnonima({ sezioneId, vendita, onClose }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<VenditaAnonimaInput>(() =>
    vendita
      ? {
          sezione_id: vendita.sezione_id,
          data: vendita.data,
          descrizione: vendita.descrizione,
          canale: vendita.canale,
          metodo_pagamento: vendita.metodo_pagamento,
          lordo: vendita.lordo,
          aliquota_iva: vendita.aliquota_iva,
          materiale: vendita.materiale,
          manodopera: vendita.manodopera,
        }
      : {
          sezione_id: sezioneId,
          data: oggi(),
          descrizione: '',
          canale: 'ebay',
          metodo_pagamento: 'bonifico',
          lordo: 0,
          aliquota_iva: ALIQUOTA_IVA_DEFAULT,
          materiale: 0,
          manodopera: 0,
        },
  )
  const [loading, setLoading] = useState(false)

  // Calcolati in render: sono funzioni pure sugli stessi valori del form,
  // tenerli in stato vorrebbe dire doverli risincronizzare a ogni tasto.
  const { imponibile, iva } = scorporaIva(form.lordo, form.aliquota_iva)
  const utile = calcolaUtile(imponibile, form.materiale, form.manodopera)
  const perc = margine(imponibile, utile)

  const numero = (k: 'lordo' | 'aliquota_iva' | 'materiale' | 'manodopera') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.data) {
      toast.error('Inserisci la data della vendita')
      return
    }
    if (form.lordo <= 0) {
      toast.error('Inserisci un importo incassato valido')
      return
    }
    if (form.materiale < 0 || form.manodopera < 0 || form.aliquota_iva < 0) {
      toast.error('Costi e aliquota non possono essere negativi')
      return
    }
    setLoading(true)
    try {
      if (vendita) await updateVenditaAnonima(vendita.id, form)
      else await createVenditaAnonima(form)
      toast.success(vendita ? 'Vendita aggiornata' : 'Vendita registrata')
      onClose()
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md xl:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendita ? 'Modifica vendita' : 'Nuova vendita'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ven-data">Data *</Label>
              <Input
                id="ven-data"
                type="date"
                value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ven-lordo">Incassato (€) *</Label>
              <Input
                id="ven-lordo"
                type="number"
                step="0.01"
                min="0.01"
                value={form.lordo || ''}
                onChange={numero('lordo')}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ven-descrizione">Descrizione</Label>
            <Input
              id="ven-descrizione"
              value={form.descrizione}
              onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
              placeholder="Maniglione + serratura, ordine #1042..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Canale</Label>
              <Select
                value={form.canale}
                onValueChange={(v) => setForm((f) => ({ ...f, canale: v as CanaleVendita }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANALI_VENDITA.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Metodo di pagamento</Label>
              <Select
                value={form.metodo_pagamento}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, metodo_pagamento: v as MetodoPagamento }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODI.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ven-iva">IVA (%)</Label>
              <Input
                id="ven-iva"
                type="number"
                step="0.01"
                min="0"
                value={form.aliquota_iva || ''}
                onChange={numero('aliquota_iva')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ven-materiale">Materiale (€)</Label>
              <Input
                id="ven-materiale"
                type="number"
                step="0.01"
                min="0"
                value={form.materiale || ''}
                onChange={numero('materiale')}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ven-manodopera">Manodopera (€)</Label>
              <Input
                id="ven-manodopera"
                type="number"
                step="0.01"
                min="0"
                value={form.manodopera || ''}
                onChange={numero('manodopera')}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Riepilogo dal vivo: l'utile si vede prima di salvare, mai si digita */}
          <div className="rounded-md border bg-gray-50 p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Imponibile</span>
              <span className="font-medium text-gray-800">{formatEuro(imponibile)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IVA</span>
              <span className="font-medium text-gray-800">{formatEuro(iva)}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="font-semibold text-gray-700">Utile</span>
              <span className={`font-bold ${utile < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {formatEuro(utile)}
                <span className="ml-1 text-xs font-medium text-gray-500">
                  ({perc.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)
                </span>
              </span>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : vendita ? 'Salva modifiche' : 'Registra vendita'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
