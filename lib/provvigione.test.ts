import { describe, it, expect } from 'vitest'
import {
  percentualeProvvigione,
  fattoreProvvigione,
  applicaProvvigione,
  togliProvvigione,
  senzaProvvigione,
  importoProvvigione,
} from '@/lib/provvigione'

describe('percentualeProvvigione', () => {
  it('in percentuale resta quella', () => {
    expect(percentualeProvvigione(10000, 5, null)).toBe(5)
  })
  it('in euro diventa la percentuale sul mio prezzo', () => {
    expect(percentualeProvvigione(10000, 0, 500)).toBe(5)
  })
  it('senza prezzo non c e provvigione', () => {
    expect(percentualeProvvigione(0, 0, 500)).toBe(0)
  })
  it('mai negativa', () => {
    expect(percentualeProvvigione(10000, -3, null)).toBe(0)
    expect(percentualeProvvigione(10000, 0, -100)).toBe(0)
  })
})

describe('applica / togli', () => {
  it('maggiora unitario e totale riga', () => {
    const [r] = applicaProvvigione([{ prezzo_unitario: 100, prezzo_totale_riga: 200, altro: 'x' }], 5)
    expect(r.prezzo_unitario).toBeCloseTo(105, 10)
    expect(r.prezzo_totale_riga).toBeCloseTo(210, 10)
    expect(r.altro).toBe('x')
  })
  it('togliere riporta al mio prezzo', () => {
    const base = [{ prezzo_unitario: 123.45, prezzo_totale_riga: 370.35 }]
    const [r] = togliProvvigione(applicaProvvigione(base, 5), 5)
    expect(r.prezzo_unitario).toBeCloseTo(123.45, 8)
    expect(r.prezzo_totale_riga).toBeCloseTo(370.35, 8)
  })
  it('con 0% le righe restano uguali', () => {
    const base = [{ prezzo_unitario: 100, prezzo_totale_riga: 200 }]
    expect(applicaProvvigione(base, 0)).toEqual(base)
  })
  it('fattore e senzaProvvigione', () => {
    expect(fattoreProvvigione(5)).toBeCloseTo(1.05, 10)
    expect(senzaProvvigione(105, 5)).toBeCloseTo(100, 10)
  })
})

describe('importoProvvigione', () => {
  it('lo sconto pesa anche sull agente: 10.000 + 5% - 10% → 450', () => {
    expect(importoProvvigione(10500, 9450, 5)).toBe(450)
  })
  it('senza sconto: 500', () => {
    expect(importoProvvigione(10500, 10500, 5)).toBe(500)
  })
  it('senza prezzo: 0', () => {
    expect(importoProvvigione(0, 0, 5)).toBe(0)
  })
})
