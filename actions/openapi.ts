'use server'

import { requireAccesso } from '@/lib/permessi'
import { intestazioneBasic, leggiRispostaCredito, URL_CREDITO_OPENAPI, type EsitoCredito } from '@/lib/openapi-credito'

/** Saldo dei crediti openapi.it, per la scheda in Impostazioni. Le credenziali restano sul server. */
export async function getCreditoOpenapi(): Promise<EsitoCredito> {
  await requireAccesso('impostazioni')
  const email = process.env.OPENAPI_IT_EMAIL
  const apikey = process.env.OPENAPI_IT_APIKEY
  if (!email || !apikey) return { stato: 'non_configurato' }
  try {
    const res = await fetch(URL_CREDITO_OPENAPI, {
      headers: { Authorization: intestazioneBasic(email, apikey), Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    const corpo = await res.json().catch(() => null)
    return leggiRispostaCredito(res.status, corpo)
  } catch (e) {
    return { stato: 'errore', messaggio: `openapi.it non raggiungibile: ${e instanceof Error ? e.message : String(e)}` }
  }
}
