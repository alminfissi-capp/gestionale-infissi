import { describe, expect, it } from 'vitest'
import { commessaFp, type CommessaFp } from '../__fixtures__/commesse'
import { regoleDaElenchi } from './accessori'
import type { ProfiloCalcolo } from './tipi'
import { calcolaVoce, codiceDaDxf, type InputVoce, type ListinoCalcolo } from './voce'
import { fattoreBarreCommessa } from './commessa'

/** Listino con i prezzi che FP PRO ha usato in quella commessa. */
function listinoDa(d: CommessaFp, fattorePeso: number): ListinoCalcolo {
  const prezzi = new Map<string, { euroKg: number | null; euroMl: number | null }>()
  for (const p of d.profili) {
    if (prezzi.has(p.codice)) continue
    prezzi.set(p.codice, p.peso > 0
      ? { euroKg: p.costo / p.peso, euroMl: null }
      : { euroKg: null, euroMl: p.costo / (p.lunghezza * p.quantita / 1000) })
  }
  const kg = new Map<string, number>([
    ...d.anagrafica.profili.map(p => [p.codice, p.kgMl] as const),
    ...d.anagrafica.componenti.map(c => [c.componente, c.kgMl] as const),
  ])
  return {
    profilo: codice => {
      const pr = prezzi.get(codice)
      const componenti = d.anagrafica.componenti.filter(c => c.composto === codice)
      if (!pr && componenti.length === 0) return null
      const scarto = d.anagrafica.scarti.find(s => s.codice === codice)
      return {
        kgMl: kg.get(codice) ?? 0, euroKg: pr?.euroKg ?? null, euroMl: pr?.euroMl ?? null, fattorePeso,
        barra: d.anagrafica.barre.find(b => b.codice === codice)?.lunghezza ?? 6500,
        testa: scarto?.testa ?? 30, coda: scarto?.coda ?? 30,
        componenti: componenti.map(c => ({ codice: c.componente, principale: c.principale, offset: c.offset })),
      }
    },
    accessorio: codice => {
      const a = d.accessori.find(x => x.codice === codice)
      return a ? { prezzo: a.prezzo, unitaVendita: a.unitaVendita } : null
    },
    vetro: codice => {
      const v = d.vetri.find(x => x.codice === codice)
      return v ? { euroMq: v.prezzoMq, minFatt: 0, kgMq: d.anagrafica.vetri.find(x => x.codice === codice)?.kgMq ?? 0 } : null
    },
    pannello: codice => {
      const p = d.pannelli.find(x => x.codice === codice)
      return p ? { euroMq: p.prezzoMq, minFatt: 0 } : null
    },
    sezione: codice => {
      const s = d.anagrafica.sezioni.find(x => x.codice === codice)
      return s ? { vista: s.vista, aletta: s.aletta } : null
    },
  }
}

/** Come in produzione: larghezze predefinite, misure vere dei profili dalle sezioni del listino. */
function inputDa(nome: string, profilo: ProfiloCalcolo, maggVetri: number) {
  const { dati, struttura } = commessaFp(nome)
  const input: InputVoce = {
    albero: struttura.albero, serie: struttura.serie, poligoni: struttura.poligoni,
    L: dati.l, H: dati.h, L0: dati.l, H0: dati.h, quote: {}, kitScelti: {}, vetriScelti: {},
    tempi: struttura.tempi, profilo, maggiorazioni: { vetri: maggVetri, pannelli: 0 },
  }
  const regole = regoleDaElenchi(struttura.serie, dati.anagrafica.righeKit, dati.anagrafica.collegati.map(c => ({ ...c, serie: '' })))
  return { dati, input, regole }
}

