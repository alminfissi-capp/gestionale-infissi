import { describe, expect, it } from 'vitest'
import { dataRilievoTesto, riepilogoPezzi, vistaPrecedente } from './cantiere-elenco'

describe('vistaPrecedente (dove si torna se la cronologia non lo dice)', () => {
  it('dalla voce al suo rilievo', () => expect(vistaPrecedente({ tipo: 'voce', rilievoId: 'r1', voceId: null })).toEqual({ tipo: 'rilievo', id: 'r1' }))
  it('dal riepilogo al rilievo', () => expect(vistaPrecedente({ tipo: 'riepilogo', id: 'r1' })).toEqual({ tipo: 'rilievo', id: 'r1' }))
  it('dal rilievo all\'elenco', () => expect(vistaPrecedente({ tipo: 'rilievo', id: 'r1' })).toEqual({ tipo: 'elenco' }))
  it('dall\'elenco resta all\'elenco', () => expect(vistaPrecedente({ tipo: 'elenco' })).toEqual({ tipo: 'elenco' }))
})

describe('riepilogoPezzi', () => {
  it('serramenti e pezzi (quantita) per rilievo', () => {
    const m = riepilogoPezzi([{ rilievoId: 'a', quantita: 2 }, { rilievoId: 'a', quantita: 1 }, { rilievoId: 'b', quantita: 0 }])
    expect(m.get('a')).toEqual({ serramenti: 2, pezzi: 3 })
    expect(m.get('b')).toEqual({ serramenti: 1, pezzi: 1 })
  })
})

describe('dataRilievoTesto', () => {
  it('data del rilievo in formato italiano', () => expect(dataRilievoTesto({ dataRilievo: '2026-10-18', creatoAt: '2026-01-01T10:00:00Z' })).toBe('18/10/2026'))
  it('rilievi vecchi senza data: quella di creazione', () => expect(dataRilievoTesto({ creatoAt: '2026-03-05T10:00:00Z' })).toBe('05/03/2026'))
})
