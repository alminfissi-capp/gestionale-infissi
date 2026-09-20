// Immagini caricate dal browser: conversione e nomi.
//
// Il ridimensionamento sta qui e non dentro un componente perche' lo fanno in
// due — la foto della voce libera e le icone delle Impostazioni — e devono
// produrre lo stesso file: stesso lato massimo, stesso formato, stessa qualita'.

/**
 * Ridimensiona un'immagine mantenendo le proporzioni, max `maxDim` px sul lato
 * maggiore, e la riconverte in WebP. Gira nel browser (usa canvas): serve anche
 * a non spedire da telefono un JPEG da 8 MB, che su Vercel non passerebbe.
 */
export async function resizeImage(file: File, maxDim = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas error'))), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

/** Lato massimo delle icone: sono miniature in griglia e nel PDF stanno in una cella. */
export const MAX_DIM_ICONA = 600

/**
 * Il nome da proporre per un file appena scelto: quello del file senza
 * estensione. E' solo un'etichetta modificabile, quindi non si controlla niente
 * oltre a non lasciarla vuota.
 */
export function nomeDaFile(nomeFile: string): string {
  // Certi browser passano il percorso intero ("C:\fakepath\foto.jpg").
  const base = nomeFile.split(/[\\/]/).pop() ?? ''
  const senzaEstensione = base.replace(/\.[^.]+$/, '')
  const pulito = senzaEstensione.trim()
  if (!pulito) return 'Icona'
  return pulito.slice(0, 60)
}
