'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type {
  CommessaCompleta,
  CommessaInput,
  AccontoInput,
  PreventivoPerCommessa,
  UtentePerCommessa,
  PreventivoCommessa,
} from '@/types/commessa'

export async function getCommesse(): Promise<CommessaCompleta[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [
    { data: commesse, error },
    { data: acconti },
    { data: documenti },
    { data: prevCollegati },
  ] = await Promise.all([
    supabase
      .from('commesse')
      .select('*')
      .eq('organization_id', orgId)
      .order('ordine', { ascending: true }),
    supabase
      .from('acconti_commessa')
      .select('*')
      .eq('organization_id', orgId)
      .order('data_pagamento', { ascending: true }),
    supabase
      .from('documenti_commessa')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('preventivi_commessa')
      .select('*')
      .eq('organization_id', orgId)
      .order('ordine', { ascending: true }),
  ])

  if (error) throw new Error(error.message)

  return (commesse ?? []).map((c) => {
    const acc = (acconti ?? []).filter((a) => a.commessa_id === c.id)
    const docs = (documenti ?? []).filter((d) => d.commessa_id === c.id)
    const prevs = (prevCollegati ?? []).filter((p) => p.commessa_id === c.id) as PreventivoCommessa[]
    const totAcc = acc.reduce((sum, a) => sum + Number(a.importo), 0)
    return {
      ...c,
      imponibile: Number(c.imponibile),
      iva_totale: Number(c.iva_totale),
      totale: Number(c.totale),
      acconti: acc.map((a) => ({ ...a, importo: Number(a.importo) })),
      documenti: docs,
      preventivi_collegati: prevs,
      totale_acconti: totAcc,
      saldo: Number(c.totale) - totAcc,
    }
  })
}

export async function getCommessaById(id: string): Promise<CommessaCompleta | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [{ data: c, error }, { data: acconti }, { data: documenti }, { data: prevCollegati }] = await Promise.all([
    supabase.from('commesse').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle(),
    supabase.from('acconti_commessa').select('*').eq('commessa_id', id).order('data_pagamento', { ascending: true }),
    supabase.from('documenti_commessa').select('*').eq('commessa_id', id).order('created_at', { ascending: true }),
    supabase.from('preventivi_commessa').select('*').eq('commessa_id', id).order('ordine', { ascending: true }),
  ])
  if (error || !c) return null
  const acc = acconti ?? []
  const totAcc = acc.reduce((sum, a) => sum + Number(a.importo), 0)
  return {
    ...c,
    imponibile: Number(c.imponibile),
    iva_totale: Number(c.iva_totale),
    totale: Number(c.totale),
    acconti: acc.map((a) => ({ ...a, importo: Number(a.importo) })),
    documenti: documenti ?? [],
    preventivi_collegati: (prevCollegati ?? []) as PreventivoCommessa[],
    totale_acconti: totAcc,
    saldo: Number(c.totale) - totAcc,
  }
}

