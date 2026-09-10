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

/**
 * Ripulisce un nome di listino perché possa fare da nome file. Serve davvero:
 * "Cambio Telo/Rete Porta" contiene una barra, che nell'attributo `download`
 * viene letta come percorso e non come nome.
 */
export function nomeFileSicuro(nome: string, estensione: '.csv' | '.zip'): string {
  const pulito = nome
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.(csv|zip)$/i, '')
  return `${pulito || 'listino'}${estensione}`
}

export type EsitoSalvataggio = 'salvato' | 'annullato' | 'fallito'

/** Vero quando l'app gira come PWA installata, senza barra degli indirizzi. */
function inAppInstallata(): boolean {
  if (typeof window === 'undefined') return false
  const standaloneIOS = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || standaloneIOS === true
}

type PickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

const isAbort = (e: unknown): boolean =>
  e instanceof DOMException ? e.name === 'AbortError' : false

/**
 * Salva un blob sul dispositivo. Nella PWA installata il vecchio metodo (creare
 * un <a download> e cliccarlo da codice) viene bloccato in silenzio: il
 * pulsante sembrava non fare niente. Si prova quindi prima il dialog di
 * salvataggio nativo, poi la condivisione file su telefono, e solo da ultimo
 * l'ancora classica, che nel browser normale funziona benissimo.
 */
export async function salvaBlob(
  blob: Blob,
  filename: string,
  descrizione: string
): Promise<EsitoSalvataggio> {
  const w = window as PickerWindow

  if (inAppInstallata() && typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: descrizione, accept: { [blob.type || 'application/octet-stream']: [filename.slice(filename.lastIndexOf('.'))] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'salvato'
    } catch (e) {
      if (isAbort(e)) return 'annullato'
      console.warn('[exportListino] dialog di salvataggio non riuscito:', e)
    }
  }

  // Telefono e tablet: il foglio di condivisione permette "Salva su File".
  if (inAppInstallata() && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], filename, { type: blob.type })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return 'salvato'
      }
    } catch (e) {
      if (isAbort(e)) return 'annullato'
      console.warn('[exportListino] condivisione non riuscita:', e)
    }
  }

  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoca ritardata: revocare subito può annullare un download appena avviato.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'salvato'
  } catch (e) {
    console.error('[exportListino] salvataggio fallito:', e)
    return 'fallito'
  }
}

/** Salva una stringa come file CSV (BOM incluso per compatibilità Excel) */
export function downloadCsv(csv: string, filename: string): Promise<EsitoSalvataggio> {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  return salvaBlob(blob, nomeFileSicuro(filename, '.csv'), 'File CSV')
}

/** Salva più CSV come archivio ZIP */
export async function downloadZipCsv(
  listini: { tipologia: string; griglia: GrigliaData }[],
  zipName: string
): Promise<EsitoSalvataggio> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const l of listini) {
    const csv = grigliaToCsv(l.griglia)
    zip.file(nomeFileSicuro(l.tipologia, '.csv'), '\uFEFF' + csv)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return salvaBlob(blob, nomeFileSicuro(zipName, '.zip'), 'Archivio ZIP')
}
