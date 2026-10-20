// Archivio immagini per categorie (Grate, Pergole...) e copia nel preventivo.
//
// Il preventivo e' un documento ufficiale: quando una voce prende un'immagine
// dall'archivio o dalle icone, se ne salva una COPIA nel bucket dei preventivi.
// Cosi' cambiare o cancellare l'archivio non tocca mai un preventivo gia' fatto.

import { createClient } from '@/lib/supabase/client'

export const BUCKET_ARCHIVIO = 'archivio-immagini'
export const BUCKET_PREVENTIVI = 'preventivi-allegati'

/** URL pubblico di un'immagine dell'archivio (stringa costruita, niente rete) */
export function urlArchivio(storagePath: string): string {
  return createClient().storage.from(BUCKET_ARCHIVIO).getPublicUrl(storagePath).data.publicUrl
}

/** Path di un file nuovo dell'archivio: prima cartella = organizzazione (la guardano le policy) */
export function nuovoPathArchivio(orgId: string, categoriaId: string): string {
  return `${orgId}/${categoriaId}/${crypto.randomUUID()}.webp`
}

/**
 * Copia un'immagine (icona o archivio) nello spazio dei preventivi e restituisce
 * l'URL pubblico della copia: la voce puntera' solo a quella.
 */
export async function copiaNelPreventivo(urlSorgente: string, orgId: string): Promise<string> {
  const risposta = await fetch(urlSorgente, { cache: 'no-store' })
  if (!risposta.ok) throw new Error(`Immagine non raggiungibile (${risposta.status})`)
  const blob = await risposta.blob()
  const tipo = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/webp'
  const estensione = tipo === 'image/png' ? 'png' : tipo === 'image/jpeg' ? 'jpg' : 'webp'
  const path = `${orgId}/${crypto.randomUUID()}.${estensione}`
  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET_PREVENTIVI).upload(path, blob, { contentType: tipo, upsert: false })
  if (error) throw error
  return supabase.storage.from(BUCKET_PREVENTIVI).getPublicUrl(path).data.publicUrl
}
