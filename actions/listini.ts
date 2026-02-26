'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CategoriaConListini, FinituraCategoria } from '@/types/listino'

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

// Esposto per i Client Component che necessitano dell'orgId (es. upload Storage)
export async function getCurrentOrgId(): Promise<string> {
  return getOrgId()
}

// ---- Categorie ----

export async function getCategorie(): Promise<CategoriaConListini[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorie_listini')
    .select('*, finiture_categoria(*), listini(*, finiture(*))')
    .order('ordine')

  if (error) throw new Error(error.message)

  return (data ?? []).map((cat) => ({
    ...cat,
    finiture_categoria: (cat.finiture_categoria ?? []).sort(
      (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
    ),
    listini: (cat.listini ?? [])
      .sort((a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine)
      .map((l: { finiture: { ordine: number }[] }) => ({
        ...l,
        finiture: (l.finiture ?? []).sort(
          (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
        ),
      })),
  }))
}

export type CategoriaOpzioniInput = {
  nome: string
  icona: string
  trasporto_costo_unitario: number
  trasporto_costo_minimo: number
  trasporto_minimo_pezzi: number
  sconto_fornitore: number
  sconto_massimo: number
  finiture_categoria: { nome: string; aumento_percentuale: number; aumento_euro: number }[]
}

export async function createCategoria(
  data: CategoriaOpzioniInput
): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { finiture_categoria, ...categoriaData } = data

  const { data: result, error } = await supabase
    .from('categorie_listini')
    .insert({ ...categoriaData, organization_id: orgId })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (finiture_categoria.length > 0) {
    const { error: fErr } = await supabase
      .from('finiture_categoria')
      .insert(
        finiture_categoria.map((f, i) => ({
          ...f,
          categoria_id: result.id,
          organization_id: orgId,
          ordine: i,
        }))
      )
    if (fErr) throw new Error(fErr.message)
  }

  revalidatePath('/listini')
  return { id: result.id }
}

export async function updateCategoria(
  id: string,
  data: CategoriaOpzioniInput
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { finiture_categoria, ...categoriaData } = data

  const { error } = await supabase
    .from('categorie_listini')
    .update({ ...categoriaData, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Sostituisce tutte le finiture categoria (delete + re-insert)
  await supabase.from('finiture_categoria').delete().eq('categoria_id', id)

  if (finiture_categoria.length > 0) {
    const { error: fErr } = await supabase
      .from('finiture_categoria')
      .insert(
        finiture_categoria.map((f, i) => ({
          ...f,
          categoria_id: id,
          organization_id: orgId,
          ordine: i,
        }))
      )
    if (fErr) throw new Error(fErr.message)
  }

  revalidatePath('/listini')
}

export async function deleteCategoria(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('categorie_listini').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/listini')
}

// ---- Listini ----

export async function createListino(data: {
  categoria_id: string
  tipologia: string
  larghezze: number[]
  altezze: number[]
  griglia: Record<string, Record<string, number>>
  finiture: { nome: string; aumento: number; aumento_euro: number }[]
  immagine_url?: string | null
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { finiture, ...listinoData } = data

  const { data: result, error } = await supabase
    .from('listini')
    .insert({ ...listinoData, organization_id: orgId })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (finiture.length > 0) {
    const { error: fErr } = await supabase
      .from('finiture')
      .insert(finiture.map((f, i) => ({ ...f, listino_id: result.id, ordine: i })))
    if (fErr) throw new Error(fErr.message)
  }

  revalidatePath('/listini')
  return { id: result.id }
}

export async function updateListino(
  id: string,
  data: {
    tipologia: string
    larghezze: number[]
    altezze: number[]
    griglia: Record<string, Record<string, number>>
    finiture: { nome: string; aumento: number; aumento_euro: number }[]
    immagine_url?: string | null
  }
): Promise<void> {
  const supabase = await createClient()
  const { finiture, ...listinoData } = data

  const { error } = await supabase
    .from('listini')
    .update({ ...listinoData, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Sostituisce tutte le finiture
  await supabase.from('finiture').delete().eq('listino_id', id)

  if (finiture.length > 0) {
    const { error: fErr } = await supabase
      .from('finiture')
      .insert(finiture.map((f, i) => ({ ...f, listino_id: id, ordine: i })))
    if (fErr) throw new Error(fErr.message)
  }

  revalidatePath('/listini')
}

export async function deleteListino(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('listini').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/listini')
}
