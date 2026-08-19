// components/calendario/AvvisaCliente.tsx
'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getRecapitiAppuntamento, inviaEmailAppuntamento, registraAvvisoWhatsapp,
} from '@/actions/calendario'

const formattaQuando = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

/** Numero in forma internazionale per wa.me: solo cifre, prefisso 39 se manca. */
function numeroWhatsapp(telefono: string): string {
  const cifre = telefono.replace(/\D/g, '')
  if (cifre.startsWith('00')) return cifre.slice(2)
  if (cifre.startsWith('39')) return cifre
  return `39${cifre}`
}

/**
 * Avvisi al cliente di un appuntamento: sempre a comando, mai automatici.
 * Vive solo dentro il dialog di un evento gia' salvato, perche' serve l'id.
 */
export default function AvvisaCliente({ eventoId }: { eventoId: string }) {
  const [caricamento, setCaricamento] = useState(true)
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [emailAt, setEmailAt] = useState<string | null>(null)
  const [whatsappAt, setWhatsappAt] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  useEffect(() => {
    let vivo = true
    getRecapitiAppuntamento(eventoId)
      .then((r) => {
        if (!vivo) return
        setEmail(r.email ?? '')
        setTelefono(r.telefono ?? '')
        setMessaggio(r.messaggio)
        setEmailAt(r.avvisato_email_at)
        setWhatsappAt(r.avvisato_whatsapp_at)
      })
      .catch(() => {
        if (vivo) toast.error('Recapiti non recuperati')
      })
      .finally(() => {
        if (vivo) setCaricamento(false)
      })
    return () => { vivo = false }
  }, [eventoId])

  const handleEmail = async () => {
    setInvio(true)
    try {
      await inviaEmailAppuntamento(eventoId, email)
      setEmailAt(new Date().toISOString())
      toast.success('Email inviata')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nell’invio')
    } finally {
      setInvio(false)
    }
  }

  // Link vero e non window.open: nella PWA installata (display standalone) le
  // finestre aperte da codice vengono bloccate in silenzio, e il pulsante
  // sembrava non fare niente.
  const linkWhatsapp = telefono.trim()
    ? `https://wa.me/${numeroWhatsapp(telefono)}?text=${encodeURIComponent(messaggio)}`
    : null

  const registraWhatsapp = async () => {
    try {
      await registraAvvisoWhatsapp(eventoId)
      setWhatsappAt(new Date().toISOString())
    } catch {
      // Il messaggio e' partito lo stesso: qui si perde solo la data.
      toast.error('WhatsApp aperto, ma la data dell’avviso non è stata salvata')
    }
  }

  if (caricamento) {
    return (
      <div className="flex items-center gap-2 border-t border-gray-200 pt-3 text-sm text-gray-500 dark:border-gray-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        Recapiti…
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Avvisa il cliente
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor="avviso-email">Email</Label>
          <Input
            id="avviso-email"
            type="email"
            value={email}
            placeholder="cliente@esempio.it"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button
          type="button" variant="outline" size="sm"
          disabled={invio || !email.trim()}
          onClick={handleEmail}
        >
          <Mail className="mr-1 h-4 w-4" />
          Invia email
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label htmlFor="avviso-telefono">Telefono</Label>
          <Input
            id="avviso-telefono"
            value={telefono}
            placeholder="333 1234567"
            onChange={(e) => setTelefono(e.target.value)}
          />
        </div>
        {linkWhatsapp ? (
          <Button asChild variant="outline" size="sm">
            <a
              href={linkWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { void registraWhatsapp() }}
            >
              <MessageCircle className="mr-1 h-4 w-4" />
              WhatsApp
            </a>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            <MessageCircle className="mr-1 h-4 w-4" />
            WhatsApp
          </Button>
        )}
      </div>

      <p className="whitespace-pre-line rounded-md bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {messaggio}
      </p>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {emailAt ? `Email inviata il ${formattaQuando(emailAt)}.` : 'Nessuna email inviata.'}{' '}
        {whatsappAt ? `WhatsApp il ${formattaQuando(whatsappAt)}.` : 'Nessun avviso WhatsApp.'}
      </p>
    </div>
  )
}
