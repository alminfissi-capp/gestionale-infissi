'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Plus, Search, Trash2, Pencil, Paperclip, FileText, Upload,
  GripVertical, MoreVertical, Copy,
} from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteCommessa, duplicaCommessa, updateOrdineCommesse, updateStatoCommessa } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, PreventivoPerCommessa, StatoCommessa, UtentePerCommessa } from '@/types/commessa'
import { REPARTI } from '@/types/commessa'

const STATI: { value: StatoCommessa; label: string }[] = [
  { value: 'in_attesa',                label: 'In attesa' },
  { value: 'da_iniziare',              label: 'Da iniziare' },
  { value: 'in_lavorazione',           label: 'In lavorazione' },
  { value: 'da_consegnare',            label: 'Da consegnare' },
  { value: 'consegnato',               label: 'Consegnato' },
  { value: 'parzialmente_consegnato',  label: 'Parz. consegnato' },
  { value: 'concluso',                 label: 'Concluso' },
  { value: 'bloccato',                 label: 'Bloccato' },
  { value: 'annullato',                label: 'Annullato' },
]

function statoRowClass(stato: StatoCommessa): string {
  if (stato === 'concluso')   return 'bg-sky-50'
  if (stato === 'bloccato')   return 'bg-orange-50'
  if (stato === 'annullato')  return 'bg-red-50'
  if (stato === 'in_attesa')  return ''
  return 'bg-yellow-50'
}

function statoBadgeClass(stato: StatoCommessa): string {
  if (stato === 'concluso')   return 'bg-sky-100 text-sky-700 border-sky-200'
  if (stato === 'bloccato')   return 'bg-orange-100 text-orange-700 border-orange-200'
  if (stato === 'annullato')  return 'bg-red-100 text-red-700 border-red-200'
  if (stato === 'in_attesa')  return 'bg-gray-100 text-gray-500 border-gray-200'
  return 'bg-yellow-100 text-yellow-700 border-yellow-200'
}
import DialogCommessa from './DialogCommessa'
import DialogAcconto from './DialogAcconto'
import DialogDocumenti from './DialogDocumenti'
import DialogPreventivoManuale from './DialogPreventivoManuale'

interface Props {
  commesse: CommessaCompleta[]
  preventivi: PreventivoPerCommessa[]
  utenti: UtentePerCommessa[]
  preventivoDaConvertire?: PreventivoPerCommessa | null
}

