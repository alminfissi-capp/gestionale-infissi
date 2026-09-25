/**
 * Regole degli allegati agli ordini fornitore, condivise fra il browser e la
 * Server Action.
 *
 * Stanno qui perche' l'upload ha due strade: il browser carica diretto su
 * Supabase Storage (l'unica che regge i file oltre ~4,5 MB) e la Server Action
 * fa da ripiego quando il client non ha la sessione. Se i controlli vivessero
 * solo nella Server Action, la strada diretta non li eseguirebbe affatto.
 */

/** Il bucket accetta fino a 20 MB: oltre, rifiuta lui con un errore oscuro. */
export const MAX_ALLEGATO_BYTE = 20 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}

export function estensioneDi(nome: string): string {
  const parti = nome.split('.')
  if (parti.length < 2) return 'bin'
  return parti.pop()?.toLowerCase() || 'bin'
}

/**
 * Il tipo dichiarato dal browser vince, tranne quando e' il generico
 * `application/octet-stream`: da Android capita, e salvarlo cosi' renderebbe
 * il file non apribile nel visualizzatore.
 */
export function mimeAllegato(nome: string, tipoDichiarato?: string | null): string {
  if (tipoDichiarato && tipoDichiarato !== 'application/octet-stream') return tipoDichiarato
  return MIME_BY_EXT[estensioneDi(nome)] ?? 'application/octet-stream'
}

/** Messaggio d'errore, oppure null se l'allegato va bene. */
export function validaAllegato(file: { name: string; size: number }): string | null {
  if (file.size === 0) return `"${file.name}" e' vuoto`
  if (file.size > MAX_ALLEGATO_BYTE) return `"${file.name}" troppo grande (max 20 MB)`
  return null
}

/**
 * `orgId` come prima cartella e' obbligatorio per le storage policy del bucket.
 * Il suffisso casuale evita che due file caricati nello stesso millisecondo si
 * sovrascrivano a vicenda.
 */
export function percorsoAllegatoOrdine(
  orgId: string,
  ordineId: string,
  nome: string,
  suffisso = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): string {
  return `${orgId}/ordini/${ordineId}/${suffisso}.${estensioneDi(nome)}`
}
