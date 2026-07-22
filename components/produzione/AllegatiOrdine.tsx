'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getAllegatiOrdine, uploadAllegatiOrdine, deleteAllegatoOrdine,
} from '@/actions/produzione-allegati'
import { getDocumentoSignedUrl } from '@/actions/produzione-documenti'
import type { AllegatoOrdine } from '@/types/produzione'

interface Props {
  ordineId: string
}

const isImmagine = (a: AllegatoOrdine) => (a.content_type ?? '').startsWith('image/')

export default function AllegatiOrdine({ ordineId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [allegati, setAllegati] = useState<AllegatoOrdine[]>([])
  const [caricamento, setCaricamento] = useState(false)

  const ricarica = useCallback(() => {
    getAllegatiOrdine(ordineId).then(setAllegati).catch(() => setAllegati([]))
  }, [ordineId])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  const carica = async (files: FileList) => {
    setCaricamento(true)
    try {
      const fd = new FormData()
      fd.append('ordineId', ordineId)
      Array.from(files).forEach((f) => fd.append('files', f))
      const { error } = await uploadAllegatiOrdine(fd)
      if (error) toast.error(error)
      else {
        toast.success('Allegati caricati')
        ricarica()
      }
    } finally {
      setCaricamento(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const apri = async (path: string) => {
    const url = await getDocumentoSignedUrl(path)
    if (url) window.open(url, '_blank')
    else toast.error('Impossibile aprire il file')
  }

  const elimina = async (id: string, path: string) => {
    if (!confirm('Eliminare questo allegato?')) return
    try {
      await deleteAllegatoOrdine(id, path)
      toast.success('Allegato eliminato')
      ricarica()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`allegati-ordine-${ordineId}`}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) carica(files)
        }}
      />
      <Button asChild size="sm" variant="outline" disabled={caricamento}>
        <label htmlFor={`allegati-ordine-${ordineId}`} className="cursor-pointer gap-2">
          <Upload className="h-4 w-4" />
          {caricamento ? 'Caricamento...' : 'Aggiungi allegati'}
        </label>
      </Button>

      {allegati.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nessun allegato.</p>
      ) : (
        <div className="space-y-1.5">
          {allegati.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2.5"
            >
              {isImmagine(a) ? (
                <ImageIcon className="h-4 w-4 text-gray-400 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => apri(a.storage_path)}
                className="min-w-0 flex-1 text-left text-sm text-blue-700 dark:text-blue-400 hover:underline truncate"
              >
                {a.nome_file}
              </button>
              <Button
                type="button"
                variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 shrink-0"
                onClick={() => elimina(a.id, a.storage_path)} aria-label="Elimina allegato"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
