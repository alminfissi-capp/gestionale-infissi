'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type { FiltriCatalogo, CountReparto, CountGruppo, ArticoloCatalogo, PrezzoLive } from '@/types/catalogo-esp'
import type {
  Fornitore, FornitoreInput,
  CategoriaMagazzino,
  FinituraCategoria, FinituraCategoriaInput,
  PosizioneMagazzino, PosizioneInput,
  CatalogoArticolo,
  VarianteProdotto,
  MovimentoMagazzino,
  ArticoloMagazzinoConDettagli, ArticoloMagazzinoInput,
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

export type ProdottoConCategoria = CatalogoArticolo & {
  categoria: CategoriaMagazzino | null
  fornitore_principale: { nome: string } | null
  posizione: PosizioneMagazzino | null
  varianti: VarianteProdotto[]
}

export async function getProdotti(): Promise<ProdottoConCategoria[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('catalogo_articoli')
    .select(`
      *,
      categoria:categorie_magazzino(*),
      fornitore_principale:fornitori(nome),
      posizione:posizioni_magazzino(*),
      varianti:varianti_prodotto(*)
    `)
    .order('descrizione', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProdottoConCategoria[]
}

export type ProdottoInput = {
  codice: string
  descrizione: string
  um?: string
  reparto?: number | null
  gruppo?: string | null
  categoria_id?: string | null
  prezzo_acquisto?: number | null
  peso_al_metro?: number | null
  lunghezza_default?: number | null
  posizione_id?: string | null
  fornitore_principale_id?: string | null
  soglia_minima?: number | null
  soglia_abilitata: boolean
  foto_url?: string | null
  dxf_url?: string | null
  note?: string | null
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
    .from('catalogo_articoli')
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
    .from('catalogo_articoli')
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

  // Elimina prima i movimenti (FK RESTRICT), poi le varianti (CASCADE), poi il prodotto
  await supabase.from('movimenti_magazzino').delete().eq('prodotto_id', id)

  const { error } = await supabase.from('catalogo_articoli').delete().eq('id', id)
  if (error) throw new Error(error.message)

  const pathsToDelete = [fotoUrl, dxfUrl].filter(Boolean) as string[]
  if (pathsToDelete.length > 0) {
    await supabase.storage.from('magazzino').remove(pathsToDelete)
  }

  revalidatePath('/magazzino/prodotti')
}

// ---- Movimenti ----

export type MovimentoConDettagli = MovimentoMagazzino & {
  prodotto: { codice: string; descrizione: string; um: string }
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
      prodotto:catalogo_articoli(codice, descrizione, um),
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
  unita_misura: string       // raw ESP um
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
      .from('catalogo_articoli')
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
      if (a.prodotto_id !== b.prodotto_id) return a.prodotto_id.localeCompare(b.prodotto_id)
      const an = a.finitura_nome ?? a.variante_nome ?? ''
      const bn = b.finitura_nome ?? b.variante_nome ?? ''
      return an.localeCompare(bn, 'it')
    })
}

// ---- Inventario semplice (articoli_magazzino) ----

export async function listArticoliMagazzino(): Promise<ArticoloMagazzinoConDettagli[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('articoli_magazzino')
    .select(`
      *,
      prodotto:catalogo_articoli(id, codice, descrizione, um, categoria_id, foto_url, dxf_url),
      posizione:posizioni_magazzino(id, nome),
      fornitore:fornitori(id, nome)
    `)
    .eq('organization_id', orgId)
    .order('ordine', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ArticoloMagazzinoConDettagli[]
}

export async function createArticoloMagazzino(input: ArticoloMagazzinoInput): Promise<ArticoloMagazzinoConDettagli> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('articoli_magazzino')
    .insert({
      organization_id: orgId,
      prodotto_id: input.prodotto_id,
      finitura: input.finitura ?? null,
      quantita: input.quantita,
      quantita_2: input.quantita_2 ?? null,
      unita_misura_2: input.unita_misura_2 ?? null,
      posizione_id: input.posizione_id ?? null,
      fornitore_id: input.fornitore_id ?? null,
      commessa: input.commessa ?? null,
      note: input.note ?? null,
    })
    .select(`
      *,
      prodotto:catalogo_articoli(id, codice, descrizione, um, categoria_id, foto_url, dxf_url),
      posizione:posizioni_magazzino(id, nome),
      fornitore:fornitori(id, nome)
    `)
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/scorte')
  return data as ArticoloMagazzinoConDettagli
}

