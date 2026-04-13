'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { settingsSchema, type SettingsInput } from '@/lib/validations/impostazioniSchema'
import type { Settings, NoteTemplate } from '@/types/impostazioni'
import { getOrgId } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'

const getSettingsByOrg = (orgId: string) =>
  unstable_cache(
    async (): Promise<Settings | null> => {
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    [`settings-${orgId}`],
    { tags: [`settings-${orgId}`], revalidate: false }
  )

export async function getSettings(): Promise<Settings | null> {
  const orgId = await getOrgId()
  return getSettingsByOrg(orgId)()
}

export async function saveSettings(input: SettingsInput): Promise<void> {
  const validated = settingsSchema.parse(input)
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('settings')
    .upsert({ organization_id: orgId, ...validated }, { onConflict: 'organization_id' })

  if (error) throw new Error(error.message)
  revalidateTag(`settings-${orgId}`, {})
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
  revalidateTag(`settings-${orgId}`, {})
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

const getNoteTemplatesByOrg = (orgId: string) =>
  unstable_cache(
    async (): Promise<NoteTemplate[]> => {
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('note_templates')
        .select('*')
        .eq('organization_id', orgId)
        .order('ordine')
      if (error) throw new Error(error.message)
      return data ?? []
    },
    [`note-templates-${orgId}`],
    { tags: [`note-templates-${orgId}`], revalidate: false }
  )

export async function getNoteTemplates(): Promise<NoteTemplate[]> {
  const orgId = await getOrgId()
  return getNoteTemplatesByOrg(orgId)()
}

export async function saveAliquoteIva(aliquote: number[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('settings')
    .upsert({ organization_id: orgId, aliquote_iva: aliquote }, { onConflict: 'organization_id' })
  if (error) throw new Error(error.message)
  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
}

export type NumerazioneInput = {
  num_prefisso: string | null
  num_prefisso_calcoli: string | null
  num_operatore: string | null
  num_padding: number
}

export async function saveNumerazione(input: NumerazioneInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('settings')
    .upsert(
      {
        organization_id: orgId,
        num_prefisso: input.num_prefisso?.trim() || null,
        num_prefisso_calcoli: input.num_prefisso_calcoli?.trim() || null,
        num_operatore: input.num_operatore?.trim().toUpperCase().charAt(0) || null,
        num_padding: Math.max(1, Math.min(5, input.num_padding)),
      },
      { onConflict: 'organization_id' }
    )

  if (error) throw new Error(error.message)
  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
}

export async function saveGiorniValidita(giorni: number): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('settings')
    .upsert(
      { organization_id: orgId, giorni_validita_preventivo: Math.max(1, giorni) },
      { onConflict: 'organization_id' }
    )
  if (error) throw new Error(error.message)
  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
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

  revalidateTag(`note-templates-${orgId}`, {})
  revalidatePath('/impostazioni')
  revalidatePath('/preventivi/nuovo')
}
