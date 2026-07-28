'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { riassumiEventi } from '@/lib/produzione-tracking'
import type { EventoTracking, TipoEventoTracking, TrackingOrdine } from '@/types/produzione'

/**
 * Riepilogo di tracking per un gruppo di ordini, in una sola query.
 * La chiave della mappa è l'id ordine; ogni id richiesto è sempre presente.
 */
export async function getTrackingOrdini(
  ordineIds: string[]
): Promise<Record<string, TrackingOrdine>> {
  if (ordineIds.length === 0) return {}

  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data } = await supabase
    .from('tracking_email_ordine')
    .select('ordine_id, tipo, avvenuto_at, destinatario')
    .eq('organization_id', orgId)
    .in('ordine_id', ordineIds)

  const perOrdine = new Map<string, EventoTracking[]>()
  for (const riga of data ?? []) {
    const lista = perOrdine.get(riga.ordine_id) ?? []
    lista.push({
      tipo: riga.tipo as TipoEventoTracking,
      avvenuto_at: riga.avvenuto_at,
      destinatario: riga.destinatario,
    })
    perOrdine.set(riga.ordine_id, lista)
  }

  const risultato: Record<string, TrackingOrdine> = {}
  for (const id of ordineIds) {
    risultato[id] = riassumiEventi(perOrdine.get(id) ?? [])
  }
  return risultato
}
