import { describe, expect, it } from 'vitest'
import { commessaFp } from '../__fixtures__/commesse'
import { accessoriVoce, chiaveAccessorio, regoleDaElenchi, valutaFormula, type RigaKitCatalogo } from './accessori'
import { LARGHEZZE_PREDEFINITE, pezziECampi } from './geometria'

function accessoriDi(nome: string, telaio: number, peso: number, scelti: (albero: ReturnType<typeof commessaFp>['struttura']['albero']) => Record<string, boolean> = () => ({})) {
  const { dati, struttura } = commessaFp(nome)
  const { zone } = pezziECampi(struttura.albero, { L: dati.l, H: dati.h, L0: dati.l, H0: dati.h, quote: {} }, { ...LARGHEZZE_PREDEFINITE, telaio })
  const regole = regoleDaElenchi(struttura.serie, dati.anagrafica.righeKit, dati.anagrafica.collegati.map(c => ({ ...c, serie: '' })))
  const acc = accessoriVoce(struttura.albero, {}, zone, peso, regole, scelti(struttura.albero))
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

describe('accessori opzionali scelti nella voce (170-26G, scorrevole)', () => {
  // Chiave dell'accessorio `codice` nel primo kit che lo contiene.
  const chiaveDi = (albero: ReturnType<typeof commessaFp>['struttura']['albero'], codice: string): string => {
    for (const n of albero) {
      const i = n.kit.findIndex(k => k.accessori.some(a => a.codice === codice))
      if (i >= 0) return chiaveAccessorio(n.codice, i, codice)
      const dentro = chiaveDi(n.figli, codice)
      if (dentro) return dentro
    }
    return ''
  }
  it('martellina con vaschetta al posto della martellina quadra, serratura aggiunta', () => {
    const { q } = accessoriDi('170-26G', 46.7, 170, albero => ({
      [chiaveDi(albero, 'ACP 50552')]: false, [chiaveDi(albero, 'ACP 80201')]: true, [chiaveDi(albero, 'ACP 8020M')]: true,
    }))
    expect(q('ACP 50552')).toBe(0)
    expect(q('ACP 80201')).toBe(2)
    expect(q('ACP 8020M')).toBeGreaterThan(0)
    expect(q('ACP 8012')).toBe(4)
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
  it('bracci della ribalta: O1+AE+AE = larghezza anta (O1 = larghezza della zona, AE = 0)', () => {
    expect(valutaFormula('O1+AE+AE', { L: 600, H: 1300, w: 20, h: 1300 })).toBe(600)
  })
  it('formula non interpretabile: null, mai eseguita', () => {
    expect(valutaFormula('alert(1)', d)).toBeNull()
    expect(valutaFormula('L/', d)).toBeNull()
    expect(valutaFormula('L/0', d)).toBeNull()
  })
})

describe('kit scelto senza righe nella struttura (caso Palazzotto, SLIDE 60)', () => {
  // FP PRO scrive nello STR solo le righe del kit confermato: scegliendone un altro le righe
  // arrivano dal catalogo dei kit (fp_kit_righe), come fa FP PRO nella commessa.
  const riga = (fp_id: number, codice: string, extra: Partial<RigaKitCatalogo> = {}): RigaKitCatalogo => ({
    fp_id, codice, tipo: 1, quantita: 1, opzionale: false, dim_rif: 0, lim_inf: 0, lim_sup: 0, passo: 0,
    formula_r: null, formula_dist: null, dati: {}, ...extra,
  })
  const catalogo = {
    'AL-SLIDE-REG': [riga(1, 'RB304', { quantita: 2, passo: 700, formula_dist: '2*H', dati: { dimrifdist: 5 } })],
    'AL-SLIDE60 2ANTE-MAN': [
      riga(2, 'ACP 6012'),
      riga(3, 'AGP 6906', { tipo: 4, quantita: 4, dati: { dim_calc: 2 } }),
      riga(4, 'ACP-6609-187', { quantita: 2, opzionale: true, dati: { gruppoid: 18 } }),
      riga(5, 'ACP 6013', { opzionale: true, dati: { gruppoid: 18 } }),
      riga(6, 'F-LOCK', { quantita: 2, dim_rif: 1, lim_inf: 1070.1, lim_sup: 1870 }),
    ],
  }
  const kit = (codice: string, opzionale: boolean, confermato: boolean) =>
    ({ codice, descrizione: '', serie: 'AL_SISTEM', opzionale, confermato, accessori: [] })
  const albero = [{
    tipo: 8600, codice: 2, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], figli: [], accessori: [],
    kit: [kit('AL-SLIDE-REG', false, false), kit('AL-SLIDE60 2ANTE-MAN', true, false)],
  }]
  const regole = regoleDaElenchi(['AL_SL60'], [], [], catalogo)
  const acc = accessoriVoce(albero, { '2:1': true }, { 2: { L: 1920, H: 1240 } }, 40, regole)
  const q = (codice: string) => acc.filter(a => a.codice === codice).reduce((t, a) => t + a.quantita, 0)

  it('kit obbligatorio senza righe nello STR: righe dal catalogo (rapid block a passo su 2H)', () => expect(q('RB304')).toBe(4))
  it('kit scelto in cantiere: carrelli, spazzolino a metro e fasce come da catalogo', () => {
    expect(q('ACP 6012')).toBe(1)
    entro(q('AGP 6906'), 4 * 1.92 * 1.06, 0.001)
    expect(q('F-LOCK')).toBe(2)
  })
  it('alternative dello stesso gruppo: vale la prima, come FP PRO', () => {
    expect(q('ACP-6609-187')).toBe(2)
    expect(q('ACP 6013')).toBe(0)
  })
  it('kit non scelto: nessuna riga', () => {
    expect(accessoriVoce(albero, { '2:1': false }, { 2: { L: 1920, H: 1240 } }, 40, regole).map(a => a.codice)).toEqual(['RB304'])
  })
})

describe('bracci della ribalta a fasce: un solo braccio per anta', () => {
  const braccio = (codice: string, min: number, max: number) => ({
    codice, descrizione: codice, serie: 'AL_SISTEM', tipo: 1, quantita: 1, dimRif: 5, dimCalcolo: 0,
    min, max, passo: null, formula: 'O1+AE+AE', dimDistribuzione: 0, formulaDistribuzione: null, opzionale: false, confermato: true,
  })
  const kit = [braccio('ACP 50446/350', 350, 409.9), braccio('ACP 50446/415', 410, 549.9), braccio('ACP 50446/538', 550, 1800),
    braccio('ACP 5153', 1000.1, 1800), braccio('_AVVISO1', 1800.1, 10000)]
  const albero = [{ tipo: 8610, codice: 1, x: null, y: null, pezzi: [], accessori: [], kit: [{ codice: 'PLANET 2AR', confermato: true, opzionale: false, accessori: kit }], figli: [] }]
  const zona = (l: number) => ({ 1: { L: l, H: 1300 } })
  const codici = (l: number) => accessoriVoce(albero as never, {}, zona(l) as never, 20, regoleDaElenchi([], [], [], {}))
    .filter(a => a.quantita > 0).map(a => a.codice)
  it('anta da 600 mm: solo il braccio 538', () => expect(codici(600)).toEqual(['ACP 50446/538']))
  it('anta da 480 mm: solo il braccio 415', () => expect(codici(480)).toEqual(['ACP 50446/415']))
  it('anta da 1200 mm: braccio 538 + supplementare', () => expect(codici(1200)).toEqual(['ACP 50446/538', 'ACP 5153']))
  it('nessuna regola non interpretata', () => {
    expect(accessoriVoce(albero as never, {}, zona(600) as never, 20, regoleDaElenchi([], [], [], {})).some(a => a.regolaIgnota)).toBe(false)
  })
})

describe('ribalta su finestre a piu ante: il braccio si sceglie sulla larghezza di UNA anta', () => {
  const braccio = (codice: string, min: number, max: number) => ({
    codice, descrizione: codice, serie: 'AL_SISTEM', tipo: 1, quantita: 1, dimRif: 5, dimCalcolo: 0,
    min, max, passo: null, formula: 'O1+AE+AE', dimDistribuzione: 0, formulaDistribuzione: null, opzionale: false, confermato: true,
  })
  const kit = [braccio('ACP 50446/415', 410, 549.9), braccio('ACP 50446/538', 550, 1800), braccio('ACP 5153', 1000.1, 1800)]
  // Nodo anta di FP PRO con 2 ante dentro: 8 profili d'anta (4 lati x 2)
  const pezziAnta = (ante: number) => Array.from({ length: ante * 4 }, (_, i) => ({ tipo: 8090, dxf: 'X.DXF', serie: 'S', indice: i }))
  const nodo = (ante: number) => [{ tipo: 8610, codice: 2, x: null, y: null, pezzi: pezziAnta(ante), accessori: [], kit: [{ codice: 'PLANET 2AR', confermato: true, opzionale: false, accessori: kit }], figli: [] }]
  const codici = (ante: number, l: number) => accessoriVoce(nodo(ante) as never, {}, { 2: { L: l, H: 1300 } } as never, 20, regoleDaElenchi([], [], [], {}))
    .filter(a => a.quantita > 0).map(a => a.codice)
  it('2 ante su 1200 mm: anta da 600 -> solo il braccio 538, niente supplementare', () => expect(codici(2, 1200)).toEqual(['ACP 50446/538']))
  it('3 ante su 1500 mm: anta da 500 -> braccio 415', () => expect(codici(3, 1500)).toEqual(['ACP 50446/415']))
  it('1 anta da 1200 mm: braccio 538 + supplementare', () => expect(codici(1, 1200)).toEqual(['ACP 50446/538', 'ACP 5153']))
})
