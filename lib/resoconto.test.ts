import { describe, it, expect } from 'vitest'
import { calcolaTotaliResoconto, bozzaNotaScostamento } from './resoconto'
import type { RigaPreventivo, RigaFattura } from './resoconto'

const prev = (totale: number, iva: number): RigaPreventivo =>
  ({ numero: 'P', data: null, oggetto: '', imponibile: totale - iva, iva, totale })

const fatt = (totale: number, iva: number): RigaFattura =>
  ({ tipo: 'fattura', numero: 'F', data: null, descrizione: '', imponibile: totale - iva, iva, totale, daAllegato: true })

describe('calcolaTotaliResoconto', () => {
  it('riproduce i numeri della commessa Tranchida 174-2025', () => {
    const preventivi = [
      prev(37351.85, 6735.58),
      prev(12331.88, 2223.78),
      prev(2244.80, 404.80),
    ]
    const fatture = [
      fatt(18500.01, 3336.07),
      fatt(6165.94, 1111.89),
      fatt(26910.72, 4852.75),
    ]
    const incassi = [18500, 5500, 5000, 2000, 12000].map((importo) => ({ importo }))

    const t = calcolaTotaliResoconto(preventivi, fatture, incassi)

    expect(t.preventivatoTotale).toBeCloseTo(51928.53, 2)
    expect(t.fatturatoTotale).toBeCloseTo(51576.67, 2)
    expect(t.incassato).toBeCloseTo(43000, 2)
    expect(t.saldoResiduoFatture).toBeCloseTo(8576.67, 2)
    expect(t.preventivatoNonFatturato).toBeCloseTo(351.86, 2)
    expect(t.totaleASaldo).toBeCloseTo(8928.53, 2)
  })

  it('somma anche imponibili e IVA separatamente', () => {
    const t = calcolaTotaliResoconto([prev(1220, 220)], [fatt(610, 110)], [])
    expect(t.preventivatoImponibile).toBeCloseTo(1000, 2)
    expect(t.preventivatoIva).toBeCloseTo(220, 2)
    expect(t.fatturatoImponibile).toBeCloseTo(500, 2)
    expect(t.fatturatoIva).toBeCloseTo(110, 2)
  })

  it('sottrae le note di credito dal fatturato', () => {
    const nota: RigaFattura = {
      tipo: 'nota_credito', numero: 'NC1', data: null, descrizione: '',
      imponibile: -100, iva: -22, totale: -122, daAllegato: true,
    }
    const t = calcolaTotaliResoconto([], [fatt(1220, 220), nota], [])
    expect(t.fatturatoTotale).toBeCloseTo(1098, 2)
    expect(t.fatturatoImponibile).toBeCloseTo(900, 2)
  })

  it('da zero su tutte le voci quando non c’e’ nulla', () => {
    const t = calcolaTotaliResoconto([], [], [])
    expect(t.totaleASaldo).toBe(0)
    expect(t.preventivatoNonFatturato).toBe(0)
    expect(t.saldoResiduoFatture).toBe(0)
  })

  it('azzera gli scarti da arrotondamento sotto il centesimo', () => {
    const t = calcolaTotaliResoconto([prev(1000, 180)], [fatt(1000.004, 180)], [])
    expect(t.preventivatoNonFatturato).toBe(0)
  })
})

describe('bozzaNotaScostamento', () => {
  it('scrive la bozza con imponibile e IVA scorporati', () => {
    const b = bozzaNotaScostamento(351.86, 22)
    expect(b).not.toBeNull()
    expect(b!.titolo).toContain('351,86')
    expect(b!.testo).toContain('288,41')
    expect(b!.testo).toContain('fattura integrativa')
  })

  it('non produce nulla per differenze irrilevanti', () => {
    expect(bozzaNotaScostamento(0.004, 22)).toBeNull()
    expect(bozzaNotaScostamento(0, 22)).toBeNull()
  })

  it('cambia testo quando si e’ fatturato piu’ del preventivato', () => {
    const b = bozzaNotaScostamento(-500, 22)
    expect(b).not.toBeNull()
    expect(b!.titolo).toContain('500,00')
    expect(b!.testo.toLowerCase()).toContain('in eccesso')
  })
})
