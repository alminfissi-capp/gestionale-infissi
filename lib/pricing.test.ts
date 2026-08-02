import { describe, it, expect } from 'vitest'
import { parseImporto, formatImporto } from '@/lib/pricing'

describe('parseImporto', () => {
  it('legge il formato italiano con migliaia e decimali', () => {
    expect(parseImporto('1.234,56')).toBe(1234.56)
    expect(parseImporto('1.234.567,89')).toBe(1234567.89)
  })

  it('legge la sola virgola decimale', () => {
    expect(parseImporto('12,50')).toBe(12.5)
  })

  it('legge il punto decimale', () => {
    expect(parseImporto('1234.56')).toBe(1234.56)
  })

  it('tratta il punto delle migliaia come separatore, non come decimale', () => {
    expect(parseImporto('1.234')).toBe(1234)
    expect(parseImporto('1.234.567')).toBe(1234567)
  })

  it('ignora spazi e simbolo di euro', () => {
    expect(parseImporto(' € 1.200,00 ')).toBe(1200)
  })

  it('vale 0 su stringa vuota o testo non numerico', () => {
    expect(parseImporto('')).toBe(0)
    expect(parseImporto('   ')).toBe(0)
    expect(parseImporto('abc')).toBe(0)
  })

  it('legge i negativi', () => {
    expect(parseImporto('-350,00')).toBe(-350)
  })
})

describe('formatImporto', () => {
  it('scrive sempre due decimali con la virgola', () => {
    expect(formatImporto(1234.5)).toBe('1234,50')
    expect(formatImporto(0)).toBe('0,00')
  })

  // L'italiano raggruppa solo da cinque cifre (minimumGroupingDigits: 2),
  // quindi 1234 resta senza punto mentre 12345 lo prende. Diverso da
  // formatEuro, che raggruppa sempre: qui si sta scrivendo dentro un input.
  it('mette il punto delle migliaia solo da cinque cifre in su', () => {
    expect(formatImporto(12345.5)).toBe('12.345,50')
  })

  it('fa il giro completo con parseImporto', () => {
    expect(parseImporto(formatImporto(9876.54))).toBe(9876.54)
  })
})
