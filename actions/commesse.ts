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
  GruppoCommesse,
  RigaCalcolo,
  TipoBlocco,
} from '@/types/commessa'

export async function getCommesse(gruppoId: string): Promise<CommessaCompleta[]> {
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
      .eq('gruppo_id', gruppoId)
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
      incasso_previsto: c.incasso_previsto != null ? Number(c.incasso_previsto) : null,
      costo_materiali_manuale: c.costo_materiali_manuale != null ? Number(c.costo_materiali_manuale) : null,
      costo_manodopera_manuale: c.costo_manodopera_manuale != null ? Number(c.costo_manodopera_manuale) : null,
      utile_manuale: c.utile_manuale != null ? Number(c.utile_manuale) : null,
      acconti: acc.map((a) => ({ ...a, importo: Number(a.importo) })),
      documenti: docs,
      preventivi_collegati: prevs,
      totale_acconti: totAcc,
      saldo: Number(c.totale) - totAcc,
    }
  })
}

export async function getAllCommesse(): Promise<CommessaCompleta[]> {
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
      incasso_previsto: c.incasso_previsto != null ? Number(c.incasso_previsto) : null,
      costo_materiali_manuale: c.costo_materiali_manuale != null ? Number(c.costo_materiali_manuale) : null,
      costo_manodopera_manuale: c.costo_manodopera_manuale != null ? Number(c.costo_manodopera_manuale) : null,
      utile_manuale: c.utile_manuale != null ? Number(c.utile_manuale) : null,
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
    incasso_previsto: c.incasso_previsto != null ? Number(c.incasso_previsto) : null,
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

  let gruppoId = input.gruppo_id
  if (!gruppoId) {
    const corrente = await getGruppoCorrente()
    gruppoId = corrente?.id
  }

  const { data, error } = await supabase
    .from('commesse')
    .insert({ ...input, organization_id: orgId, gruppo_id: gruppoId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
  revalidatePath('/preventivi')
  return { id: data.id }
}

export async function updateCommessa(id: string, input: Partial<CommessaInput>): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteCommessa(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('commesse').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
  revalidatePath('/preventivi')
}

export async function addAcconto(commessaId: string, input: AccontoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('acconti_commessa')
    .insert({ ...input, commessa_id: commessaId, organization_id: orgId })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteAcconto(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('acconti_commessa').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
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
  revalidatePath('/commesse', 'layout')
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export async function uploadDocumentoCommessa(
  formData: FormData
): Promise<{ error?: string }> {
  const file = formData.get('file') as File | null
  const commessaId = formData.get('commessaId') as string
  const tipo = formData.get('tipo') as string

  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (file.size > 20 * 1024 * 1024) return { error: 'File troppo grande (max 20 MB)' }

  const orgId = await getOrgId()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const storagePath = `${orgId}/${commessaId}/${Date.now()}.${ext}`
  const contentType =
    file.type && file.type !== 'application/octet-stream'
      ? file.type
      : (MIME_BY_EXT[ext] ?? 'application/pdf')

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, file, { contentType })

  if (uploadError) return { error: uploadError.message }

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('documenti_commessa').insert({
    commessa_id: commessaId,
    organization_id: orgId,
    nome_file: file.name,
    storage_path: storagePath,
    tipo_documento: tipo,
  })
  if (dbError) {
    await service.storage.from('commesse-docs').remove([storagePath])
    return { error: dbError.message }
  }

  revalidatePath('/commesse', 'layout')
  return {}
}

export async function deleteDocumentoCommessa(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  await supabase.storage.from('commesse-docs').remove([storagePath])
  const { error } = await supabase.from('documenti_commessa').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
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

  revalidatePath('/commesse', 'layout')
  revalidatePath('/preventivi')
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
      gruppo_id: orig.gruppo_id,
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

  revalidatePath('/commesse', 'layout')
  return { id: nuova.id }
}

export async function updateStatoCommessa(id: string, stato: import('@/types/commessa').StatoCommessa): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ stato, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function updateOrdineCommesse(updates: { id: string; ordine: number }[]): Promise<void> {
  const supabase = await createClient()
  await Promise.all(
    updates.map(({ id, ordine }) =>
      supabase.from('commesse').update({ ordine }).eq('id', id)
    )
  )
  revalidatePath('/commesse', 'layout')
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

export type CommessaPerPreventivo = { commessa_id: string; gruppo_id: string | null }

/** Mappa preventivo_id → commessa collegata (link diretto o via preventivi_commessa) */
export async function getCommessePerPreventivi(): Promise<Record<string, CommessaPerPreventivo>> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('commesse')
    .select('id, gruppo_id, preventivo_id, preventivi_commessa(preventivo_id)')
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  const map: Record<string, CommessaPerPreventivo> = {}
  for (const c of data ?? []) {
    if (c.preventivo_id) map[c.preventivo_id] = { commessa_id: c.id, gruppo_id: c.gruppo_id }
    for (const pc of (c.preventivi_commessa ?? []) as { preventivo_id: string | null }[]) {
      if (pc.preventivo_id) map[pc.preventivo_id] = { commessa_id: c.id, gruppo_id: c.gruppo_id }
    }
  }
  return map
}

export async function getGruppiCommesse(): Promise<GruppoCommesse[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('gruppi_commesse')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getGruppoCorrente(): Promise<GruppoCommesse | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('gruppi_commesse')
    .select('*')
    .eq('organization_id', orgId)
    .eq('tipo', 'commesse')
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function createGruppo(nome: string, tipo: TipoBlocco = 'commesse'): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: maxRow } = await supabase
    .from('gruppi_commesse')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrdine = (maxRow?.ordine ?? -1) + 1
  const { error } = await supabase
    .from('gruppi_commesse')
    .insert({ nome, organization_id: orgId, ordine: nextOrdine, tipo })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function renameGruppo(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gruppi_commesse')
    .update({ nome })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteGruppo(id: string): Promise<void> {
  const supabase = await createClient()
  const [{ count: nComm }, { count: nScad }] = await Promise.all([
    supabase.from('commesse').select('*', { count: 'exact', head: true }).eq('gruppo_id', id),
    supabase.from('scadenze').select('*', { count: 'exact', head: true }).eq('gruppo_id', id),
  ])
  if ((nComm ?? 0) > 0)
    throw new Error('Il blocco contiene commesse. Spostale prima di eliminarlo.')
  if ((nScad ?? 0) > 0)
    throw new Error('Il blocco contiene scadenze. Eliminale prima di eliminare il blocco.')
  const { error } = await supabase
    .from('gruppi_commesse')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/** Aggiunge/rimuove una commessa dallo slot "Calcoli" (incassi possibili fine mese) */
export async function toggleCalcoli(commessaId: string, value: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ in_calcoli: value })
    .eq('id', commessaId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/** Salva l'incasso previsto inserito a mano dall'operatore nello slot Calcoli */
export async function setIncassoPrevisto(commessaId: string, value: number | null): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ incasso_previsto: value })
    .eq('id', commessaId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/** Commesse selezionate per i calcoli incassi (tutti i blocchi) */
export async function getCommesseCalcoli(): Promise<CommessaCompleta[]> {
  const tutte = await getAllCommesse()
  return tutte.filter((c) => c.in_calcoli)
}

export async function spostaCommessa(commessaId: string, gruppoId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ gruppo_id: gruppoId })
    .eq('id', commessaId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function salvaFirmaAcconto(accontoId: string, firmaBase64: string): Promise<void> {
  if (!firmaBase64.startsWith('data:image/png;base64,')) {
    throw new Error('Formato firma non valido')
  }
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('acconti_commessa')
    .update({ firma_immagine: firmaBase64 })
    .eq('id', accontoId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

// ── Righe Calcoli (giacenze banca / contanti / liquidità) ─────────────

export async function getRigheCalcoli(): Promise<RigaCalcolo[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('calcoli_righe')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ ...r, importo: Number(r.importo) })) as RigaCalcolo[]
}

export async function addRigaCalcolo(): Promise<RigaCalcolo> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: maxRow } = await supabase
    .from('calcoli_righe')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrdine = (maxRow?.ordine ?? -1) + 1
  const { data, error } = await supabase
    .from('calcoli_righe')
    .insert({ organization_id: orgId, descrizione: '', importo: 0, ordine: nextOrdine })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return { ...data, importo: Number(data.importo) } as RigaCalcolo
}

export async function updateRigaCalcolo(
  id: string,
  descrizione: string,
  importo: number
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('calcoli_righe')
    .update({ descrizione, importo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
}

export async function deleteRigaCalcolo(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('calcoli_righe')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
}
