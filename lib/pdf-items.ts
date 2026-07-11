/**
 * Estrae, per ogni pagina di un PDF, gli item di testo con coordinate (client-side, pdfjs).
 * Solo browser: usa il worker copiato in public/ all'avvio.
 * Le coordinate servono ai parser che leggono moduli a griglia (buste paga).
 */
export interface PdfItem {
  str: string
  x: number
  y: number
}
export interface PdfPage {
  items: PdfItem[]
  text: string // item uniti da '\n', per i match testuali
}

export async function estraiItemsPagine(file: File): Promise<PdfPage[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pagine: PdfPage[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items: PdfItem[] = []
    for (const it of content.items) {
      if (!('str' in it)) continue
      const str = it.str.trim()
      if (!str) continue
      items.push({ str, x: it.transform[4], y: it.transform[5] })
    }
    pagine.push({ items, text: items.map((i) => i.str).join('\n') })
  }
  return pagine
}

/**
 * Renderizza le pagine di un PDF in immagini (data URL JPEG), per mostrare
 * un'anteprima leggibile delle buste scansionate quando non c'è testo estraibile.
 * Solo browser (usa document/canvas). `scale` 2 ≈ ~1200px su A4, leggibile su mobile.
 */
export async function renderPaginePdf(
  file: File,
  { scale = 2, maxPagine = 10 }: { scale?: number; maxPagine?: number } = {},
): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const urls: string[] = []
  const n = Math.min(pdf.numPages, maxPagine)
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    urls.push(canvas.toDataURL('image/jpeg', 0.85))
  }
  return urls
}
