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
  it('misure troppo piccole per le zone rigide: zone ristrette, centro al centro', () => {
    expect(mappaAsse(1000, 200, [])(500)).toBe(100)
  })
  it('divisione vicina al bordo: va comunque alla quota (zone ristrette)', () => {
    const f = mappaAsse(1000, 2000, [{ nominale: 500, reale: 100 }])
    expect(f(500)).toBe(100)
    expect(f(1000)).toBe(2000)
    expect(f(400)).toBeLessThan(100)
    expect(f(600)).toBeGreaterThan(100)
  })
  it('sopraluce di 200 mm (porta 43C-PLANET62UP): il traverso segue la quota', () => {
    // H nominale 2800, traverso a 2600; porta alta 2620 con traverso a 2300 o a 2000.
    expect(mappaAsse(2800, 2620, [{ nominale: 2600, reale: 2300 }])(2600)).toBe(2300)
    expect(mappaAsse(2800, 2620, [{ nominale: 2600, reale: 2000 }])(2600)).toBe(2000)
  })
  it('quota fuori dal telaio o fuori ordine: ignorata', () => {
    expect(mappaAsse(1000, 2000, [{ nominale: 500, reale: 2500 }])(500)).toBe(1000)
    const f = mappaAsse(1000, 2000, [{ nominale: 300, reale: 1500 }, { nominale: 700, reale: 1000 }])
    expect(f(300)).toBe(1500)
  })
  it('sempre crescente: nessun profilo si ribalta', () => {
    const f = mappaAsse(2800, 2620, [{ nominale: 2600, reale: 2550 }])
    const valori = Array.from({ length: 57 }, (_, i) => f(i * 50))
    expect(valori.every((v, i) => i === 0 || v >= valori[i - 1])).toBe(true)
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
