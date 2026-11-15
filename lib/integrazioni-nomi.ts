// Nomi e ripieghi delle chiavi dei servizi esterni (parte pura, usabile anche nei test e nel client).

export type Servizio = 'openapi' | 'stripe'
export type CampoIntegrazione = 'email' | 'apikey' | 'token_firma' | 'chiave_segreta' | 'segreto_webhook' | 'id_webhook'
export type ChiaveIntegrazione = `${Servizio}.${CampoIntegrazione}`

export const nomeSegreto = (servizio: Servizio, campo: CampoIntegrazione): string => `${servizio}_${campo}`

/** Ultimi 4 caratteri: bastano per riconoscere quale chiave e' salvata senza mostrarla */
export const ultime4 = (valore: string): string => valore.slice(-4)

/** Variabile d'ambiente usata finche' la chiave non e' scritta in WinStudio (solo openapi.it, che esisteva prima) */
export function variabileRipiego(servizio: Servizio, campo: CampoIntegrazione): string | null {
  if (servizio !== 'openapi') return null
  if (campo === 'email') return 'OPENAPI_IT_EMAIL'
  if (campo === 'apikey') return 'OPENAPI_IT_APIKEY'
  if (campo === 'token_firma') return 'OPENAPI_IT_TOKEN'
  return null
}
