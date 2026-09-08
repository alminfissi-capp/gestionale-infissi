// Utility client-side: parse PDF costi WinStudio → voci preventivo
// Chiamare solo da componenti client (usa API browser: canvas, FileReader)

export type VocePdf = {
  voceNum: number
  tipologia: string
  dimensione: string
  quantita: number
  imponibileUnitario: number
  materialeCosto: number
  lavorazione: number
  posainopera: number
  aliquotaIva: number
  immagineBlob: Blob | null
  profili: string
  trattEsterno: string
  trattInterno: string
  trattAccessori: string
  vetri: string
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

  // Estrai solo la sezione header (prima di "Costo materiali") per evitare falsi match
  const headerSection = text.split(/Costo\s+materiali/)[0]

  const tipologia = headerSection.match(/Tipologia\s+(.+)/m)?.[1]?.trim() ?? ''
  const numStrutture = parseInt(headerSection.match(/Num\.\s*strutture\s+(\d+)/m)?.[1] ?? '1')
  const dimensione = headerSection.match(/Dimensione\s+(\d+x\d+)/m)?.[1] ?? ''
  const profili = headerSection.match(/Profili\s+(.+)/m)?.[1]?.trim() ?? ''
  const trattEsterno = headerSection.match(/Tratt\.\s+sup\.\s+esterno\s+(.+)/m)?.[1]?.trim() ?? ''
  const trattInterno = headerSection.match(/Tratt\.\s+sup\.\s+interno\s+(.+)/m)?.[1]?.trim() ?? ''
  const trattAccessori = headerSection.match(/Tratt\.\s+accessori\s*(.*)/m)?.[1]?.trim() ?? ''
  const vetriHeader = headerSection.match(/Vetri\s+(.+)/m)?.[1]?.trim() ?? ''
  const pannelliHeader = headerSection.match(/Pannelli\s+(.+)/m)?.[1]?.trim() ?? ''
  const vetri = [vetriHeader, pannelliHeader].filter(Boolean).join(' | ')

  const lavorazione = parseNum(text.match(/Lavorazione\s+([\d.,]+)/m)?.[1])
  const posainopera = parseNum(text.match(/Posa in opera\s+([\d.,]+)/m)?.[1])
  const imponibile = parseNum(text.match(/Imponibile netto\s+([\d.,]+)/m)?.[1])
  const iva = parseInt(text.match(/IVA\s+[\d.,]+\s+[\d.,]+\s+(\d+)\s*%/m)?.[1] ?? '10')
  // Utile: prova formati "Utile 20% 345,60" o "Utile 345,60"
  const utileMatch = text.match(/Utile\s+[\d.,]+\s*%\s+([\d.,]+)/m)
    ?? text.match(/Utile\s+([\d.,]+)/m)
  const utile = parseNum(utileMatch?.[1])
  // Costo acquisto = tutto tranne mano d'opera e utile
  const materialeCosto = Math.max(0, imponibile - lavorazione - posainopera - utile)

  return {
    voceNum: parseInt(voceMatch[1]),
    tipologia,
    dimensione,
    quantita: numStrutture,
    imponibileUnitario: imponibile,
    materialeCosto,
    lavorazione,
    posainopera,
    aliquotaIva: iva,
    profili,
    trattEsterno,
    trattInterno,
    trattAccessori,
    vetri,
  }
}

function asImageBitmap(v: unknown): ImageBitmap | null {
  if (!v || typeof v !== 'object') return null
  // instanceof può fallire con SES/realm diversi — uso duck typing
  if (typeof (v as ImageBitmap).close === 'function' &&
      typeof (v as ImageBitmap).width === 'number' &&
      typeof (v as ImageBitmap).height === 'number') {
    return v as ImageBitmap
  }
  return null
}

