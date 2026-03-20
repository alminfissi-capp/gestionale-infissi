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
import { clienteSchema } from '@/lib/validations/clienteSchema'
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

/** Recupera le regole di trasporto per un set di listino_libero_id (catalogo) */
async function getRegoleTrasportoLiberi(
  listinoLiberoIds: string[]
): Promise<Map<string, RegolaCategoria>> {
  if (listinoLiberoIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data } = await supabase
    .from('listini_liberi')
    .select('id, categoria_id, categorie_listini!inner(trasporto_costo_unitario, trasporto_costo_minimo, trasporto_minimo_pezzi, sconto_fornitore)')
    .in('id', listinoLiberoIds)

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

/** Calcola spese trasporto totali raggruppando per categoria (griglia + catalogo) */
function calcolaSpeseTrasportoInput(
  articoli: PreventivoInput['articoli'],
  regole: Map<string, RegolaCategoria>,
  regoleLiberi: Map<string, RegolaCategoria>
): number {
  const pezziPerCat = new Map<string, { pezzi: number; regola: RegolaCategoria }>()
  for (const articolo of articoli) {
    let regola: RegolaCategoria | undefined
    if (articolo.listino_id) {
      regola = regole.get(articolo.listino_id)
    } else if (articolo.listino_libero_id) {
      regola = regoleLiberi.get(articolo.listino_libero_id)
    }
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

type ArticoloConListino = {
  listino_id?: string | null
  listino_libero_id?: string | null
  quantita: number
  prezzo_totale_riga: number
}

/**
 * Calcola la quota di trasporto per ogni articolo, spalmando il costo della categoria
 * solo sugli articoli appartenenti a quella categoria (proporzionalmente al valore).
 * Restituisce un array parallelo agli articoli con la quota di trasporto per ciascuno.
 */
function calcolaQuoteTrasportoPerArticolo(
  articoli: ArticoloConListino[],
  regole: Map<string, RegolaCategoria>,
  regoleLiberi: Map<string, RegolaCategoria>
): number[] {
  const perCat = new Map<string, { pezzi: number; subtotaleCat: number; regola: RegolaCategoria; indices: number[] }>()

  for (let i = 0; i < articoli.length; i++) {
    const articolo = articoli[i]
    let regola: RegolaCategoria | undefined
    if (articolo.listino_id) regola = regole.get(articolo.listino_id)
    else if (articolo.listino_libero_id) regola = regoleLiberi.get(articolo.listino_libero_id)
    if (!regola) continue

    const existing = perCat.get(regola.categoriaId)
    if (existing) {
      existing.pezzi += articolo.quantita
      existing.subtotaleCat += articolo.prezzo_totale_riga
      existing.indices.push(i)
    } else {
      perCat.set(regola.categoriaId, {
        pezzi: articolo.quantita,
        subtotaleCat: articolo.prezzo_totale_riga,
        regola,
        indices: [i],
      })
    }
  }

  const quote = new Array<number>(articoli.length).fill(0)
  for (const { pezzi, subtotaleCat, regola, indices } of perCat.values()) {
    const trasportoCat = calcolaSpeseTrasportoPezzi(pezzi, regola.unitario, regola.minimo, regola.minPezzi)
    if (trasportoCat === 0 || subtotaleCat === 0) continue
    for (const i of indices) {
      quote[i] = trasportoCat * (articoli[i].prezzo_totale_riga / subtotaleCat)
    }
  }
  return quote
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
    } else if (a.tipo === 'libera') {
      costoUnitario = a.costo_acquisto_unitario
    }
    totaleCostiAcquisto += costoUnitario * a.quantita
    return { ...a, costo_acquisto_unitario: costoUnitario }
  })

  return { articoliConCosto, totaleCostiAcquisto }
}

