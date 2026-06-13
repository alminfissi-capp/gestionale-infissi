'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createScadenza, updateScadenza } from '@/actions/scadenze'
import type { Scadenza } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  gruppoId: string
  scadenza: Scadenza | null
  defaultData: string // data_scadenza precompilata in creazione (YYYY-MM-DD)
}

type FormState = {
  data_scadenza: string
  fornitore: string
  descrizione: string
  importo: string
  pagato: boolean
}

export default function DialogScadenza({ open, onOpenChange, gruppoId, scadenza, defaultData }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    data_scadenza: defaultData,
    fornitore: '',
    descrizione: '',
    importo: '',
    pagato: false,
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (scadenza) {
      setForm({
        data_scadenza: scadenza.data_scadenza,
        fornitore: scadenza.fornitore,
        descrizione: scadenza.descrizione,
        importo: scadenza.importo ? String(scadenza.importo) : '',
        pagato: scadenza.pagato,
      })
    } else {
      setForm({ data_scadenza: defaultData, fornitore: '', descrizione: '', importo: '', pagato: false })
    }
  }, [open, scadenza, defaultData])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.data_scadenza) { toast.error('Inserisci la data di scadenza'); return }
    const importo = parseFloat((form.importo || '0').replace(',', '.')) || 0
    setLoading(true)
    try {
      const payload = {
        gruppo_id: gruppoId,
        data_scadenza: form.data_scadenza,
        fornitore: form.fornitore.trim(),
        descrizione: form.descrizione.trim(),
        importo,
        pagato: form.pagato,
      }
      if (scadenza) {
        await updateScadenza(scadenza.id, payload)
        toast.success('Scadenza aggiornata')
      } else {
        await createScadenza(payload)
        toast.success('Scadenza aggiunta')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{scadenza ? 'Modifica scadenza' : 'Nuova scadenza'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="data_scadenza">Data scadenza *</Label>
              <Input
                id="data_scadenza"
                type="date"
                value={form.data_scadenza}
                onChange={(e) => set('data_scadenza', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="importo">Importo (€)</Label>
              <Input
                id="importo"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.importo}
                onChange={(e) => set('importo', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fornitore">Fornitore</Label>
            <Input
              id="fornitore"
              value={form.fornitore}
              onChange={(e) => set('fornitore', e.target.value)}
              placeholder="es. Vetreria Rossi"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descrizione">Descrizione</Label>
            <textarea
              id="descrizione"
              value={form.descrizione}
              onChange={(e) => set('descrizione', e.target.value)}
              placeholder="es. Rata leasing, F24, saldo fattura..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
              checked={form.pagato}
              onChange={(e) => set('pagato', e.target.checked)}
            />
            Già pagata
          </label>

          {!scadenza && (
            <p className="text-xs text-gray-400">
              La foto si allega dopo aver salvato, dal pulsante foto sulla riga.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : scadenza ? 'Salva' : 'Aggiungi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