async function imageObjToBlob(img: unknown): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // pdfjs v5: ImageBitmap diretto o nel campo .bitmap
  const bmp = asImageBitmap(img) ??
    (img && typeof img === 'object' ? asImageBitmap((img as Record<string, unknown>).bitmap) : null)

  if (bmp) {
    canvas.width = bmp.width
    canvas.height = bmp.height
    ctx.save()
    ctx.translate(0, bmp.height)
    ctx.scale(1, -1)
    ctx.drawImage(bmp, 0, 0)
    ctx.restore()
  } else if (img && typeof img === 'object') {
    const o = img as Record<string, unknown>
    if (o.data && typeof o.width === 'number' && typeof o.height === 'number') {
      // putImageData ignora i transform: disegno su canvas temp poi flippo
      const tmp = document.createElement('canvas')
      tmp.width = o.width
      tmp.height = o.height
      const tc = tmp.getContext('2d')
      if (!tc) return null
      const id = tc.createImageData(o.width, o.height)
      id.data.set(o.data as Uint8ClampedArray)
      tc.putImageData(id, 0, 0)
      canvas.width = o.width
      canvas.height = o.height
      ctx.save()
      ctx.translate(0, o.height)
      ctx.scale(1, -1)
      ctx.drawImage(tmp, 0, 0)
      ctx.restore()
    } else {
      return null
    }
  } else {
    return null
  }

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  )
}

function getImgSize(img: unknown): { w: number; h: number } {
  const bmp = asImageBitmap(img) ??
    (img && typeof img === 'object' ? asImageBitmap((img as Record<string, unknown>).bitmap) : null)
  if (bmp) return { w: bmp.width, h: bmp.height }
  if (img && typeof img === 'object') {
    const o = img as Record<string, unknown>
    if (typeof o.width === 'number' && typeof o.height === 'number') {
      return { w: o.width, h: o.height }
    }
  }
  return { w: 0, h: 0 }
}

type PdfObjStore = { get: (name: string, cb: (v: unknown) => void) => void }
type PdfPageLike = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  objs: PdfObjStore
  commonObjs?: PdfObjStore
}

// Timeout di sicurezza: objs.get() usa una callback che in alcuni casi non viene
// mai invocata. Senza timeout l'await resta appeso per sempre e l'importazione
// si blocca in silenzio.
const OBJ_TIMEOUT_MS = 15000

function getPdfObj(store: PdfObjStore, name: string): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[parsePdfCosti] timeout su immagine "${name}", la salto`)
      resolve(null)
    }, OBJ_TIMEOUT_MS)
    try {
      store.get(name, (v) => { clearTimeout(timer); resolve(v) })
    } catch (e) {
      clearTimeout(timer)
      console.warn(`[parsePdfCosti] errore su immagine "${name}":`, e)
      resolve(null)
    }
  })
}

async function extractWindowImage(page: PdfPageLike): Promise<Blob | null> {
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
      // pdf.js sposta in commonObjs le immagini riusate su più pagine e le
      // rinomina con il prefisso "g_": cercarle in page.objs non le trova mai.
      // Succede solo nei preventivi con voci ripetute, cioè quelli grandi.
      const store = name.startsWith('g_') ? (page.commonObjs ?? page.objs) : page.objs
      const img: unknown = await getPdfObj(store, name)
      if (!img) continue
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

export type ProgressoParse = { fase: 'lettura'; pagina: number; totale: number; voci: number }

export async function parsePdfCosti(
  file: File,
  onProgress?: (p: ProgressoParse) => void
): Promise<VocePdf[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const voci: VocePdf[] = []

  // Scansione di tutte le pagine: le voci stanno di norma sulle dispari, ma
  // l'alternanza non è garantita nei preventivi lunghi. Il testo costa poco;
  // le immagini (costose) si estraggono solo dalle pagine che hanno una voce.
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum)
      const tc = await page.getTextContent()
      const text = buildText(tc.items as { str: string; hasEOL?: boolean }[])
      const parsed = parsePageText(text)
      if (parsed) {
        const immagineBlob = await extractWindowImage(page as unknown as PdfPageLike)
        voci.push({ ...parsed, immagineBlob })
      }
      // Libera le risorse della pagina: senza cleanup un PDF di 100+ pagine
      // tiene in memoria tutte le immagini decodificate
      page.cleanup()
    } catch (e) {
      // Una pagina illeggibile non deve far perdere tutte le altre voci
      console.warn(`[parsePdfCosti] pagina ${pageNum} saltata:`, e)
    }
    onProgress?.({ fase: 'lettura', pagina: pageNum, totale: pdf.numPages, voci: voci.length })
  }

  return voci
}
