import { describe, expect, it } from 'vitest'
import { notePulite, posizioneScritta } from './scritte-lati'
import { contornoForma } from './forma'

const rettangolo = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 500 }, { x: 0, h: 500 }] })
const vicino = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.5)

describe('posizioneScritta: testo accanto al suo lato, fuori dalla forma', () => {
  it('lato in basso', () => {
    const p = posizioneScritta(rettangolo[0], 40)
    vicino(p.x, 500); vicino(p.y, -40); vicino(p.angolo, 0)
  })
  it('lato a destra: verticale', () => {
    const p = posizioneScritta(rettangolo[1], 40)
    vicino(p.x, 1040); vicino(p.y, 250); vicino(Math.abs(p.angolo), 90)
  })
  it('lato in alto: mai capovolto', () => {
    const p = posizioneScritta(rettangolo[2], 40)
    vicino(p.y, 540); vicino(p.angolo, 0)
  })
  it('arco con freccia 200 sul lato alto: sopra la gobba', () => {
    const conArco = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 500, freccia: 200 }, { x: 0, h: 500 }] })
    const p = posizioneScritta(conArco[2], 40)
    vicino(p.x, 500); vicino(p.y, 740)
  })
})

describe('notePulite', () => {
  it('solo i lati che esistono e con testo', () =>
    expect(notePulite({ 0: 'L MAG', 4: 'falda', 1: '  ' }, 4)).toEqual({ 0: 'L MAG' }))
  it('niente note: oggetto vuoto', () => expect(notePulite(undefined, 4)).toEqual({}))
})
