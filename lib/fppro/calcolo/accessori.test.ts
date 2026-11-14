import { describe, expect, it } from 'vitest'
import { commessaFp } from '../__fixtures__/commesse'
import { accessoriDaCatalogo, accessoriVoce, chiaveAccessorio, regoleDaElenchi, valutaFormula, type RigaKitCatalogo } from './accessori'
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

describe('righe del catalogo con tutte le regole (caso Vazzana)', () => {
  const [d, p] = accessoriDaCatalogo([
    {
      fp_id: 61554, codice: 'ACP 5151/D', tipo: 1, quantita: 1, opzionale: false, dim_rif: 5, lim_inf: 600.1, lim_sup: 1500, passo: 0,
      formula_r: 'O1+AE+AE', formula_dist: null,
      dati: { apertura: 1, dimrif2: 201, liminfrange2: 1, limsuprange2: 100, dim_rif3: 0, num_max: 0, corr_ml: 0 },
    },
    {
      fp_id: 61600, codice: 'G-22135', tipo: 1, quantita: 1, opzionale: false, dim_rif: 401, lim_inf: 350, lim_sup: 450.9, passo: 0,
      formula_r: null, formula_dist: null,
      dati: { dimrif2: 301, liminfrange2: 192, limsuprange2: 394.9, dim_rif3: 9, lim_inf_range3: 120, lim_sup_range3: 120,
        parametrica: 1, codice_param: 'scelta cr. Cilindro', valore_param: '30', num_max: 10, corr_ml: -28, formulal: '2*L' },
    },
  ])
  it('mano e seconda condizione', () => {
    expect(d.apertura).toBe(1)
    expect(d.altreCondizioni).toEqual([{ dim: 201, min: 1, max: 100 }])
  })
  it('terza condizione, parametro, massimo, correzione, formula a metro', () => {
    expect(p.altreCondizioni).toEqual([{ dim: 301, min: 192, max: 394.9 }, { dim: 9, min: 120, max: 120 }])
    expect(p.parametro).toEqual({ codice: 'scelta cr. Cilindro', valore: '30' })
    expect(p.numMax).toBe(10)
    expect(p.corrMl).toBe(-28)
    expect(p.formulaL).toBe('2*L')
    expect(p.apertura).toBe(0)
  })
})

describe('cerniere a scomparsa: una sola, per mano e per peso (caso Vazzana)', () => {
  const riga = (fp_id: number, codice: string, apertura: number, pesoMin: number, pesoMax: number): RigaKitCatalogo => ({
    fp_id, codice, tipo: 1, quantita: 1, opzionale: false, dim_rif: 5, lim_inf: 600.1, lim_sup: 1500, passo: 0,
    formula_r: 'O1+AE+AE', formula_dist: null,
    dati: { apertura, dimrif2: 201, liminfrange2: pesoMin, limsuprange2: pesoMax },
  })
  const catalogo = {
    'PLANET 1AR-SCOMPARSA-RISTRUTT': [
      riga(1, 'ACP 5151/D', 1, 1, 100), riga(2, 'ACP 5151/S', 2, 1, 100),
      riga(3, 'ACP 5163/D', 1, 100.1, 150), riga(4, 'ACP 5163/S', 2, 100.1, 150),
    ],
  }
  const albero = [{
    tipo: 8610, codice: 2, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], figli: [], accessori: [],
    kit: [{ codice: 'PLANET 1AR-SCOMPARSA-RISTRUTT', descrizione: '', serie: 'AL_SISTEM', opzionale: true, confermato: true, accessori: [] }],
  }]
  const regole = regoleDaElenchi([], [], [], catalogo)
  const codici = (mano: 'sx' | 'dx' | null, pesoAnta: number) =>
    accessoriVoce(albero as never, {}, { 2: { L: 675, H: 1342 } }, 60, regole, {}, {
      mano, ante: { 2: { ante: [{ l: 675, h: 1342, peso: pesoAnta }], scorrevoli: [] } },
    }).filter(a => a.quantita > 0).map(a => a.codice)

  it('mano destra, anta sotto 100 kg: solo ACP 5151/D', () => expect(codici('dx', 40)).toEqual(['ACP 5151/D']))
  it('mano sinistra: solo ACP 5151/S', () => expect(codici('sx', 40)).toEqual(['ACP 5151/S']))
  it('senza mano: un solo kit, il destro', () => expect(codici(null, 40)).toEqual(['ACP 5151/D']))
  it('anta da 120 kg: solo ACP 5163/D', () => expect(codici('dx', 120)).toEqual(['ACP 5163/D']))
})

