import { PDFDocument } from 'pdf-lib'

/** Un allegato da accodare al PDF: byte grezzi + tipo MIME. */
export type AllegatoDaUnire = {
  nome: string
  bytes: ArrayBuffer
  contentType: string
}

const A4 = { larghezza: 595.28, altezza: 841.89 }
const MARGINE = 36

/**
 * Converte un'immagine di formato non nativo (webp/heic/...) in PNG usando
 * il canvas del browser. Ritorna null se il browser non sa decodificarla
 * (tipico dei HEIC fuori da Safari).
 */
async function immagineInPng(bytes: ArrayBuffer, contentType: string): Promise<ArrayBuffer | null> {
  try {
    const blob = new Blob([bytes], { type: contentType })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!pngBlob) return null
    return await pngBlob.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Accoda gli allegati in fondo al PDF base:
 * - i PDF vengono copiati pagina per pagina;
 * - le immagini diventano una pagina A4 intera ciascuna (jpg/png diretti,
 *   gli altri formati convertiti in PNG via canvas).
 * Ritorna i byte del PDF unito e i nomi degli allegati saltati.
 */
export async function unisciAllegatiAlPdf(
  basePdf: ArrayBuffer,
  allegati: AllegatoDaUnire[]
): Promise<{ bytes: Uint8Array; saltati: string[] }> {
  const doc = await PDFDocument.load(basePdf)
  const saltati: string[] = []

  for (const allegato of allegati) {
    const tipo = (allegato.contentType || '').toLowerCase()
    try {
      if (tipo === 'application/pdf') {
        const src = await PDFDocument.load(allegato.bytes)
        const pagine = await doc.copyPages(src, src.getPageIndices())
        pagine.forEach((p) => doc.addPage(p))
        continue
      }

      if (tipo.startsWith('image/')) {
        let immagine
        if (tipo === 'image/jpeg' || tipo === 'image/jpg') {
          immagine = await doc.embedJpg(allegato.bytes)
        } else if (tipo === 'image/png') {
          immagine = await doc.embedPng(allegato.bytes)
        } else {
          const png = await immagineInPng(allegato.bytes, tipo)
          if (!png) {
            saltati.push(allegato.nome)
            continue
          }
          immagine = await doc.embedPng(png)
        }

        const page = doc.addPage([A4.larghezza, A4.altezza])
        const maxW = A4.larghezza - MARGINE * 2
        const maxH = A4.altezza - MARGINE * 2
        const scala = Math.min(maxW / immagine.width, maxH / immagine.height)
        const w = immagine.width * scala
        const h = immagine.height * scala
        page.drawImage(immagine, {
          x: (A4.larghezza - w) / 2,
          y: (A4.altezza - h) / 2,
          width: w,
          height: h,
        })
        continue
      }

      saltati.push(allegato.nome)
    } catch {
      saltati.push(allegato.nome)
    }
  }

  const bytes = await doc.save()
  return { bytes, saltati }
}
