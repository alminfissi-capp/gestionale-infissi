'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type { Scadenza, ScadenzaInput } from '@/types/commessa'

const BUCKET = 'commesse-docs'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
}

export async function getScadenze(gruppoId: string): Promise<Scadenza[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('scadenze')
    .select('*')
    .eq('organization_id', orgId)
    .eq('gruppo_id', gruppoId)
    .order('data_scadenza', { ascending: true })
    .order('ordine', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({ ...s, importo: Number(s.importo) })) as Scadenza[]
}

export async function createScadenza(input: ScadenzaInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('scadenze')
    .insert({ ...input, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
  return { id: data.id }
}

export async function updateScadenza(id: string, input: Partial<ScadenzaInput>): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function setPagatoScadenza(id: string, pagato: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({ pagato, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteScadenza(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: row } = await supabase
    .from('scadenze')
    .select('foto_path')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (row?.foto_path) {
    await createServiceClient().storage.from(BUCKET).remove([row.foto_path])
  }
  const { error } = await supabase.from('scadenze').delete().eq('id', id).eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

// Upload foto (server action con service role: robusto anche da mobile)
export async function uploadFotoScadenza(formData: FormData): Promise<{ error?: string; path?: string }> {
  const file = formData.get('file') as File | null
  const scadenzaId = formData.get('scadenzaId') as string

  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (file.size > 20 * 1024 * 1024) return { error: 'File troppo grande (max 20 MB)' }

  const orgId = await getOrgId()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const storagePath = `${orgId}/scadenze/${scadenzaId}/${Date.now()}.${ext}`
  const contentType =
    file.type && file.type !== 'application/octet-stream'
      ? file.type
      : (MIME_BY_EXT[ext] ?? 'image/jpeg')

  const service = createServiceClient()

  // Rimuovi la foto precedente (se presente) per non lasciare orfani
  const supabase = await createClient()
  const { data: prev } = await supabase
    .from('scadenze')
    .select('foto_path')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType })
  if (uploadError) return { error: uploadError.message }

  const { error: dbError } = await supabase
    .from('scadenze')
    .update({ foto_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
  if (dbError) {
    await service.storage.from(BUCKET).remove([storagePath])
    return { error: dbError.message }
  }

  if (prev?.foto_path && prev.foto_path !== storagePath) {
    await service.storage.from(BUCKET).remove([prev.foto_path])
  }

  revalidatePath('/commesse', 'layout')
  return { path: storagePath }
}

export async function removeFotoScadenza(scadenzaId: string, path: string): Promise<void> {
  const orgId = await getOrgId()
  await createServiceClient().storage.from(BUCKET).remove([path])
  const supabase = await createClient()
  const { error } = await supabase
    .from('scadenze')
    .update({ foto_path: null, updated_at: new Date().toISOString() })
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function getFotoScadenzaUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/** Aggiunge/rimuove una scadenza dallo slot "Calcoli" */
export async function toggleCalcoliScadenza(id: string, value: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({ in_calcoli: value })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/** Scadenze selezionate per i Calcoli (tutti i blocchi) */
export async function getScadenzeCalcoli(): Promise<Scadenza[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('scadenze')
    .select('*')
    .eq('organization_id', orgId)
    .eq('in_calcoli', true)
    .order('data_scadenza', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({ ...s, importo: Number(s.importo) })) as Scadenza[]
}
