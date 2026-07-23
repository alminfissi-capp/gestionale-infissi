'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2, FileText, Eye, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  uploadDocumentoCommessa,
  deleteDocumentoCommessa,
  getDocumentoCommessaUrl,
} from '@/actions/commesse'
import type { DocumentoCommessa } from '@/types/commessa'

const TIPI = ['fattura', 'nota di credito', 'bolla', 'contratto', 'altro']

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessaId: string
  clienteNome: string
  documenti: DocumentoCommessa[]
}

export default function DialogDocumenti({ open, onOpenChange, commessaId, clienteNome, documenti }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState('fattura')
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})

  // Pre-carica gli URL firmati all'apertura del dialog
  useEffect(() => {
    if (!open || documenti.length === 0) return
    let cancelled = false
    const load = async () => {
      const map: Record<string, string> = {}
      await Promise.all(
        documenti.map(async (doc) => {
          try {
            map[doc.id] = await getDocumentoCommessaUrl(doc.storage_path)
          } catch { /* ignora */ }
        })
      )
      if (!cancelled) setUrlMap(map)
    }
    load()
    return () => { cancelled = true }
  }, [open, documenti])

  const caricaFile = async (file: File): Promise<string | null> => {
    // Su iOS i file da cloud (Dropbox/iCloud) sono lazy — arrayBuffer() forza la lettura completa
    const buffer = await file.arrayBuffer()
    const mimeFromExt: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', webp: 'image/webp',
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const contentType = (file.type && file.type !== 'application/octet-stream')
      ? file.type
      : (mimeFromExt[ext] ?? 'application/octet-stream')
    const blob = new Blob([buffer], { type: contentType })
    const fd = new FormData()
    fd.append('file', blob, file.name)
    fd.append('commessaId', commessaId)
    fd.append('tipo', tipo)
    const result = await uploadDocumentoCommessa(fd)
    return result.error ?? null
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    let caricati = 0
    try {
      // Carica in sequenza, nell'ordine di selezione (primo → ultimo).
      for (const file of Array.from(files)) {
        try {
          const error = await caricaFile(file)
          if (error) toast.error(`${file.name}: ${error}`)
          else caricati++
        } catch (err) {
          console.error('Upload error:', err)
          toast.error(`${file.name}: errore nel caricamento`)
        }
      }
      if (caricati > 0) {
        toast.success(caricati === 1 ? 'Documento caricato' : `${caricati} documenti caricati`)
        router.refresh()
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (doc: DocumentoCommessa) => {
    if (!confirm(`Eliminare "${doc.nome_file}"?`)) return
    setDeletingId(doc.id)
    try {
      await deleteDocumentoCommessa(doc.id, doc.storage_path)
      toast.success('Documento eliminato')
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
          <DialogTitle>Documenti — {clienteNome}</DialogTitle>
        </DialogHeader>

        {/* Lista documenti */}
        {documenti.length > 0 ? (
          <div className="space-y-2">
            {documenti.map((doc) => {
              const url = urlMap[doc.id]
              return (
                <div key={doc.id} className="flex items-center gap-2 rounded-md border p-2.5 bg-gray-50">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.nome_file}</p>
                    <p className="text-xs text-gray-400">
                      {doc.tipo_documento} · {formatData(doc.created_at)}
                    </p>
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
          <p className="text-sm text-gray-400 text-center py-2">Nessun documento allegato</p>
        )}

        <hr />

        {/* Upload */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Carica documento</p>
          <div className="space-y-1">
            <Label>Tipo documento</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input
            ref={fileInputRef}
            id="doc-upload"
            type="file"
            multiple
            accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleUpload}
          />
          {uploading ? (
            <Button type="button" variant="outline" className="w-full" disabled>
              <Upload className="h-4 w-4 mr-2" />
              Caricamento...
            </Button>
          ) : (
            <Button variant="outline" className="w-full" asChild>
              <label htmlFor="doc-upload" className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                Seleziona file (uno o più)
              </label>
            </Button>
          )}
          <p className="text-xs text-gray-400 text-center">Max 20 MB</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
