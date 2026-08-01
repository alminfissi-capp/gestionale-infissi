'use client'

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark, ReceiptText, CircleDashed, Zap, Camera, Upload, Loader2, X } from 'lucide-react'
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
import { createScadenza, updateScadenza, uploadFotoScadenza, copiaScadenzaRate } from '@/actions/scadenze'
import { ocrAssegno } from '@/lib/ocrAssegno'
import type { Scadenza, CategoriaScadenza, ContoCorrente } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  gruppoId: string
  scadenza: Scadenza | null
  defaultData: string // data_scadenza precompilata in creazione (YYYY-MM-DD)
  fornitori: string[]
  conti: ContoCorrente[]
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
  conto_id: string
  // Ripetizione utenza: quante scadenze creare in tutto e ogni quanti mesi
  ripeti_totale: string
  ripeti_cadenza: string
}

const CATEGORIE: { value: CategoriaScadenza; label: string; icon: typeof Landmark }[] = [
  { value: 'finanziamento', label: 'Finanziamento', icon: Landmark },
  { value: 'assegno', label: 'Assegno', icon: ReceiptText },
  { value: 'utenza', label: 'Utenza', icon: Zap },
  { value: 'altro', label: 'Altro', icon: CircleDashed },
]

export const CADENZE: { value: string; label: string }[] = [
  { value: '1', label: 'Mensile' },
  { value: '2', label: 'Bimestrale (ogni 2 mesi)' },
  { value: '3', label: 'Trimestrale (ogni 3 mesi)' },
]

