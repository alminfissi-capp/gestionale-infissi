import { describe, it, expect } from 'vitest'
import {
  percentualeProvvigione,
  fattoreProvvigione,
  applicaProvvigione,
  togliProvvigione,
  senzaProvvigione,
  importoProvvigione,
  calcolaTotaliConProvvigione,
  senzaDatiProvvigione,
  arrotondaCent,
  formatPercentuale,
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
    const [r] = applicaProvvigione([{ prezzo_unitario: 100, prezzo_totale_riga: 200, quantita: 2, altro: 'x' }], 5)
    expect(r.prezzo_unitario).toBeCloseTo(105, 10)
    expect(r.prezzo_totale_riga).toBeCloseTo(210, 10)
    expect(r.altro).toBe('x')
  })
  it('togliere riporta al mio prezzo', () => {
    const base = [{ prezzo_unitario: 100, prezzo_totale_riga: 300, quantita: 3 }]
    const [r] = togliProvvigione(applicaProvvigione(base, 5), 5)
    expect(r.prezzo_unitario).toBeCloseTo(100, 8)
    expect(r.prezzo_totale_riga).toBeCloseTo(300, 8)
  })
  it('prezzi cliente ai centesimi, totale riga = unitario x quantita (colonne NUMERIC(10,2))', () => {
    const [r] = applicaProvvigione([{ prezzo_unitario: 33.33, prezzo_totale_riga: 99.99, quantita: 3 }], 5)
    expect(r.prezzo_unitario).toBe(35)
    expect(r.prezzo_totale_riga).toBe(105)
    const [s] = applicaProvvigione([{ prezzo_unitario: 100, prezzo_totale_riga: 180, quantita: 2, sconto_articolo: 10 }], 5)
    expect(s.prezzo_unitario).toBe(105)
    expect(s.prezzo_totale_riga).toBe(189)
    const [o] = applicaProvvigione([{ prezzo_unitario: 100, prezzo_totale_riga: 0, quantita: 1, omaggio: true }], 5)
    expect(o.prezzo_totale_riga).toBe(0)
  })
  it('riaprire e risalvare non sposta nemmeno un centesimo', () => {
    const salvate = applicaProvvigione([{ prezzo_unitario: 10.09, prezzo_totale_riga: 10.09, quantita: 1 }], 5)
    const risalvate = applicaProvvigione(togliProvvigione(salvate, 5), 5)
    expect(risalvate).toEqual(salvate)
  })
  it('con 0% le righe restano uguali', () => {
    const base = [{ prezzo_unitario: 100, prezzo_totale_riga: 200, quantita: 2 }]
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

describe('arrotondamenti e riapertura', () => {
  const riga = (prezzo: number) => ({ prezzo_unitario: prezzo, prezzo_totale_riga: prezzo, aliquota_iva: 22, quantita: 1 })
  const conti = (articoliBase: ReturnType<typeof riga>[], pct: number) => calcolaTotaliConProvvigione({
    articoliBase, trasportoBase: 33.33, quoteBase: articoliBase.map(() => 33.33 / articoliBase.length),
    scontoGlobale: 0, scontoImportoFisso: null, provvigionePct: pct, provvigioneImportoFisso: null,
  })

  it('il subtotale e la somma delle righe come salvate (3 x 10,59 = 31,77)', () => {
    const t = conti([riga(10.09), riga(10.09), riga(10.09)], 5)
    expect(t.articoli.map((a) => a.prezzo_unitario)).toEqual([10.59, 10.59, 10.59])
    expect(t.subtotale).toBeCloseTo(31.77, 10)
    expect(t.speseTrasporto).toBe(35)
  })

  it('riaprire (togli) e risalvare da totali identici', () => {
    const primo = conti([riga(10.09), riga(10.09), riga(10.09)], 5)
    const secondo = conti(togliProvvigione(primo.articoli, 5), 5)
    expect(secondo.subtotale).toBeCloseTo(primo.subtotale, 10)
    expect(secondo.totaleFinale).toBeCloseTo(primo.totaleFinale, 10)
    expect(secondo.provvigioneImporto).toBe(primo.provvigioneImporto)
  })

  it('arrotondaCent per i campi di modifica', () => {
    expect(arrotondaCent(123.44761904761905)).toBe(123.45)
    expect(arrotondaCent(10)).toBe(10)
  })
})

describe('senzaDatiProvvigione (link pubblico)', () => {
  it('toglie le colonne della provvigione e lascia il resto', () => {
    const p = { id: 'x', totale_finale: 100, provvigione_percentuale: 5, provvigione_importo: 4.76, provvigione_importo_fisso: null }
    const r = senzaDatiProvvigione(p)
    expect(r).toEqual({ id: 'x', totale_finale: 100 })
    expect('provvigione_percentuale' in r).toBe(false)
  })
})

describe('formatPercentuale', () => {
  it('formatta come nei campi del wizard', () => {
    expect(formatPercentuale(5)).toBe('5')
    expect(formatPercentuale(4.761904)).toBe('4.76')
  })
})

describe('scontoPct effettivo', () => {
  const riga = (prezzo: number) => ({ prezzo_unitario: prezzo, prezzo_totale_riga: prezzo, aliquota_iva: 22, quantita: 1 })
  it('sconto in euro: la percentuale salvata segue il lordo con provvigione', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(10000)], trasportoBase: 0, quoteBase: [0],
      scontoGlobale: 10, scontoImportoFisso: 1050, provvigionePct: 5, provvigioneImportoFisso: null,
    })
    expect(t.scontoPct).toBeCloseTo(10, 10)
  })
  it('sconto in percentuale resta quello scritto', () => {
    const t = calcolaTotaliConProvvigione({
      articoliBase: [riga(10000)], trasportoBase: 0, quoteBase: [0],
      scontoGlobale: 7, scontoImportoFisso: null, provvigionePct: 5, provvigioneImportoFisso: null,
    })
    expect(t.scontoPct).toBe(7)
  })
})
