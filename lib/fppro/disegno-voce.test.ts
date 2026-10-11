import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from './strutture-xml'
import { disegnoVoce, mappaAsse } from './disegno-voce'

const leggi = (nome: string) => {
  const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
    new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '__fixtures__', nome))),
  ))
  return { albero: s.albero, poligoni: s.poligoni, l_nominale: s.lNominale, h_nominale: s.hNominale }
}

describe('mappaAsse', () => {
  it('bordo rigido, centro che si allunga', () => {
    const f = mappaAsse(1000, 2000, [])
    expect([f(0), f(150), f(500), f(850), f(1000)]).toEqual([0, 150, 1000, 1850, 2000])
  })
  it('una divisione va alla quota e resta larga uguale', () => {
    const f = mappaAsse(1000, 2000, [{ nominale: 500, reale: 700 }])
    expect([f(425), f(500), f(575)]).toEqual([625, 700, 775])
  })
  it('misure troppo piccole per le zone rigide: riduzione uniforme', () => {
    expect(mappaAsse(1000, 200, [])(500)).toBe(100)
  })
  it('divisione che invade il bordo: riduzione uniforme', () => {
    expect(mappaAsse(1000, 2000, [{ nominale: 500, reale: 100 }])(500)).toBe(1000)
  })
})

describe('disegnoVoce', () => {
  it('alle misure della struttura il disegno non cambia (y capovolta)', () => {
    const d = disegnoVoce(leggi('ekos-2-ante.str.xml'), { larghezza: null, altezza: null, quote: {} })
    expect(d?.profili).toHaveLength(13)
    expect(d?.profili[0]).toBe('0,1500 0,0 50,50 50,1450')
    expect([d?.larghezza, d?.altezza]).toEqual([1300, 1500])
  })
  it('monoblocco 3000 x 3000 con il traverso basso a 1200: profili spessi uguali', () => {
    const d = disegnoVoce(leggi('al50plus-monoblocco.str.xml'), { larghezza: 3000, altezza: 3000, quote: { 3: 1200 } })!
    expect(d.viewBox).toBe('-60 -60 3120 3120')
    const tutto = d.profili.join(' ')
    expect(tutto).toContain(',1775')   // bordo alto del traverso: 3000 - (1200 + 25)
    expect(tutto).toContain('2950,')   // telaio destro sempre largo 50
  })
  it('struttura senza anteprima: niente disegno', () => {
    expect(disegnoVoce({ albero: [], poligoni: [], l_nominale: 1000, h_nominale: 1000 }, { larghezza: 1, altezza: 1, quote: {} })).toBeNull()
  })
})
