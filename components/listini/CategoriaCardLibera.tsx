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
  Copy,
  Package,
} from 'lucide-react'
import {
  deleteCategoria,
  deleteListinoLibero,
  duplicaListinoLibero,
  duplicaCategoriaLibera,
} from '@/actions/listini'
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
import DialogCategoria from './DialogCategoria'
import DialogListinoLibero from './DialogListinoLibero'
import IconaCategoria from './IconaCategoria'
import { formatEuro } from '@/lib/pricing'
import type { CategoriaConListini, ListinoLiberoCompleto } from '@/types/listino'

interface Props {
  categoria: CategoriaConListini
  dragHandle?: React.ReactNode
  onSuccess?: () => void
}

export default function CategoriaCardLibera({ categoria, dragHandle, onSuccess }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [expandedListini, setExpandedListini] = useState<Set<string>>(new Set())

  // Dialogs categoria
  const [editCatOpen, setEditCatOpen] = useState(false)
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)

  // Dialogs listino libero
  const [newListinoOpen, setNewListinoOpen] = useState(false)
  const [editingListino, setEditingListino] = useState<ListinoLiberoCompleto | null>(null)
  const [deletingListinoId, setDeletingListinoId] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)

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
      refresh()
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
      await deleteListinoLibero(deletingListinoId)
      toast.success('Listino eliminato')
      refresh()
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
      await duplicaListinoLibero(listinoId)
      toast.success('Listino duplicato')
      refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    } finally {
      setCopying(false)
    }
  }

  const handleDuplicaCategoria = async () => {
    setCopying(true)
    try {
      await duplicaCategoriaLibera(categoria.id)
      toast.success('Categoria duplicata')
      refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    } finally {
      setCopying(false)
    }
  }

  const refresh = () => { router.refresh(); onSuccess?.() }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      {/* Header categoria */}
      <div className="flex items-center gap-3 p-4">
        {dragHandle}
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
            {categoria.listini_liberi.length} listini
          </Badge>
          <Badge variant="outline" className="text-xs text-teal-600 border-teal-200">
            catalogo
          </Badge>
        </button>

        <div className="flex items-center gap-1 shrink-0">
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
            className="ml-1"
            onClick={() => setNewListinoOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Listino
          </Button>
        </div>
      </div>

      {/* Listini liberi */}
      {expanded && (
        <div className="border-t divide-y">
          {categoria.listini_liberi.length === 0 && (
            <p className="px-6 py-4 text-sm text-gray-400 italic">
              Nessun listino in questa categoria.
            </p>
          )}

          {categoria.listini_liberi.map((ll) => {
            const isExpanded = expandedListini.has(ll.id)
            return (
              <div key={ll.id} className="bg-gray-50/50">
                {/* Row listino */}
                <div className="flex items-center gap-3 px-6 py-3">
                  <button
                    onClick={() => toggleListino(ll.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    <Package className="h-4 w-4 text-teal-500 shrink-0" />
                    <span className="font-medium text-gray-800 text-sm">{ll.tipologia}</span>
                    <span className="text-xs text-gray-400 ml-1">
                      {ll.prodotti.length} prodotti · {ll.accessori.length} accessori
                    </span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Duplica listino"
                      disabled={copying}
                      onClick={() => handleDuplicaListino(ll.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingListino(ll)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => setDeletingListinoId(ll.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Dettaglio espanso */}
                {isExpanded && (
                  <div className="px-6 pb-4 space-y-3">
                    {/* Prodotti */}
                    {ll.prodotti.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Prodotti</p>
                        <div className="rounded-md border bg-white overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-12"></th>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Nome</th>
                                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Descrizione</th>
                                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Prezzo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {ll.prodotti.map((p) => (
                                <tr key={p.id} className="hover:bg-gray-50/50">
                                  <td className="px-3 py-2">
                                    {p.immagine_url ? (
                                      <img
                                        src={p.immagine_url}
                                        alt={p.nome}
                                        className="h-8 w-10 rounded object-cover border border-gray-200"
                                      />
                                    ) : (
                                      <div className="h-8 w-10 rounded border border-gray-200 bg-gray-100 flex items-center justify-center">
                                        <Package className="h-4 w-4 text-gray-300" />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-medium text-gray-800">{p.nome}</td>
                                  <td className="px-3 py-2 text-gray-400 text-xs">{p.descrizione ?? '—'}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-700">
                                    € {formatEuro(p.prezzo)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Accessori */}
                    {ll.accessori.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Accessori</p>
                        <div className="flex flex-wrap gap-2">
                          {ll.accessori.map((a) => (
                            <Badge key={a.id} variant="outline" className="text-xs">
                              {a.nome} — € {formatEuro(a.prezzo)}
                            </Badge>
                          ))}
                        </div>
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

      {/* Dialog nuovo listino libero */}
      <DialogListinoLibero
        open={newListinoOpen}
        onOpenChange={setNewListinoOpen}
        categoriaId={categoria.id}
        onSuccess={refresh}
      />

      {/* Dialog edit listino libero */}
      {editingListino && (
        <DialogListinoLibero
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
              Verranno eliminati tutti i listini, prodotti e accessori contenuti in questa
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
              Verranno eliminati i prodotti e gli accessori associati.
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
