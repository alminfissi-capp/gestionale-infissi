import { describe, it, expect } from 'vitest'
import {
  calcolaAccessoriSuMisura,
  calcolaPrezzoUnitarioSuMisura,
  selezioneAccessoriDaConfig,
  type GruppoCalcolo,
} from '@/lib/su-misura'

// Fixture modellata su "VEPA MC-SLIDE" (categoria VEPA COVETOOLS, tipo su_misura)
const GRUPPI: GruppoCalcolo[] = [
  {
    id: 'g-ante',
    tipo_scelta: 'incluso',
    accessori: [
      { id: 'a-ante', nome: 'ANTE SCORREVOLI', unita: 'pz', prezzo: 175, prezzo_acquisto: 100, qty_default: 2 },
    ],
  },
  {
    id: 'g-kit',
    tipo_scelta: 'multiplo',
    accessori: [
      { id: 'a-serratura', nome: 'Kit Serratura', unita: 'pz', prezzo: 70, prezzo_acquisto: 40, qty_default: 1 },
      { id: 'a-maniglie', nome: 'Kit Maniglie', unita: 'pz', prezzo: 15, prezzo_acquisto: 8, qty_default: 1 },
    ],
  },
  {
    id: 'g-vetro',
    tipo_scelta: 'singolo',
    accessori: [
      { id: 'a-vetro-trasp', nome: '10mm Temperato TRASPARENTE', unita: 'mq', prezzo: 55, prezzo_acquisto: 30, qty_default: 1 },
      { id: 'a-vetro-sat', nome: '10mm Temperato SATINATO', unita: 'mq', prezzo: 75, prezzo_acquisto: 45, qty_default: 1 },
    ],
  },
]

const MQ = 9.1884 // 3534 × 2600 mm

describe('calcolaAccessoriSuMisura', () => {
  it('moltiplica per i mq solo gli accessori con unità mq', () => {
    const r = calcolaAccessoriSuMisura(GRUPPI, { 'a-vetro-trasp': 1 }, MQ)

    const vetro = r.accessori.find((a) => a.accessorio_id === 'a-vetro-trasp')!
    expect(vetro.qty).toBeCloseTo(MQ, 6)
    expect(vetro.totale).toBeCloseTo(55 * MQ, 6)

    const ante = r.accessori.find((a) => a.accessorio_id === 'a-ante')!
    expect(ante.qty).toBe(2)
    expect(ante.totale).toBe(350)
  })

  it('include gli accessori dei gruppi "incluso" anche senza selezione esplicita', () => {
    const r = calcolaAccessoriSuMisura(GRUPPI, {}, MQ)
    expect(r.accessori.map((a) => a.accessorio_id)).toEqual(['a-ante'])
    expect(r.totale).toBe(350)
  })

  it('rispetta la quantità scelta dall utente sui gruppi "incluso"', () => {
    const r = calcolaAccessoriSuMisura(GRUPPI, { 'a-ante': 4 }, MQ)
    const ante = r.accessori.find((a) => a.accessorio_id === 'a-ante')!
    expect(ante.qty).toBe(4)
    expect(ante.totale).toBe(700)
    // il totale deve sempre coincidere con la somma delle righe salvate
    expect(r.totale).toBe(r.accessori.reduce((s, a) => s + a.totale, 0))
  })

  it('esclude gli accessori non selezionati o con quantità zero', () => {
    const r = calcolaAccessoriSuMisura(GRUPPI, { 'a-serratura': 0 }, MQ)
    expect(r.accessori.some((a) => a.accessorio_id === 'a-serratura')).toBe(false)
  })

  it('somma il costo di acquisto sulla quantità effettiva', () => {
    const r = calcolaAccessoriSuMisura(GRUPPI, { 'a-vetro-trasp': 1 }, MQ)
    expect(r.costoAcquisto).toBeCloseTo(100 * 2 + 30 * MQ, 6)
  })
})

