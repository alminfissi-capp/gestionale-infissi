'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { creaClientFic } from '@/lib/fic/client'
import { allineaScadenzaFic, annullaSingolo } from '@/lib/fic/allinea-scadenza'
import { controllaRipartizione, residuoDisponibile, type QuotaAltraScadenza } from '@/lib/fic/pagamenti'
import { riepilogaCollegamenti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import type {
  DatiCollegamento, DocumentoCollegabile, EsitoFic, MetodoFic, PagamentoFattura, ProblemiFic,
  RiepilogoCollegamento, SalvaCollegamentiInput, StatoFic, TipoFatturaFornitore,
} from '@/types/fatture-fornitori'

async function permessoCollegare(): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  if (permessi.commesse !== 'scrittura') return 'Serve la scrittura sulle Commesse'
  if (permessi.fatture_fornitori === 'nessuno') return 'Serve almeno la lettura sulle Fatture fornitori'
  return null
}

/** PostgREST puo' restituire la relazione come oggetto o come elenco di uno. */
function annullataDi(rel: unknown): boolean {
  const x = Array.isArray(rel) ? rel[0] : rel
  return Boolean((x as { annullata?: boolean } | null)?.annullata)
}

async function metodiFic(orgId: string): Promise<MetodoFic[]> {
  const svc = createServiceClient()
  const { data: coll } = await svc.from('fic_collegamenti').select('fic_company_id').eq('organization_id', orgId).maybeSingle()
  if (!coll) return []
  const { data: token } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (!token) return []
  try {
    return await creaClientFic(token as string).metodiPagamento(Number(coll.fic_company_id))
  } catch {
    return []
  }
}

type RigaDoc = {
  fic_id: number | string; tipo: TipoFatturaFornitore; numero: string | null; data: string
  fornitore_nome: string; importo_lordo: number | string
  rate: { importo: number | string; stato: string; scadenza: string | null }[]
}

export async function getDatiCollegamento(scadenzaId: string): Promise<DatiCollegamento | { errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  const { data: sc } = await svc
    .from('scadenze')
    .select('id, fornitore, descrizione, importo, pagato, data_scadenza, categoria, fic_metodo_id')
    .eq('id', scadenzaId).eq('organization_id', orgId).maybeSingle()
  if (!sc) return { errore: 'Scadenza non trovata' }

  const [tutti, docs, metodi] = await Promise.all([
    selectAll<{
      scadenza_id: string; fic_documento_id: number | string; tipo_documento: TipoFatturaFornitore
      importo: number | string; stato_fic: StatoFic; messaggio_fic: string | null
      ha_scrittura: unknown; scadenza: unknown
    }>((da, a) =>
      svc.from('scadenze_fatture')
        .select('scadenza_id, fic_documento_id, tipo_documento, importo, stato_fic, messaggio_fic, ha_scrittura:scrittura_fic, scadenza:scadenze(annullata)')
        .eq('organization_id', orgId).order('id').range(da, a)),
    selectAll<RigaDoc>((da, a) =>
      svc.from('fatture_fornitori')
        .select('fic_id, tipo, numero, data, fornitore_nome, importo_lordo, rate:fatture_fornitori_rate(importo, stato, scadenza)')
        .eq('organization_id', orgId).order('id').range(da, a)),
    metodiFic(orgId),
  ])

  const qui = tutti.filter((c) => c.scadenza_id === scadenzaId)
  // Le scadenze annullate non promettono piu' niente: il loro residuo torna libero.
  const altre: QuotaAltraScadenza[] = tutti
    .filter((c) => c.scadenza_id !== scadenzaId && !annullataDi(c.scadenza))
    .map((c) => ({ fic_documento_id: Number(c.fic_documento_id), importo: Number(c.importo), stato_fic: c.stato_fic }))
  // Quanto questa scadenza ha gia' scritto su FiC (anche se ora e' da allineare): su FiC
  // risulta pagato, ma e' suo e torna disponibile per lei.
  const scrittoQui = new Map(
    qui.filter((c) => c.ha_scrittura).map((c) => [Number(c.fic_documento_id), Number(c.importo)]),
  )
  const collegatiQui = new Set(qui.map((c) => Number(c.fic_documento_id)))

  const documenti: DocumentoCollegabile[] = []
  for (const d of docs) {
    const ficId = Number(d.fic_id)
    const daPagare = d.rate.filter((r) => r.stato !== 'pagata')
    const residuoFic = daPagare.reduce((s, r) => s + Number(r.importo), 0)
    const residuo = residuoDisponibile(residuoFic, ficId, altre, scrittoQui.get(ficId) ?? 0)
    if (residuo <= 0 && !collegatiQui.has(ficId)) continue
    const scadenze = daPagare.map((r) => r.scadenza).filter((x): x is string => !!x).sort()
    documenti.push({
      fic_id: ficId, tipo: d.tipo, numero: d.numero, data: d.data, fornitore_nome: d.fornitore_nome,
      importo_lordo: Number(d.importo_lordo), residuo, prima_scadenza: scadenze[0] ?? null,
    })
  }

  return {
    scadenza: {
      id: sc.id, fornitore: sc.fornitore, descrizione: sc.descrizione, importo: Number(sc.importo),
      pagato: sc.pagato, data_scadenza: sc.data_scadenza, categoria: sc.categoria,
      fic_metodo_id: sc.fic_metodo_id === null ? null : Number(sc.fic_metodo_id),
    },
    collegamenti: qui.map((c) => ({
      fic_documento_id: Number(c.fic_documento_id), tipo_documento: c.tipo_documento,
      importo: Number(c.importo), stato_fic: c.stato_fic, messaggio_fic: c.messaggio_fic,
    })),
    metodi,
    documenti,
  }
}

