// Chiavi dei servizi esterni (openapi.it, Stripe) scritte dall'utente in Impostazioni → Collegamenti.
// Stanno nel Vault di Supabase: si leggono solo qui, dal server, col service role. Mai nel browser.
import { createServiceClient } from '@/lib/supabase/service'
import { nomeSegreto, ultime4, variabileRipiego, type CampoIntegrazione, type Servizio } from '@/lib/integrazioni-nomi'

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

/** Scrive o cancella una chiave (Vault + riga di stato). Solo da server action che hanno gia' controllato il permesso. */
export async function scriviSegreto(orgId: string, servizio: Servizio, campo: CampoIntegrazione, valore: string) {
  const service = createServiceClient()
  const { error } = await service.rpc('integrazione_salva', { p_org: orgId, p_nome: nomeSegreto(servizio, campo), p_valore: valore })
  if (error) throw new Error(`Vault: ${error.message}`)
  const { error: e2 } = await service.from('integrazioni').upsert({
    organization_id: orgId, servizio, campo, ultime4: campo === 'email' ? valore : ultime4(valore), aggiornato_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,servizio,campo' })
  if (e2) throw new Error(e2.message)
}

export async function cancellaSegreto(orgId: string, servizio: Servizio, campo: CampoIntegrazione) {
  const service = createServiceClient()
  const { error } = await service.rpc('integrazione_elimina', { p_org: orgId, p_nome: nomeSegreto(servizio, campo) })
  if (error) throw new Error(`Vault: ${error.message}`)
  await service.from('integrazioni').delete().eq('organization_id', orgId).eq('servizio', servizio).eq('campo', campo)
}
