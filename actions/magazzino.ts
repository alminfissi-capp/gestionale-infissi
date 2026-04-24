'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type {
  Fornitore, FornitoreInput,
  CategoriaMagazzino,
  AnagraficaProdotto, UnitaMisura,
  VarianteProdotto,
  MovimentoMagazzino,
} from '@/types/magazzino'

// ---- Org helper (for client-side Storage uploads) ----

export async function getCurrentOrgId(): Promise<string> {
  return getOrgId()
}

// ---- Signed URL (private bucket) ----

export async function getMagazzinoSignedUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('magazzino')
    .createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function getMagazzinoSignedUrlsBatch(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('magazzino')
    .createSignedUrls(paths, 3600)
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]))
}

// ---- Fornitori ----

export async function getFornitori(): Promise<Fornitore[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fornitori')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createFornitore(input: FornitoreInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('fornitori')
    .insert({ ...input, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/fornitori')
  return { id: data.id }
}

export async function updateFornitore(id: string, input: FornitoreInput): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('fornitori')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/fornitori')
}

export async function deleteFornitore(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('fornitori').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/fornitori')
}

// ---- Categorie Magazzino ----

export async function getCategorieMagazzino(): Promise<CategoriaMagazzino[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorie_magazzino')
    .select('*')
    .order('ordine', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export type CategoriaMagazzinoInput = {
  nome: string
  tipo: import('@/types/magazzino').TipoCategoriaMagazzino
  ordine?: number
}

export async function createCategoriaMagazzino(input: CategoriaMagazzinoInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('categorie_magazzino')
    .insert({ ...input, ordine: input.ordine ?? 0, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/categorie')
  return { id: data.id }
}

export async function updateCategoriaMagazzino(id: string, input: CategoriaMagazzinoInput): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categorie_magazzino')
    .update(input)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/categorie')
}

export async function deleteCategoriaMagazzino(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('categorie_magazzino').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/categorie')
}

// ---- Prodotti ----

export type ProdottoConCategoria = AnagraficaProdotto & {
  categoria: CategoriaMagazzino | null
  fornitore_principale: { nome: string } | null
  varianti: VarianteProdotto[]
}

export async function getProdotti(): Promise<ProdottoConCategoria[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('anagrafica_prodotti')
    .select(`
      *,
      categoria:categorie_magazzino(*),
      fornitore_principale:fornitori(nome),
      varianti:varianti_prodotto(*)
    `)
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProdottoConCategoria[]
}

export type ProdottoInput = {
  codice: string
  nome: string
  descrizione?: string
  categoria_id?: string
  unita_misura: UnitaMisura
  prezzo_acquisto?: number | null
  fornitore_principale_id?: string | null
  soglia_minima?: number | null
  soglia_abilitata: boolean
  foto_url?: string | null
  dxf_url?: string | null
  note?: string
}

export type VarianteInput = {
  id?: string
  nome: string
  codice_variante?: string
}

export async function createProdotto(
  input: ProdottoInput,
  varianti: VarianteInput[]
): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('anagrafica_prodotti')
    .insert({ ...input, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (varianti.length > 0) {
    const { error: vErr } = await supabase
      .from('varianti_prodotto')
      .insert(varianti.map((v) => ({ prodotto_id: data.id, nome: v.nome, codice_variante: v.codice_variante || null })))
    if (vErr) throw new Error(vErr.message)
  }

  revalidatePath('/magazzino/prodotti')
  return { id: data.id }
}

export async function updateProdotto(
  id: string,
  input: ProdottoInput,
  varianti: VarianteInput[],
  variantiToDelete: string[]
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('anagrafica_prodotti')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (variantiToDelete.length > 0) {
    const { error: dErr } = await supabase
      .from('varianti_prodotto')
      .delete()
      .in('id', variantiToDelete)
    if (dErr) throw new Error(dErr.message)
  }

  const toUpsert = varianti.map((v) => ({
    ...(v.id ? { id: v.id } : {}),
    prodotto_id: id,
    nome: v.nome,
    codice_variante: v.codice_variante || null,
  }))

  if (toUpsert.length > 0) {
    const { error: uErr } = await supabase
      .from('varianti_prodotto')
      .upsert(toUpsert, { onConflict: 'id' })
    if (uErr) throw new Error(uErr.message)
  }

  revalidatePath('/magazzino/prodotti')
}

export async function deleteProdotto(id: string, fotoUrl?: string | null, dxfUrl?: string | null): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('anagrafica_prodotti').delete().eq('id', id)
  if (error) throw new Error(error.message)

  const pathsToDelete = [fotoUrl, dxfUrl].filter(Boolean) as string[]
  if (pathsToDelete.length > 0) {
    await supabase.storage.from('magazzino').remove(pathsToDelete)
  }

  revalidatePath('/magazzino/prodotti')
}

// ---- Movimenti ----

export type MovimentoConDettagli = MovimentoMagazzino & {
  prodotto: { codice: string; nome: string; unita_misura: UnitaMisura }
  variante: { nome: string } | null
  fornitore: { nome: string } | null
}

export type MovimentoInput = {
  tipo: 'entrata' | 'uscita'
  prodotto_id: string
  variante_id?: string | null
  quantita: number
  prezzo_unitario?: number | null
  fornitore_id?: string | null
  commessa_ref?: string | null
  data: string
  note?: string | null
}

export async function getMovimenti(): Promise<MovimentoConDettagli[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimenti_magazzino')
    .select(`
      *,
      prodotto:anagrafica_prodotti(codice, nome, unita_misura),
      variante:varianti_prodotto(nome),
      fornitore:fornitori(nome)
    `)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as MovimentoConDettagli[]
}

export async function createMovimento(input: MovimentoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('movimenti_magazzino')
    .insert({ ...input, organization_id: orgId })
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/movimenti')
  revalidatePath('/magazzino/giacenze')
}

export async function deleteMovimento(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('movimenti_magazzino').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/movimenti')
  revalidatePath('/magazzino/giacenze')
}

// ---- Giacenze ----

export type GiacenzaConSoglia = {
  prodotto_id: string
  codice: string
  prodotto_nome: string
  unita_misura: UnitaMisura
  variante_id: string | null
  variante_nome: string | null
  giacenza_attuale: number
  soglia_minima: number | null
  soglia_abilitata: boolean
}

export async function getGiacenze(): Promise<GiacenzaConSoglia[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('giacenze')
    .select(`
      prodotto_id, codice, prodotto_nome, unita_misura,
      variante_id, variante_nome, giacenza_attuale
    `)
    .order('prodotto_nome', { ascending: true })
  if (error) throw new Error(error.message)

  // join soglia from anagrafica_prodotti
  const ids = [...new Set((data ?? []).map((r) => r.prodotto_id as string))]
  if (ids.length === 0) return []

  const { data: soglie } = await supabase
    .from('anagrafica_prodotti')
    .select('id, soglia_minima, soglia_abilitata')
    .in('id', ids)

  const soglieMap = Object.fromEntries((soglie ?? []).map((s) => [s.id, s]))

  return (data ?? []).map((r) => ({
    ...r,
    giacenza_attuale: Number(r.giacenza_attuale),
    soglia_minima: soglieMap[r.prodotto_id]?.soglia_minima ?? null,
    soglia_abilitata: soglieMap[r.prodotto_id]?.soglia_abilitata ?? false,
  })) as GiacenzaConSoglia[]
}
