import { describe, expect, it } from 'vitest'
import { copiaVoceDisegnata, disegnoDellaVoce, eVoceDisegnata, eVoceFp, nuovaVoceDisegnata, vociDelRiepilogo } from './rilievo-unico'
import type { VoceFp } from '@/types/rilievo-fp'
import { radiceIniziale } from '@/lib/rilievo-grafico/modifiche'

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

describe('nuova voce disegnata e copia', () => {
  const ora = '2026-11-08T12:00:00.000Z'
  it('nuova: forma a punti 1200 x 1400, telaio come nell editor di oggi, niente FP', () => {
    const v = nuovaVoceDisegnata('r', 3, ora)
    expect(v.fp).toBeNull()
    expect(v.rilievoId).toBe('r')
    expect(v.ordine).toBe(3)
    expect(v.quantita).toBe(1)
    expect(v.aggiornatoAt).toBe(ora)
    expect(v.grafico.forma.tipo).toBe('punti')
    if (v.grafico.forma.tipo !== 'punti') throw new Error()
    expect(Math.max(...v.grafico.forma.punti.map(p => p.x))).toBe(1200)
    expect(Math.max(...v.grafico.forma.punti.map(p => p.h))).toBe(1400)
    expect(v.grafico.radice.contenuto).toEqual(radiceIniziale().contenuto)
  })
  it('copia: id e ordine nuovi, stesso disegno e stesse assegnazioni (copie, non gli stessi oggetti)', () => {
    if (!eVoceDisegnata(disegnata)) throw new Error()
    const ass = { profili: { T0: { fpId: 1, codice: 'UP61833', descrizione: null } }, riempimenti: {} }
    const orig = { ...disegnata, posizione: 'Cucina', assegnazioni: ass, assegnazioniAt: '2026-11-08T11:00:00Z' }
    const c = copiaVoceDisegnata(orig, 7, ora, 'nuovo')
    expect(c.id).toBe('nuovo')
    expect(c.ordine).toBe(7)
    expect(c.posizione).toBe('Cucina')
    expect(c.grafico).toEqual(orig.grafico)
    expect(c.grafico).not.toBe(orig.grafico)
    expect(c.assegnazioni).toEqual(ass)
    expect(c.assegnazioniAt).toBe('2026-11-08T11:00:00Z')
    expect(c.aggiornatoAt).toBe(ora)
  })
})
