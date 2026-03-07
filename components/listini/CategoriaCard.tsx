'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Table2,
  Copy,
  Download,
  FolderDown,
  FolderInput,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { deleteCategoria, deleteListino, duplicaListino, duplicaCategoria, updateOrdiniListini } from '@/actions/listini'
import { grigliaToCsv, downloadCsv, downloadZipCsv } from '@/lib/exportListino'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import TabellaGriglia from './TabellaGriglia'
import DialogCategoria from './DialogCategoria'
import DialogListino from './DialogListino'
import DialogImportaMultiplo from './DialogImportaMultiplo'
import IconaCategoria from './IconaCategoria'
import type { CategoriaConListini, ListinoCompleto } from '@/types/listino'

// ---- Riga sortable ----

interface RowProps {
  listino: ListinoCompleto
  isExpanded: boolean
  copying: boolean
  onToggle: (id: string) => void
  onEdit: (l: ListinoCompleto) => void
  onDelete: (id: string) => void
  onDuplica: (id: string) => void
  onExportCsv: (l: ListinoCompleto) => void
}

function SortableListinoRow({ listino, isExpanded, copying, onToggle, onEdit, onDelete, onDuplica, onExportCsv }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: listino.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="bg-gray-50/50">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0 touch-none"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Expand button */}
        <button
          onClick={() => onToggle(listino.id)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
          {listino.immagine_url ? (
            <img
              src={listino.immagine_url}
              alt={listino.tipologia}
              className="h-8 w-8 rounded object-contain shrink-0 border border-gray-200 bg-white"
            />
          ) : (
            <Table2 className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <span className="font-medium text-gray-800 text-sm">{listino.tipologia}</span>
          <span className="text-xs text-gray-400 ml-1">
            {listino.altezze.length}H × {listino.larghezze.length}L
            {listino.finiture.length > 0 && ` · ${listino.finiture.length} finiture`}
          </span>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Esporta CSV"
            onClick={() => onExportCsv(listino)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Duplica listino"
            disabled={copying}
            onClick={() => onDuplica(listino.id)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(listino)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-400 hover:text-red-600"
            onClick={() => onDelete(listino.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Griglia espansa */}
      {isExpanded && (
        <div className="px-6 pb-4">
          <TabellaGriglia
            data={{
              larghezze: listino.larghezze,
              altezze: listino.altezze,
              griglia: listino.griglia,
            }}
          />
          {listino.finiture.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {listino.finiture.map((f) => (
                <Badge key={f.id} variant="outline" className="text-xs">
                  {f.nome} +{f.aumento}%
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Componente principale ----

interface Props {
  categoria: CategoriaConListini
}

export default function CategoriaCard({ categoria }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [expandedListini, setExpandedListini] = useState<Set<string>>(new Set())

  const [localListini, setLocalListini] = useState(categoria.listini)
  useEffect(() => { setLocalListini(categoria.listini) }, [categoria.listini])

  const [editCatOpen, setEditCatOpen] = useState(false)
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)

  const [newListinoOpen, setNewListinoOpen] = useState(false)
  const [importMultiploOpen, setImportMultiploOpen] = useState(false)
  const [editingListino, setEditingListino] = useState<ListinoCompleto | null>(null)
  const [deletingListinoId, setDeletingListinoId] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const toggleListino = (id: string) => {
    setExpandedListini((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = localListini.findIndex((l) => l.id === active.id)
    const newIndex = localListini.findIndex((l) => l.id === over.id)
    const reordered = arrayMove(localListini, oldIndex, newIndex)

    setLocalListini(reordered)
    try {
      await updateOrdiniListini(reordered.map((l, i) => ({ id: l.id, ordine: i })))
      router.refresh()
    } catch {
      setLocalListini(categoria.listini)
      toast.error('Errore nel riordinamento')
    }
  }

  const handleDeleteCategoria = async () => {
    setDeleting(true)
    try {
      await deleteCategoria(categoria.id)
      toast.success('Categoria eliminata')
      router.refresh()
    } catch {
      toast.error('Errore nella cancellazione')
    } finally {
      setDeleting(false)
      setDeleteCatId(null)
    }
  }

  const handleDeleteListino = async () => {
    if (!deletingListinoId) return
    setDeleting(true)
    try {
      await deleteListino(deletingListinoId)
      toast.success('Listino eliminato')
      router.refresh()
    } catch {
      toast.error('Errore nella cancellazione')
    } finally {
      setDeleting(false)
      setDeletingListinoId(null)
    }
  }

  const handleDuplicaListino = async (listinoId: string) => {
    setCopying(true)
    try {
      await duplicaListino(listinoId)
      toast.success('Listino duplicato')
      router.refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    } finally {
      setCopying(false)
    }
  }

  const handleDuplicaCategoria = async () => {
    setCopying(true)
    try {
      await duplicaCategoria(categoria.id)
      toast.success('Categoria duplicata')
      router.refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    } finally {
      setCopying(false)
    }
  }

  const handleExportCsv = (listino: ListinoCompleto) => {
    const csv = grigliaToCsv({
      larghezze: listino.larghezze,
      altezze: listino.altezze,
      griglia: listino.griglia,
    })
    downloadCsv(csv, listino.tipologia)
  }

  const handleExportAllCsv = async () => {
    if (localListini.length === 0) return
    if (localListini.length === 1) {
      handleExportCsv(localListini[0])
      return
    }
    await downloadZipCsv(
      localListini.map((l) => ({
        tipologia: l.tipologia,
        griglia: { larghezze: l.larghezze, altezze: l.altezze, griglia: l.griglia },
      })),
      categoria.nome
    )
  }

  const refresh = () => router.refresh()

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      {/* Header categoria */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <IconaCategoria icona={categoria.icona} size="md" />
          <span className="font-semibold text-gray-900">{categoria.nome}</span>
          <Badge variant="secondary" className="ml-1 text-xs">
            {localListini.length} listini
          </Badge>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            title="Esporta tutti i listini CSV"
            disabled={localListini.length === 0}
            onClick={handleExportAllCsv}
          >
            <FolderDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Duplica categoria"
            disabled={copying}
            onClick={handleDuplicaCategoria}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setEditCatOpen(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-400 hover:text-red-600"
            onClick={() => setDeleteCatId(categoria.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="Importa più listini da file"
            className="ml-1"
            onClick={() => setImportMultiploOpen(true)}
          >
            <FolderInput className="h-4 w-4 mr-1" />
            Importa
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-1"
            onClick={() => setNewListinoOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Listino
          </Button>
        </div>
      </div>

      {/* Listini */}
      {expanded && (
        <div className="border-t divide-y">
          {localListini.length === 0 && (
            <p className="px-6 py-4 text-sm text-gray-400 italic">
              Nessun listino in questa categoria.
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localListini.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {localListini.map((listino) => (
                <SortableListinoRow
                  key={listino.id}
                  listino={listino}
                  isExpanded={expandedListini.has(listino.id)}
                  copying={copying}
                  onToggle={toggleListino}
                  onEdit={setEditingListino}
                  onDelete={setDeletingListinoId}
                  onDuplica={handleDuplicaListino}
                  onExportCsv={handleExportCsv}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Dialog importa multiplo */}
      <DialogImportaMultiplo
        open={importMultiploOpen}
        onOpenChange={setImportMultiploOpen}
        categoriaId={categoria.id}
        onSuccess={refresh}
      />

      {/* Dialog edit categoria */}
      <DialogCategoria
        open={editCatOpen}
        onOpenChange={setEditCatOpen}
        categoria={categoria}
        onSuccess={refresh}
      />

      {/* Dialog nuovo listino */}
      <DialogListino
        open={newListinoOpen}
        onOpenChange={setNewListinoOpen}
        categoriaId={categoria.id}
        onSuccess={refresh}
      />

      {/* Dialog edit listino */}
      {editingListino && (
        <DialogListino
          open={!!editingListino}
          onOpenChange={(open) => !open && setEditingListino(null)}
          categoriaId={categoria.id}
          listino={editingListino}
          onSuccess={refresh}
        />
      )}

      {/* AlertDialog elimina categoria */}
      <AlertDialog
        open={!!deleteCatId}
        onOpenChange={(open) => !open && setDeleteCatId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la categoria &quot;{categoria.nome}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati anche tutti i listini e le finiture contenuti in questa
              categoria. L&apos;operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategoria}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog elimina listino */}
      <AlertDialog
        open={!!deletingListinoId}
        onOpenChange={(open) => !open && setDeletingListinoId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo listino?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati anche la griglia prezzi e le finiture associate.
              I preventivi già creati non vengono modificati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteListino}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
