import { describe, expect, it } from 'vitest'
import { campiOre, oreDaSalvare } from './correzioni'

const attuali = { taglio: 0, lavorazione: 4, montaggio: 0, assemblaggio: 0, posa: 0 }

describe('ore nel pannello Correggi', () => {
  it('i campi partono dalle ore che il calcolo usa davvero (le 4 h della struttura si vedono)', () => {
    expect(campiOre(attuali)).toEqual({ taglio: '0', lavorazione: '4', montaggio: '0', assemblaggio: '0', posa: '0' })
  })
  it('caso Palazzotto: lavorazione 4 -> 2,5 e posa 1 sostituiscono, non si sommano', () => {
    const campi = { ...campiOre(attuali), lavorazione: '2,5', posa: '1' }
    expect(oreDaSalvare(campi, attuali, {})).toEqual({ lavorazione: 2.5, posa: 1 })
  })
  it('campo svuotato = 0 ore', () => {
    expect(oreDaSalvare({ ...campiOre(attuali), lavorazione: '' }, attuali, {})).toEqual({ lavorazione: 0 })
  })
  it('ore non toccate: nessuna correzione (restano quelle della struttura)', () => {
    expect(oreDaSalvare(campiOre(attuali), attuali, {})).toEqual({})
  })
  it('una correzione gia\' salvata resta anche se il valore non cambia', () => {
    const conCorrezione = { ...attuali, assemblaggio: 2.5 }
    expect(oreDaSalvare(campiOre(conCorrezione), conCorrezione, { assemblaggio: 2.5 })).toEqual({ assemblaggio: 2.5 })
  })
  it('testo non numerico: il valore attuale', () => {
    expect(oreDaSalvare({ ...campiOre(attuali), lavorazione: 'abc' }, attuali, {})).toEqual({})
  })
})