export async function updateArticoloMagazzino(id: string, input: Partial<ArticoloMagazzinoInput>): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('articoli_magazzino')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/scorte')
}

export async function updateQuantitaArticolo(id: string, quantita: number): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('articoli_magazzino')
    .update({ quantita, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/scorte')
}

export async function deleteArticoloMagazzino(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('articoli_magazzino')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/scorte')
}

export async function duplicaArticoloMagazzino(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: orig, error: fetchErr } = await supabase
    .from('articoli_magazzino')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()
  if (fetchErr || !orig) throw new Error('Articolo non trovato')
  const { error } = await supabase.from('articoli_magazzino').insert({
    organization_id: orgId,
    prodotto_id: orig.prodotto_id,
    finitura: orig.finitura,
    quantita: orig.quantita,
    quantita_2: orig.quantita_2,
    unita_misura_2: orig.unita_misura_2,
    posizione_id: orig.posizione_id,
    fornitore_id: orig.fornitore_id,
    commessa: orig.commessa,
    note: orig.note,
    ordine: orig.ordine,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/magazzino/scorte')
}

// ---- Catalogo ESP ----

const CATALOGO_ESP_PAGE_SIZE = 50

export async function getProdottiCatalogoESP(
  filtri: FiltriCatalogo
): Promise<{ prodotti: ArticoloCatalogo[]; totale: number }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const pagina = filtri.pagina ?? 1
  const offset = (pagina - 1) * CATALOGO_ESP_PAGE_SIZE

  let query = supabase
    .from('catalogo_articoli')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)

  if (filtri.reparto !== undefined && filtri.reparto !== null) {
    query = query.eq('reparto', filtri.reparto)
  }
  if (filtri.gruppo !== undefined && filtri.gruppo !== null) {
    query = query.eq('gruppo', filtri.gruppo)
  }
  if (filtri.cerca) {
    query = query.or(`codice.ilike.%${filtri.cerca}%,descrizione.ilike.%${filtri.cerca}%`)
  }

  const { data, error, count } = await query
    .order('descrizione', { ascending: true })
    .range(offset, offset + CATALOGO_ESP_PAGE_SIZE - 1)

  if (error) throw new Error(error.message)
  return { prodotti: (data ?? []) as ArticoloCatalogo[], totale: count ?? 0 }
}

export async function getRepartiConteggio(): Promise<CountReparto[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase.rpc('get_reparti_conteggio', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: { reparto: number; cnt: number }) => ({
    reparto: Number(r.reparto),
    cnt: Number(r.cnt),
  }))
}

export async function getGruppiConteggio(reparto: number): Promise<CountGruppo[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase.rpc('get_gruppi_conteggio', {
    p_org_id: orgId,
    p_reparto: reparto,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: { gruppo: string | null; cnt: number }) => ({
    gruppo: r.gruppo,
    cnt: Number(r.cnt),
  }))
}

// ---- Cache prezzi (lettura bulk lato server) ----

export async function getPrezziCache(codici: string[]): Promise<Record<string, PrezzoLive>> {
  if (codici.length === 0) return {}
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('catalogo_prezzi')
    .select('*')
    .eq('organization_id', orgId)
    .in('codice', codici)
  const map: Record<string, PrezzoLive> = {}
  for (const r of data ?? []) {
    map[r.codice] = {
      codice:         r.codice,
      prezzo:         r.prezzo,
      disponibile_al: r.disponibile_al,
      disponibile_ct: r.disponibile_ct,
      qty_al:         r.qty_al,
      qty_ct:         r.qty_ct,
      fetched_at:     r.fetched_at,
      da_cache:       true,
    }
  }
  return map
}

// ---- Prezzi live dal backend ESP ----

const PREZZO_TTL_MS = 12 * 60 * 60 * 1000  // 12 ore — lo scraper è lento, non riscrapare troppo spesso

