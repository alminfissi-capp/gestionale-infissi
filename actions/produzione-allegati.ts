'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import type { AllegatoOrdine } from '@/types/produzione'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}

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

/** Carica uno o più file allegati a un ordine. Ritorna gli errori per nome file. */
export async function uploadAllegatiOrdine(formData: FormData): Promise<{ error?: string }> {
  const ordineId = formData.get('ordineId') as string
  const files = formData.getAll('files') as File[]

  if (!ordineId) return { error: 'Ordine non valido' }
  const validi = files.filter((f) => f && f.size > 0)
  if (validi.length === 0) return { error: 'Nessun file selezionato' }
  for (const f of validi) {
    if (f.size > 20 * 1024 * 1024) return { error: `"${f.name}" troppo grande (max 20 MB)` }
  }

  const orgId = await getOrgId()
  const service = createServiceClient()
  const supabase = await createClient()

  for (const file of validi) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const storagePath = `${orgId}/ordini/${ordineId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const contentType =
      file.type && file.type !== 'application/octet-stream'
        ? file.type
        : (MIME_BY_EXT[ext] ?? 'application/octet-stream')

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
