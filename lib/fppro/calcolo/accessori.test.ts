import { describe, expect, it } from 'vitest'
import { commessaFp } from '../__fixtures__/commesse'
import { accessoriVoce, regoleDaElenchi, valutaFormula } from './accessori'
import { LARGHEZZE_PREDEFINITE, pezziECampi } from './geometria'

function accessoriDi(nome: string, telaio: number, peso: number) {
  const { dati, struttura } = commessaFp(nome)
  const { zone } = pezziECampi(struttura.albero, { L: dati.l, H: dati.h, L0: dati.l, H0: dati.h, quote: {} }, { ...LARGHEZZE_PREDEFINITE, telaio })
  const regole = regoleDaElenchi(struttura.serie, dati.anagrafica.righeKit, dati.anagrafica.collegati.map(c => ({ ...c, serie: '' })))
  const acc = accessoriVoce(struttura.albero, {}, zone, peso, regole)
  const q = (codice: string) => acc.filter(a => a.codice === codice).reduce((t, a) => t + a.quantita, 0)
  return { acc, q, dati }
}
const entro = (valore: number, atteso: number, tolleranza: number) =>
  expect(Math.abs(valore - atteso) / atteso).toBeLessThan(tolleranza)

describe('accessori di 170-26G come FP PRO', () => {
  const { q } = accessoriDi('170-26G', 46.7, 170)
  it('a fasce su H (1500-2500)', () => expect(q('ACP 8012')).toBe(4))
  it('fascia su formula w/2 (w = peso): fuori dai 90-200 kg escluso, dentro 0-200 incluso', () => {
    expect(q('ACP 1608')).toBe(0)
    expect(q('ACP 8003')).toBe(1)
  })
  it('opzioni: confermate si\', non confermate no', () => {
    expect(q('ACP 50552')).toBe(2)
    expect(q('ACP 80201')).toBe(0)
    expect(q('RB601')).toBe(0)
  })
  it('a passo: su 2H+L (13) e su formula L/2 (6), come FP PRO', () => {
    expect(q('RB304')).toBe(13)
    expect(q('ACP 8028')).toBe(6)
  })
  it('a metro con maggiorazione: spazzolino e guarnizioni vetro entro il 10%', () => {
    entro(q('AGP 8005'), 23.033, 0.1)
    entro(q('AGP 4014'), 12.793, 0.1)
  })
})

describe('accessori di 172-26G come FP PRO', () => {
  const { acc, q } = accessoriDi('172-26G', 28, 150)
  it('righe del kit valide solo per altre serie: escluse', () => {
    expect(q('AGP 50172')).toBe(0)
    expect(q('AGP 4501M')).toBe(0)
    expect(q('0Q31112012')).toBe(0)
  })
  it('righe valide per la serie AL_72UP o per tutte: incluse', () => {
    expect(q('AGP 72185')).toBe(4)
    expect(q('0Q31124012')).toBe(1)
    expect(q('ACP 50439')).toBe(1)
    expect(q('ACP 5152')).toBe(2)
    entro(q('AGP 72172'), 9.577, 0.1)
  })
  it('kit cerniere gia\' esploso nella commessa: non si conta due volte', () => {
    expect(q('ACP 9918N')).toBe(6)
    expect(q('CERN_2A_SRM9918N')).toBe(0)
  })
  it('a passo sul telaio a 3 lati: 11', () => expect(q('RB304')).toBe(11))
  it('nessuna quantita\' negativa o non numerica', () => {
    expect(acc.every(a => Number.isFinite(a.quantita) && a.quantita > 0)).toBe(true)
  })
})

describe('accessori collegati', () => {
  it('contenitore non esploso nella struttura: si sostituisce con i suoi accessori', () => {
    const albero = [{
      tipo: 8600, codice: 1, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], figli: [], kit: [],
      accessori: [{ codice: 'CERN', descrizione: '', serie: 'K', tipo: 1, quantita: 1, dimRif: 0, dimCalcolo: 0, min: null, max: null,
        passo: null, formula: null, dimDistribuzione: 0, formulaDistribuzione: null, opzionale: false, confermato: true }],
    }]
    const regole = regoleDaElenchi([], [], [{ principale: 'CERN', collegato: 'ACP 9918N', quantita: 6, serie: 'S' }])
    expect(accessoriVoce(albero, {}, { 1: { L: 1000, H: 2000 } }, 50, regole).map(a => [a.codice, a.quantita]))
      .toEqual([['ACP 9918N', 6]])
  })
})

describe('valutaFormula', () => {
  const d = { L: 1900, H: 2350, w: 170, h: 2350 }
  it('formule semplici di FP PRO', () => {
    expect(valutaFormula('w/2', d)).toBe(85)
    expect(valutaFormula('L/2', d)).toBe(950)
    expect(valutaFormula('2*H+L-100', d)).toBe(6500)
    expect(valutaFormula('(L+H)*2', d)).toBe(8500)
  })
  it('formula non interpretabile: null, mai eseguita', () => {
    expect(valutaFormula('alert(1)', d)).toBeNull()
    expect(valutaFormula('L/', d)).toBeNull()
    expect(valutaFormula('L/0', d)).toBeNull()
  })
})
