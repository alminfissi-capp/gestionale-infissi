import { describe, expect, it } from 'vitest'
import { datiRiepilogoDisegnata } from './riepilogo-disegnata'
import { nuovaVoceDisegnata } from '@/lib/rilievo-unico'
import type { VoceDisegnata } from '@/types/rilievo-fp'

const base = (): VoceDisegnata => ({ ...nuovaVoceDisegnata('r', 0, '2026-11-09T10:00:00Z'), quantita: 2 })
const bianco = { fpId: 56, descrizione: 'RAL 9010' }
const noce = { fpId: 70, descrizione: 'Noce' }

describe('datiRiepilogoDisegnata', () => {
  it('rettangolo 1200 x 1400, 2 pezzi: 3,36 mq', () => {
    const d = datiRiepilogoDisegnata(base(), new Map())
    expect(d.larghezza).toBe(1200)
    expect(d.altezza).toBe(1400)
    expect(d.mq).toBeCloseTo(3.36, 5)
    expect(d.tipo).toContain('4 lati')
  })
  it('casetta: 5 lati', () => {
    const v = base()
    v.grafico = { ...v.grafico, forma: { tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 1400 }, { x: 600, h: 2000 }, { x: 0, h: 1400 }] } }
    expect(datiRiepilogoDisegnata(v, new Map()).tipo).toContain('5 lati')
  })
  it('con un arco lo dice', () => {
    const v = base()
    v.grafico = { ...v.grafico, forma: { tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 1400, freccia: 300 }, { x: 0, h: 1400 }] } }
    expect(datiRiepilogoDisegnata(v, new Map()).tipo).toContain('arco')
  })
  it('colore unico: stesso dentro e fuori; bicolore: i due', () => {
    const v = base()
    v.grafico = { ...v.grafico, coloreInt: bianco, coloreEst: bianco }
    expect(datiRiepilogoDisegnata(v, new Map())).toMatchObject({ finituraInt: 'RAL 9010', finituraEst: 'RAL 9010' })
    v.grafico = { ...v.grafico, coloreInt: bianco, coloreEst: noce }
    expect(datiRiepilogoDisegnata(v, new Map())).toMatchObject({ finituraInt: 'RAL 9010', finituraEst: 'Noce' })
  })
  it('colori accessori in ordine, accessori con quantita, serie dai nomi', () => {
    const v = base()
    v.grafico = {
      ...v.grafico, serie: [5, 9], coloriAcc: [{ fpId: 63, descrizione: 'AV' }, { fpId: 64, descrizione: 'NO' }],
      accessoriAggiunti: [{ codice: 'ACP 8011', descrizione: 'Maniglia', serie: 'X', quantita: 2 }, { codice: 'ACP 1', descrizione: '', serie: 'X', quantita: 1 }],
    }
    const d = datiRiepilogoDisegnata(v, new Map([[5, 'AL_62UP'], [9, 'AL_COM']]))
    expect(d.coloreAcc).toBe('AV / NO')
    expect(d.accessori).toBe('2 x Maniglia, ACP 1')
    expect(d.serie).toBe('AL_62UP, AL_COM')
  })
  it('senza dati: campi vuoti, note dalla voce', () => {
    const d = datiRiepilogoDisegnata({ ...base(), note: 'Davanzale' }, new Map())
    expect(d).toMatchObject({ serie: null, finituraEst: null, finituraInt: null, coloreAcc: null, accessori: null, note: 'Davanzale' })
  })
})
