'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark, ReceiptText, CircleDashed } from 'lucide-react'
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
import type { Scadenza, CategoriaScadenza } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  gruppoId: string
  scadenza: Scadenza | null
  defaultData: string // data_scadenza precompilata in creazione (YYYY-MM-DD)
  fornitori: string[]
}

type FormState = {
  data_scadenza: string
  fornitore: string
  descrizione: string
  importo: string
  pagato: boolean
  categoria: CategoriaScadenza
  numero_rata: string
  totale_rate: string
}

const CATEGORIE: { value: CategoriaScadenza; label: string; icon: typeof Landmark }[] = [
  { value: 'finanziamento', label: 'Finanziamento', icon: Landmark },
  { value: 'assegno', label: 'Assegno', icon: ReceiptText },
  { value: 'altro', label: 'Altro', icon: CircleDashed },
]

export default function DialogScadenza({ open, onOpenChange, gruppoId, scadenza, defaultData, fornitori }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    data_scadenza: defaultData,
    fornitore: '',
    descrizione: '',
    importo: '',
    pagato: false,
    categoria: 'altro',
    numero_rata: '',
    totale_rate: '',
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
        categoria: scadenza.categoria,
        numero_rata: scadenza.numero_rata != null ? String(scadenza.numero_rata) : '',
        totale_rate: scadenza.totale_rate != null ? String(scadenza.totale_rate) : '',
      })
    } else {
      setForm({
        data_scadenza: defaultData, fornitore: '', descrizione: '', importo: '',
        pagato: false, categoria: 'altro', numero_rata: '', totale_rate: '',
      })
    }
  }, [open, scadenza, defaultData])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.data_scadenza) { toast.error('Inserisci la data di scadenza'); return }
    const importo = parseFloat((form.importo || '0').replace(',', '.')) || 0
    const numero_rata = form.categoria === 'finanziamento' && form.numero_rata ? parseInt(form.numero_rata, 10) : null
    const totale_rate = form.categoria === 'finanziamento' && form.totale_rate ? parseInt(form.totale_rate, 10) : null
    setLoading(true)
    try {
      const payload = {
        gruppo_id: gruppoId,
        data_scadenza: form.data_scadenza,
        fornitore: form.fornitore.trim(),
        descrizione: form.descrizione.trim(),
        importo,
        pagato: form.pagato,
        categoria: form.categoria,
        numero_rata,
        totale_rate,
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

  const isFin = form.categoria === 'finanziamento'
  const isAssegno = form.categoria === 'assegno'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scadenza ? 'Modifica scadenza' : 'Nuova scadenza'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Categoria */}
          <div className="space-y-1.5">
            <Label>Tipo di scadenza</Label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIE.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('categoria', value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors ${
                    form.categoria === value
                      ? 'bg-rose-50 border-rose-400 text-rose-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

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
              list="scadenze-fornitori"
              value={form.fornitore}
              onChange={(e) => set('fornitore', e.target.value)}
              placeholder="Seleziona o scrivi…"
            />
            <datalist id="scadenze-fornitori">
              {fornitori.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </div>

          {isFin && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="numero_rata">Rata n.</Label>
                <Input
                  id="numero_rata"
                  type="number"
                  min="0"
                  placeholder="es. 3"
                  value={form.numero_rata}
                  onChange={(e) => set('numero_rata', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totale_rate">Su totale rate</Label>
                <Input
                  id="totale_rate"
                  type="number"
                  min="0"
                  placeholder="es. 12"
                  value={form.totale_rate}
                  onChange={(e) => set('totale_rate', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="descrizione">Descrizione</Label>
            <textarea
              id="descrizione"
              value={form.descrizione}
              onChange={(e) => set('descrizione', e.target.value)}
              placeholder={isAssegno ? 'Numero assegno (letto dalla foto o a mano)' : 'es. Rata leasing, F24, saldo fattura...'}
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

          {!scadenza && isAssegno && (
            <p className="text-xs text-gray-400">
              Dopo aver salvato, allega la foto dell&apos;assegno dal pulsante fotocamera sulla riga:
              il numero verrà letto e inserito in descrizione.
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
