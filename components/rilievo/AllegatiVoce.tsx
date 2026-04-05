'use client'

import { useState, useEffect, useTransition } from 'react'
import { Camera, FileText, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  getAllegatiVoce,
  uploadAllegatoVoce,
  deleteAllegatoVoce,
  getSignedUrlAllegato,
  type AllegatoVoce,
} from '@/actions/rilievo-allegati'

interface Props {
  voceId: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mimeType: string | null): boolean {
  return !!mimeType?.startsWith('image/')
}

export default function AllegatiVoce({ voceId }: Props) {
  const [allegati, setAllegati] = useState<AllegatoVoce[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setLoading(true)
    getAllegatiVoce(voceId)
      .then(setAllegati)
      .catch(() => toast.error('Errore caricamento allegati'))
      .finally(() => setLoading(false))
  }, [voceId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    e.target.value = ''
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('voceId', voceId)
        const allegato = await uploadAllegatoVoce(formData)
        setAllegati((prev) => [...prev, allegato])
      }
      toast.success('File caricato')
    } catch {
      toast.error('Errore durante il caricamento')
    } finally {
      setUploading(false)
    }
  }

  const handleOpen = async (allegato: AllegatoVoce) => {
    setOpeningId(allegato.id)
    try {
      const url = await getSignedUrlAllegato(allegato.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Impossibile aprire il file')
    } finally {
      setOpeningId(null)
    }
  }

  const handleDelete = (allegato: AllegatoVoce) => {
    setDeletingId(allegato.id)
    startTransition(async () => {
      try {
        await deleteAllegatoVoce(allegato.id, allegato.storage_path)
        setAllegati((prev) => prev.filter((a) => a.id !== allegato.id))
        toast.success('File eliminato')
      } catch {
        toast.error('Errore eliminazione')
      } finally {
        setDeletingId(null)
      }
    })
  }

  return (
    <div className="space-y-2">
      {/* Label wrappa l'input — garantisce gesture diretta su tutti i browser/mobile */}
      <label className={cn(
        'flex items-center justify-center gap-2 w-full rounded-lg border px-3 py-2.5 text-sm transition-colors select-none',
        uploading
          ? 'border-gray-200 text-gray-300 cursor-not-allowed pointer-events-none'
          : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer'
      )}>
        {uploading
          ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Caricamento…</span></>
          : <><Camera className="h-4 w-4" /><span>Foto / PDF</span></>
        }
        {/* Input dentro il label — nessun .click() programmativo necessario */}
        <input
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={handleFileChange}
        />
      </label>

      {/* Lista allegati */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1 pl-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Caricamento…</span>
        </div>
      )}

      {!loading && allegati.length > 0 && (
        <div className="space-y-1">
          {allegati.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 group">
              {isImage(a.mime_type)
                ? <Camera className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                : <FileText className="h-3.5 w-3.5 text-red-400 shrink-0" />
              }
              <button
                type="button"
                onClick={() => handleOpen(a)}
                disabled={openingId === a.id}
                className="flex-1 text-left text-xs text-gray-700 hover:text-blue-600 truncate transition-colors"
                title={a.nome_file}
              >
                {openingId === a.id
                  ? <span className="text-gray-400">Apertura…</span>
                  : <span className="flex items-center gap-1">{a.nome_file}<ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 shrink-0" /></span>
                }
              </button>
              {a.dimensione && (
                <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(a.dimensione)}</span>
              )}
              <button
                type="button"
                onClick={() => handleDelete(a)}
                disabled={deletingId === a.id}
                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                title="Elimina"
              >
                {deletingId === a.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
