'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'

/**
 * Carica il PDF generato lato client, lo registra tra i documenti e lo lega
 * all'ordine. Se l'ordine aveva già un PDF archiviato lo sostituisce (rimuove
 * file e voce documento vecchi) così da non accumulare duplicati.
 * Per gli ordini di magazzino (commessaId null) il file va sotto il percorso
 * dell'ordine e non viene registrato tra i documenti di commessa.
 * Ritorna lo storage path del nuovo PDF per aprirlo inline.
 */
export async function salvaPdfOrdine(
  ordineId: string,
  commessaId: string | null,
  pdfBase64: string,
  nomeFile: string
): Promise<{ path?: string; error?: string }> {
  const orgId = await getOrgId()
  const cartella = commessaId ?? `ordini/${ordineId}`
  const storagePath = `${orgId}/${cartella}/${Date.now()}.pdf`
  const buffer = Buffer.from(pdfBase64, 'base64')

  const supabase = await createClient()
  const service = createServiceClient()

  // PDF archiviato in precedenza per questo ordine (da rimuovere dopo).
  const { data: ordinePrec } = await supabase
    .from('ordini_fornitore')
    .select('pdf_path')
    .eq('id', ordineId)
    .eq('organization_id', orgId)
    .maybeSingle()
  const vecchioPath = ordinePrec?.pdf_path as string | null | undefined

  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, buffer, { contentType: 'application/pdf' })
  if (uploadError) return { error: uploadError.message }

  // Solo gli ordini di commessa compaiono tra i documenti della commessa.
  if (commessaId) {
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
  }

  const { error: ordineError } = await supabase
    .from('ordini_fornitore')
    .update({ pdf_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', ordineId)
    .eq('organization_id', orgId)
  if (ordineError) return { error: ordineError.message }

  // Rimuove il PDF precedente (best effort, non blocca l'esito).
  if (vecchioPath && vecchioPath !== storagePath) {
    await service.storage.from('commesse-docs').remove([vecchioPath])
    await supabase
      .from('documenti_commessa')
      .delete()
      .eq('organization_id', orgId)
      .eq('storage_path', vecchioPath)
  }

  revalidatePath('/produzione', 'layout')
  return { path: storagePath }
}
