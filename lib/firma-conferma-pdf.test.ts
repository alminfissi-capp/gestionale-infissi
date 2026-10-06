import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { firmaPdf } from './firma-conferma-pdf'

// PNG 1x1 trasparente: basta a pdf-lib per incorporare un'immagine vera.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function pdfDiProva(rotazione = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  doc.addPage([595, 842]).setRotation(degrees(rotazione))
  return doc.save()
}

describe('firmaPdf', () => {
  it("appone l'immagine sulla pagina scelta e lascia il PDF leggibile", async () => {
    const firmato = await firmaPdf(await pdfDiProva(), 1, { x: 0.6, y: 0.8, larghezza: 0.3, altezza: 0.1 }, PNG)
    const doc = await PDFDocument.load(firmato)
    expect(doc.getPageCount()).toBe(2)
    // Solo l'ultima pagina riceve l'immagine.
    const risorse = (i: number) => doc.getPage(i).node.Resources()?.toString() ?? ''
    expect(risorse(1)).toContain('XObject')
    expect(risorse(0)).not.toContain('XObject')
  })

  it('funziona anche su una pagina ruotata', async () => {
    const firmato = await firmaPdf(await pdfDiProva(90), 1, { x: 0.1, y: 0.1, larghezza: 0.3, altezza: 0.1 }, PNG)
    expect((await PDFDocument.load(firmato)).getPage(1).getRotation().angle).toBe(90)
  })

  it('su un file non PDF spiega cosa fare', async () => {
    await expect(
      firmaPdf(new TextEncoder().encode('non sono un pdf'), 0, { x: 0, y: 0, larghezza: 0.2, altezza: 0.1 }, PNG)
    ).rejects.toThrow(/Carica conferma già firmata/)
  })
})
