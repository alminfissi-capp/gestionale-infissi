import { describe, expect, it } from 'vitest'
import { prezzoAccessorio } from './prezzo-accessorio'

const riga = (fp_id: number, serie: string, prezzo = 0, unita_vendita = 1) => ({ fp_id, codice: 'ACP 8020M', serie, prezzo, unita_vendita })
const costo = (accessorio_fp_id: number, colore_fp_id: number, prezzo: number, unita_vendita = 5) => ({ accessorio_fp_id, colore_fp_id, prezzo, unita_vendita })
const AV = 63, NO = 59, INOX = 9, C9010 = 62

describe('prezzoAccessorio', () => {
  it('prezzo generale quando non ci sono trattamenti', () => {
    expect(prezzoAccessorio([riga(1, 'S', 10, 2)], [], 'S', [])).toEqual({ prezzo: 10, unitaVendita: 2, avviso: null })
  })
  it('primo colore dell\'elenco che l\'accessorio ha (commessa 170: AV poi NO)', () => {
    // ACP 8022: esiste in AV -> AV
    expect(prezzoAccessorio([riga(1, 'S')], [costo(1, C9010, 194.359), costo(1, AV, 194.063), costo(1, NO, 194.063)], 'S', [AV, NO])?.prezzo).toBe(194.063)
    // ACP 8020M: non esiste in AV -> NO
    expect(prezzoAccessorio([riga(1, 'S')], [costo(1, NO, 210.037), costo(1, C9010, 300)], 'S', [AV, NO])).toEqual({ prezzo: 210.037, unitaVendita: 5, avviso: null })
  })
  it('nessun colore dell\'elenco: il prezzo generale se c\'e\' (ACP 8028)', () => {
    expect(prezzoAccessorio([riga(1, 'S', 22.23, 100)], [costo(1, C9010, 22.23, 100)], 'S', [AV, NO])).toEqual({ prezzo: 22.23, unitaVendita: 100, avviso: null })
  })
  it('nessun colore dell\'elenco e prezzo generale 0: il piu alto, con avviso che nomina i colori scelti', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, NO, 100), costo(1, C9010, 200)], 'S', [INOX], ['INOX'])
    expect(r?.prezzo).toBe(200)
    expect(r?.avviso).toMatch(/INOX/)
  })
  it('elenco vuoto: tutti i trattamenti uguali -> quel prezzo senza avviso; diversi -> il piu alto con avviso', () => {
    expect(prezzoAccessorio([riga(1, 'S')], [costo(1, NO, 210.037), costo(1, C9010, 210.037)], 'S', [])).toEqual({ prezzo: 210.037, unitaVendita: 5, avviso: null })
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, NO, 100), costo(1, C9010, 200)], 'S', [])
    expect(r?.prezzo).toBe(200)
    expect(r?.avviso).toMatch(/colore accessori/i)
  })
  it('preferisce la riga della serie, poi una con trattamenti, poi una con prezzo', () => {
    expect(prezzoAccessorio([riga(1, 'ALTRA', 5), riga(2, 'S')], [costo(2, NO, 50)], 'S', [NO])?.prezzo).toBe(50)
    expect(prezzoAccessorio([riga(1, 'X'), riga(2, 'Y')], [costo(2, NO, 50)], 'S', [NO])?.prezzo).toBe(50)
  })
  it('nessuna riga -> null; righe senza prezzo e senza trattamenti -> prezzo 0', () => {
    expect(prezzoAccessorio([], [], 'S', [])).toBeNull()
    expect(prezzoAccessorio([riga(1, 'S')], [], 'S', [])?.prezzo).toBe(0)
  })
})
