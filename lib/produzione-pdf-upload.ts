import { createClient } from '@/lib/supabase/client'
import { getOrgIdPerUpload } from '@/actions/commesse'
import type { PdfCaricato } from '@/types/produzione'

/**
 * Porta su Storage il PDF d'ordine generato nel browser e restituisce il
 * riferimento da passare alle Server Action.
 *
 * I byte non possono viaggiare dentro una Server Action: il PDF viene unito ai
 * suoi allegati e in base64 cresce di un terzo, cosi' un solo allegato da 2 MB
 * basta a superare i ~4,5 MB che una function Vercel accetta nel corpo. Oltre
 * quella soglia la richiesta non arriva nemmeno al codice e il browser mostra
 * "An unexpected response was received from the server".
 *
 * Il base64 resta come ripiego per quando l'upload diretto non parte (dentro un
 * Dialog su iOS il client a volte non ha la sessione): li' il tetto torna
 * valido, ma e' meglio di nessun archivio.
 */
export async function caricaPdfOrdine(
  ordineId: string,
  commessaId: string | null,
  bytes: Uint8Array,
  suffisso = '',
): Promise<PdfCaricato> {
  try {
    const orgId = await getOrgIdPerUpload()
    // Stessa cartella che usava la Server Action: gli ordini di magazzino
    // (senza commessa) stanno sotto il percorso dell'ordine.
    const cartella = commessaId ?? `ordini/${ordineId}`
    const path = `${orgId}/${cartella}/${Date.now()}${suffisso}.pdf`
    const { error } = await createClient()
      .storage.from('commesse-docs')
      .upload(path, new Blob([bytes as BlobPart], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      })
    if (error) throw error
    return { path }
  } catch {
    return { base64: Buffer.from(bytes).toString('base64') }
  }
}
