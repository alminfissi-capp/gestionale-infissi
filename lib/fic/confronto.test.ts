import { describe, it, expect } from 'vitest'
import { confronta } from '@/lib/fic/confronto'

describe('confronta', () => {
  it('trova nuove, modificate ed eliminate', () => {
    const d = confronta(
      [
        { fic_id: 1, updated_at: '2026-01-01 10:00:00' }, // invariata
        { fic_id: 2, updated_at: '2026-02-02 11:00:00' }, // modificata
        { fic_id: 4, updated_at: '2026-03-03 12:00:00' }, // nuova
      ],
      [
        { fic_id: 1, fic_updated_at: '2026-01-01 10:00:00' },
        { fic_id: 2, fic_updated_at: '2026-02-01 09:00:00' },
        { fic_id: 3, fic_updated_at: '2026-01-15 08:00:00' }, // eliminata su FiC
      ],
    )
    expect(d).toEqual({ nuove: [4], modificate: [2], eliminate: [3] })
  })

  it('niente differenze', () => {
    expect(
      confronta([{ fic_id: 1, updated_at: 'a' }], [{ fic_id: 1, fic_updated_at: 'a' }]),
    ).toEqual({ nuove: [], modificate: [], eliminate: [] })
  })

  it('primo giro: tutto nuovo', () => {
    expect(confronta([{ fic_id: 1, updated_at: 'a' }, { fic_id: 2, updated_at: 'b' }], [])).toEqual({
      nuove: [1, 2],
      modificate: [],
      eliminate: [],
    })
  })
})
