'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'

/** Carica il PDF generato lato client, lo registra tra i documenti e lo lega all'ordine. */
export async function salvaPdfOrdine(
  ordineId: string,
  commessaId: string,
  pdfBase64: string,
  nomeFile: string
): Promise<{ error?: string }> {
  const orgId = await getOrgId()
  const storagePath = `${orgId}/${commessaId}/${Date.now()}.pdf`
  const buffer = Buffer.from(pdfBase64, 'base64')

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, buffer, { contentType: 'application/pdf' })
  if (uploadError) return { error: uploadError.message }

  const supabase = await createClient()
  const { error: docError } = await supabase.from('documenti_commessa').insert({
    commessa_id: commessaId,
    organization_id: orgId,
    nome_file: nomeFile,
    storage_path: storagePath,
    tipo_documento: 'ordine_fornitore',
  })
  if (docError) {
    await service.storage.from('commesse-docs').remove([storagePath])
    return { error: docError.message }
  }

  const { error: ordineError } = await supabase
    .from('ordini_fornitore')
    .update({ pdf_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', ordineId)
    .eq('organization_id', orgId)
  if (ordineError) return { error: ordineError.message }

  revalidatePath('/produzione', 'layout')
  return {}
}
