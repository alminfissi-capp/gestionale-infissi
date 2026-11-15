// Saldo dei crediti dell'account openapi.it (firma elettronica EU-SES e altri servizi).
// Endpoint OAuth v2: GET https://oauth.openapi.it/credit, Basic Auth con email dell'account e APIkey
// (OAS: console.openapi.com/oas/en/oauth.openapi.json). Risposta: { data: { credit: 423.38 }, success, message, error }.
// Il token della firma (OPENAPI_IT_TOKEN) NON vale qui: servono OPENAPI_IT_EMAIL e OPENAPI_IT_APIKEY.

export const URL_CREDITO_OPENAPI = 'https://oauth.openapi.it/credit'

export type EsitoCredito =
  | { stato: 'ok'; credito: number }
  | { stato: 'non_configurato' }
  | { stato: 'errore'; messaggio: string }

export function intestazioneBasic(email: string, apikey: string): string {
  return `Basic ${Buffer.from(`${email}:${apikey}`).toString('base64')}`
}

/** Legge la risposta di /credit: il saldo in euro, o un messaggio comprensibile. */
export function leggiRispostaCredito(httpStatus: number, corpo: unknown): EsitoCredito {
  const c = (corpo ?? {}) as { success?: boolean; message?: string; data?: { credit?: unknown } | null }
  const credito = Number(c.data?.credit)
  if (httpStatus === 200 && c.success !== false && Number.isFinite(credito)) return { stato: 'ok', credito }
  if (httpStatus === 401 || httpStatus === 403) {
    return { stato: 'errore', messaggio: 'openapi.it rifiuta le credenziali (email o APIkey errate, o accesso non consentito da questo indirizzo)' }
  }
  return { stato: 'errore', messaggio: c.message ? `openapi.it: ${c.message}` : `openapi.it ha risposto ${httpStatus}` }
}
