// Chiavi dei servizi esterni (openapi.it, Stripe) scritte dall'utente in Impostazioni → Collegamenti.
// Stanno nel Vault di Supabase: si leggono solo qui, dal server, col service role. Mai nel browser.
import { createServiceClient } from '@/lib/supabase/service'
import { nomeSegreto, variabileRipiego, type CampoIntegrazione, type Servizio } from '@/lib/integrazioni-nomi'

export * from '@/lib/integrazioni-nomi'

/** Chiave del servizio: quella scritta in WinStudio, altrimenti la variabile d'ambiente di ripiego. */
export async function leggiSegreto(orgId: string, servizio: Servizio, campo: CampoIntegrazione): Promise<string | null> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('integrazione_leggi', { p_org: orgId, p_nome: nomeSegreto(servizio, campo) })
  if (!error && typeof data === 'string' && data) return data
  const env = variabileRipiego(servizio, campo)
  return (env && process.env[env]) || null
}

/** Token della firma elettronica openapi.it (EU-SES) */
export const tokenFirma = (orgId: string) => leggiSegreto(orgId, 'openapi', 'token_firma')

export const MESSAGGIO_TOKEN_FIRMA_MANCANTE = 'Token firma openapi.it non configurato (Impostazioni → Collegamenti)'

/** Token della firma o errore chiaro: per i percorsi che non possono continuare senza */
export async function tokenFirmaObbligatorio(orgId: string): Promise<string> {
  const t = await tokenFirma(orgId)
  if (!t) throw new Error(MESSAGGIO_TOKEN_FIRMA_MANCANTE)
  return t
}
