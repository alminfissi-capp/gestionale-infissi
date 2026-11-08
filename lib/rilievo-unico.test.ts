import { describe, expect, it } from 'vitest'
import { disegnoDellaVoce, eVoceDisegnata, eVoceFp, vociDelRiepilogo } from './rilievo-unico'
import type { VoceFp } from '@/types/rilievo-fp'

const base = { id: 'v', rilievoId: 'r', ordine: 0, posizione: '', quantita: 1, note: '', aggiornatoAt: '2026-11-08T10:00:00Z' }
const grafico = { forma: { tipo: 'punti' as const, punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 1000 }, { x: 0, h: 1000 }] }, radice: { id: 'R', contenuto: { tipo: 'vuoto' as const } }, serie: [5] }
const disegnata = { ...base, fp: null, grafico } as VoceFp
const fpVoce = { ...base, fp: { nome: 'X' } } as unknown as VoceFp

describe('tipo di voce', () => {
  it('disegnata: fp nullo e grafico', () => {
    expect(eVoceDisegnata(disegnata)).toBe(true)
    expect(eVoceFp(disegnata)).toBe(false)
  })
  it('da struttura FP PRO', () => {
    expect(eVoceDisegnata(fpVoce)).toBe(false)
    expect(eVoceFp(fpVoce)).toBe(true)
  })
})

describe('disegnoDellaVoce', () => {
  it('senza assegnazioni: profili e riempimenti vuoti', () => {
    if (!eVoceDisegnata(disegnata)) throw new Error()
    expect(disegnoDellaVoce(disegnata)).toEqual({ ...grafico, profili: {}, riempimenti: {} })
  })
  it('con le assegnazioni dell ufficio', () => {
    const profili = { T0: { fpId: 1, codice: 'UP61833', descrizione: null } }
    const v = { ...disegnata, assegnazioni: { profili, riempimenti: {} } }
    if (!eVoceDisegnata(v)) throw new Error()
    expect(disegnoDellaVoce(v).profili).toEqual(profili)
    expect(disegnoDellaVoce(v).forma).toEqual(grafico.forma)
  })
})

describe('vociDelRiepilogo', () => {
  it('voci FP nel loro ordine, e quante disegnate', () => {
    const a = { ...fpVoce, id: 'a' }, b = { ...disegnata, id: 'b' }, c = { ...fpVoce, id: 'c' }
    const r = vociDelRiepilogo([a, b, c])
    expect(r.fp.map(v => v.id)).toEqual(['a', 'c'])
    expect(r.disegnate).toBe(1)
  })
})
