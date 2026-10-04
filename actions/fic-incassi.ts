'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { allineaIncassoFic, annullaQuotaIncasso } from '@/lib/fic/allinea-incasso'
import {
  controllaQuote, propostaStorico, type FatturaRipartibile, type IncassoDaRipartire,
} from '@/lib/fic/incassi'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { riepilogaCollegamenti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import type { ScritturaFic } from '@/lib/fic/pagamenti-fic'
import type { EsitoFic, RiepilogoCollegamento, StatoFic } from '@/types/fatture-fornitori'
import type {
  CollegamentoCommessaFattura, DatiFattureCommessa, DatiIncassoFatture, FatturaCollegabile, FatturaPerIncasso,
  MetodiIncassoFic, QuotaIncasso, TipoFatturaEmessa,
} from '@/types/fatture-emesse'
import type { TipoRitenuta } from '@/types/commessa'

/*
 * Collegamenti fatture emesse ↔ commesse ↔ incassi. Le tabelle hanno RLS in sola
 * lettura: si scrive col service role, dopo i controlli di permesso qui sotto.
 */

type Risultato<T = object> = ({ ok: true } & T) | { ok: false; errore: string }

const cent = (v: number) => Math.round(v * 100) / 100
const DATA = /^\d{4}-\d{2}-\d{2}$/

async function permessoCollegare(): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  if (permessi.commesse !== 'scrittura') return 'Serve la scrittura sulle Commesse'
  if (permessi.fatture_fornitori === 'nessuno') return 'Serve almeno la lettura sulle Fatture'
  return null
}

async function permessoLeggere(): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  if (permessi.commesse === 'nessuno') return 'Non autorizzato'
  return null
}

function primo<T>(rel: unknown): T | null {
  return ((Array.isArray(rel) ? rel[0] : rel) ?? null) as T | null
}

// ── Lettura di fatture e quote ──────────────────────────────────────────────

type RigaFattura = {
  fic_id: number; tipo: TipoFatturaEmessa; numero: string | null; data: string; cliente_nome: string
  importo_lordo: number; ritenuta: number; da_incassare: number
}

const COLONNE_FATTURA =
  'fic_id, tipo, numero, data, cliente_nome, importo_lordo, ritenuta, rate:fatture_emesse_rate(importo, stato)'

function aFattura(x: Record<string, unknown>): RigaFattura {
  const rate = (x.rate ?? []) as { importo: number | string; stato: string }[]
  return {
    fic_id: Number(x.fic_id),
    tipo: x.tipo as TipoFatturaEmessa,
    numero: (x.numero as string | null) ?? null,
    data: x.data as string,
    cliente_nome: x.cliente_nome as string,
    importo_lordo: Number(x.importo_lordo),
    ritenuta: Number(x.ritenuta),
    da_incassare: cent(rate.filter((r) => r.stato !== 'pagata').reduce((s, r) => s + Math.abs(Number(r.importo)), 0)),
  }
}

async function fatturePerId(svc: SupabaseClient, orgId: string, ficIds: number[]): Promise<Map<number, RigaFattura>> {
  const mappa = new Map<number, RigaFattura>()
  for (let i = 0; i < ficIds.length; i += 200) {
    const { data, error } = await svc
      .from('fatture_emesse').select(COLONNE_FATTURA).eq('organization_id', orgId).in('fic_id', ficIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const x of data ?? []) {
      const f = aFattura(x as Record<string, unknown>)
      mappa.set(f.fic_id, f)
    }
  }
  return mappa
}

type QuotaIncassata = {
  acconto_id: string; commessa_id: string; fic_documento_id: number; importo: number
  stato_fic: StatoFic; messaggio_fic: string | null; scrittura_fic: ScritturaFic | null
}

