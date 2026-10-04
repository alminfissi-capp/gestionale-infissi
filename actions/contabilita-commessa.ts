'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { calcolaCostiPreventivo, type ArticoloCosti } from '@/lib/preventivo-costi'
import {
  categoriaProposta, confrontoFattura, importoRiga, propostaCronometro, rimanente, stimaDaPreventivo,
} from '@/lib/contabilita-commessa'
import {
  CATEGORIE_COSTO, type CategoriaCosto, type ContabilitaCommessa, type CostoCommessa,
  type StimaCommessa, type VoceManodopera,
} from '@/types/contabilita'

// ── Tipi restituiti alla pagina ─────────────────────────────────────────────

export type CostoConAvviso = CostoCommessa & { avviso: string | null }

export type PaginaContabile = {
  commessa: {
    id: string; numero_commessa: string; cliente_nome: string
    totale_lavoro: number; data_conferma: string | null; preventivo_numero: string | null
  }
  costi: CostoConAvviso[]
  contabilita: ContabilitaCommessa
  impostazioni: { tariffa: number; percFissi: number }
  cronometro: Record<VoceManodopera, number>
  stimaPreventivo: StimaCommessa | null
  puoModificare: boolean
}

export type DocumentoPerCosti = {
  fic_id: number; tipo: 'fattura' | 'nota_credito'; numero: string | null; data: string
  fornitore_nome: string; imponibile: number; liberi: boolean; usatoQui: boolean
}

export type RigaDocumento = {
  riga_id: number; codice: string | null; descrizione: string; quantita: number; unita: string | null
  prezzo: number; selezionabile: boolean
  altrove: { commessa: string; quantita: number }[]; usataAltrove: number; rimanente: number
  attribuitaQui: number | null; categoriaQui: CategoriaCosto | null; categoriaProposta: CategoriaCosto | null
}

type RigaFic = { id?: number | null; code?: string | null; name?: string | null; qty?: number | null; measure?: string | null; net_price?: number | null }

const CATEGORIE = new Set<string>(CATEGORIE_COSTO.map((c) => c.value))
const DATA = /^\d{4}-\d{2}-\d{2}$/

async function permesso(min: 'lettura' | 'scrittura'): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  const ok = min === 'lettura' ? permessi.commesse !== 'nessuno' : permessi.commesse === 'scrittura'
  return ok ? null : 'Serve il permesso Commesse'
}

