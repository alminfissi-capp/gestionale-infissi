'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  calcolaSubtotale,
  calcolaSpeseTrasportoPezzi,
  calcolaTotalePreventivo,
  calcolaTotalePezzi,
  calcolaRiepilogoIva,
  calcolaCostoAcquistoUnitario,
} from '@/lib/pricing'
import { generaNumeroPreventivo } from '@/lib/numerazione'
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
  scontoFornitore: number
}

/** Recupera le regole di trasporto (e sconto fornitore) per un set di listino_id (griglia) */
async function getRegoleTrasporto(
  listinoIds: string[]
): Promise<Map<string, RegolaCategoria>> {
  if (listinoIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data } = await supabase
    .from('listini')
    .select('id, categoria_id, categorie_listini!inner(trasporto_costo_unitario, trasporto_costo_minimo, trasporto_minimo_pezzi, sconto_fornitore)')
    .in('id', listinoIds)

  const result = new Map<string, RegolaCategoria>()
  for (const l of data ?? []) {
    const cat = l.categorie_listini as unknown as {
      trasporto_costo_unitario: number
      trasporto_costo_minimo: number
      trasporto_minimo_pezzi: number
      sconto_fornitore: number
    }
    result.set(l.id, {
      categoriaId: l.categoria_id,
      unitario: cat.trasporto_costo_unitario,
      minimo: cat.trasporto_costo_minimo,
      minPezzi: cat.trasporto_minimo_pezzi,
      scontoFornitore: cat.sconto_fornitore ?? 0,
    })
  }
  return result
}

/** Recupera prezzo_acquisto per un set di prodotto_id (listino libero) */
async function getPrezzoAcquistoProdotti(
  prodottoIds: string[]
): Promise<Map<string, number>> {
  if (prodottoIds.length === 0) return new Map()
  const supabase = await createClient()
  const { data } = await supabase
    .from('prodotti_listino')
    .select('id, prezzo_acquisto')
    .in('id', prodottoIds)
  const result = new Map<string, number>()
  for (const p of data ?? []) {
    result.set(p.id, p.prezzo_acquisto ?? 0)
  }
  return result
}

