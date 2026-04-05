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

export async function uploadAllegatoVoce(formData: FormData): Promise<AllegatoVoce> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const file = formData.get('file') as File
  const voceId = formData.get('voceId') as string
  if (!file || !voceId) throw new Error('Parametri mancanti')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${orgId}/${voceId}/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('rilievo-allegati')
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await supabase
    .from('rilievo_voci_allegati')
    .insert({
      voce_id: voceId,
      organization_id: orgId,
      nome_file: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      dimensione: file.size,
    })
    .select()
    .single()
  if (error || !data) {
    await supabase.storage.from('rilievo-allegati').remove([storagePath])
    throw new Error(error?.message ?? 'Errore salvataggio allegato')
  }
  return data as AllegatoVoce
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
