import { describe, expect, it } from 'vitest'
import { eseguiModello, valuta } from './prm'
import { MODELLI } from './modelli'
import { contornoForma, ingombro, latiDaPunti, misureModello, poligonoContorno } from './forma'
import { calcolaDisegno, posizioniTagli, taglia, zonaNelPunto } from './geometria'
import { aggiornaAnta, dividi, eliminaElemento, eliminaTaglio, griglia, mettiAnta, riempi, trovaZona, zoneFinali } from './modifiche'
import { mancanti, potaAssegnazioni, profiliAdatti, UTILIZZI_RUOLO } from './ruoli'
import { interpretaTraccia } from './traccia'
import type { Forma, Zona } from '@/types/rilievo-grafico'

const area = (p: { x: number; y: number }[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y }, 0) / 2
const rett = (L: number, H: number): Forma => ({ tipo: 'modello', modello: 'MODEL-00', misure: { L, H } })
const vetro = (id = 'z0'): Zona => ({ id, contenuto: { tipo: 'riempimento', materiale: 'vetro' } })

describe('espressioni FP PRO', () => {
  it('potenze, gradi, precedenze e meno unario', () => {
    expect(valuta('(4*H2**2 + L**2) / (8*H2)', { H2: 500, L: 2500 })).toBeCloseTo(1812.5, 6)
    expect(valuta('L* COS(30)', { L: 1000 })).toBeCloseTo(866.025, 2)
    expect(valuta('-(H-R)', { H: 10, R: 3 })).toBe(-7)
    expect(valuta('4*-H2*-H2', { H2: 2 })).toBe(16)
    expect(valuta('R1 < H2', { R1: 1, H2: 2 })).toBe(1)
    expect(valuta('AUTO=1', { AUTO: 1 })).toBe(1)
  })
})