/** Tutte le quote d'incasso sui documenti indicati, con la commessa dell'incasso. */
async function quoteIncassate(svc: SupabaseClient, orgId: string, ficIds: number[]): Promise<QuotaIncassata[]> {
  if (ficIds.length === 0) return []
  const righe: QuotaIncassata[] = []
  for (let i = 0; i < ficIds.length; i += 200) {
    const { data, error } = await svc
      .from('incassi_fatture')
      .select('acconto_id, fic_documento_id, importo, stato_fic, messaggio_fic, scrittura_fic, acconti_commessa(commessa_id)')
      .eq('organization_id', orgId)
      .in('fic_documento_id', ficIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const x of data ?? []) {
      righe.push({
        acconto_id: x.acconto_id as string,
        commessa_id: primo<{ commessa_id: string }>(x.acconti_commessa)?.commessa_id ?? '',
        fic_documento_id: Number(x.fic_documento_id),
        importo: Number(x.importo),
        stato_fic: x.stato_fic as StatoFic,
        messaggio_fic: (x.messaggio_fic as string | null) ?? null,
        scrittura_fic: (x.scrittura_fic as ScritturaFic | null) ?? null,
      })
    }
  }
  return righe
}

async function collegamentiCommessa(svc: SupabaseClient, orgId: string, commessaId: string): Promise<CollegamentoCommessaFattura[]> {
  const { data, error } = await svc
    .from('commesse_fatture')
    .select('fic_documento_id, tipo_documento, quota')
    .eq('organization_id', orgId)
    .eq('commessa_id', commessaId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((x) => ({
    fic_documento_id: Number(x.fic_documento_id),
    tipo_documento: x.tipo_documento as TipoFatturaEmessa,
    quota: Number(x.quota),
  }))
}

const scrittoDa = (s: ScritturaFic | null) => cent((s?.rate_pagate ?? []).reduce((t, r) => t + r.importo, 0))

/**
 * Le fatture della commessa viste da un incasso: quanto si puo' ancora scrivere
 * su FiC (piu' cio' che l'incasso stesso vi ha gia' scritto, perche' si puo'
 * riscrivere) e quanta quota della commessa resta da coprire.
 */
async function fatturePerIncasso(
  svc: SupabaseClient, orgId: string, commessaId: string, accontoId: string | null,
): Promise<{ fatture: FatturaPerIncasso[]; quote: QuotaIncasso[] }> {
  const collegamenti = await collegamentiCommessa(svc, orgId, commessaId)
  const ids = collegamenti.map((c) => c.fic_documento_id)
  const [perId, incassate] = await Promise.all([fatturePerId(svc, orgId, ids), quoteIncassate(svc, orgId, ids)])
  const fatture: FatturaPerIncasso[] = []
  for (const c of collegamenti) {
    const f = perId.get(c.fic_documento_id)
    if (!f) continue
    const proprie = incassate.filter((q) => q.fic_documento_id === f.fic_id && q.acconto_id === accontoId)
    const altreDellaCommessa = incassate.filter(
      (q) => q.fic_documento_id === f.fic_id && q.commessa_id === commessaId && q.acconto_id !== accontoId,
    )
    fatture.push({
      fic_id: f.fic_id,
      tipo: f.tipo,
      numero: f.numero,
      data: f.data,
      importo_lordo: f.importo_lordo,
      ritenuta: f.ritenuta,
      disponibile: cent(f.da_incassare + proprie.reduce((s, q) => s + scrittoDa(q.scrittura_fic), 0)),
      quota_libera: cent(c.quota - altreDellaCommessa.reduce((s, q) => s + q.importo, 0)),
    })
  }
  fatture.sort((a, b) => a.data.localeCompare(b.data) || a.fic_id - b.fic_id)
  const quote: QuotaIncasso[] = accontoId
    ? incassate
      .filter((q) => q.acconto_id === accontoId)
      .map((q) => ({
        fic_documento_id: q.fic_documento_id,
        tipo_documento: perId.get(q.fic_documento_id)?.tipo ?? 'fattura',
        importo: q.importo,
        stato_fic: q.stato_fic,
        messaggio_fic: q.messaggio_fic,
      }))
    : []
  return { fatture, quote }
}

async function metodiIncasso(svc: SupabaseClient, orgId: string): Promise<MetodiIncassoFic> {
  const { data } = await svc.from('fic_collegamenti').select('metodi_incasso').eq('organization_id', orgId).maybeSingle()
  return (data?.metodi_incasso as MetodiIncassoFic | null) ?? { bonifico: null, contanti: null, riba: null, altro: null }
}

// ── Fatture collegate a una commessa ────────────────────────────────────────

function periodoIniziale(dataConferma: string | null, oggi: string): { dal: string; al: string } {
  const base = dataConferma && DATA.test(dataConferma) ? dataConferma : oggi
  const [a, m] = base.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 - 2, 1))
  return { dal: d.toISOString().slice(0, 10), al: oggi }
}

