'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createGruppo, renameGruppo } from '@/actions/commesse'
import type { GruppoCommesse } from '@/types/commessa'

interface Props {
  open: boolean
  mode: 'create' | 'rename'
  gruppo: GruppoCommesse | null
  onClose: () => void
}

export default function DialogGruppo({ open, mode, gruppo, onClose }: Props) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setNome(mode === 'rename' && gruppo ? gruppo.nome : '')
  }, [open, mode, gruppo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setLoading(true)
    try {
      if (mode === 'create') {
        await createGruppo(nome.trim())
        toast.success('Blocco creato')
      } else if (gruppo) {
        await renameGruppo(gruppo.id, nome.trim())
        toast.success('Blocco rinominato')
      }
      router.refresh()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nuovo blocco' : 'Rinomina blocco'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <Label htmlFor="nome-gruppo">Nome</Label>
            <Input
              id="nome-gruppo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="es. 2025"
              className="mt-1"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={!nome.trim() || loading}>
              {mode === 'create' ? 'Crea' : 'Salva'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
