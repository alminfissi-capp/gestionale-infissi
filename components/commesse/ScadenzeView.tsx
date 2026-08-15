'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, ChevronDown, Trash2 } from 'lucide-react'
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
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
import { updateScadenza, riordinaScadenze, copiaScadenzaRate } from '@/actions/scadenze'
import { useScadenzeRighe } from '@/hooks/useScadenzeRighe'
import { formatEuro } from '@/lib/pricing'
import VisualizzatoreDocumento from '@/components/ui/VisualizzatoreDocumento'
import DialogScadenza, { CADENZE } from './DialogScadenza'
import RigaScadenza from './RigaScadenza'
import type { Scadenza, ContoCorrente } from '@/types/commessa'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const meseDi = (data: string) => Number(data.slice(5, 7))
const giornoDi = (data: string) => Number(data.slice(8, 10))

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
    const conData = scadenze.find((s) => s.data_scadenza)
    if (conData) return Number(conData.data_scadenza!.slice(0, 4))
    return new Date().getFullYear()
  }, [gruppoNome, scadenze])

  const {
    items, setItems, fotoUrls, uploadingId, copyingId, fileRefs, cameraRefs,
    handleTogglePagato, handleToggleCalcoli, handleToggleAnnullata, handleDelete,
    handleSpostaInLimbo, handleFotoSelected, handleRemoveFoto, handleCopia,
  } = useScadenzeRighe(scadenze)

  // Mesi aperti (fisarmonica): di default tutti collassati, per vedere i 12 mesi a colpo d'occhio
  const [openMonths, setOpenMonths] = useState<Set<number>>(() => new Set())

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

  // Dialog "genera piano" / "ripeti utenza"
  const [piano, setPiano] = useState<Scadenza | null>(null)

  // Raggruppa per mese
  const perMese = useMemo(() => {
    const map = new Map<number, Scadenza[]>()
    for (const s of items) {
      // In un blocco anno una riga senza data non ci arriva: chi toglie la data
      // sposta anche la riga nel blocco "da programmare"
      if (!s.data_scadenza) continue
      const m = meseDi(s.data_scadenza)
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(s)
    }
    for (const arr of map.values()) {
      // Ordine manuale (su/giù); a parità ripiega sul giorno del mese
      arr.sort((a, b) =>
        (a.ordine - b.ordine) || (giornoDi(a.data_scadenza!) - giornoDi(b.data_scadenza!))
      )
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

  // Le annullate restano in elenco ma non entrano in nessun totale
  const totali = useMemo(() => {
    const attive = items.filter((x) => !x.annullata)
    const daPagare = attive.reduce((s, x) => s + (x.pagato ? 0 : x.importo), 0)
    const pagato = attive.reduce((s, x) => s + (x.pagato ? x.importo : 0), 0)
    return { daPagare, pagato, totale: daPagare + pagato, count: attive.length, annullate: items.length - attive.length }
  }, [items])

  return (
    <div className="space-y-4 pb-10">
      {/* Riepilogo anno */}
      <div className="rounded-md border bg-white p-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-2">
        <div className="mr-auto text-sm text-gray-500">
          {totali.count} scadenze nel {anno}
          {totali.annullate > 0 && (
            <span className="text-gray-400"> · {totali.annullate} annullate</span>
          )}
        </div>
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
          const attiveMese = righe.filter((x) => !x.annullata)
          const totaleMese = attiveMese.reduce((s, x) => s + x.importo, 0)
          const daPagareMese = attiveMese.reduce((s, x) => s + (x.pagato ? 0 : x.importo), 0)
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
                  {attiveMese.length > 0 && (
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
                      <RigaScadenza
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
                        onToggleAnnullata={handleToggleAnnullata}
                        onDelete={handleDelete}
                        onSpostaInLimbo={handleSpostaInLimbo}
                        onFotoSelected={handleFotoSelected}
                        onOpenFoto={(url, sc) => setLightbox({ url, scadenza: sc })}
                        onEdit={(sc) => setDialog({ scadenza: sc, defaultData: sc.data_scadenza ?? defaultData })}
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

      {/* Anteprima a schermo intero, con zoom a pizzico e con la rotellina */}
      {lightbox && (
        <VisualizzatoreDocumento
          immagini={[lightbox.url]}
          titolo={
            lightbox.scadenza.fornitore ||
            (lightbox.scadenza.anteprima_path ? 'Contabile bonifico' : 'Foto scadenza')
          }
          azioni={
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:bg-white/20 hover:text-red-300"
              onClick={async () => {
                if (await handleRemoveFoto(lightbox.scadenza)) setLightbox(null)
              }}
            >
              <Trash2 className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Rimuovi allegato</span>
            </Button>
          }
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
