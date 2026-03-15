'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  url: string
  nome: string
}

interface PageCanvas {
  dataUrl: string
  width: number
  height: number
}

export default function AllegatoCatalogoPdf({ url, nome }: Props) {
  const [pages, setPages] = useState<PageCanvas[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const rendered = useRef(false)

  useEffect(() => {
    if (rendered.current) return
    rendered.current = true

    async function renderAll() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise
        const results: PageCanvas[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          results.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: viewport.width, height: viewport.height })
        }
        setPages(results)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    renderAll()
  }, [url])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-gray-400 print:hidden">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Caricamento catalogo allegato...</span>
      </div>
    )
  }

  if (error || pages.length === 0) return null

  return (
    <div style={{ pageBreakBefore: 'always' }}>
      {pages.map((p, i) => (
        <div
          key={i}
          style={{
            pageBreakBefore: i > 0 ? 'always' : undefined,
            pageBreakInside: 'avoid',
            margin: 0,
            padding: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.dataUrl}
            alt={`${nome} — pagina ${i + 1}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      ))}
    </div>
  )
}
