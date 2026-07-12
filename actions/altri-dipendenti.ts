'use server'

import { revalidatePath } from 'next/cache'
import { assertAccessoDipendenti } from '@/lib/permessi-dipendenti'
import {
  calcolaSaldoAltro,
  normalizzaPeriodo,
  type AltroDipendenteConSaldo,
} from '@/lib/altri-dipendenti'
import type {
  AltroDipendente,
  AltroDipendenteCompleto,
  AltroDipendenteInput,
  CadenzaAltro,
  MovimentoAltroDipendente,
  MovimentoAltroInput,
} from '@/types/dipendente'

export async function getAltriDipendentiConSaldi(): Promise<AltroDipendenteConSaldo[]> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const [dipRes, movRes] = await Promise.all([
    supabase.from('altri_dipendenti').select('*').eq('organization_id', orgId).order('cognome'),
    supabase.from('movimenti_altro_dipendente').select('*').eq('organization_id', orgId),
  ])
  if (dipRes.error) throw new Error(dipRes.error.message)
  if (movRes.error) throw new Error(movRes.error.message)
  const dip = dipRes.data as AltroDipendente[]
  const mov = movRes.data as MovimentoAltroDipendente[]
  return dip.map((d) => ({
    ...d,
    ...calcolaSaldoAltro(mov.filter((m) => m.altro_dipendente_id === d.id)),
  }))
}

export async function getAltroDipendenteCompleto(id: string): Promise<AltroDipendenteCompleto | null> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { data: dip, error } = await supabase
    .from('altri_dipendenti')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!dip) return null
  const { data: mov, error: e2 } = await supabase
    .from('movimenti_altro_dipendente')
    .select('*')
    .eq('organization_id', orgId)
    .eq('altro_dipendente_id', id)
  if (e2) throw new Error(e2.message)
  return {
    dipendente: dip as AltroDipendente,
    movimenti: (mov ?? []) as MovimentoAltroDipendente[],
  }
}

export async function createAltroDipendente(input: AltroDipendenteInput): Promise<AltroDipendente> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data, error } = await supabase
    .from('altri_dipendenti')
    .insert({ organization_id: orgId, ...input })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
  return data as AltroDipendente
}

export async function updateAltroDipendente(id: string, input: AltroDipendenteInput): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('altri_dipendenti')
    .update(input)
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteAltroDipendente(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('altri_dipendenti')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function addMovimentoAltro(input: MovimentoAltroInput): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  // Recupera la cadenza per normalizzare il periodo e verifica l'appartenenza all'org.
  const { data: dip, error: eDip } = await supabase
    .from('altri_dipendenti')
    .select('cadenza')
    .eq('organization_id', orgId)
    .eq('id', input.altro_dipendente_id)
    .maybeSingle()
  if (eDip) throw new Error(eDip.message)
  if (!dip) throw new Error('Dipendente non trovato')
  const periodo = normalizzaPeriodo(input.data_periodo, (dip as { cadenza: CadenzaAltro }).cadenza)
  const { error } = await supabase.from('movimenti_altro_dipendente').insert({
    organization_id: orgId,
    altro_dipendente_id: input.altro_dipendente_id,
    tipo: input.tipo,
    periodo,
    importo: input.importo,
    data_pagamento: input.tipo === 'pagamento' ? input.data_pagamento : null,
    metodo: input.tipo === 'pagamento' ? input.metodo : null,
    note: input.note,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteMovimentoAltro(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('movimenti_altro_dipendente')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}
