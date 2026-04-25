'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DialogCategoriaMagazzino from './DialogCategoriaMagazzino'
import { deleteCategoriaMagazzino } from '@/actions/magazzino'
import type { CategoriaMagazzino, TipoCategoriaMagazzino } from '@/types/magazzino'

interface Props {
  categorie: CategoriaMagazzino[]
  tipo: TipoCategoriaMagazzino
}

export default function TabellaCategorieMagazzino({ categorie, tipo }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CategoriaMagazzino | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (c: CategoriaMagazzino) => { setEditing(c); setDialogOpen(true) }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteCategoriaMagazzino(deletingId)
      toast.success('Sottocategoria eliminata')
      router.refresh()
    } catch {
      toast.error('Impossibile eliminare: la sottocategoria è usata da dei prodotti')
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova sottocategoria
        </Button>
      </div>

      {categorie.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Nessuna sottocategoria. Creane una per poter assegnare i prodotti.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Ord.</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorie.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm text-gray-400">{c.ordine}</TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Modifica
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={() => setDeletingId(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogCategoriaMagazzino
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categoria={editing}
        defaultTipo={tipo}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina sottocategoria</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro? I prodotti associati perderanno la sottocategoria.
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
