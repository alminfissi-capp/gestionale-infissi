'use server'

import { createClient } from '@/lib/supabase/server'
import fallbackData from '@/data/scorrevoli/scorrevoli_listino.json'

export type ScorevoliListino = {
  _meta: { fonte: string; fornitore: string; data_estrazione: string; nota: string }
  modelli: Modello[]
  configurazioni_fisse: ConfigurazioneFissa[]
  colori_struttura: ColoreStruttura[]
  colori_accessori: { nome: string }[]
  optional: Optional[]
  parametri_commerciali: ParametriCommerciali
}

export type Modello = {
  id: string
  nome: string
  descrizione: string
  prezzo_mq?: number
  prezzo_mq_fasce?: FasciaPrezzo[]
  altezza_min_fatturazione_mm: number
  larghezza_anta_min_mm: number
  larghezza_anta_max_mm: number
  mq_minimi_fatturazione: number | null
  altezza_max_mm: number
  note: string | null
  configurazione_ante_per_larghezza?: { larghezza_max_mm: number; nr_ante: number }[]
  immagine_url?: string | null
}

export type FasciaPrezzo = {
  fascia: string
  altezza_max_mm: number
  altezza_min_mm?: number
  prezzo_mq: number
}

export type ConfigurazioneFissa = {
  modello: string
  apertura: string
  nr_ante: number | string
  larghezza_max_mm: number
  altezza_max_mm: number
  prezzo: number
}

export type ColoreStruttura = {
  nome: string
  ral: string | null
  tipo: 'standard' | 'extra'
  maggiorazione: number
  modelli_applicabili: string[]
  nota?: string
}

export type Optional = {
  id: string
  descrizione: string
  prezzo: number | null
  unita: string
  modelli_applicabili: string[]
  nota?: string
}

export type ParametriCommerciali = {
  _nota: string
  sconto_vetrata_prisma: { valore: number; descrizione: string; editabile: boolean }
  sconto_optional: { valore: number; descrizione: string; editabile: boolean }
  trasporto: { valore: number; descrizione: string; editabile: boolean }
  iva: { valore: number; descrizione: string; editabile: boolean }
  margine_alm: { valore: number | null; descrizione: string; editabile: boolean }
}

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

export async function getScorevoliListino(): Promise<ScorevoliListino> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data } = await supabase
      .from('scorrevoli_listino')
      .select('data')
      .eq('organization_id', orgId)
      .maybeSingle()
    if (data?.data) return data.data as ScorevoliListino
  } catch {
    // fallback al bundle (primo avvio / nessun dato in DB)
  }
  return fallbackData as ScorevoliListino
}

export async function saveScorevoliListino(data: ScorevoliListino): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { error } = await supabase
      .from('scorrevoli_listino')
      .upsert(
        { organization_id: orgId, data, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id' }
      )
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
