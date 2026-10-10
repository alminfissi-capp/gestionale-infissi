import { describe, expect, it } from 'vitest'
import {
  prezzoUnitarioAccessorio, pulisciRicerca, rigaAccessorio, rigaColore, rigaProfilo, rigaVetro,
} from './catalogo'

describe('pulisciRicerca', () => {
  it('toglie i caratteri che romperebbero il filtro or() di PostgREST', () => {
    expect(pulisciRicerca('  ACP, 8012 (nero) ')).toBe('ACP 8012 nero')
    expect(pulisciRicerca('50%_x*')).toBe('50 x')
  })
})

describe('prezzoUnitarioAccessorio', () => {
  it('prezzo di confezione diviso unita\' di vendita (verificato su FP PRO: 432/400 = 1,08)', () =>
    expect(prezzoUnitarioAccessorio(432, 400)).toBeCloseTo(1.08))
  it('senza unita\' di vendita il prezzo e\' gia\' al pezzo', () =>
    expect(prezzoUnitarioAccessorio(7.5, 0)).toBe(7.5))
  it('prezzo zero o assente = manca', () => {
    expect(prezzoUnitarioAccessorio(0, 50)).toBeNull()
    expect(prezzoUnitarioAccessorio(null, 50)).toBeNull()
  })
})

describe('righe del catalogo', () => {
  it('profilo con prezzi per colore', () => {
    const r = rigaProfilo(
      { id: 'p1', codice: 'TT8002', descrizione: 'Telaio', kg_ml: 2.148, serie_fp_id: 12 },
      'AL_SLIDE',
      [{ costo_kg: 9.44, costo_ml: 0 }, { costo_kg: 9.95, costo_ml: 0 }, { costo_kg: 0, costo_ml: 0 }],
    )
    expect(r).toEqual({
      id: 'p1', codice: 'TT8002', descrizione: 'Telaio', serie: 'AL_SLIDE',
      dettaglio: '2,148 kg/m', prezzo: '9,44 – 9,95 €/kg (2 colori)', senzaPrezzo: false,
    })
  })
  it('profilo senza nessun prezzo', () => {
    const r = rigaProfilo({ id: 'p2', codice: 'X', descrizione: null, kg_ml: null, serie_fp_id: null }, null, [])
    expect(r.prezzo).toBe('manca')
    expect(r.senzaPrezzo).toBe(true)
    expect(r.serie).toBe('—')
  })
  it('accessorio', () => {
    const r = rigaAccessorio({ id: 'a1', codice: 'AGP 4085', descrizione: 'Angolo', serie: 'AL_SISTEM', prezzo: 432, unita_vendita: 400 })
    expect(r.prezzo).toBe('1,08 € al pezzo')
    expect(r.dettaglio).toBe('432,00 € ogni 400 pz')
  })
  it('vetro senza prezzo', () => {
    const r = rigaVetro({ id: 'v1', codice: '33.1SAT_15_4', descrizione: null, prezzo_mq: 0, min_fatt: 0.5, spessore: 26 })
    expect(r).toMatchObject({ prezzo: 'manca', senzaPrezzo: true, dettaglio: 'sp. 26 mm · min. 0,5 m²' })
  })
  it('colore', () => {
    const r = rigaColore({ id: 'c1', descrizione: '19 - RAL 9010C2 CLAS', costo_kg: 1.22, per_profili: true, per_accessori: false, per_vetri: false })
    expect(r).toMatchObject({ codice: '', descrizione: '19 - RAL 9010C2 CLAS', dettaglio: 'profili', prezzo: '+1,22 €/kg' })
  })
})