export async function createCommessa(input: CommessaInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('commesse')
    .insert({ ...input, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
  return { id: data.id }
}

export async function updateCommessa(id: string, input: Partial<CommessaInput>): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export async function deleteCommessa(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('commesse').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export async function addAcconto(commessaId: string, input: AccontoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('acconti_commessa')
    .insert({ ...input, commessa_id: commessaId, organization_id: orgId })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export async function deleteAcconto(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('acconti_commessa').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export async function addDocumentoCommessa(
  commessaId: string,
  nomeFile: string,
  storagePath: string,
  tipoDocumento: string
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase.from('documenti_commessa').insert({
    commessa_id: commessaId,
    organization_id: orgId,
    nome_file: nomeFile,
    storage_path: storagePath,
    tipo_documento: tipoDocumento,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export async function deleteDocumentoCommessa(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  await supabase.storage.from('commesse-docs').remove([storagePath])
  const { error } = await supabase.from('documenti_commessa').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export type PreventivoCommessaItemInput = {
  preventivo_id: string | null
  numero_preventivo: string | null
  storage_path: string | null
  nome_file: string | null
  ordine: number
}

export async function setPreventiviCommessa(
  commessaId: string,
  items: PreventivoCommessaItemInput[]
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: existing } = await supabase
    .from('preventivi_commessa')
    .select('storage_path')
    .eq('commessa_id', commessaId)

  const existingPaths = (existing ?? []).map((e) => e.storage_path).filter(Boolean) as string[]
  const newPaths = items.map((i) => i.storage_path).filter(Boolean) as string[]
  const orphaned = existingPaths.filter((p) => !newPaths.includes(p))
  if (orphaned.length > 0) {
    await supabase.storage.from('commesse-docs').remove(orphaned)
  }

  await supabase.from('preventivi_commessa').delete().eq('commessa_id', commessaId)

  if (items.length > 0) {
    const { error } = await supabase
      .from('preventivi_commessa')
      .insert(items.map((item) => ({ ...item, commessa_id: commessaId, organization_id: orgId })))
    if (error) throw new Error(error.message)
  }

  revalidatePath('/commesse')
}

export async function getDocumentoCommessaUrl(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('commesse-docs')
    .createSignedUrl(storagePath, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function getOrgIdPerUpload(): Promise<string> {
  return getOrgId()
}

export async function getPreventiviPerCommessa(): Promise<PreventivoPerCommessa[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('preventivi')
    .select('id, numero, cliente_snapshot, iva_totale, totale_finale')
    .eq('organization_id', orgId)
    .eq('stato', 'accettato')
    .order('created_at', { ascending: false })

  return (data ?? []).map((p) => {
    const s = p.cliente_snapshot as {
      tipo?: string
      ragione_sociale?: string | null
      nome?: string | null
      cognome?: string | null
      email?: string | null
    }
    let nome = ''
    if (s.tipo === 'azienda') nome = s.ragione_sociale || s.email || ''
    else nome = [s.cognome, s.nome].filter(Boolean).join(' ') || s.email || ''
    const iva = Number(p.iva_totale ?? 0)
    const tot = Number(p.totale_finale ?? 0)
    return {
      id: p.id,
      numero: p.numero,
      cliente_nome: nome,
      imponibile: tot - iva,
      iva_totale: iva,
      totale: tot,
    }
  })
}

export async function duplicaCommessa(id: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: orig, error } = await supabase
    .from('commesse')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !orig) throw new Error('Commessa non trovata')

  const { data: maxRow } = await supabase
    .from('commesse')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrdine = (maxRow?.ordine ?? 0) + 1

  const { data: nuova, error: insertError } = await supabase
    .from('commesse')
    .insert({
      organization_id: orgId,
      numero_commessa: orig.numero_commessa ? `${orig.numero_commessa} (copia)` : '',
      preventivo_id: orig.preventivo_id,
      numero_preventivo: orig.numero_preventivo,
      cliente_nome: orig.cliente_nome,
      imponibile: orig.imponibile,
      iva_totale: orig.iva_totale,
      totale: orig.totale,
      data_conferma: orig.data_conferma,
      operatore_id: orig.operatore_id,
      operatore_nome: orig.operatore_nome,
      note: orig.note,
      reparti: orig.reparti ?? [],
      ordine: nextOrdine,
    })
    .select('id')
    .single()

  if (insertError) throw new Error(insertError.message)

  // Duplica anche preventivi_commessa (senza storage_path — i file non vengono copiati)
  const { data: prevs } = await supabase
    .from('preventivi_commessa')
    .select('*')
    .eq('commessa_id', id)
    .order('ordine', { ascending: true })
  if (prevs && prevs.length > 0) {
    await supabase.from('preventivi_commessa').insert(
      prevs.map((p) => ({
        commessa_id: nuova.id,
        organization_id: orgId,
        preventivo_id: p.preventivo_id,
        numero_preventivo: p.numero_preventivo,
        nome_file: null,
        storage_path: null,
        ordine: p.ordine,
      }))
    )
  }

  revalidatePath('/commesse')
  return { id: nuova.id }
}

export async function updateStatoCommessa(id: string, stato: import('@/types/commessa').StatoCommessa): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ stato, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse')
}

export async function updateOrdineCommesse(updates: { id: string; ordine: number }[]): Promise<void> {
  const supabase = await createClient()
  await Promise.all(
    updates.map(({ id, ordine }) =>
      supabase.from('commesse').update({ ordine }).eq('id', id)
    )
  )
  revalidatePath('/commesse')
}

export async function getUtentiPerCommessa(): Promise<UtentePerCommessa[]> {
  const orgId = await getOrgId()
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('id, full_name, operatore')
    .eq('organization_id', orgId)
    .order('full_name', { ascending: true })
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nome: (p.operatore as string | null) || (p.full_name as string | null) || '—',
  }))
}
