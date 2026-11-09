import { describe, expect, it } from 'vitest'
import { conNotaLato, graficoConForma, misuraScritta, notePulite, posizioneScritta } from './scritte-lati'
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

describe('scritte dentro il serramento (distanza negativa)', () => {
  it('lato in basso: sopra il lato, dentro', () => {
    const p = posizioneScritta(rettangolo[0], -40)
    vicino(p.x, 500); vicino(p.y, 40)
  })
  it('arco che esce: sotto la gobba', () => {
    const c = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 500, freccia: 200 }, { x: 0, h: 500 }] })
    vicino(posizioneScritta(c[2], -40).y, 660)
  })
  it('arco che rientra: sotto la rientranza', () => {
    const c = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 500, freccia: -100 }, { x: 0, h: 500 }] })
    vicino(posizioneScritta(c[2], -40).y, 360)
  })
})

describe('misuraScritta: il testo sta nel suo lato', () => {
  it('testo corto: carattere pieno', () =>
    expect(misuraScritta(rettangolo[0], 'L MAG', 70, 1000, 500).carattere).toBe(70))
  it('testo lungo su un lato corto: si rimpicciolisce fino a starci', () => {
    const corto = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 400, h: 0 }, { x: 400, h: 2000 }, { x: 0, h: 2000 }] })
    const m = misuraScritta(corto[0], 'soglia ribassata da sostituire', 70, 400, 2000)
    expect(m.carattere * 0.6 * 'soglia ribassata da sostituire'.length).toBeLessThanOrEqual(0.9 * 400 + 1e-6)
  })
  it('serramento stretto: la distanza dal lato non supera un quarto del lato corto', () =>
    expect(misuraScritta(rettangolo[1], 'L MAG', 70, 400, 2000).distanza).toBeLessThanOrEqual(100))
})

describe('graficoConForma: le scritte non cambiano lato', () => {
  const g = { forma: { tipo: 'punti' as const, punti: [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 1400 }, { x: 600, h: 2000 }, { x: 0, h: 1400 }] }, radice: { id: 'R', contenuto: { tipo: 'vuoto' as const } }, serie: [], noteLati: { 0: 'soglia', 3: 'falda sx', 4: 'muro' }, coloriAcc: [{ fpId: 1, descrizione: 'AV' }] }
  it('stesso numero di lati (quote, archi): scritte tenute', () => {
    const forma = { tipo: 'punti' as const, punti: g.forma.punti.map(p => ({ ...p, x: p.x * 1.1 })) }
    expect(graficoConForma(g, forma).noteLati).toEqual(g.noteLati)
  })
  it('forma con un altro numero di lati (Forme): scritte tolte, il resto resta', () => {
    const r = graficoConForma(g, { tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 2000 }, { x: 0, h: 2000 }] })
    expect(r.noteLati).toBeUndefined()
    expect(r.coloriAcc).toEqual(g.coloriAcc)
  })
})

describe('conNotaLato', () => {
  const g = { forma: rettangoloForma(), radice: { id: 'R', contenuto: { tipo: 'vuoto' as const } }, serie: [] }
  it('aggiunge, cambia e toglie la scritta di un lato', () => {
    const a = conNotaLato(g, 1, ' L MAG ')
    expect(a.noteLati).toEqual({ 1: 'L MAG' })
    expect(conNotaLato(a, 1, '').noteLati).toEqual({})
  })
})

function rettangoloForma() {
  return { tipo: 'punti' as const, punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 500 }, { x: 0, h: 500 }] }
}
