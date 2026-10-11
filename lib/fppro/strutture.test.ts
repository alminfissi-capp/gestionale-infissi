import { describe, expect, it } from 'vitest'
import type { AccessorioStruttura, NodoStruttura } from './strutture-xml'
import { accessoriStruttura, etichettaTipo, regolaQuantita, riassuntoPezzi, vistaPoligoni } from './strutture'

const nodo = (p: Partial<NodoStruttura>): NodoStruttura => ({
  tipo: -1, codice: 0, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [],
  pezzi: [], accessori: [], kit: [], figli: [], ...p,
})
const acc = (p: Partial<AccessorioStruttura>): AccessorioStruttura => ({
  codice: 'A', descrizione: '', serie: '', tipo: 1, quantita: 1, dimRif: 0, dimCalcolo: 0,
  min: null, max: null, passo: null, formula: null, opzionale: false, confermato: true, ...p,
})

describe('etichettaTipo', () => {
  it('nomi italiani dei codici di FP PRO', () => {
    expect(etichettaTipo(8050)).toBe('Telaio')
    expect(etichettaTipo(8070)).toBe('Traverso')
    expect(etichettaTipo(8510)).toBe('Vetro')
    expect(etichettaTipo(9999)).toBe('Tipo 9999')
  })
})

describe('riassuntoPezzi', () => {
  it('conta i pezzi uguali in tutto l\'albero, in ordine di tipo', () => {
    const albero = [nodo({
      tipo: 8600,
      pezzi: [8050, 8050, 8050, 8050].map(t => ({ tipo: t, dxf: 'EKOS_66TH\\ES24500170.DXF', serie: 'EKOS_66TH', indice: 0 })),
      figli: [nodo({
        tipo: 8610,
        pezzi: [{ tipo: 8090, dxf: 'EKOS_66TH\\ES24500319.DXF', serie: 'EKOS_66TH', indice: 0 }],
        figli: [nodo({ tipo: 8510, pezzi: [{ tipo: 8510, dxf: 'GLASSES\\4_15_4.DXF', serie: 'GLASSES', indice: 0 }] })],
      })],
    })]
    expect(riassuntoPezzi(albero)).toEqual([
      { ruolo: 'Telaio', profilo: 'ES24500170', serie: 'EKOS_66TH', quantita: 4 },
      { ruolo: 'Anta battente', profilo: 'ES24500319', serie: 'EKOS_66TH', quantita: 1 },
      { ruolo: 'Vetro', profilo: '4_15_4', serie: 'GLASSES', quantita: 1 },
    ])
  })
})

describe('regolaQuantita', () => {
  it('fissa', () => expect(regolaQuantita(acc({ quantita: 4 }))).toBe('4 pz'))
  it('a metro', () => expect(regolaQuantita(acc({ tipo: 2, quantita: 2 }))).toBe('2 × perimetro (m)'))
  it('a fascia di misura', () =>
    expect(regolaQuantita(acc({ quantita: 6, min: 2500.1, max: 5000 }))).toBe('6 pz se 2500,1–5000 mm'))
  it('a passo', () => expect(regolaQuantita(acc({ quantita: 2, passo: 500 }))).toBe('2 pz, 1 ogni 500 mm'))
  it('a formula', () => expect(regolaQuantita(acc({ quantita: 1, formula: 'w/2' }))).toBe('1 pz · formula w/2'))
})

describe('accessoriStruttura', () => {
  it('separa accessori sciolti e kit di tutto l\'albero', () => {
    const albero = [nodo({
      accessori: [acc({ codice: 'X1' })],
      figli: [nodo({ accessori: [acc({ codice: 'X2' })], kit: [{ codice: 'K', descrizione: '', serie: '', opzionale: true, confermato: false, accessori: [] }] })],
    })]
    const r = accessoriStruttura(albero)
    expect(r.accessori.map(a => a.codice)).toEqual(['X1', 'X2'])
    expect(r.kit.map(k => k.codice)).toEqual(['K'])
  })
})

describe('vistaPoligoni', () => {
  it('nessun poligono: niente disegno', () => expect(vistaPoligoni([])).toBeNull())
  it('capovolge la y (in FP PRO cresce verso l\'alto) e aggiunge un margine', () => {
    const v = vistaPoligoni([[0, 0, 0, 100, 50, 100]])
    expect(v).toEqual({ viewBox: '-5 -5 60 110', punti: ['0,100 0,0 50,0'] })
  })
})
