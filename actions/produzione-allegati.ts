'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import {
  mimeAllegato,
  percorsoAllegatoOrdine,
  validaAllegato,
} from '@/lib/allegati-ordine'
import type { AllegatoOrdine } from '@/types/produzione'

export async function getAllegatiOrdine(ordineId: string): Promise<AllegatoOrdine[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('allegati_ordine_fornitore')
    .select('*')
    .eq('organization_id', orgId)
    .eq('ordine_id', ordineId)
    .order('created_at', { ascending: false })
  return data ?? []
}

/**
 * Registra un allegato gia' caricato dal browser su Storage.
 *
 * E' la strada normale: un file oltre ~4,5 MB non entra nel corpo di una Server
 * Action su Vercel e fallirebbe in silenzio, quindi i byte non passano di qui.
 * Qui passa solo la riga.
 */
export async function registraAllegatoOrdine(
  ordineId: string,
  storagePath: string,
  nomeFile: string,
  contentType: string,
): Promise<{ error?: string }> {
  if (!ordineId || !storagePath) return { error: 'Allegato non valido' }
  const orgId = await getOrgId()
  // Il path e' costruito dal client: senza questo controllo si potrebbe
  // agganciare all'ordine un file di un'altra organizzazione.
  if (!storagePath.startsWith(`${orgId}/ordini/${ordineId}/`)) {
    return { error: 'Percorso allegato non valido' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('allegati_ordine_fornitore').insert({
    ordine_id: ordineId,
    organization_id: orgId,
    nome_file: nomeFile,
    storage_path: storagePath,
    content_type: contentType,
  })
  if (error) return { error: error.message }
  revalidatePath('/produzione', 'layout')
  return {}
}

/**
 * Ripiego per quando il browser non puo' caricare da solo: su iOS e Android,
 * dentro un Dialog, il client a volte non ha la sessione. Qui i byte passano
 * dalla function, quindi vale il tetto dei ~4,5 MB.
 */
export async function uploadAllegatiOrdine(formData: FormData): Promise<{ error?: string }> {
  const ordineId = formData.get('ordineId') as string
  const files = formData.getAll('files') as File[]

  if (!ordineId) return { error: 'Ordine non valido' }
  const validi = files.filter((f) => f && f.size > 0)
  if (validi.length === 0) return { error: 'Nessun file selezionato' }
  for (const f of validi) {
    const errore = validaAllegato(f)
    if (errore) return { error: errore }
  }

  const orgId = await getOrgId()
  const service = createServiceClient()
  const supabase = await createClient()

  for (const file of validi) {
    const storagePath = percorsoAllegatoOrdine(orgId, ordineId, file.name)
    const contentType = mimeAllegato(file.name, file.type)

    const { error: uploadError } = await service.storage
      .from('commesse-docs')
      .upload(storagePath, file, { contentType })
    if (uploadError) return { error: uploadError.message }

    const { error: dbError } = await supabase.from('allegati_ordine_fornitore').insert({
      ordine_id: ordineId,
      organization_id: orgId,
      nome_file: file.name,
      storage_path: storagePath,
      content_type: contentType,
    })
    if (dbError) {
      await service.storage.from('commesse-docs').remove([storagePath])
      return { error: dbError.message }
    }
  }

  revalidatePath('/produzione', 'layout')
  return {}
}

export async function deleteAllegatoOrdine(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  await supabase.storage.from('commesse-docs').remove([storagePath])
  const { error } = await supabase
    .from('allegati_ordine_fornitore')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}
