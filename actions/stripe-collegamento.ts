'use server'

import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import { requireAccesso } from '@/lib/permessi'
import { cancellaSegreto, leggiSegreto, scriviSegreto } from '@/lib/integrazioni'
import { clientStripe } from '@/lib/pagamenti/gateway'
import { modalitaChiave, ricreaWebhook, type StripeLike } from '@/lib/pagamenti/collegamento-stripe'

const urlWebhook = (orgId: string) => `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/api/stripe/webhook/${orgId}`

/**
 * Collega Stripe con la chiave segreta: la verifica, crea il webhook delle ricevute e salva chiave e segreto
 * del webhook nel Vault. La riga di stato di `id_webhook` ricorda la modalita' (prova/reale) per l'interfaccia.
 */
export async function collegaStripe(chiave: string): Promise<{ errore?: string; modalita?: 'prova' | 'reale' }> {
  await requireAccesso('impostazioni', 'scrittura')
  const k = chiave.trim()
  if (k.startsWith('pk_')) return { errore: 'Serve la chiave segreta (sk_…), non quella pubblicabile' }
  const modalita = modalitaChiave(k)
  if (!modalita) return { errore: 'Chiave non riconosciuta: deve iniziare con sk_test_ o sk_live_' }
  if (!process.env.NEXT_PUBLIC_APP_URL) return { errore: 'Indirizzo del sito (NEXT_PUBLIC_APP_URL) non impostato' }
  const orgId = await getOrgId()
  const stripe = clientStripe(k)
  try {
    await stripe.balance.retrieve()
  } catch (e) {
    return { errore: `Stripe rifiuta la chiave: ${e instanceof Error ? e.message : String(e)}` }
  }
  let webhook: { id: string; segreto: string }
  try {
    webhook = await ricreaWebhook(stripe as unknown as StripeLike, urlWebhook(orgId), orgId)
  } catch (e) {
    return { errore: `Webhook non creato: ${e instanceof Error ? e.message : String(e)}` }
  }
  await scriviSegreto(orgId, 'stripe', 'chiave_segreta', k)
  await scriviSegreto(orgId, 'stripe', 'segreto_webhook', webhook.segreto)
  await scriviSegreto(orgId, 'stripe', 'id_webhook', webhook.id, modalita)
  revalidatePath('/impostazioni')
  return { modalita }
}

/** Toglie il webhook da Stripe (se la chiave funziona ancora) e cancella le chiavi da WinStudio. */
export async function scollegaStripe(): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  const orgId = await getOrgId()
  const [chiave, idWebhook] = await Promise.all([leggiSegreto(orgId, 'stripe', 'chiave_segreta'), leggiSegreto(orgId, 'stripe', 'id_webhook')])
  if (chiave && idWebhook) {
    try { await clientStripe(chiave).webhookEndpoints.del(idWebhook) } catch { /* gia' tolto o chiave revocata */ }
  }
  for (const campo of ['chiave_segreta', 'segreto_webhook', 'id_webhook'] as const) await cancellaSegreto(orgId, 'stripe', campo)
  revalidatePath('/impostazioni')
}
