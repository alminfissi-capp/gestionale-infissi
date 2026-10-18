import { describe, expect, it } from 'vitest'
import { prezzoAccessorio } from './prezzo-accessorio'

const riga = (fp_id: number, serie: string, prezzo = 0, unita_vendita = 1) => ({ fp_id, codice: 'ACP 8020M', serie, prezzo, unita_vendita })
const costo = (accessorio_fp_id: number, colore_fp_id: number, prezzo: number, unita_vendita = 5) => ({ accessorio_fp_id, colore_fp_id, prezzo, unita_vendita })

describe('prezzoAccessorio', () => {
  it('prezzo generale quando non ci sono trattamenti', () => {
    expect(prezzoAccessorio([riga(1, 'S', 10, 2)], [], 'S', null)).toEqual({ prezzo: 10, unitaVendita: 2, avviso: null })
  })
  it('prezzo del colore accessori scelto', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 100), costo(1, 62, 200)], 'S', 62)
    expect(r).toEqual({ prezzo: 200, unitaVendita: 5, avviso: null })
  })
  it('senza colore: tutti i trattamenti costano uguale -> quel prezzo, nessun avviso', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 210.037), costo(1, 62, 210.037)], 'S', null)
    expect(r).toEqual({ prezzo: 210.037, unitaVendita: 5, avviso: null })
  })
  it('senza colore e prezzi diversi -> il piu alto con avviso', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 100), costo(1, 62, 200)], 'S', null)
    expect(r?.prezzo).toBe(200)
    expect(r?.avviso).toMatch(/colore accessori/i)
  })
  it('colore scelto che l accessorio non ha -> come senza colore', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 100), costo(1, 62, 200)], 'S', 999)
    expect(r?.prezzo).toBe(200)
    expect(r?.avviso).toMatch(/colore accessori/i)
  })
  it('preferisce la riga della serie, poi una con trattamenti, poi una con prezzo', () => {
    const righe = [riga(1, 'ALTRA', 5), riga(2, 'S')]
    expect(prezzoAccessorio(righe, [costo(2, 59, 50)], 'S', 59)?.prezzo).toBe(50)
    expect(prezzoAccessorio([riga(1, 'X'), riga(2, 'Y')], [costo(2, 59, 50)], 'S', 59)?.prezzo).toBe(50)
  })
  it('nessuna riga -> null; righe senza prezzo e senza trattamenti -> prezzo 0', () => {
    expect(prezzoAccessorio([], [], 'S', null)).toBeNull()
    expect(prezzoAccessorio([riga(1, 'S')], [], 'S', null)?.prezzo).toBe(0)
  })
})
