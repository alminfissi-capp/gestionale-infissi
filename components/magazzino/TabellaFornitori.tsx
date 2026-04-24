'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, Phone, Mail, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DialogFornitore from './DialogFornitore'
import { deleteFornitore } from '@/actions/magazzino'
import type { Fornitore } from '@/types/magazzino'

interface Props {
  fornitori: Fornitore[]
}

export default function TabellaFornitori({ fornitori }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Fornitore | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return fornitori
    return fornitori.filter((f) =>
      [f.nome, f.partita_iva, f.telefono, f.email].some((v) => v?.toLowerCase().includes(q))
    )
  }, [fornitori, search])

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (f: Fornitore) => { setEditing(f); setDialogOpen(true) }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteFornitore(deletingId)
      toast.success('Fornitore eliminato')
      router.refresh()
    } catch {
      toast.error('Impossibile eliminare: il fornitore è collegato a dei movimenti')
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Cerca fornitore..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuovo fornitore
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {search ? 'Nessun risultato' : 'Nessun fornitore. Crea il primo.'}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>P. IVA</TableHead>
                <TableHead>Contatti</TableHead>
                <TableHead>Indirizzo</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="text-sm text-gray-600">{f.partita_iva || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-sm text-gray-600">
                      {f.telefono && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />{f.telefono}
                        </span>
                      )}
                      {f.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />{f.email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {f.indirizzo ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />{f.indirizzo}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeletingId(f.id)}
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

      <DialogFornitore
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fornitore={editing}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina fornitore</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro? L&apos;operazione non è reversibile.
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
