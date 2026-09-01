/**
 * Come si chiama e dove finisce un documento caricato su una commessa.
 *
 * Sta a parte da `lib/upload-documento.ts` perche' quello importa le Server
 * Action, e con loro `next/cache`: importarlo da Vitest farebbe fallire i test
 * per ragioni che non c'entrano con quello che verificano.
 */

/** Oltre questa soglia il caricamento viene rifiutato. */
export const LIMITE_BYTE_DOCUMENTO = 20 * 1024 * 1024

const MIME_DA_ESTENSIONE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function estensioneDi(nome: string): string {
  const pezzi = nome.split('.')
  if (pezzi.length < 2) return ''
  return pezzi[pezzi.length - 1].toLowerCase()
}

/**
 * Il tipo MIME con cui salvare il file.
 *
 * Android e iOS a volte dichiarano `application/octet-stream` anche per un PDF:
 * salvandolo cosi', il browser poi lo scaricherebbe invece di aprirlo. Quando il
 * tipo dichiarato non dice niente, si ricava dall'estensione.
 */
export function mimeDocumento(nome: string, tipoDichiarato: string): string {
  if (tipoDichiarato && tipoDichiarato !== 'application/octet-stream') return tipoDichiarato
  return MIME_DA_ESTENSIONE[estensioneDi(nome)] ?? 'application/octet-stream'
}

/**
 * Percorso dentro il bucket `commesse-docs`. L'organizzazione in testa tiene
 * separati i dati fra aziende diverse anche a livello di storage.
 */
export function percorsoStorage(
  orgId: string,
  commessaId: string,
  nomeFile: string,
  ora: number = Date.now(),
): string {
  return `${orgId}/${commessaId}/${ora}.${estensioneDi(nomeFile) || 'bin'}`
}
