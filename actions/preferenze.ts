'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PreferenzeStatistiche } from '@/types/statistiche'
import { VISTE_COMMESSE_MOBILE, type PreferenzeInterfaccia, type VistaCommesseMobile } from '@/types/preferenze'

/** Preferenze statistiche dell'utente collegato. Oggetto vuoto se non ne ha. */
export async function getPreferenzeStatistiche(): Promise<PreferenzeStatistiche> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('preferenze_statistiche')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.preferenze_statistiche ?? {}) as PreferenzeStatistiche
}

/**
 * Salva l'ordine dei blocchi.
 *
 * Legge e riscrive l'intero oggetto invece di aggiornare una chiave: `jsonb`
 * non ha un merge parziale in PostgREST, e cosi' altre preferenze future non
 * verrebbero cancellate da un salvataggio dell'ordine.
 */
export async function setOrdineBlocchi(ordine: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sessione scaduta')

  const { data: attuali } = await supabase
    .from('profiles')
    .select('preferenze_statistiche')
    .eq('id', user.id)
    .maybeSingle()

  const preferenze: PreferenzeStatistiche = {
    ...((attuali?.preferenze_statistiche ?? {}) as PreferenzeStatistiche),
    ordineBlocchi: ordine,
  }

  const { error } = await supabase
    .from('profiles')
    .update({ preferenze_statistiche: preferenze })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
}

// ── Preferenze dell'interfaccia ─────────────────────────────────────────────

/** Preferenze dell'interfaccia dell'utente collegato. Oggetto vuoto se non ne ha. */
export async function getPreferenzeInterfaccia(): Promise<PreferenzeInterfaccia> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data } = await supabase
    .from('profiles')
    .select('preferenze_interfaccia')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.preferenze_interfaccia ?? {}) as PreferenzeInterfaccia
}

/**
 * Sceglie come vedere l'elenco commesse sul telefono. E' una scelta personale:
 * vale solo per l'utente collegato e non richiede permessi sulle Impostazioni.
 */
export async function setVistaCommesseMobile(vista: VistaCommesseMobile): Promise<{ ok: true } | { ok: false; errore: string }> {
  if (!VISTE_COMMESSE_MOBILE.some((v) => v.valore === vista)) return { ok: false, errore: 'Visualizzazione non valida' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, errore: 'Sessione scaduta' }

  // Si riscrive l'intero oggetto: jsonb non ha un merge parziale in PostgREST.
  const attuali = await getPreferenzeInterfaccia()
  const { error } = await supabase
    .from('profiles')
    .update({ preferenze_interfaccia: { ...attuali, vistaCommesseMobile: vista } })
    .eq('id', user.id)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/commesse', 'layout')
  revalidatePath('/impostazioni')
  return { ok: true }
}
