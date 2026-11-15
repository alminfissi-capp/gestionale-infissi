// Metodo di pagamento Stripe -> metodo dell'acconto in commessa (acconti_commessa.metodo_pagamento).

/** Metodi rateali di Stripe: esclusi dal checkout per aziende o rate spente, e registrati come "rate" */
export const METODI_RATEALI = ['klarna', 'scalapay', 'alma'] as const

export function metodoAcconto(tipoStripe: string | null | undefined): 'carta' | 'rate' {
  return tipoStripe && (METODI_RATEALI as readonly string[]).includes(tipoStripe) ? 'rate' : 'carta'
}

const NOMI_METODI: Record<string, string> = {
  card: 'carta', klarna: 'Klarna', scalapay: 'Scalapay', alma: 'Alma', paypal: 'PayPal',
  satispay: 'Satispay', link: 'Link', sepa_debit: 'SEPA', apple_pay: 'Apple Pay', google_pay: 'Google Pay',
}
export const nomeMetodo = (m: string | null | undefined) => (m ? (NOMI_METODI[m] ?? m) : '—')
