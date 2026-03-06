'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Upload, Pencil, Check, Trash2, ChevronUp, ChevronDown, FileText, Loader2, X, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentOrgId } from '@/actions/listini'
import { createCatalogo, deleteCatalogo, reorderCataloghi } from '@/actions/cataloghi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
        const viewport = page.getViewport({ scale: 0.6 })
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
      <div className="flex flex-col items-center justify-center w-full h-full text-gray-400">
        <FileText className="h-10 w-10 mb-1" />
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

// ─── Viewer PDF (overlay fullscreen) ─────────────────────────────────────────

function PdfViewer({ url, nome, onClose }: { url: string; nome: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-white text-sm font-medium truncate flex-1">{nome}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-white underline shrink-0"
        >
          Apri in nuova scheda
        </a>
      </div>
      {/* PDF iframe */}
      <iframe
        src={`${url}#toolbar=1`}
        className="flex-1 w-full border-0"
        title={nome}
      />
    </div>
  )
}

// ─── Card catalogo ────────────────────────────────────────────────────────────

interface CardProps {
  catalogo: Catalogo
  editMode: boolean
  isFirst: boolean
  isLast: boolean
  onView: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  deleting: boolean
}

function CatalogoCard({
  catalogo, editMode, isFirst, isLast, onView, onDelete, onMoveUp, onMoveDown, deleting,
}: CardProps) {
  return (
    <div className="relative flex flex-col rounded-xl border bg-white shadow-sm overflow-hidden select-none">
      {/* Anteprima PDF */}
      <button
        className="block w-full bg-gray-50 overflow-hidden"
        style={{ height: 180 }}
        onClick={editMode ? undefined : onView}
        disabled={editMode}
        aria-label={`Apri ${catalogo.nome}`}
      >
        <PdfThumbnail url={catalogo.url} />
      </button>

      {/* Nome */}
      <div className="px-3 py-2">
        <p className="text-xs font-medium text-gray-800 truncate">{catalogo.nome}</p>
      </div>

      {/* Overlay edit mode */}
      {editMode && (
        <div className="absolute inset-0 bg-black/20 flex flex-col">
          {/* Pulsante elimina in alto a destra */}
          <div className="flex justify-end p-2">
            <button
              onClick={onDelete}
              disabled={deleting}
              className="h-8 w-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow active:bg-red-700"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>

          {/* Frecce riordino in basso */}
          <div className="mt-auto flex justify-center gap-3 p-2">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="h-8 w-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center shadow disabled:opacity-30 active:bg-gray-100"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="h-8 w-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center shadow disabled:opacity-30 active:bg-gray-100"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pagina principale ────────────────────────────────────────────────────────

interface Props {
  initialCataloghi: Catalogo[]
}

export default function PaginaCataloghi({ initialCataloghi }: Props) {
  const router = useRouter()
  const [cataloghi, setCataloghi] = useState<Catalogo[]>(initialCataloghi)
  const [editMode, setEditMode] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewingCatalogo, setViewingCatalogo] = useState<Catalogo | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Puoi caricare solo file PDF')
      return
    }
    setUploading(true)
    try {
      const orgId = await getCurrentOrgId()
      const supabase = createClient()
      const fileName = `${orgId}/${crypto.randomUUID()}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('cataloghi-brochure')
        .upload(fileName, file, { contentType: 'application/pdf', upsert: false })
      if (uploadErr) throw uploadErr

      const nome = file.name.replace(/\.pdf$/i, '')
      await createCatalogo(nome, fileName)
      toast.success('Catalogo caricato')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore durante il caricamento')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [router])

  const handleDelete = useCallback(async (catalogo: Catalogo) => {
    setDeletingId(catalogo.id)
    try {
      await deleteCatalogo(catalogo.id, catalogo.storage_path)
      setCataloghi((prev) => prev.filter((c) => c.id !== catalogo.id))
      toast.success('Catalogo eliminato')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore durante l\'eliminazione')
    } finally {
      setDeletingId(null)
    }
  }, [])

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setCataloghi((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  const handleDone = useCallback(async () => {
    setSavingOrder(true)
    try {
      await reorderCataloghi(cataloghi.map((c) => c.id))
      setEditMode(false)
      router.refresh()
    } catch {
      toast.error('Errore durante il salvataggio dell\'ordine')
    } finally {
      setSavingOrder(false)
    }
  }, [cataloghi, router])

  // Aggiorna quando cambiano i dati dal server (dopo router.refresh)
  useEffect(() => {
    setCataloghi(initialCataloghi)
  }, [initialCataloghi])

  const cataloghiFiltrati = search.trim()
    ? cataloghi.filter((c) => c.nome.toLowerCase().includes(search.toLowerCase().trim()))
    : cataloghi

  return (
    <>
      {/* Viewer PDF fullscreen */}
      {viewingCatalogo && (
        <PdfViewer
          url={viewingCatalogo.url}
          nome={viewingCatalogo.nome}
          onClose={() => setViewingCatalogo(null)}
        />
      )}

      <div className="space-y-4">
        {/* Header + azioni */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 shrink-0">Cataloghi e Brochure</h1>
          {!editMode && cataloghi.length > 0 && (
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cerca catalogo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {!editMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  Carica
                </Button>
                {cataloghi.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(true)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Modifica
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleDone}
                disabled={savingOrder}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {savingOrder ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Fatto
              </Button>
            )}
          </div>
        </div>

        {/* Input file nascosto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUpload(file)
          }}
        />

        {/* Griglia cataloghi */}
        {cataloghi.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
            <FileText className="h-12 w-12" />
            <p className="text-base font-medium">Nessun catalogo caricato</p>
            <p className="text-sm text-center">Premi &quot;Carica&quot; per aggiungere un PDF</p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              Carica il primo catalogo
            </Button>
          </div>
        ) : cataloghiFiltrati.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-2">
            <Search className="h-8 w-8" />
            <p className="text-sm">Nessun risultato per &quot;{search}&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cataloghiFiltrati.map((c, i) => (
              <CatalogoCard
                key={c.id}
                catalogo={c}
                editMode={editMode}
                isFirst={i === 0}
                isLast={i === cataloghiFiltrati.length - 1}
                onView={() => setViewingCatalogo(c)}
                onDelete={() => handleDelete(c)}
                onMoveUp={() => moveItem(cataloghi.indexOf(c), -1)}
                onMoveDown={() => moveItem(cataloghi.indexOf(c), 1)}
                deleting={deletingId === c.id}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
