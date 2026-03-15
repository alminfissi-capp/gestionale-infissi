'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FormaSerramentoDb, FormaSerramentoInput } from '@/types/rilievo'

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

export async function getForme(): Promise<FormaSerramentoDb[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('forme_serramento')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getFormeAttive(): Promise<FormaSerramentoDb[]> {
  const forme = await getForme()
  return forme.filter((f) => f.attiva)
}

export async function createForma(input: FormaSerramentoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase.from('forme_serramento').insert({
    organization_id: orgId,
    nome: input.nome,
    attiva: input.attiva,
    ordine: input.ordine,
    shape: input.shape,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}

export async function updateForma(id: string, input: FormaSerramentoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('forme_serramento')
    .update({ nome: input.nome, attiva: input.attiva, ordine: input.ordine, shape: input.shape })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}

export async function deleteForma(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('forme_serramento')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}

export async function toggleFormaAttiva(id: string, attiva: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('forme_serramento')
    .update({ attiva })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}
