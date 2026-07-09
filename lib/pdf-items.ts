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
