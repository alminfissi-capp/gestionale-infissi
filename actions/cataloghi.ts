'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Catalogo } from '@/types/catalogo'
import { getOrgId } from '@/lib/auth'

const BUCKET = 'cataloghi-brochure'

export async function getCataloghi(): Promise<Catalogo[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('cataloghi')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine')

  if (error) throw new Error(error.message)

  return (data ?? []).map((c) => ({
    ...c,
    url: supabase.storage.from(BUCKET).getPublicUrl(c.storage_path).data.publicUrl,
  }))
}

export async function createCatalogo(nome: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // ordine = max corrente + 1
  const { data: last } = await supabase
    .from('cataloghi')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .single()

  const ordine = last ? last.ordine + 1 : 0

  const { error } = await supabase.from('cataloghi').insert({
    organization_id: orgId,
    nome,
    storage_path: storagePath,
    ordine,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/cataloghi')
}

export async function deleteCatalogo(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()

  await supabase.storage.from(BUCKET).remove([storagePath])

  const { error } = await supabase.from('cataloghi').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cataloghi')
}

export async function reorderCataloghi(ids: string[]): Promise<void> {
  const supabase = await createClient()
  await Promise.all(
    ids.map((id, i) =>
      supabase.from('cataloghi').update({ ordine: i }).eq('id', id)
    )
  )
  revalidatePath('/cataloghi')
}
