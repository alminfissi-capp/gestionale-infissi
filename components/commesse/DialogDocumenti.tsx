'use client'

import { useState, useRef } from 'react'
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
import { createClient } from '@/lib/supabase/client'
import {
  addDocumentoCommessa,
  deleteDocumentoCommessa,
  getDocumentoCommessaUrl,
  getOrgIdPerUpload,
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File troppo grande (max 20 MB)')
      return
    }
    setUploading(true)
    try {
      const orgId = await getOrgIdPerUpload()
      const ext = file.name.split('.').pop() ?? 'bin'
      const storagePath = `${orgId}/${commessaId}/${Date.now()}.${ext}`
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('commesse-docs')
        .upload(storagePath, file)
      if (uploadError) throw uploadError
      await addDocumentoCommessa(commessaId, file.name, storagePath, tipo)
      toast.success('Documento caricato')
      router.refresh()
    } catch {
      toast.error('Errore nel caricamento')
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

  const handleView = async (doc: DocumentoCommessa) => {
    const tab = window.open('', '_blank')
    if (!tab) { toast.error('Popup bloccato dal browser'); return }
    try {
      const url = await getDocumentoCommessaUrl(doc.storage_path)
      tab.location.href = url
    } catch {
      tab.close()
      toast.error('Impossibile aprire il documento')
    }
  }

  const handleShare = async (doc: DocumentoCommessa) => {
    try {
      const url = await getDocumentoCommessaUrl(doc.storage_path)
      if (navigator.share) {
        await navigator.share({ title: doc.nome_file, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copiato negli appunti (valido 1 ora)')
      }
    } catch {
      toast.error('Impossibile condividere il documento')
    }
  }

  const formatData = (d: string) =>
    new Date(d).toLocaleDateString('it-IT')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Documenti — {clienteNome}</DialogTitle>
        </DialogHeader>

        {/* Lista documenti */}
        {documenti.length > 0 ? (
          <div className="space-y-2">
            {documenti.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 rounded-md border p-2.5 bg-gray-50">
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.nome_file}</p>
                  <p className="text-xs text-gray-400">
                    {doc.tipo_documento} · {formatData(doc.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-blue-600"
                  onClick={() => handleView(doc)}
                  title="Visualizza"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-teal-600"
                  onClick={() => handleShare(doc)}
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
            ))}
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
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
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
            {uploading ? 'Caricamento...' : 'Seleziona file (PDF, immagine)'}
          </Button>
          <p className="text-xs text-gray-400 text-center">Max 20 MB</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
