import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml, type NodoStruttura } from './strutture-xml'
import {
  accessoriOpzionali, accessoriOpzionaliScelti, alberoLeggero, campiRiempimento, kitAlternativiDoppi, sceltaKit, coloriAccessori, haRibalta, divisioniStruttura, haAnteBattenti, kitOpzionali, nuovaVoceFp, problemiVoce, telaiStruttura,
} from './rilievo-fp'

const leggi = (nome: string) => strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '__fixtures__', nome))),
))
const ekos = leggi('ekos-2-ante.str.xml')
const al50 = leggi('al50plus-monoblocco.str.xml')

describe('divisioniStruttura', () => {
  it('finestra 2 ante: nessun traverso o montante', () => expect(divisioniStruttura(ekos.albero)).toEqual([]))
  it('monoblocco: traversi a 1050 e 2350 dal basso, montanti a 1223,5 da sinistra', () => {
    expect(divisioniStruttura(al50.albero)).toEqual([
      { codice: '3', tipo: 'traverso', nominale: 1050, etichetta: 'Traverso 1' },
      { codice: '4', tipo: 'montante', nominale: 1223.5, etichetta: 'Montante 1' },
      { codice: '5', tipo: 'traverso', nominale: 2350, etichetta: 'Traverso 2' },
      { codice: '7', tipo: 'montante', nominale: 1223.5, etichetta: 'Montante 2' },
    ])
  })
})

describe('campiRiempimento', () => {
  it('finestra 2 ante: due vetri con il codice della struttura', () => {
    expect(campiRiempimento(ekos.albero)).toEqual([
      { codice: '3', tipo: 'vetro', codiceDefault: '4_15_33.1_S+G', etichetta: 'Vetro 1' },
      { codice: '4', tipo: 'vetro', codiceDefault: '4_15_33.1_S+G', etichetta: 'Vetro 2' },
    ])
  })
  it('monoblocco: 2 pannelli e 4 vetri', () => {
    const c = campiRiempimento(al50.albero)
    expect(c.filter(x => x.tipo === 'pannello')).toHaveLength(2)
    expect(c.filter(x => x.tipo === 'vetro')).toHaveLength(4)
    expect(c.find(x => x.tipo === 'pannello')?.codiceDefault).toBe('30MM')
  })
})

describe('kit e ante', () => {
  it('kit opzionali con chiave nodo:indice e scelta di FP PRO', () => {
    const k = kitOpzionali(al50.albero)
    expect(k.length).toBeGreaterThan(0)
    expect(k.every(x => /^\d+:\d+$/.test(x.chiave))).toBe(true)
    expect(k.some(x => x.predefinito)).toBe(true)
    expect(k.some(x => !x.predefinito)).toBe(true)
  })
  it('ante battenti: si nella finestra, no nel monoblocco scorrevole', () => {
    expect(haAnteBattenti(ekos.albero)).toBe(true)
    expect(haAnteBattenti(al50.albero)).toBe(false)
  })
})

describe('telaiStruttura', () => {
  it('4 lati nella finestra', () => {
    expect(telaiStruttura(ekos.albero)).toEqual({
      sinistra: 'ES24500170', alto: 'ES24500170', destra: 'ES24500170', basso: 'ES24500170',
    })
  })
  it('3 lati nel monoblocco (sotto c\'e\' lo zoccolo)', () => {
    expect(telaiStruttura(al50.albero)).toEqual({ sinistra: 'TT51803', alto: 'TT51803', destra: 'TT51803' })
  })
})

describe('nuovaVoceFp e problemiVoce', () => {
  const voce = nuovaVoceFp({ id: 's1', percorso: 'ALM/x.STR', nome: 'x', albero: al50.albero }, 'AL_50PLU')

  it('voce nuova: kit come in FP PRO, il resto vuoto', () => {
    expect(voce).toMatchObject({ strutturaId: 's1', serie: 'AL_50PLU', larghezza: null, quote: {}, vetri: {}, telai: {}, mano: null })
    expect(Object.values(voce.kit).some(Boolean)).toBe(true)
  })
  it('senza misure: due problemi', () => {
    expect(problemiVoce(voce, [])).toEqual(['Manca la larghezza', 'Manca l\'altezza'])
  })
  it('quota di un traverso oltre l\'altezza', () => {
    const div = divisioniStruttura(al50.albero)
    expect(problemiVoce({ ...voce, larghezza: 2400, altezza: 2800, quote: { 3: 3000, 4: 1200 } }, div))
      .toEqual(['Traverso 1: quota fuori dal telaio'])
  })
})

