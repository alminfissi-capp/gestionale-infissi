// Collegamento di WinStudio a Stripe con la sola chiave segreta: il webhook per le ricevute dei pagamenti
// lo crea WinStudio (endpoint /api/stripe/webhook/{orgId}), cosi' l'utente non configura niente su Stripe.

/** Eventi che servono al motore (normalizzaEventoStripe) */
export const EVENTI_WEBHOOK = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
] as const

/** La parte di Stripe che serve qui (permette di provarla senza rete) */
export interface StripeLike {
  webhookEndpoints: {
    list(p?: { limit?: number }): Promise<{ data: { id: string; url: string; metadata?: Record<string, string> | null }[] }>
    del(id: string): Promise<unknown>
    create(p: { url: string; enabled_events: string[]; metadata?: Record<string, string>; description?: string }): Promise<{ id: string; secret?: string }>
  }
}

/** Prova o reale dal prefisso; null se non e' una chiave segreta (es. la pubblicabile pk_…) */
export function modalitaChiave(chiave: string): 'prova' | 'reale' | null {
  if (/^(sk|rk)_test_/.test(chiave)) return 'prova'
  if (/^(sk|rk)_live_/.test(chiave)) return 'reale'
  return null
}

/**
 * Elimina i webhook che WinStudio aveva creato per questa organizzazione e ne crea uno nuovo.
 * Stripe restituisce il segreto di firma solo alla creazione: per questo si ricrea sempre.
 */
export async function ricreaWebhook(stripe: StripeLike, url: string, orgId: string): Promise<{ id: string; segreto: string }> {
  const { data } = await stripe.webhookEndpoints.list({ limit: 100 })
  for (const e of data) if (e.metadata?.winstudio_org === orgId) await stripe.webhookEndpoints.del(e.id)
  const nuovo = await stripe.webhookEndpoints.create({
    url, enabled_events: [...EVENTI_WEBHOOK], metadata: { winstudio_org: orgId }, description: 'WinStudio — pagamenti dei preventivi',
  })
  if (!nuovo.secret) throw new Error('Stripe non ha restituito il segreto del webhook')
  return { id: nuovo.id, segreto: nuovo.secret }
}
