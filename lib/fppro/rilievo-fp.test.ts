import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from './strutture-xml'
import {
  alberoLeggero, campiRiempimento, coloriAccessori, divisioniStruttura, haAnteBattenti, kitOpzionali, nuovaVoceFp, problemiVoce, telaiStruttura,
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
  it('toglie accessori e accessori dei kit, tiene tutto il resto', () => {
    const leggero = alberoLeggero(al50.albero)
    const tutti = (n: typeof leggero): typeof leggero => n.flatMap(x => [x, ...tutti(x.figli)])
    expect(tutti(leggero).every(n => n.accessori.length === 0 && n.kit.every(k => k.accessori.length === 0))).toBe(true)
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
