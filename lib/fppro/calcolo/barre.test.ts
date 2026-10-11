import { describe, expect, it } from 'vitest'
import { ottimizzaBarre } from './barre'

describe('ottimizzaBarre', () => {
  it('telaio 1900 x 2350: due barre da 6500', () => {
    expect(ottimizzaBarre([2350, 2350, 1900, 1900], 6500, 30, 30).barre).toEqual([6500, 6500])
  })
  it('scarti di testa/coda e lama contano: 2300+2300+950+950 non sta in una barra', () => {
    expect(ottimizzaBarre([2300, 2300, 950, 950, 2300, 2300, 950, 950], 6500, 30, 30).barre).toHaveLength(3)
  })
  it('anche un pezzo corto costa una barra intera', () => {
    expect(ottimizzaBarre([895], 6500, 30, 30).barre).toEqual([6500])
  })
  it('pezzo piu\' lungo della barra: barra su misura, nessun ciclo infinito', () => {
    expect(ottimizzaBarre([7000], 6500, 30, 30).barre).toEqual([7060])
  })
  it('nessun pezzo: nessuna barra', () => {
    expect(ottimizzaBarre([], 6500, 30, 30)).toEqual({ barre: [], lunghezzaTotale: 0 })
  })
})
