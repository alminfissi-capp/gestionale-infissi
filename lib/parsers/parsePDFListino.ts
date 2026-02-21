// Eseguito solo lato client (browser)

export async function parsePDFToText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let fullText = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // Raggruppa elementi per riga (basandosi sulla coordinata Y)
    type TextItem = { str: string; transform: number[] }
    const items = content.items as TextItem[]

    // Ordina per Y decrescente (alto → basso), poi X crescente (sx → dx)
    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]
      if (Math.abs(yDiff) > 3) return yDiff
      return a.transform[4] - b.transform[4]
    })

    let lastY = -1
    let lineText = ''

    for (const item of sorted) {
      const y = Math.round(item.transform[5])
      if (lastY !== -1 && Math.abs(y - lastY) > 3) {
        fullText += lineText.trim() + '\n'
        lineText = ''
      }
      lineText += item.str + '\t'
      lastY = y
    }
    if (lineText.trim()) fullText += lineText.trim() + '\n'
    fullText += '\n'
  }

  return fullText.trim()
}

// Converte il testo estratto da PDF in formato CSV
export function pdfTextToCSV(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  return lines
    .map((line) => {
      // Sostituisce tab e spazi multipli con punto e virgola
      const cells = line.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean)
      return cells.join(';')
    })
    .join('\n')
}
