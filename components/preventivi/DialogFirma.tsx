'use client'

import { useRef, useState, useTransition } from 'react'
import { FileSignature, Upload, Copy, MessageCircle, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { richiediFirmaPreventivo } from '@/actions/firma'
import type { ClienteSnapshot } from '@/types/preventivo'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  preventivoId: string
  numero: string | null
  clienteSnapshot: ClienteSnapshot
  onSuccess: (signingUrl: string) => void
}

export default function DialogFirma({ open, onOpenChange, preventivoId, numero, clienteSnapshot: s, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [email, setEmail] = useState(s.email || '')
  const [telefono, setTelefono] = useState(s.telefono || '')
  const [isPending, startTransition] = useTransition()
  const [signingUrl, setSigningUrl] = useState<string | null>(null)

  const nomeCliente =
    s.tipo === 'azienda'
      ? s.ragione_sociale || ''
      : [s.nome, s.cognome].filter(Boolean).join(' ')

  const whatsappUrl = telefono
    ? (() => {
        const digits = telefono.replace(/\D/g, '')
        const number = telefono.startsWith('+') ? digits : `39${digits}`
        const testo = `Gentile ${nomeCliente}, la invitiamo a firmare elettronicamente il preventivo${numero ? ` n. ${numero}` : ''}. Clicchi sul link per procedere: ${signingUrl}`
        return `https://wa.me/${number}?text=${encodeURIComponent(testo)}`
      })()
    : null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setFileName(file?.name ?? null)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error('Seleziona il PDF del preventivo')
      return
    }
    if (!email && !telefono) {
      toast.error('Inserisci almeno email o telefono del cliente')
      return
    }
    if (!telefono) {
      toast.error('Il numero di cellulare è obbligatorio per l\'OTP SMS')
      return
    }

    const formData = new FormData()
    formData.append('pdf', file)
    formData.append('email', email)
    formData.append('telefono', telefono)

    startTransition(async () => {
      try {
        const { signingUrl: url } = await richiediFirmaPreventivo(preventivoId, formData)
        setSigningUrl(url)
        onSuccess(url)
        toast.success('Richiesta firma inviata')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Errore nella richiesta firma')
      }
    })
  }

  const handleCopyUrl = () => {
    if (!signingUrl) return
    navigator.clipboard.writeText(signingUrl)
    toast.success('Link copiato negli appunti')
  }

  const handleClose = () => {
    if (!isPending) {
      onOpenChange(false)
      // reset
      setTimeout(() => {
        setSigningUrl(null)
        setFileName(null)
        setEmail(s.email || '')
        setTelefono(s.telefono || '')
        if (fileRef.current) fileRef.current.value = ''
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-blue-600" />
            Richiedi firma elettronica
          </DialogTitle>
          <DialogDescription>
            Il cliente riceverà un SMS con codice OTP per autenticarsi e firmare il preventivo.
          </DialogDescription>
        </DialogHeader>

        {signingUrl ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">Richiesta inviata con successo</p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">Link di firma da inviare al cliente:</p>
              <code className="block text-xs bg-gray-50 border rounded p-2 break-all text-gray-600">
                {signingUrl}
              </code>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={handleCopyUrl}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copia link
              </Button>
              {whatsappUrl && (
                <Button size="sm" variant="outline" className="flex-1 text-green-700 border-green-300 hover:bg-green-50" asChild>
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3.5 w-3.5 mr-1" />
                    WhatsApp
                  </a>
                </Button>
              )}
            </div>

            <p className="text-xs text-gray-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Lo stato del preventivo si aggiornerà automaticamente alla firma.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* PDF upload */}
            <div className="space-y-2">
              <Label>PDF del preventivo *</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                {fileName ? (
                  <p className="text-sm text-gray-700 font-medium truncate">{fileName}</p>
                ) : (
                  <p className="text-sm text-gray-400">Clicca per selezionare il PDF stampato</p>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs text-gray-400">
                Vai su <strong>Stampa</strong> → salva come PDF → caricalo qui.
              </p>
            </div>

            {/* Contatti firmatario */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Contatti firmatario</Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-gray-500">Cellulare * (riceve OTP SMS)</Label>
                  <Input
                    value={telefono}
                    onChange={e => setTelefono(e.target.value)}
                    placeholder="+39 333 123 4567"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Email (per invio copia firmata)</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="cliente@example.com"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  <FileSignature className="h-4 w-4 mr-2" />
                  Richiedi firma
                </>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
