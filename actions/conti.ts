'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type { ContoCorrente, ContoCorrenteInput } from '@/types/commessa'

export async function getConti(): Promise<ContoCorrente[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('conti_correnti')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({
    ...c,
    saldo_attuale: Number(c.saldo_attuale),
    fido_accordato: Number(c.fido_accordato) || 0,
  })) as ContoCorrente[]
}

export async function createConto(input: ContoCorrenteInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('conti_correnti')
    .insert({
      nome: input.nome.trim(),
      saldo_attuale: input.saldo_attuale,
      fido_accordato: input.fido_accordato,
      organization_id: orgId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/commesse', 'layout')
  return { id: data.id }
}

export async function updateConto(id: string, input: ContoCorrenteInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('conti_correnti')
    .update({
      nome: input.nome.trim(),
      saldo_attuale: input.saldo_attuale,
      fido_accordato: input.fido_accordato,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/commesse', 'layout')
}

/** Aggiorna solo il saldo (usato dall'inline nei Calcoli) */
export async function updateSaldoConto(id: string, saldo: number): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('conti_correnti')
    .update({ saldo_attuale: saldo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/commesse', 'layout')
}

export async function deleteConto(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('conti_correnti')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/commesse', 'layout')
}