function righeFic(fic_dati: unknown): RigaFic[] {
  const r = (fic_dati as { items_list?: unknown } | null)?.items_list
  return Array.isArray(r) ? (r as RigaFic[]) : []
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function aCosto(r: Record<string, unknown>): CostoCommessa {
  return {
    ...(r as CostoCommessa),
    quantita: num(r.quantita), importo: Number(r.importo),
    fic_documento_id: num(r.fic_documento_id), fic_riga_id: num(r.fic_riga_id),
    quantita_fattura: num(r.quantita_fattura), prezzo_unitario: num(r.prezzo_unitario),
  }
}

// ── Pagina ──────────────────────────────────────────────────────────────────

export async function getPaginaContabile(commessaId: string): Promise<PaginaContabile | { errore: string }> {
  const vietato = await permesso('lettura')
  if (vietato) return { errore: vietato }
  const orgId = await getOrgId()
  const supabase = await createClient()

  const { data: c } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome, totale, iva_totale, data_conferma, preventivo_id')
    .eq('id', commessaId).eq('organization_id', orgId).maybeSingle()
  if (!c) return { errore: 'Commessa non trovata' }

  const [costiRaw, contRaw, setRaw, eventi, junction] = await Promise.all([
    selectAll<Record<string, unknown>>((da, a) =>
      supabase.from('costi_commessa').select('*').eq('commessa_id', commessaId).order('created_at').range(da, a)),
    supabase.from('contabilita_commessa').select('*').eq('commessa_id', commessaId).maybeSingle(),
    supabase.from('settings').select('tariffa_manodopera_giornaliera, perc_costi_fissi').eq('organization_id', orgId).maybeSingle(),
    supabase.from('eventi_calendario').select('tipo, secondi_lavorati').eq('commessa_id', commessaId),
    supabase.from('preventivi_commessa').select('preventivo_id').eq('commessa_id', commessaId),
  ])
  const costi = costiRaw.map(aCosto)

  // Avvisi: la riga di fattura su FiC e' ancora quella copiata?
  const docIds = [...new Set(costi.map((x) => x.fic_documento_id).filter((x): x is number => x !== null))]
  const righePerDoc = new Map<number, RigaFic[]>()
  if (docIds.length) {
    const { data: docs } = await supabase.from('fatture_fornitori').select('fic_id, fic_dati')
      .eq('organization_id', orgId).in('fic_id', docIds)
    for (const d of docs ?? []) righePerDoc.set(Number(d.fic_id), righeFic(d.fic_dati))
  }
  const costiConAvviso: CostoConAvviso[] = costi.map((x) => {
    if (x.origine !== 'fattura' || x.fic_documento_id === null) return { ...x, avviso: null }
    const righe = righePerDoc.get(x.fic_documento_id)
    if (!righe) return { ...x, avviso: 'fattura non più presente su FiC' }
    const riga = righe.find((r) => Number(r.id) === x.fic_riga_id) ?? null
    return { ...x, avviso: confrontoFattura(x, riga, x.tipo_documento ?? 'fattura') }
  })

  const ct = contRaw.data
  const contabilita: ContabilitaCommessa = {
    manodopera: {
      posa: { persone: num(ct?.posa_persone), giorni: num(ct?.posa_giorni) },
      produzione: { persone: num(ct?.produzione_persone), giorni: num(ct?.produzione_giorni) },
      altro: { persone: num(ct?.altro_persone), giorni: num(ct?.altro_giorni) },
    },
    tariffa_giornaliera: num(ct?.tariffa_giornaliera),
    perc_costi_fissi: num(ct?.perc_costi_fissi),
    stima: (ct?.stima as StimaCommessa | null) ?? null,
  }

  // Stima dai preventivi WinStudio collegati (link diretto + junction)
  const prevIds = [...new Set([c.preventivo_id, ...(junction.data ?? []).map((j) => j.preventivo_id)].filter((x): x is string => !!x))]
  let stimaPreventivo: StimaCommessa | null = null
  let preventivoNumero: string | null = null
  if (prevIds.length) {
    const [{ data: prev }, arts] = await Promise.all([
      supabase.from('preventivi').select('id, numero, totale_articoli, spese_trasporto').in('id', prevIds),
      selectAll<ArticoloCosti & { preventivo_id: string }>((da, a) =>
        supabase.from('articoli_preventivo')
          .select('preventivo_id, tipo, quantita, costo_acquisto_unitario, costo_posa, config_su_misura, config_scorrevole, config_winconfig')
          .in('preventivo_id', prevIds).order('id').range(da, a)),
    ])
    let materiali = 0, posa = 0, spese = 0, trasporto = 0
    for (const p of prev ?? []) {
      const r = calcolaCostiPreventivo(arts.filter((a) => a.preventivo_id === p.id), Number(p.totale_articoli) || 0, Number(p.spese_trasporto) || 0)
      materiali += r.materiali; posa += r.posa; spese += r.spese; trasporto += Number(p.spese_trasporto) || 0
    }
    if (materiali || posa || spese || trasporto) stimaPreventivo = stimaDaPreventivo({ materiali, posa, spese, trasporto })
    preventivoNumero = (prev ?? []).map((p) => p.numero).filter(Boolean).join(', ') || null
  }

  return {
    commessa: {
      id: c.id, numero_commessa: c.numero_commessa, cliente_nome: c.cliente_nome,
      totale_lavoro: Math.round((Number(c.totale) - Number(c.iva_totale)) * 100) / 100,
      data_conferma: c.data_conferma, preventivo_numero: preventivoNumero,
    },
    costi: costiConAvviso,
    contabilita,
    impostazioni: {
      tariffa: Number(setRaw.data?.tariffa_manodopera_giornaliera ?? 70),
      percFissi: Number(setRaw.data?.perc_costi_fissi ?? 5),
    },
    cronometro: propostaCronometro((eventi.data ?? []).map((e) => ({ tipo: e.tipo as string, secondi: Number(e.secondi_lavorati) || 0 }))),
    stimaPreventivo,
    puoModificare: (await permesso('scrittura')) === null,
  }
}

// ── Scelta della fattura ────────────────────────────────────────────────────

export async function cercaDocumentiPerCosti(
  commessaId: string, periodo: { dal: string; al: string },
): Promise<DocumentoPerCosti[] | { errore: string }> {
  const vietato = await permesso('lettura')
  if (vietato) return { errore: vietato }
  if (!DATA.test(periodo.dal) || !DATA.test(periodo.al) || periodo.dal > periodo.al) return { errore: 'Periodo non valido' }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  const docs = await selectAll<{ fic_id: number | string; tipo: 'fattura' | 'nota_credito'; numero: string | null; data: string; fornitore_nome: string; importo_netto: number | string; fic_dati: unknown }>((da, a) =>
    svc.from('fatture_fornitori').select('fic_id, tipo, numero, data, fornitore_nome, importo_netto, fic_dati')
      .eq('organization_id', orgId).gte('data', periodo.dal).lte('data', periodo.al)
      .order('data', { ascending: false }).order('id').range(da, a))
  const ids = docs.map((d) => Number(d.fic_id))
  const usi: { fic_documento_id: number; fic_riga_id: number; quantita: number; commessa_id: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await svc.from('costi_commessa').select('fic_documento_id, fic_riga_id, quantita, commessa_id')
      .eq('organization_id', orgId).eq('origine', 'fattura').in('fic_documento_id', ids.slice(i, i + 200))
    for (const u of data ?? []) usi.push({ fic_documento_id: Number(u.fic_documento_id), fic_riga_id: Number(u.fic_riga_id), quantita: Number(u.quantita) || 0, commessa_id: u.commessa_id })
  }

  return docs.map((d) => {
    const ficId = Number(d.fic_id)
    const righe = righeFic(d.fic_dati).filter((r) => Number(r.qty) > 0 && Number(r.net_price) !== 0)
    const usiDoc = usi.filter((u) => u.fic_documento_id === ficId)
    const liberi = righe.some((r) => {
      const usata = usiDoc.filter((u) => u.fic_riga_id === Number(r.id)).reduce((s, u) => s + u.quantita, 0)
      return rimanente(Number(r.qty), usata) > 0
    })
    return {
      fic_id: ficId, tipo: d.tipo, numero: d.numero, data: d.data, fornitore_nome: d.fornitore_nome,
      imponibile: Number(d.importo_netto), liberi, usatoQui: usiDoc.some((u) => u.commessa_id === commessaId),
    }
  })
}

export async function getRigheDocumento(
  commessaId: string, ficId: number,
): Promise<{ documento: DocumentoPerCosti; righe: RigaDocumento[] } | { errore: string }> {
  const vietato = await permesso('lettura')
  if (vietato) return { errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  const { data: d } = await svc.from('fatture_fornitori')
    .select('fic_id, tipo, numero, data, fornitore_nome, importo_netto, fic_dati')
    .eq('organization_id', orgId).eq('fic_id', ficId).maybeSingle()
  if (!d) return { errore: 'Documento non trovato: sincronizza le fatture fornitori' }

  const [{ data: usiRaw }, storico] = await Promise.all([
    svc.from('costi_commessa').select('fic_riga_id, quantita, categoria, commessa_id, commessa:commesse(numero_commessa, cliente_nome)')
      .eq('organization_id', orgId).eq('origine', 'fattura').eq('fic_documento_id', ficId),
    selectAll<{ codice: string | null; categoria: CategoriaCosto; updated_at: string }>((da, a) =>
      svc.from('costi_commessa').select('codice, categoria, updated_at').eq('organization_id', orgId)
        .not('codice', 'is', null).order('id').range(da, a)),
  ])
  const storicoCategorie = storico.map((s) => ({ codice: s.codice, categoria: s.categoria, quando: s.updated_at }))
  const usi = (usiRaw ?? []).map((u) => {
    const cm = (Array.isArray(u.commessa) ? u.commessa[0] : u.commessa) as { numero_commessa?: string; cliente_nome?: string } | null
    return {
      riga: Number(u.fic_riga_id), quantita: Number(u.quantita) || 0, categoria: u.categoria as CategoriaCosto,
      commessaId: u.commessa_id as string,
      etichetta: [cm?.cliente_nome, cm?.numero_commessa].filter(Boolean).join(' ') || 'altra commessa',
    }
  })

  const righe: RigaDocumento[] = righeFic(d.fic_dati).map((r, i) => {
    const rigaId = Number(r.id ?? i)
    const qty = Number(r.qty) || 0
    const prezzo = Number(r.net_price) || 0
    const altrove = usi.filter((u) => u.riga === rigaId && u.commessaId !== commessaId)
    const qui = usi.find((u) => u.riga === rigaId && u.commessaId === commessaId)
    const usataAltrove = altrove.reduce((s, u) => s + u.quantita, 0)
    return {
      riga_id: rigaId, codice: r.code?.trim() || null, descrizione: r.name?.trim() || '(senza descrizione)',
      quantita: qty, unita: r.measure?.trim() || null, prezzo, selezionabile: qty > 0 && prezzo !== 0 && r.id != null,
      altrove: altrove.map((u) => ({ commessa: u.etichetta, quantita: u.quantita })),
      usataAltrove, rimanente: rimanente(qty, usataAltrove),
      attribuitaQui: qui?.quantita ?? null, categoriaQui: qui?.categoria ?? null,
      categoriaProposta: categoriaProposta(r.code ?? null, storicoCategorie),
    }
  })

  return {
    documento: {
      fic_id: Number(d.fic_id), tipo: d.tipo, numero: d.numero, data: d.data, fornitore_nome: d.fornitore_nome,
      imponibile: Number(d.importo_netto), liberi: righe.some((r) => r.selezionabile && r.rimanente > 0),
      usatoQui: righe.some((r) => r.attribuitaQui !== null),
    },
    righe,
  }
}

/** Sostituisce le attribuzioni di questa commessa su un documento con quelle indicate. */
export async function salvaAttribuzioni(
  commessaId: string, ficId: number, scelte: { riga_id: number; quantita: number; categoria: CategoriaCosto }[],
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const vietato = await permesso('scrittura')
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  const { data: comm } = await svc.from('commesse').select('id').eq('id', commessaId).eq('organization_id', orgId).maybeSingle()
  if (!comm) return { ok: false, errore: 'Commessa non trovata' }
  const { data: d } = await svc.from('fatture_fornitori')
    .select('fic_id, tipo, numero, data, fornitore_nome, fic_dati')
    .eq('organization_id', orgId).eq('fic_id', ficId).maybeSingle()
  if (!d) return { ok: false, errore: 'Documento non trovato' }

  // Il server rilegge le righe dalla fattura: dal browser arrivano solo quale riga, quanto e quale categoria.
  const perId = new Map(righeFic(d.fic_dati).filter((r) => r.id != null).map((r) => [Number(r.id), r]))
  const righe = []
  for (const s of scelte) {
    const r = perId.get(Number(s.riga_id))
    if (!r) return { ok: false, errore: 'Una riga non e\' piu\' presente nella fattura: riaprila' }
    if (!CATEGORIE.has(s.categoria)) return { ok: false, errore: 'Categoria non valida' }
    const quantita = Math.round(Number(s.quantita) * 1000) / 1000
    if (!(quantita > 0)) return { ok: false, errore: `${r.name ?? 'Riga'}: quantita' da indicare` }
    righe.push({
      organization_id: orgId, commessa_id: commessaId, origine: 'fattura', categoria: s.categoria,
      descrizione: r.name?.trim() || '(senza descrizione)', quantita,
      importo: importoRiga(quantita, Number(r.net_price) || 0, d.tipo),
      fic_documento_id: ficId, fic_riga_id: Number(r.id), tipo_documento: d.tipo,
      fornitore_nome: d.fornitore_nome, numero_documento: d.numero, data_documento: d.data,
      codice: r.code?.trim() || null, unita: r.measure?.trim() || null,
      quantita_fattura: Number(r.qty) || 0,
      prezzo_unitario: (d.tipo === 'nota_credito' ? -1 : 1) * Math.abs(Number(r.net_price) || 0),
      updated_at: new Date().toISOString(),
    })
  }

  const tenute = righe.map((r) => r.fic_riga_id)
  let del = svc.from('costi_commessa').delete().eq('organization_id', orgId).eq('commessa_id', commessaId)
    .eq('origine', 'fattura').eq('fic_documento_id', ficId)
  if (tenute.length) del = del.not('fic_riga_id', 'in', `(${tenute.join(',')})`)
  const { error: errDel } = await del
  if (errDel) return { ok: false, errore: errDel.message }

  if (righe.length) {
    const { error } = await svc.from('costi_commessa').upsert(righe, { onConflict: 'commessa_id,fic_documento_id,fic_riga_id' })
    if (error) return { ok: false, errore: error.message }
  }
  revalidatePath(`/commesse/contabilita/${commessaId}`)
  return { ok: true }
}

// ── Costi a mano ────────────────────────────────────────────────────────────

export async function salvaCostoManuale(input: {
  id?: string; commessaId: string; descrizione: string; categoria: CategoriaCosto; importo: number; data?: string | null
}): Promise<{ ok: true } | { ok: false; errore: string }> {
  const vietato = await permesso('scrittura')
  if (vietato) return { ok: false, errore: vietato }
  if (!input.descrizione.trim()) return { ok: false, errore: 'Scrivi una descrizione' }
  if (!CATEGORIE.has(input.categoria)) return { ok: false, errore: 'Categoria non valida' }
  if (!Number.isFinite(input.importo) || input.importo === 0) return { ok: false, errore: 'Importo non valido' }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: comm } = await svc.from('commesse').select('id').eq('id', input.commessaId).eq('organization_id', orgId).maybeSingle()
  if (!comm) return { ok: false, errore: 'Commessa non trovata' }

  const riga = {
    organization_id: orgId, commessa_id: input.commessaId, origine: 'manuale', categoria: input.categoria,
    descrizione: input.descrizione.trim(), importo: Math.round(input.importo * 100) / 100,
    data_documento: input.data && DATA.test(input.data) ? input.data : null, updated_at: new Date().toISOString(),
  }
  const { error } = input.id
    ? await svc.from('costi_commessa').update(riga).eq('id', input.id).eq('organization_id', orgId).eq('origine', 'manuale')
    : await svc.from('costi_commessa').insert(riga)
  if (error) return { ok: false, errore: error.message }
  revalidatePath(`/commesse/contabilita/${input.commessaId}`)
  return { ok: true }
}

export async function eliminaCosto(id: string): Promise<{ ok: true } | { ok: false; errore: string }> {
  const vietato = await permesso('scrittura')
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const { data, error } = await createServiceClient().from('costi_commessa').delete()
    .eq('id', id).eq('organization_id', orgId).select('commessa_id')
  if (error) return { ok: false, errore: error.message }
  if (data?.[0]) revalidatePath(`/commesse/contabilita/${data[0].commessa_id}`)
  return { ok: true }
}

// ── Manodopera, costi fissi, stima ──────────────────────────────────────────

export async function salvaContabilita(
  commessaId: string, c: ContabilitaCommessa,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const vietato = await permesso('scrittura')
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: comm } = await svc.from('commesse').select('id').eq('id', commessaId).eq('organization_id', orgId).maybeSingle()
  if (!comm) return { ok: false, errore: 'Commessa non trovata' }

  const pos = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.max(0, v))
  const stima = c.stima
    ? Object.fromEntries(Object.entries(c.stima).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)))
    : null
  const { error } = await svc.from('contabilita_commessa').upsert({
    commessa_id: commessaId, organization_id: orgId,
    posa_persone: pos(c.manodopera.posa.persone), posa_giorni: pos(c.manodopera.posa.giorni),
    produzione_persone: pos(c.manodopera.produzione.persone), produzione_giorni: pos(c.manodopera.produzione.giorni),
    altro_persone: pos(c.manodopera.altro.persone), altro_giorni: pos(c.manodopera.altro.giorni),
    tariffa_giornaliera: pos(c.tariffa_giornaliera), perc_costi_fissi: pos(c.perc_costi_fissi),
    stima, updated_at: new Date().toISOString(),
  }, { onConflict: 'commessa_id' })
  if (error) return { ok: false, errore: error.message }
  revalidatePath(`/commesse/contabilita/${commessaId}`)
  return { ok: true }
}

/** Tariffa giornaliera e percentuale dei costi fissi predefinite (Impostazioni). */
export async function salvaParametriContabilita(p: { tariffa: number; percFissi: number }): Promise<{ ok: true } | { ok: false; errore: string }> {
  const { permessi } = await getMyPermissions()
  if (permessi.impostazioni !== 'scrittura') return { ok: false, errore: 'Non autorizzato a modificare le impostazioni' }
  if (!(p.tariffa >= 0) || !(p.percFissi >= 0) || p.percFissi > 100) return { ok: false, errore: 'Valori non validi' }
  const orgId = await getOrgId()
  const { error } = await createServiceClient().from('settings')
    .update({ tariffa_manodopera_giornaliera: p.tariffa, perc_costi_fissi: p.percFissi }).eq('organization_id', orgId)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/impostazioni')
  return { ok: true }
}

export async function getParametriContabilita(): Promise<{ tariffa: number; percFissi: number }> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const { data } = await supabase.from('settings').select('tariffa_manodopera_giornaliera, perc_costi_fissi').eq('organization_id', orgId).maybeSingle()
  return { tariffa: Number(data?.tariffa_manodopera_giornaliera ?? 70), percFissi: Number(data?.perc_costi_fissi ?? 5) }
}
