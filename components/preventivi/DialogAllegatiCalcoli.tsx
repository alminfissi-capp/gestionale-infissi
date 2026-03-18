'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentOrgId } from '@/actions/listini'
import { addAllegatoCalcoli, deleteAllegatoCalcoli } from '@/actions/allegati-calcoli'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AllegatoItem {
  id: string
  nome: string
  storage_path: string
  url: string
}

interface Props {
  open: boolean
  onClose: () => void
  preventivoId: string
  allegati: AllegatoItem[]
}

export default function DialogAllegatiCalcoli({ open, onClose, preventivoId, allegati }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Seleziona un file PDF')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Il file supera i 20 MB')
      return
    }

    setUploading(true)
    try {
      const orgId = await getCurrentOrgId()
      const supabase = createClient()
      const storagePath = `${orgId}/${preventivoId}/${crypto.randomUUID()}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('allegati-calcoli')
        .upload(storagePath, file, { contentType: 'application/pdf' })

      if (uploadError) throw new Error(uploadError.message)

      const nome = file.name.replace(/\.pdf$/i, '')
      await addAllegatoCalcoli(preventivoId, nome, storagePath)
      toast.success('PDF allegato')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore durante il caricamento')
    } finally {
      setUploading(false)
    }
  }

  function handleDelete(allegato: AllegatoItem) {
    setDeletingId(allegato.id)
    startTransition(async () => {
      try {
        await deleteAllegatoCalcoli(allegato.id, allegato.storage_path, preventivoId)
        toast.success('Allegato rimosso')
        router.refresh()
      } catch {
        toast.error('Errore durante la rimozione')
      } finally {
        setDeletingId(null)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Allegati calcoli interni
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 text-[12px] bg-amber-50 border border-amber-200 rounded px-3 py-2">
          I PDF allegati qui verranno inclusi nella stampa dei calcoli interni. Non sono visibili dal cliente.
        </p>

        {/* Lista allegati esistenti */}
        {allegati.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-4">Nessun allegato</p>
        ) : (
          <ul className="space-y-2">
            {allegati.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-red-500 shrink-0" />
                <span className="flex-1 truncate font-medium text-gray-700">{a.nome}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(a)}
                  disabled={isPending && deletingId === a.id}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  title="Rimuovi allegato"
                >
                  {isPending && deletingId === a.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Pulsante aggiungi */}
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Caricamento...</>
              : <><Plus className="h-4 w-4 mr-1.5" />Aggiungi PDF</>
            }
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Chiudi
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </DialogContent>
    </Dialog>
  )
}
