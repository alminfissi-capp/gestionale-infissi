import { describe, expect, it } from 'vitest'
import type { PuntoForma } from '@/types/rilievo-grafico'
import { applicaQuota, formaValida, impostaArco, quoteForma } from './quote-forma'
import { formaInPunti } from './forma'
import { leggiMisura } from './misura'

const R: PuntoForma[] = [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 1400 }, { x: 0, h: 1400 }]

/** Valori delle quote per id */
const valori = (p: PuntoForma[] | null) => {
  if (!p) throw new Error('forma non valida')
  return Object.fromEntries(quoteForma(p).map(q => [q.id, q.valore]))
}
const passo = (p: PuntoForma[] | null, id: string, v: number) => {
  if (!p) throw new Error('forma non valida')
  return applicaQuota(p, id, v)
}

describe('quote del quadrilatero', () => {
  it('rettangolo: una quota per lato e niente scarti', () => {
    expect(valori(R)).toEqual({ L0: 1200, L1: 1400, L2: 1200, L3: 1400 })
  })

  it('testa piu\' corta: si centra con 100 e 100', () => {
    const p = applicaQuota(R, 'L2', 1000)
    expect(p).toEqual([{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1100, h: 1400 }, { x: 100, h: 1400 }])
    expect(valori(p)).toMatchObject({ L0: 1200, L2: 1000, S2a: 100, S2b: 100 })
  })

  it('scarto a 0: lato a squadra, tutta la differenza dall\'altra parte', () => {
    const p = passo(applicaQuota(R, 'L2', 1000), 'S2a', 0)
    expect(valori(p)).toMatchObject({ L0: 1200, L2: 1000, S2a: 0, S2b: 200 })
    expect(p).toContainEqual({ x: 0, h: 1400 })
  })

  it('altezza destra piu\' bassa: centrata, 100 sopra e 100 sotto; poi 0 sotto', () => {
    const p = applicaQuota(R, 'L1', 1200)
    expect(valori(p)).toMatchObject({ L1: 1200, L3: 1400, S1a: 100, S1b: 100 })
    const q = passo(p, 'S1a', 0)
    expect(valori(q)).toMatchObject({ L1: 1200, S1a: 0, S1b: 200 })
    expect(q).toContainEqual({ x: 1200, h: 0 })
  })

  it('misure impossibili non si applicano', () => {
    expect(applicaQuota(R, 'L2', 0)).toBeNull()
    expect(applicaQuota(R, 'L2', -5)).toBeNull()
    expect(applicaQuota(R, 'L2', Number.NaN)).toBeNull()
    expect(passo(applicaQuota(R, 'L2', 1000), 'S2a', -1)).toBeNull()
    expect(applicaQuota(R, 'X9', 100)).toBeNull()
  })

  it('una forma che si incrocia non e\' valida', () => {
    expect(formaValida(R)).toBe(true)
    expect(formaValida([{ x: 0, h: 0 }, { x: 1200, h: 1400 }, { x: 1200, h: 0 }, { x: 0, h: 1400 }])).toBe(false)
  })
})

