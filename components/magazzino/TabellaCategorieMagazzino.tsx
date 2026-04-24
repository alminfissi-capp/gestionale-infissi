'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DialogCategoriaMagazzino from './DialogCategoriaMagazzino'
import { deleteCategoriaMagazzino } from '@/actions/magazzino'
import type { CategoriaMagazzino } from '@/types/magazzino'
import { TIPO_CATEGORIA_LABELS } from '@/types/magazzino'

const TIPO_COLORS: Record<string, string> = {
  alluminio: 'bg-blue-100 text-blue-700 border-blue-200',
  ferro: 'bg-gray-100 text-gray-700 border-gray-200',
  accessori: 'bg-purple-100 text-purple-700 border-purple-200',
  pannelli: 'bg-green-100 text-green-700 border-green-200',
  chimici: 'bg-orange-100 text-orange-700 border-orange-200',
}

interface Props {
  categorie: CategoriaMagazzino[]
}

export default function TabellaCategorieMagazzino({ categorie }: Props) {
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
      toast.success('Categoria eliminata')
      router.refresh()
    } catch {
      toast.error('Impossibile eliminare: la categoria è usata da dei prodotti')
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
          Nuova categoria
        </Button>
      </div>

      {categorie.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Nessuna categoria. Crea la prima per poter assegnare i prodotti.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Ord.</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorie.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm text-gray-400">{c.ordine}</TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <Badge className={`${TIPO_COLORS[c.tipo]} hover:${TIPO_COLORS[c.tipo]}`}>
                      {TIPO_CATEGORIA_LABELS[c.tipo]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
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
      />

      <AlertDialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina categoria</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro? I prodotti associati perderanno la categoria.
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
