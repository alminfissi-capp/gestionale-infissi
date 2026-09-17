import { describe, it, expect } from 'vitest'
import {
  ALIQUOTA_RITENUTA,
  ALIQUOTA_RITENUTA_CONDOMINIO,
  IVA_SCORPORO_RITENUTA,
  calcolaRitenuta,
  calcolaRitenutaCondominio,
  calcolaRitenutaPer,
  nettoIncassato,
  quotaImponibile,
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

describe('quotaImponibile', () => {
  it('e il rapporto imponibile/totale della commessa', () => {
    expect(quotaImponibile(1000, 1220)).toBeCloseTo(1 / 1.22, 6)
    expect(quotaImponibile(1000, 1100)).toBeCloseTo(1 / 1.1, 6)
  })

  it('ricade sullo scorporo al 22% quando la commessa non spezza l IVA', () => {
    // 102 commesse in DB hanno iva_totale = 0: il totale e' gia' IVA compresa
    // ma nessuno l'ha scorporata. Prendere il rapporto per buono (1) farebbe
    // calcolare il 4% sul lordo.
    expect(quotaImponibile(1220, 1220)).toBeCloseTo(1 / 1.22, 6)
  })

  it('ricade sullo scorporo al 22% sui dati inutilizzabili', () => {
    const fallback = 1 / 1.22
    expect(quotaImponibile(0, 0)).toBeCloseTo(fallback, 6)
    expect(quotaImponibile(1000, 0)).toBeCloseTo(fallback, 6)
    expect(quotaImponibile(-100, 1220)).toBeCloseTo(fallback, 6)
    expect(quotaImponibile(1500, 1220)).toBeCloseTo(fallback, 6) // imponibile > totale
    expect(quotaImponibile(Number.NaN, 1220)).toBeCloseTo(fallback, 6)
    expect(quotaImponibile(null, undefined)).toBeCloseTo(fallback, 6)
  })
})

describe('calcolaRitenutaCondominio', () => {
  it('il caso di riferimento: su 122 bonificati il condominio ne trattiene 4', () => {
    // 100 imponibile + 22 IVA = 122 dovuti · 4% di 100 = 4 · arrivano 118
    const ritenuta = calcolaRitenutaCondominio(122, quotaImponibile(100, 122))
    expect(ritenuta).toBe(4)
    expect(nettoIncassato(122, ritenuta)).toBe(118)
  })

  it('scorpora con l IVA VERA della commessa, non con un 22% ipotetico', () => {
    // Commessa al 10%, il caso tipico dei condomini in ristrutturazione:
    // 110 pagati = 100 di imponibile, la trattenuta e' 4,00 e non 3,61.
    expect(calcolaRitenutaCondominio(110, quotaImponibile(100, 110))).toBe(4)
    expect(ALIQUOTA_RITENUTA_CONDOMINIO).toBe(0.04)
  })

  it('e la differenza con l 11%, che resta sempre ancorato al 22%', () => {
    expect(calcolaRitenuta(1100)).toBe(99.18) // 1100/1,22 × 11%
    expect(calcolaRitenutaCondominio(1100, quotaImponibile(1000, 1100))).toBe(40)
  })

  it('su un acconto parziale trattiene la quota imponibile di quel pezzo', () => {
    // Commessa da 12.200 (10.000 + IVA), acconto di 3.050: imponibile 2.500.
    expect(calcolaRitenutaCondominio(3050, quotaImponibile(10000, 12200))).toBe(100)
  })

  it('arrotonda al centesimo, senza code di decimali', () => {
    // 333,33/1,22 × 4% = 10,9288...
    expect(calcolaRitenutaCondominio(333.33, quotaImponibile(1000, 1220))).toBe(10.93)
  })

  it('senza quota valida scorpora al 22%', () => {
    expect(calcolaRitenutaCondominio(1220, quotaImponibile(1220, 1220))).toBe(40)
  })

  it('su un importo assente o non positivo non trattiene niente', () => {
    const q = quotaImponibile(1000, 1220)
    expect(calcolaRitenutaCondominio(0, q)).toBe(0)
    expect(calcolaRitenutaCondominio(-100, q)).toBe(0)
    expect(calcolaRitenutaCondominio(Number.NaN, q)).toBe(0)
  })
})

describe('calcolaRitenutaPer', () => {
  const q = quotaImponibile(1000, 1220)

  it('smista sull aliquota giusta secondo il tipo', () => {
    expect(calcolaRitenutaPer('detrazioni', 1220, q)).toBe(110)
    expect(calcolaRitenutaPer('condominio', 1220, q)).toBe(40)
  })

  it('senza tipo non c e ritenuta: e lo stato spunta-spenta', () => {
    expect(calcolaRitenutaPer(null, 1220, q)).toBe(0)
  })

  it('l 11% ignora la quota imponibile della commessa', () => {
    // Anche su una commessa al 10% la banca scorpora il suo 22%.
    expect(calcolaRitenutaPer('detrazioni', 1100, quotaImponibile(1000, 1100))).toBe(99.18)
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
