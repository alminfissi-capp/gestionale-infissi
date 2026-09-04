import { describe, it, expect } from 'vitest'
import {
  ALIQUOTA_RITENUTA,
  IVA_SCORPORO_RITENUTA,
  calcolaRitenuta,
  nettoIncassato,
} from '@/lib/ritenuta-acconto'

describe('calcolaRitenuta', () => {
  it('il caso di riferimento: su 1.220 lordi la banca trattiene 110', () => {
    // 1220 / 1,22 = 1000 imponibile · 11% = 110 · restano 1.110
    expect(calcolaRitenuta(1220)).toBe(110)
  })

  it('scorpora sempre al 22%, anche quando la commessa e a un altra aliquota', () => {
    // Una commessa al 10% non cambia il conto della banca: 1100/1,22*0,11
    expect(calcolaRitenuta(1100)).toBe(99.18)
    expect(IVA_SCORPORO_RITENUTA).toBe(0.22)
    expect(ALIQUOTA_RITENUTA).toBe(0.11)
  })

  it('arrotonda al centesimo, senza code di decimali', () => {
    // 1000/1,22*0,11 = 90,163934...
    expect(calcolaRitenuta(1000)).toBe(90.16)
    expect(calcolaRitenuta(333.33)).toBe(30.05)
  })

  it('vale il 9,0164% del lordo, la scorciatoia che torna sempre', () => {
    for (const lordo of [500, 1220, 2440, 7350.5]) {
      expect(calcolaRitenuta(lordo)).toBeCloseTo(lordo * 0.11 / 1.22, 2)
    }
  })

  it('su un importo assente o non positivo non trattiene niente', () => {
    expect(calcolaRitenuta(0)).toBe(0)
    expect(calcolaRitenuta(-100)).toBe(0)
    expect(calcolaRitenuta(Number.NaN)).toBe(0)
  })
})

describe('nettoIncassato', () => {
  it('e il lordo meno la trattenuta', () => {
    expect(nettoIncassato(1220, 110)).toBe(1110)
  })

  it('senza ritenuta l incassato coincide col bonificato', () => {
    expect(nettoIncassato(1220, 0)).toBe(1220)
    expect(nettoIncassato(1220, null)).toBe(1220)
    expect(nettoIncassato(1220, undefined)).toBe(1220)
  })

  it('non scende mai sotto zero, nemmeno con una ritenuta assurda in DB', () => {
    expect(nettoIncassato(100, 500)).toBe(0)
  })
})
