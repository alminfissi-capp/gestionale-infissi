// Testo di un PDF, letto nel browser. Serve al riconoscimento automatico delle
// fatture allegate a una commessa (lib/parseFattura.ts).
//
// Stesso schema di components/cataloghi/PaginaCataloghi.tsx: pdfjs si importa
// dinamicamente, perche' non puo' girare lato server, e il worker sta in
// public/, dove viene copiato all'avvio dallo script predev/prebuild.

export async function estraiTestoPdf(url: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise

  let testo = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      testo += item.str
      testo += item.hasEOL ? '\n' : ' '
    }
    testo += '\n'
  }
  return testo
}