describe('alberoLeggero', () => {
  it('tiene solo gli accessori opzionali (sciolti e nei kit) e tutto il resto', () => {
    const leggero = alberoLeggero(al50.albero)
    const tutti = (n: typeof leggero): typeof leggero => n.flatMap(x => [x, ...tutti(x.figli)])
    expect(tutti(leggero).every(n => n.accessori.every(a => a.opzionale) && n.kit.every(k => k.accessori.every(a => a.opzionale)))).toBe(true)
    expect(accessoriOpzionali(leggero)).toEqual(accessoriOpzionali(al50.albero))
    expect(divisioniStruttura(leggero)).toEqual(divisioniStruttura(al50.albero))
    expect(kitOpzionali(leggero)).toEqual(kitOpzionali(al50.albero))
    expect(campiRiempimento(leggero)).toEqual(campiRiempimento(al50.albero))
    expect(JSON.stringify(leggero).length).toBeLessThan(JSON.stringify(al50.albero).length)
  })
})

describe('coloriAccessori', () => {
  const inox = { fpId: 9, descrizione: 'INOX' }, c9010 = { fpId: 62, descrizione: '9010' }
  it('elenco ordinato se c\'e\'', () => expect(coloriAccessori({ coloriAcc: [inox, c9010], coloreAcc: c9010 })).toEqual([inox, c9010]))
  it('voce vecchia con un solo colore: quello', () => expect(coloriAccessori({ coloreAcc: inox })).toEqual([inox]))
  it('niente: elenco vuoto', () => expect(coloriAccessori({ coloreAcc: null, coloriAcc: [] })).toEqual([]))
})

describe('haRibalta', () => {
  const nodo = (kit: { codice: string; descrizione: string; opzionale: boolean; confermato: boolean }[]) =>
    [{ tipo: 8610, codice: 2, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], accessori: [], kit: kit.map(k => ({ ...k, serie: '', accessori: [] })), figli: [] }]
  it('kit anta-ribalta scelto nella voce (2AR, 1AR, A/R): si', () => {
    const a = nodo([{ codice: 'PLANET 2A BAT-COMPLANARE-DS', descrizione: '2 ante battente', opzionale: true, confermato: true }, { codice: 'PLANET 2AR COMPLANARE-DS', descrizione: '2 ante a ribalta', opzionale: true, confermato: false }])
    expect(haRibalta(a, { '2:1': true, '2:0': false })).toBe(true)
    expect(haRibalta(a, {})).toBe(false)
    expect(haRibalta(nodo([{ codice: 'PLANET  EXENS A/R-DS', descrizione: 'Kit Exens', opzionale: false, confermato: true }]), {})).toBe(true)
  })
  it('solo battente: no', () => {
    expect(haRibalta(nodo([{ codice: 'PLANET 1A BATT-COMPLANARE-DS', descrizione: '1 anta finestra a battente', opzionale: true, confermato: true }]), {})).toBe(false)
  })
})