// Etichetta mese/anno dell'ultima scadenza generata (solo anteprima nel form)
function meseAnnoDopo(iso: string, mesi: number): string {
  const [y, m] = iso.split('-').map(Number)
  if (!y || !m) return ''
  return new Date(Date.UTC(y, m - 1 + mesi, 1))
    .toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function DialogScadenza({ open, onOpenChange, gruppoId, scadenza, defaultData, fornitori, conti }: Props) {
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
    conto_id: '',
    ripeti_totale: '1',
    ripeti_cadenza: '1',
  })
  const [loading, setLoading] = useState(false)

  // Foto allegata in fase di inserimento (caricata solo al salvataggio)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

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
        conto_id: scadenza.conto_id ?? '',
        ripeti_totale: '1',
        ripeti_cadenza: '1',
      })
    } else {
      setForm({
        data_scadenza: defaultData, fornitore: '', descrizione: '', importo: '',
        pagato: false, categoria: 'altro', numero_rata: '', totale_rate: '', conto_id: '',
        ripeti_totale: '1', ripeti_cadenza: '1',
      })
    }
    // Reset foto a ogni apertura
    setFotoFile(null)
    setFotoPreview(null)
    setOcrLoading(false)
  }, [open, scadenza, defaultData])

  // Revoca l'object URL di anteprima quando cambia/si smonta
  useEffect(() => {
    return () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview) }
  }, [fotoPreview])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleFotoSelected = async (file: File | null) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('Foto troppo grande (max 20 MB)'); return }
    setFotoFile(file)
    setFotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })

    setOcrLoading(true)
    try {
      const { numero, importo, data } = await ocrAssegno(file)
      setForm((f) => ({
        ...f,
        importo: importo != null ? String(importo) : f.importo,
        data_scadenza: data ?? f.data_scadenza,
        descrizione: numero ? `Assegno n. ${numero}` : f.descrizione,
      }))
      if (numero || importo != null || data) {
        toast.success('Dati letti dalla foto · controlla e correggi se serve')
      } else {
        toast.info('Foto allegata · nessun dato riconosciuto, inserisci a mano')
      }
    } finally {
      setOcrLoading(false)
    }
  }

  const removeFoto = () => {
    setFotoFile(null)
    setFotoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    if (cameraRef.current) cameraRef.current.value = ''
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.data_scadenza) { toast.error('Inserisci la data di scadenza'); return }
    const importo = parseFloat((form.importo || '0').replace(',', '.')) || 0
    const numero_rata = form.categoria === 'finanziamento' && form.numero_rata ? parseInt(form.numero_rata, 10) : null
    const totale_rate = form.categoria === 'finanziamento' && form.totale_rate ? parseInt(form.totale_rate, 10) : null
    const ripetiTotale = Math.min(Math.max(parseInt(form.ripeti_totale, 10) || 1, 1), 60)
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
        conto_id: form.conto_id || null,
      }
      let id: string
      let ripetute = 0
      if (scadenza) {
        await updateScadenza(scadenza.id, payload)
        id = scadenza.id
      } else {
        const res = await createScadenza(payload)
        id = res.id
        // Utenza ricorrente: la prima scadenza è appena stata creata, replica le successive
        if (form.categoria === 'utenza' && ripetiTotale > 1) {
          const { creati } = await copiaScadenzaRate({
            origineId: id,
            cadenzaMesi: parseInt(form.ripeti_cadenza, 10) || 1,
            count: ripetiTotale - 1,
          })
          ripetute = creati
        }
      }
      // Carica la foto (se allegata) dopo aver ottenuto l'id
      if (fotoFile) {
        const fd = new FormData()
        fd.append('file', fotoFile)
        fd.append('scadenzaId', id)
        const up = await uploadFotoScadenza(fd)
        if (up.error) toast.error(`Foto non caricata: ${up.error}`)
      }
      toast.success(
        scadenza
          ? 'Scadenza aggiornata'
          : ripetute > 0
            ? `Utenza aggiunta · ${ripetute + 1} scadenze create`
            : 'Scadenza aggiunta'
      )
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
  const isUtenza = form.categoria === 'utenza'
  const ripetiN = Math.min(Math.max(parseInt(form.ripeti_totale, 10) || 1, 1), 60)
  const dataFinale = meseAnnoDopo(form.data_scadenza, (ripetiN - 1) * (parseInt(form.ripeti_cadenza, 10) || 1))

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

          {/* Foto assegno + OCR (solo categoria assegno) */}
          {isAssegno && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <Label className="text-blue-800">Foto assegno</Label>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFotoSelected(e.target.files?.[0] ?? null)}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFotoSelected(e.target.files?.[0] ?? null)}
              />

              {fotoPreview ? (
                <div className="relative">
                  <img
                    src={fotoPreview}
                    alt="anteprima assegno"
                    className="w-full max-h-44 object-contain rounded border bg-white"
                  />
                  {ocrLoading && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 rounded bg-white/70 text-sm text-blue-700">
                      <Loader2 className="h-4 w-4 animate-spin" /> Lettura assegno…
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={removeFoto}
                    className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-gray-500 hover:text-red-600 shadow"
                    title="Rimuovi foto"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-blue-200 text-blue-700 hover:bg-blue-100"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 mr-1.5" /> Scatta foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-blue-200 text-blue-700 hover:bg-blue-100"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1.5" /> Carica file
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-blue-700/70">
                Numero, importo e data vengono letti dalla foto: controllali e correggili qui sotto.
              </p>
            </div>
          )}

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

          <div className="space-y-1.5">
            <Label htmlFor="conto_id">Conto corrente</Label>
            <select
              id="conto_id"
              value={form.conto_id}
              onChange={(e) => set('conto_id', e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">— nessuno —</option>
              {conti.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {conti.length === 0 && (
              <p className="text-[11px] text-gray-400">
                Nessun conto: aggiungili in Impostazioni → Conti correnti.
              </p>
            )}
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

          {/* Ricorrenza utenza (solo in creazione: in modifica si usa la copia dall'elenco) */}
          {isUtenza && !scadenza && (
            <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <Label className="text-amber-800">Ripeti nei mesi successivi</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ripeti_totale" className="text-xs font-normal text-amber-800/80">
                    Quante scadenze
                  </Label>
                  <Input
                    id="ripeti_totale"
                    type="number"
                    min="1"
                    max="60"
                    value={form.ripeti_totale}
                    onChange={(e) => set('ripeti_totale', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ripeti_cadenza" className="text-xs font-normal text-amber-800/80">
                    Cadenza
                  </Label>
                  <select
                    id="ripeti_cadenza"
                    value={form.ripeti_cadenza}
                    onChange={(e) => set('ripeti_cadenza', e.target.value)}
                    disabled={ripetiN < 2}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {CADENZE.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-amber-800/70">
                {ripetiN < 2
                  ? 'Lascia 1 per inserire una sola bolletta. Aumenta il numero per crearne anche nei mesi successivi.'
                  : `Verranno create ${ripetiN} scadenze con lo stesso importo, l'ultima a ${dataFinale}. Correggi l'importo di ognuna quando arriva la bolletta.`}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="descrizione">{isAssegno ? 'Numero assegno / descrizione' : 'Descrizione'}</Label>
            <textarea
              id="descrizione"
              value={form.descrizione}
              onChange={(e) => set('descrizione', e.target.value)}
              placeholder={
                isAssegno
                  ? 'Numero assegno (letto dalla foto o a mano)'
                  : isUtenza
                    ? 'es. Luce sede, Acqua capannone, Internet ufficio...'
                    : 'es. Rata leasing, F24, saldo fattura...'
              }
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading || ocrLoading}>
              {loading ? 'Salvataggio...' : scadenza ? 'Salva' : 'Aggiungi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