describe('selezioneAccessoriDaConfig', () => {
  it('riporta la quantità effettiva salvata alla quantità grezza del form', () => {
    const salvato = calcolaAccessoriSuMisura(GRUPPI, { 'a-vetro-trasp': 1, 'a-serratura': 1 }, MQ)
    const sel = selezioneAccessoriDaConfig({ accessori: salvato.accessori, mq: MQ })

    expect(sel['a-vetro-trasp']).toBe(1) // NON MQ: la moltiplicazione è già stata applicata
    expect(sel['a-serratura']).toBe(1)
    expect(sel['a-ante']).toBe(2)
  })

  it('non divide per zero se i mq salvati sono assenti', () => {
    const sel = selezioneAccessoriDaConfig({
      accessori: [
        { accessorio_id: 'x', gruppo_id: 'g', nome: 'X', unita: 'mq', qty: 3, prezzo_unitario: 10, totale: 30 },
      ],
      mq: 0,
    })
    expect(sel['x']).toBe(3)
  })
})

describe('round-trip salva → riapri in modifica', () => {
  // Il bug: riaprendo un articolo su misura il prezzo cambiava senza che
  // l'utente toccasse nulla (accessori al mq moltiplicati due volte,
  // quantità dei gruppi "incluso" riportate al default).
  const casi: { nome: string; selezione: Record<string, number> }[] = [
    { nome: 'accessorio al mq', selezione: { 'a-vetro-trasp': 1 } },
    { nome: 'incluso con quantità modificata', selezione: { 'a-ante': 4 } },
    { nome: 'mix completo', selezione: { 'a-ante': 4, 'a-serratura': 1, 'a-maniglie': 2, 'a-vetro-sat': 1 } },
    { nome: 'nessuna selezione', selezione: {} },
  ]

  for (const caso of casi) {
    it(`mantiene il prezzo invariato — ${caso.nome}`, () => {
      const salvato = calcolaAccessoriSuMisura(GRUPPI, caso.selezione, MQ)

      // riapertura in modifica
      const selRipristinata = selezioneAccessoriDaConfig({ accessori: salvato.accessori, mq: MQ })
      const ricalcolato = calcolaAccessoriSuMisura(GRUPPI, selRipristinata, MQ)

      expect(ricalcolato.totale).toBeCloseTo(salvato.totale, 6)
      expect(ricalcolato.accessori).toHaveLength(salvato.accessori.length)
      for (const acc of salvato.accessori) {
        const dopo = ricalcolato.accessori.find((a) => a.accessorio_id === acc.accessorio_id)!
        expect(dopo.qty).toBeCloseTo(acc.qty, 6)
        expect(dopo.totale).toBeCloseTo(acc.totale, 6)
      }
    })
  }

  it('resta stabile anche dopo tre riaperture consecutive', () => {
    const salvato = calcolaAccessoriSuMisura(GRUPPI, { 'a-ante': 4, 'a-vetro-trasp': 1 }, MQ)
    let corrente = salvato
    for (let i = 0; i < 3; i++) {
      corrente = calcolaAccessoriSuMisura(
        GRUPPI,
        selezioneAccessoriDaConfig({ accessori: corrente.accessori, mq: MQ }),
        MQ
      )
    }
    expect(corrente.totale).toBeCloseTo(salvato.totale, 6)
  })
})

describe('calcolaPrezzoUnitarioSuMisura', () => {
  it('applica spese e utile in percentuale nell ordine corretto', () => {
    const r = calcolaPrezzoUnitarioSuMisura({
      totaleProdotto: 91.884,
      totaleAccessori: 1275.362,
      manoDopera: 150,
      spese: { modo: 'percentuale', valore: 10 },
      utile: { modo: 'percentuale', valore: 40 },
    })
    // spese: 10% su prodotto + accessori
    expect(r.speseCalcolate).toBeCloseTo(136.7246, 4)
    // utile: 40% su prodotto + accessori + manodopera + spese
    expect(r.utileCalcolato).toBeCloseTo(661.58824, 4)
    expect(r.prezzoUnitario).toBeCloseTo(2315.55884, 4)
  })

  it('applica spese e utile fissi', () => {
    const r = calcolaPrezzoUnitarioSuMisura({
      totaleProdotto: 100,
      totaleAccessori: 50,
      manoDopera: 20,
      spese: { modo: 'fisso', valore: 30 },
      utile: { modo: 'fisso', valore: 100 },
    })
    expect(r.speseCalcolate).toBe(30)
    expect(r.utileCalcolato).toBe(100)
    expect(r.prezzoUnitario).toBe(300)
  })
})
