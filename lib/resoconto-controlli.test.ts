import { describe, it, expect } from 'vitest'
import { verificaResoconto, nomiCorrispondono } from './resoconto-controlli'
import type { DatiVerifica } from './resoconto-controlli'
import type { RigaPreventivo, RigaFattura } from './resoconto'

const prev = (totale: number, iva: number): RigaPreventivo =>
  ({ numero: 'P', data: null, oggetto: '', imponibile: totale - iva, iva, totale })

const fatt = (numero: string, totale: number, iva: number, data: string | null = null): RigaFattura =>
  ({ tipo: 'fattura', numero, data, descrizione: '', imponibile: totale - iva, iva, totale, daAllegato: true })

const base = (over: Partial<DatiVerifica> = {}): DatiVerifica => ({
  preventivi: [],
  fatture: [],
  incassi: [],
  aliquoteIva: [10, 22],
  clienteNome: 'Mario Rossi',
  destinatariPerFattura: {},
  preventiviCitati: {},
  allegatiNonLetti: [],
  ...over,
})

const codici = (d: DatiVerifica) => verificaResoconto(d).map((a) => a.codice)

describe('nomiCorrispondono', () => {
  it('accetta nome e cognome invertiti', () => {
    expect(nomiCorrispondono(
      'AZIENDA AGRICOLA DI GIANLUCA TRANCHIDA',
      'AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA',
    )).toBe(true)
  })

  it('ignora maiuscole, accenti e punteggiatura', () => {
    expect(nomiCorrispondono('Café S.r.l. Bianchi', 'CAFE SRL BIANCHI')).toBe(true)
  })

  it('rifiuta due clienti diversi', () => {
    expect(nomiCorrispondono('Mario Rossi', 'Giuseppe Verdi')).toBe(false)
  })

  it('non si pronuncia se una delle due stringhe e’ vuota', () => {
    expect(nomiCorrispondono('', 'Giuseppe Verdi')).toBe(true)
  })
})

describe('verificaResoconto', () => {
  it('non segnala nulla quando i conti tornano', () => {
    const d = base({ preventivi: [prev(1220, 220)], fatture: [fatt('1/2026', 1220, 220)] })
    expect(codici(d)).toEqual([])
  })

  it('non segnala nulla su un resoconto ancora vuoto', () => {
    expect(codici(base())).toEqual([])
  })

  it('segnala il preventivato non fatturato', () => {
    const d = base({ preventivi: [prev(1220, 220)], fatture: [fatt('1/2026', 1000, 180.33)] })
    const avvisi = verificaResoconto(d)
    expect(avvisi.map((a) => a.codice)).toContain('preventivato_non_fatturato')
    expect(avvisi.find((a) => a.codice === 'preventivato_non_fatturato')!.differenza)
      .toBeCloseTo(220, 2)
  })

  it('segnala il fatturato oltre il preventivo', () => {
    const d = base({ preventivi: [prev(1000, 180.33)], fatture: [fatt('1/2026', 1220, 220)] })
    expect(codici(d)).toContain('fatturato_oltre_preventivo')
  })

  it('non confronta col preventivo se non ci sono righe preventivo', () => {
    const d = base({ fatture: [fatt('1/2026', 1220, 220)] })
    expect(codici(d)).not.toContain('fatturato_oltre_preventivo')
    expect(codici(d)).not.toContain('preventivato_non_fatturato')
  })

  it('segnala gli incassi superiori al fatturato', () => {
    const d = base({ fatture: [fatt('1/2026', 1000, 180.33)], incassi: [{ importo: 1500 }] })
    expect(codici(d)).toContain('incassato_oltre_fatturato')
  })

  it('non segnala incassi inferiori al fatturato', () => {
    const d = base({ fatture: [fatt('1/2026', 1000, 180.33)], incassi: [{ importo: 500 }] })
    expect(codici(d)).not.toContain('incassato_oltre_fatturato')
  })

  it('segnala due allegati con lo stesso numero di fattura', () => {
    const d = base({ fatture: [fatt('1/2026', 100, 0), fatt('1/2026', 100, 0)] })
    expect(codici(d)).toContain('fattura_duplicata')
  })

  it('non confonde una nota di credito con la fattura di pari numero', () => {
    const nota: RigaFattura = {
      tipo: 'nota_credito', numero: '1/2026', data: null, descrizione: '',
      imponibile: -100, iva: 0, totale: -100, daAllegato: true,
    }
    const d = base({ fatture: [fatt('1/2026', 100, 0), nota] })
    expect(codici(d)).not.toContain('fattura_duplicata')
  })

  it('segnala gli allegati non riconosciuti', () => {
    const d = base({ allegatiNonLetti: ['Fattura 5-2026.pdf'] })
    const a = verificaResoconto(d).find((x) => x.codice === 'allegato_non_letto')!
    expect(a.messaggio).toContain('Fattura 5-2026.pdf')
  })

  it('segnala un’aliquota IVA fuori da quelle configurate', () => {
    const d = base({ fatture: [fatt('1/2026', 104, 4)] })
    expect(codici(d)).toContain('iva_incoerente')
  })

  it('accetta le aliquote configurate', () => {
    const d = base({ fatture: [fatt('1/2026', 110, 10), fatt('2/2026', 122, 22)] })
    expect(codici(d)).not.toContain('iva_incoerente')
  })

  it('segnala la fattura anteriore al preventivo che cita', () => {
    const d = base({
      fatture: [fatt('1/2026', 122, 22, '2026-01-10')],
      preventiviCitati: { '1/2026': { numero: '9/2026', data: '2026-02-01' } },
    })
    expect(codici(d)).toContain('fattura_precede_preventivo')
  })

  it('accetta la fattura successiva al preventivo', () => {
    const d = base({
      fatture: [fatt('1/2026', 122, 22, '2026-03-10')],
      preventiviCitati: { '1/2026': { numero: '9/2026', data: '2026-02-01' } },
    })
    expect(codici(d)).not.toContain('fattura_precede_preventivo')
  })

  it('segnala il destinatario che non e’ il cliente della commessa', () => {
    const d = base({
      fatture: [fatt('1/2026', 122, 22)],
      destinatariPerFattura: { '1/2026': 'Giuseppe Verdi' },
    })
    expect(codici(d)).toContain('destinatario_diverso')
  })

  it('non segnala il destinatario col nome invertito', () => {
    const d = base({
      clienteNome: 'AZIENDA AGRICOLA DI GIANLUCA TRANCHIDA',
      fatture: [fatt('1/2026', 122, 22)],
      destinatariPerFattura: { '1/2026': 'AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA' },
    })
    expect(codici(d)).not.toContain('destinatario_diverso')
  })

  it('mette gli avvisi sui totali prima di quelli sulle singole righe', () => {
    const d = base({
      preventivi: [prev(1220, 220)],
      fatture: [fatt('1/2026', 104, 4)],
    })
    expect(codici(d)[0]).toBe('preventivato_non_fatturato')
  })
})
