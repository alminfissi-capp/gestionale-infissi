import { describe, expect, it } from 'vitest'
import { devoAccodareSyncGiornaliera, giornoRoma, statoPonte } from './ponte-regole'

describe('statoPonte', () => {
  const ora = new Date('2026-10-10T10:00:00Z')
  it('mai collegato', () => expect(statoPonte(null, ora)).toBe('mai_collegato'))
  it('segnale di 30 secondi fa: collegato', () =>
    expect(statoPonte('2026-10-10T09:59:30Z', ora)).toBe('collegato'))
  it('segnale di 3 minuti fa: PC spento o non raggiungibile', () =>
    expect(statoPonte('2026-10-10T09:57:00Z', ora)).toBe('non_raggiungibile'))
})

describe('giornoRoma', () => {
  it('le 23:30 UTC del 10 sono gia\' l\'11 a Roma (ora legale)', () =>
    expect(giornoRoma(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11'))
  it('d\'inverno (ora solare) 23:30 UTC e\' gia\' il giorno dopo', () =>
    expect(giornoRoma(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'))
})

describe('devoAccodareSyncGiornaliera', () => {
  const ora = new Date('2026-10-10T07:00:00Z')
  it('mai fatta: si accoda', () => expect(devoAccodareSyncGiornaliera(null, ora, false)).toBe(true))
  it('fatta ieri: si accoda', () => expect(devoAccodareSyncGiornaliera('2026-10-09', ora, false)).toBe(true))
  it('gia\' accodata oggi, anche se e\' fallita: non si riprova ogni 30 secondi', () =>
    expect(devoAccodareSyncGiornaliera('2026-10-10', ora, false)).toBe(false))
  it('c\'e\' gia\' una richiesta aperta: non se ne aggiunge un\'altra', () =>
    expect(devoAccodareSyncGiornaliera('2026-10-09', ora, true)).toBe(false))
})
