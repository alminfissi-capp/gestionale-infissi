'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Table2,
} from 'lucide-react'
import { deleteCategoria, deleteListino } from '@/actions/listini'
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
import IconaCategoria from './IconaCategoria'
import type { CategoriaConListini, ListinoCompleto } from '@/types/listino'

interface Props {
  categoria: CategoriaConListini
}

export default function CategoriaCard({ categoria }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(true)
  const [expandedListini, setExpandedListini] = useState<Set<string>>(new Set())

  // Dialogs categorie
  const [editCatOpen, setEditCatOpen] = useState(false)
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)

  // Dialogs listini
  const [newListinoOpen, setNewListinoOpen] = useState(false)
  const [editingListino, setEditingListino] = useState<ListinoCompleto | null>(null)
  const [deletingListinoId, setDeletingListinoId] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)

  const toggleListino = (id: string) => {
    setExpandedListini((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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
            {categoria.listini.length} listini
          </Badge>
        </button>

        <div className="flex items-center gap-1 shrink-0">
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
          {categoria.listini.length === 0 && (
            <p className="px-6 py-4 text-sm text-gray-400 italic">
              Nessun listino in questa categoria.
            </p>
          )}

          {categoria.listini.map((listino) => {
            const isExpanded = expandedListini.has(listino.id)
            return (
              <div key={listino.id} className="bg-gray-50/50">
                {/* Row listino */}
                <div className="flex items-center gap-3 px-6 py-3">
                  <button
                    onClick={() => toggleListino(listino.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    <Table2 className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-800 text-sm">
                      {listino.tipologia}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      {listino.altezze.length}H × {listino.larghezze.length}L
                      {listino.finiture.length > 0 && ` · ${listino.finiture.length} finiture`}
                    </span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingListino(listino)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => setDeletingListinoId(listino.id)}
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
          })}
        </div>
      )}

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
            <AlertDialogTitle>Eliminare la categoria "{categoria.nome}"?</AlertDialogTitle>
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
