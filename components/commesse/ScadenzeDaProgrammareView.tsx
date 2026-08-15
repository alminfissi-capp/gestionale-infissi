'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
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
import { riordinaScadenze } from '@/actions/scadenze'
import { useScadenzeRighe } from '@/hooks/useScadenzeRighe'
import { formatEuro } from '@/lib/pricing'
import VisualizzatoreDocumento from '@/components/ui/VisualizzatoreDocumento'
import DialogScadenza from './DialogScadenza'
import RigaScadenza from './RigaScadenza'
import type { Scadenza, ContoCorrente } from '@/types/commessa'

interface Props {
  gruppoId: string
  scadenze: Scadenza[]
  fornitori: string[]
  conti: ContoCorrente[]
}

/**
 * Blocco "Da programmare": scadenze conosciute nell'importo ma non ancora
 * collocate in una data. Elenco piatto, senza mesi. Una riga esce di qui quando
 * riceve una data ed e' segnata come pagata: a quel punto il salvataggio la
 * sposta nel blocco dell'anno giusto.
 */
export default function ScadenzeDaProgrammareView({ gruppoId, scadenze, fornitori, conti }: Props) {
  const router = useRouter()
  const contoNome = useMemo(
    () => Object.fromEntries(conti.map((c) => [c.id, c.nome])) as Record<string, string>,
    [conti]
  )

  const {
    items, setItems, fotoUrls, uploadingId, copyingId, fileRefs, cameraRefs,
    handleToggleCalcoli, handleToggleAnnullata, handleDelete,
    handleFotoSelected, handleRemoveFoto,
  } = useScadenzeRighe(scadenze)

  // `pagaSubito`: la scheda si apre con la data di oggi e la spunta "pagata"
  // gia' messa, cosi' dal cerchietto verde resta solo da confermare il giorno
  const [dialog, setDialog] = useState<{ scadenza: Scadenza | null; pagaSubito: boolean } | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; scadenza: Scadenza } | null>(null)

  const righe = useMemo(() => [...items].sort((a, b) => a.ordine - b.ordine), [items])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = righe.findIndex((r) => r.id === String(active.id))
    const newIndex = righe.findIndex((r) => r.id === String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const ids = arrayMove(righe, oldIndex, newIndex).map((r) => r.id)
    setItems((cur) => cur.map((x) => {
      const pos = ids.indexOf(x.id)
      return pos === -1 ? x : { ...x, ordine: pos }
    }))
    riordinaScadenze(ids).catch(() => { toast.error('Errore nel riordino'); router.refresh() })
  }

  // Le annullate restano in elenco ma non entrano in nessun totale
  const totali = useMemo(() => {
    const attive = items.filter((x) => !x.annullata)
    return {
      totale: attive.reduce((s, x) => s + x.importo, 0),
      count: attive.length,
      annullate: items.length - attive.length,
    }
  }, [items])

  return (
    <div className="space-y-4 pb-10">
      {/* Riepilogo */}
      <div className="rounded-md border bg-white p-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-2">
        <div className="mr-auto text-sm text-gray-500">
          {totali.count} {totali.count === 1 ? 'scadenza in attesa' : 'scadenze in attesa'} di una data
          {totali.annullate > 0 && (
            <span className="text-gray-400"> · {totali.annullate} annullate</span>
          )}
        </div>
        <div className="text-base">
          <span className="text-gray-700 font-semibold">Totale: {formatEuro(totali.totale)}</span>
        </div>
      </div>

      <div className="rounded-md border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-gray-50/70 border-b">
          <div className="flex items-center gap-2 min-w-0 py-1">
            <CalendarClock className="h-4 w-4 text-slate-400 shrink-0" />
            <h3 className="text-sm font-semibold text-gray-700">Da programmare</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-rose-700 shrink-0"
            onClick={() => setDialog({ scadenza: null, pagaSubito: false })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi
          </Button>
        </div>

        {righe.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">
            Nessuna scadenza in attesa. Aggiungi qui quelle di cui conosci l&apos;importo
            ma non ancora la data di pagamento.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={righe.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y">
                {righe.map((s) => (
                  <RigaScadenza
                    key={s.id}
                    s={s}
                    daProgrammare
                    contoNome={contoNome}
                    fotoUrl={fotoUrls[s.id]}
                    uploading={uploadingId === s.id}
                    setCameraRef={(el) => { cameraRefs.current[s.id] = el }}
                    setFileRef={(el) => { fileRefs.current[s.id] = el }}
                    onClickCamera={() => cameraRefs.current[s.id]?.click()}
                    onClickFile={() => fileRefs.current[s.id]?.click()}
                    // Senza data la spunta non ha un mese in cui collocare la
                    // riga: apre la scheda con data e pagamento gia' pronti
                    onTogglePagato={(sc) => setDialog({ scadenza: sc, pagaSubito: true })}
                    onToggleCalcoli={handleToggleCalcoli}
                    onToggleAnnullata={handleToggleAnnullata}
                    onDelete={handleDelete}
                    onFotoSelected={handleFotoSelected}
                    onOpenFoto={(url, sc) => setLightbox({ url, scadenza: sc })}
                    onEdit={(sc) => setDialog({ scadenza: sc, pagaSubito: false })}
                    onCopia={() => { /* non disponibile senza una data */ }}
                    onApriPiano={() => { /* non disponibile senza una data */ }}
                    copying={copyingId === s.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {dialog && (
        <DialogScadenza
          open
          onOpenChange={(v) => { if (!v) setDialog(null) }}
          gruppoId={gruppoId}
          scadenza={dialog.scadenza}
          defaultData=""
          daProgrammare
          pagaSubito={dialog.pagaSubito}
          fornitori={fornitori}
          conti={conti}
        />
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
