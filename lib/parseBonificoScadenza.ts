// Lettura best-effort della contabile di un bonifico allegata a una scadenza.
// Nessuna AI: solo testo del PDF ed espressioni regolari sui due formati usati
// in azienda (SICILBANCA e Intesa Sanpaolo).
//
// Volutamente separato da lib/parseBonifico.ts, che serve ai bonifici degli
// stipendi: quello cerca causali di retribuzione e restituisce mensilita' e
// periodo di competenza, concetti che qui non esistono. Tenerli distinti evita
// di legare le scadenze alle assunzioni del modulo Dipendenti.

export type BonificoScadenza = {
  importo: number | null
  data: string | null // YYYY-MM-DD
  causale: string | null
}

export const BONIFICO_VUOTO: BonificoScadenza = { importo: null, data: null, causale: null }

const parseNum = (s: string | undefined): number | null => {
  if (!s) return null
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

/**
 * Importo del bonifico. Si ancora all'etichetta "Importo" per non prendere
 * "Totale operazione" (che include le commissioni) ne' le commissioni stesse.
 * Se l'etichetta manca, ripiega sulla cifra piu' alta del documento.
 */
export function estraiImporto(text: string): number | null {
  const etichettato = parseNum(text.match(/\bImporto\b\s*-?\s*([\d.]+,\d{2})/i)?.[1])
  if (etichettato != null) return etichettato

  const tutti = text.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)
  if (!tutti) return null
  return tutti.reduce<number | null>((max, m) => {
    const n = parseNum(m)
    return n != null && (max === null || n > max) ? n : max
  }, null)
}

/**
 * Data dell'operazione. Le banche la chiamano in modi diversi: si prova in
 * ordine di attendibilita' e si ripiega su una data qualsiasi del documento.
 */
export function estraiData(text: string): string | null {
  const m =
    text.match(/Data esecuzione\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/Data addebito ordinante\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/Data regolamento beneficiario\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/autorizzato in data\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/\b(\d{2})[/.](\d{2})[/.](\d{4})\b/)
  if (!m) return null

  const g = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  const a = parseInt(m[3], 10)
  if (g < 1 || g > 31 || mm < 1 || mm > 12 || a < 2000 || a > 2099) return null
  return `${a}-${m[2]}-${m[1]}`
}

/**
 * Causale del bonifico. Si ferma alla riga successiva o all'etichetta seguente,
 * per non trascinarsi dentro meta' documento.
 */
export function estraiCausale(text: string): string | null {
  const m =
    text.match(/Causale(?:\s+del\s+bonifico)?\s*:?\s*\n?\s*([^\n]{3,120})/i) ??
    text.match(/Descrizione\s*:?\s*\n?\s*([^\n]{3,120})/i)
  if (!m) return null

  const causale = m[1]
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*(IBAN|Beneficiario|Importo|Data)\b.*$/i, '')
    .trim()
  return causale.length >= 3 ? causale : null
}

/** Legge i campi utili dal testo gia' estratto dal PDF. Separata per i test. */
export function leggiBonifico(text: string): BonificoScadenza {
  return {
    importo: estraiImporto(text),
    data: estraiData(text),
    causale: estraiCausale(text),
  }
}

/** Legge la contabile di un bonifico da un PDF. Solo browser (usa pdfjs). */
export async function parseBonificoScadenza(file: File): Promise<BonificoScadenza> {
  try {
    const { estraiItemsPagine } = await import('./pdf-items')
    const pagine = await estraiItemsPagine(file)
    return leggiBonifico(pagine.map((p) => p.text).join('\n'))
  } catch {
    return BONIFICO_VUOTO
  }
}
