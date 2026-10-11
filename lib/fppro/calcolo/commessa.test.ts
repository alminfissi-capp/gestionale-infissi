import { describe, expect, it } from 'vitest'
import { fattoreBarreCommessa } from './commessa'
import type { TagliProfilo } from './voce'

const taglio = (codice: string, lunghezze: number[], euroM = 10): TagliProfilo =>
  ({ codice, lunghezze, euroM, barra: 6500, testa: 30, coda: 30 })

describe('barre ottimizzate su tutta la commessa, come FP PRO', () => {
  it('3 pezzi da 2 m: da soli 3 barre, insieme 1 barra', () => {
    const r = fattoreBarreCommessa([{ quantita: 3, tagli: [taglio('PL6011', [2000])] }])
    expect(r.barre).toEqual([{ codice: 'PL6011', barre: 1 }])
    // costo barre / costo pezzi = 6,5 m / 6 m: lo "sfrido" che FP PRO salva nella commessa
    expect(r.fattore).toBeCloseTo(6.5 / 6, 10)
  })
  it('stesso profilo in voci diverse: tagliato dalle stesse barre', () => {
    const r = fattoreBarreCommessa([
      { quantita: 1, tagli: [taglio('PL6011', [3000])] },
      { quantita: 1, tagli: [taglio('PL6011', [3000])] },
    ])
    expect(r.barre).toEqual([{ codice: 'PL6011', barre: 1 }])
  })
  it('un fattore unico per la commessa, pesato sul costo dei pezzi', () => {
    const r = fattoreBarreCommessa([{ quantita: 1, tagli: [taglio('A', [6000], 10), taglio('B', [3250], 30)] }])
    // A: 6,5 m x 10 = 65 su 60; B: 6,5 m x 30 = 195 su 97,5
    expect(r.fattore).toBeCloseTo((65 + 195) / (60 + 97.5), 10)
  })
  it('commessa senza profili: fattore 1', () => {
    expect(fattoreBarreCommessa([]).fattore).toBe(1)
  })
})
