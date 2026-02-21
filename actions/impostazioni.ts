'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { settingsSchema, type SettingsInput } from '@/lib/validations/impostazioniSchema'
import type { Settings, NoteTemplate } from '@/types/impostazioni'

// Helper: restituisce organization_id dell'utente corrente
async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (error || !profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

export async function getSettings(): Promise<Settings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function saveSettings(input: SettingsInput): Promise<void> {
  const validated = settingsSchema.parse(input)
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('settings')
    .upsert({ organization_id: orgId, ...validated }, { onConflict: 'organization_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/', 'layout')
}

export async function saveLogoUrl(logoUrl: string | null): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('settings')
    .upsert({ organization_id: orgId, logo_url: logoUrl }, { onConflict: 'organization_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
  revalidatePath('/impostazioni')
}

export async function getLogoSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from('logos')
    .createSignedUrl(path, 3600) // 1 ora

  return data?.signedUrl ?? null
}

export async function getNoteTemplates(): Promise<NoteTemplate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('note_templates')
    .select('*')
    .order('ordine')

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function saveNoteTemplates(
  templates: { testo: string; ordine: number }[]
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // Rimpiazza tutti i template esistenti
  const { error: deleteError } = await supabase
    .from('note_templates')
    .delete()
    .eq('organization_id', orgId)

  if (deleteError) throw new Error(deleteError.message)

  if (templates.length > 0) {
    const { error: insertError } = await supabase
      .from('note_templates')
      .insert(templates.map((t) => ({ ...t, organization_id: orgId })))

    if (insertError) throw new Error(insertError.message)
  }

  revalidatePath('/impostazioni')
  revalidatePath('/preventivi/nuovo')
}
