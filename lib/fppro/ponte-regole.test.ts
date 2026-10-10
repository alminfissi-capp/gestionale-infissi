import { describe, expect, it } from 'vitest'
import { conTempoMassimo, devoAccodareSyncGiornaliera, giornoRoma, richiestaBloccata, statoPonte } from './ponte-regole'

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

describe('richiestaBloccata', () => {
  const ora = new Date('2026-10-10T10:00:00Z')
  it('in corso da 5 minuti: sta lavorando', () =>
    expect(richiestaBloccata('2026-10-10T09:55:00Z', ora)).toBe(false))
  it('in corso da 40 minuti: e\' bloccata (rete caduta mentre chiudeva)', () =>
    expect(richiestaBloccata('2026-10-10T09:20:00Z', ora)).toBe(true))
  it('senza data di inizio non si giudica', () =>
    expect(richiestaBloccata(null, ora)).toBe(false))
})

describe('conTempoMassimo', () => {
  it('lascia passare il risultato se arriva in tempo', async () => {
    await expect(conTempoMassimo(Promise.resolve(7), 1000, 'troppo lenta')).resolves.toBe(7)
  })
  it('una sincronizzazione appesa fallisce con il messaggio dato', async () => {
    await expect(conTempoMassimo(new Promise(() => {}), 10, 'Sincronizzazione bloccata'))
      .rejects.toThrow('Sincronizzazione bloccata')
  })
})
