import { describe, expect, it } from 'vitest'
import type { PuntoForma } from '@/types/rilievo-grafico'
import { applicaQuota, formaValida, quoteForma } from './quote-forma'

const R: PuntoForma[] = [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 1400 }, { x: 0, h: 1400 }]

/** Valori delle quote per id */
const valori = (p: PuntoForma[] | null) => {
  if (!p) throw new Error('forma non valida')
  return Object.fromEntries(quoteForma(p).map(q => [q.id, q.valore]))
}
const passo = (p: PuntoForma[] | null, id: string, v: number) => {
  if (!p) throw new Error('forma non valida')
  return applicaQuota(p, id, v)
}

describe('quote del quadrilatero', () => {
  it('rettangolo: una quota per lato e niente scarti', () => {
    expect(valori(R)).toEqual({ L0: 1200, L1: 1400, L2: 1200, L3: 1400 })
  })

  it('testa piu\' corta: si centra con 100 e 100', () => {
    const p = applicaQuota(R, 'L2', 1000)
    expect(p).toEqual([{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1100, h: 1400 }, { x: 100, h: 1400 }])
    expect(valori(p)).toMatchObject({ L0: 1200, L2: 1000, S2a: 100, S2b: 100 })
  })

  it('scarto a 0: lato a squadra, tutta la differenza dall\'altra parte', () => {
    const p = passo(applicaQuota(R, 'L2', 1000), 'S2a', 0)
    expect(valori(p)).toMatchObject({ L0: 1200, L2: 1000, S2a: 0, S2b: 200 })
    expect(p).toContainEqual({ x: 0, h: 1400 })
  })

  it('altezza destra piu\' bassa: centrata, 100 sopra e 100 sotto; poi 0 sotto', () => {
    const p = applicaQuota(R, 'L1', 1200)
    expect(valori(p)).toMatchObject({ L1: 1200, L3: 1400, S1a: 100, S1b: 100 })
    const q = passo(p, 'S1a', 0)
    expect(valori(q)).toMatchObject({ L1: 1200, S1a: 0, S1b: 200 })
    expect(q).toContainEqual({ x: 1200, h: 0 })
  })

  it('misure impossibili non si applicano', () => {
    expect(applicaQuota(R, 'L2', 0)).toBeNull()
    expect(applicaQuota(R, 'L2', -5)).toBeNull()
    expect(applicaQuota(R, 'L2', Number.NaN)).toBeNull()
    expect(passo(applicaQuota(R, 'L2', 1000), 'S2a', -1)).toBeNull()
    expect(applicaQuota(R, 'X9', 100)).toBeNull()
  })

  it('una forma che si incrocia non e\' valida', () => {
    expect(formaValida(R)).toBe(true)
    expect(formaValida([{ x: 0, h: 0 }, { x: 1200, h: 1400 }, { x: 1200, h: 0 }, { x: 0, h: 1400 }])).toBe(false)
  })
})
