'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { PreventivoScorrevoli } from '@/types/scorrevoli'

type DbRow = {
  id: string
  numero: string | null
  data: string
  stato: string
  cliente: PreventivoScorrevoli['cliente']
  righe: PreventivoScorrevoli['righe']
  sconto_vetrata_prisma: number
  sconto_optional: number
  trasporto: number
  iva: number
  margine_alm: number | null
  note_generali: string | null
  created_at: string
  updated_at: string
}

function fromRow(row: DbRow): PreventivoScorrevoli {
  return {
    id: row.id,
    numero: row.numero ?? '',
    data: row.data,
    stato: row.stato as PreventivoScorrevoli['stato'],
    cliente: row.cliente,
    righe: row.righe,
    sconto_vetrata_prisma: row.sconto_vetrata_prisma,
    sconto_optional: row.sconto_optional,
    trasporto: row.trasporto,
    iva: row.iva,
    margine_alm: row.margine_alm,
    note_generali: row.note_generali ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listPreventiviScorrevoli(): Promise<PreventivoScorrevoli[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('preventivi_scorrevoli')
    .select('*')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(fromRow)
}

export async function getPreventivoScorrevoli(id: string): Promise<PreventivoScorrevoli | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('preventivi_scorrevoli')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? fromRow(data) : null
}

export async function savePreventivoScorrevoli(
  data: Omit<PreventivoScorrevoli, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<PreventivoScorrevoli> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const payload = {
    organization_id: orgId,
    numero: data.numero || null,
    data: data.data,
    stato: data.stato,
    cliente: data.cliente,
    righe: data.righe,
    sconto_vetrata_prisma: data.sconto_vetrata_prisma,
    sconto_optional: data.sconto_optional,
    trasporto: data.trasporto,
    iva: data.iva,
    margine_alm: data.margine_alm ?? null,
    note_generali: data.note_generali || null,
    updated_at: new Date().toISOString(),
  }

  if (data.id) {
    const { data: updated, error } = await supabase
      .from('preventivi_scorrevoli')
      .update(payload)
      .eq('id', data.id)
      .eq('organization_id', orgId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    revalidatePath('/preventivi/scorrevoli')
    return fromRow(updated)
  } else {
    // Numerazione atomica
    const { data: counter } = await supabase.rpc('increment_num_contatore_scorrevoli', { p_org_id: orgId })
    const row = counter?.[0]
    const numero = row
      ? `SC${String(row.contatore).padStart(3, '0')}/${row.anno}`
      : payload.numero ?? ''

    const { data: inserted, error } = await supabase
      .from('preventivi_scorrevoli')
      .insert({ ...payload, numero })
      .select()
      .single()
    if (error) throw new Error(error.message)
    revalidatePath('/preventivi/scorrevoli')
    return fromRow(inserted)
  }
}

export async function deletePreventivoScorrevoli(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('preventivi_scorrevoli')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/preventivi/scorrevoli')
}

// Mantenuto per compatibilità — la numerazione è ora automatica in savePreventivoScorrevoli
export async function getNextNumero(): Promise<string> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: counter } = await supabase.rpc('increment_num_contatore_scorrevoli', { p_org_id: orgId })
  const row = counter?.[0]
  if (!row) return `SC001/${new Date().getFullYear()}`
  return `SC${String(row.contatore).padStart(3, '0')}/${row.anno}`
}