describe('accessori opzionali (es. serratura dello scorrevole)', () => {
  const acc = (codice: string, opzionale: boolean, confermato: boolean) => ({
    codice, descrizione: codice, serie: '', tipo: 1, quantita: 1, dimRif: 0, dimCalcolo: 0, min: null, max: null, passo: null,
    formula: null, dimDistribuzione: 0, formulaDistribuzione: null, opzionale, confermato,
  })
  const nodo = (codice: number, extra: Partial<NodoStruttura>): NodoStruttura => ({
    tipo: 8620, codice, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], accessori: [], kit: [], figli: [], ...extra,
  })
  const albero = [nodo(10, {
    accessori: [acc('RB304', true, true), acc('VITE', false, true)],
    kit: [
      { codice: 'MART-MART', descrizione: 'Martellina', serie: '', opzionale: true, confermato: true,
        accessori: [acc('ACP 8002', false, true), acc('ACP 8020M', true, false), acc('ACP 50552', true, false), acc('ACP 50552', true, true)] },
      { codice: 'CREM-CREM', descrizione: 'Cremonese', serie: '', opzionale: true, confermato: false, accessori: [] },
    ],
  })]

  it('per kit, senza gli obbligatori, un codice ripetuto = una scelta (predefinito se uno e\' confermato)', () => {
    expect(accessoriOpzionali(albero)).toEqual([
      { titolo: 'Accessori della struttura', kit: null, accessori: [{ chiave: '10:a:RB304', codice: 'RB304', descrizione: 'RB304', predefinito: true }] },
      { titolo: 'Martellina', kit: '10:0', accessori: [
        { chiave: '10:0:ACP 8020M', codice: 'ACP 8020M', descrizione: 'ACP 8020M', predefinito: false },
        { chiave: '10:0:ACP 50552', codice: 'ACP 50552', descrizione: 'ACP 50552', predefinito: true },
      ] },
    ])
  })

  it('kit senza righe nello STR: al telefono arrivano gli opzionali del catalogo', () => {
    const leggero = alberoLeggero(albero, kit => (kit === 'CREM-CREM' ? [acc('ACP 8011', true, false), acc('ACP 8005', false, true)] : []))
    expect(leggero[0].kit[1].accessori.map(a => a.codice)).toEqual(['ACP 8011'])
    expect(leggero[0].kit[0].accessori.map(a => a.codice)).toEqual(['ACP 8020M', 'ACP 50552', 'ACP 50552'])
  })

  it('scelti: la scelta della voce vince sul predefinito; kit non scelto = nessuno', () => {
    expect(accessoriOpzionaliScelti(albero, { kit: {}, accessori: { '10:0:ACP 8020M': true, '10:a:RB304': false } }).map(a => a.codice))
      .toEqual(['ACP 8020M', 'ACP 50552'])
    expect(accessoriOpzionaliScelti(albero, { kit: { '10:0': false }, accessori: { '10:0:ACP 8020M': true } }).map(a => a.codice))
      .toEqual(['RB304'])
  })
})

describe('kit alternativi (caso Agrusa: 2AR-SORMONTO e 2AR-SCOMPARSA insieme)', () => {
  const kit = (codice: string, gruppo: number | null, confermato = false) =>
    ({ codice, descrizione: codice, serie: '', opzionale: true, confermato, accessori: [], gruppo })
  const albero: NodoStruttura[] = [{
    tipo: 8610, codice: 2, elementi: 2, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], accessori: [], figli: [],
    kit: [kit('2AR COMPLANARE', 74, true), kit('2AR-SCOMPARSA', 74), kit('2AR-SORMONTO', 74), kit('EXENS', 3, true), kit('MARTELLINA', 3), kit('SOLO', 99)],
  }]

  it('stesso gruppo nel nodo = alternative; gruppo con un solo kit = casella', () => {
    const k = kitOpzionali(albero)
    expect(k.map(x => x.alternative)).toEqual(['2:g74', '2:g74', '2:g74', '2:g3', '2:g3', null])
  })
  it('scegliendo un kit si tolgono le sue alternative, non gli altri gruppi', () => {
    const k = kitOpzionali(albero)
    expect(sceltaKit(k, { '2:0': true, '2:3': true }, '2:2', true))
      .toEqual({ '2:0': false, '2:1': false, '2:2': true, '2:3': true })
  })
  it('doppi: due alternative spuntate insieme (anche con il predefinito non toccato)', () => {
    expect(kitAlternativiDoppi(albero, { '2:0': false, '2:1': true, '2:2': true, '2:4': true, '2:3': false }, () => null))
      .toEqual([['2AR-SCOMPARSA', '2AR-SORMONTO']])
    expect(kitAlternativiDoppi(albero, { '2:2': true }, () => null)).toEqual([['2AR COMPLANARE', '2AR-SORMONTO']])
    expect(kitAlternativiDoppi(albero, { '2:0': false, '2:2': true }, () => null)).toEqual([])
  })
  it('albero dal database senza gruppo: lo prende da gruppoDi', () => {
    const senza = [{ ...albero[0], kit: albero[0].kit.map(x => ({ ...x, gruppo: undefined })) }]
    const gruppi: Record<string, number> = { '2AR-SCOMPARSA': 74, '2AR-SORMONTO': 74, '2AR COMPLANARE': 74 }
    expect(kitAlternativiDoppi(senza, { '2:0': false, '2:1': true, '2:2': true }, k => gruppi[k])).toEqual([['2AR-SCOMPARSA', '2AR-SORMONTO']])
  })
})
