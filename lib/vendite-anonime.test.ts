import { describe, it, expect } from 'vitest'
import {
  ALIQUOTA_IVA_DEFAULT,
  scorporaIva,
  calcolaUtile,
  margine,
  totaliVendite,
} from './vendite-anonime'

describe('scorporaIva', () => {
  it('scorpora il 22% da un lordo tondo', () => {
    expect(scorporaIva(244, 22)).toEqual({ imponibile: 200, iva: 44 })
  })

  it('la somma di imponibile e IVA ridà sempre il lordo esatto', () => {
    for (const lordo of [100, 33.33, 1, 0.01, 9999.99]) {
      const { imponibile, iva } = scorporaIva(lordo, 22)
      expect(imponibile + iva).toBeCloseTo(lordo, 2)
    }
  })

  it('con aliquota 0 il lordo e l’imponibile coincidono', () => {
    expect(scorporaIva(150, 0)).toEqual({ imponibile: 150, iva: 0 })
  })

  it('con importo 0 non divide per zero', () => {
    expect(scorporaIva(0, 22)).toEqual({ imponibile: 0, iva: 0 })
  })

  it('l’aliquota di default è 22', () => {
    expect(ALIQUOTA_IVA_DEFAULT).toBe(22)
  })
})

describe('calcolaUtile', () => {
  it('sottrae i costi dall’imponibile', () => {
    expect(calcolaUtile(200, 80, 30)).toBe(90)
  })

  it('può essere negativo: una vendita in perdita resta in perdita', () => {
    expect(calcolaUtile(100, 80, 40)).toBe(-20)
  })

  it('arrotonda a due decimali', () => {
    expect(calcolaUtile(81.97, 20.005, 0)).toBe(61.97)
  })
})

describe('margine', () => {
  it('è la percentuale dell’utile sull’imponibile', () => {
    expect(margine(200, 90)).toBe(45)
  })

  it('è 0 quando non c’è imponibile, senza dividere per zero', () => {
    expect(margine(0, 50)).toBe(0)
  })

  it('segue l’utile in negativo', () => {
    expect(margine(100, -20)).toBe(-20)
  })
})

describe('totaliVendite', () => {
  const vendite = [
    { lordo: 244, imponibile: 200, materiale: 80, manodopera: 30, utile: 90 },
    { lordo: 122, imponibile: 100, materiale: 40, manodopera: 10, utile: 50 },
  ]

  it('somma riga per riga', () => {
    expect(totaliVendite(vendite)).toEqual({
      numero: 2,
      lordo: 366,
      imponibile: 300,
      materiale: 120,
      manodopera: 40,
      utile: 140,
      margine: 46.67,
    })
  })

  it('su un elenco vuoto restituisce zeri, non NaN', () => {
    expect(totaliVendite([])).toEqual({
      numero: 0, lordo: 0, imponibile: 0,
      materiale: 0, manodopera: 0, utile: 0, margine: 0,
    })
  })

  it('calcola il margine sui totali, non come media dei margini di riga', () => {
    const t = totaliVendite([
      { lordo: 1220, imponibile: 1000, materiale: 900, manodopera: 0, utile: 100 },
      { lordo: 12.2, imponibile: 10, materiale: 1, manodopera: 0, utile: 9 },
    ])
    expect(t.margine).toBe(10.79)
  })
})
