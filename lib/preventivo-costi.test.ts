import { describe, it, expect } from 'vitest'
import { costiArticolo, calcolaCostiPreventivo, type ArticoloCosti } from '@/lib/preventivo-costi'
import type { ConfigSuMisuraArticolo } from '@/types/preventivo'

// Config su misura minimale: il form compone il prezzo come
// (totale_prodotto + totale_accessori) + mano_dopera + spese_varie_calcolate + utile_calcolato
function configSuMisura(over: Partial<ConfigSuMisuraArticolo> = {}): ConfigSuMisuraArticolo {
  return {
    listino_id: 'l1',
    nome_prodotto: 'Finestra',
    larghezza: 1000,
    altezza: 1000,
    mq: 1,
    finitura_id: null,
    nome_finitura: null,
    tipo_maggiorazione_finitura: null,
    prezzo_mq_base: 0,
    prezzo_mq_finale: 0,
    totale_prodotto: 1000,
    accessori: [],
    totale_accessori: 200,
    mano_dopera: 300,
    spese_varie_percentuale: null,
    spese_varie_fisso: 150,
    spese_varie_calcolate: 150,
    utile_percentuale: null,
    utile_fisso: 300,
    utile_calcolato: 300,
    ...over,
  }
}

function articoloSuMisura(over: Partial<ArticoloCosti> = {}): ArticoloCosti {
  return {
    tipo: 'su_misura',
    quantita: 1,
    costo_acquisto_unitario: 1200,
    costo_posa: 300,
    config_su_misura: configSuMisura(),
    config_scorrevole: null,
    config_winconfig: null,
    ...over,
  }
}

describe('costiArticolo', () => {
  it('su misura: le spese varie sono un costo, non utile', () => {
    expect(costiArticolo(articoloSuMisura())).toEqual({ acq: 1200, posa: 300, spese: 150 })
  })

  it('su misura senza spese varie: nessun costo aggiuntivo', () => {
    const a = articoloSuMisura({
      config_su_misura: configSuMisura({ spese_varie_fisso: null, spese_varie_calcolate: 0 }),
    })
    expect(costiArticolo(a)).toEqual({ acq: 1200, posa: 300, spese: 0 })
  })

  it('gli altri tipi di articolo non hanno spese varie', () => {
    const a: ArticoloCosti = {
      tipo: 'listino',
      quantita: 1,
      costo_acquisto_unitario: 500,
      costo_posa: 100,
      config_su_misura: null,
      config_scorrevole: null,
      config_winconfig: null,
    }
    expect(costiArticolo(a)).toEqual({ acq: 500, posa: 100, spese: 0 })
  })
})

describe('calcolaCostiPreventivo', () => {
  it("l'utile su misura coincide con l'utile impostato nel form", () => {
    // Prezzo del form: 1000 + 200 + 300 + 150 + 300 = 1950
    const r = calcolaCostiPreventivo([articoloSuMisura()], 1950, 0)
    expect(r.materiali).toBe(1200)
    expect(r.posa).toBe(300)
    expect(r.spese).toBe(150)
    expect(r.costoTotale).toBe(1650)
    expect(r.utile).toBe(300) // NON 450: le spese varie non gonfiano l'utile
  })

  it('moltiplica le spese varie per la quantità', () => {
    const r = calcolaCostiPreventivo([articoloSuMisura({ quantita: 3 })], 1950 * 3, 0)
    expect(r.spese).toBe(450)
    expect(r.costoTotale).toBe(4950)
    expect(r.utile).toBe(900)
  })

  it('somma le spese trasporto al costo totale', () => {
    const r = calcolaCostiPreventivo([articoloSuMisura()], 1950 + 350, 350)
    expect(r.costoTotale).toBe(2000)
    expect(r.utile).toBe(300)
  })
})
