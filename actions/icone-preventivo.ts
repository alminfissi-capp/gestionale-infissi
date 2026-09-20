'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type { IconaPreventivo } from '@/types/impostazioni'

/** La libreria di icone dell'organizzazione, nell'ordine in cui va mostrata. */
export async function getIconePreventivo(): Promise<IconaPreventivo[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('icone_preventivo')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine')
    .order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Registra le icone appena caricate. I file viaggiano dal browser direttamente a
 * Supabase Storage (sopra i ~4,5 MB una Server Action su Vercel fallirebbe in
 * silenzio): qui arrivano solo i path.
 *
 * Insert unico per tutte, e tutte con le stesse chiavi: PostgREST costruisce la
 * INSERT sulle chiavi del primo elemento, e un array disomogeneo riempirebbe di
 * NULL le colonne mancanti.
 */
export async function createIconePreventivo(
  icone: { nome: string; storage_path: string }[],
): Promise<void> {
  if (icone.length === 0) return
  const supabase = await createClient()
  const orgId = await getOrgId()

  // In coda alle esistenti, cosi' l'ordine di caricamento si conserva.
  const { data: ultima } = await supabase
    .from('icone_preventivo')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  const base = (ultima?.ordine ?? -1) + 1

  const { error } = await supabase.from('icone_preventivo').insert(
    icone.map((i, n) => ({
      organization_id: orgId,
      nome: i.nome.trim() || 'Icona',
      storage_path: i.storage_path,
      ordine: base + n,
    })),
  )
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}

export async function renameIconaPreventivo(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('icone_preventivo')
    .update({ nome: nome.trim() || 'Icona' })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}

/**
 * Toglie l'icona dalla libreria **senza cancellare il file**.
 *
 * I preventivi che la usano salvano il suo URL pubblico dentro `immagine_url`:
 * cancellare il file spaccherebbe l'immagine di documenti gia' mandati al
 * cliente per liberare qualche decina di KB.
 */
export async function deleteIconaPreventivo(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('icone_preventivo')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}
