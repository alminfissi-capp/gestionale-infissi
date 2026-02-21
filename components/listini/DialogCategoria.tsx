'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createCategoria, updateCategoria } from '@/actions/listini'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Categoria } from '@/types/listino'

const EMOJIS = [
  '📂','🪟','🚪','🏠','🏗️','🔩','🪵','🏢',
  '🛡️','🌿','🔳','⬛','🎯','🏘️','🏛️','💡',
  '🔆','🔵','🟦','✅','🔶','🔷','🟩','🟥',
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoria?: Categoria
  onSuccess: () => void
}

export default function DialogCategoria({ open, onOpenChange, categoria, onSuccess }: Props) {
  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [icona, setIcona] = useState(categoria?.icona ?? '📂')
  const [saving, setSaving] = useState(false)

  // Reset state when dialog opens
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setNome(categoria?.nome ?? '')
      setIcona(categoria?.icona ?? '📂')
    }
    onOpenChange(val)
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error('Inserisci il nome della categoria')
      return
    }
    setSaving(true)
    try {
      if (categoria) {
        await updateCategoria(categoria.id, { nome: nome.trim(), icona })
        toast.success('Categoria aggiornata')
      } else {
        await createCategoria({ nome: nome.trim(), icona })
        toast.success('Categoria creata')
      }
      onSuccess()
      onOpenChange(false)
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{categoria ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="es. Finestre PVC"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Icona</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcona(emoji)}
                  className={`text-xl w-9 h-9 rounded-md border transition-colors ${
                    icona === emoji
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 text-sm text-gray-500">
            <span className="text-2xl">{icona}</span>
            <span>{nome || 'Nuova categoria'}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : categoria ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
