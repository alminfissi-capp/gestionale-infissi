import { describe, expect, it } from 'vitest'
import { datiFissaggi, fissaggiStruttura, type PezzoFissaggi } from './fissaggi'
import type { GiuntoPezzo } from '../strutture-xml'

// Telaio UP61802 della serie 14 (PLANET 62): filtri con ordine 1, 2, 4 (dati veri di FP PRO, ridotti).
const fissaggi = [
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5008', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'A1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5801M', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'A1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5504', serie_fp_id: 14, quantita: 1, dim_rif: 2, filtro: 'A1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 50153', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'B1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5800', serie_fp_id: 14, quantita: 2, dim_rif: 1, filtro: 'C2' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5002', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'D4' },
]
const serie = [
  { serie_fp_id: 14, ordine: 1, filtro: 'A1' }, { serie_fp_id: 14, ordine: 1, filtro: 'B1' },
  { serie_fp_id: 14, ordine: 2, filtro: 'C2' }, { serie_fp_id: 14, ordine: 4, filtro: 'D4' },
]
const dati = datiFissaggi(fissaggi, serie)

const g = (chiave: string, filtri: string[], angolo = 90): GiuntoPezzo => ({ chiave, angolo, filtri })
const pezzo = (sx: GiuntoPezzo | null, dx: GiuntoPezzo | null, codice = 'UP61802'): PezzoFissaggi =>
  ({ codice, pezzo: { tipo: 8050, dxf: `AL\\${codice}.DXF`, serie: 'AL', indice: 0, giunti: { sx, dx } } })
const somma = (r: { codice: string; quantita: number }[]) => {
  const m: Record<string, number> = {}
  for (const x of r) m[x.codice] = (m[x.codice] ?? 0) + x.quantita
  return m
}
const F = ['A1', 'B1']

describe('datiFissaggi', () => {
  it('predefiniti = filtri con l\'ordine piu\' basso della serie', () => expect(dati.predefiniti('UP61802').sort()).toEqual(['A1', 'B1']))
  it('righe per profilo e filtro, tutti i dim_rif', () => expect(dati.righe('UP61802', 'A1').map(x => x.codice)).toEqual(['ACP 5008', 'ACP 5801M', 'ACP 5504']))
  it('stessa riga ripetuta: contata una volta', () => {
    expect(datiFissaggi([...fissaggi, fissaggi[0]], serie).righe('UP61802', 'A1').filter(x => x.codice === 'ACP 5008')).toHaveLength(1)
  })
  it('profilo senza fissaggi: niente', () => expect(dati.righe('XX', 'A1')).toEqual([]))
})

describe('fissaggiStruttura: per angolo, coi filtri scritti nella struttura', () => {
  // Finestra (02-2026G): sinistro senza filtri, alto/destro/basso con i filtri su entrambe le estremita'.
  const finestra = [
    pezzo(g('1|0|100', []), g('1|0|0', [])),
    pezzo(g('1|0|100', F), g('1|100|100', F)),
    pezzo(g('1|100|100', F), g('1|100|0', F)),
    pezzo(g('1|0|0', F), g('1|100|0', F)),
  ]
  it('finestra: 4 angoli anche se 6 estremita\' scrivono i filtri', () => {
    expect(somma(fissaggiStruttura(finestra, dati))).toEqual({ 'ACP 5008': 4, 'ACP 5801M': 4, 'ACP 50153': 4 })
  })
  it('porta: telaio a 3 lati = 2 angoli', () => {
    const porta = [pezzo(g('1|0|200', []), null), pezzo(g('1|0|200', F), g('1|100|200', F)), pezzo(g('1|100|200', F), null)]
    expect(somma(fissaggiStruttura(porta, dati))['ACP 5008']).toBe(2)
  })
  it('estremita\' senza filtri (zoccolo dell\'anta): nessun fissaggio', () => {
    // Anta della porta (12-2026G): il traverso alto scrive i filtri, lo zoccolo in basso no.
    const anta = [pezzo(g('4|0|200', F), g('4|100|200', F)), pezzo(g('4|0|0', []), g('4|100|0', []))]
    expect(somma(fissaggiStruttura(anta, dati))['ACP 5008']).toBe(2)
  })
  it('piu\' filtri sulla stessa estremita\' (ante delle porte P2A): si sommano', () => {
    expect(somma(fissaggiStruttura([pezzo(g('5|0|0', ['A1', 'C2', 'D4']), null)], dati)))
      .toEqual({ 'ACP 5008': 1, 'ACP 5801M': 1, 'ACP 5800': 2, 'ACP 5002': 1 })
  })
  it('angolo inclinato (trapezio): righe con dim_rif 2 al posto di quelle a squadra', () => {
    expect(somma(fissaggiStruttura([pezzo(g('1|0|100', ['A1'], 86.22), g('1|0|0', ['A1']))], dati)))
      .toEqual({ 'ACP 5504': 1, 'ACP 5008': 1, 'ACP 5801M': 1 })
  })
  it('nessun filtro scritto in tutta la struttura: predefiniti della serie, sempre per angolo', () => {
    const senza = finestra.map(p => ({ ...p, pezzo: { ...p.pezzo, giunti: { sx: g(p.pezzo.giunti!.sx!.chiave, []), dx: g(p.pezzo.giunti!.dx!.chiave, []) } } }))
    expect(somma(fissaggiStruttura(senza, dati))).toEqual({ 'ACP 5008': 4, 'ACP 5801M': 4, 'ACP 50153': 4 })
  })
  it('struttura letta prima delle giunzioni: predefiniti su ogni pezzo, come prima', () => {
    const vecchi = finestra.map(p => ({ ...p, pezzo: { ...p.pezzo, giunti: undefined } }))
    expect(somma(fissaggiStruttura(vecchi, dati))).toEqual({ 'ACP 5008': 4, 'ACP 5801M': 4, 'ACP 50153': 4 })
  })
})
