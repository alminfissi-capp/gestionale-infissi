import type { GrigliaData } from '@/types/listino'

/** Converte una griglia prezzi in CSV (separatore ;, decimali con punto) */
export function grigliaToCsv(data: GrigliaData): string {
  const { larghezze, altezze, griglia } = data
  const header = ['ALT\\LAR', ...larghezze.map(String)].join(';')
  const rows = altezze.map((h) => {
    const cells = larghezze.map((l) => {
      const price = griglia[h.toString()]?.[l.toString()]
      return price != null && price !== 0 ? String(price) : ''
    })
    return [h, ...cells].join(';')
  })
  return [header, ...rows].join('\r\n')
}

/** Scarica una stringa come file CSV (aggiunge BOM per compatibilità Excel) */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Scarica più CSV come archivio ZIP */
export async function downloadZipCsv(
  listini: { tipologia: string; griglia: GrigliaData }[],
  zipName: string
): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const l of listini) {
    const csv = grigliaToCsv(l.griglia)
    const safeName = l.tipologia.replace(/[^\w\s\-]/g, '_').trim()
    zip.file(`${safeName}.csv`, '\uFEFF' + csv)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName.replace(/[^\w\s\-]/g, '_').trim() + '.zip'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