export async function getPreventivi(): Promise<Preventivo[]> {
  const supabase = await createClient()

  // Legge i giorni di validità dalle impostazioni (default 30)
  const { data: settings } = await supabase
    .from('settings')
    .select('giorni_validita_preventivo')
    .maybeSingle()
  const giorniValidita = settings?.giorni_validita_preventivo ?? 30

  // Marca come scaduti i preventivi "inviato" con condiviso_at oltre il limite,
  // ma solo se non sono già accettati o rifiutati (RLS garantisce solo la propria org)
  await supabase
    .from('preventivi')
    .update({ stato: 'scaduto' })
    .eq('stato', 'inviato')
    .not('condiviso_at', 'is', null)
    .lt('condiviso_at', new Date(Date.now() - giorniValidita * 86400_000).toISOString())

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

  const ids: string[] = prev.cataloghi_allegati ?? []
  let cataloghi_allegati_data: { id: string; nome: string; url: string }[] = []
  if (ids.length > 0) {
    const { data: cats } = await supabase
      .from('cataloghi')
      .select('id, nome, storage_path')
      .in('id', ids)
    if (cats) {
      cataloghi_allegati_data = ids
        .map((id) => {
          const cat = cats.find((c) => c.id === id)
          if (!cat) return null
          return {
            id: cat.id,
            nome: cat.nome,
            url: supabase.storage.from('cataloghi-brochure').getPublicUrl(cat.storage_path).data.publicUrl,
          }
        })
        .filter(Boolean) as { id: string; nome: string; url: string }[]
    }
  }

  // Quote trasporto per articolo (per il report interno)
  const listinoIdsForQuote = [...new Set((articoli ?? []).map((a) => a.listino_id).filter((id): id is string => !!id))]
  const listinoLiberoIdsForQuote = [...new Set((articoli ?? []).map((a) => a.listino_libero_id).filter((id): id is string => !!id))]
  const [regoleForQuote, regoleLiberiForQuote] = await Promise.all([
    getRegoleTrasporto(listinoIdsForQuote),
    getRegoleTrasportoLiberi(listinoLiberoIdsForQuote),
  ])
  const quoteTrasporto = calcolaQuoteTrasportoPerArticolo(articoli ?? [], regoleForQuote, regoleLiberiForQuote)
  const articoliConQuota = (articoli ?? []).map((a, i) => ({ ...a, quota_trasporto: quoteTrasporto[i] ?? 0 }))

  // Allegati calcoli (PDF interni, bucket privato → URL firmati)
  let allegati_calcoli_data: { id: string; nome: string; storage_path: string; url: string }[] = []
  const { data: allegati } = await supabase
    .from('allegati_calcoli')
    .select('id, nome, storage_path')
    .eq('preventivo_id', id)
    .order('ordine')
  if (allegati && allegati.length > 0) {
    const signed = await Promise.all(
      allegati.map(async (a) => {
        const { data } = await supabase.storage
          .from('allegati-calcoli')
          .createSignedUrl(a.storage_path, 3600)
        return { id: a.id, nome: a.nome, storage_path: a.storage_path, url: data?.signedUrl ?? '' }
      })
    )
    allegati_calcoli_data = signed
  }

  return { ...prev, articoli: articoliConQuota, cataloghi_allegati_data, allegati_calcoli_data }
}

