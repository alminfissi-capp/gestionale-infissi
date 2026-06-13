'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Briefcase, CalendarClock } from 'lucide-react'
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
import type { GruppoCommesse, TipoBlocco } from '@/types/commessa'

interface Props {
  open: boolean
  mode: 'create' | 'rename'
  gruppo: GruppoCommesse | null
  initialTipo?: TipoBlocco
  onClose: () => void
}

export default function DialogGruppo({ open, mode, gruppo, initialTipo, onClose }: Props) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoBlocco>(initialTipo ?? 'commesse')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setNome(mode === 'rename' && gruppo ? gruppo.nome : '')
      setTipo(initialTipo ?? 'commesse')
    }
  }, [open, mode, gruppo, initialTipo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setLoading(true)
    try {
      if (mode === 'create') {
        await createGruppo(nome.trim(), tipo)
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
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? (
              tipo === 'scadenze' ? (
                <><CalendarClock className="h-5 w-5 text-rose-600" /> Nuovo blocco Scadenze</>
              ) : (
                <><Briefcase className="h-5 w-5 text-teal-600" /> Nuovo blocco Commesse</>
              )
            ) : (
              'Rinomina blocco'
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="nome-gruppo">Nome</Label>
              <Input
                id="nome-gruppo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. 2026"
                autoFocus
              />
              {mode === 'create' && (
                <p className="text-xs text-gray-400">
                  {tipo === 'scadenze'
                    ? 'Blocco scadenze fornitori: un anno con i 12 mesi al suo interno.'
                    : 'Blocco commesse: ordini confermati, acconti e documenti.'}
                </p>
              )}
            </div>
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
