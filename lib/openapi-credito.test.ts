import { describe, expect, it } from 'vitest'
import { intestazioneBasic, leggiRispostaCredito } from './openapi-credito'

describe('credito openapi.it', () => {
  it('legge il saldo dalla risposta di esempio della documentazione', () => {
    expect(leggiRispostaCredito(200, { data: { credit: 423.38 }, success: true, message: '', error: null })).toEqual({ stato: 'ok', credito: 423.38 })
  })
  it('credenziali sbagliate: messaggio chiaro', () => {
    expect(leggiRispostaCredito(401, {})).toMatchObject({ stato: 'errore' })
  })
  it('credito inesistente (404 della documentazione)', () => {
    expect(leggiRispostaCredito(404, { success: false, message: 'non-existent Openapi credit', error: 320, data: null }))
      .toEqual({ stato: 'errore', messaggio: 'openapi.it: non-existent Openapi credit' })
  })
  it('Basic Auth con email e APIkey', () => {
    expect(intestazioneBasic('a@b.it', 'k')).toBe(`Basic ${Buffer.from('a@b.it:k').toString('base64')}`)
  })
})
