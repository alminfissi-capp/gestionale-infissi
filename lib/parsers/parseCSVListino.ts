import type { GrigliaData } from '@/types/listino'

export type ParseResult = GrigliaData & { errors: string[] }

export function parseCSVListino(csvText: string): ParseResult {
  const errors: string[] = []

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return {
      larghezze: [],
      altezze: [],
      griglia: {},
      errors: ['File insufficiente: serve almeno intestazione + una riga dati.'],
    }
  }

  // Rileva separatore (virgola o punto e virgola)
  const delimiter = lines[0].includes(';') ? ';' : ','

  // Intestazione: [ALT, L1, L2, L3, ...]
  const headerCells = lines[0].split(delimiter).map((h) => h.trim().replace(/['"]/g, ''))
  const larghezze: number[] = []

  for (const raw of headerCells.slice(1)) {
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10)
    if (!isNaN(n) && n > 0) {
      larghezze.push(n)
    } else {
      errors.push(`Larghezza non valida: "${raw}"`)
    }
  }

  if (larghezze.length === 0) {
    return { larghezze: [], altezze: [], griglia: {}, errors: ['Nessuna larghezza valida in intestazione.'] }
  }

  const altezze: number[] = []
  const griglia: Record<string, Record<string, number>> = {}

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => c.trim().replace(/['"]/g, ''))

    const altezza = parseInt(cells[0].replace(/[^\d]/g, ''), 10)
    if (isNaN(altezza) || altezza <= 0) {
      errors.push(`Riga ${i + 1}: altezza non valida "${cells[0]}"`)
      continue
    }

    altezze.push(altezza)
    griglia[altezza.toString()] = {}

    for (let j = 0; j < larghezze.length; j++) {
      const raw = cells[j + 1]?.trim() ?? ''
      if (!raw || raw === '-') continue

      // Supporta sia punto che virgola come separatore decimale
      const price = parseFloat(raw.replace(/[^\d,.]/g, '').replace(',', '.'))
      if (!isNaN(price) && price > 0) {
        griglia[altezza.toString()][larghezze[j].toString()] = price
      }
    }
  }

  if (altezze.length === 0) {
    errors.push('Nessuna altezza valida trovata nel file.')
  }

  return { larghezze, altezze, griglia, errors }
}
