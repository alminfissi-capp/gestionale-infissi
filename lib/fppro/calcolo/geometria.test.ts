import { describe, expect, it } from 'vitest'
import { commessaFp } from '../__fixtures__/commesse'
import { LARGHEZZE_PREDEFINITE, larghezzeAnte, larghezzeDaPoligoni, pezziECampi } from './geometria'
import type { NodoStruttura } from '../strutture-xml'

const somma = (pezzi: { dxf: string; lunghezza: number }[], parte: string) =>
  pezzi.filter(p => p.dxf.includes(parte)).reduce((s, p) => s + p.lunghezza, 0)

describe('170-26G scorrevole 2 ante 1900 x 2350', () => {
  const { struttura } = commessaFp('170-26G')
  const { pezzi, campi } = pezziECampi(struttura.albero, { L: 1900, H: 2350, L0: 1900, H0: 2350, quote: {} }, { ...LARGHEZZE_PREDEFINITE, telaio: 46.7 })

  it('telaio: 2 lati da 2350 e 2 da 1900', () => {
    expect(pezzi.filter(p => p.tipo === 8050).map(p => p.lunghezza).sort((a, b) => a - b)).toEqual([1900, 1900, 2350, 2350])
  })
  it('ante: 8 pezzi, somma entro il 5% di FP PRO (12,88 m)', () => {
    expect(pezzi.filter(p => p.tipo === 8100)).toHaveLength(8)
    expect(Math.abs(somma(pezzi, 'TT8011') - 12880) / 12880).toBeLessThan(0.05)
  })
  it('2 vetri vicini a 814 x 2142 (entro 5 cm)', () => {
    expect(campi).toHaveLength(2)
    for (const c of campi) {
      expect(Math.abs(c.l - 814)).toBeLessThan(50)
      expect(Math.abs(c.h - 2142)).toBeLessThan(50)
    }
  })
})

describe('172-26G porta 2 ante 1200 x 2200 con zoccoli, fasce e pannelli', () => {
  const { struttura } = commessaFp('172-26G')
  const { pezzi, campi } = pezziECampi(struttura.albero, { L: 1200, H: 2200, L0: 1200, H0: 2200, quote: {} }, { ...LARGHEZZE_PREDEFINITE, telaio: 28, anta: 51.5 })

  it('telaio a 3 lati (sopra la soglia)', () => {
    expect(pezzi.filter(p => p.tipo === 8050)).toHaveLength(3)
  })
  it('2 vetri e 2 pannelli', () => {
    expect(campi.filter(c => c.tipo === 'vetro')).toHaveLength(2)
    expect(campi.filter(c => c.tipo === 'pannello')).toHaveLength(2)
  })
  it('anta principale da 850 (SashDim): vetro e pannello larghi circa 733 come in FP PRO', () => {
    const larghi = campi.filter(c => c.l > 400)
    expect(larghi).toHaveLength(2)
    for (const c of larghi) expect(Math.abs(c.l - 733)).toBeLessThan(60)
  })
  it('la fascia divide il vetro sopra (1084) dal pannello sotto (726)', () => {
    const vetro = campi.find(c => c.tipo === 'vetro' && c.l > 400)!
    const pannello = campi.find(c => c.tipo === 'pannello' && c.l > 400)!
    expect(Math.abs(vetro.h - 1084) / 1084).toBeLessThan(0.1)
    expect(Math.abs(pannello.h - 726) / 726).toBeLessThan(0.15)
  })
})

describe('misure diverse dalla nominale', () => {
  it('il telaio segue le misure del rilievo', () => {
    const { struttura } = commessaFp('170-26G')
    const { pezzi } = pezziECampi(struttura.albero, { L: 2400, H: 2200, L0: 1900, H0: 2350, quote: {} }, LARGHEZZE_PREDEFINITE)
    expect(pezzi.filter(p => p.tipo === 8050).map(p => p.lunghezza).sort((a, b) => a - b)).toEqual([2200, 2200, 2400, 2400])
  })
})

describe('casi limite', () => {
  const nodo = (n: Partial<NodoStruttura>): NodoStruttura => ({
    tipo: 0, codice: 1, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], accessori: [], kit: [], figli: [], ...n,
  })
  it('nodo sconosciuto con un pezzo: lungo quanto la zona', () => {
    const albero = [nodo({ tipo: 9999, pezzi: [{ tipo: 9999, dxf: 'X\\P1.DXF', serie: 'X', indice: 0 }] })]
    expect(pezziECampi(albero, { L: 1000, H: 800, L0: 1000, H0: 800, quote: {} }, LARGHEZZE_PREDEFINITE).pezzi)
      .toEqual([{ dxf: 'X\\P1.DXF', tipo: 9999, lunghezza: 1000 }])
  })
  it('misure troppo piccole: nessun pezzo negativo', () => {
    const albero = [nodo({ tipo: 8600, pezzi: [1, 2, 3, 4].map(() => ({ tipo: 8050, dxf: 'X\\T.DXF', serie: 'X', indice: 0 })),
      figli: [nodo({ tipo: 8610, codice: 2, pezzi: [{ tipo: 8090, dxf: 'X\\A.DXF', serie: 'X', indice: 0 }] })] })]
    const r = pezziECampi(albero, { L: 60, H: 60, L0: 1000, H0: 1000, quote: {} }, LARGHEZZE_PREDEFINITE)
    expect(r.pezzi.every(p => p.lunghezza > 0)).toBe(true)
  })
})

describe('larghezzeDaPoligoni', () => {
  it('spessore del telaio dal pezzo verticale sul bordo sinistro', () => {
    expect(larghezzeDaPoligoni([[0, 0, 46.7, 0, 46.7, 2350, 0, 2350]]).telaio).toBe(46.7)
  })
  it('senza poligoni: valori predefiniti', () => {
    expect(larghezzeDaPoligoni([])).toEqual(LARGHEZZE_PREDEFINITE)
  })
})

describe('larghezzeAnte', () => {
  it('anta fissa da 850, l\'altra prende il resto', () => {
    expect(larghezzeAnte(1144, 2, [{ SashDim: '850.000000' }, { SashDim: '0.000000' }])).toEqual([850, 294])
  })
  it('senza misure: parti uguali', () => expect(larghezzeAnte(1800, 2, [])).toEqual([900, 900]))
  it('fisse piu\' larghe della zona: parti uguali', () => {
    expect(larghezzeAnte(800, 2, [{ SashDim: '850' }, { SashDim: '0' }])).toEqual([400, 400])
  })
})
