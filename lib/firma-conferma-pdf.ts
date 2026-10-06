/**
 * Firma della conferma d'ordine nel browser: compone timbro + firma + data in
 * un'unica immagine e la appone sul PDF del fornitore con pdf-lib.
 * Solo browser (canvas). La geometria pura sta in lib/conferme-ordine.ts.
 */
import { PDFDocument, degrees } from 'pdf-lib'
import { posizioneSuPdf, type PosizioneFirma } from '@/lib/conferme-ordine'

const caricaImmagine = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = src
  })

export type TimbroComposto = {
  /** PNG trasparente con timbro, firma e data uno sotto l'altro. */
  dataUrl: string
  /** Altezza / larghezza dell'immagine composta. */
  rapporto: number
}

/**
 * Timbro sopra, firma sotto, data in fondo: l'ordine con cui si firma a mano
 * un modulo "per accettazione". Disegnato grande e poi rimpicciolito nel PDF,
 * cosi' resta nitido anche stampato.
 */
export async function componiTimbro(
  timbro: string | null,
  firma: string | null,
  data: string
): Promise<TimbroComposto> {
  const LARGHEZZA = 900
  const MAX_ALTEZZA_IMG = 330
  const SPAZIO = 12
  const ALTEZZA_DATA = 48

  const immagini = await Promise.all(
    [timbro, firma].filter((s): s is string => !!s).map(caricaImmagine)
  )
  const misure = immagini.map((img) => {
    const scala = Math.min((LARGHEZZA * 0.9) / img.naturalWidth, MAX_ALTEZZA_IMG / img.naturalHeight)
    return { img, w: img.naturalWidth * scala, h: img.naturalHeight * scala }
  })
  const altezza =
    misure.reduce((tot, m) => tot + m.h, 0) + SPAZIO * misure.length + ALTEZZA_DATA

  const canvas = document.createElement('canvas')
  canvas.width = LARGHEZZA
  canvas.height = Math.ceil(altezza)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponibile')

  let y = 0
  for (const m of misure) {
    ctx.drawImage(m.img, (LARGHEZZA - m.w) / 2, y, m.w, m.h)
    y += m.h + SPAZIO
  }
  // Fondo bianco → trasparente: la firma tracciata in Impostazioni e i timbri
  // scansionati hanno lo sfondo pieno, che coprirebbe le righe del modulo.
  const pixel = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = pixel.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0
  }
  ctx.putImageData(pixel, 0, 0)
  ctx.fillStyle = '#1f2937'
  ctx.font = '600 34px Arial, Helvetica, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(data, LARGHEZZA / 2, y + ALTEZZA_DATA / 2)

  return { dataUrl: canvas.toDataURL('image/png'), rapporto: canvas.height / canvas.width }
}

/**
 * La conferma come PDF. Una foto (JPG, PNG, WEBP) diventa un PDF di una
 * pagina larga quanto un A4: cosi' si firma allo stesso modo e il fornitore
 * riceve sempre un PDF.
 */
export async function confermaComePdf(bytes: ArrayBuffer, contentType: string): Promise<Uint8Array> {
  if (contentType === 'application/pdf') return new Uint8Array(bytes)

  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }))
  try {
    const img = await caricaImmagine(url)
    // Passando dal canvas anche il WEBP, che pdf-lib non sa leggere, diventa JPEG.
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    const jpeg = await (await fetch(canvas.toDataURL('image/jpeg', 0.9))).arrayBuffer()

    const doc = await PDFDocument.create()
    const immagine = await doc.embedJpg(jpeg)
    const larghezza = 595.28
    const altezza = (larghezza * img.naturalHeight) / img.naturalWidth
    doc.addPage([larghezza, altezza]).drawImage(immagine, { x: 0, y: 0, width: larghezza, height: altezza })
    return await doc.save()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Appone il timbro composto sulla pagina scelta (indice da 0). */
export async function firmaPdf(
  pdf: Uint8Array,
  pagina: number,
  posizione: PosizioneFirma,
  timbroPng: string
): Promise<Uint8Array<ArrayBuffer>> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(pdf)
  } catch {
    throw new Error(
      'Il PDF del fornitore è protetto o danneggiato: firmalo a mano e caricalo con "Carica conferma già firmata"'
    )
  }
  const page = doc.getPage(pagina)
  const immagine = await doc.embedPng(timbroPng)
  const crop = page.getCropBox()
  const d = posizioneSuPdf(posizione, crop, page.getRotation().angle)
  page.drawImage(immagine, {
    x: d.x,
    y: d.y,
    width: d.width,
    height: d.height,
    rotate: degrees(d.rotate),
  })
  const bytes = await doc.save()
  return new Uint8Array(bytes)
}