export async function setCataloghiAllegati(
  preventivoId: string,
  catalogoIds: string[]
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('preventivi')
    .update({ cataloghi_allegati: catalogoIds })
    .eq('id', preventivoId)
  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${preventivoId}`)
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

    numeroFinale = generaNumeroPreventivo(
      settingsRow.num_prefisso,
      nuovoContatore,
      nuovoAnno,
      settingsRow.num_operatore ?? null,
      settingsRow.num_padding ?? 2
    )
  }
  // ────────────────────────────────────────────────────────────────────────────

  // ── Auto-salvataggio cliente in anagrafica (solo inserimento manuale) ────────
  let clienteIdFinale = input.clienteId || null
  if (!clienteIdFinale) {
    const snap = input.clienteSnapshot
    const hasNome = snap.tipo === 'azienda'
      ? !!snap.ragione_sociale?.trim()
      : !!(snap.nome?.trim() || snap.cognome?.trim())
    if (hasNome) {
      const parsed = clienteSchema.safeParse({
        tipo: snap.tipo ?? 'privato',
        ragione_sociale: snap.ragione_sociale ?? null,
        nome: snap.nome ?? null,
        cognome: snap.cognome ?? null,
        telefono: snap.telefono ?? null,
        email: snap.email || null,
        via: snap.via ?? null,
        civico: snap.civico ?? null,
        cap: snap.cap ?? null,
        citta: snap.citta ?? null,
        provincia: snap.provincia ?? null,
        nazione: snap.nazione ?? null,
        codice_sdi: snap.codice_sdi ?? null,
        cantiere: snap.cantiere ?? null,
        cf_piva: snap.cf_piva ?? null,
      })
      if (parsed.success) {
        const { data: nuovoCliente } = await supabase
          .from('clienti')
          .insert({ ...parsed.data, organization_id: orgId })
          .select('id')
          .single()
        if (nuovoCliente) {
          clienteIdFinale = nuovoCliente.id
          revalidatePath('/clienti')
        }
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Fetch regole una sola volta (trasporto + sconto fornitore)
  const listinoIds = [...new Set(input.articoli.map((a) => a.listino_id).filter((id): id is string => !!id))]
  const listinoLiberoIds = [...new Set(input.articoli.map((a) => a.listino_libero_id).filter((id): id is string => !!id))]
  const [regole, regoleLiberi] = await Promise.all([
    getRegoleTrasporto(listinoIds),
    getRegoleTrasportoLiberi(listinoLiberoIds),
  ])

  const totalePezzi = calcolaTotalePezzi(input.articoli)
  const subtotale = calcolaSubtotale(input.articoli)
  const speseTrasporto = calcolaSpeseTrasportoInput(input.articoli, regole, regoleLiberi)
  const { articoliConCosto, totaleCostiAcquisto } = await calcolaCostiAcquistoInput(input.articoli, regole)
  const quoteTrasporto = calcolaQuoteTrasportoPerArticolo(input.articoli, regole, regoleLiberi)
  const articoliConQuota = input.articoli.map((a, i) => ({ ...a, quota_trasporto: quoteTrasporto[i] }))
  const riepilogoIva = calcolaRiepilogoIva(articoliConQuota, input.scontoGlobale)
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
      cliente_id: clienteIdFinale,
      numero: numeroFinale,
      cliente_snapshot: input.clienteSnapshot,
      sconto_globale: input.scontoGlobale,
      mostra_sconto_riga: input.mostraSconto,
      note: input.note || null,
      subtotale,
      importo_sconto: importoSconto,
      totale_articoli: totaleArticoli,
      spese_trasporto: speseTrasporto,
      modalita_trasporto: 'ripartito',
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
      articoliConCosto.map((a, i) => {
        const { quota_trasporto: _qt, ...articoloDb } = a
        return { ...articoloDb, preventivo_id: prev.id, organization_id: orgId, ordine: i }
      })
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
  const listinoLiberoIds = [...new Set(input.articoli.map((a) => a.listino_libero_id).filter((id): id is string => !!id))]
  const [regole, regoleLiberi] = await Promise.all([
    getRegoleTrasporto(listinoIds),
    getRegoleTrasportoLiberi(listinoLiberoIds),
  ])

  const totalePezzi = calcolaTotalePezzi(input.articoli)
  const subtotale = calcolaSubtotale(input.articoli)
  const speseTrasporto = calcolaSpeseTrasportoInput(input.articoli, regole, regoleLiberi)
  const { articoliConCosto, totaleCostiAcquisto } = await calcolaCostiAcquistoInput(input.articoli, regole)
  const quoteTrasporto = calcolaQuoteTrasportoPerArticolo(input.articoli, regole, regoleLiberi)
  const articoliConQuota = input.articoli.map((a, i) => ({ ...a, quota_trasporto: quoteTrasporto[i] }))
  const riepilogoIva = calcolaRiepilogoIva(articoliConQuota, input.scontoGlobale)
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
      mostra_sconto_riga: input.mostraSconto,
      note: input.note || null,
      subtotale,
      importo_sconto: importoSconto,
      totale_articoli: totaleArticoli,
      spese_trasporto: speseTrasporto,
      modalita_trasporto: 'ripartito',
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
      articoliConCosto.map((a, i) => {
        const { quota_trasporto: _qt, ...articoloDb } = a
        return { ...articoloDb, preventivo_id: id, organization_id: orgId, ordine: i }
      })
    )
    if (artErr) throw new Error(artErr.message)
  }

  revalidatePath('/preventivi')
  revalidatePath(`/preventivi/${id}`)
}

export async function duplicaPreventivo(id: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // Legge preventivo sorgente + articoli
  const [{ data: src, error: srcErr }, { data: srcArticoli, error: artErr }] = await Promise.all([
    supabase.from('preventivi').select('*').eq('id', id).single(),
    supabase.from('articoli_preventivo').select('*').eq('preventivo_id', id).order('ordine'),
  ])
  if (srcErr || !src) throw new Error('Preventivo non trovato')
  if (artErr) throw new Error(artErr.message)

  // ── Genera nuovo numero ───────────────────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('num_prefisso, num_operatore, num_contatore, num_anno, num_padding')
    .eq('organization_id', orgId)
    .maybeSingle()

  let numeroFinale: string | null = null
  if (settingsRow?.num_prefisso) {
    const currentYear = new Date().getFullYear()
    const annoSettings = settingsRow.num_anno ?? 0
    const nuovoContatore = annoSettings !== currentYear ? 1 : (settingsRow.num_contatore ?? 0) + 1
    await supabase
      .from('settings')
      .update({ num_contatore: nuovoContatore, num_anno: currentYear })
      .eq('organization_id', orgId)
    numeroFinale = generaNumeroPreventivo(
      settingsRow.num_prefisso,
      nuovoContatore,
      currentYear,
      settingsRow.num_operatore ?? null,
      settingsRow.num_padding ?? 2
    )
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Inserisce nuovo preventivo (stato = bozza, share azzerato)
  const { data: newPrev, error: newErr } = await supabase
    .from('preventivi')
    .insert({
      organization_id: orgId,
      cliente_id: src.cliente_id,
      numero: numeroFinale,
      cliente_snapshot: src.cliente_snapshot,
      sconto_globale: src.sconto_globale,
      mostra_sconto_riga: src.mostra_sconto_riga ?? false,
      note: src.note,
      subtotale: src.subtotale,
      importo_sconto: src.importo_sconto,
      totale_articoli: src.totale_articoli,
      spese_trasporto: src.spese_trasporto,
      modalita_trasporto: src.modalita_trasporto,
      totale_costi_acquisto: src.totale_costi_acquisto,
      iva_totale: src.iva_totale,
      riepilogo_iva: src.riepilogo_iva,
      totale_finale: src.totale_finale,
      totale_pezzi: src.totale_pezzi,
      stato: 'bozza',
      share_token: null,
      condiviso_at: null,
      visualizzato_at: null,
    })
    .select('id')
    .single()

  if (newErr || !newPrev) throw new Error(newErr?.message ?? 'Errore creazione duplicato')

  // Copia articoli
  if (srcArticoli && srcArticoli.length > 0) {
    const { error: insErr } = await supabase.from('articoli_preventivo').insert(
      srcArticoli.map(({ id: _id, preventivo_id: _pid, created_at: _ca, ...rest }) => ({
        ...rest,
        preventivo_id: newPrev.id,
        organization_id: orgId,
      }))
    )
    if (insErr) {
      await supabase.from('preventivi').delete().eq('id', newPrev.id)
      throw new Error(insErr.message)
    }
  }

  revalidatePath('/preventivi')
  return { id: newPrev.id }
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

export async function aggiornaStatoPreventivo(
  id: string,
  stato: import('@/types/preventivo').StatoPreventivo
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('preventivi')
    .update({ stato })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${id}`)
  revalidatePath('/preventivi')
  revalidatePath('/')
}
