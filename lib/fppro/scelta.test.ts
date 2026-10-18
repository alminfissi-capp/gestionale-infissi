import { describe, expect, it } from 'vitest'
import { dimensionePagina, voceMostrata } from './scelta'

describe('voceMostrata (menu chiuso)', () => {
  const voci = [{ id: '1', testo: 'RAL 9010' }]
  it('valore nell\'elenco: quella voce', () => {
    expect(voceMostrata(voci, '1', null)).toEqual({ voce: voci[0], fuoriCatalogo: false })
  })
  it('valore salvato ma assente dall\'elenco: la riserva, segnata fuori catalogo (mai "Non indicato")', () => {
    expect(voceMostrata(voci, '7', { id: '7', testo: 'RAL 7016' })).toEqual({ voce: { id: '7', testo: 'RAL 7016' }, fuoriCatalogo: true })
  })
  it('valore assente e senza riserva: il codice salvato', () => {
    expect(voceMostrata(voci, 'TT8002', null)).toEqual({ voce: { id: 'TT8002', testo: 'TT8002' }, fuoriCatalogo: true })
  })
  it('nessun valore: nessuna voce', () => {
    expect(voceMostrata(voci, null, null)).toEqual({ voce: null, fuoriCatalogo: false })
  })
})

describe('dimensionePagina del catalogo', () => {
  it('miniature dei profili a pagine piccole (fino a ~37 KB l\'una), il resto a 200', () => {
    expect(dimensionePagina('fp_sezioni')).toBeLessThanOrEqual(50)
    expect(dimensionePagina('fp_strutture')).toBe(200)
  })
})
