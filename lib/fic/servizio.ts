import type { SupabaseClient } from '@supabase/supabase-js'
import { FicNonAutorizzato, FicTroppeRichieste } from '@/lib/fic/client'

/** Il token esce dal Vault solo qui, lato server, e solo per l'organizzazione dell'utente. */
export async function leggiToken(svc: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (error) throw new Error(error.message)
  if (!data) throw new FicNonAutorizzato()
  return data as string
}

export function messaggioErrore(e: unknown): string {
  if (e instanceof FicNonAutorizzato) return 'Token non valido, revocato o senza i permessi necessari'
  if (e instanceof FicTroppeRichieste) return 'Troppe richieste a Fatture in Cloud: riprova fra qualche minuto'
  return e instanceof Error ? e.message : 'Errore sconosciuto'
}

export function blocchi<T>(xs: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
}
