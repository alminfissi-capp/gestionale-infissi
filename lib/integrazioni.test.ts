import { describe, expect, it } from 'vitest'
import { nomeSegreto, ultime4, variabileRipiego } from './integrazioni-nomi'

describe('nomi delle integrazioni', () => {
  it('ultime4: le ultime quattro cifre per riconoscere la chiave', () => {
    expect(ultime4('sk_test_abc1234')).toBe('1234')
    expect(ultime4('ab')).toBe('ab')
  })

  it('nome del segreto per servizio e campo', () => {
    expect(nomeSegreto('openapi', 'apikey')).toBe('openapi_apikey')
  })

  it('ripiego sulle variabili d\'ambiente solo per openapi.it', () => {
    expect(variabileRipiego('openapi', 'token_firma')).toBe('OPENAPI_IT_TOKEN')
    expect(variabileRipiego('openapi', 'email')).toBe('OPENAPI_IT_EMAIL')
    expect(variabileRipiego('openapi', 'apikey')).toBe('OPENAPI_IT_APIKEY')
    expect(variabileRipiego('stripe', 'chiave_segreta')).toBeNull()
  })
})
