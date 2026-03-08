'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { deleteCliente } from '@/actions/clienti'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import FormCliente from './FormCliente'
import type { Cliente } from '@/types/cliente'

interface Props {
  clienti: Cliente[]
}

export default function TabellaClienti({ clienti }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return clienti
    return clienti.filter((c) =>
      [c.ragione_sociale, c.nome, c.cognome, c.telefono, c.email, c.cf_piva].some((f) =>
        f?.toLowerCase().includes(q)
      )
    )
  }, [clienti, search])

  const openCreate = () => {
    setEditingCliente(null)
    setDialogOpen(true)
  }

  const openEdit = (cliente: Cliente) => {
    setEditingCliente(cliente)
    setDialogOpen(true)
  }

  const handleSuccess = () => {
    setDialogOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteCliente(deletingId)
      toast.success('Cliente eliminato')
      router.refresh()
    } catch {
      toast.error('Errore nella cancellazione del cliente')
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  const nomeCompleto = (c: Cliente) => {
    if (c.tipo === 'azienda') return c.ragione_sociale || '—'
    return [c.nome, c.cognome].filter(Boolean).join(' ') || '—'
  }

  return (
    <div className="space-y-4">
      {/* Barra ricerca + nuovo */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca per nome, telefono, email, CF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nuovo cliente
        </Button>
      </div>

      {/* Tabella */}
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Cantiere</TableHead>
              <TableHead>CF / P.IVA</TableHead>
              <TableHead className="w-24 text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                  {search
                    ? 'Nessun cliente trovato per questa ricerca.'
                    : 'Nessun cliente ancora. Creane uno!'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cliente) => (
                <TableRow key={cliente.id}>
                  <TableCell className="font-medium">{nomeCompleto(cliente)}</TableCell>
                  <TableCell className="text-gray-600">{cliente.telefono || '—'}</TableCell>
                  <TableCell className="text-gray-600">{cliente.email || '—'}</TableCell>
                  <TableCell className="text-gray-600">{cliente.cantiere || '—'}</TableCell>
                  <TableCell className="text-gray-600">{cliente.cf_piva || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(cliente)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeletingId(cliente.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCliente ? 'Modifica cliente' : 'Nuovo cliente'}
            </DialogTitle>
          </DialogHeader>
          <FormCliente cliente={editingCliente ?? undefined} onSuccess={handleSuccess} />
        </DialogContent>
      </Dialog>

      {/* AlertDialog eliminazione */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;operazione è irreversibile. I preventivi associati non verranno
              eliminati ma perderanno il riferimento al cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
