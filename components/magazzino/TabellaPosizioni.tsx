'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createPosizione, updatePosizione, deletePosizione } from '@/actions/magazzino'
import type { PosizioneMagazzino, PosizioneInput } from '@/types/magazzino'

interface Props {
  posizioni: PosizioneMagazzino[]
}

const empty = (): PosizioneInput => ({ nome: '', descrizione: '' })

export default function TabellaPosizioni({ posizioni }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PosizioneMagazzino | null>(null)
  const [form, setForm] = useState<PosizioneInput>(empty())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const openCreate = () => { setEditing(null); setForm(empty()); setDialogOpen(true) }
  const openEdit = (p: PosizioneMagazzino) => {
    setEditing(p)
    setForm({ nome: p.nome, descrizione: p.descrizione ?? '' })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Il nome è obbligatorio'); return }
    setLoading(true)
    try {
      if (editing) {
        await updatePosizione(editing.id, form)
        toast.success('Posizione aggiornata')
      } else {
        await createPosizione(form)
        toast.success('Posizione creata')
      }
      setDialogOpen(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setLoading(true)
    try {
      await deletePosizione(deletingId)
      toast.success('Posizione eliminata')
      router.refresh()
    } catch {
      toast.error('Impossibile eliminare: posizione in uso')
    } finally {
      setLoading(false)
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">Posizioni / Scaffalature</p>
          <p className="text-xs text-gray-500 mt-0.5">Definisci dove sono fisicamente i prodotti in magazzino</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova posizione
        </Button>
      </div>

      {posizioni.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Nessuna posizione definita</p>
      ) : (
        <div className="rounded-md border divide-y">
          {posizioni.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="font-medium text-sm">{p.nome}</p>
                {p.descrizione && <p className="text-xs text-gray-400">{p.descrizione}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:text-red-700"
                onClick={() => setDeletingId(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifica posizione' : 'Nuova posizione'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pos-nome">Nome *</Label>
              <Input
                id="pos-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Es. Scaffale A1, Magazzino est."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-desc">Descrizione</Label>
              <Input
                id="pos-desc"
                value={form.descrizione ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
                placeholder="Note opzionali"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvataggio...' : editing ? 'Salva' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina posizione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro? I prodotti assegnati a questa posizione rimarranno senza posizione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={loading}>
              {loading ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
