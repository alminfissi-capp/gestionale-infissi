'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  RilievoOpzione,
  RilievoVeloce,
  RilievoVeloceCompleto,
  VoceRilievoVeloce,
  RilievoInput,
  VoceInput,
  OpzioniRilievo,
  TipoOpzione,
  StrutturaOpzione,
  SerieOpzione,
  TelaioOpzione,
} from '@/types/rilievo-veloce'

// ─── Helper ────────────────────────────────────────────────────────────────

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (error || !profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

// ─── Opzioni ───────────────────────────────────────────────────────────────

export async function getOpzioni(): Promise<RilievoOpzione[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('rilievo_opzioni')
    .select('*')
    .eq('organization_id', orgId)
    .order('tipo')
    .order('ordine')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getOpzioniRaggruppate(): Promise<OpzioniRilievo> {
  const opzioni = await getOpzioni()
  const strutture: StrutturaOpzione[] = opzioni
    .filter((o) => o.tipo === 'struttura' && o.attiva)
    .map((o) => ({ id: o.id, valore: o.valore }))

  const serie: SerieOpzione[] = opzioni
    .filter((o) => o.tipo === 'serie' && o.attiva)
    .map((o) => ({ id: o.id, valore: o.valore, strutture_collegate: o.strutture_collegate }))

  const telai: TelaioOpzione[] = opzioni
    .filter((o) => o.tipo === 'telaio' && o.attiva)
    .map((o) => ({ id: o.id, valore: o.valore, serie_collegate: o.strutture_collegate }))

  return {
    accessori: opzioni.filter((o) => o.tipo === 'accessorio' && o.attiva).map((o) => o.valore),
    colori:    opzioni.filter((o) => o.tipo === 'colore'     && o.attiva).map((o) => o.valore),
    vetri:     opzioni.filter((o) => o.tipo === 'vetro'      && o.attiva).map((o) => o.valore),
    serrature: opzioni.filter((o) => o.tipo === 'serratura'  && o.attiva).map((o) => o.valore),
    strutture,
    serie,
    telai,
  }
}

export async function upsertOpzione(
  tipo: TipoOpzione,
  valore: string,
  id?: string
): Promise<RilievoOpzione | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (id) {
    const { error } = await supabase
      .from('rilievo_opzioni')
      .update({ valore })
      .eq('id', id)
      .eq('organization_id', orgId)
    if (error) throw new Error(error.message)
    return null
  } else {
    const { data: existing } = await supabase
      .from('rilievo_opzioni')
      .select('ordine')
      .eq('organization_id', orgId)
      .eq('tipo', tipo)
      .order('ordine', { ascending: false })
      .limit(1)
    const nextOrdine = (existing?.[0]?.ordine ?? -1) + 1
    const { data, error } = await supabase
      .from('rilievo_opzioni')
      .insert({ organization_id: orgId, tipo, valore, ordine: nextOrdine, attiva: true })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as RilievoOpzione
  }
}

export async function deleteOpzione(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievo_opzioni')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}

export async function toggleOpzioneAttiva(id: string, attiva: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievo_opzioni')
    .update({ attiva })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}

export async function updateStruttureSerie(id: string, strutture_collegate: string[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievo_opzioni')
    .update({ strutture_collegate })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  // niente revalidatePath: lo stato è gestito ottimisticamente nel client
}

export async function reordinaOpzioni(tipo: TipoOpzione, ids: string[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from('rilievo_opzioni')
        .update({ ordine: i })
        .eq('id', id)
        .eq('organization_id', orgId)
        .eq('tipo', tipo)
    )
  )
  revalidatePath('/rilievo/impostazioni')
}

// ─── Rilievi ──────────────────────────────────────────────────────────────

export async function getRilievi(): Promise<RilievoVeloce[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('rilievi_veloci')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getRilievo(id: string): Promise<RilievoVeloceCompleto | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [{ data: rilievo }, { data: voci }] = await Promise.all([
    supabase
      .from('rilievi_veloci')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single(),
    supabase
      .from('rilievo_veloce_voci')
      .select('*')
      .eq('rilievo_id', id)
      .order('ordine'),
  ])
  if (!rilievo) return null
  return { ...rilievo, voci: voci ?? [] }
}

export async function createRilievoVeloce(input: RilievoInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: rilievo, error: rErr } = await supabase
    .from('rilievi_veloci')
    .insert({
      organization_id: orgId,
      cliente_snapshot: input.clienteSnapshot,
      note: input.note || null,
    })
    .select('id')
    .single()
  if (rErr || !rilievo) throw new Error(rErr?.message ?? 'Errore creazione rilievo')

  if (input.voci.length > 0) {
    const { error: vErr } = await supabase.from('rilievo_veloce_voci').insert(
      input.voci.map((v, i) => ({
        ...v,
        ordine: i,
        rilievo_id: rilievo.id,
        organization_id: orgId,
      }))
    )
    if (vErr) throw new Error(vErr.message)
  }

  revalidatePath('/rilievo/veloce')
  return { id: rilievo.id }
}

export async function updateRilievoVeloce(
  id: string,
  patch: { note?: string; clienteSnapshot?: RilievoInput['clienteSnapshot'] }
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievi_veloci')
    .update({
      ...(patch.note !== undefined ? { note: patch.note || null } : {}),
      ...(patch.clienteSnapshot ? { cliente_snapshot: patch.clienteSnapshot } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath(`/rilievo/veloce/${id}`)
  revalidatePath('/rilievo/veloce')
}

export async function deleteRilievoVeloce(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievi_veloci')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/veloce')
}

// ─── Voci ─────────────────────────────────────────────────────────────────

export async function addVoce(rilievoId: string, voce: VoceInput): Promise<VoceRilievoVeloce> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // Calcola ordine massimo
  const { data: existing } = await supabase
    .from('rilievo_veloce_voci')
    .select('ordine')
    .eq('rilievo_id', rilievoId)
    .order('ordine', { ascending: false })
    .limit(1)
  const nextOrdine = (existing?.[0]?.ordine ?? -1) + 1

  const { data, error } = await supabase
    .from('rilievo_veloce_voci')
    .insert({ ...voce, ordine: nextOrdine, rilievo_id: rilievoId, organization_id: orgId })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Errore aggiunta voce')

  revalidatePath(`/rilievo/veloce/${rilievoId}`)
  return data
}

export async function updateVoce(id: string, voce: VoceInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievo_veloce_voci')
    .update(voce)
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
}

export async function deleteVoce(id: string, rilievoId: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('rilievo_veloce_voci')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath(`/rilievo/veloce/${rilievoId}`)
}
