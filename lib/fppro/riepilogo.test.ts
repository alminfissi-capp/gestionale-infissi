import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from './strutture-xml'
import { kitOpzionali, nuovaVoceFp } from './rilievo-fp'
import { datiRiepilogo, formatMq, statoPrezzo } from './riepilogo'
import type { VoceFp } from '@/types/rilievo-fp'

const leggi = (nome: string) => strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '__fixtures__', nome))),
))
const ekos = { ...leggi('ekos-2-ante.str.xml'), id: 'S1', percorso: 'EKOS/F2A.STR', nome: '04B-ES-F2A', descrizione: 'Finestra 2 ante' }
const al50 = { ...leggi('al50plus-monoblocco.str.xml'), id: 'S2', percorso: 'AL50/MONO.STR', nome: 'MONO', descrizione: null }

const voce = (patch: Partial<VoceFp['fp']> = {}, altro: Partial<VoceFp> = {}): VoceFp => ({
  id: 'v1', rilievoId: 'r1', ordine: 0, posizione: 'C.da letto', quantita: 2, note: 'davanzale in marmo',
  fp: { ...nuovaVoceFp(ekos, 'Ekos_66th'), larghezza: 1000, altezza: 1240, ...patch },
  aggiornatoAt: '2026-10-18T10:00:00.000Z', ...altro,
})

describe('formatMq', () => {
  it('due decimali con la virgola', () => expect(formatMq(2.48)).toBe('2,48'))
})

describe('datiRiepilogo', () => {
  it('mq totali = L x H x quantita (come il modello: 1,00 x 1,24 x 2 = 2,48)', () => {
    expect(datiRiepilogo(voce(), ekos).mq).toBeCloseTo(2.48, 6)
  })
  it('misure mancanti: niente mq', () => {
    expect(datiRiepilogo(voce({ larghezza: null }), ekos).mq).toBeNull()
  })
  it('tipo = descrizione della struttura, altrimenti il nome', () => {
    expect(datiRiepilogo(voce(), ekos).tipo).toBe('Finestra 2 ante')
    expect(datiRiepilogo(voce(), al50).tipo).toBe('MONO')
    expect(datiRiepilogo(voce(), null).tipo).toBe(voce().fp.nome)
  })
  it('finiture e colore accessori; vuoti se non scelti', () => {
    const d = datiRiepilogo(voce({ coloreEst: { fpId: 1, descrizione: 'RAL 9010' }, coloreAcc: { fpId: 62, descrizione: '9010' } }), ekos)
    expect(d.finituraEst).toBe('RAL 9010')
    expect(d.finituraInt).toBeNull()
    expect(d.coloreAcc).toBe('9010')
  })
  it('vetri: quelli scelti, altrimenti quelli della struttura, senza doppioni', () => {
    expect(datiRiepilogo(voce(), ekos).vetri).toBe('4_15_33.1_S+G')
    expect(datiRiepilogo(voce({ vetri: { '3': { fpId: 5, codice: '33.1-12-4' } } }), ekos).vetri).toBe('33.1-12-4, 4_15_33.1_S+G')
  })
  it('profili cambiati rispetto alla struttura (telai per lato e anta)', () => {
    expect(datiRiepilogo(voce(), ekos).profili).toBeNull()
    expect(datiRiepilogo(voce({ telai: { basso: 'TT8011' }, anta: 'ES2468' }), ekos).profili).toBe('Telaio inferiore TT8011 · Anta ES2468')
  })
  it('mano di apertura', () => {
    expect(datiRiepilogo(voce({ mano: 'sx' }), ekos).mano).toBe('Apertura sinistra')
    expect(datiRiepilogo(voce({ mano: null }), ekos).mano).toBeNull()
  })
  it('accessori opzionali scelti (scelta della voce, altrimenti quella di FP PRO)', () => {
    const k = kitOpzionali(al50.albero)
    const non = k.find(x => !x.predefinito)!
    const d = datiRiepilogo(voce({ kit: { [non.chiave]: true } }), al50)
    expect(d.accessori).toContain(non.descrizione || non.codice)
    for (const x of k.filter(y => y.predefinito)) expect(d.accessori).toContain(x.descrizione || x.codice)
  })
  it('note telaio per lato e note della voce', () => {
    const d = datiRiepilogo(voce({ noteTelaio: { alto: 'cassonetto', destra: ' ' } }), ekos)
    expect(d.noteTelaio).toEqual({ alto: 'cassonetto' })
    expect(d.note).toBe('davanzale in marmo')
  })
})

describe('statoPrezzo', () => {
  const calcolo = '2026-10-18T12:00:00.000Z'
  it('voce non calcolata: nessun prezzo', () => expect(statoPrezzo(undefined, '2026-10-18T10:00:00.000Z', calcolo)).toEqual({ tipo: 'assente' }))
  it('voce calcolata e non modificata dopo: prezzo', () => {
    expect(statoPrezzo({ unitario: 580.01, superata: false }, '2026-10-18T10:00:00.000Z', calcolo)).toEqual({ tipo: 'prezzo', unitario: 580.01 })
  })
  it('voce modificata nel dispositivo dopo il calcolo: da ricalcolare', () => {
    expect(statoPrezzo({ unitario: 580.01, superata: false }, '2026-10-18T13:00:00.000Z', calcolo)).toEqual({ tipo: 'da_ricalcolare' })
  })
  it('voce superata sul server (corretta in ufficio, cambiata da un altro telefono): da ricalcolare', () => {
    expect(statoPrezzo({ unitario: 580.01, superata: true }, '2026-10-18T10:00:00.000Z', calcolo)).toEqual({ tipo: 'da_ricalcolare' })
  })
})
