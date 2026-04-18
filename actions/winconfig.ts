'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type {
  WcSerie,
  WcSerieCompleta,
  WcSerieInput,
  WcProfilo,
  WcProfiloInput,
  WcAccessorio,
  WcAccessorioInput,
  WcRiempimento,
  WcRiempimentoInput,
  WcColore,
  WcColoreInput,
  ConfigWinConfig,
} from '@/types/winconfig'

const REVALIDATE_PATH = '/winconfig'

// ---- Serie ----

export async function getSerie(): Promise<WcSerie[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('wc_serie')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getSerieCompleta(serieId: string): Promise<WcSerieCompleta | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('wc_serie')
    .select(`
      *,
      wc_profili(*),
      wc_accessori(*),
      wc_riempimenti(*),
      wc_colori(*)
    `)
    .eq('id', serieId)
    .eq('organization_id', orgId)
    .single()
  if (error) return null
  return {
    ...data,
    profili: (data.wc_profili ?? []).sort((a: WcProfilo, b: WcProfilo) => a.ordine - b.ordine),
    accessori: (data.wc_accessori ?? []).sort((a: WcAccessorio, b: WcAccessorio) => a.ordine - b.ordine),
    riempimenti: (data.wc_riempimenti ?? []).sort((a: WcRiempimento, b: WcRiempimento) => a.ordine - b.ordine),
    colori: (data.wc_colori ?? []).sort((a: WcColore, b: WcColore) => a.ordine - b.ordine),
  }
}

export async function createSerie(input: WcSerieInput): Promise<WcSerie> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('wc_serie')
    .insert({ ...input, organization_id: orgId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(REVALIDATE_PATH)
  return data
}

export async function updateSerie(id: string, input: Partial<WcSerieInput>): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('wc_serie')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath(REVALIDATE_PATH)
}

export async function deleteSerie(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('wc_serie')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath(REVALIDATE_PATH)
}

// ---- Profili ----

export async function upsertProfili(serieId: string, profili: WcProfiloInput[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  // Elimina esistenti e reinserisci (approccio replace-all per semplicità)
  const { error: delError } = await supabase
    .from('wc_profili')
    .delete()
    .eq('serie_id', serieId)
    .eq('organization_id', orgId)
  if (delError) throw new Error(delError.message)

  if (profili.length > 0) {
    const { error } = await supabase
      .from('wc_profili')
      .insert(profili.map(p => ({ ...p, serie_id: serieId, organization_id: orgId })))
    if (error) throw new Error(error.message)
  }
  revalidatePath(`${REVALIDATE_PATH}/${serieId}`)
}

// ---- Accessori ----

export async function upsertAccessori(serieId: string, accessori: WcAccessorioInput[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error: delError } = await supabase
    .from('wc_accessori')
    .delete()
    .eq('serie_id', serieId)
    .eq('organization_id', orgId)
  if (delError) throw new Error(delError.message)

  if (accessori.length > 0) {
    const { error } = await supabase
      .from('wc_accessori')
      .insert(accessori.map(a => ({ ...a, serie_id: serieId, organization_id: orgId })))
    if (error) throw new Error(error.message)
  }
  revalidatePath(`${REVALIDATE_PATH}/${serieId}`)
}

// ---- Riempimenti ----

export async function upsertRiempimenti(serieId: string, riempimenti: WcRiempimentoInput[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error: delError } = await supabase
    .from('wc_riempimenti')
    .delete()
    .eq('serie_id', serieId)
    .eq('organization_id', orgId)
  if (delError) throw new Error(delError.message)

  if (riempimenti.length > 0) {
    const { error } = await supabase
      .from('wc_riempimenti')
      .insert(riempimenti.map(r => ({ ...r, serie_id: serieId, organization_id: orgId })))
    if (error) throw new Error(error.message)
  }
  revalidatePath(`${REVALIDATE_PATH}/${serieId}`)
}

// ---- Colori ----

export async function upsertColori(serieId: string, colori: WcColoreInput[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error: delError } = await supabase
    .from('wc_colori')
    .delete()
    .eq('serie_id', serieId)
    .eq('organization_id', orgId)
  if (delError) throw new Error(delError.message)

  if (colori.length > 0) {
    const { error } = await supabase
      .from('wc_colori')
      .insert(colori.map(c => ({ ...c, serie_id: serieId, organization_id: orgId })))
    if (error) throw new Error(error.message)
  }
  revalidatePath(`${REVALIDATE_PATH}/${serieId}`)
}

// ---- Salva come articolo_preventivo ----

export async function salvaArticoloWinConfig(
  preventivoId: string,
  config: ConfigWinConfig,
  quantita: number,
  note?: string
): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('articoli_preventivo')
    .insert({
      preventivo_id: preventivoId,
      organization_id: orgId,
      tipo: 'winconfig',
      tipologia: `${config.serie_nome} — ${config.larghezza_mm}×${config.altezza_sx_mm}${config.altezza_dx_mm !== config.altezza_sx_mm ? `/${config.altezza_dx_mm}` : ''}mm`,
      larghezza_mm: config.larghezza_mm,
      altezza_mm: Math.round((config.altezza_sx_mm + config.altezza_dx_mm) / 2),
      quantita,
      prezzo_unitario: config.prezzo_totale,
      prezzo_base: config.prezzo_profili + config.prezzo_accessori + config.prezzo_riempimenti,
      prezzo_totale_riga: config.prezzo_totale * quantita,
      costo_acquisto_unitario: config.costo_totale,
      note: note ?? null,
      config_winconfig: config,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${preventivoId}`)
  return data
}

export async function getRiempimentiOrg(): Promise<WcRiempimento[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('wc_riempimenti')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine')
  if (error) throw new Error(error.message)
  return data ?? []
}
