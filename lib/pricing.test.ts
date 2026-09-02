import { describe, it, expect } from 'vitest'
import { parseImporto, formatImporto, calcolaTotalePreventivo, calcolaRiepilogoIva } from '@/lib/pricing'

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

// Sconto al 100%: il caso che il DB rifiutava. La colonna sconto_globale era
// NUMERIC(4,2) CHECK (BETWEEN 0 AND 60) — oltre il 60% dava 23514, esattamente al
// 100% dava 22003 (overflow, NUMERIC(4,2) arriva a 99,99). Vedi la migrazione
// 20260902120000_sconto_globale_fino_a_100.sql. Il calcolo, invece, ha sempre retto:
// questi test lo fissano, così un domani nessuno "difende" il codice ricapando a 60.
describe('sconto globale al 100%', () => {
  it('azzera il totale senza produrre valori non finiti', () => {
    const r = calcolaTotalePreventivo(1000, 100, 40, 0, null)
    expect(r.importoSconto).toBe(1040)
    expect(r.totaleArticoli).toBe(0)
    expect(r.totaleFinale).toBe(0)
    expect(Number.isFinite(r.totaleFinale)).toBe(true)
  })

  it('azzera anche il riepilogo IVA, aliquote comprese', () => {
    const righe = [
      { prezzo_totale_riga: 800, aliquota_iva: 22, quota_trasporto: 40 },
      { prezzo_totale_riga: 200, aliquota_iva: 10, quota_trasporto: 0 },
    ]
    expect(calcolaRiepilogoIva(righe, 100, null)).toEqual([
      { aliquota: 22, imponibile: 0, iva: 0 },
      { aliquota: 10, imponibile: 0, iva: 0 },
    ])
  })

  // Lo sconto in euro pari all'intero lordo deriva una percentuale di esattamente 100:
  // è la seconda strada che finiva sullo stesso muro.
  it('lo sconto in euro pari al lordo azzera tutto allo stesso modo', () => {
    const righe = [{ prezzo_totale_riga: 1000, aliquota_iva: 22, quota_trasporto: 40 }]
    expect(calcolaRiepilogoIva(righe, 100, 1040)).toEqual([{ aliquota: 22, imponibile: 0, iva: 0 }])
    expect(calcolaTotalePreventivo(1000, 100, 40, 0, 1040).totaleFinale).toBe(0)
  })
})
