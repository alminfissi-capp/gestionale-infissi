'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createSezioneAnonima, renameSezioneAnonima } from '@/actions/vendite-anonime'
import type { SezioneAnonima } from '@/types/commessa'

interface Props {
  gruppoId: string
  /** null = creazione di una sezione nuova */
  sezione: SezioneAnonima | null
  onClose: () => void
}

/**
 * Il componente si monta e si smonta a ogni apertura (il genitore lo rende solo
 * quando serve): lo stato del form parte pulito senza un useEffect che lo azzeri.
 */
export default function DialogSezioneAnonima({ gruppoId, sezione, onClose }: Props) {
  const router = useRouter()
  const [nome, setNome] = useState(sezione?.nome ?? '')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const pulito = nome.trim()
    if (!pulito) {
      toast.error('Scrivi un nome per la sezione')
      return
    }
    setLoading(true)
    try {
      if (sezione) await renameSezioneAnonima(sezione.id, pulito)
      else await createSezioneAnonima(gruppoId, pulito)
      toast.success(sezione ? 'Sezione rinominata' : 'Sezione creata')
      onClose()
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {sezione ? 'Rinomina sezione' : 'Nuova sezione commesse anonime'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sez-nome">Nome</Label>
            <Input
              id="sez-nome"
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              placeholder="eBay, Sito, Fiere..."
            />
            <p className="text-xs text-gray-500">
              Le vendite di questa sezione risulteranno intestate a questo nome.
            </p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : sezione ? 'Rinomina' : 'Crea sezione'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
