'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Copy, Ruler } from 'lucide-react'
import Image from 'next/image'
import { deleteCategoria, deleteListinoSuMisura, duplicaListinoSuMisura } from '@/actions/listini'
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
import DialogListinoSuMisura from './DialogListinoSuMisura'
import IconaCategoria from './IconaCategoria'
import { formatEuro } from '@/lib/pricing'
import type { CategoriaConListini, ListinoSuMisuraCompleto } from '@/types/listino'

interface Props {
  categoria: CategoriaConListini
  dragHandle?: React.ReactNode
  onSuccess?: () => void
}

export default function CategoriaCardSuMisura({ categoria, dragHandle, onSuccess }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [editCatOpen, setEditCatOpen] = useState(false)
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)
  const [newListinoOpen, setNewListinoOpen] = useState(false)
  const [editingListino, setEditingListino] = useState<ListinoSuMisuraCompleto | null>(null)
  const [deletingListinoId, setDeletingListinoId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)

  const refresh = () => { router.refresh(); onSuccess?.() }

  const listini = categoria.listini_su_misura ?? []

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

  const handleDuplicaListino = async (id: string) => {
    setCopying(true)
    try {
      await duplicaListinoSuMisura(id)
      toast.success('Prodotto duplicato')
      refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    } finally {
      setCopying(false)
    }
  }

  const handleDeleteListino = async () => {
    if (!deletingListinoId) return
    setDeleting(true)
    try {
      await deleteListinoSuMisura(deletingListinoId)
      toast.success('Prodotto eliminato')
      refresh()
    } catch {
      toast.error('Errore nella cancellazione')
    } finally {
      setDeleting(false)
      setDeletingListinoId(null)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header categoria */}
      <div className="flex items-center gap-3 p-4">
        {dragHandle}
        <button type="button" onClick={() => setExpanded((p) => !p)} className="text-gray-400 hover:text-gray-600 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <IconaCategoria icona={categoria.icona} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{categoria.nome}</span>
            <Badge variant="outline" className="text-violet-600 border-violet-200 bg-violet-50 text-xs shrink-0">
              <Ruler className="h-3 w-3 mr-1" />Su misura
            </Badge>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{listini.length} prodott{listini.length === 1 ? 'o' : 'i'}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setNewListinoOpen(true)} className="text-violet-600 hover:text-violet-700 hover:bg-violet-50">
            <Plus className="h-4 w-4 mr-1" /> Prodotto
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setEditCatOpen(true)} className="h-8 w-8 text-gray-400 hover:text-gray-600">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteCatId(categoria.id)} className="h-8 w-8 text-red-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Lista prodotti */}
      {expanded && (
        <div className="border-t border-gray-100">
          {listini.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              Nessun prodotto — clicca &quot;Prodotto&quot; per aggiungerne uno
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {listini.map((lsm) => (
                <div key={lsm.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  {lsm.immagine_url ? (
                    <Image
                      src={lsm.immagine_url}
                      alt={lsm.nome}
                      width={40}
                      height={40}
                      className="rounded object-cover border border-gray-200 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded border border-gray-100 bg-gray-50 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{lsm.nome}</span>
                      {!lsm.attivo && <Badge variant="outline" className="text-xs text-gray-400">Disattivo</Badge>}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                      <span>{formatEuro(lsm.prezzo_mq)} €/mq</span>
                      {lsm.larghezza_max < 9999 && <span>L {lsm.larghezza_min}–{lsm.larghezza_max} mm</span>}
                      {lsm.altezza_max < 9999 && <span>H {lsm.altezza_min}–{lsm.altezza_max} mm</span>}
                      {lsm.mq_minimo > 0 && <span>min {lsm.mq_minimo} mq</span>}
                      {lsm.finiture.length > 0 && <span>{lsm.finiture.length} finitur{lsm.finiture.length === 1 ? 'a' : 'e'}</span>}
                      {lsm.gruppi_accessori.length > 0 && <span>{lsm.gruppi_accessori.reduce((s, g) => s + g.accessori.length, 0)} accessori</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => handleDuplicaListino(lsm.id)} disabled={copying} title="Duplica">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => setEditingListino(lsm)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setDeletingListinoId(lsm.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <DialogCategoria open={editCatOpen} onOpenChange={setEditCatOpen} categoria={categoria} onSuccess={() => { refresh(); setEditCatOpen(false) }} />
      <DialogListinoSuMisura open={newListinoOpen} onOpenChange={setNewListinoOpen} categoriaId={categoria.id} onSuccess={() => { refresh(); setNewListinoOpen(false) }} />
      {editingListino && (
        <DialogListinoSuMisura
          open={!!editingListino}
          onOpenChange={(v) => { if (!v) setEditingListino(null) }}
          categoriaId={categoria.id}
          listino={editingListino}
          onSuccess={() => { refresh(); setEditingListino(null) }}
        />
      )}

      {/* Alert delete categoria */}
      <AlertDialog open={!!deleteCatId} onOpenChange={(v) => { if (!v) setDeleteCatId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina categoria</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <strong>{categoria.nome}</strong> e tutti i suoi prodotti. L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategoria} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert delete listino */}
      <AlertDialog open={!!deletingListinoId} onOpenChange={(v) => { if (!v) setDeletingListinoId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina prodotto</AlertDialogTitle>
            <AlertDialogDescription>
              Il prodotto verrà eliminato definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteListino} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