export async function salvaCollegamentiScadenza(
  input: SalvaCollegamentiInput,
): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  // Il server rifà il controllo: il browser non decide i residui.
  const dati = await getDatiCollegamento(input.scadenzaId)
  if ('errore' in dati) return { ok: false, errore: dati.errore }
  const perId = new Map(dati.documenti.map((d) => [d.fic_id, d]))
  // Il tipo lo decide il server (dal documento FiC), non il browser: sbagliarlo
  // invertirebbe il segno nel controllo.
  const sconosciuto = input.quote.find((q) => !perId.has(q.fic_documento_id))
  if (sconosciuto) {
    return { ok: false, errore: "Un documento collegato non e' piu' su FiC: toglilo con \"Scollega senza toccare FiC\"" }
  }
  const quote = input.quote.map((q) => ({ ...q, tipo_documento: perId.get(q.fic_documento_id)!.tipo }))
  const righe = quote.map((q) => {
    const d = perId.get(q.fic_documento_id)!
    return { fic_id: q.fic_documento_id, tipo: d.tipo, numero: d.numero, residuo: d.residuo, quota: q.importo }
  })
  const controllo = controllaRipartizione(dati.scadenza.importo, righe)
  if (controllo.livello === 'blocco') return { ok: false, errore: controllo.messaggi.join(' · ') }

  const { error: errMetodo } = await svc
    .from('scadenze').update({ fic_metodo_id: input.metodoId, updated_at: new Date().toISOString() })
    .eq('id', input.scadenzaId).eq('organization_id', orgId)
  if (errMetodo) return { ok: false, errore: errMetodo.message }

  // Togliere un collegamento gia' scritto: prima si annulla su FiC (quota a "non pagare").
  const tenuti = new Set(quote.map((q) => q.fic_documento_id))
  const daTogliere = dati.collegamenti.filter((c) => !tenuti.has(c.fic_documento_id))
  for (const c of daTogliere) {
    const { data: riga } = await svc.from('scadenze_fatture').select('id, scrittura_fic, intenzione_fic')
      .eq('scadenza_id', input.scadenzaId).eq('fic_documento_id', c.fic_documento_id)
      .eq('organization_id', orgId).maybeSingle()
    if (riga?.scrittura_fic || riga?.intenzione_fic) {
      // Scollegare un documento gia' pagato su FiC: prima si toglie il pagamento.
      const esito = await annullaSingolo(svc, orgId, input.scadenzaId, c.fic_documento_id)
      if (esito) return { ok: false, errore: `Non riesco a togliere il pagamento da FiC: ${esito}` }
    }
    await svc.from('scadenze_fatture').delete()
      .eq('scadenza_id', input.scadenzaId).eq('fic_documento_id', c.fic_documento_id).eq('organization_id', orgId)
  }

  for (const q of quote) {
    const { error } = await svc.from('scadenze_fatture').upsert(
      {
        organization_id: orgId, scadenza_id: input.scadenzaId, fic_documento_id: q.fic_documento_id,
        tipo_documento: q.tipo_documento, importo: q.importo, updated_at: new Date().toISOString(),
      },
      { onConflict: 'scadenza_id,fic_documento_id' },
    )
    if (error) return { ok: false, errore: error.message }
  }

  const esito = await allineaScadenzaFic(svc, orgId, input.scadenzaId)
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true, esito }
}

