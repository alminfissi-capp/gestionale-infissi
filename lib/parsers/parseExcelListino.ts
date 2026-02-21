import type { ParseResult } from './parseCSVListino'
import { parseCSVListino } from './parseCSVListino'

export async function parseExcelListino(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  // Converte il foglio in CSV e riusa il parser CSV
  const csv = XLSX.utils.sheet_to_csv(sheet)
  return parseCSVListino(csv)
}
