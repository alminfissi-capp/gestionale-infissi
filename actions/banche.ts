'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type {
  LineaCredito, LineaCreditoInput,
  AnticipoFattura, AnticipoFatturaInput,
  OpzioneCommessa,
} from '@/types/commessa'

function revalida() {
  revalidatePath('/impostazioni')
  revalidatePath('/commesse', 'layout')
}

// ── Linee di credito (il plafond, e basta) ──────────────────────────────────
export async function getLineeCredito(): Promise<LineaCredito[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('linee_credito')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => ({ ...l, accordato: Number(l.accordato) || 0 })) as LineaCredito[]
}

export async function createLineaCredito(input: LineaCreditoInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('linee_credito')
    .insert({
      nome: input.nome.trim(),
      tipo: input.tipo,
      accordato: input.accordato,
      organization_id: orgId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalida()
  return { id: data.id }
}

export async function updateLineaCredito(id: string, input: LineaCreditoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('linee_credito')
    .update({
      nome: input.nome.trim(),
      tipo: input.tipo,
      accordato: input.accordato,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// Attenzione: ON DELETE CASCADE porta via anche gli anticipi della linea.
// Chi chiama deve averlo detto all'utente e mostrato quanti sono.
export async function deleteLineaCredito(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('linee_credito')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// ── Anticipi fattura ────────────────────────────────────────────────────────
// Restituisce anche i rimborsati: servono all'interruttore "mostra i rimborsati"
// nei Calcoli. È `riepilogoBanche` a escluderli dai conti.
export async function getAnticipi(): Promise<AnticipoFattura[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [{ data, error }, { data: legami, error: errLegami }] = await Promise.all([
    supabase
      .from('anticipi_fattura')
      .select('*')
      .eq('organization_id', orgId)
      .order('data_scadenza', { ascending: true, nullsFirst: false }),
    supabase
      .from('anticipi_commesse')
      .select('anticipo_id, commessa_id')
      .eq('organization_id', orgId),
  ])
  if (error) throw new Error(error.message)
  if (errLegami) throw new Error(errLegami.message)

  const commessePerAnticipo = new Map<string, string[]>()
  for (const l of legami ?? []) {
    const list = commessePerAnticipo.get(l.anticipo_id) ?? []
    list.push(l.commessa_id)
    commessePerAnticipo.set(l.anticipo_id, list)
  }

  return (data ?? []).map((a) => ({
    ...a,
    importo: Number(a.importo) || 0,
    commesse_ids: commessePerAnticipo.get(a.id) ?? [],
  })) as AnticipoFattura[]
}

/**
 * Riscrive i legami di un anticipo con le sue commesse: cancella e reinserisce.
 * Sono poche righe per anticipo e non c'è niente da conservare in quelle vecchie,
 * quindi il diff non vale la complessità.
 */
async function salvaLegamiCommesse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  anticipoId: string,
  commesseIds: string[],
): Promise<void> {
  const { error: errDel } = await supabase
    .from('anticipi_commesse')
    .delete()
    .eq('anticipo_id', anticipoId)
    .eq('organization_id', orgId)
  if (errDel) throw new Error(errDel.message)

  const unici = [...new Set(commesseIds.filter(Boolean))]
  if (unici.length === 0) return

  const { error: errIns } = await supabase
    .from('anticipi_commesse')
    .insert(unici.map((commessa_id) => ({
      anticipo_id: anticipoId,
      commessa_id,
      organization_id: orgId,
    })))
  if (errIns) throw new Error(errIns.message)
}

export async function createAnticipo(input: AnticipoFatturaInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('anticipi_fattura')
    .insert({
      linea_id: input.linea_id,
      descrizione: input.descrizione.trim(),
      importo: input.importo,
      data_erogazione: input.data_erogazione,
      data_scadenza: input.data_scadenza,
      organization_id: orgId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  await salvaLegamiCommesse(supabase, orgId, data.id, input.commesse_ids)
  revalida()
  return { id: data.id }
}

export async function updateAnticipo(id: string, input: AnticipoFatturaInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('anticipi_fattura')
    .update({
      linea_id: input.linea_id,
      descrizione: input.descrizione.trim(),
      importo: input.importo,
      data_erogazione: input.data_erogazione,
      data_scadenza: input.data_scadenza,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  await salvaLegamiCommesse(supabase, orgId, id, input.commesse_ids)
  revalida()
}

// La chiusura è sempre una decisione dell'utente: il software non chiude mai da solo.
export async function setAnticipoRimborsato(id: string, rimborsato: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
  const { error } = await supabase
    .from('anticipi_fattura')
    .update({
      rimborsato,
      rimborsato_at: rimborsato ? oggi : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

export async function deleteAnticipo(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('anticipi_fattura')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// ── Commesse collegabili a un anticipo ──────────────────────────────────────
// Serve a due cose insieme: l'elenco del dialog e il residuo mostrato accanto
// all'anticipo. Una query sola, nessuna duplicazione della formula del residuo.
export async function getCommessePerAnticipo(): Promise<OpzioneCommessa[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [{ data: commesse, error: e1 }, { data: acconti, error: e2 }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, numero_commessa, cliente_nome, totale')
      .eq('organization_id', orgId)
      .order('numero_commessa', { ascending: false }),
    supabase
      .from('acconti_commessa')
      .select('commessa_id, importo')
      .eq('organization_id', orgId),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)

  const incassato = new Map<string, number>()
  for (const a of acconti ?? []) {
    incassato.set(a.commessa_id, (incassato.get(a.commessa_id) ?? 0) + (Number(a.importo) || 0))
  }

  return (commesse ?? []).map((c) => ({
    id: c.id,
    etichetta: `${c.numero_commessa} — ${c.cliente_nome ?? ''}`.trim(),
    // Stesso floor a zero del riepilogo crediti: una commessa incassata in eccesso
    // vale zero, non un numero negativo.
    residuo: Math.max(0, (Number(c.totale) || 0) - (incassato.get(c.id) ?? 0)),
  }))
}
