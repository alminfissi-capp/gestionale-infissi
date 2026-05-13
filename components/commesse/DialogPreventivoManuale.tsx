'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2, FileText, Eye, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import {
  addDocumentoCommessa,
  deleteDocumentoCommessa,
  getDocumentoCommessaUrl,
  getOrgIdPerUpload,
} from '@/actions/commesse'
import type { DocumentoCommessa } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessaId: string
  clienteNome: string
  numeroPrev: string | null
  documenti: DocumentoCommessa[]
}

export default function DialogPreventivoManuale({
  open,
  onOpenChange,
  commessaId,
  clienteNome,
  numeroPrev,
  documenti,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})

  const prevDocs = documenti.filter((d) => d.tipo_documento === 'preventivo')

  // Pre-carica gli URL firmati all'apertura
  useEffect(() => {
    if (!open || prevDocs.length === 0) return
    let cancelled = false
    const load = async () => {
      const map: Record<string, string> = {}
      await Promise.all(
        prevDocs.map(async (doc) => {
          try {
            map[doc.id] = await getDocumentoCommessaUrl(doc.storage_path)
          } catch { /* ignora */ }
        })
      )
      if (!cancelled) setUrlMap(map)
    }
    load()
    return () => { cancelled = true }
  }, [open, documenti]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`"${file.name}" troppo grande (max 20 MB)`)
        continue
      }
      setUploading(true)
      try {
        const orgId = await getOrgIdPerUpload()
        const ext = file.name.split('.').pop() ?? 'bin'
        const storagePath = `${orgId}/${commessaId}/prev_${Date.now()}.${ext}`
        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from('commesse-docs')
          .upload(storagePath, file)
        if (uploadError) throw uploadError
        await addDocumentoCommessa(commessaId, file.name, storagePath, 'preventivo')
        toast.success(`"${file.name}" caricato`)
        router.refresh()
      } catch {
        toast.error(`Errore nel caricamento di "${file.name}"`)
      } finally {
        setUploading(false)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (doc: DocumentoCommessa) => {
    if (!confirm(`Eliminare "${doc.nome_file}"?`)) return
    setDeletingId(doc.id)
    try {
      await deleteDocumentoCommessa(doc.id, doc.storage_path)
      toast.success('File eliminato')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeletingId(null)
    }
  }

  const handleShare = async (doc: DocumentoCommessa) => {
    const url = urlMap[doc.id]
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({ title: doc.nome_file, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copiato negli appunti (valido 1 ora)')
      }
    } catch { /* annullato dall'utente */ }
  }

  const formatData = (d: string) => new Date(d).toLocaleDateString('it-IT')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            PDF Preventivo — {clienteNome}
            {numeroPrev && <span className="font-normal text-gray-500 ml-1">({numeroPrev})</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Lista file */}
        {prevDocs.length > 0 ? (
          <div className="space-y-2">
            {prevDocs.map((doc) => {
              const url = urlMap[doc.id]
              return (
                <div key={doc.id} className="flex items-center gap-2 rounded-md border p-2.5 bg-gray-50">
                  <FileText className="h-4 w-4 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.nome_file}</p>
                    <p className="text-xs text-gray-400">{formatData(doc.created_at)}</p>
                  </div>
                  {/* Visualizza — vero <a> tag, nessun popup blocker */}
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-blue-600 hover:bg-accent transition-colors"
                      title="Visualizza"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="inline-flex items-center justify-center h-7 w-7 text-gray-200" title="Caricamento...">
                      <Eye className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:text-teal-600"
                    onClick={() => handleShare(doc)}
                    disabled={!url}
                    title="Condividi / copia link"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-600"
                    disabled={deletingId === doc.id}
                    onClick={() => handleDelete(doc)}
                    title="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-3">
            Nessun PDF caricato per questo preventivo
          </p>
        )}

        <hr />

        {/* Upload */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Caricamento...' : 'Carica PDF preventivo'}
          </Button>
          <p className="text-xs text-gray-400 text-center">PDF o immagini · max 20 MB · più file contemporaneamente</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