const alm2026: ProfiloCalcolo = {
  spese_generali: 0.02, utile: 0.3, provvigione: 0.05, costo_taglio: 30, costo_lavorazione: 30, costo_montaggio: 30,
  costo_assemblaggio: 30, costo_posa: 50, imballo: 0.01, viaggio: 0.01, materiali_vari: 0.01, altro: 0.01,
}
const prodottoFinito: ProfiloCalcolo = {
  ...alm2026, utile: 0.25, provvigione: 0.01, costo_taglio: 35, costo_lavorazione: 35, costo_montaggio: 35,
  costo_assemblaggio: 35, costo_posa: 0, imballo: 0, viaggio: 0, materiali_vari: 0, altro: 0.01,
}
const gruppo = (r: ReturnType<typeof calcolaVoce>, g: string) => r.righe.filter(x => x.gruppo === g).reduce((s, x) => s + x.costo, 0)
const scarto = (v: number, atteso: number) => Math.abs(v - atteso) / atteso

describe('170-26G scorrevole: confronto con FP PRO', () => {
  const { dati, input, regole } = inputDa('170-26G', alm2026, 0.03)
  const listino = listinoDa(dati, 1.03)
  const r = calcolaVoce(input, listino, regole)
  const fp = dati.totali

  it('materiali entro il 5%', () => {
    expect(scarto(r.materiali, fp.costoProfili + fp.costoAccessori + fp.costoGuarnizioni + fp.costoVetri)).toBeLessThan(0.05)
  })
  it('profili a barre ottimizzate entro il 5%', () => expect(scarto(gruppo(r, 'profili'), fp.costoProfili)).toBeLessThan(0.05))
  it('vetri con la maggiorazione del profilo di calcolo entro il 5%', () => expect(scarto(gruppo(r, 'vetri'), fp.costoVetri)).toBeLessThan(0.05))
  it('ore della struttura e formula: prezzo entro il 5%', () => expect(scarto(r.prezzo.imponibile, fp.imponibile)).toBeLessThan(0.05))
  it('nessun avviso di prezzo mancante', () => expect(r.avvisi).toEqual([]))
})

describe('172-26G porta: confronto con FP PRO', () => {
  const { dati, input, regole } = inputDa('172-26G', prodottoFinito, 0.02)
  const r = calcolaVoce({ ...input, correzioni: { extra: [{ descrizione: 'Maniglione e lamiera', importo: 230 }] } }, listinoDa(dati, 1), regole)
  const fp = dati.totali

  it('materiali entro il 5%', () => {
    expect(scarto(r.materiali, fp.costoProfili + fp.costoAccessori + fp.costoGuarnizioni + fp.costoVetri + fp.costoPannelli)).toBeLessThan(0.05)
  })
  it('prezzo entro il 5%', () => expect(scarto(r.prezzo.imponibile, fp.imponibile)).toBeLessThan(0.05))
  it('riepilogo (DEBUG_FP=1)', () => {
    if (!process.env.DEBUG_FP) return
    for (const [nome, v] of [['170-26G', calcolaVoce(inputDa('170-26G', alm2026, 0.03).input, listinoDa(commessaFp('170-26G').dati, 1.03), inputDa('170-26G', alm2026, 0.03).regole)], ['172-26G', r]] as const) {
      const t = commessaFp(nome).dati.totali
      console.log(nome, 'materiali', v.materiali.toFixed(2), 'FP', (t.costoProfili + t.costoAccessori + t.costoGuarnizioni + t.costoVetri + t.costoPannelli).toFixed(2),
        'imponibile', v.prezzo.imponibile.toFixed(2), 'FP', t.imponibile, 'avvisi', v.avvisi.length)
    }
  })
})

