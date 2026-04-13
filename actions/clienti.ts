'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { clienteSchema, type ClienteInput } from '@/lib/validations/clienteSchema'
import type { Cliente } from '@/types/cliente'
import { getOrgId } from '@/lib/auth'

export async function getClienti(): Promise<Cliente[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clienti')
    .select('*')
    .order('cognome', { ascending: true, nullsFirst: false })
    .order('nome', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createCliente(input: ClienteInput): Promise<{ id: string }> {
  const validated = clienteSchema.parse(input)
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('clienti')
    .insert({ ...validated, organization_id: orgId })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/clienti')
  return { id: data.id }
}

export async function updateCliente(id: string, input: ClienteInput): Promise<void> {
  const validated = clienteSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase
    .from('clienti')
    .update({ ...validated, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/clienti')
}

export async function deleteCliente(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('clienti')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/clienti')
}
