import { describe, it, expect } from 'vitest'
import {
  percentualeProvvigione,
  fattoreProvvigione,
  applicaProvvigione,
  togliProvvigione,
  senzaProvvigione,
  importoProvvigione,
  calcolaTotaliConProvvigione,
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

describe('calcolaTotaliConProvvigione', () => {
  const riga = (prezzo: number, iva: number | null = 22) => ({ prezzo_unitario: prezzo, prezzo_totale_riga: prezzo, aliquota_iva: iva, quantita: 1 })

  it('esempio della chat: 10.000, provvigione 5%, sconto 10% → 9.450, agente 450', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(6000), riga(4000)], trasportoBase: 0, quoteBase: [0, 0],
      scontoGlobale: 10, scontoImportoFisso: null, provvigionePct: 5, provvigioneImportoFisso: null,
    })
    expect(t.articoli[0].prezzo_unitario).toBeCloseTo(6300, 8)
    expect(t.subtotale).toBeCloseTo(10500, 8)
    expect(t.totaleArticoli).toBeCloseTo(9450, 8)
    expect(t.provvigioneImporto).toBe(450)
    expect(t.provvigionePct).toBe(5)
  })

  it('anche il trasporto e le sue quote salgono della provvigione', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(900)], trasportoBase: 100, quoteBase: [100],
      scontoGlobale: 0, scontoImportoFisso: null, provvigionePct: 5, provvigioneImportoFisso: null,
    })
    expect(t.speseTrasporto).toBeCloseTo(105, 8)
    expect(t.quoteTrasporto[0]).toBeCloseTo(105, 8)
    expect(t.totaleArticoli).toBeCloseTo(1050, 8)
    expect(t.ivaTotale).toBeCloseTo(1050 * 0.22, 8)
    expect(t.provvigioneImporto).toBe(50)
  })

  it('provvigione in euro: 500 su 10.000 = 5%', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(10000)], trasportoBase: 0, quoteBase: [0],
      scontoGlobale: 0, scontoImportoFisso: null, provvigionePct: 0, provvigioneImportoFisso: 500,
    })
    expect(t.provvigionePct).toBeCloseTo(5, 10)
    expect(t.totaleArticoli).toBeCloseTo(10500, 8)
    expect(t.provvigioneImporto).toBe(500)
  })

  it('sconto in euro resta l importo esatto sul lordo maggiorato', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(10000)], trasportoBase: 0, quoteBase: [0],
      scontoGlobale: 0, scontoImportoFisso: 1050, provvigionePct: 5, provvigioneImportoFisso: null,
    })
    expect(t.importoSconto).toBeCloseTo(1050, 8)
    expect(t.totaleArticoli).toBeCloseTo(9450, 8)
    expect(t.provvigioneImporto).toBe(450)
  })

  it('senza provvigione i totali sono quelli di sempre', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(1000)], trasportoBase: 50, quoteBase: [50],
      scontoGlobale: 10, scontoImportoFisso: null, provvigionePct: 0, provvigioneImportoFisso: null,
    })
    expect(t.totaleArticoli).toBeCloseTo(945, 8)
    expect(t.provvigioneImporto).toBe(0)
  })
})
