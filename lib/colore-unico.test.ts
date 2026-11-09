import { describe, expect, it } from 'vitest'
import { colori, coloriUguali, eBicolore, toglieBicolore } from './colore-unico'

const bianco = { fpId: 56, descrizione: 'RAL 9010' }
const noce = { fpId: 70, descrizione: 'Noce' }

describe('colore unico e Bicolore', () => {
  it("bicolore con due colori diversi, o con un lato solo indicato (cosi' si vede che l'altro manca)", () => {
    expect(eBicolore(bianco, null)).toBe(true)
    expect(eBicolore(null, noce)).toBe(true)
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

describe('coloriUguali: niente modifica finta', () => {
  it('stessi colori (anche oggetti diversi): uguali', () =>
    expect(coloriUguali({ coloreInt: bianco, coloreEst: bianco }, { coloreInt: { ...bianco }, coloreEst: bianco })).toBe(true))
  it('tutti vuoti: uguali', () => expect(coloriUguali({ coloreInt: null, coloreEst: undefined }, { coloreInt: null, coloreEst: null })).toBe(true))
  it('esterno diverso: diversi', () => expect(coloriUguali({ coloreInt: bianco, coloreEst: noce }, colori(bianco))).toBe(false))
})
