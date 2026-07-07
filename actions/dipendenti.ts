'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { calcolaSaldoDipendente, type DipendenteConSaldo } from '@/lib/dipendenti'
import type {
  BustaPaga,
  BustaPagaInput,
  Dipendente,
  DipendenteCompleto,
  DipendenteInput,
  Mensilita,
  PagamentoDipendente,
  PagamentoInput,
} from '@/types/dipendente'

const BUCKET = 'dipendenti-docs'

/**
 * Dati sensibili (stipendi): verifica il permesso 'dipendenti' lato server.
 * Gli admin passano sempre; gli operatori devono avere lettura/scrittura.
 */
async function assertAccessoDipendenti(scrittura = false) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('accesso')
      .eq('user_id', user.id)
      .eq('modulo', 'dipendenti')
      .maybeSingle()
    const accesso = perm?.accesso ?? 'nessuno'
    if (accesso === 'nessuno' || (scrittura && accesso !== 'scrittura')) {
      throw new Error('Accesso non consentito al modulo Dipendenti')
    }
  }
  return { supabase, orgId }
}

// ---- Anagrafica ----

export async function getDipendenti(): Promise<Dipendente[]> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { data, error } = await supabase
    .from('dipendenti')
    .select('*')
    .eq('organization_id', orgId)
    .order('cognome', { ascending: true })
  if (error) throw new Error(error.message)
  return data as Dipendente[]
}

export async function getDipendentiConSaldi(): Promise<DipendenteConSaldo[]> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const [dipRes, busteRes, pagRes] = await Promise.all([
    supabase.from('dipendenti').select('*').eq('organization_id', orgId).order('cognome'),
    supabase.from('buste_paga').select('*').eq('organization_id', orgId),
    supabase.from('pagamenti_dipendente').select('*').eq('organization_id', orgId),
  ])
  if (dipRes.error) throw new Error(dipRes.error.message)
  if (busteRes.error) throw new Error(busteRes.error.message)
  if (pagRes.error) throw new Error(pagRes.error.message)
  const buste = (busteRes.data ?? []) as BustaPaga[]
  const pagamenti = (pagRes.data ?? []) as PagamentoDipendente[]
  return (dipRes.data as Dipendente[]).map((d) => ({
    ...d,
    ...calcolaSaldoDipendente(
      buste.filter((b) => b.dipendente_id === d.id),
      pagamenti.filter((p) => p.dipendente_id === d.id),
    ),
  }))
}

export async function getDipendenteCompleto(id: string): Promise<DipendenteCompleto | null> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { data: dipendente } = await supabase
    .from('dipendenti')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!dipendente) return null
  const [busteRes, pagRes] = await Promise.all([
    supabase.from('buste_paga').select('*').eq('organization_id', orgId).eq('dipendente_id', id).order('periodo', { ascending: false }),
    supabase.from('pagamenti_dipendente').select('*').eq('organization_id', orgId).eq('dipendente_id', id).order('data_pagamento', { ascending: false }),
  ])
  if (busteRes.error) throw new Error(busteRes.error.message)
  if (pagRes.error) throw new Error(pagRes.error.message)
  return {
    dipendente: dipendente as Dipendente,
    buste: (busteRes.data ?? []) as BustaPaga[],
    pagamenti: (pagRes.data ?? []) as PagamentoDipendente[],
  }
}

export async function createDipendente(input: DipendenteInput): Promise<Dipendente> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data, error } = await supabase
    .from('dipendenti')
    .insert({ ...input, organization_id: orgId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
  return data as Dipendente
}

export async function updateDipendente(id: string, input: DipendenteInput): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('dipendenti')
    .update(input)
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteDipendente(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const [busteRes, pagRes] = await Promise.all([
    supabase.from('buste_paga').select('file_path').eq('organization_id', orgId).eq('dipendente_id', id),
    supabase.from('pagamenti_dipendente').select('file_path').eq('organization_id', orgId).eq('dipendente_id', id),
  ])
  const paths = [...(busteRes.data ?? []), ...(pagRes.data ?? [])]
    .map((r) => r.file_path)
    .filter((p): p is string => Boolean(p))
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
  const { error } = await supabase
    .from('dipendenti')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

// ---- Buste paga ----

async function uploadPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  cartella: 'buste' | 'bonifici',
  dipendenteId: string,
  formData?: FormData,
): Promise<string | null> {
  const file = formData?.get('file')
  if (!(file instanceof File) || file.size === 0) return null
  const path = `${orgId}/${cartella}/${dipendenteId}/${crypto.randomUUID()}.pdf`
  const buffer = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf' })
  if (error) throw new Error(error.message)
  return path
}

export async function addBustaPaga(input: BustaPagaInput, formData?: FormData): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const file_path = await uploadPdf(supabase, orgId, 'buste', input.dipendente_id, formData)
  const { error } = await supabase.from('buste_paga').insert({
    organization_id: orgId,
    dipendente_id: input.dipendente_id,
    periodo: input.periodo,
    mensilita: input.mensilita,
    netto: input.netto,
    lordo: input.lordo,
    pagina: input.pagina,
    dati_estratti: input.dati_estratti ?? null,
    file_path,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteBustaPaga(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data } = await supabase
    .from('buste_paga')
    .select('file_path')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (data?.file_path) await supabase.storage.from(BUCKET).remove([data.file_path])
  const { error } = await supabase
    .from('buste_paga')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function esisteBusta(
  dipendenteId: string,
  periodo: string,
  mensilita: Mensilita,
): Promise<boolean> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { count, error } = await supabase
    .from('buste_paga')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('dipendente_id', dipendenteId)
    .eq('periodo', periodo)
    .eq('mensilita', mensilita)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

// ---- Pagamenti ----

export async function addPagamento(input: PagamentoInput, formData?: FormData): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const file_path = await uploadPdf(supabase, orgId, 'bonifici', input.dipendente_id, formData)
  const { error } = await supabase.from('pagamenti_dipendente').insert({
    organization_id: orgId,
    dipendente_id: input.dipendente_id,
    data_pagamento: input.data_pagamento,
    importo: input.importo,
    metodo: input.metodo,
    periodo_competenza: input.periodo_competenza,
    mensilita: input.mensilita,
    note: input.note,
    dati_estratti: input.dati_estratti ?? null,
    file_path,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deletePagamento(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data } = await supabase
    .from('pagamenti_dipendente')
    .select('file_path')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (data?.file_path) await supabase.storage.from(BUCKET).remove([data.file_path])
  const { error } = await supabase
    .from('pagamenti_dipendente')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

// ---- File ----

export async function getDipendenteFileUrl(path: string): Promise<string> {
  const { supabase } = await assertAccessoDipendenti()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) throw new Error(error?.message ?? 'URL non disponibile')
  return data.signedUrl
}
