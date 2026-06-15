// OCR best-effort di un assegno (Tesseract nel browser, eng+ita).
// Tutto best-effort: ogni campo può essere null e va sempre verificato a mano.

export type OcrAssegnoResult = {
  numero: string | null
  importo: number | null
  data: string | null // YYYY-MM-DD
}

const MESI_IT: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
}

// Numero assegno: sequenza di cifre più lunga (>= 6).
function estraiNumero(text: string): string | null {
  const matches = text.match(/\d{6,}/g)
  if (!matches || matches.length === 0) return null
  matches.sort((a, b) => b.length - a.length)
  return matches[0]
}

// Importo: cerca formati "1.234,56" / "€ 1234,56" e sceglie il valore maggiore.
function estraiImporto(text: string): number | null {
  const matches = text.match(/\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}/g)
  if (!matches || matches.length === 0) return null
  let max: number | null = null
  for (const m of matches) {
    const n = parseFloat(m.replace(/[.\s]/g, '').replace(',', '.'))
    if (!isNaN(n) && (max === null || n > max)) max = n
  }
  return max
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function normalizzaAnno(a: number): number {
  if (a < 100) return 2000 + a
  return a
}

function dataValida(g: number, m: number, a: number): boolean {
  return g >= 1 && g <= 31 && m >= 1 && m <= 12 && a >= 2000 && a <= 2099
}

// Data: prova "gg/mm/aaaa", "gg-mm-aaaa", "gg.mm.aaaa" e "gg mese aaaa" (italiano).
function estraiData(text: string): string | null {
  const numerica = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/)
  if (numerica) {
    const g = parseInt(numerica[1], 10)
    const m = parseInt(numerica[2], 10)
    const a = normalizzaAnno(parseInt(numerica[3], 10))
    if (dataValida(g, m, a)) return `${a}-${pad2(m)}-${pad2(g)}`
  }

  const lettere = text
    .toLowerCase()
    .match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\b/)
  if (lettere) {
    const g = parseInt(lettere[1], 10)
    const m = MESI_IT[lettere[2]]
    const a = parseInt(lettere[3], 10)
    if (dataValida(g, m, a)) return `${a}-${pad2(m)}-${pad2(g)}`
  }

  return null
}

export async function ocrAssegno(file: File): Promise<OcrAssegnoResult> {
  try {
    const Tesseract = (await import('tesseract.js')).default
    const { data } = await Tesseract.recognize(file, 'eng+ita')
    const text = data.text || ''
    return {
      numero: estraiNumero(text),
      importo: estraiImporto(text),
      data: estraiData(text),
    }
  } catch {
    return { numero: null, importo: null, data: null }
  }
}
