import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from '@/lib/fppro/strutture-xml'
import { nuovaVoceFp } from '@/lib/fppro/rilievo-fp'
import { nuovaVoceDisegnata } from '@/lib/rilievo-unico'
import { dividi } from '@/lib/rilievo-grafico/modifiche'
import { calcolaDisegno } from '@/lib/rilievo-grafico/geometria'
import { RIGHE, dettagliVoceDisegnata, dettagliVoceFp } from './dettagli-costruttivi'
import type { VoceFpDati, VoceFpVera } from '@/types/rilievo-fp'

const ekos = { ...strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, 'fppro', '__fixtures__', 'ekos-2-ante.str.xml'))),
)), id: 'S1', percorso: 'EKOS/F2A.STR', nome: '04B-ES-F2A', descrizione: 'Finestra 2 ante' }

const voce = (patch: Partial<VoceFpDati> = {}): VoceFpVera => ({
  id: 'v1', rilievoId: 'r1', ordine: 0, posizione: 'Cucina', quantita: 2, note: '',
  fp: { ...nuovaVoceFp(ekos, 'Ekos_66th'), larghezza: 1000, altezza: 1240, ...patch },
  aggiornatoAt: '2026-11-09T10:00:00.000Z',
})

describe('RIGHE', () => {
  it('sempre le stesse 9, in ordine', () =>
    expect(RIGHE).toEqual(['Telaio', 'Anta', 'Riporto', 'Montanti', 'Traversi', 'Fermavetro', 'Vetri', 'Accessori', 'Colori']))
})

describe('dettagliVoceFp', () => {
  it('codici dalla struttura, righe senza contenuto vuote', () => {
    const d = dettagliVoceFp(voce(), ekos)
    expect(d.righe.Telaio).toBe('ES24500170')
    expect(d.righe.Anta).toBe('ES24500319')
    expect(d.righe.Riporto).toBe('ES24500506')
    expect(d.righe.Montanti).toBeNull()
    expect(d.righe.Traversi).toBeNull()
    expect(d.righe.Fermavetro).toBeNull()
    expect(d.mqPezzo).toBeCloseTo(1.24, 5)
    expect(d.titolo).toContain('04B-ES-F2A')
  })
  it('telaio cambiato su un lato e anta cambiata: vincono le scelte della voce', () => {
    const d = dettagliVoceFp(voce({ telai: { sinistra: 'ES24500170', alto: 'ES24500170', destra: 'ES24500170', basso: 'ES99' }, anta: 'ES777' }), ekos)
    expect(d.righe.Telaio).toBe('sx ES24500170 · alto ES24500170 · dx ES24500170 · basso ES99')
    expect(d.righe.Anta).toBe('ES777')
  })
  it('colori: unico, bicolore, accessori', () => {
    const b = { fpId: 1, descrizione: 'RAL 9010' }, n = { fpId: 2, descrizione: 'Noce' }
    expect(dettagliVoceFp(voce({ coloreInt: b, coloreEst: b }), ekos).righe.Colori).toBe('RAL 9010')
    expect(dettagliVoceFp(voce({ coloreInt: b, coloreEst: n, coloriAcc: [{ fpId: 3, descrizione: 'AV' }] }), ekos).righe.Colori).toBe('int. RAL 9010 · est. Noce · acc. AV')
  })
  it('struttura non nel dispositivo: telai e anta dalla voce, il resto vuoto', () => {
    const d = dettagliVoceFp(voce({ anta: 'ES777' }), null)
    expect(d.righe.Anta).toBe('ES777')
    expect(d.righe.Riporto).toBeNull()
  })
})

describe('dettagliVoceDisegnata', () => {
  const base = () => nuovaVoceDisegnata('r', 0, '2026-11-09T10:00:00Z')
  it('profili non assegnati: da assegnare; mq dall ingombro', () => {
    const d = dettagliVoceDisegnata(base(), new Map())
    expect(d.righe.Telaio).toBe('da assegnare')
    expect(d.mqPezzo).toBeCloseTo(1.68, 5)
    expect(d.larghezza).toBe(1200)
  })
  it('telaio e montante assegnati, riempimento con vetro', () => {
    const v = base()
    v.grafico = { ...v.grafico, radice: dividi(v.grafico.radice, v.grafico.radice.id, 'montante', { modo: 'uguali' }, 2) }
    const calc = calcolaDisegno(v.grafico)
    const profili: Record<string, { fpId: number; codice: string; descrizione: null }> = {}
    for (const p of calc.pezzi) if (p.ruolo === 'telaio') profili[p.id] = { fpId: 1, codice: 'UP61833', descrizione: null }
    const m = calc.pezzi.find(p => p.ruolo === 'montante')!
    profili[m.id] = { fpId: 2, codice: 'UP61840', descrizione: null }
    const zone = calc.zone.filter(z => z.foglia && z.materiale)
    const riempimenti = Object.fromEntries(zone.map(z => [z.id, { fpId: 9, codice: '33.1_16_4', descrizione: null }]))
    const d = dettagliVoceDisegnata({ ...v, assegnazioni: { profili, riempimenti } }, new Map())
    expect(d.righe.Telaio).toBe('UP61833')
    expect(d.righe.Montanti).toBe('UP61840 (1)')
    expect(d.righe.Vetri).toBe('33.1_16_4')
    expect(d.righe.Traversi).toBeNull()
  })
})