function formatMese(data: string): string {
  const [y, m] = data.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const mese = d.toLocaleDateString('it-IT', { month: 'long' })
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${y}`
}

/* ── Riga sortable ─────────────────────────────────────────── */

interface RowProps {
  c: CommessaCompleta
  onEdit: () => void
  onDelete: () => void
  onDuplica: () => void
  onAcconto: () => void
  onDocumenti: () => void
  onPrevManuale: () => void
  onStatoChange: (s: StatoCommessa) => void
}

function SortableRow({ c, onEdit, onDelete, onDuplica, onAcconto, onDocumenti, onPrevManuale, onStatoChange }: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: c.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const saldoPositivo = c.saldo > 0.005
  const saldoZero = !saldoPositivo && c.saldo >= -0.005
  const nPrev = c.documenti.filter((d) => d.tipo_documento === 'preventivo').length

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-40 bg-blue-50' : statoRowClass(c.stato)}
      {...attributes}
    >
      {/* Drag handle */}
      <TableCell className="w-8 pr-0 pl-2">
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none flex items-center"
          title="Trascina per riordinare"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      <TableCell>
        <p className="font-medium text-sm">{c.cliente_nome}</p>
        {c.note && <p className="text-xs text-gray-400 truncate max-w-[130px]">{c.note}</p>}
      </TableCell>

      {/* N. Preventivo */}
      <TableCell>
        {c.preventivo_id ? (
          <Link
            href={`/preventivi/${c.preventivo_id}`}
            className="font-mono text-xs text-teal-600 hover:underline"
            title="Apri preventivo"
          >
            {c.numero_preventivo || 'Vedi prev.'}
          </Link>
        ) : (
          <button
            onClick={onPrevManuale}
            className="group flex items-center gap-1 text-left"
            title={nPrev > 0 ? 'Vedi PDF preventivo' : 'Carica PDF preventivo'}
          >
            <span className="font-mono text-xs text-gray-500 group-hover:text-gray-800">
              {c.numero_preventivo || '—'}
            </span>
            {nPrev > 0 ? (
              <span className="flex items-center gap-0.5 text-[10px] bg-blue-100 text-blue-600 rounded px-1">
                <FileText className="h-2.5 w-2.5" />
                {nPrev}
              </span>
            ) : (
              <Upload className="h-3 w-3 text-gray-300 group-hover:text-teal-500" />
            )}
          </button>
        )}
      </TableCell>

      <TableCell className="text-right text-sm font-semibold">
        {formatEuro(c.totale)}
      </TableCell>

      <TableCell className="text-right text-sm text-gray-500">
        {formatEuro(c.iva_totale)}
      </TableCell>

      {/* Acconti */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className="text-sm">{c.totale_acconti > 0 ? formatEuro(c.totale_acconti) : '—'}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            title="Gestisci acconti"
            onClick={onAcconto}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>

      {/* Saldo */}
      <TableCell className="text-right">
        <Badge
          className={
            saldoZero
              ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
              : saldoPositivo
              ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100'
              : 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100'
          }
        >
          {formatEuro(c.saldo)}
        </Badge>
      </TableCell>

      <TableCell className="font-mono text-sm">
        {c.numero_commessa || <span className="text-gray-300">—</span>}
      </TableCell>

      {/* Stato */}
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${statoBadgeClass(c.stato)}`}
              title="Cambia stato"
            >
              {STATI.find((s) => s.value === c.stato)?.label ?? c.stato}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATI.map((s) => (
              <DropdownMenuItem
                key={s.value}
                onClick={() => onStatoChange(s.value)}
                className={c.stato === s.value ? 'font-semibold' : ''}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
        {formatMese(c.data_conferma)}
      </TableCell>

      <TableCell className="text-sm text-gray-600">
        {c.operatore_nome || <span className="text-gray-300">—</span>}
      </TableCell>

      {/* Reparti */}
      <TableCell>
        {c.reparti && c.reparti.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {c.reparti.map((r) => (
              <span key={r} className="rounded-full bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                {REPARTI.find((x) => x.value === r)?.label ?? r}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </TableCell>

      {/* Documenti */}
      <TableCell className="text-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          title="Documenti allegati"
          onClick={onDocumenti}
        >
          <Paperclip className="h-4 w-4 text-gray-400" />
          {c.documenti.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-teal-600 text-white text-[10px] flex items-center justify-center">
              {c.documenti.length}
            </span>
          )}
        </Button>
      </TableCell>

      {/* Menu azioni */}
      <TableCell className="text-right pr-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplica}>
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplica
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

/* ── Componente principale ─────────────────────────────────── */

export default function TabellaCommesse({ commesse, preventivi, utenti, preventivoDaConvertire }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<CommessaCompleta[]>(commesse)
  const [search, setSearch] = useState('')
  const [dialogCommessa, setDialogCommessa] = useState(false)
  const [editingCommessa, setEditingCommessa] = useState<CommessaCompleta | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dialogAcconto, setDialogAcconto] = useState<CommessaCompleta | null>(null)
  const [dialogDocumenti, setDialogDocumenti] = useState<CommessaCompleta | null>(null)
  const [dialogPrevManuale, setDialogPrevManuale] = useState<CommessaCompleta | null>(null)
  const autoOpenDone = useRef(false)

  // Sincronizza items con i dati dal server (dopo router.refresh)
  useEffect(() => { setItems(commesse) }, [commesse])

  // Auto-apre il dialog una sola volta se c'è un preventivo da convertire (?from=)
  useEffect(() => {
    if (preventivoDaConvertire && !autoOpenDone.current) {
      autoOpenDone.current = true
      setEditingCommessa(null)
      setDialogCommessa(true)
    }
  }, [preventivoDaConvertire])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return items
    return items.filter((c) =>
      [
        c.cliente_nome,
        c.numero_commessa,
        c.numero_preventivo,
        c.operatore_nome,
        c.note,
        formatMese(c.data_conferma),
        c.stato,
        STATI.find((s) => s.value === c.stato)?.label,
        (c.reparti ?? []).map((r) => REPARTI.find((x) => x.value === r)?.label ?? r).join(' '),
      ].some((f) => f?.toLowerCase().includes(q))
    )
  }, [items, search])

  const totali = useMemo(() => ({
    totale: filtered.reduce((s, c) => s + c.totale, 0),
    iva:    filtered.reduce((s, c) => s + c.iva_totale, 0),
    saldo:  filtered.reduce((s, c) => s + c.saldo, 0),
    count:  filtered.length,
  }), [filtered])

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id)
      const newIndex = prev.findIndex((c) => c.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      updateOrdineCommesse(next.map((c, i) => ({ id: c.id, ordine: i })))
      return next
    })
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteCommessa(deletingId)
      toast.success('Commessa eliminata')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  const handleDuplica = async (id: string) => {
    try {
      await duplicaCommessa(id)
      toast.success('Commessa duplicata')
      router.refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    }
  }

  const handleStatoChange = async (id: string, stato: StatoCommessa) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, stato } : c)))
    try {
      await updateStatoCommessa(id, stato)
    } catch {
      toast.error('Errore aggiornamento stato')
      router.refresh()
    }
  }

  const openEdit = (c: CommessaCompleta) => {
    setEditingCommessa(c)
    setDialogCommessa(true)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca cliente, numero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => { setEditingCommessa(null); setDialogCommessa(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          Nuova commessa
        </Button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {items.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Nessuna commessa</p>
              <p className="text-sm mb-4">Crea la prima commessa per iniziare.</p>
              <Button onClick={() => { setEditingCommessa(null); setDialogCommessa(true) }}>
                <Plus className="h-4 w-4 mr-1" />
                Nuova commessa
              </Button>
            </>
          ) : (
            <p className="text-sm">Nessun risultato per &quot;{search}&quot;</p>
          )}
        </div>
      )}

      {/* Tabella */}
      {filtered.length > 0 && (
        <div className="rounded-md border bg-white overflow-auto max-h-[calc(100vh-12rem)]">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="min-w-[140px]">Cliente</TableHead>
                  <TableHead className="min-w-[90px]">N. Prev.</TableHead>
                  <TableHead className="text-right min-w-[100px]">Totale</TableHead>
                  <TableHead className="text-right min-w-[80px]">IVA</TableHead>
                  <TableHead className="text-right min-w-[130px]">Acconti</TableHead>
                  <TableHead className="text-right min-w-[100px]">Saldo</TableHead>
                  <TableHead className="min-w-[110px]">N. Commessa</TableHead>
                  <TableHead className="min-w-[130px]">Stato</TableHead>
                  <TableHead className="min-w-[110px]">Mese</TableHead>
                  <TableHead className="min-w-[110px]">Operatore</TableHead>
                  <TableHead className="min-w-[160px]">Reparto</TableHead>
                  <TableHead className="text-center min-w-[80px]">Docs</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {filtered.map((c) => (
                    <SortableRow
                      key={c.id}
                      c={c}
                      onEdit={() => openEdit(c)}
                      onDelete={() => setDeletingId(c.id)}
                      onDuplica={() => handleDuplica(c.id)}
                      onAcconto={() => setDialogAcconto(c)}
                      onDocumenti={() => setDialogDocumenti(c)}
                      onPrevManuale={() => setDialogPrevManuale(c)}
                      onStatoChange={(s) => handleStatoChange(c.id, s)}
                    />
                  ))}
                </SortableContext>
              </TableBody>
              <tfoot>
                <tr className="border-t-2 border-gray-100">
                  {/* drag handle */}
                  <td className="sticky bottom-0 bg-white py-2.5 w-8" />
                  {/* Cliente — etichetta conteggio */}
                  <td className="sticky bottom-0 bg-white py-2.5 pl-4 text-xs text-gray-400 whitespace-nowrap">
                    {totali.count} {totali.count === 1 ? 'commessa' : 'commesse'}{search ? ' trovate' : ''}
                  </td>
                  {/* N. Prev */}
                  <td className="sticky bottom-0 bg-white py-2.5 px-4" />
                  {/* Totale */}
                  <td className="sticky bottom-0 bg-white py-2.5 px-4 text-right text-sm font-bold text-gray-900 whitespace-nowrap">
                    {formatEuro(totali.totale)}
                  </td>
                  {/* IVA */}
                  <td className="sticky bottom-0 bg-white py-2.5 px-4 text-right text-sm text-gray-600 whitespace-nowrap">
                    {formatEuro(totali.iva)}
                  </td>
                  {/* Acconti */}
                  <td className="sticky bottom-0 bg-white py-2.5 px-4" />
                  {/* Saldo */}
                  <td className={`sticky bottom-0 bg-white py-2.5 px-4 text-right text-sm font-bold whitespace-nowrap ${totali.saldo > 0.005 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatEuro(totali.saldo)}
                  </td>
                  {/* N. Commessa, Stato, Mese, Operatore, Reparto, Docs, Menu */}
                  <td className="sticky bottom-0 bg-white" colSpan={7} />
                </tr>
              </tfoot>
            </Table>
          </DndContext>
        </div>
      )}

      {/* Dialogs */}
      <DialogCommessa
        open={dialogCommessa}
        onOpenChange={(v) => { setDialogCommessa(v); if (!v) setEditingCommessa(null) }}
        commessa={editingCommessa}
        preventivi={preventivi}
        utenti={utenti}
        preventivoDaConvertire={!editingCommessa ? preventivoDaConvertire : null}
      />

      {dialogAcconto && (
        <DialogAcconto
          open
          onOpenChange={(v) => { if (!v) setDialogAcconto(null) }}
          commessaId={dialogAcconto.id}
          clienteNome={dialogAcconto.cliente_nome}
          acconti={dialogAcconto.acconti}
        />
      )}

      {dialogDocumenti && (
        <DialogDocumenti
          open
          onOpenChange={(v) => { if (!v) setDialogDocumenti(null) }}
          commessaId={dialogDocumenti.id}
          clienteNome={dialogDocumenti.cliente_nome}
          documenti={dialogDocumenti.documenti}
        />
      )}

      {dialogPrevManuale && (
        <DialogPreventivoManuale
          open
          onOpenChange={(v) => { if (!v) setDialogPrevManuale(null) }}
          commessaId={dialogPrevManuale.id}
          clienteNome={dialogPrevManuale.cliente_nome}
          numeroPrev={dialogPrevManuale.numero_preventivo}
          documenti={dialogPrevManuale.documenti}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina commessa</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La commessa, tutti gli acconti e i documenti allegati verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
