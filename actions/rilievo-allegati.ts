'use server'

import { createClient } from '@/lib/supabase/server'

export interface AllegatoVoce {
  id: string
  voce_id: string
  organization_id: string
  nome_file: string
  storage_path: string
  mime_type: string | null
  dimensione: number | null
  created_at: string
}

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

/** Restituisce orgId + storagePath precalcolato per l'upload client-side */
export async function prepareUpload(voceId: string, fileName: string): Promise<{ orgId: string; storagePath: string }> {
  const orgId = await getOrgId()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${orgId}/${voceId}/${Date.now()}_${safeName}`
  return { orgId, storagePath }
}

/** Salva solo i metadati nel DB dopo che il client ha fatto l'upload allo storage */
export async function saveAllegatoMetadata(
  voceId: string,
  storagePath: string,
  nomeFile: string,
  mimeType: string | null,
  dimensione: number | null,
): Promise<AllegatoVoce> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('rilievo_voci_allegati')
    .insert({
      voce_id: voceId,
      organization_id: orgId,
      nome_file: nomeFile,
      storage_path: storagePath,
      mime_type: mimeType,
      dimensione,
    })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Errore salvataggio allegato')
  return data as AllegatoVoce
}

export async function getAllegatiVoce(voceId: string): Promise<AllegatoVoce[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('rilievo_voci_allegati')
    .select('*')
    .eq('voce_id', voceId)
    .eq('organization_id', orgId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function deleteAllegatoVoce(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  await supabase.storage.from('rilievo-allegati').remove([storagePath])
  const { error } = await supabase
    .from('rilievo_voci_allegati')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
}

export async function getSignedUrlAllegato(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('rilievo-allegati')
    .createSignedUrl(storagePath, 3600)
  if (error || !data) throw new Error(error?.message ?? 'URL non disponibile')
  return data.signedUrl
}
