// Utility client-side: parse PDF costi WinStudio → voci preventivo
// Chiamare solo da componenti client (usa API browser: canvas, FileReader)

export type VocePdf = {
  voceNum: number
  tipologia: string
  dimensione: string
  quantita: number
  imponibileUnitario: number
  lavorazione: number
  posainopera: number
  aliquotaIva: number
  immagineBlob: Blob | null
}

function parseNum(s: string | undefined): number {
  if (!s) return 0
  // Formato italiano: 1.737,30 → 1737.30
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

function buildText(items: { str: string; hasEOL?: boolean }[]): string {
  let text = ''
  for (const item of items) {
    text += item.str
    if (item.hasEOL) text += '\n'
    else text += ' '
  }
  return text
}

function parsePageText(text: string): Omit<VocePdf, 'immagineBlob'> | null {
  const voceMatch = text.match(/Costi Totali per Voce (\d+)/)
  if (!voceMatch) return null

  const tipologia = text.match(/Tipologia\s+(.+)/m)?.[1]?.trim() ?? ''
  const numStrutture = parseInt(text.match(/Num\.\s*strutture\s+(\d+)/m)?.[1] ?? '1')
  const dimensione = text.match(/Dimensione\s+(\d+x\d+)/m)?.[1] ?? ''
  const lavorazione = parseNum(text.match(/Lavorazione\s+([\d.,]+)/m)?.[1])
  const posainopera = parseNum(text.match(/Posa in opera\s+([\d.,]+)/m)?.[1])
  const imponibile = parseNum(text.match(/Imponibile netto\s+([\d.,]+)/m)?.[1])
  const iva = parseInt(text.match(/IVA\s+[\d.,]+\s+[\d.,]+\s+(\d+)\s*%/m)?.[1] ?? '10')

  return {
    voceNum: parseInt(voceMatch[1]),
    tipologia,
    dimensione,
    quantita: numStrutture,
    imponibileUnitario: imponibile,
    lavorazione,
    posainopera,
    aliquotaIva: iva,
  }
}

async function imageObjToBlob(img: unknown): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (img instanceof ImageBitmap) {
    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)
  } else if (img && typeof img === 'object' && 'data' in img && 'width' in img && 'height' in img) {
    const i = img as { data: Uint8ClampedArray; width: number; height: number }
    canvas.width = i.width
    canvas.height = i.height
    const imgData = ctx.createImageData(i.width, i.height)
    imgData.data.set(i.data)
    ctx.putImageData(imgData, 0, 0)
  } else {
    return null
  }

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  )
}

function getImgSize(img: unknown): { w: number; h: number } {
  if (img instanceof ImageBitmap) return { w: img.width, h: img.height }
  if (img && typeof img === 'object' && 'width' in img && 'height' in img) {
    return { w: (img as { width: number; height: number }).width, h: (img as { width: number; height: number }).height }
  }
  return { w: 0, h: 0 }
}

async function extractWindowImage(page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>; objs: { get: (name: string, cb: (v: unknown) => void) => void } }): Promise<Blob | null> {
  try {
    const pdfjs = await import('pdfjs-dist')
    const paintOp: number = pdfjs.OPS?.paintImageXObject ?? 85

    const ops = await page.getOperatorList()
    const seen = new Set<string>()
    const names: string[] = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === paintOp) {
        const name = ops.argsArray[i]?.[0] as string
        if (name && !seen.has(name)) { seen.add(name); names.push(name) }
      }
    }

    for (const name of names) {
      const img: unknown = await new Promise((res) => page.objs.get(name, res))
      const { w, h } = getImgSize(img)
      // La finestra è sempre 300×300; i loghi hanno dimensioni diverse
      if (w !== 300 || h !== 300) continue
      return imageObjToBlob(img)
    }
  } catch (e) {
    console.warn('[parsePdfCosti] estrazione immagine fallita:', e)
  }
  return null
}

export async function parsePdfCosti(file: File): Promise<VocePdf[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const voci: VocePdf[] = []

  // Le pagine dati sono le dispari (1-indexed: 1,3,5,...); le pari sono note/legend
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 2) {
    const page = await pdf.getPage(pageNum)
    const tc = await page.getTextContent()
    const text = buildText(tc.items as { str: string; hasEOL?: boolean }[])
    const parsed = parsePageText(text)
    if (!parsed) continue
    const immagineBlob = await extractWindowImage(page as Parameters<typeof extractWindowImage>[0])
    voci.push({ ...parsed, immagineBlob })
  }

  return voci
}