export async function warmupESPBackend(): Promise<void> {
  const backendUrl = process.env.ESP_BACKEND_URL ?? 'http://localhost:3001'
  const espApiKey  = process.env.ESP_API_SECRET
  if (!espApiKey) return
  try {
    await fetch(`${backendUrl}/api/warmup`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${espApiKey}` },
      signal:  AbortSignal.timeout(90000),
    })
  } catch { /* fire and forget — gli errori non interessano */ }
}

export async function getPrezzoLive(codice: string, reparto?: number | null): Promise<PrezzoLive | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // 1. Controlla cache in catalogo_prezzi (fresca < 24h)
  const { data: cached } = await supabase
    .from('catalogo_prezzi')
    .select('*')
    .eq('organization_id', orgId)
    .eq('codice', codice)
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age < PREZZO_TTL_MS) {
      return {
        codice: cached.codice,
        prezzo: cached.prezzo,
        disponibile_al: cached.disponibile_al,
        disponibile_ct: cached.disponibile_ct,
        qty_al: cached.qty_al,
        qty_ct: cached.qty_ct,
        fetched_at: cached.fetched_at,
        da_cache: true,
      }
    }
  }

  // 2. Fetch live dal backend ESP
  const backendUrl = process.env.ESP_BACKEND_URL ?? 'http://localhost:3001'
  try {
    const espApiKey = process.env.ESP_API_SECRET
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (espApiKey) headers['Authorization'] = `Bearer ${espApiKey}`

    const params = new URLSearchParams({ q: codice })
    if (reparto != null) params.set('reparto', String(reparto))

    const res = await fetch(`${backendUrl}/api/item?${params}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(90000),
      headers,
    })
    // 404 = articolo non trovato sul CRM → non restituire cache scaduta (sarebbe un falso "sincronizzato")
    if (res.status === 404) return null
    if (!res.ok) {
      // Errore di rete/server → fallback a cache scaduta se disponibile
      if (cached) return { codice, prezzo: cached.prezzo, disponibile_al: cached.disponibile_al, disponibile_ct: cached.disponibile_ct, qty_al: cached.qty_al, qty_ct: cached.qty_ct, fetched_at: cached.fetched_at, da_cache: true }
      return null
    }

    const json = await res.json()

    const parsePrezzo = (v: unknown) => {
      if (v == null) return null
      const n = parseFloat(String(v).replace(/[€\s]/g, '').replace(',', '.'))
      return isNaN(n) ? null : n
    }

    const priceRow = {
      organization_id: orgId,
      codice,
      prezzo:         parsePrezzo(json.prezzo),
      disponibile_al: Boolean(json.disponibile_al),
      disponibile_ct: Boolean(json.disponibile_ct),
      qty_al:         Number(json.qty_al ?? 0),
      qty_ct:         Number(json.qty_ct ?? 0),
    }

    // Salva prezzo in catalogo_prezzi
    await supabase.from('catalogo_prezzi').upsert(priceRow, { onConflict: 'organization_id,codice' })

    // Aggiorna descrizione, um e immagine_url in catalogo_articoli con i dati freschi dal CRM
    const campiDaAggiornare: Record<string, string> = {}
    if (json.descrizione) campiDaAggiornare.descrizione = json.descrizione
    if (json.immagine_url) campiDaAggiornare.immagine_url = json.immagine_url
    if (json.um)           campiDaAggiornare.um           = json.um

    if (Object.keys(campiDaAggiornare).length > 0) {
      const service = createServiceClient()
      await service
        .from('catalogo_articoli')
        .update({ ...campiDaAggiornare, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('codice', codice)
    }

    revalidatePath('/magazzino/catalogo')

    return {
      ...priceRow,
      fetched_at:  new Date().toISOString(),
      da_cache:    false,
      descrizione: json.descrizione ?? null,
      um:          json.um ?? null,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    if (isTimeout) throw new Error('timeout')
    if (cached) return { codice, prezzo: cached.prezzo, disponibile_al: cached.disponibile_al, disponibile_ct: cached.disponibile_ct, qty_al: cached.qty_al, qty_ct: cached.qty_ct, fetched_at: cached.fetched_at, da_cache: true }
    return null
  }
}
