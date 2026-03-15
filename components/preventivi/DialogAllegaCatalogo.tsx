'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { getCataloghi } from '@/actions/cataloghi'
import { setCatalogoAllegato } from '@/actions/preventivi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Catalogo } from '@/types/catalogo'

// ─── Miniatura PDF ────────────────────────────────────────────────────────────

function PdfThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 0.5 })
        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
      } catch {
        if (!cancelled) setError(true)
      }
    }
    render()
    return () => { cancelled = true }
  }, [url])

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-gray-400">
        <FileText className="h-8 w-8" />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-contain"
      style={{ display: 'block' }}
    />
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  preventivoId: string
  catalogoCorrenteId: string | null
}

export default function DialogAllegaCatalogo({ open, onClose, preventivoId, catalogoCorrenteId }: Props) {
  const router = useRouter()
  const [cataloghi, setCataloghi] = useState<Catalogo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(catalogoCorrenteId)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setSelectedId(catalogoCorrenteId)
    setLoading(true)
    getCataloghi().then((data) => {
      setCataloghi(data)
      setLoading(false)
    })
  }, [open, catalogoCorrenteId])

  function handleConferma() {
    startTransition(async () => {
      try {
        await setCatalogoAllegato(preventivoId, selectedId)
        toast.success(selectedId ? 'Catalogo allegato' : 'Allegato rimosso')
        router.refresh()
        onClose()
      } catch {
        toast.error('Errore durante il salvataggio')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Allega catalogo / brochure
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Caricamento...
          </div>
        ) : cataloghi.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Nessun catalogo disponibile. Caricane uno dalla sezione Cataloghi.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              Seleziona il catalogo da allegare all&apos;ultima pagina della stampa.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto py-1">
              {cataloghi.map((c) => {
                const isSelected = selectedId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(isSelected ? null : c.id)}
                    className={`rounded-lg border-2 p-2 text-left transition-colors focus:outline-none ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="aspect-[3/4] bg-gray-100 rounded mb-2 overflow-hidden">
                      <PdfThumbnail url={c.url} />
                    </div>
                    <p className="text-xs font-medium text-gray-700 truncate">{c.nome}</p>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-2">
          {selectedId && selectedId === catalogoCorrenteId ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setSelectedId(null)}
            >
              <X className="h-4 w-4 mr-1" />
              Rimuovi allegato
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Annulla
            </Button>
            <Button onClick={handleConferma} disabled={isPending || loading}>
              {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Conferma
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
