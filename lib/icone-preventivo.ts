// Dove stanno i file delle icone delle voci libere.
//
// Nello stesso bucket pubblico delle foto dei preventivi, in una sottocartella:
// le policy di storage guardano la PRIMA cartella del path (l'organizzazione),
// quindi `<org>/icone/...` e' gia' coperto da quelle che esistono.

import { createClient } from '@/lib/supabase/client'

export const BUCKET_ICONE = 'preventivi-allegati'

/** L'URL pubblico di un'icona. Sincrono: e' solo una stringa costruita. */
export function urlIcona(storagePath: string): string {
  return createClient().storage.from(BUCKET_ICONE).getPublicUrl(storagePath).data.publicUrl
}

/** Il path di un file nuovo. Nome casuale: i nomi originali si ripetono. */
export function nuovoPathIcona(orgId: string): string {
  return `${orgId}/icone/${crypto.randomUUID()}.webp`
}
