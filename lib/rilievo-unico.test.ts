import { describe, expect, it } from 'vitest'
import { aggiungiAccessorio, assegnazioniDaTenere, copiaVoceDisegnata, disegnoDellaVoce, eVoceDisegnata, eVoceFp, nuovaVoceDisegnata, vociDelRiepilogo } from './rilievo-unico'
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

describe('aggiungiAccessorio', () => {
  const a = { codice: 'ACP 8011', descrizione: 'Maniglia', serie: 'AL_SLIDE' }
  it('lista vuota: uno con quantita 1', () =>
    expect(aggiungiAccessorio([], a)).toEqual([{ codice: 'ACP 8011', descrizione: 'Maniglia', serie: 'AL_SLIDE', quantita: 1 }]))
  it('stesso codice e serie: quantita +1', () =>
    expect(aggiungiAccessorio(aggiungiAccessorio([], a), a)[0].quantita).toBe(2))
  it('stesso codice, serie diversa: due righe', () =>
    expect(aggiungiAccessorio(aggiungiAccessorio([], a), { ...a, serie: 'MEDISYSTEM' })).toHaveLength(2))
  it('descrizione e serie mancanti diventano testo vuoto', () =>
    expect(aggiungiAccessorio([], { codice: 'X', descrizione: null, serie: null })[0]).toEqual({ codice: 'X', descrizione: '', serie: '', quantita: 1 }))
})

describe('assegnazioniDaTenere: salvando il disegno valgono quelle nel dispositivo', () => {
  const ass = { profili: { T0: { fpId: 1, codice: 'UP1', descrizione: null } }, riempimenti: {} }
  it('nel dispositivo non ce ne sono: non si salva quella provvisoria dell editor', () =>
    expect(assegnazioniDaTenere({ assegnazioni: null, assegnazioniAt: null }, { assegnazioni: ass, assegnazioniAt: null })).toEqual({ assegnazioni: null, assegnazioniAt: null }))
  it('nel dispositivo ci sono: quelle', () =>
    expect(assegnazioniDaTenere({ assegnazioni: ass, assegnazioniAt: 't' }, { assegnazioni: null })).toEqual({ assegnazioni: ass, assegnazioniAt: 't' }))
  it('voce non ancora nel dispositivo: quelle della voce', () =>
    expect(assegnazioniDaTenere(undefined, { assegnazioni: ass, assegnazioniAt: 't' })).toEqual({ assegnazioni: ass, assegnazioniAt: 't' }))
})
