'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FormaSerramentoDb, FormaSerramentoInput } from '@/types/rilievo'
import { getOrgId } from '@/lib/auth'

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

export async function importaFormeStandard(inputs: FormaSerramentoInput[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  // ordine base = dopo le forme esistenti
  const { data: existing } = await supabase
    .from('forme_serramento')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
  const baseOrdine = (existing?.[0]?.ordine ?? -1) + 1
  const rows = inputs.map((input, i) => ({
    organization_id: orgId,
    nome: input.nome,
    attiva: input.attiva,
    ordine: baseOrdine + i,
    shape: input.shape,
  }))
  const { error } = await supabase.from('forme_serramento').insert(rows)
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
