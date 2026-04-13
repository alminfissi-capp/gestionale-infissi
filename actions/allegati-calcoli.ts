'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'

export async function addAllegatoCalcoli(
  preventivoId: string,
  nome: string,
  storagePath: string
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: last } = await supabase
    .from('allegati_calcoli')
    .select('ordine')
    .eq('preventivo_id', preventivoId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ordine = last ? last.ordine + 1 : 0

  const { error } = await supabase.from('allegati_calcoli').insert({
    organization_id: orgId,
    preventivo_id: preventivoId,
    nome,
    storage_path: storagePath,
    ordine,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${preventivoId}`)
}

export async function deleteAllegatoCalcoli(
  id: string,
  storagePath: string,
  preventivoId: string
): Promise<void> {
  const supabase = await createClient()

  await supabase.storage.from('allegati-calcoli').remove([storagePath])

  const { error } = await supabase.from('allegati_calcoli').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${preventivoId}`)
}
