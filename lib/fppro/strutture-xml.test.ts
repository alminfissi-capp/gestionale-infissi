import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml, type NodoStruttura } from './strutture-xml'

const leggi = (nome: string) => {
  const byte = readFileSync(join(__dirname, '__fixtures__', nome))
  return new XMLParser(OPZIONI_XML).parse(new TextDecoder('windows-1252').decode(byte))
}

const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])

describe('EKOS 66TH finestra 2 ante', () => {
  const s = strutturaDaXml(leggi('ekos-2-ante.str.xml'))

  it('testata: codice, descrizione decodificata, misure nominali, serie', () => {
    expect(s.codice).toBe('PL62UCVIF2AR')
    expect(s.descrizione).toBe('03- Finestra 2 Ante')
    expect(s.lNominale).toBe(1300)
    expect(s.hNominale).toBe(1500)
    expect(s.serie).toEqual(['EKOS_66TH'])
  })

  it('albero: telaio -> anta battente a 2 ante -> 2 vetri', () => {
    expect(s.albero).toHaveLength(1)
    const telaio = s.albero[0]
    expect(telaio.tipo).toBe(8600)
    expect(telaio.prm[0]).toEqual({ nome: 'MODEL-00', variabili: { L: 1300, H: 1500 } })
    expect(telaio.pezzi.map(p => p.tipo)).toEqual([8050, 8050, 8050, 8050])
    expect(telaio.pezzi[0]).toEqual({ tipo: 8050, dxf: 'EKOS_66TH\\ES24500170.DXF', serie: 'EKOS_66TH', indice: 0 })
    const anta = telaio.figli[0]
    expect(anta.tipo).toBe(8610)
    expect(anta.elementi).toBe(2)
    expect(anta.macro?.MainSashIndex).toBe('1')
    expect(anta.ante).toHaveLength(2)
    expect(anta.pezzi.filter(p => p.tipo === 8090)).toHaveLength(8)
    expect(anta.pezzi.find(p => p.tipo === 8090 && p.indice === 1)).toBeTruthy()
    expect(anta.figli.map(f => f.tipo)).toEqual([8510, 8510])
    expect(anta.figli[0].pezzi[0].dxf).toBe('GLASSES\\4_15_33.1_S+G.DXF')
  })

  it('accessori: 19 in tutta la struttura, con quantita\' e tipo', () => {
    const acc = tutti(s.albero).flatMap(n => n.accessori)
    expect(acc).toHaveLength(19)
    expect(acc[0]).toMatchObject({ codice: '1125F', serie: 'EKOS 66TH', tipo: 1, quantita: 1 })
  })

  it('anteprima: 13 poligoni piatti [x, y, ...], immagine presente', () => {
    expect(s.poligoni).toHaveLength(13)
    expect(s.poligoni[0].length % 2).toBe(0)
    expect(s.immagineBase64).toBe('Qk0=')
  })
})

describe('monoblocco AL50PLUS + scorrevole SL65', () => {
  const s = strutturaDaXml(leggi('al50plus-monoblocco.str.xml'))

  it('appartiene a due serie, in ordine', () => {
    expect(s.serie).toEqual(['AL_50PLU', 'AL_SL65'])
  })
  it('8 kit con i loro accessori, opzionali e scelti', () => {
    const kit = tutti(s.albero).flatMap(n => n.kit)
    expect(kit).toHaveLength(8)
    expect(kit[0]).toMatchObject({ codice: 'AL-SLIDE65 KIT  2 ANTE', serie: 'AL_SISTEM', opzionale: false, confermato: true })
    expect(kit.some(k => k.opzionale && !k.confermato)).toBe(true)
  })
  it('traversi e montanti sono nodi dell\'albero', () => {
    const tipi = tutti(s.albero).map(n => n.tipo)
    expect(tipi).toContain(8070)
    expect(tipi).toContain(8060)
    expect(tipi).toContain(8620)
  })
  it('40 poligoni, misure 2447 x 2885', () => {
    expect(s.poligoni).toHaveLength(40)
    expect([s.lNominale, s.hNominale]).toEqual([2447, 2885])
  })
})

