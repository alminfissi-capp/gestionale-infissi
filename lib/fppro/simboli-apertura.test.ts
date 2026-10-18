import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from './strutture-xml'
import { simboliApertura, type Simbolo } from './simboli-apertura'
import type { NodoStruttura } from './strutture-xml'

const leggi = (nome: string) => strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '__fixtures__', nome))),
))
const ekos = leggi('ekos-2-ante.str.xml')   // finestra 2 ante, anta principale = indice 1 (destra)
const mono = leggi('al50plus-monoblocco.str.xml') // scorrevole

const conMacro = (albero: NodoStruttura[], principale: number, ante = 2): NodoStruttura[] => albero.map(n => ({
  ...n,
  macro: n.tipo === 8610 ? { ...(n.macro ?? {}), MainSashIndex: String(principale) } : n.macro,
  elementi: n.tipo === 8610 ? ante : n.elementi,
  figli: conMacro(n.figli, principale, ante),
}))

const misure = { L: 1300, H: 1500, L0: ekos.lNominale ?? 1300, H0: ekos.hNominale ?? 1500, quote: {} }
const di = (s: Simbolo[], tipo: Simbolo['tipo']) => s.filter(x => x.tipo === tipo)
const centroX = (s: Simbolo) => (s.tipo === 'maniglia' || s.tipo === 'cerniera' ? s.x + s.w / 2 : 0)

describe('simboliApertura: finestra a 2 ante', () => {
  const s = simboliApertura(ekos.albero, misure, { mano: null, ribalta: false })
  it('un triangolo di apertura per ogni anta (2 linee ciascuno)', () => expect(di(s, 'apertura')).toHaveLength(4))
  it('una sola maniglia, sull\'anta principale (destra), verso il centro', () => {
    const m = di(s, 'maniglia')
    expect(m).toHaveLength(1)
    expect(centroX(m[0])).toBeGreaterThan(600)
    expect(centroX(m[0])).toBeLessThan(750)
  })
  it('cerniere sui lati esterni: 2 a sinistra e 2 a destra', () => {
    const c = di(s, 'cerniera')
    expect(c.filter(x => centroX(x) < 200)).toHaveLength(2)
    expect(c.filter(x => centroX(x) > 1100)).toHaveLength(2)
  })
  it('niente ribalta se il kit non e\' anta-ribalta', () => expect(di(s, 'ribalta')).toHaveLength(0))
  it('ribalta: un triangolo in piu\' solo sull\'anta principale', () => {
    const r = di(simboliApertura(ekos.albero, misure, { mano: null, ribalta: true }), 'ribalta')
    expect(r).toHaveLength(2)
    expect(r.every(l => l.tipo === 'ribalta' && l.x2 > 650)).toBe(true)
  })
  it('mano sinistra: la principale diventa quella di sinistra, maniglia verso il centro', () => {
    const m = di(simboliApertura(ekos.albero, misure, { mano: 'sx', ribalta: false }), 'maniglia')
    expect(centroX(m[0])).toBeGreaterThan(550)
    expect(centroX(m[0])).toBeLessThan(650)
  })
  it('coordinate SVG: y verso il basso, tutto dentro il disegno', () => {
    for (const x of s) {
      const punti = 'x1' in x ? [[x.x1, x.y1], [x.x2, x.y2]] : [[x.x, x.y], [x.x + x.w, x.y + x.h]]
      for (const [px, py] of punti) { expect(px).toBeGreaterThanOrEqual(0); expect(px).toBeLessThanOrEqual(1300); expect(py).toBeGreaterThanOrEqual(0); expect(py).toBeLessThanOrEqual(1500) }
    }
  })
})

describe('simboliApertura: 1 anta', () => {
  const una = conMacro(ekos.albero, 0, 1)
  it('mano destra: cerniere a destra, maniglia a sinistra', () => {
    const s = simboliApertura(una, misure, { mano: 'dx', ribalta: false })
    expect(di(s, 'cerniera').every(c => centroX(c) > 1100)).toBe(true)
    expect(centroX(di(s, 'maniglia')[0])).toBeLessThan(200)
  })
  it('senza mano: cerniere a sinistra (come la struttura)', () => {
    const s = simboliApertura(una, misure, { mano: null, ribalta: false })
    expect(di(s, 'cerniera').every(c => centroX(c) < 200)).toBe(true)
  })
})

describe('simboliApertura: scorrevole', () => {
  it('frecce di scorrimento, niente cerniere', () => {
    const s = simboliApertura(mono.albero, { L: 2600, H: 2600, L0: mono.lNominale ?? 2600, H0: mono.hNominale ?? 2600, quote: {} }, { mano: null, ribalta: false })
    expect(di(s, 'scorrimento').length).toBeGreaterThan(0)
    expect(di(s, 'cerniera')).toHaveLength(0)
  })
})