/** Calcola spese trasporto totali raggruppando per categoria */
async function calcolaSpeseTrasportoInput(
  articoli: PreventivoInput['articoli'],
  regole: Map<string, RegolaCategoria>
): Promise<number> {
  // Raggruppa pezzi per categoria (solo articoli griglia)
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

/** Calcola costo_acquisto_unitario per ogni articolo e totale_costi_acquisto */
async function calcolaCostiAcquistoInput(
  articoli: PreventivoInput['articoli'],
  regole: Map<string, RegolaCategoria>
): Promise<{ articoliConCosto: (PreventivoInput['articoli'][number] & { costo_acquisto_unitario: number })[]; totaleCostiAcquisto: number }> {
  const prodottoIds = [...new Set(
    articoli.map((a) => a.prodotto_id).filter((id): id is string => !!id)
  )]
  const prezziAcquistoProdotti = await getPrezzoAcquistoProdotti(prodottoIds)

  // Valida che tutti i prodotto_id esistano ancora in DB (il listino potrebbe essere stato aggiornato)
  for (const a of articoli) {
    if (a.tipo === 'listino_libero' && a.prodotto_id && !prezziAcquistoProdotti.has(a.prodotto_id)) {
      throw new Error(
        'Uno o più prodotti del catalogo sono stati aggiornati nel listino. Torna alla lista preventivi, riapri questo preventivo in modifica e riseleziona gli articoli interessati.'
      )
    }
  }

  let totaleCostiAcquisto = 0
  const articoliConCosto = articoli.map((a) => {
    let costoUnitario = 0
    if (a.tipo === 'listino' && a.listino_id && a.prezzo_base != null) {
      const regola = regole.get(a.listino_id)
      costoUnitario = calcolaCostoAcquistoUnitario(a.prezzo_base, regola?.scontoFornitore ?? 0)
    } else if (a.tipo === 'listino_libero' && a.prodotto_id) {
      const costoProdotto = prezziAcquistoProdotti.get(a.prodotto_id) ?? 0
      const costoAccessori = (a.accessori_selezionati ?? []).reduce(
        (sum, acc) => sum + (acc.prezzo_acquisto ?? 0) * acc.qty, 0
      )
      costoUnitario = costoProdotto + costoAccessori
    }
    totaleCostiAcquisto += costoUnitario * a.quantita
    return { ...a, costo_acquisto_unitario: costoUnitario }
  })

  return { articoliConCosto, totaleCostiAcquisto }
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

  // ── Auto-numerazione ────────────────────────────────────────────────────────
  let numeroFinale = input.numero || null

  // Legge settings per la numerazione
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('num_prefisso, num_operatore, num_contatore, num_anno, num_padding')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (settingsRow?.num_prefisso) {
    const currentYear = new Date().getFullYear()
    const annoSettings = settingsRow.num_anno ?? 0
    const nuovoContatore = annoSettings !== currentYear ? 1 : (settingsRow.num_contatore ?? 0) + 1
    const nuovoAnno = currentYear

    // Aggiorna il contatore (incremento atomico)
    await supabase
      .from('settings')
      .update({ num_contatore: nuovoContatore, num_anno: nuovoAnno })
      .eq('organization_id', orgId)

    const s = input.clienteSnapshot
    const nomeCliente = [s.cognome, s.nome].filter(Boolean).join(' ') || s.email || s.telefono || ''

    numeroFinale = generaNumeroPreventivo(
      settingsRow.num_prefisso,
      nuovoContatore,
      nuovoAnno,
      settingsRow.num_operatore ?? null,
      settingsRow.num_padding ?? 2,
      nomeCliente
    )
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Fetch regole una sola volta (trasporto + sconto fornitore)
  const listinoIds = [...new Set(input.articoli.map((a) => a.listino_id).filter((id): id is string => !!id))]
  const regole = await getRegoleTrasporto(listinoIds)

  const totalePezzi = calcolaTotalePezzi(input.articoli)
  const subtotale = calcolaSubtotale(input.articoli)
  const speseTrasporto = await calcolaSpeseTrasportoInput(input.articoli, regole)
  const { articoliConCosto, totaleCostiAcquisto } = await calcolaCostiAcquistoInput(input.articoli, regole)
  const riepilogoIva = calcolaRiepilogoIva(input.articoli, input.scontoGlobale)
  const ivaTotale = riepilogoIva.reduce((sum, r) => sum + r.iva, 0)
  const { importoSconto, totaleArticoli, totaleFinale } = calcolaTotalePreventivo(
    subtotale,
    input.scontoGlobale,
    speseTrasporto,
    ivaTotale
  )

  const { data: prev, error: prevErr } = await supabase
    .from('preventivi')
    .insert({
      organization_id: orgId,
      cliente_id: input.clienteId || null,
      numero: numeroFinale,
      cliente_snapshot: input.clienteSnapshot,
      sconto_globale: input.scontoGlobale,
      note: input.note || null,
      subtotale,
      importo_sconto: importoSconto,
      totale_articoli: totaleArticoli,
      spese_trasporto: speseTrasporto,
      modalita_trasporto: input.modalitaTrasporto,
      totale_costi_acquisto: totaleCostiAcquisto,
      iva_totale: ivaTotale,
      riepilogo_iva: riepilogoIva,
      totale_finale: totaleFinale,
      totale_pezzi: totalePezzi,
    })
    .select('id')
    .single()

  if (prevErr) throw new Error(prevErr.message)

  if (articoliConCosto.length > 0) {
    const { error: artErr } = await supabase.from('articoli_preventivo').insert(
      articoliConCosto.map((a, i) => ({
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

  const listinoIds = [...new Set(input.articoli.map((a) => a.listino_id).filter((id): id is string => !!id))]
  const regole = await getRegoleTrasporto(listinoIds)

  const totalePezzi = calcolaTotalePezzi(input.articoli)
  const subtotale = calcolaSubtotale(input.articoli)
  const speseTrasporto = await calcolaSpeseTrasportoInput(input.articoli, regole)
  const { articoliConCosto, totaleCostiAcquisto } = await calcolaCostiAcquistoInput(input.articoli, regole)
  const riepilogoIva = calcolaRiepilogoIva(input.articoli, input.scontoGlobale)
  const ivaTotale = riepilogoIva.reduce((sum, r) => sum + r.iva, 0)
  const { importoSconto, totaleArticoli, totaleFinale } = calcolaTotalePreventivo(
    subtotale,
    input.scontoGlobale,
    speseTrasporto,
    ivaTotale
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
      modalita_trasporto: input.modalitaTrasporto,
      totale_costi_acquisto: totaleCostiAcquisto,
      iva_totale: ivaTotale,
      riepilogo_iva: riepilogoIva,
      totale_finale: totaleFinale,
      totale_pezzi: totalePezzi,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (prevErr) throw new Error(prevErr.message)

  // Sostituisce tutti gli articoli
  await supabase.from('articoli_preventivo').delete().eq('preventivo_id', id)

  if (articoliConCosto.length > 0) {
    const { error: artErr } = await supabase.from('articoli_preventivo').insert(
      articoliConCosto.map((a, i) => ({
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

  // Cleanup immagini voci libere da Storage prima di eliminare il preventivo
  const { data: articoliConImg } = await supabase
    .from('articoli_preventivo')
    .select('immagine_url')
    .eq('preventivo_id', id)
    .eq('tipo', 'libera')
    .not('immagine_url', 'is', null)

  if (articoliConImg && articoliConImg.length > 0) {
    const bucket = 'preventivi-allegati'
    const bucketPrefix = `/storage/v1/object/public/${bucket}/`
    const paths = articoliConImg
      .map((a) => {
        const url = a.immagine_url as string
        const idx = url.indexOf(bucketPrefix)
        return idx >= 0 ? url.slice(idx + bucketPrefix.length) : null
      })
      .filter((p): p is string => p !== null)
    if (paths.length > 0) {
      await supabase.storage.from(bucket).remove(paths)
    }
  }

  const { error } = await supabase.from('preventivi').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/preventivi')
}