describe('file minimi o rovinati', () => {
  const parser = new XMLParser(OPZIONI_XML)
  it('senza anteprima, immagine, descrizione: si legge lo stesso', () => {
    const s = strutturaDaXml(parser.parse(
      '<FP_TREE NameStr="X"><FP_PREVIEW><FP_PREV_PIECE></FP_PREV_PIECE></FP_PREVIEW>' +
      '<FP_NODE ElementType="8600" Code="1"><FP_PIECE Type="8050" DXF="AL_45\\T1.DXF" /></FP_NODE></FP_TREE>',
    ))
    expect(s).toMatchObject({ codice: 'X', descrizione: null, poligoni: [], immagineBase64: null, serie: ['AL_45'] })
    expect([s.lNominale, s.hNominale]).toEqual([null, null])
  })
  it('senza FP_TREE: errore chiaro', () => {
    expect(() => strutturaDaXml(parser.parse('<ALTRO />'))).toThrow(/FP_TREE/)
  })
  it('serie ricavata dalle ante se non ci sono profili di telaio', () => {
    const s = strutturaDaXml(parser.parse(
      '<FP_TREE><FP_NODE ElementType="8610" Code="1"><FP_PIECE Type="8090" DXF="ED_ES40\\A1.DXF" /></FP_NODE></FP_TREE>',
    ))
    expect(s.serie).toEqual(['ED_ES40'])
  })
})

describe('caratteri nulli', () => {
  it('il carattere nullo (Postgres lo rifiuta) viene tolto', () => {
    const b64 = btoa('Porta 2 ante\u0000')
    const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
      `<FP_TREE NameStr="P2A"><FP_DESCRIPTION DescrB64="DESCRIPTION IS B64 CODED"><![CDATA[${b64}]]></FP_DESCRIPTION></FP_TREE>`,
    ))
    expect(s.descrizione).toBe('Porta 2 ante')
  })
})

describe('tempi della struttura', () => {
  it('le ore di FP_TIMES', () => {
    const s = strutturaDaXml(leggi('al50plus-monoblocco.str.xml'))
    expect(s.tempi).toEqual({ taglio: 0, lavorazione: 9, montaggio: 0, assemblaggio: 0, posa: 2 })
  })
  it('senza FP_TIMES: tutto zero', () => {
    const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse('<FP_TREE />'))
    expect(s.tempi).toEqual({ taglio: 0, lavorazione: 0, montaggio: 0, assemblaggio: 0, posa: 0 })
  })
})

describe('opzioni non confermate', () => {
  it('accessorio e kit opzionali senza Confirmed: non scelti (come FP PRO)', () => {
    const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
      '<FP_TREE><FP_NODE ElementType="8600" Code="1">' +
      '<FP_FITTING Code="A1" Optional="1" /><FP_FITTING Code="A2" Optional="1" Confirmed="1" /><FP_FITTING Code="A3" />' +
      '<FP_KIT Code="K1" Optional="1" /><FP_KIT Code="K2" />' +
      '</FP_NODE></FP_TREE>',
    ))
    const n = s.albero[0]
    expect(n.accessori.map(a => [a.codice, a.confermato])).toEqual([['A1', false], ['A2', true], ['A3', true]])
    expect(n.kit.map(k => [k.codice, k.confermato])).toEqual([['K1', false], ['K2', true]])
  })
})

describe('distribuzione a passo', () => {
  it('formula e misura di riferimento della distribuzione', () => {
    const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
      '<FP_TREE><FP_NODE ElementType="8600" Code="1">' +
      '<FP_FITTING Code="ACP 8028" Multiply="2" Step="150.000000" RefDimDist="5" DistFormula="L/2" /><FP_FITTING Code="B" />' +
      '</FP_NODE></FP_TREE>',
    ))
    expect(s.albero[0].accessori.map(a => [a.dimDistribuzione, a.formulaDistribuzione])).toEqual([[5, 'L/2'], [0, null]])
  })
})