describe('forme con piu\' di 4 lati', () => {
  const casetta = formaInPunti({ tipo: 'modello', modello: 'MODEL-02', misure: { L: 1500, H1: 1200, H2: 1800 } })
  const aSquadra = (p: PuntoForma[]) => p.every((a, i) => { const b = p[(i + 1) % p.length]; return Math.abs(a.x - b.x) < 0.5 || Math.abs(a.h - b.h) < 0.5 })
  const colmo = (p: PuntoForma[]) => p.reduce((m, q) => (q.h > m.h ? q : m))

  it('casetta: totali e altezza delle gronde', () => {
    expect(casetta).toHaveLength(5)
    expect(valori(casetta)).toMatchObject({ L0: 1500, TH: 1800, A1200: 1200 })
  })

  it('casetta: altezza totale = colmo, i muri restano verticali e alti 1200', () => {
    const p = passo(casetta, 'TH', 2000)!
    expect(colmo(p)).toMatchObject({ x: 750, h: 2000 })
    expect(p.filter(q => q.h === 1200)).toHaveLength(2)
    expect(p.filter(q => q.x === 0)).toHaveLength(2)
  })

  it('casetta: gronde a 1000, colmo fermo', () => {
    const p = passo(casetta, 'A1200', 1000)!
    expect(colmo(p)).toMatchObject({ x: 750, h: 1800 })
    expect(p.filter(q => q.h === 1000)).toHaveLength(2)
  })

  it('casetta: tetto sinistro largo 900 sposta il colmo, il muro resta verticale', () => {
    const sinistro = quoteForma(casetta).find(q => q.tipo === 'lato' && q.direzione === 'x' && colmoDelLato(casetta, q.lato!) && casetta[q.lato!].x + casetta[(q.lato! + 1) % 5].x < 1500)!
    const p = passo(casetta, sinistro.id, 900)!
    expect(colmo(p)).toMatchObject({ x: 900, h: 1800 })
    expect(p).toContainEqual({ x: 0, h: 1200 })
    expect(p).toContainEqual({ x: 0, h: 0 })
  })

  it('casetta: niente scarti sui lati vicini ai muri', () => {
    expect(quoteForma(casetta).filter(q => q.tipo === 'scarto')).toEqual([])
  })

  it('"L": cambiando l\'altezza dello scalino tutti i lati restano a squadra', () => {
    const elle = formaInPunti({ tipo: 'modello', modello: 'MODEL-06', misure: {} })
    expect(aSquadra(elle)).toBe(true)
    const a = quoteForma(elle).find(q => q.tipo === 'angolo')!
    expect(a).toBeDefined()
    const p = passo(elle, a.id, a.valore - 100)!
    expect(aSquadra(p)).toBe(true)
    expect(valori(p)[`A${a.valore - 100}`]).toBe(a.valore - 100)
  })
})

/** Il lato tocca il colmo (il punto piu' alto) */
function colmoDelLato(p: PuntoForma[], i: number) {
  const max = Math.max(...p.map(q => q.h))
  return p[i].h === max || p[(i + 1) % p.length].h === max
}

describe('archi', () => {
  it('freccia 150 su 1200: altezza totale 1550 e raggio 1275', () => {
    const p = impostaArco(R, 2, 150)
    expect(valori(p)).toMatchObject({ L2: 1200, F2: 150, AT2: 1550, R2: 1275 })
    expect(quoteForma(p!).find(q => q.id === 'R2')?.modificabile).toBe(false)
  })

  it('scrivendo l\'altezza totale si ricalcola la freccia', () => {
    const p = passo(impostaArco(R, 2, 150), 'AT2', 1600)
    expect(valori(p)).toMatchObject({ F2: 200, AT2: 1600 })
  })

  it('cambiando un muro dopo l\'arco la freccia resta e i lati non si rinumerano', () => {
    const p = passo(passo(impostaArco(R, 2, 150), 'AT2', 1600), 'L1', 1300)
    expect(valori(p)).toMatchObject({ L0: 1200, L1: 1300, L3: 1400, F2: 200 })
  })

  it('Dritto toglie l\'arco', () => {
    const p = impostaArco(impostaArco(R, 2, 150)!, 2, 0)
    expect(p).toEqual(R)
    expect(Object.keys(valori(p))).toEqual(['L0', 'L1', 'L2', 'L3'])
  })

  it('il raggio non si scrive', () => {
    expect(passo(impostaArco(R, 2, 150), 'R2', 500)).toBeNull()
  })
})

describe('misura scritta nella casellina', () => {
  it('virgola e spazi vanno bene, testo vuoto o lettere no', () => {
    expect(leggiMisura('1200,5')).toBe(1200.5)
    expect(leggiMisura(' 1200 ')).toBe(1200)
    expect(leggiMisura('-150')).toBe(-150)
    expect(leggiMisura('')).toBeNull()
    expect(leggiMisura('abc')).toBeNull()
  })
})

describe('quote totali senza doppioni', () => {
  it('casetta: la base copre tutta la larghezza, quindi niente larghezza totale; l\'altezza totale c\'e\'', () => {
    const casetta = formaInPunti({ tipo: 'modello', modello: 'MODEL-02', misure: { L: 1500, H1: 1200, H2: 1800 } })
    const ids = quoteForma(casetta).map(q => q.id)
    expect(ids).not.toContain('TL')
    expect(ids).toContain('TH')
  })
})
