'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type {
  Fornitore, FornitoreInput,
  CategoriaMagazzino,
  FinituraCategoria, FinituraCategoriaInput,
  PosizioneMagazzino, PosizioneInput,
  AnagraficaProdotto, UnitaMisura,
  VarianteProdotto,
  MovimentoMagazzino,
} from '@/types/magazzino'

// ---- Org helper (for client-side Storage uploads) ----

export async function getCurrentOrgId(): Promise<string> {
  return getOrgId()
}

// ---- Public URL (bucket pubblico) ----

export async function getMagazzinoPublicUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data } = supabase.storage.from('magazzino').getPublicUrl(path)
  return data.publicUrl
}

export async function getMagazzinoPublicUrls(paths: string[], supabaseUrl: string): Promise<Record<string, string>> {
  return Object.fromEntries(
    paths.map((path) => [
      path,
      `${supabaseUrl}/storage/v1/object/public/magazzino/${path}`,
    ])
  )
}

export async function getMagazzinoSignedUrl(path: string): Promise<string> {
  return getMagazzinoPublicUrl(path)
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
  revalidatePath('/magazzino/impostazioni')
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
  revalidatePath('/magazzino/impostazioni')
  revalidatePath('/magazzino/fornitori')
}

export async function deleteFornitore(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('fornitori').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/impostazioni')
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

export async function getCategorieMagazzinoByTipo(tipo: import('@/types/magazzino').TipoCategoriaMagazzino): Promise<CategoriaMagazzino[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorie_magazzino')
    .select('*')
    .eq('tipo', tipo)
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
  revalidatePath(`/magazzino/categorie/${input.tipo}`)
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
  revalidatePath(`/magazzino/categorie/${input.tipo}`)
}

export async function deleteCategoriaMagazzino(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('categorie_magazzino').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/categorie', 'layout')
}

// ---- Finiture Categoria ----

export async function getFinitureByCategoriaId(categoriaId: string): Promise<FinituraCategoria[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finiture_magazzino')
    .select('*')
    .eq('categoria_id', categoriaId)
    .order('ordine', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function saveFinitureCategoriaAll(
  categoriaId: string,
  finiture: FinituraCategoriaInput[],
  toDelete: string[]
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  if (toDelete.length > 0) {
    const { error } = await supabase.from('finiture_magazzino').delete().in('id', toDelete)
    if (error) throw new Error(error.message)
  }

  if (finiture.length > 0) {
    const rows = finiture.map((f, i) => ({
      categoria_id: categoriaId,
      organization_id: orgId,
      nome: f.nome,
      costo_per_kg: f.costo_per_kg ?? null,
      costo_per_metro: f.costo_per_metro ?? null,
      ordine: f.ordine ?? i,
    }))
    const { error } = await supabase.from('finiture_magazzino').insert(rows)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/magazzino/categorie')
  revalidatePath('/magazzino/movimenti')
}

// ---- Posizioni Magazzino ----

export async function getPosizioni(): Promise<PosizioneMagazzino[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posizioni_magazzino')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createPosizione(input: PosizioneInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('posizioni_magazzino')
    .insert({ ...input, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/impostazioni')
  revalidatePath('/magazzino/prodotti')
  return { id: data.id }
}

export async function updatePosizione(id: string, input: PosizioneInput): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('posizioni_magazzino')
    .update(input)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/impostazioni')
  revalidatePath('/magazzino/prodotti')
}

export async function deletePosizione(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('posizioni_magazzino').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/impostazioni')
  revalidatePath('/magazzino/prodotti')
}

// ---- Prodotti ----

export type ProdottoConCategoria = AnagraficaProdotto & {
  categoria: CategoriaMagazzino | null
  fornitore_principale: { nome: string } | null
  posizione: PosizioneMagazzino | null
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
      posizione:posizioni_magazzino(*),
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
  peso_al_metro?: number | null
  lunghezza_default?: number | null
  posizione_id?: string | null
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
  finitura: { nome: string } | null
}

export type MovimentoInput = {
  tipo: 'entrata' | 'uscita'
  prodotto_id: string
  variante_id?: string | null
  quantita: number
  prezzo_unitario?: number | null
  finitura_id?: string | null
  lunghezza?: number | null
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
      fornitore:fornitori(nome),
      finitura:finiture_magazzino(nome)
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
  finiture_nomi: string[]
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

  const ids = [...new Set((data ?? []).map((r) => r.prodotto_id as string))]
  if (ids.length === 0) return []

  const [{ data: soglie }, { data: movFinitura }] = await Promise.all([
    supabase
      .from('anagrafica_prodotti')
      .select('id, soglia_minima, soglia_abilitata')
      .in('id', ids),
    supabase
      .from('movimenti_magazzino')
      .select('prodotto_id, finitura:finiture_magazzino(nome)')
      .in('prodotto_id', ids)
      .not('finitura_id', 'is', null),
  ])

  const soglieMap = Object.fromEntries((soglie ?? []).map((s) => [s.id, s]))

  const finitureMap: Record<string, Set<string>> = {}
  for (const m of movFinitura ?? []) {
    const nome = (m.finitura as unknown as { nome: string } | null)?.nome
    if (nome) {
      if (!finitureMap[m.prodotto_id]) finitureMap[m.prodotto_id] = new Set()
      finitureMap[m.prodotto_id].add(nome)
    }
  }

  return (data ?? []).map((r) => ({
    ...r,
    giacenza_attuale: Number(r.giacenza_attuale),
    soglia_minima: soglieMap[r.prodotto_id]?.soglia_minima ?? null,
    soglia_abilitata: soglieMap[r.prodotto_id]?.soglia_abilitata ?? false,
    finiture_nomi: Array.from(finitureMap[r.prodotto_id] ?? []),
  })) as GiacenzaConSoglia[]
}

export type GiacenzaBreakdownRow = {
  variante_id: string | null
  variante_nome: string | null
  finitura_id: string | null
  finitura_nome: string | null
  commessa_ref: string | null
  lunghezza: number | null
  giacenza: number
}

export async function getGiacenzaDettaglioProdotto(prodottoId: string): Promise<GiacenzaBreakdownRow[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('movimenti_magazzino')
    .select(`
      variante_id,
      variante:varianti_prodotto(nome),
      finitura_id,
      finitura:finiture_magazzino(nome),
      commessa_ref,
      lunghezza,
      tipo,
      quantita
    `)
    .eq('organization_id', orgId)
    .eq('prodotto_id', prodottoId)

  if (error) throw new Error(error.message)

  const map = new Map<string, GiacenzaBreakdownRow>()
  for (const row of data ?? []) {
    const key = `${row.variante_id ?? ''}|${row.finitura_id ?? ''}|${row.commessa_ref ?? ''}|${row.lunghezza ?? ''}`
    const delta = row.tipo === 'entrata' ? Number(row.quantita) : -Number(row.quantita)
    const existing = map.get(key)
    if (existing) {
      existing.giacenza += delta
    } else {
      map.set(key, {
        variante_id: row.variante_id ?? null,
        variante_nome: (row.variante as unknown as { nome: string } | null)?.nome ?? null,
        finitura_id: row.finitura_id ?? null,
        finitura_nome: (row.finitura as unknown as { nome: string } | null)?.nome ?? null,
        commessa_ref: row.commessa_ref ?? null,
        lunghezza: row.lunghezza ?? null,
        giacenza: delta,
      })
    }
  }

  return Array.from(map.values())
    .filter((r) => r.giacenza !== 0)
    .sort((a, b) => {
      const an = a.finitura_nome ?? a.variante_nome ?? a.commessa_ref ?? ''
      const bn = b.finitura_nome ?? b.variante_nome ?? b.commessa_ref ?? ''
      return an.localeCompare(bn, 'it')
    })
}

// ---- Giacenze flat (una riga per prodotto+finitura+lunghezza) ----

export type GiacenzaFlatRow = {
  prodotto_id: string
  variante_id: string | null
  variante_nome: string | null
  finitura_id: string | null
  finitura_nome: string | null
  lunghezza: number | null
  giacenza: number
  fornitori: string[]
  commesse: string[]
}

export async function getGiacenzeFlatAll(): Promise<GiacenzaFlatRow[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('movimenti_magazzino')
    .select(`
      prodotto_id,
      variante_id,
      variante:varianti_prodotto(nome),
      finitura_id,
      finitura:finiture_magazzino(nome),
      lunghezza,
      commessa_ref,
      fornitore:fornitori(nome),
      tipo,
      quantita
    `)
    .eq('organization_id', orgId)

  if (error) throw new Error(error.message)

  type MapVal = Omit<GiacenzaFlatRow, 'fornitori' | 'commesse'> & {
    fornitoriSet: Set<string>
    commesseSet: Set<string>
  }

  const map = new Map<string, MapVal>()

  for (const row of data ?? []) {
    const key = `${row.prodotto_id}|${row.variante_id ?? ''}|${row.finitura_id ?? ''}|${row.lunghezza ?? ''}`
    const delta = row.tipo === 'entrata' ? Number(row.quantita) : -Number(row.quantita)
    const existing = map.get(key)
    if (existing) {
      existing.giacenza += delta
      if (row.commessa_ref) existing.commesseSet.add(row.commessa_ref)
      const fn = (row.fornitore as unknown as { nome: string } | null)?.nome
      if (fn) existing.fornitoriSet.add(fn)
    } else {
      const fornitoreNome = (row.fornitore as unknown as { nome: string } | null)?.nome
      map.set(key, {
        prodotto_id: row.prodotto_id,
        variante_id: row.variante_id ?? null,
        variante_nome: (row.variante as unknown as { nome: string } | null)?.nome ?? null,
        finitura_id: row.finitura_id ?? null,
        finitura_nome: (row.finitura as unknown as { nome: string } | null)?.nome ?? null,
        lunghezza: row.lunghezza ?? null,
        giacenza: delta,
        fornitoriSet: new Set(fornitoreNome ? [fornitoreNome] : []),
        commesseSet: new Set(row.commessa_ref ? [row.commessa_ref] : []),
      })
    }
  }

  return Array.from(map.values())
    .map(({ fornitoriSet, commesseSet, ...rest }) => ({
      ...rest,
      fornitori: Array.from(fornitoriSet),
      commesse: Array.from(commesseSet),
    }))
    .sort((a, b) => {
      if (a.prodotto_id !== b.prodotto_id) return 0
      const an = a.finitura_nome ?? a.variante_nome ?? ''
      const bn = b.finitura_nome ?? b.variante_nome ?? ''
      return an.localeCompare(bn, 'it')
    })
}