describe('anta passiva e codici sconosciuti', () => {
  const acc = (codice: string, dimRif: number, min: number, max: number) => ({
    codice, descrizione: codice, serie: 'S', tipo: 1, quantita: 1, dimRif, dimCalcolo: 0, min, max, passo: null, formula: null,
    dimDistribuzione: 0, formulaDistribuzione: null, opzionale: false, confermato: true,
  })
  const albero = [{
    tipo: 8610, codice: 2, x: null, y: null, pezzi: [], figli: [], kit: [],
    accessori: [acc('PASSIVA', 202, 50, 100), acc('ATTIVA', 201, 50, 100), acc('STRANO', 999, 1, 5000)],
  }]
  const risultato = accessoriVoce(albero as never, {}, { 2: { L: 1200, H: 1400 } }, 100, regoleDaElenchi([], [], [], {}), {}, {
    mano: 'dx', ante: { 2: { ante: [{ l: 600, h: 1400, peso: 40 }, { l: 600, h: 1400, peso: 60 }], scorrevoli: [] } },
  })
  it('peso anta 2 (passiva) 60 kg: la riga 202 50-100 vale, la 201 no', () => {
    expect(risultato.filter(a => a.quantita > 0).map(a => a.codice)).toEqual(['PASSIVA'])
  })
  it('codice di misura sconosciuto: riga esclusa e avviso', () => {
    expect(risultato.find(a => a.codice === 'STRANO')).toMatchObject({ quantita: 0, avviso: 'Regola FP PRO non gestita: misura 999 su STRANO' })
  })
})

describe('catenacci (902) solo con l\'anta passiva', () => {
  const albero = [{
    tipo: 8610, codice: 2, x: null, y: null, pezzi: [], figli: [], kit: [],
    accessori: [{ codice: 'ACP 50452', descrizione: '', serie: 'S', tipo: 1, quantita: 1, dimRif: 902, dimCalcolo: 0, min: 0, max: 0,
      passo: null, formula: null, dimDistribuzione: 0, formulaDistribuzione: null, opzionale: false, confermato: true }],
  }]
  const codici = (ante: number) => accessoriVoce(albero as never, {}, { 2: { L: 1200, H: 1400 } }, 60, regoleDaElenchi([], [], [], {}), {}, {
    ante: { 2: { ante: Array.from({ length: ante }, () => ({ l: 1200 / ante, h: 1400, peso: 30 })), scorrevoli: [] } },
  }).filter(a => a.quantita > 0).map(a => a.codice)
  it('finestra a 1 anta: niente catenacci', () => expect(codici(1)).toEqual([]))
  it('finestra a 2 ante: catenacci', () => expect(codici(2)).toEqual(['ACP 50452']))
})

describe('righe per anta scorrevole (codici 22-24): una per ogni anta', () => {
  const asta = { codice: 'ACP 90213/2750', descrizione: '', serie: 'S', tipo: 1, quantita: 1, dimRif: 24, dimCalcolo: 0, min: 2150.1, max: 2750,
    passo: null, formula: null, dimDistribuzione: 0, formulaDistribuzione: null, opzionale: false, confermato: true }
  const albero = [{ tipo: 8620, codice: 3, x: null, y: null, pezzi: [], figli: [], kit: [], accessori: [asta] }]
  const q = (altezze: number[]) => accessoriVoce(albero as never, {}, { 3: { L: 3000, H: 2500 } }, 120, regoleDaElenchi([], [], [], {}), {}, {
    ante: { 3: { ante: [], scorrevoli: altezze.map(h => ({ l: 1500, h, peso: 60 })) } },
  }).filter(a => a.codice === 'ACP 90213/2750').reduce((t, a) => t + a.quantita, 0)
  it('2 ante scorrevoli nella fascia: 2 aste', () => expect(q([2500, 2500])).toBe(2))
  it('una sola anta nella fascia: 1 asta', () => expect(q([2500, 2000])).toBe(1))
})
