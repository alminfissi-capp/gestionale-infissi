'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  calcolaSubtotale,
  calcolaSpeseTrasportoPezzi,
  calcolaTotalePreventivo,
  calcolaTotalePezzi,
} from '@/lib/pricing'
import type {
  Preventivo,
  PreventivoCompleto,
  PreventivoInput,
  ArticoloPreventivoRow,
} from '@/types/preventivo'

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

type RegolaCategoria = {
  categoriaId: string
  unitario: number
  minimo: number
  minPezzi: number
}

/** Recupera le regole di trasporto per un set di listino_id */
async function getRegoleTrasporto(
  listinoIds: string[]
): Promise<Map<string, RegolaCategoria>> {
  if (listinoIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data } = await supabase
    .from('listini')
    .select('id, categoria_id, categorie_listini!inner(trasporto_costo_unitario, trasporto_costo_minimo, trasporto_minimo_pezzi)')
    .in('id', listinoIds)

  const result = new Map<string, RegolaCategoria>()
  for (const l of data ?? []) {
    const cat = l.categorie_listini as unknown as {
      trasporto_costo_unitario: number
      trasporto_costo_minimo: number
      trasporto_minimo_pezzi: number
    }
    result.set(l.id, {
      categoriaId: l.categoria_id,
      unitario: cat.trasporto_costo_unitario,
      minimo: cat.trasporto_costo_minimo,
      minPezzi: cat.trasporto_minimo_pezzi,
    })
  }
  return result
}

/** Calcola spese trasporto totali raggruppando per categoria */
async function calcolaSpeseTrasportoInput(
  articoli: PreventivoInput['articoli']
): Promise<number> {
  const listinoIds = [...new Set(
    articoli.map((a) => a.listino_id).filter((id): id is string => !!id)
  )]

  const regole = await getRegoleTrasporto(listinoIds)

  // Raggruppa pezzi per categoria
  const pezziPerCat = new Map<string, { pezzi: number; regola: RegolaCategoria }>()
  for (const articolo of articoli) {
    if (!articolo.listino_id) continue
    const regola = regole.get(articolo.listino_id)
    if (!regola) continue
    const existing = pezziPerCat.get(regola.categoriaId)
    if (existing) {
      existing.pezzi += articolo.quantita
    } else {
      pezziPerCat.set(regola.categoriaId, { pezzi: articolo.quantita, regola })
    }
  }

  let totale = 0
  for (const { pezzi, regola } of pezziPerCat.values()) {
    totale += calcolaSpeseTrasportoPezzi(pezzi, regola.unitario, regola.minimo, regola.minPezzi)
  }
  return totale
}

export async function getPreventivi(): Promise<Preventivo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('preventivi')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getPreventivo(id: string): Promise<PreventivoCompleto | null> {
  const supabase = await createClient()
  const [{ data: prev, error: prevErr }, { data: articoli, error: artErr }] =
    await Promise.all([
      supabase.from('preventivi').select('*').eq('id', id).single(),
      supabase
        .from('articoli_preventivo')
        .select('*')
        .eq('preventivo_id', id)
        .order('ordine'),
    ])

  if (prevErr || !prev) return null
  if (artErr) throw new Error(artErr.message)
  return { ...prev, articoli: articoli ?? [] }
}

export async function getArticoliPreventivo(
  preventivoId: string
): Promise<ArticoloPreventivoRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articoli_preventivo')
    .select('*')
    .eq('preventivo_id', preventivoId)
    .order('ordine')

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createPreventivo(input: PreventivoInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // Ricalcola tutti i totali server-side con trasporto per-categoria
  const totalePezzi = calcolaTotalePezzi(input.articoli)
  const subtotale = calcolaSubtotale(input.articoli)
  const speseTrasporto = await calcolaSpeseTrasportoInput(input.articoli)
  const { importoSconto, totaleArticoli, totaleFinale } = calcolaTotalePreventivo(
    subtotale,
    input.scontoGlobale,
    speseTrasporto
  )

  const { data: prev, error: prevErr } = await supabase
    .from('preventivi')
    .insert({
      organization_id: orgId,
      cliente_id: input.clienteId || null,
      numero: input.numero || null,
      cliente_snapshot: input.clienteSnapshot,
      sconto_globale: input.scontoGlobale,
      note: input.note || null,
      subtotale,
      importo_sconto: importoSconto,
      totale_articoli: totaleArticoli,
      spese_trasporto: speseTrasporto,
      totale_finale: totaleFinale,
      totale_pezzi: totalePezzi,
    })
    .select('id')
    .single()

  if (prevErr) throw new Error(prevErr.message)

  if (input.articoli.length > 0) {
    const { error: artErr } = await supabase.from('articoli_preventivo').insert(
      input.articoli.map((a, i) => ({
        ...a,
        preventivo_id: prev.id,
        organization_id: orgId,
        ordine: i,
      }))
    )
    if (artErr) {
      // Rollback manuale: elimina il preventivo orfano
      await supabase.from('preventivi').delete().eq('id', prev.id)
      throw new Error(artErr.message)
    }
  }

  revalidatePath('/preventivi')
  return { id: prev.id }
}

export async function updatePreventivo(
  id: string,
  input: PreventivoInput
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const totalePezzi = calcolaTotalePezzi(input.articoli)
  const subtotale = calcolaSubtotale(input.articoli)
  const speseTrasporto = await calcolaSpeseTrasportoInput(input.articoli)
  const { importoSconto, totaleArticoli, totaleFinale } = calcolaTotalePreventivo(
    subtotale,
    input.scontoGlobale,
    speseTrasporto
  )

  const { error: prevErr } = await supabase
    .from('preventivi')
    .update({
      cliente_id: input.clienteId || null,
      numero: input.numero || null,
      cliente_snapshot: input.clienteSnapshot,
      sconto_globale: input.scontoGlobale,
      note: input.note || null,
      subtotale,
      importo_sconto: importoSconto,
      totale_articoli: totaleArticoli,
      spese_trasporto: speseTrasporto,
      totale_finale: totaleFinale,
      totale_pezzi: totalePezzi,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (prevErr) throw new Error(prevErr.message)

  // Sostituisce tutti gli articoli
  await supabase.from('articoli_preventivo').delete().eq('preventivo_id', id)

  if (input.articoli.length > 0) {
    const { error: artErr } = await supabase.from('articoli_preventivo').insert(
      input.articoli.map((a, i) => ({
        ...a,
        preventivo_id: id,
        organization_id: orgId,
        ordine: i,
      }))
    )
    if (artErr) throw new Error(artErr.message)
  }

  revalidatePath('/preventivi')
  revalidatePath(`/preventivi/${id}`)
}

export async function deletePreventivo(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('preventivi').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/preventivi')
}
