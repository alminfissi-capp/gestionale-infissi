import { describe, expect, it } from 'vitest'
import { colori, eBicolore, toglieBicolore } from './colore-unico'

const bianco = { fpId: 56, descrizione: 'RAL 9010' }
const noce = { fpId: 70, descrizione: 'Noce' }

describe('colore unico e Bicolore', () => {
  it('bicolore solo con due colori diversi', () => {
    expect(eBicolore(bianco, null)).toBe(false)
    expect(eBicolore(null, noce)).toBe(false)
    expect(eBicolore(bianco, { ...bianco })).toBe(false)
    expect(eBicolore(bianco, noce)).toBe(true)
    expect(eBicolore(undefined, undefined)).toBe(false)
  })
  it('colore unico: stesso colore dentro e fuori', () =>
    expect(colori(bianco)).toEqual({ coloreInt: bianco, coloreEst: bianco }))
  it('togliendo il Bicolore vale l interno (o l esterno se l interno manca)', () => {
    expect(toglieBicolore(bianco, noce)).toEqual({ coloreInt: bianco, coloreEst: bianco })
    expect(toglieBicolore(null, noce)).toEqual({ coloreInt: noce, coloreEst: noce })
  })
})