export async function getDatiFattureCommessa(
  commessaId: string, periodo?: { dal: string; al: string },
): Promise<Risultato<{ dati: DatiFattureCommessa }>> {
  const vietato = await permessoLeggere()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  try {
    const { data: c, error } = await svc
      .from('commesse')
      .select('id, numero_commessa, cliente_nome, totale, data_conferma')
      .eq('id', commessaId).eq('organization_id', orgId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!c) return { ok: false, errore: 'Commessa non trovata' }

    const oggi = oggiRoma()
    const p = periodo && DATA.test(periodo.dal) && DATA.test(periodo.al)
      ? periodo
      : periodoIniziale(c.data_conferma as string | null, oggi)

    const collegamenti = await collegamentiCommessa(svc, orgId, commessaId)
    const nelPeriodo = await selectAll<Record<string, unknown>>((da, a) =>
      svc.from('fatture_emesse').select(COLONNE_FATTURA)
        .eq('organization_id', orgId).gte('data', p.dal).lte('data', p.al)
        .order('data', { ascending: false }).order('fic_id').range(da, a),
    )
    const perId = new Map(nelPeriodo.map((x) => { const f = aFattura(x); return [f.fic_id, f] as const }))
    const mancanti = collegamenti.map((x) => x.fic_documento_id).filter((id) => !perId.has(id))
    for (const [id, f] of await fatturePerId(svc, orgId, mancanti)) perId.set(id, f)

    // Quote delle stesse fatture su altre commesse, col numero della commessa.
    const ids = [...perId.keys()]
    const altre = new Map<number, FatturaCollegabile['altre']>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error: e } = await svc
        .from('commesse_fatture')
        .select('commessa_id, fic_documento_id, quota, commesse(numero_commessa)')
        .eq('organization_id', orgId)
        .neq('commessa_id', commessaId)
        .in('fic_documento_id', ids.slice(i, i + 200))
      if (e) throw new Error(e.message)
      for (const x of data ?? []) {
        const id = Number(x.fic_documento_id)
        const lista = altre.get(id) ?? []
        lista.push({
          commessa_id: x.commessa_id as string,
          commessa_nome: primo<{ numero_commessa: string }>(x.commesse)?.numero_commessa ?? '?',
          quota: Number(x.quota),
        })
        altre.set(id, lista)
      }
    }

    const fatture: FatturaCollegabile[] = [...perId.values()].map((f) => ({
      fic_id: f.fic_id, tipo: f.tipo, numero: f.numero, data: f.data, cliente_nome: f.cliente_nome,
      importo_lordo: f.importo_lordo, ritenuta: f.ritenuta, da_incassare: f.da_incassare,
      altre: altre.get(f.fic_id) ?? [],
    })).sort((a, b) => b.data.localeCompare(a.data) || b.fic_id - a.fic_id)

    return {
      ok: true,
      dati: {
        commessa: {
          id: c.id as string, nome: c.numero_commessa as string, cliente: c.cliente_nome as string,
          totale: Number(c.totale), data_conferma: (c.data_conferma as string | null) ?? null,
        },
        collegamenti,
        fatture,
        periodo: p,
        incassi_scollegati: await contaIncassiScollegati(svc, orgId, commessaId),
      },
    }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

async function contaIncassiScollegati(svc: SupabaseClient, orgId: string, commessaId: string): Promise<number> {
  const { data, error } = await svc
    .from('acconti_commessa')
    .select('id, incassi_fatture(id)')
    .eq('organization_id', orgId)
    .eq('commessa_id', commessaId)
  if (error) throw new Error(error.message)
  return (data ?? []).filter((a) => !((a.incassi_fatture as unknown[] | null)?.length)).length
}

