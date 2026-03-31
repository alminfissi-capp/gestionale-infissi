'use client'

import { useState, useTransition } from 'react'
import { Mail, Paperclip, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { PreventivoCompleto } from '@/types/preventivo'

interface Props {
  open: boolean
  onClose: () => void
  preventivo: PreventivoCompleto
  nomeCliente: string
}

export default function DialogInvioEmail({ open, onClose, preventivo: p, nomeCliente }: Props) {
  const router = useRouter()
  const [isSending, startSending] = useTransition()

  const defaultOggetto   = p.numero ? `Preventivo n. ${p.numero}` : 'Preventivo'
  const defaultMessaggio = p.numero
    ? `Gentile ${nomeCliente},\n\nle inviamo in allegato il preventivo n. ${p.numero}.\n\nRimanendo a disposizione per qualsiasi informazione,\ncordiamo saluti.`
    : `Gentile ${nomeCliente},\n\nle inviamo in allegato il preventivo richiesto.\n\nRimanendo a disposizione per qualsiasi informazione,\ncordiamo saluti.`

  const [destinatario, setDestinatario] = useState(p.cliente_snapshot.email || '')
  const [oggetto,      setOggetto]      = useState(defaultOggetto)
  const [messaggio,    setMessaggio]    = useState(defaultMessaggio)

  const filenameLabel = p.numero ? `preventivo-${p.numero}.pdf` : 'preventivo.pdf'

  const handleInvia = () => {
    if (!destinatario.trim()) {
      toast.error('Inserire un indirizzo email')
      return
    }
    startSending(async () => {
      try {
        const res = await fetch(`/api/preventivi/${p.id}/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinatario, oggetto, messaggio }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Errore durante l\'invio')
        }
        toast.success('Email inviata con successo')
        router.refresh()
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Errore durante l\'invio')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSending) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invia preventivo via email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">A</Label>
            <Input
              id="email-to"
              type="email"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="email@cliente.it"
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-oggetto">Oggetto</Label>
            <Input
              id="email-oggetto"
              value={oggetto}
              onChange={(e) => setOggetto(e.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-messaggio">Messaggio</Label>
            <textarea
              id="email-messaggio"
              className="w-full min-h-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-50"
              value={messaggio}
              onChange={(e) => setMessaggio(e.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border/50">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span>{filenameLabel}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Annulla
          </Button>
          <Button onClick={handleInvia} disabled={isSending || !destinatario.trim()}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Invio in corso…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Invia email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
