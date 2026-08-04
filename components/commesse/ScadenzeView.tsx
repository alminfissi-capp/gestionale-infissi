'use client'

/* eslint-disable @next/next/no-img-element */
import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Camera, Check, ChevronDown, Loader2, Star, Landmark, GripVertical, Copy, CalendarPlus,
  MoreVertical, Printer, Paperclip, FileText,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  setPagatoScadenza,
  deleteScadenza,
  updateScadenza,
  uploadFotoScadenza,
  removeFotoScadenza,
  getFotoScadenzaUrl,
  toggleCalcoliScadenza,
  riordinaScadenze,
  copiaScadenzaRate,
} from '@/actions/scadenze'
import { formatEuro } from '@/lib/pricing'
import { ocrAssegno, type OcrAssegnoResult } from '@/lib/ocrAssegno'
import { parseBonificoScadenza, type BonificoScadenza } from '@/lib/parseBonificoScadenza'
import DialogScadenza, { CADENZE } from './DialogScadenza'
import type { Scadenza, CategoriaScadenza, ContoCorrente } from '@/types/commessa'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const meseDi = (data: string) => Number(data.slice(5, 7))
const giornoDi = (data: string) => Number(data.slice(8, 10))

const CAT_BADGE: Record<CategoriaScadenza, { label: string; cls: string } | null> = {
  finanziamento: { label: 'Finanz.', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  assegno: { label: 'Ass./Bon.', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  utenza: { label: 'Utenza', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  altro: null,
}

// Bordo sinistro colorato per distinguere a colpo d'occhio assegni e rate
const CAT_BORDER: Record<CategoriaScadenza, string> = {
  finanziamento: 'border-l-purple-400',
  assegno: 'border-l-blue-400',
  utenza: 'border-l-amber-400',
  altro: 'border-l-transparent',
}

// Sfondo riga sbiadito per categoria (lo stato "pagato" ha la precedenza col verde)
const CAT_BG: Record<CategoriaScadenza, string> = {
  finanziamento: 'bg-purple-50/60',
  assegno: 'bg-blue-50/60',
  utenza: 'bg-amber-50/60',
  altro: 'bg-white',
}

type RowProps = {
  s: Scadenza
  contoNome: Record<string, string>
  fotoUrl?: string
  uploading: boolean
  setCameraRef: (el: HTMLInputElement | null) => void
  setFileRef: (el: HTMLInputElement | null) => void
  onClickCamera: () => void
  onClickFile: () => void
  onTogglePagato: (s: Scadenza) => void
  onToggleCalcoli: (s: Scadenza) => void
  onDelete: (s: Scadenza) => void
  onFotoSelected: (s: Scadenza, file: File | null) => void
  onOpenFoto: (url: string, s: Scadenza) => void
  onEdit: (s: Scadenza) => void
  onCopia: (s: Scadenza, cadenzaMesi: number) => void
  onApriPiano: (s: Scadenza) => void
  copying: boolean
}

function SortableScadenzaRow({
  s, contoNome, fotoUrl, uploading, setCameraRef, setFileRef, onClickCamera, onClickFile,
  onTogglePagato, onToggleCalcoli, onDelete, onFotoSelected, onOpenFoto, onEdit,
  onCopia, onApriPiano, copying,
}: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: s.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const badge = CAT_BADGE[s.categoria]
  const isPdf = !!s.foto_path?.toLowerCase().endsWith('.pdf')
  const rata = s.numero_rata != null
    ? `Rata ${s.numero_rata}${s.totale_rate ? `/${s.totale_rate}` : ''}`
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2.5 border-l-4 ${CAT_BORDER[s.categoria]} ${
        isDragging ? 'opacity-50 bg-rose-50 relative z-10' : s.pagato ? 'bg-emerald-50' : CAT_BG[s.categoria]
      }`}
    >
      {/* Maniglia trascinamento */}
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        type="button"
        title="Trascina per riordinare"
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Pagato toggle */}
      <button
        type="button"
        onClick={() => onTogglePagato(s)}
        title={s.pagato ? 'Segna come da pagare' : 'Segna come pagata'}
        className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
          s.pagato
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-gray-300 text-transparent hover:border-emerald-400'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      {/* Giorno */}
      <div className="w-8 shrink-0 text-center">
        <span className="text-sm font-semibold text-gray-700">{giornoDi(s.data_scadenza)}</span>
      </div>

      {/* Fornitore + descrizione */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-800 truncate max-w-full">
            {s.fornitore || <span className="text-gray-400">—</span>}
          </p>
          {badge && (
            <span className={`text-[10px] rounded border px-1 py-0 font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {rata && (
            <span className="text-[10px] rounded border border-gray-200 bg-gray-50 text-gray-500 px-1 py-0">
              {rata}
            </span>
          )}
          {s.conto_id && contoNome[s.conto_id] && (
            <span className="sm:hidden inline-flex items-center gap-0.5 text-[10px] rounded border border-slate-200 bg-slate-50 text-slate-600 px-1 py-0">
              <Landmark className="h-2.5 w-2.5" />
              {contoNome[s.conto_id]}
            </span>
          )}
        </div>
        {s.descrizione && (
          <p className="text-xs text-gray-500 truncate">{s.descrizione}</p>
        )}
      </div>

      {/* Conto corrente (colonna allineata a sinistra, va a capo se lunga, da tablet in su) */}
      <div className="hidden sm:flex w-28 shrink-0 items-start gap-1 text-xs">
        {s.conto_id && contoNome[s.conto_id] ? (
          <>
            <Landmark className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="text-slate-700 font-medium leading-tight break-words">{contoNome[s.conto_id]}</span>
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Allegato: foto dell'assegno oppure PDF della contabile del bonifico */}
      <input
        ref={setCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFotoSelected(s, e.target.files?.[0] ?? null)}
      />
      <input
        ref={setFileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFotoSelected(s, e.target.files?.[0] ?? null)}
      />
      <div className="w-20 shrink-0 flex items-center justify-center">
        {uploading ? (
          <div className="h-12 w-20 rounded border bg-gray-50 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : s.foto_path ? (
          isPdf ? (
            // Il PDF si riconosce a colpo d'occhio; il clic apre comunque l'anteprima
            <button
              type="button"
              onClick={() => fotoUrl && onOpenFoto(fotoUrl, s)}
              disabled={!fotoUrl}
              className="h-12 w-20 rounded border bg-red-50 border-red-200 flex flex-col items-center justify-center gap-0.5 hover:ring-2 hover:ring-rose-300 disabled:opacity-50"
              title="Apri anteprima del bonifico"
            >
              <FileText className="h-5 w-5 text-red-500" />
              <span className="text-[9px] font-semibold text-red-600">PDF</span>
            </button>
          ) : fotoUrl ? (
            <button
              type="button"
              onClick={() => onOpenFoto(fotoUrl, s)}
              className="h-12 w-20 rounded border overflow-hidden bg-gray-50 hover:ring-2 hover:ring-rose-300"
              title="Apri foto"
            >
              <img src={fotoUrl} alt="foto scadenza" className="h-full w-full object-contain" />
            </button>
          ) : (
            <div className="h-12 w-20 rounded border bg-gray-100 animate-pulse" />
          )
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-gray-400 hover:text-rose-600"
                title={
                  s.categoria === 'assegno'
                    ? 'Allega assegno o contabile del bonifico'
                    : 'Allega foto o documento'
                }
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClickCamera}>
                <Camera className="h-4 w-4 mr-2" />
                Scatta foto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClickFile}>
                <FileText className="h-4 w-4 mr-2" />
                Scegli file (foto o PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Importo */}
      <div className="w-24 shrink-0 text-right">
        <span className={`text-sm font-semibold ${s.pagato ? 'text-emerald-700 line-through' : 'text-gray-900'}`}>
          {formatEuro(s.importo)}
        </span>
      </div>

      {/* Stella Calcoli */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        title={s.in_calcoli ? 'Rimuovi dai Calcoli' : 'Aggiungi ai Calcoli'}
        onClick={() => onToggleCalcoli(s)}
      >
        <Star className={`h-4 w-4 ${s.in_calcoli ? 'text-amber-400 fill-amber-400' : 'text-gray-300 hover:text-amber-400'}`} />
      </Button>

      {/* Menu azioni (modifica, stampa, copia, elimina) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-700"
            title="Azioni"
            disabled={copying}
          >
            {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(s)}>
            <Pencil className="h-4 w-4 mr-2" />
            Modifica
          </DropdownMenuItem>
          {/* Link vero e non window.open: nella PWA installata (display standalone)
              le finestre popup vengono bloccate in silenzio */}
          <DropdownMenuItem asChild>
            <Link href={`/scadenze/${s.id}/stampa`}>
              <Printer className="h-4 w-4 mr-2" />
              Stampa scheda
            </Link>
          </DropdownMenuItem>

          {/* Copia nei mesi successivi (rate dei finanziamenti e bollette ricorrenti) */}
          {(s.categoria === 'finanziamento' || s.categoria === 'utenza') && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCopia(s, 1)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Copia al mese successivo
              </DropdownMenuItem>
              {s.categoria === 'utenza' && (
                <DropdownMenuItem onClick={() => onCopia(s, 2)}>
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Copia +2 mesi (bimestrale)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onCopia(s, 3)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Copia +3 mesi (trimestrale)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onApriPiano(s)}>
                <Copy className="h-4 w-4 mr-2" />
                {s.categoria === 'utenza' ? 'Ripeti su più mesi…' : 'Genera piano rate…'}
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            // confirm() bloccante: lo lanciamo dopo la chiusura del menu
            onSelect={() => setTimeout(() => onDelete(s), 0)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Ripete una bolletta ricorrente sui mesi successivi (stesso importo, da correggere a bolletta arrivata) */
function DialogRipetiUtenza({ scadenza, onClose }: { scadenza: Scadenza; onClose: () => void }) {
  const router = useRouter()
  const [totale, setTotale] = useState('12')
  const [cadenza, setCadenza] = useState('1')
  const [loading, setLoading] = useState(false)

  const totaleNum = parseInt(totale, 10)
  const count = Number.isFinite(totaleNum) ? Math.min(totaleNum, 60) - 1 : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (count < 1) { toast.error('Indica almeno 2 scadenze in tutto'); return }
    setLoading(true)
    try {
      const { creati } = await copiaScadenzaRate({
        origineId: scadenza.id,
        cadenzaMesi: parseInt(cadenza, 10) || 1,
        count,
      })
      toast.success(`${creati} scadenze create`)
      onClose()
      router.refresh()
    } catch {
      toast.error('Errore nella ripetizione della scadenza')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ripeti su più mesi</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            Ripete {scadenza.descrizione || scadenza.fornitore || 'questa utenza'} nei mesi successivi
            con lo stesso importo ({formatEuro(scadenza.importo)}), da correggere quando arriva la bolletta.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ripeti-totale">Quante scadenze in tutto</Label>
            <Input
              id="ripeti-totale"
              type="number"
              min="2"
              max="60"
              value={totale}
              onChange={(e) => setTotale(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ripeti-cadenza">Cadenza</Label>
            <select
              id="ripeti-cadenza"
              value={cadenza}
              onChange={(e) => setCadenza(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {CADENZE.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {count > 0 && (
            <p className="text-xs text-gray-500">
              Verranno create <span className="font-semibold text-gray-700">{count}</span> nuove scadenze
              oltre a quella attuale.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={loading || count < 1}>
              {loading ? 'Creazione…' : 'Crea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogPianoRate({ scadenza, onClose }: { scadenza: Scadenza; onClose: () => void }) {
  const router = useRouter()
  const [totale, setTotale] = useState(scadenza.totale_rate != null ? String(scadenza.totale_rate) : '')
  const [cadenza, setCadenza] = useState<'1' | '3'>('1')
  const [loading, setLoading] = useState(false)

  const rataCorrente = scadenza.numero_rata ?? 1
  const totaleNum = parseInt(totale, 10)
  const count = Number.isFinite(totaleNum) ? totaleNum - rataCorrente : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!Number.isFinite(totaleNum) || totaleNum < 1) { toast.error('Inserisci il numero totale di rate'); return }
    if (count < 1) { toast.error('Il totale deve essere maggiore della rata attuale'); return }
    setLoading(true)
    try {
      // Allinea il totale rate anche sulla rata di partenza
      if (scadenza.totale_rate !== totaleNum) {
        await updateScadenza(scadenza.id, { totale_rate: totaleNum })
      }
      const { creati } = await copiaScadenzaRate({
        origineId: scadenza.id,
        cadenzaMesi: Number(cadenza),
        count,
        totaleRate: totaleNum,
      })
      toast.success(`${creati} rate generate`)
      onClose()
      router.refresh()
    } catch {
      toast.error('Errore nella generazione del piano')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Genera piano rate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            Partendo dalla rata {rataCorrente}
            {scadenza.fornitore ? ` di ${scadenza.fornitore}` : ''}, crea le rate successive con lo stesso importo
            ({formatEuro(scadenza.importo)}) fino al totale indicato.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="piano-totale">Numero totale di rate</Label>
            <Input
              id="piano-totale"
              type="number"
              min={rataCorrente + 1}
              placeholder="es. 12"
              value={totale}
              onChange={(e) => setTotale(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="piano-cadenza">Cadenza</Label>
            <select
              id="piano-cadenza"
              value={cadenza}
              onChange={(e) => setCadenza(e.target.value as '1' | '3')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="1">Mensile</option>
              <option value="3">Trimestrale (ogni 3 mesi)</option>
            </select>
          </div>
          {count > 0 && (
            <p className="text-xs text-gray-500">
              Verranno create <span className="font-semibold text-gray-700">{count}</span> nuove rate
              (dalla {rataCorrente + 1} alla {totaleNum}).
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={loading || count < 1}>
              {loading ? 'Generazione…' : 'Genera'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface Props {
  gruppoId: string
  gruppoNome: string
  scadenze: Scadenza[]
  fornitori: string[]
  conti: ContoCorrente[]
}

export default function ScadenzeView({ gruppoId, gruppoNome, scadenze, fornitori, conti }: Props) {
  const router = useRouter()
  const contoNome = useMemo(
    () => Object.fromEntries(conti.map((c) => [c.id, c.nome])) as Record<string, string>,
    [conti]
  )

  const anno = useMemo(() => {
    const n = parseInt(gruppoNome, 10)
    if (!isNaN(n) && n > 1900) return n
    if (scadenze.length > 0) return Number(scadenze[0].data_scadenza.slice(0, 4))
    return new Date().getFullYear()
  }, [gruppoNome, scadenze])

  // Stato locale sincronizzato con i dati server (adjust-state-during-render)
  const [items, setItems] = useState<Scadenza[]>(scadenze)
  const [prevScad, setPrevScad] = useState(scadenze)
  // Mesi aperti (fisarmonica): di default tutti collassati, per vedere i 12 mesi a colpo d'occhio
  const [openMonths, setOpenMonths] = useState<Set<number>>(() => new Set())
  if (prevScad !== scadenze) {
    setPrevScad(scadenze)
    setItems(scadenze)
  }

  const toggleMonth = (m: number) =>
    setOpenMonths((cur) => {
      const next = new Set(cur)
      if (next.has(m)) next.delete(m); else next.add(m)
      return next
    })
  const openMonth = (m: number) => setOpenMonths((cur) => new Set(cur).add(m))

  // Dialog add/edit
  const [dialog, setDialog] = useState<{ scadenza: Scadenza | null; defaultData: string } | null>(null)

  // Lightbox foto
  const [lightbox, setLightbox] = useState<{ url: string; scadenza: Scadenza } | null>(null)

  // Copia rate: spinner sulla riga in copia + dialog "genera piano"
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [piano, setPiano] = useState<Scadenza | null>(null)

  // URL firmati delle foto + upload/OCR in corso
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Carica gli URL firmati delle righe con allegato. Per i PDF si usa
  // l'anteprima: e' quella che si mostra a schermo e in stampa.
  useEffect(() => {
    let cancelled = false
    const conAllegato = items.filter((s) => s.foto_path)
    if (conAllegato.length === 0) { setFotoUrls({}); return }
    const load = async () => {
      const map: Record<string, string> = {}
      await Promise.all(
        conAllegato.map(async (s) => {
          const path = s.anteprima_path ?? s.foto_path!
          try { map[s.id] = await getFotoScadenzaUrl(path) } catch { /* ignora */ }
        })
      )
      if (!cancelled) setFotoUrls(map)
    }
    load()
    return () => { cancelled = true }
  }, [items])

  const handleTogglePagato = async (s: Scadenza) => {
    const nuovo = !s.pagato
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, pagato: nuovo } : x)))
    try {
      await setPagatoScadenza(s.id, nuovo)
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, pagato: !nuovo } : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleToggleCalcoli = async (s: Scadenza) => {
    const nuovo = !s.in_calcoli
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, in_calcoli: nuovo } : x)))
    try {
      await toggleCalcoliScadenza(s.id, nuovo)
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, in_calcoli: !nuovo } : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDelete = async (s: Scadenza) => {
    if (!confirm('Eliminare questa scadenza?')) return
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== s.id))
    try {
      await deleteScadenza(s.id)
      router.refresh()
    } catch {
      setItems(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  const handleFotoSelected = async (s: Scadenza, file: File | null) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('File troppo grande (max 20 MB)'); return }

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const daLeggere = s.categoria === 'assegno'

    setUploadingId(s.id)
    if (daLeggere) toast.info(isPdf ? 'Lettura del bonifico in corso…' : 'Lettura assegno in corso…')

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('scadenzaId', s.id)

      // I PDF non si vedono a schermo ne' in stampa: si allega l'immagine
      // della prima pagina, generata qui nel browser
      let anteprimaGenerata = false
      if (isPdf) {
        try {
          const { renderPaginePdf } = await import('@/lib/pdf-items')
          const [dataUrl] = await renderPaginePdf(file, { maxPagine: 1 })
          if (dataUrl) {
            const blob = await (await fetch(dataUrl)).blob()
            fd.append('anteprima', blob, 'anteprima.jpg')
            anteprimaGenerata = true
          }
        } catch {
          // Senza anteprima il PDF resta comunque allegato e scaricabile
        }
      }

      const lettura = !daLeggere
        ? Promise.resolve(null)
        : isPdf
          ? parseBonificoScadenza(file)
          : ocrAssegno(file)

      const [res, letto] = await Promise.all([uploadFotoScadenza(fd), lettura])
      if (res.error) throw new Error(res.error)

      // Campi riconosciuti. Il fornitore non si tocca mai: quello scritto a mano
      // e' piu' preciso del nome che compare in banca.
      const patch: { descrizione?: string; importo?: number; data_scadenza?: string } = {}
      if (letto) {
        if (isPdf) {
          const b = letto as BonificoScadenza
          if (b.causale) patch.descrizione = b.causale
          if (b.importo != null && !s.importo) patch.importo = b.importo
          if (b.data) patch.data_scadenza = b.data
        } else {
          const o = letto as OcrAssegnoResult
          if (o.numero) patch.descrizione = `Assegno n. ${o.numero}`
          if (o.importo != null && !s.importo) patch.importo = o.importo
        }
      }
      const haLetto = Object.keys(patch).length > 0
      if (haLetto) {
        await updateScadenza(s.id, patch)
        setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
      }

      const nome = isPdf ? 'Bonifico allegato' : 'Foto allegata'
      if (daLeggere) {
        toast.success(haLetto ? `${nome} · dati letti` : `${nome} (nessun dato riconosciuto)`)
      } else {
        toast.success(nome)
      }
      if (isPdf && !anteprimaGenerata) {
        toast.warning("Anteprima non generata: il PDF resta allegato ma non comparirà nella scheda")
      }
      router.refresh()
    } catch {
      toast.error('Errore nel caricamento del file')
    } finally {
      setUploadingId(null)
      if (fileRefs.current[s.id]) fileRefs.current[s.id]!.value = ''
      if (cameraRefs.current[s.id]) cameraRefs.current[s.id]!.value = ''
    }
  }

  const handleRemoveFoto = async (s: Scadenza) => {
    if (!s.foto_path) return
    if (!confirm('Rimuovere la foto?')) return
    try {
      await removeFotoScadenza(s.id, s.foto_path)
      setLightbox(null)
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    }
  }

  const handleCopia = async (s: Scadenza, cadenzaMesi: number) => {
    setCopyingId(s.id)
    try {
      await copiaScadenzaRate({ origineId: s.id, cadenzaMesi, count: 1 })
      const quando = cadenzaMesi === 1 ? 'al mese successivo' : `(+${cadenzaMesi} mesi)`
      toast.success(`${s.categoria === 'utenza' ? 'Utenza copiata' : 'Rata copiata'} ${quando}`)
      router.refresh()
    } catch {
      toast.error('Errore nella copia')
    } finally {
      setCopyingId(null)
    }
  }

  // Raggruppa per mese
  const perMese = useMemo(() => {
    const map = new Map<number, Scadenza[]>()
    for (const s of items) {
      const m = meseDi(s.data_scadenza)
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(s)
    }
    for (const arr of map.values()) {
      // Ordine manuale (su/giù); a parità ripiega sul giorno del mese
      arr.sort((a, b) => (a.ordine - b.ordine) || (giornoDi(a.data_scadenza) - giornoDi(b.data_scadenza)))
    }
    return map
  }, [items])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)
    // Riordino vincolato allo stesso mese
    for (const [, righe] of perMese.entries()) {
      const oldIndex = righe.findIndex((r) => r.id === activeId)
      if (oldIndex === -1) continue
      const newIndex = righe.findIndex((r) => r.id === overId)
      if (newIndex === -1) return // trascinata su un altro mese → ignora
      const ids = arrayMove(righe, oldIndex, newIndex).map((r) => r.id)
      setItems((cur) => cur.map((x) => {
        const pos = ids.indexOf(x.id)
        return pos === -1 ? x : { ...x, ordine: pos }
      }))
      riordinaScadenze(ids).catch(() => { toast.error('Errore nel riordino'); router.refresh() })
      return
    }
  }

  const totali = useMemo(() => {
    const daPagare = items.reduce((s, x) => s + (x.pagato ? 0 : x.importo), 0)
    const pagato = items.reduce((s, x) => s + (x.pagato ? x.importo : 0), 0)
    return { daPagare, pagato, totale: daPagare + pagato }
  }, [items])

  return (
    <div className="space-y-4 pb-10">
      {/* Riepilogo anno */}
      <div className="rounded-md border bg-white p-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-2">
        <div className="mr-auto text-sm text-gray-500">{items.length} scadenze nel {anno}</div>
        <div className="text-base">
          <span className="text-gray-700 font-semibold">Totale: {formatEuro(totali.totale)}</span>
          {totali.daPagare > 0 ? (
            <span className="text-rose-700 font-bold"> · {formatEuro(totali.daPagare)} da pagare</span>
          ) : (
            <span className="text-emerald-600 font-semibold"> · saldato</span>
          )}
        </div>
      </div>

      {/* 12 mesi a fisarmonica */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-2">
        {MESI.map((nomeMese, i) => {
          const mese = i + 1
          const righe = perMese.get(mese) ?? []
          const totaleMese = righe.reduce((s, x) => s + x.importo, 0)
          const daPagareMese = righe.reduce((s, x) => s + (x.pagato ? 0 : x.importo), 0)
          const defaultData = `${anno}-${pad2(mese)}-01`
          const aperto = openMonths.has(mese)

          return (
            <div key={mese} className="rounded-md border bg-white overflow-hidden">
              <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-gray-50/70 border-b">
                <button
                  type="button"
                  onClick={() => toggleMonth(mese)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left py-1"
                >
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aperto ? '' : '-rotate-90'}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{nomeMese}</h3>
                  {righe.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{righe.length}</Badge>
                  )}
                  {righe.length > 0 && (
                    <span className="text-xs truncate">
                      <span className="text-gray-600 font-medium">{formatEuro(totaleMese)}</span>
                      {daPagareMese > 0 ? (
                        <span className="text-rose-600 font-medium"> · {formatEuro(daPagareMese)} da pagare</span>
                      ) : (
                        <span className="text-emerald-600 font-medium"> · saldato</span>
                      )}
                    </span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-rose-700 shrink-0"
                  onClick={() => { openMonth(mese); setDialog({ scadenza: null, defaultData }) }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Aggiungi
                </Button>
              </div>

              {aperto && righe.length > 0 && (
                <SortableContext items={righe.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y">
                    {righe.map((s) => (
                      <SortableScadenzaRow
                        key={s.id}
                        s={s}
                        contoNome={contoNome}
                        fotoUrl={fotoUrls[s.id]}
                        uploading={uploadingId === s.id}
                        setCameraRef={(el) => { cameraRefs.current[s.id] = el }}
                        setFileRef={(el) => { fileRefs.current[s.id] = el }}
                        onClickCamera={() => cameraRefs.current[s.id]?.click()}
                        onClickFile={() => fileRefs.current[s.id]?.click()}
                        onTogglePagato={handleTogglePagato}
                        onToggleCalcoli={handleToggleCalcoli}
                        onDelete={handleDelete}
                        onFotoSelected={handleFotoSelected}
                        onOpenFoto={(url, sc) => setLightbox({ url, scadenza: sc })}
                        onEdit={(sc) => setDialog({ scadenza: sc, defaultData: sc.data_scadenza })}
                        onCopia={handleCopia}
                        onApriPiano={(sc) => setPiano(sc)}
                        copying={copyingId === s.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          )
        })}
      </div>
      </DndContext>

      {/* Dialog add/edit */}
      {dialog && (
        <DialogScadenza
          open
          onOpenChange={(v) => { if (!v) setDialog(null) }}
          gruppoId={gruppoId}
          scadenza={dialog.scadenza}
          defaultData={dialog.defaultData}
          fornitori={fornitori}
          conti={conti}
        />
      )}

      {/* Dialog genera piano rate / ripeti utenza */}
      {piano && (piano.categoria === 'utenza'
        ? <DialogRipetiUtenza scadenza={piano} onClose={() => setPiano(null)} />
        : <DialogPianoRate scadenza={piano} onClose={() => setPiano(null)} />
      )}

      {/* Lightbox foto */}
      <Dialog open={!!lightbox} onOpenChange={(v) => { if (!v) setLightbox(null) }}>
        <DialogContent className="max-w-3xl p-2 sm:p-3">
          {lightbox && (
            <div className="space-y-2">
              <img
                src={lightbox.url}
                alt="allegato scadenza"
                className="w-full max-h-[80vh] object-contain rounded"
              />
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-gray-500 truncate">
                  {lightbox.scadenza.fornitore ||
                    (lightbox.scadenza.anteprima_path ? 'Contabile bonifico' : 'Foto scadenza')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => handleRemoveFoto(lightbox.scadenza)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Rimuovi allegato
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
