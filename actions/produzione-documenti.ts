'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { TIPI_DOCUMENTO_PRODUZIONE_VALUES } from '@/types/produzione'
import type { DocumentoCommessa } from '@/types/commessa'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export async function getDocumentiProduzione(commessaId: string): Promise<DocumentoCommessa[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('documenti_commessa')
    .select('*')
    .eq('organization_id', orgId)
    .eq('commessa_id', commessaId)
    .in('tipo_documento', TIPI_DOCUMENTO_PRODUZIONE_VALUES)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function uploadDocumentoProduzione(formData: FormData): Promise<{ error?: string }> {
  const file = formData.get('file') as File | null
  const commessaId = formData.get('commessaId') as string
  const tipo = formData.get('tipo') as string

  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (file.size > 20 * 1024 * 1024) return { error: 'File troppo grande (max 20 MB)' }
  if (!TIPI_DOCUMENTO_PRODUZIONE_VALUES.includes(tipo)) return { error: 'Tipo documento non valido' }

  const orgId = await getOrgId()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const storagePath = `${orgId}/${commessaId}/${Date.now()}.${ext}`
  const contentType =
    file.type && file.type !== 'application/octet-stream'
      ? file.type
      : (MIME_BY_EXT[ext] ?? 'application/pdf')

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, file, { contentType })
  if (uploadError) return { error: uploadError.message }

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('documenti_commessa').insert({
    commessa_id: commessaId,
    organization_id: orgId,
    nome_file: file.name,
    storage_path: storagePath,
    tipo_documento: tipo,
  })
  if (dbError) {
    await service.storage.from('commesse-docs').remove([storagePath])
    return { error: dbError.message }
  }

  revalidatePath('/produzione', 'layout')
  return {}
}

export async function getDocumentoSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from('commesse-docs').createSignedUrl(storagePath, 3600)
  return data?.signedUrl ?? null
}

export async function deleteDocumentoProduzione(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  await supabase.storage.from('commesse-docs').remove([storagePath])
  const { error } = await supabase
    .from('documenti_commessa')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}
