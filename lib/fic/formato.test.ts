import { describe, it, expect } from 'vitest'
import { formatDataOra, formatData, descriviConteggi } from '@/lib/fic/formato'

describe('formato', () => {
  it('data e ora a Roma', () => {
    expect(formatDataOra('2026-09-28T12:32:00Z')).toBe('28/09/2026 14:32')
  })
  it('solo data', () => {
    expect(formatData('2026-03-05')).toBe('05/03/2026')
  })
  it('conteggi, omettendo gli zeri', () => {
    expect(descriviConteggi({ nuove: 12, aggiornate: 3, eliminate: 0 })).toBe('12 nuove, 3 aggiornate')
    expect(descriviConteggi({ nuove: 0, aggiornate: 0, eliminate: 0 })).toBe('nessuna novità')
    expect(descriviConteggi({ nuove: 1, aggiornate: 0, eliminate: 1 })).toBe('1 nuova, 1 eliminata')
  })
})