export async function riprovaScadenzaFic(scadenzaId: string): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const esito = await allineaScadenzaFic(createServiceClient(), await getOrgId(), scadenzaId)
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true, esito }
}

export async function riprovaTuttiFic(): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data } = await svc.from('scadenze_fatture').select('scadenza_id')
    .eq('organization_id', orgId).eq('stato_fic', 'da_allineare')
  const ids = [...new Set((data ?? []).map((r) => r.scadenza_id as string))]
  const totale: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  for (const id of ids) {
    const e = await allineaScadenzaFic(svc, orgId, id)
    totale.scritti += e.scritti
    totale.annullati += e.annullati
    totale.problemi.push(...e.problemi)
  }
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true, esito: totale }
}

export async function getRiepiloghiCollegamenti(scadenzaIds: string[]): Promise<Record<string, RiepilogoCollegamento>> {
  if (scadenzaIds.length === 0) return {}
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno') return {}
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const righe: { scadenza_id: string; stato_fic: StatoFic; messaggio_fic: string | null }[] = []
  for (let i = 0; i < scadenzaIds.length; i += 200) {
    const { data } = await svc.from('scadenze_fatture').select('scadenza_id, stato_fic, messaggio_fic')
      .eq('organization_id', orgId).in('scadenza_id', scadenzaIds.slice(i, i + 200))
    righe.push(...((data ?? []) as typeof righe))
  }
  const perScadenza = new Map<string, typeof righe>()
  for (const r of righe) perScadenza.set(r.scadenza_id, [...(perScadenza.get(r.scadenza_id) ?? []), r])
  return Object.fromEntries([...perScadenza].map(([id, c]) => [id, riepilogaCollegamenti(c)]))
}

export async function getPagamentiFatture(ficIds: number[]): Promise<Record<number, PagamentoFattura[]>> {
  if (ficIds.length === 0) return {}
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno') return {}
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const out: Record<number, PagamentoFattura[]> = {}
  for (let i = 0; i < ficIds.length; i += 200) {
    const { data, error } = await svc.from('scadenze_fatture')
      .select('fic_documento_id, importo, stato_fic, messaggio_fic, scadenza:scadenze(id, gruppo_id, data_scadenza, fornitore, descrizione, pagato)')
      .eq('organization_id', orgId).in('fic_documento_id', ficIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const s = r.scadenza as unknown as { id: string; gruppo_id: string; data_scadenza: string | null; fornitore: string; descrizione: string; pagato: boolean }
      const k = Number(r.fic_documento_id)
      ;(out[k] ??= []).push({
        scadenza_id: s.id, gruppo_id: s.gruppo_id, data_scadenza: s.data_scadenza, fornitore: s.fornitore,
        descrizione: s.descrizione, importo: Number(r.importo), scadenza_pagata: s.pagato,
        stato_fic: r.stato_fic as StatoFic, messaggio_fic: r.messaggio_fic as string | null,
      })
    }
  }
  return out
}

export async function getProblemiFic(): Promise<ProblemiFic> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno') return { daAllineare: 0, elenco: [] }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data } = await svc.from('scadenze_fatture')
    .select('stato_fic, messaggio_fic, scadenza:scadenze(id, gruppo_id, fornitore)')
    .eq('organization_id', orgId).in('stato_fic', ['da_allineare', 'da_verificare'])
  const elenco = (data ?? []).map((r) => {
    const s = r.scadenza as unknown as { id: string; gruppo_id: string; fornitore: string }
    return { scadenza_id: s.id, gruppo_id: s.gruppo_id, fornitore: s.fornitore, stato_fic: r.stato_fic as StatoFic, messaggio_fic: r.messaggio_fic as string | null }
  })
  return { daAllineare: elenco.filter((e) => e.stato_fic === 'da_allineare').length, elenco }
}

/**
 * Toglie il collegamento senza toccare FiC. Serve quando su FiC la situazione e'
 * stata sistemata a mano (rate modificate, documento eliminato): WinStudio smette
 * di considerare suo quel pagamento.
 */
export async function scollegaSenzaFic(
  scadenzaId: string, ficDocumentoId: number,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const { error } = await createServiceClient()
    .from('scadenze_fatture')
    .delete()
    .eq('scadenza_id', scadenzaId)
    .eq('fic_documento_id', ficDocumentoId)
    .eq('organization_id', orgId)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true }
}
