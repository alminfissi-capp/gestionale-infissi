'use server'

import { createClient } from '@/lib/supabase/server'
import type { PreferenzeStatistiche } from '@/types/statistiche'

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