describe('modelli di forma', () => {
  it('sono 29, tutti chiusi, in senso antiorario e con l\'angolo in 0,0', () => {
    expect(MODELLI).toHaveLength(29)
    for (const m of MODELLI) {
      const lati = contornoForma({ tipo: 'modello', modello: m.id, misure: {} })
      expect(lati.length, m.id).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < lati.length; i++) {
        const a = lati[i].a, b = lati[(i + 1) % lati.length].da
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${m.id} lato ${i}`).toBeLessThan(0.01)
      }
      const p = poligonoContorno(lati)
      expect(area(p), m.id).toBeGreaterThan(0)
      const box = ingombro(p)
      expect(box.minX, m.id).toBeCloseTo(0, 3)
      expect(box.minY, m.id).toBeCloseTo(0, 3)
    }
  })
  it('le misure decidono l\'ingombro come in FP PRO', () => {
    const box = (modello: string, misure: Record<string, number>) => ingombro(poligonoContorno(contornoForma({ tipo: 'modello', modello, misure })))
    expect(box('MODEL-01', { L: 1770, H1: 1940, H2: 2215 })).toMatchObject({ maxX: 1770, maxY: 2215 })
    const arco = box('MODEL-50', { L: 1550, H: 2680 })
    expect(arco.maxX).toBeCloseTo(1550, 0)
    expect(arco.maxY).toBeCloseTo(2680, 0)
    const ribassato = box('MODEL-54', { L: 2500, H1: 2300, H2: 500 })
    expect(ribassato.maxY).toBeCloseTo(2800, 0)
    const oblo = box('MODEL-52', { D: 900 })
    expect(oblo.maxX).toBeCloseTo(900, 0)
    expect(oblo.maxY).toBeCloseTo(900, 0)
    const ovale = box('MODEL-56', { L: 1200, H: 800 })
    expect(ovale.maxX).toBeCloseTo(1200, 0)
    expect(ovale.maxY).toBeCloseTo(800, 0)
    const meta = box('MODEL-68', { L: 1250, H1: 2300, H2: 500 })
    expect(meta.maxY).toBeCloseTo(2800, 0)
  })
  it('chiede solo le misure visibili (l\'arco a tre centri calcola da solo il raggio)', () => {
    expect(Object.keys(misureModello('MODEL-55'))).toEqual(['L', 'H1', 'H2'])
    expect(misureModello('MODEL-01', { H2: 2000 })).toEqual({ L: 1500, H1: 1200, H2: 2000 })
  })
  it('un modello con misure assurde non rompe il disegno', () => {
    expect(contornoForma({ tipo: 'modello', modello: 'MODEL-60', misure: { L: 1000, H2: 0 } })).toEqual([])
  })
  it('il rettangolo di FP PRO e\' 4 lati', () => {
    expect(eseguiModello(MODELLI[0].script, { L: 10, H: 20 }).lati).toHaveLength(4)
  })
})

describe('forma a punti', () => {
  it('lati dritti e lato ad arco dalla freccia (positiva = verso l\'esterno)', () => {
    const punti = [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 1500 }, { x: 0, h: 1500, freccia: 0 }]
    expect(latiDaPunti(punti).every(l => l.tipo === 'retta')).toBe(true)
    const conArco = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 1500, freccia: 200 }, { x: 0, h: 1500 }] })
    expect(ingombro(poligonoContorno(conArco)).maxY).toBeCloseTo(1700, 0)
    const rientro = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 1000, h: 0 }, { x: 1000, h: 1500, freccia: -200 }, { x: 0, h: 1500 }] })
    expect(ingombro(poligonoContorno(rientro)).maxY).toBeCloseTo(1500, 0)
  })
  it('stessa forma se i punti sono dati in senso orario', () => {
    // freccia sul lato che va da (0,1000) a (800,1000): quello in alto
    const a = contornoForma({ tipo: 'punti', punti: [{ x: 0, h: 0 }, { x: 0, h: 1000, freccia: 100 }, { x: 800, h: 1000 }, { x: 800, h: 0 }] })
    const box = ingombro(poligonoContorno(a))
    expect(box.maxY).toBeCloseTo(1100, 0)
    expect(box.maxX).toBeCloseTo(800, 0)
    expect(area(poligonoContorno(a))).toBeGreaterThan(0)
  })
})

describe('taglio delle zone', () => {
  it('taglia un rettangolo in due e segna il nuovo bordo', () => {
    const pol = { p: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }], b: ['a', 'b', 'c', 'd'].map(tag => ({ tag, copertura: 1 })) }
    const [s, d] = taglia(pol, 'x', 4, { tag: 'M', copertura: 0.5 })
    expect(s.p).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }])
    expect(s.b.map(b => b.tag)).toEqual(['a', 'M', 'c', 'd'])
    expect(d.b.map(b => b.tag)).toEqual(['a', 'b', 'c', 'M'])
  })
  it('posizioni dei tagli: uguali, da inizio, da fine', () => {
    expect(posizioniTagli({ modo: 'uguali' }, 3, 0, 900)).toEqual([300, 600])
    expect(posizioniTagli({ modo: 'quote', da: 'inizio', quote: [800] }, 2, 100, 1100)).toEqual([900])
    expect(posizioniTagli({ modo: 'quote', da: 'fine', quote: [200] }, 2, 0, 1000)).toEqual([800])
  })
})

describe('disegno calcolato', () => {
  it('rettangolo con vetro: 4 lati di telaio e 4 fermavetri', () => {
    const c = calcolaDisegno({ forma: rett(1000, 1200), radice: vetro() })
    expect(c.pezzi.filter(p => p.ruolo === 'telaio').map(p => p.nome).sort())
      .toEqual(['Telaio destro', 'Telaio inferiore', 'Telaio sinistro', 'Telaio superiore'])
    expect(c.pezzi.filter(p => p.ruolo === 'fermavetro')).toHaveLength(4)
    expect(c.larghezza).toBe(1000)
  })
  it('veranda inclinata: il montante a meta\' e\' alto quanto la forma in quel punto', () => {
    const forma: Forma = { tipo: 'modello', modello: 'MODEL-01', misure: { L: 1770, H1: 1940, H2: 2215 } }
    const radice = dividi(vetro('r'), 'r', 'montante', { modo: 'uguali' }, 2)
    const c = calcolaDisegno({ forma, radice })
    const m = c.pezzi.find(p => p.ruolo === 'montante')!
    expect(m.tratti[0][0].x).toBeCloseTo(885, 6)
    expect(m.lunghezza).toBeCloseTo((1940 + 2215) / 2, 6)
    expect(c.quote[0]).toMatchObject({ verso: 'montante', valore: 885, da: 'inizio' })
    expect(c.pezzi.find(p => p.nome === 'Telaio superiore (inclinato)')).toBeTruthy()
  })
  it('traverso a quota dal basso e anta a 2 ante con riporto', () => {
    let r = dividi(vetro('r'), 'r', 'traverso', { modo: 'quote', da: 'inizio', quote: [800] }, 2)
    const zone = zoneFinali(r)
    r = mettiAnta(r, zone[1], 'battente', 2, 'sx')
    const c = calcolaDisegno({ forma: rett(1200, 2000), radice: r })
    const t = c.pezzi.find(p => p.ruolo === 'traverso')!
    expect(t.tratti[0][0].y).toBe(800)
    expect(c.pezzi.filter(p => p.ruolo === 'anta')).toHaveLength(8)
    expect(c.pezzi.filter(p => p.ruolo === 'riporto')).toHaveLength(1)
    expect(c.ante).toHaveLength(2)
    // vetro sotto il traverso + un vetro per anta
    expect(c.zone.filter(z => z.foglia && z.materiale === 'vetro')).toHaveLength(3)
  })
  it('i pezzi hanno id stabili: ricalcolando lo stesso albero si ritrovano le assegnazioni', () => {
    const r = dividi(vetro('r'), 'r', 'montante', { modo: 'uguali' }, 3)
    const a = calcolaDisegno({ forma: rett(1500, 1000), radice: r }).pezzi.map(p => p.id)
    const b = calcolaDisegno({ forma: rett(1600, 1100), radice: r }).pezzi.map(p => p.id)
    expect(b).toEqual(a)
  })
  it('zona sotto il dito: la piu\' interna', () => {
    const r = mettiAnta(vetro('r'), 'r', 'battente', 1, 'dx')
    const c = calcolaDisegno({ forma: rett(1000, 1000), radice: r })
    const z = zonaNelPunto(c, { x: 500, y: 500 })!
    expect(z.profondita).toBe(1)
  })
  it('arco a tutto sesto con traverso all\'imposta: sopra resta la lunetta ad arco', () => {
    const forma: Forma = { tipo: 'modello', modello: 'MODEL-50', misure: { L: 1500, H: 2300 } }
    const r = dividi(vetro('r'), 'r', 'traverso', { modo: 'quote', da: 'inizio', quote: [1550] }, 2)
    const c = calcolaDisegno({ forma, radice: r })
    expect(c.pezzi.find(p => p.ruolo === 'traverso')!.lunghezza).toBeCloseTo(1500, 0)
    expect(c.pezzi.filter(p => p.ruolo === 'fermavetro').some(p => p.nome.includes('(arco)'))).toBe(true)
  })
})

describe('modifiche', () => {
  it('griglia 3 x 2 con montanti passanti', () => {
    const r = griglia(vetro('r'), 'r', 3, 2, 'montante')
    expect(zoneFinali(r)).toHaveLength(6)
    const c = calcolaDisegno({ forma: rett(1800, 1200), radice: r })
    expect(c.pezzi.filter(p => p.ruolo === 'montante')).toHaveLength(2)
    expect(c.pezzi.filter(p => p.ruolo === 'traverso')).toHaveLength(3)
  })
  it('eliminare una divisione rimette la zona intera col suo riempimento', () => {
    const r = dividi(riempi(vetro('r'), 'r', 'pannello'), 'r', 'montante', { modo: 'uguali' }, 2)
    const c = r.contenuto
    if (c.tipo !== 'divisione') throw new Error()
    expect(eliminaElemento(r, c.id)).toEqual({ id: 'r', contenuto: { tipo: 'riempimento', materiale: 'pannello' } })
  })
  it('togliere un taglio su tre parti lascia due parti', () => {
    const r = dividi(vetro('r'), 'r', 'montante', { modo: 'quote', da: 'inizio', quote: [300, 700] }, 3)
    const c = r.contenuto
    if (c.tipo !== 'divisione') throw new Error()
    const r2 = eliminaTaglio(r, c.id, 0, [300, 700])
    const c2 = r2.contenuto
    if (c2.tipo !== 'divisione') throw new Error()
    expect(c2.parti).toHaveLength(2)
    expect(c2.posizione).toEqual({ modo: 'quote', da: 'inizio', quote: [700] })
  })
  it('anta: cambiare il numero di ante tiene le esistenti', () => {
    const r = mettiAnta(vetro('r'), 'r', 'scorrevole', 2, null)
    const c = r.contenuto
    if (c.tipo !== 'anta') throw new Error()
    const r2 = aggiornaAnta(r, c.id, { numero: 3 })
    const c2 = trovaZona(r2, 'r')!.contenuto
    if (c2.tipo !== 'anta') throw new Error()
    expect(c2.ante).toHaveLength(3)
    expect(c2.ante[0].id).toBe(c.ante[0].id)
  })
})

describe('assegnazioni', () => {
  it('filtro per ruolo spegnibile e ricerca', () => {
    const p = [
      { fpId: 1, serieFpId: 1, codice: 'TT1642', descrizione: 'Telaio', utilizzi: [8050], anteprima: null },
      { fpId: 2, serieFpId: 1, codice: 'TT1618', descrizione: 'Anta', utilizzi: [8090], anteprima: null },
    ]
    expect(profiliAdatti(p, UTILIZZI_RUOLO.telaio, '').map(x => x.codice)).toEqual(['TT1642'])
    expect(profiliAdatti(p, null, '')).toHaveLength(2)
    expect(profiliAdatti(p, null, 'anta').map(x => x.codice)).toEqual(['TT1618'])
  })
  it('mancanti e pulizia delle assegnazioni orfane', () => {
    const c = calcolaDisegno({ forma: rett(1000, 1000), radice: vetro('z') })
    const profili = { T0: { fpId: 1, codice: 'A', descrizione: null }, vecchio: { fpId: 2, codice: 'B', descrizione: null } }
    const riemp = { z: { fpId: 3, codice: '4_12_4', descrizione: null, materiale: 'pannello' as const } }
    expect(mancanti(c, profili, {})).toEqual({ pezzi: 7, riempimenti: 1, vuote: 0 })
    const pulite = potaAssegnazioni(c, profili, riemp)
    expect(Object.keys(pulite.profili)).toEqual(['T0'])
    expect(pulite.riempimenti).toEqual({})
  })
})

describe('riga col dito', () => {
  const c = calcolaDisegno({ forma: rett(1000, 1000), radice: vetro('r') })
  const riga = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Array.from({ length: 11 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / 10 + (i % 2 ? 8 : -8), y: a.y + ((b.y - a.y) * i) / 10 }))
  it('riga storta quasi verticale vicino al centro = montante a meta\'', () => {
    expect(interpretaTraccia(c, riga({ x: 520, y: 50 }, { x: 490, y: 950 }))).toEqual({ zonaId: 'r', verso: 'montante', posizione: { modo: 'uguali' } })
  })
  it('riga orizzontale = traverso alla quota, arrotondata a 5 mm', () => {
    const t = interpretaTraccia(c, riga({ x: 50, y: 302 }, { x: 950, y: 302 }).map(p => ({ x: p.x, y: p.y })))
    expect(t?.verso).toBe('traverso')
    expect(t?.posizione).toEqual({ modo: 'quote', da: 'inizio', quote: [300] })
  })
  it('un tocco o una riga corta non fanno niente', () => {
    expect(interpretaTraccia(c, [{ x: 500, y: 500 }, { x: 505, y: 503 }])).toBeNull()
    expect(interpretaTraccia(c, riga({ x: 300, y: 400 }, { x: 300, y: 600 }))).toBeNull()
  })
})
