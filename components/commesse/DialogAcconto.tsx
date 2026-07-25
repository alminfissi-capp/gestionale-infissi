'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus, MapPin, Navigation, ExternalLink, X } from 'lucide-react'
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
import { addAcconto, deleteAcconto, updateCommessa } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { AccontoCommessa, AccontoInput, MetodoPagamento } from '@/types/commessa'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { db } from '@/lib/db'
import { parseCoordinate, mapsUrl } from '@/lib/geo'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessaId: string
  clienteNome: string
  acconti: AccontoCommessa[]
  commessaLat: number | null
  commessaLng: number | null
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

export default function DialogAcconto({ open, onOpenChange, commessaId, clienteNome, acconti, commessaLat, commessaLng }: Props) {
  const router = useRouter()
  const { isOnline } = useOnlineStatus()
  const [form, setForm] = useState<AccontoInput>(emptyForm())
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [lat, setLat] = useState<number | null>(commessaLat)
  const [lng, setLng] = useState<number | null>(commessaLng)
  const [linkInput, setLinkInput] = useState('')
  const [editingPos, setEditingPos] = useState(false)
  const [savingPos, setSavingPos] = useState(false)

  const salvaPosizione = async (nLat: number | null, nLng: number | null) => {
    if (!isOnline) {
      toast.error('Connessione richiesta per salvare la posizione')
      return
    }
    setSavingPos(true)
    try {
      await updateCommessa(commessaId, { cantiere_lat: nLat, cantiere_lng: nLng })
      setLat(nLat)
      setLng(nLng)
      setLinkInput('')
      setEditingPos(false)
      toast.success(nLat === null ? 'Posizione rimossa' : 'Posizione salvata')
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio della posizione')
    } finally {
      setSavingPos(false)
    }
  }

  const usaPosizioneAttuale = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocalizzazione non disponibile su questo dispositivo')
      return
    }
    setSavingPos(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void salvaPosizione(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setSavingPos(false)
        toast.error('Impossibile ottenere la posizione (permesso negato o GPS assente)')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const salvaDaLink = () => {
    const parsed = parseCoordinate(linkInput)
    if (!parsed) {
      toast.error('Coordinate non riconosciute. Incolla il link Google Maps completo o coordinate "lat, lng".')
      return
    }
    void salvaPosizione(parsed.lat, parsed.lng)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.importo || form.importo <= 0) {
      toast.error("Inserisci un importo valido")
      return
    }
    setLoading(true)
    try {
      if (!isOnline) {
        await db.pendingAcconti.add({
          commessaId,
          input: form,
          createdAt: new Date().toISOString(),
        })
        toast.success('Acconto salvato offline. Verrà sincronizzato al ritorno in rete.')
        setForm(emptyForm())
      } else {
        await addAcconto(commessaId, form)
        toast.success('Acconto registrato')
        setForm(emptyForm())
        router.refresh()
      }
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

        {/* Posizione cantiere */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> Posizione cantiere
          </p>

          {lat !== null && lng !== null && !editingPos ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-mono">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={mapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
                  <Button type="button" size="sm" variant="outline" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> Apri in Google Maps
                  </Button>
                </a>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingPos(true)}>
                  Modifica
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-600 gap-1"
                  disabled={savingPos}
                  onClick={() => salvaPosizione(null, null)}
                >
                  <X className="h-3.5 w-3.5" /> Rimuovi
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                disabled={savingPos}
                onClick={usaPosizioneAttuale}
              >
                <Navigation className="h-3.5 w-3.5" />
                {savingPos ? 'Attendere...' : 'Usa posizione attuale'}
              </Button>
              <div className="flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Incolla link Maps o lat, lng"
                  className="text-sm"
                />
                <Button type="button" size="sm" variant="secondary" disabled={savingPos || !linkInput.trim()} onClick={salvaDaLink}>
                  Salva
                </Button>
              </div>
              {editingPos && (
                <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => setEditingPos(false)}>
                  Annulla
                </Button>
              )}
            </div>
          )}
        </div>

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
