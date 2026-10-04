import { describe, it, expect } from 'vitest'
import {
  totaliPerCategoria, costoManodopera, riepilogo, rimanente, propostaCronometro,
  categoriaProposta, confrontoFattura, stimaDaPreventivo, totaliStima, importoRiga,
} from '@/lib/contabilita-commessa'

const costo = (categoria: Parameters<typeof totaliPerCategoria>[0][number]['categoria'], importo: number) => ({ categoria, importo })

describe('totaliPerCategoria', () => {
  it('somma per categoria e in totale, con le note di credito in negativo', () => {
    const t = totaliPerCategoria([costo('barre', 100), costo('barre', 50.5), costo('accessori', 20), costo('accessori', -5)])
    expect(t.perCategoria.barre).toBe(150.5)
    expect(t.perCategoria.accessori).toBe(15)
    expect(t.perCategoria.noleggi).toBe(0)
    expect(t.totale).toBe(165.5)
  })
})

describe('costoManodopera', () => {
  it('persone x giorni x tariffa per voce', () => {
    const m = costoManodopera(
      { posa: { persone: 2, giorni: 3 }, produzione: { persone: 1, giorni: 2.5 }, altro: { persone: null, giorni: null } },
      70,
    )
    expect(m).toEqual({ posa: 420, produzione: 175, altro: 0, totale: 595 })
  })
})

describe('riepilogo', () => {
  it('rifa i conti del foglio ACUVA 09-2026', () => {
    // Fatture del foglio Excel: Edilsider 1F/4205, 1F/4887, 1F/4701; Profilsider 2F/3490, 2F/3621, 2F/3327
    const materiali = totaliPerCategoria([
      costo('barre', 1249.96), costo('accessori', 142.38), costo('spese_accessorie', 17),
      costo('barre', 75), costo('accessori', 4.94),
      costo('accessori', 21),
      costo('accessori', 6.56),
      costo('barre', 7142.33), costo('accessori', 3161.57), costo('spese_accessorie', 17.14),
      costo('barre', 38.4),
    ])
    expect(materiali.perCategoria.barre).toBe(8505.69)
    expect(materiali.perCategoria.accessori).toBe(3336.45)
    expect(materiali.totale).toBe(11876.28)
    const r = riepilogo({ totaleLavoro: 37720, materiali: materiali.totale, manodopera: 0, percFissi: 5, imprevisti: 0 })
    expect(r.costiFissi).toBe(593.81)
    expect(r.totaleCosti).toBe(12470.09)
    expect(r.utile).toBe(25249.91)
    expect(r.ricarico).toBeCloseTo(202.48, 2) // utile / costi, come la cella D4 dell'Excel
    expect(r.margine).toBeCloseTo(66.94, 2) // utile / totale lavoro
  })
  it('costi fissi su materiali + manodopera', () => {
    const r = riepilogo({ totaleLavoro: 1000, materiali: 300, manodopera: 100, percFissi: 10, imprevisti: 25 })
    expect(r.costiFissi).toBe(40)
    expect(r.totaleCosti).toBe(440)
    expect(r.utile).toBe(560)
    expect(r.imprevisti).toBe(25)
  })
  it('percentuali nulle senza costi o senza totale lavoro', () => {
    const r = riepilogo({ totaleLavoro: 0, materiali: 0, manodopera: 0, percFissi: 5, imprevisti: 0 })
    expect(r.ricarico).toBeNull()
    expect(r.margine).toBeNull()
  })
})

describe('rimanente', () => {
  it('quantita\' in fattura meno quanto usato altrove, mai sotto zero', () => {
    expect(rimanente(10, 6)).toBe(4)
    expect(rimanente(10, 12)).toBe(0)
    expect(rimanente(2.5, 1.25)).toBe(1.25)
  })
})

describe('propostaCronometro', () => {
  it('ore / 8 per voce, al quarto di giornata', () => {
    const p = propostaCronometro([
      { tipo: 'posa', secondi: 22 * 3600 },
      { tipo: 'lavorazione', secondi: 8 * 3600 },
      { tipo: 'lavorazione', secondi: 5 * 3600 },
      { tipo: 'carico', secondi: 1 * 3600 },
      { tipo: 'ricez_alluminio', secondi: 2 * 3600 },
      { tipo: 'rilievo_misure', secondi: 3 * 3600 },
      { tipo: 'appuntamento', secondi: 10 * 3600 },
    ])
    expect(p).toEqual({ posa: 2.75, produzione: 1.75, altro: 0.75 })
  })
  it('nessun tempo registrato → zero', () => {
    expect(propostaCronometro([])).toEqual({ posa: 0, produzione: 0, altro: 0 })
  })
})

describe('categoriaProposta', () => {
  it('l\'ultima categoria usata per lo stesso codice', () => {
    const storico = [
      { codice: 'ABC', categoria: 'accessori' as const, quando: '2026-09-01' },
      { codice: 'ABC', categoria: 'barre' as const, quando: '2026-09-20' },
      { codice: 'XYZ', categoria: 'riempimenti' as const, quando: '2026-09-25' },
    ]
    expect(categoriaProposta('ABC', storico)).toBe('barre')
    expect(categoriaProposta('abc ', storico)).toBe('barre')
  })
  it('codice nuovo o assente → nessuna proposta', () => {
    expect(categoriaProposta('NUOVO', [])).toBeNull()
    expect(categoriaProposta(null, [{ codice: 'A', categoria: 'barre' as const, quando: '2026-01-01' }])).toBeNull()
  })
})

describe('confrontoFattura', () => {
  const salvato = { quantita_fattura: 10, prezzo_unitario: 12.5 }
  it('riga uguale → nessun avviso', () => {
    expect(confrontoFattura(salvato, { qty: 10, net_price: 12.5 }, 'fattura')).toBeNull()
  })
  it('prezzo, quantita\' o riga sparita', () => {
    expect(confrontoFattura(salvato, { qty: 10, net_price: 13 }, 'fattura')).toBe('prezzo cambiato su FiC')
    expect(confrontoFattura(salvato, { qty: 8, net_price: 12.5 }, 'fattura')).toBe('quantità cambiata su FiC')
    expect(confrontoFattura(salvato, null, 'fattura')).toBe('riga non più presente su FiC')
  })
  it('nota di credito: il prezzo salvato e\' negativo', () => {
    expect(confrontoFattura({ quantita_fattura: 1, prezzo_unitario: -20 }, { qty: 1, net_price: 20 }, 'nota_credito')).toBeNull()
  })
})

describe('importoRiga', () => {
  it('quantita\' x prezzo al centesimo, negativo per le note di credito', () => {
    expect(importoRiga(3, 12.345, 'fattura')).toBe(37.04)
    expect(importoRiga(2, 20, 'nota_credito')).toBe(-40)
  })
})

describe('stima', () => {
  it('dal preventivo: materiali (+ spese varie) non divisi, posa in manodopera, trasporto', () => {
    expect(stimaDaPreventivo({ materiali: 9000, posa: 2000, spese: 150, trasporto: 350 })).toEqual({
      materiali_preventivo: 9150, manodopera: 2000, trasporti: 350,
    })
  })
  it('totali della stima', () => {
    expect(totaliStima({ materiali_preventivo: 9000, barre: 500, trasporti: 350, manodopera: 2000 })).toEqual({
      materiali: 9850, manodopera: 2000,
    })
    expect(totaliStima(null)).toEqual({ materiali: 0, manodopera: 0 })
  })
})