describe('casi difficili', () => {
  const { dati, input, regole } = inputDa('170-26G', alm2026, 0.03)
  const listino = listinoDa(dati, 1.03)

  it('vetro senza prezzo: voce calcolata, avviso', () => {
    const r = calcolaVoce(input, { ...listino, vetro: () => null }, regole)
    expect(r.avvisi.some(a => a.includes('Vetro'))).toBe(true)
    expect(r.prezzo.imponibile).toBeGreaterThan(0)
  })
  it('vetro, accessorio o pannello con prezzo zero: avviso (non un costo zero silenzioso)', () => {
    const r = calcolaVoce(input, {
      ...listino,
      vetro: c => ({ ...listino.vetro(c)!, euroMq: 0 }),
      accessorio: () => ({ prezzo: 0, unitaVendita: 1 }),
    }, regole)
    expect(r.avvisi.some(a => a.includes('Vetro') && a.includes('senza prezzo'))).toBe(true)
    expect(r.avvisi.some(a => a.includes('Accessorio') && a.includes('senza prezzo'))).toBe(true)
  })
  it('correzione di riga: cambia solo questa voce', () => {
    const base = calcolaVoce(input, listino, regole)
    const corretta = calcolaVoce({ ...input, correzioni: { percentuali: { utile: 0.25 }, extra: [{ descrizione: 'x', importo: 80 }] } }, listino, regole)
    expect(corretta.prezzo.imponibile).not.toBeCloseTo(base.prezzo.imponibile, 0)
    expect(corretta.materiali).toBeCloseTo(base.materiali, 6)
  })
  it('misure piu\' grandi: piu\' materiale', () => {
    const base = calcolaVoce(input, listino, regole)
    const grande = calcolaVoce({ ...input, L: 2600, H: 2600 }, listino, regole)
    expect(grande.materiali).toBeGreaterThan(base.materiali)
  })
})

describe('telaio scelto per lato in cantiere', () => {
  const { dati, input, regole } = inputDa('170-26G', alm2026, 0.03)
  it('il profilo del lato cambia: via il telaio inferiore TT8002D (e i suoi TAC809/SX9901)', () => {
    const listino = listinoDa(dati, 1.03)
    expect(calcolaVoce(input, listino, regole).righe.some(r => r.codice === 'TAC809')).toBe(true)
    const r = calcolaVoce({ ...input, telai: { basso: 'TT8011' } }, listino, regole)
    expect(r.righe.some(x => x.codice === 'TAC809' || x.codice === 'SX9901')).toBe(false)
  })
})

describe('codiceDaDxf', () => {
  it('nome del file senza cartella ed estensione', () => {
    expect(codiceDaDxf('AL_SLIDE\\TT8002B.DXF')).toBe('TT8002B')
    expect(codiceDaDxf('X.dxf')).toBe('X')
  })
})

describe('senza le misure dei DXF (sezioni mancanti): larghezze predefinite', () => {
  it.each([
    ['170-26G', alm2026, 0.03, 1.03],
    ['172-26G', prodottoFinito, 0.02, 1],
  ] as const)('%s: materiali entro il 10%', (nome, profilo, maggVetri, fattorePeso) => {
    const { dati, input, regole } = inputDa(nome, profilo, maggVetri)
    const r = calcolaVoce(input, { ...listinoDa(dati, fattorePeso), sezione: () => null }, regole)
    const fp = dati.totali
    const atteso = fp.costoProfili + fp.costoAccessori + fp.costoGuarnizioni + fp.costoVetri + fp.costoPannelli
    if (process.env.DEBUG_FP) console.log(nome, r.materiali.toFixed(2), atteso.toFixed(2))
    expect(scarto(r.materiali, atteso)).toBeLessThan(0.1)
  })
})

describe('barre sulla commessa', () => {
  const { dati, input, regole } = inputDa('170-26G', alm2026, 0.03)
  const listino = listinoDa(dati, 1.03)
  const sola = calcolaVoce(input, listino, regole)

  it('una voce da sola: stesso costo dei profili delle barre sulla voce', () => {
    const { fattore } = fattoreBarreCommessa([{ quantita: 1, tagli: sola.tagli ?? [] }])
    const r = calcolaVoce({ ...input, fattoreBarre: fattore }, listino, regole)
    expect(gruppo(r, 'profili')).toBeCloseTo(gruppo(sola, 'profili'), 6)
  })
  it('stessa voce in quantita\' 2: profili per pezzo mai piu\' cari che da sola', () => {
    const { fattore } = fattoreBarreCommessa([{ quantita: 2, tagli: sola.tagli ?? [] }])
    const r = calcolaVoce({ ...input, fattoreBarre: fattore }, listino, regole)
    expect(gruppo(r, 'profili')).toBeLessThanOrEqual(gruppo(sola, 'profili') + 1e-9)
  })
})
