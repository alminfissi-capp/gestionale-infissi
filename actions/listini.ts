'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CategoriaConListini, FinituraCategoria, TipoCategoria } from '@/types/listino'

export type AccessorioGrigliaInput = {
  gruppo: string
  gruppo_tipo: 'multiplo' | 'unico'
  nome: string
  tipo_prezzo: 'pezzo' | 'mq' | 'percentuale'
  prezzo: number
  prezzo_acquisto: number
  mq_minimo: number | null
}

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
    .select(`
      *,
      finiture_categoria(*),
      listini(*, finiture(*), accessori_griglia(*)),
      listini_liberi(*, prodotti_listino(*), accessori_listino(*)),
      listini_su_misura(*, finiture_su_misura(*), gruppi_accessori_su_misura(*, accessori_su_misura(*)))
    `)
    .order('ordine')

  if (error) throw new Error(error.message)

  return (data ?? []).map((cat) => ({
    ...cat,
    tipo: (cat.tipo ?? 'griglia') as TipoCategoria,
    finiture_categoria: (cat.finiture_categoria ?? []).sort(
      (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
    ),
    listini: (cat.listini ?? [])
      .sort((a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine)
      .map((l: { finiture: { ordine: number }[]; accessori_griglia: { ordine: number }[] }) => ({
        ...l,
        finiture: (l.finiture ?? []).sort(
          (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
        ),
        accessori_griglia: (l.accessori_griglia ?? []).sort(
          (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
        ),
      })),
    listini_liberi: (cat.listini_liberi ?? [])
      .sort((a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine)
      .map((ll: { prodotti_listino: { ordine: number }[]; accessori_listino: { ordine: number }[] }) => ({
        ...ll,
        prodotti: (ll.prodotti_listino ?? []).sort(
          (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
        ),
        accessori: (ll.accessori_listino ?? []).sort(
          (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
        ),
      })),
    listini_su_misura: (cat.listini_su_misura ?? [])
      .sort((a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine)
      .map((lsm: {
        finiture_su_misura: { ordine: number }[]
        gruppi_accessori_su_misura: { ordine: number; accessori_su_misura: { ordine: number }[] }[]
      }) => ({
        ...lsm,
        finiture: (lsm.finiture_su_misura ?? []).sort(
          (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
        ),
        gruppi_accessori: (lsm.gruppi_accessori_su_misura ?? [])
          .sort((a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine)
          .map((g: { ordine: number; accessori_su_misura: { ordine: number }[] }) => ({
            ...g,
            accessori: (g.accessori_su_misura ?? []).sort(
              (a: { ordine: number }, b: { ordine: number }) => a.ordine - b.ordine
            ),
          })),
      })),
  }))
}

export type CategoriaOpzioniInput = {
  nome: string
  icona: string
  tipo?: TipoCategoria
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

  const { count: catCount } = await supabase
    .from('categorie_listini')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const { data: result, error } = await supabase
    .from('categorie_listini')
    .insert({ ...categoriaData, tipo: categoriaData.tipo ?? 'griglia', organization_id: orgId, ordine: catCount ?? 0 })
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
  const { finiture_categoria, tipo: _tipo, ...categoriaData } = data

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

// ---- Listini (griglia) ----

export async function createListino(data: {
  categoria_id: string
  tipologia: string
  larghezze: number[]
  altezze: number[]
  griglia: Record<string, Record<string, number>>
  finiture: { nome: string; aumento: number; aumento_euro: number }[]
  accessori?: AccessorioGrigliaInput[]
  immagine_url?: string | null
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { finiture, accessori, ...listinoData } = data

  const { count } = await supabase
    .from('listini')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', data.categoria_id)

  const { data: result, error } = await supabase
    .from('listini')
    .insert({ ...listinoData, organization_id: orgId, ordine: count ?? 0 })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (finiture.length > 0) {
    const { error: fErr } = await supabase
      .from('finiture')
      .insert(finiture.map((f, i) => ({ ...f, listino_id: result.id, ordine: i })))
    if (fErr) throw new Error(fErr.message)
  }

  if (accessori && accessori.length > 0) {
    const { error: aErr } = await supabase
      .from('accessori_griglia')
      .insert(accessori.map((a, i) => ({ ...a, listino_id: result.id, organization_id: orgId, ordine: i })))
    if (aErr) throw new Error(aErr.message)
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
    accessori?: AccessorioGrigliaInput[]
    immagine_url?: string | null
  }
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { finiture, accessori, ...listinoData } = data

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

  // Sostituisce tutti gli accessori
  await supabase.from('accessori_griglia').delete().eq('listino_id', id)

  if (accessori && accessori.length > 0) {
    const { error: aErr } = await supabase
      .from('accessori_griglia')
      .insert(accessori.map((a, i) => ({ ...a, listino_id: id, organization_id: orgId, ordine: i })))
    if (aErr) throw new Error(aErr.message)
  }

  revalidatePath('/listini')
}

export async function updateOrdiniCategorie(updates: { id: string; ordine: number }[]): Promise<void> {
  const supabase = await createClient()
  await Promise.all(
    updates.map(({ id, ordine }) => supabase.from('categorie_listini').update({ ordine }).eq('id', id))
  )
  revalidatePath('/listini')
}

export async function updateOrdiniListini(updates: { id: string; ordine: number }[]): Promise<void> {
  const supabase = await createClient()
  await Promise.all(
    updates.map(({ id, ordine }) => supabase.from('listini').update({ ordine }).eq('id', id))
  )
  revalidatePath('/listini')
}

export async function deleteListino(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('listini').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/listini')
}

export async function duplicaListino(id: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: listino, error } = await supabase
    .from('listini')
    .select('*, finiture(*), accessori_griglia(*)')
    .eq('id', id)
    .single()

  if (error || !listino) throw new Error('Listino non trovato')

  // Trova nome univoco per la copia
  const { data: existing } = await supabase
    .from('listini')
    .select('tipologia')
    .eq('categoria_id', listino.categoria_id)

  const existingNames = new Set((existing ?? []).map((l: { tipologia: string }) => l.tipologia))
  let newTipologia = `Copia di ${listino.tipologia}`
  let counter = 2
  while (existingNames.has(newTipologia)) {
    newTipologia = `Copia di ${listino.tipologia} (${counter++})`
  }

  const { data: newListino, error: createErr } = await supabase
    .from('listini')
    .insert({
      organization_id: orgId,
      categoria_id: listino.categoria_id,
      tipologia: newTipologia,
      larghezze: listino.larghezze,
      altezze: listino.altezze,
      griglia: listino.griglia,
      immagine_url: listino.immagine_url,
      ordine: listino.ordine + 1,
    })
    .select('id')
    .single()

  if (createErr || !newListino) throw new Error(createErr?.message ?? 'Errore duplicazione')

  if (listino.finiture && listino.finiture.length > 0) {
    const { error: fErr } = await supabase
      .from('finiture')
      .insert(
        listino.finiture.map((f: { nome: string; aumento: number; aumento_euro: number; ordine: number }, i: number) => ({
          listino_id: newListino.id,
          nome: f.nome,
          aumento: f.aumento,
          aumento_euro: f.aumento_euro,
          ordine: f.ordine ?? i,
        }))
      )
    if (fErr) throw new Error(fErr.message)
  }

  if (listino.accessori_griglia && listino.accessori_griglia.length > 0) {
    const { error: aErr } = await supabase
      .from('accessori_griglia')
      .insert(
        listino.accessori_griglia.map((a: { gruppo: string; gruppo_tipo: string; nome: string; tipo_prezzo: string; prezzo: number; prezzo_acquisto: number; mq_minimo: number | null; ordine: number }) => ({
          listino_id: newListino.id,
          organization_id: orgId,
          gruppo: a.gruppo,
          gruppo_tipo: a.gruppo_tipo,
          nome: a.nome,
          tipo_prezzo: a.tipo_prezzo,
          prezzo: a.prezzo,
          prezzo_acquisto: a.prezzo_acquisto,
          mq_minimo: a.mq_minimo,
          ordine: a.ordine,
        }))
      )
    if (aErr) throw new Error(aErr.message)
  }

  revalidatePath('/listini')
  return { id: newListino.id }
}

export async function duplicaCategoria(id: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: categoria, error } = await supabase
    .from('categorie_listini')
    .select('*, finiture_categoria(*), listini(*, finiture(*), accessori_griglia(*))')
    .eq('id', id)
    .single()

  if (error || !categoria) throw new Error('Categoria non trovata')

  const { data: newCat, error: catErr } = await supabase
    .from('categorie_listini')
    .insert({
      organization_id: orgId,
      nome: `Copia di ${categoria.nome}`,
      icona: categoria.icona,
      tipo: categoria.tipo ?? 'griglia',
      ordine: categoria.ordine + 1,
      trasporto_costo_unitario: categoria.trasporto_costo_unitario,
      trasporto_costo_minimo: categoria.trasporto_costo_minimo,
      trasporto_minimo_pezzi: categoria.trasporto_minimo_pezzi,
      sconto_fornitore: categoria.sconto_fornitore,
      sconto_massimo: categoria.sconto_massimo,
    })
    .select('id')
    .single()

  if (catErr || !newCat) throw new Error(catErr?.message ?? 'Errore duplicazione categoria')

  if (categoria.finiture_categoria?.length > 0) {
    const { error: fcErr } = await supabase
      .from('finiture_categoria')
      .insert(
        categoria.finiture_categoria.map((f: { nome: string; aumento_percentuale: number; aumento_euro: number; ordine: number }) => ({
          organization_id: orgId,
          categoria_id: newCat.id,
          nome: f.nome,
          aumento_percentuale: f.aumento_percentuale,
          aumento_euro: f.aumento_euro,
          ordine: f.ordine,
        }))
      )
    if (fcErr) throw new Error(fcErr.message)
  }

  for (const listino of (categoria.listini ?? [])) {
    const { data: newListino, error: lErr } = await supabase
      .from('listini')
      .insert({
        organization_id: orgId,
        categoria_id: newCat.id,
        tipologia: listino.tipologia,
        larghezze: listino.larghezze,
        altezze: listino.altezze,
        griglia: listino.griglia,
        immagine_url: listino.immagine_url,
        ordine: listino.ordine,
      })
      .select('id')
      .single()

    if (lErr || !newListino) throw new Error(lErr?.message ?? 'Errore duplicazione listino')

    if (listino.finiture?.length > 0) {
      const { error: fErr } = await supabase
        .from('finiture')
        .insert(
          listino.finiture.map((f: { nome: string; aumento: number; aumento_euro: number; ordine: number }) => ({
            listino_id: newListino.id,
            nome: f.nome,
            aumento: f.aumento,
            aumento_euro: f.aumento_euro,
            ordine: f.ordine,
          }))
        )
      if (fErr) throw new Error(fErr.message)
    }

    if (listino.accessori_griglia?.length > 0) {
      const { error: aErr } = await supabase
        .from('accessori_griglia')
        .insert(
          listino.accessori_griglia.map((a: { gruppo: string; gruppo_tipo: string; nome: string; tipo_prezzo: string; prezzo: number; prezzo_acquisto: number; mq_minimo: number | null; ordine: number }) => ({
            listino_id: newListino.id,
            organization_id: orgId,
            gruppo: a.gruppo,
            gruppo_tipo: a.gruppo_tipo,
            nome: a.nome,
            tipo_prezzo: a.tipo_prezzo,
            prezzo: a.prezzo,
            prezzo_acquisto: a.prezzo_acquisto,
            mq_minimo: a.mq_minimo,
            ordine: a.ordine,
          }))
        )
      if (aErr) throw new Error(aErr.message)
    }
  }

  revalidatePath('/listini')
  return { id: newCat.id }
}

// ---- Listini liberi ----

export type ListinoLiberoInput = {
  categoria_id: string
  tipologia: string
  prodotti: {
    nome: string
    prezzo: number
    prezzo_acquisto: number
    descrizione?: string | null
    immagine_url?: string | null
  }[]
  accessori: {
    nome: string
    prezzo: number
    prezzo_acquisto: number
  }[]
}

export async function createListinoLibero(data: ListinoLiberoInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { count: llCount } = await supabase
    .from('listini_liberi')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', data.categoria_id)

  const { data: result, error } = await supabase
    .from('listini_liberi')
    .insert({
      organization_id: orgId,
      categoria_id: data.categoria_id,
      tipologia: data.tipologia,
      ordine: llCount ?? 0,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (data.prodotti.length > 0) {
    const { error: pErr } = await supabase
      .from('prodotti_listino')
      .insert(
        data.prodotti.map((p, i) => ({
          organization_id: orgId,
          listino_libero_id: result.id,
          nome: p.nome,
          prezzo: p.prezzo,
          prezzo_acquisto: p.prezzo_acquisto,
          descrizione: p.descrizione ?? null,
          immagine_url: p.immagine_url ?? null,
          ordine: i,
        }))
      )
    if (pErr) throw new Error(pErr.message)
  }

  if (data.accessori.length > 0) {
    const { error: aErr } = await supabase
      .from('accessori_listino')
      .insert(
        data.accessori.map((a, i) => ({
          organization_id: orgId,
          listino_libero_id: result.id,
          nome: a.nome,
          prezzo: a.prezzo,
          prezzo_acquisto: a.prezzo_acquisto,
          ordine: i,
        }))
      )
    if (aErr) throw new Error(aErr.message)
  }

  revalidatePath('/listini')
  return { id: result.id }
}

export async function updateListinoLibero(
  id: string,
  data: Omit<ListinoLiberoInput, 'categoria_id'>
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('listini_liberi')
    .update({ tipologia: data.tipologia, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Sostituisce prodotti e accessori (delete + re-insert)
  await supabase.from('prodotti_listino').delete().eq('listino_libero_id', id)
  await supabase.from('accessori_listino').delete().eq('listino_libero_id', id)

  if (data.prodotti.length > 0) {
    const { error: pErr } = await supabase
      .from('prodotti_listino')
      .insert(
        data.prodotti.map((p, i) => ({
          organization_id: orgId,
          listino_libero_id: id,
          nome: p.nome,
          prezzo: p.prezzo,
          prezzo_acquisto: p.prezzo_acquisto,
          descrizione: p.descrizione ?? null,
          immagine_url: p.immagine_url ?? null,
          ordine: i,
        }))
      )
    if (pErr) throw new Error(pErr.message)
  }

  if (data.accessori.length > 0) {
    const { error: aErr } = await supabase
      .from('accessori_listino')
      .insert(
        data.accessori.map((a, i) => ({
          organization_id: orgId,
          listino_libero_id: id,
          nome: a.nome,
          prezzo: a.prezzo,
          prezzo_acquisto: a.prezzo_acquisto,
          ordine: i,
        }))
      )
    if (aErr) throw new Error(aErr.message)
  }

  revalidatePath('/listini')
}

export async function deleteListinoLibero(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('listini_liberi').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/listini')
}

export async function duplicaListinoLibero(id: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: ll, error } = await supabase
    .from('listini_liberi')
    .select('*, prodotti_listino(*), accessori_listino(*)')
    .eq('id', id)
    .single()

  if (error || !ll) throw new Error('Listino non trovato')

  // Trova nome univoco
  const { data: existing } = await supabase
    .from('listini_liberi')
    .select('tipologia')
    .eq('categoria_id', ll.categoria_id)

  const existingNames = new Set((existing ?? []).map((l: { tipologia: string }) => l.tipologia))
  let newTipologia = `Copia di ${ll.tipologia}`
  let counter = 2
  while (existingNames.has(newTipologia)) {
    newTipologia = `Copia di ${ll.tipologia} (${counter++})`
  }

  const { data: newLl, error: createErr } = await supabase
    .from('listini_liberi')
    .insert({
      organization_id: orgId,
      categoria_id: ll.categoria_id,
      tipologia: newTipologia,
      ordine: ll.ordine + 1,
    })
    .select('id')
    .single()

  if (createErr || !newLl) throw new Error(createErr?.message ?? 'Errore duplicazione')

  if (ll.prodotti_listino?.length > 0) {
    const { error: pErr } = await supabase
      .from('prodotti_listino')
      .insert(
        ll.prodotti_listino.map((p: { nome: string; prezzo: number; prezzo_acquisto: number; descrizione: string | null; immagine_url: string | null; ordine: number }) => ({
          organization_id: orgId,
          listino_libero_id: newLl.id,
          nome: p.nome,
          prezzo: p.prezzo,
          prezzo_acquisto: p.prezzo_acquisto ?? 0,
          descrizione: p.descrizione,
          immagine_url: p.immagine_url,
          ordine: p.ordine,
        }))
      )
    if (pErr) throw new Error(pErr.message)
  }

  if (ll.accessori_listino?.length > 0) {
    const { error: aErr } = await supabase
      .from('accessori_listino')
      .insert(
        ll.accessori_listino.map((a: { nome: string; prezzo: number; prezzo_acquisto: number; ordine: number }) => ({
          organization_id: orgId,
          listino_libero_id: newLl.id,
          nome: a.nome,
          prezzo: a.prezzo,
          prezzo_acquisto: a.prezzo_acquisto ?? 0,
          ordine: a.ordine,
        }))
      )
    if (aErr) throw new Error(aErr.message)
  }

  revalidatePath('/listini')
  return { id: newLl.id }
}

export async function duplicaCategoriaLibera(id: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: categoria, error } = await supabase
    .from('categorie_listini')
    .select('*, listini_liberi(*, prodotti_listino(*), accessori_listino(*))')
    .eq('id', id)
    .single()

  if (error || !categoria) throw new Error('Categoria non trovata')

  const { data: newCat, error: catErr } = await supabase
    .from('categorie_listini')
    .insert({
      organization_id: orgId,
      nome: `Copia di ${categoria.nome}`,
      icona: categoria.icona,
      tipo: 'libero',
      ordine: categoria.ordine + 1,
      trasporto_costo_unitario: categoria.trasporto_costo_unitario,
      trasporto_costo_minimo: categoria.trasporto_costo_minimo,
      trasporto_minimo_pezzi: categoria.trasporto_minimo_pezzi,
      sconto_fornitore: categoria.sconto_fornitore,
      sconto_massimo: categoria.sconto_massimo,
    })
    .select('id')
    .single()

  if (catErr || !newCat) throw new Error(catErr?.message ?? 'Errore duplicazione categoria')

  for (const ll of (categoria.listini_liberi ?? [])) {
    // Inserisce il listino libero
    const { data: newLl, error: llErr } = await supabase
      .from('listini_liberi')
      .insert({
        organization_id: orgId,
        categoria_id: newCat.id,
        tipologia: ll.tipologia,
        ordine: ll.ordine,
      })
      .select('id')
      .single()

    if (llErr || !newLl) throw new Error(llErr?.message ?? 'Errore duplicazione listino libero')

    if (ll.prodotti_listino?.length > 0) {
      const { error: pErr } = await supabase
        .from('prodotti_listino')
        .insert(
          ll.prodotti_listino.map((p: { nome: string; prezzo: number; prezzo_acquisto: number; descrizione: string | null; immagine_url: string | null; ordine: number }) => ({
            organization_id: orgId,
            listino_libero_id: newLl.id,
            nome: p.nome,
            prezzo: p.prezzo,
            prezzo_acquisto: p.prezzo_acquisto ?? 0,
            descrizione: p.descrizione,
            immagine_url: p.immagine_url,
            ordine: p.ordine,
          }))
        )
      if (pErr) throw new Error(pErr.message)
    }

    if (ll.accessori_listino?.length > 0) {
      const { error: aErr } = await supabase
        .from('accessori_listino')
        .insert(
          ll.accessori_listino.map((a: { nome: string; prezzo: number; prezzo_acquisto: number; ordine: number }) => ({
            organization_id: orgId,
            listino_libero_id: newLl.id,
            nome: a.nome,
            prezzo: a.prezzo,
            prezzo_acquisto: a.prezzo_acquisto ?? 0,
            ordine: a.ordine,
          }))
        )
      if (aErr) throw new Error(aErr.message)
    }
  }

  revalidatePath('/listini')
  return { id: newCat.id }
}

/** Aggiunge più accessori griglia a tutti i listini di una categoria in una sola operazione */
export async function addAccessoriATuttiListini(
  categoriaId: string,
  accessori: AccessorioGrigliaInput[]
): Promise<{ count: number }> {
  if (accessori.length === 0) return { count: 0 }

  const supabase = await createClient()
  const orgId = await getOrgId()

  // Recupera tutti i listini della categoria
  const { data: listini, error: lErr } = await supabase
    .from('listini')
    .select('id')
    .eq('categoria_id', categoriaId)
    .eq('organization_id', orgId)
  if (lErr) throw new Error(lErr.message)
  if (!listini || listini.length === 0) return { count: 0 }

  const listinoIds = listini.map((l) => l.id)

  // Recupera il max ordine per ogni listino (per appendere in fondo)
  const { data: ordini } = await supabase
    .from('accessori_griglia')
    .select('listino_id, ordine')
    .in('listino_id', listinoIds)
    .order('ordine', { ascending: false })

  const maxOrdineMap = new Map<string, number>()
  for (const row of ordini ?? []) {
    if (!maxOrdineMap.has(row.listino_id)) {
      maxOrdineMap.set(row.listino_id, row.ordine)
    }
  }

  // Per ogni listino, inserisce tutti gli accessori con ordine progressivo
  const insertData = listinoIds.flatMap((id) => {
    const base = (maxOrdineMap.get(id) ?? -1) + 1
    return accessori.map((a, i) => ({
      listino_id: id,
      organization_id: orgId,
      gruppo: a.gruppo,
      gruppo_tipo: a.gruppo_tipo,
      nome: a.nome,
      tipo_prezzo: a.tipo_prezzo,
      prezzo: a.prezzo,
      prezzo_acquisto: a.prezzo_acquisto,
      mq_minimo: a.mq_minimo,
      ordine: base + i,
    }))
  })

  const { error: iErr } = await supabase.from('accessori_griglia').insert(insertData)
  if (iErr) throw new Error(iErr.message)

  revalidatePath('/listini')
  return { count: listini.length }
}

// Ri-esporta FinituraCategoria type per uso esterno
export type { FinituraCategoria }

// ── Listini su misura ─────────────────────────────────────────────────────────

export type FinituraSuMisuraInput = {
  nome: string
  tipo_maggiorazione: 'percentuale' | 'mq' | 'fisso'
  valore: number
  prezzo_acquisto: number
}

export type AccessorioSuMisuraInput = {
  nome: string
  unita: 'pz' | 'mq' | 'ml'
  prezzo: number
  prezzo_acquisto: number
  qty_modificabile: boolean
  qty_default: number
}

export type GruppoAccessoriSuMisuraInput = {
  nome: string
  tipo_scelta: 'singolo' | 'multiplo' | 'incluso'
  accessori: AccessorioSuMisuraInput[]
}

export type ListinoSuMisuraInput = {
  categoria_id: string
  nome: string
  descrizione: string
  prezzo_mq: number
  prezzo_acquisto_mq: number
  larghezza_min: number
  larghezza_max: number
  altezza_min: number
  altezza_max: number
  mq_minimo: number
  immagine_url: string | null
  attivo: boolean
  finiture: FinituraSuMisuraInput[]
  gruppi_accessori: GruppoAccessoriSuMisuraInput[]
}

export async function createListinoSuMisura(
  input: ListinoSuMisuraInput
): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { count: ordine } = await supabase
    .from('listini_su_misura')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', input.categoria_id)

  const { data: listino, error: lErr } = await supabase
    .from('listini_su_misura')
    .insert({
      organization_id: orgId,
      categoria_id: input.categoria_id,
      nome: input.nome,
      descrizione: input.descrizione || null,
      prezzo_mq: input.prezzo_mq,
      prezzo_acquisto_mq: input.prezzo_acquisto_mq,
      larghezza_min: input.larghezza_min,
      larghezza_max: input.larghezza_max,
      altezza_min: input.altezza_min,
      altezza_max: input.altezza_max,
      mq_minimo: input.mq_minimo,
      immagine_url: input.immagine_url,
      attivo: input.attivo,
      ordine: ordine ?? 0,
    })
    .select('id')
    .single()

  if (lErr || !listino) throw new Error(lErr?.message ?? 'Errore creazione listino')

  if (input.finiture.length > 0) {
    const { error } = await supabase.from('finiture_su_misura').insert(
      input.finiture.map((f, i) => ({ ...f, listino_id: listino.id, organization_id: orgId, ordine: i }))
    )
    if (error) throw new Error(error.message)
  }

  for (let gi = 0; gi < input.gruppi_accessori.length; gi++) {
    const g = input.gruppi_accessori[gi]
    const { data: gruppo, error: gErr } = await supabase
      .from('gruppi_accessori_su_misura')
      .insert({ nome: g.nome, tipo_scelta: g.tipo_scelta, listino_id: listino.id, organization_id: orgId, ordine: gi })
      .select('id')
      .single()
    if (gErr || !gruppo) throw new Error(gErr?.message ?? 'Errore gruppo')

    if (g.accessori.length > 0) {
      const { error } = await supabase.from('accessori_su_misura').insert(
        g.accessori.map((a, i) => ({ ...a, gruppo_id: gruppo.id, organization_id: orgId, ordine: i }))
      )
      if (error) throw new Error(error.message)
    }
  }

  revalidatePath('/listini')
  return { id: listino.id }
}

export async function updateListinoSuMisura(
  id: string,
  input: ListinoSuMisuraInput
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error: lErr } = await supabase
    .from('listini_su_misura')
    .update({
      nome: input.nome,
      descrizione: input.descrizione || null,
      prezzo_mq: input.prezzo_mq,
      prezzo_acquisto_mq: input.prezzo_acquisto_mq,
      larghezza_min: input.larghezza_min,
      larghezza_max: input.larghezza_max,
      altezza_min: input.altezza_min,
      altezza_max: input.altezza_max,
      mq_minimo: input.mq_minimo,
      immagine_url: input.immagine_url,
      attivo: input.attivo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (lErr) throw new Error(lErr.message)

  // Rimpiazza finiture
  await supabase.from('finiture_su_misura').delete().eq('listino_id', id)
  if (input.finiture.length > 0) {
    const { error } = await supabase.from('finiture_su_misura').insert(
      input.finiture.map((f, i) => ({ ...f, listino_id: id, organization_id: orgId, ordine: i }))
    )
    if (error) throw new Error(error.message)
  }

  // Rimpiazza gruppi + accessori (cascata ON DELETE)
  await supabase.from('gruppi_accessori_su_misura').delete().eq('listino_id', id)
  for (let gi = 0; gi < input.gruppi_accessori.length; gi++) {
    const g = input.gruppi_accessori[gi]
    const { data: gruppo, error: gErr } = await supabase
      .from('gruppi_accessori_su_misura')
      .insert({ nome: g.nome, tipo_scelta: g.tipo_scelta, listino_id: id, organization_id: orgId, ordine: gi })
      .select('id')
      .single()
    if (gErr || !gruppo) throw new Error(gErr?.message ?? 'Errore gruppo')

    if (g.accessori.length > 0) {
      const { error } = await supabase.from('accessori_su_misura').insert(
        g.accessori.map((a, i) => ({ ...a, gruppo_id: gruppo.id, organization_id: orgId, ordine: i }))
      )
      if (error) throw new Error(error.message)
    }
  }

  revalidatePath('/listini')
}

export async function deleteListinoSuMisura(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('listini_su_misura').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/listini')
}
