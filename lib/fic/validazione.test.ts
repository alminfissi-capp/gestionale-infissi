import { describe, it, expect } from 'vitest'
import { erroreDataSincronizzaDal, erroreAnticipo } from '@/lib/fic/validazione'

const OGGI = '2026-09-28'

describe('erroreDataSincronizzaDal', () => {
  it('data plausibile → nessun errore', () => {
    expect(erroreDataSincronizzaDal('2025-01-01', OGGI)).toBeNull()
    expect(erroreDataSincronizzaDal(OGGI, OGGI)).toBeNull()
  })
  it('formato non valido', () => {
    expect(erroreDataSincronizzaDal('', OGGI)).toBe('Data non valida')
    expect(erroreDataSincronizzaDal('01/01/2025', OGGI)).toBe('Data non valida')
  })
  it('anno a metà digitazione (0002, 0202) → rifiutato', () => {
    expect(erroreDataSincronizzaDal('0002-01-01', OGGI)).toBe('La data deve essere dal 2000 in poi')
    expect(erroreDataSincronizzaDal('0202-01-01', OGGI)).toBe('La data deve essere dal 2000 in poi')
  })
  it('data futura → rifiutata', () => {
    expect(erroreDataSincronizzaDal('2026-09-29', OGGI)).toBe('La data non può essere nel futuro')
  })
})

describe('erroreAnticipo', () => {
  it('si puo\' solo anticipare', () => {
    expect(erroreAnticipo('2025-01-01', '2026-01-01', OGGI)).toBeNull()
    expect(erroreAnticipo('2026-01-01', '2026-01-01', OGGI)).toBe('La nuova data deve essere precedente al 01/01/2026')
    expect(erroreAnticipo('2026-03-01', '2026-01-01', OGGI)).toBe('La nuova data deve essere precedente al 01/01/2026')
  })
  it('valgono i controlli di sempre su formato e anno', () => {
    expect(erroreAnticipo('0202-01-01', '2026-01-01', OGGI)).toBe('La data deve essere dal 2000 in poi')
    expect(erroreAnticipo('', '2026-01-01', OGGI)).toBe('Data non valida')
  })
})
