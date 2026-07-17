'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  uploadDocumentoProduzione, deleteDocumentoProduzione, getDocumentoSignedUrl,
} from '@/actions/produzione-documenti'
import { TIPI_DOCUMENTO_PRODUZIONE } from '@/types/produzione'
import type { DocumentoCommessa } from '@/types/commessa'

interface Props {
  commessaId: string
  documenti: DocumentoCommessa[]
}

const labelTipo = (v: string) => TIPI_DOCUMENTO_PRODUZIONE.find((t) => t.value === v)?.label ?? v

export default function DocumentiProduzione({ commessaId, documenti }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState('disegno')
  const [caricamento, setCaricamento] = useState(false)

  const carica = async (file: File) => {
    setCaricamento(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('commessaId', commessaId)
      formData.append('tipo', tipo)
      const { error } = await uploadDocumentoProduzione(formData)
      if (error) toast.error(error)
      else {
        toast.success('Documento caricato')
        router.refresh()
      }
    } finally {
      setCaricamento(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const apri = async (storagePath: string) => {
    const url = await getDocumentoSignedUrl(storagePath)
    if (url) window.open(url, '_blank')
    else toast.error('Impossibile aprire il file')
  }

  const elimina = async (id: string, storagePath: string) => {
    if (!confirm('Eliminare questo documento?')) return
    try {
      await deleteDocumentoProduzione(id, storagePath)
      toast.success('Documento eliminato')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Documenti di produzione
        </h2>
        <div className="flex items-center gap-2">
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPI_DOCUMENTO_PRODUZIONE.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            ref={inputRef}
            id="upload-produzione"
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) carica(file)
            }}
          />
          <Button asChild size="sm" variant="outline" disabled={caricamento}>
            <label htmlFor="upload-produzione" className="cursor-pointer gap-2">
              <Upload className="h-4 w-4" />
              {caricamento ? 'Caricamento...' : 'Carica'}
            </label>
          </Button>
        </div>
      </div>

      {documenti.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
          Nessun documento di produzione.
        </p>
      ) : (
        <div className="space-y-1.5">
          {documenti.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2.5"
            >
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <button
                onClick={() => apri(d.storage_path)}
                className="min-w-0 flex-1 text-left text-sm text-blue-700 dark:text-blue-400 hover:underline truncate"
              >
                {d.nome_file}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {labelTipo(d.tipo_documento)}
              </span>
              <Button
                variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 shrink-0"
                onClick={() => elimina(d.id, d.storage_path)} aria-label="Elimina"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
