import { describe, expect, it } from 'vitest'
import { applicaCorrezioni, prezzoComeFp } from './prezzo'
import type { ProfiloCalcolo } from './tipi'

// Profilo ALM2026 con le correzioni della commessa 170-26G
const alm2026: ProfiloCalcolo = {
  spese_generali: 0.02, utile: 0.3, provvigione: 0.05, costo_taglio: 30, costo_lavorazione: 30, costo_montaggio: 30,
  costo_assemblaggio: 30, costo_posa: 50, imballo: 0.01, viaggio: 0.01, materiali_vari: 0.01, altro: 0.01,
}
const ore = { taglio: 0, lavorazione: 4, montaggio: 0, assemblaggio: 0, posa: 1 }

describe('prezzoComeFp', () => {
  it('commessa 170-26G al centesimo', () => {
    const r = prezzoComeFp(1231.8604, ore, alm2026, 0)
    expect(r.costoPuro).toBeCloseTo(1401.86, 2)
    expect(r.costoIndustriale).toBeCloseTo(1429.90, 2)
    expect(r.imponibile).toBeCloseTo(2034.97, 2)
  })
  it('commessa 172-26G: provvigione 1%, solo 1% altro, 230 € fissi', () => {
    const p: ProfiloCalcolo = {
      ...alm2026, spese_generali: 0.02, utile: 0.25, provvigione: 0.01, costo_lavorazione: 35, costo_posa: 0,
      imballo: 0, viaggio: 0, materiali_vari: 0, altro: 0.01,
    }
    const r = prezzoComeFp(1510.9819, { ...ore, lavorazione: 4.166667, posa: 0 }, p, 230)
    expect(r.costoPuro).toBeCloseTo(1656.82, 2)
    // FP PRO arrotonda alcuni passaggi intermedi: si accetta 1 centesimo.
    expect(Math.abs(r.imponibile - 2385.12)).toBeLessThanOrEqual(0.01)
  })
  it('provvigione al 100%: niente divisione per zero', () => {
    expect(Number.isFinite(prezzoComeFp(100, ore, { ...alm2026, provvigione: 1 }, 0).imponibile)).toBe(true)
  })
})

describe('applicaCorrezioni', () => {
  it('la correzione vale solo per la voce e somma gli extra', () => {
    const r = applicaCorrezioni(alm2026, ore, {
      ore: { posa: 2 }, percentuali: { utile: 0.25 },
      extra: [{ descrizione: 'Maniglione', importo: 80 }, { descrizione: 'Lamiera', importo: 150 }],
    })
    expect(r.ore.posa).toBe(2)
    expect(r.profilo.utile).toBe(0.25)
    expect(r.profilo.spese_generali).toBe(0.02)
    expect(r.extraFissi).toBe(230)
    expect(alm2026.utile).toBe(0.3)
  })
  it('senza correzioni: profilo e ore invariati', () => {
    expect(applicaCorrezioni(alm2026, ore, undefined)).toEqual({ profilo: alm2026, ore, extraFissi: 0 })
  })
})
