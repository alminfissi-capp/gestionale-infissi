// Dipendenze reali del motore per un'organizzazione: archivio sul database (service role), Stripe con la
// chiave scritta in Impostazioni → Collegamenti, parametri di WinStudio. Solo server.
import { createServiceClient } from '@/lib/supabase/service'
import { leggiSegreto } from '@/lib/integrazioni'
import { creaArchivioSupabase } from './archivio-supabase'
import { creaGatewayStripe } from './gateway'
import { METODI_RATEALI } from './metodo'
import type { Dipendenze, ParametriPagamenti } from './servizio'

export const parametriPagamenti = (): ParametriPagamenti => ({
  accontoPercentuale: 30,
  statiPagabili: ['accettato'],
  richiediFirma: false,
  metodiRateali: [...METODI_RATEALI],
  baseUrl: (process.env.NEXT_PUBLIC_APP_URL ?? 'https://gestionale-infissi.vercel.app').replace(/\/$/, ''),
})

/** null se l'organizzazione non ha collegato Stripe */
export async function dipendenzePagamenti(orgId: string): Promise<Dipendenze | null> {
  const chiave = await leggiSegreto(orgId, 'stripe', 'chiave_segreta')
  if (!chiave) return null
  return { archivio: creaArchivioSupabase(createServiceClient(), orgId), gateway: creaGatewayStripe(chiave), parametri: parametriPagamenti() }
}
