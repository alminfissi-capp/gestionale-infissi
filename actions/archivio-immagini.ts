'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import type { ArchivioCategoriaConImmagini } from '@/types/impostazioni'

const BUCKET = 'archivio-immagini'

/** Categorie con le loro immagini, nell'ordine in cui vanno mostrate */
export async function getArchivioImmagini(): Promise<ArchivioCategoriaConImmagini[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [cat, img] = await Promise.all([
    supabase.from('archivio_categorie').select('id, nome, ordine').eq('organization_id', orgId).order('ordine').order('created_at'),
    supabase.from('archivio_immagini').select('id, categoria_id, nome, storage_path, ordine').eq('organization_id', orgId).order('ordine').order('created_at'),
  ])
  if (cat.error) throw new Error(cat.error.message)
  if (img.error) throw new Error(img.error.message)
  return (cat.data ?? []).map(c => ({ ...c, immagini: (img.data ?? []).filter(i => i.categoria_id === c.id) }))
}

export async function createCategoriaArchivio(nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: ultima } = await supabase.from('archivio_categorie').select('ordine')
    .eq('organization_id', orgId).order('ordine', { ascending: false }).limit(1).maybeSingle()
  const { error } = await supabase.from('archivio_categorie').insert({
    organization_id: orgId, nome: nome.trim() || 'Categoria', ordine: (ultima?.ordine ?? -1) + 1,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}

export async function renameCategoriaArchivio(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase.from('archivio_categorie').update({ nome: nome.trim() || 'Categoria' })
    .eq('id', id).eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}

/**
 * Elimina la categoria, le sue immagini e i loro file. Si puo': i preventivi hanno
 * la loro copia di ogni immagine scelta, non puntano all'archivio.
 */
export async function deleteCategoriaArchivio(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase.from('archivio_immagini').select('storage_path')
    .eq('organization_id', orgId).eq('categoria_id', id)
  if (error) throw new Error(error.message)
  const paths = (data ?? []).map(d => d.storage_path)
  for (let i = 0; i < paths.length; i += 100) {
    const { error: e } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (e) throw new Error(e.message)
  }
  // Le righe delle immagini se ne vanno con la categoria (ON DELETE CASCADE)
  const { error: e2 } = await supabase.from('archivio_categorie').delete().eq('id', id).eq('organization_id', orgId)
  if (e2) throw new Error(e2.message)
  revalidatePath('/impostazioni')
}

/**
 * Registra le immagini appena caricate dal browser (i file vanno direttamente su
 * Storage: sopra ~4,5 MB una Server Action su Vercel fallirebbe in silenzio).
 * Tutte con le stesse chiavi: PostgREST costruisce la INSERT sul primo elemento.
 */
export async function createImmaginiArchivio(categoriaId: string, immagini: { nome: string; storage_path: string }[]): Promise<void> {
  if (immagini.length === 0) return
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: ultima } = await supabase.from('archivio_immagini').select('ordine')
    .eq('organization_id', orgId).eq('categoria_id', categoriaId).order('ordine', { ascending: false }).limit(1).maybeSingle()
  const base = (ultima?.ordine ?? -1) + 1
  const { error } = await supabase.from('archivio_immagini').insert(immagini.map((x, n) => ({
    organization_id: orgId, categoria_id: categoriaId, nome: x.nome.trim() || 'Immagine', storage_path: x.storage_path, ordine: base + n,
  })))
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}

export async function renameImmagineArchivio(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase.from('archivio_immagini').update({ nome: nome.trim() || 'Immagine' })
    .eq('id', id).eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
}

/** Elimina l'immagine e il suo file (i preventivi hanno la loro copia) */
export async function deleteImmagineArchivio(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase.from('archivio_immagini').select('storage_path')
    .eq('id', id).eq('organization_id', orgId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return
  const { error: e1 } = await supabase.storage.from(BUCKET).remove([data.storage_path])
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await supabase.from('archivio_immagini').delete().eq('id', id).eq('organization_id', orgId)
  if (e2) throw new Error(e2.message)
  revalidatePath('/impostazioni')
}
