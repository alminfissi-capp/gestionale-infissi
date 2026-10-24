import { describe, expect, it } from 'vitest'
import { campiMinuti, oreDaMinuti, tempiConMinuti } from './correzioni'

const attuali = { taglio: 0, lavorazione: 4, montaggio: 0, assemblaggio: 0, posa: 0 }

describe('minuti nel pannello Correggi', () => {
  it('i campi partono dai minuti che il calcolo usa davvero (le 4 h della struttura = 240 min)', () => {
    expect(campiMinuti(attuali)).toEqual({ taglio: '0', lavorazione: '240', montaggio: '0', assemblaggio: '0', posa: '0' })
  })
  it('caso Palazzotto: lavorazione 240 -> 150 min e posa 60 sostituiscono, non si sommano', () => {
    const campi = { ...campiMinuti(attuali), lavorazione: '150', posa: '60' }
    expect(oreDaMinuti(campi, attuali, {})).toEqual({ lavorazione: 2.5, posa: 1 })
  })
  it('campo svuotato = 0 minuti', () => {
    expect(oreDaMinuti({ ...campiMinuti(attuali), lavorazione: '' }, attuali, {})).toEqual({ lavorazione: 0 })
  })
  it('minuti non toccati: nessuna correzione (restano quelli della struttura)', () => {
    expect(oreDaMinuti(campiMinuti(attuali), attuali, {})).toEqual({})
  })
  it('ore della struttura non intere in minuti (0,3333 h): mostrate arrotondate, non diventano una correzione', () => {
    const strane = { ...attuali, taglio: 0.3333 }
    expect(campiMinuti(strane).taglio).toBe('20')
    expect(oreDaMinuti(campiMinuti(strane), strane, {})).toEqual({})
  })
  it('una correzione gia\' salvata resta anche se il valore non cambia', () => {
    const conCorrezione = { ...attuali, assemblaggio: 2.5 }
    expect(oreDaMinuti(campiMinuti(conCorrezione), conCorrezione, { assemblaggio: 2.5 })).toEqual({ assemblaggio: 2.5 })
  })
  it('testo non numerico o negativo: il valore attuale', () => {
    expect(oreDaMinuti({ ...campiMinuti(attuali), lavorazione: 'abc' }, attuali, {})).toEqual({})
    expect(oreDaMinuti({ ...campiMinuti(attuali), lavorazione: '-5' }, attuali, {})).toEqual({})
  })
  it('decimali con la virgola: 90,5 min', () => {
    expect(oreDaMinuti({ ...campiMinuti(attuali), posa: '90,5' }, attuali, {}).posa).toBeCloseTo(90.5 / 60, 9)
  })
})

describe('tempiConMinuti (minuti scritti in cantiere)', () => {
  const tempi = { taglio: 0.5, lavorazione: 1, montaggio: 0, assemblaggio: 0, posa: 2 }
  it('il minuto scritto sostituisce la struttura, il resto resta', () => {
    expect(tempiConMinuti(tempi, { lavorazione: 90, posa: 0 })).toEqual({ ...tempi, lavorazione: 1.5, posa: 0 })
  })
  it('niente minuti o valori non validi: la struttura', () => {
    expect(tempiConMinuti(tempi, undefined)).toEqual(tempi)
    expect(tempiConMinuti(tempi, { taglio: -3, montaggio: Number.NaN })).toEqual(tempi)
  })
})