export async function salvaFattureCommessa(
  commessaId: string,
  scelte: { fic_documento_id: number; quota: number }[],
): Promise<Risultato<{ incassi_scollegati: number }>> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  try {
    const { data: c } = await svc.from('commesse').select('id').eq('id', commessaId).eq('organization_id', orgId).maybeSingle()
    if (!c) return { ok: false, errore: 'Commessa non trovata' }

    const ids = [...new Set(scelte.map((s) => Number(s.fic_documento_id)))]
    if (ids.length !== scelte.length) return { ok: false, errore: 'Una fattura compare due volte' }
    const perId = await fatturePerId(svc, orgId, ids)
    const righe: { fic_documento_id: number; tipo_documento: TipoFatturaEmessa; quota: number }[] = []
    for (const s of scelte) {
      const f = perId.get(Number(s.fic_documento_id))
      if (!f) return { ok: false, errore: 'Una fattura non è più su Fatture in Cloud: sincronizza e riprova' }
      const valore = cent(Math.abs(Number(s.quota)))
      if (!(valore > 0)) return { ok: false, errore: `Quota non valida per la fattura ${f.numero ?? ''}` }
      // Il segno lo decide il documento: le note di credito tolgono.
      righe.push({ fic_documento_id: f.fic_id, tipo_documento: f.tipo, quota: f.tipo === 'nota_credito' ? -valore : valore })
    }

    // Una fattura gia' pagata da un incasso della commessa non si scollega: prima va tolta dall'incasso.
    const attuali = await collegamentiCommessa(svc, orgId, commessaId)
    const tolte = attuali.filter((a) => !ids.includes(a.fic_documento_id)).map((a) => a.fic_documento_id)
    if (tolte.length) {
      const usate = (await quoteIncassate(svc, orgId, tolte)).filter((q) => q.commessa_id === commessaId)
      if (usate.length) {
        return { ok: false, errore: 'Una fattura che vuoi togliere è pagata da un incasso della commessa: toglila prima dall\'incasso' }
      }
      const { error } = await svc.from('commesse_fatture').delete()
        .eq('organization_id', orgId).eq('commessa_id', commessaId).in('fic_documento_id', tolte)
      if (error) throw new Error(error.message)
    }
    if (righe.length) {
      const { error } = await svc.from('commesse_fatture').upsert(
        righe.map((r) => ({ ...r, organization_id: orgId, commessa_id: commessaId, updated_at: new Date().toISOString() })),
        { onConflict: 'commessa_id,fic_documento_id' },
      )
      if (error) throw new Error(error.message)
    }
    revalidatePath('/commesse', 'layout')
    revalidatePath('/fatture-fornitori')
    return { ok: true, incassi_scollegati: righe.length ? await contaIncassiScollegati(svc, orgId, commessaId) : 0 }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

// ── Incassi ─────────────────────────────────────────────────────────────────

export async function getDatiIncassoFatture(
  commessaId: string, accontoId: string | null,
): Promise<Risultato<{ dati: DatiIncassoFatture }>> {
  const vietato = await permessoLeggere()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  try {
    const { fatture, quote } = await fatturePerIncasso(svc, orgId, commessaId, accontoId)
    return { ok: true, dati: { fatture, quote, metodi: await metodiIncasso(svc, orgId) } }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

type Acconto = IncassoDaRipartire & { id: string; commessa_id: string; data: string }

async function leggiAcconto(svc: SupabaseClient, orgId: string, accontoId: string): Promise<Acconto | null> {
  const { data, error } = await svc
    .from('acconti_commessa')
    .select('id, commessa_id, importo, ritenuta, ritenuta_tipo, data_pagamento')
    .eq('id', accontoId).eq('organization_id', orgId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id as string, commessa_id: data.commessa_id as string, data: data.data_pagamento as string,
    importo: Number(data.importo), ritenuta: Number(data.ritenuta), ritenuta_tipo: (data.ritenuta_tipo as TipoRitenuta | null) ?? null,
  }
}

/**
 * Porta le quote dell'incasso a quelle indicate e allinea FiC: quote tolte →
 * pagamento tolto da FiC (se non riesce, si ferma); quote cambiate o nuove → il
 * motore riscrive o scrive.
 */
async function applicaQuote(
  svc: SupabaseClient, orgId: string, acconto: Acconto, quote: QuotaIncasso[],
): Promise<Risultato<{ esito: EsitoFic }>> {
  const { fatture, quote: attuali } = await fatturePerIncasso(svc, orgId, acconto.commessa_id, acconto.id)
  const pulite = quote
    .map((q) => ({ ...q, fic_documento_id: Number(q.fic_documento_id), importo: cent(Number(q.importo)) }))
    .filter((q) => q.importo > 0)
  const controllo = controllaQuote(acconto, fatture as FatturaRipartibile[], pulite)
  if (controllo.errori.length) return { ok: false, errore: controllo.errori.join(' · ') }

  const nuoviIds = new Set(pulite.map((q) => q.fic_documento_id))
  for (const a of attuali.filter((x) => !nuoviIds.has(x.fic_documento_id))) {
    const problema = await annullaQuotaIncasso(svc, orgId, acconto.id, a.fic_documento_id)
    if (problema) return { ok: false, errore: `Non riesco a togliere il pagamento da FiC: ${problema}` }
    const { error } = await svc.from('incassi_fatture').delete()
      .eq('organization_id', orgId).eq('acconto_id', acconto.id).eq('fic_documento_id', a.fic_documento_id)
    if (error) throw new Error(error.message)
  }
  for (const q of pulite) {
    const tipo = fatture.find((f) => f.fic_id === q.fic_documento_id)?.tipo ?? 'fattura'
    const esistente = attuali.find((a) => a.fic_documento_id === q.fic_documento_id)
    if (esistente) {
      if (cent(esistente.importo) === q.importo) continue
      const { error } = await svc.from('incassi_fatture')
        .update({ importo: q.importo, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId).eq('acconto_id', acconto.id).eq('fic_documento_id', q.fic_documento_id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await svc.from('incassi_fatture').insert({
        organization_id: orgId, acconto_id: acconto.id, fic_documento_id: q.fic_documento_id, tipo_documento: tipo, importo: q.importo,
      })
      if (error) throw new Error(error.message)
    }
  }
  const esito = await allineaIncassoFic(svc, orgId, acconto.id)
  esito.avvisi.push(...controllo.avvisi)
  return { ok: true, esito }
}

export async function salvaQuoteIncasso(accontoId: string, quote: QuotaIncasso[]): Promise<Risultato<{ esito: EsitoFic }>> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  try {
    const acconto = await leggiAcconto(svc, orgId, accontoId)
    if (!acconto) return { ok: false, errore: 'Incasso non trovato' }
    const r = await applicaQuote(svc, orgId, acconto, quote)
    revalidatePath('/commesse', 'layout')
    revalidatePath('/fatture-fornitori')
    return r
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

export type StatoFicCommessa = { haFatture: boolean; incassi: Record<string, RiepilogoCollegamento> }

/** Se la commessa ha fatture collegate, e lo stato FiC di ogni incasso (per l'icona accanto all'incasso). */
export async function getStatoFicCommessa(commessaId: string): Promise<StatoFicCommessa> {
  const vuoto: StatoFicCommessa = { haFatture: false, incassi: {} }
  if (await permessoLeggere()) return vuoto
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const [{ count }, { data, error }] = await Promise.all([
    svc.from('commesse_fatture').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('commessa_id', commessaId),
    svc.from('incassi_fatture')
      .select('acconto_id, stato_fic, messaggio_fic, acconti_commessa!inner(commessa_id)')
      .eq('organization_id', orgId)
      .eq('acconti_commessa.commessa_id', commessaId),
  ])
  if (error) return vuoto
  const perAcconto = new Map<string, { stato_fic: StatoFic; messaggio_fic: string | null }[]>()
  for (const x of data ?? []) {
    const lista = perAcconto.get(x.acconto_id as string) ?? []
    lista.push({ stato_fic: x.stato_fic as StatoFic, messaggio_fic: (x.messaggio_fic as string | null) ?? null })
    perAcconto.set(x.acconto_id as string, lista)
  }
  return {
    haFatture: (count ?? 0) > 0,
    incassi: Object.fromEntries([...perAcconto].map(([id, c]) => [id, riepilogaCollegamenti(c)])),
  }
}

// ── Storico ─────────────────────────────────────────────────────────────────

export type PropostaStorico = {
  acconto_id: string
  data: string
  importo: number
  metodo: string
  quote: (QuotaIncasso & { numero: string | null; data_fattura: string })[]
}[]

export async function getPropostaStorico(commessaId: string): Promise<Risultato<{ proposta: PropostaStorico }>> {
  const vietato = await permessoLeggere()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  try {
    const { data, error } = await svc
      .from('acconti_commessa')
      .select('id, importo, ritenuta, ritenuta_tipo, data_pagamento, metodo_pagamento, incassi_fatture(id)')
      .eq('organization_id', orgId).eq('commessa_id', commessaId)
    if (error) throw new Error(error.message)
    const scollegati = (data ?? []).filter((a) => !((a.incassi_fatture as unknown[] | null)?.length))
    const { fatture } = await fatturePerIncasso(svc, orgId, commessaId, null)
    const proposta = propostaStorico(
      scollegati.map((a) => ({
        id: a.id as string, data: a.data_pagamento as string, importo: Number(a.importo),
        ritenuta: Number(a.ritenuta), ritenuta_tipo: (a.ritenuta_tipo as TipoRitenuta | null) ?? null,
      })),
      fatture,
    )
    return {
      ok: true,
      proposta: proposta.map((p) => {
        const a = scollegati.find((x) => x.id === p.acconto_id)!
        return {
          acconto_id: p.acconto_id,
          data: a.data_pagamento as string,
          importo: Number(a.importo),
          metodo: a.metodo_pagamento as string,
          quote: p.quote.map((q) => {
            const f = fatture.find((x) => x.fic_id === q.fic_documento_id)!
            return { ...q, numero: f.numero, data_fattura: f.data }
          }),
        }
      }),
    }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

/** Scrive la proposta confermata, un incasso alla volta, con le date vere degli incassi. */
export async function confermaStorico(
  commessaId: string, proposta: { acconto_id: string; quote: QuotaIncasso[] }[],
): Promise<Risultato<{ esito: EsitoFic }>> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const totale: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  try {
    for (const p of proposta) {
      const acconto = await leggiAcconto(svc, orgId, p.acconto_id)
      if (!acconto || acconto.commessa_id !== commessaId) continue
      const r = await applicaQuote(svc, orgId, acconto, p.quote)
      if (!r.ok) { totale.problemi.push(r.errore); continue }
      totale.scritti += r.esito.scritti
      totale.annullati += r.esito.annullati
      totale.problemi.push(...r.esito.problemi)
    }
    revalidatePath('/commesse', 'layout')
    revalidatePath('/fatture-fornitori')
    return { ok: true, esito: totale }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

// ── Problemi e Riprova ──────────────────────────────────────────────────────

export type ProblemiIncassi = {
  elenco: { acconto_id: string; commessa_id: string; numero_commessa: string; data: string; importo: number; stato_fic: StatoFic; messaggio_fic: string | null }[]
}

export async function getProblemiIncassi(): Promise<ProblemiIncassi> {
  if (await permessoLeggere()) return { elenco: [] }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('incassi_fatture')
    .select('acconto_id, importo, stato_fic, messaggio_fic, acconti_commessa(commessa_id, data_pagamento, commesse(numero_commessa))')
    .eq('organization_id', orgId)
    .in('stato_fic', ['da_allineare', 'da_verificare', 'in_corso'])
  if (error) return { elenco: [] }
  return {
    elenco: (data ?? []).map((x) => {
      const a = primo<{ commessa_id: string; data_pagamento: string; commesse: unknown }>(x.acconti_commessa)
      return {
        acconto_id: x.acconto_id as string,
        commessa_id: a?.commessa_id ?? '',
        numero_commessa: primo<{ numero_commessa: string }>(a?.commesse)?.numero_commessa ?? '?',
        data: a?.data_pagamento ?? '',
        importo: Number(x.importo),
        stato_fic: x.stato_fic as StatoFic,
        messaggio_fic: (x.messaggio_fic as string | null) ?? null,
      }
    }),
  }
}

export async function riprovaIncassi(accontoIds?: string[]): Promise<Risultato<{ esito: EsitoFic }>> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const totale: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  try {
    const ids = accontoIds?.length
      ? accontoIds
      : [...new Set((await getProblemiIncassi()).elenco.filter((p) => p.stato_fic !== 'da_verificare').map((p) => p.acconto_id))]
    for (const id of ids) {
      const e = await allineaIncassoFic(svc, orgId, id)
      totale.scritti += e.scritti
      totale.annullati += e.annullati
      totale.problemi.push(...e.problemi)
    }
    revalidatePath('/commesse', 'layout')
    revalidatePath('/fatture-fornitori')
    return { ok: true, esito: totale }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}
