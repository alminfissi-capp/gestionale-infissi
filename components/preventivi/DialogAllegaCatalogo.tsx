'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, FileText, Loader2, Paperclip } from 'lucide-react'
import { getCataloghi } from '@/actions/cataloghi'
import { setCataloghiAllegati } from '@/actions/preventivi'
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
  correnti: string[]
}

export default function DialogAllegaCatalogo({ open, onClose, preventivoId, correnti }: Props) {
  const router = useRouter()
  const [cataloghi, setCataloghi] = useState<Catalogo[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(correnti))
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setSelected(new Set(correnti))
    setLoading(true)
    getCataloghi().then((data) => {
      setCataloghi(data)
      setLoading(false)
    })
  }, [open, correnti])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConferma() {
    startTransition(async () => {
      try {
        await setCataloghiAllegati(preventivoId, [...selected])
        const n = selected.size
        toast.success(n === 0 ? 'Allegati rimossi' : `${n} catalogo${n > 1 ? 'hi' : ''} allegato${n > 1 ? 'i' : ''}`)
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
            Allega cataloghi / brochure
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
              Seleziona uno o più cataloghi da allegare all&apos;ultima pagina della stampa.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto py-1">
              {cataloghi.map((c) => {
                const isSelected = selected.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`relative rounded-lg border-2 p-2 text-left transition-colors focus:outline-none ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 bg-blue-500 text-white rounded-full p-0.5">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <div className="aspect-[3/4] bg-gray-100 rounded mb-2 overflow-hidden">
                      <PdfThumbnail url={c.url} />
                    </div>
                    <p className="text-xs font-medium text-gray-700 truncate">{c.nome}</p>
                  </button>
                )
              })}
            </div>
            {selected.size > 0 && (
              <p className="text-xs text-blue-600 font-medium">
                {selected.size} selezionato{selected.size > 1 ? 'i' : ''}
              </p>
            )}
          </>
        )}

        <div className="flex items-center justify-between pt-2">
          {selected.size > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setSelected(new Set())}
            >
              Deseleziona tutti
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
