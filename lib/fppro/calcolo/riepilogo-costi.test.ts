import { describe, expect, it } from 'vitest'
import { prezzoComeFp } from './prezzo'
import { riepilogoCosti, type VoceDaRiepilogare } from './riepilogo-costi'
import type { RigaMateriale } from './voce'
import type { OreVoce, ProfiloCalcolo } from './tipi'

const alm2026: ProfiloCalcolo = {
  spese_generali: 0.02, utile: 0.3, provvigione: 0.05, costo_taglio: 30, costo_lavorazione: 30, costo_montaggio: 30,
  costo_assemblaggio: 30, costo_posa: 50, imballo: 0.01, viaggio: 0.02, materiali_vari: 0.03, altro: 0,
}

function voce(righe: RigaMateriale[], ore: OreVoce, quantita: number, extra = 0, profilo: ProfiloCalcolo | null = alm2026): VoceDaRiepilogare {
  const materiali = righe.reduce((s, r) => s + r.costo, 0)
  return {
    quantita, larghezza: 1000, altezza: 1500,
    calcolo: { materiali, righe, ore, prezzo: prezzoComeFp(materiali, ore, alm2026, extra), peso: 30, avvisi: [], profilo: profilo ?? undefined, extraFissi: profilo ? extra : undefined },
  }
}

const riga = (gruppo: RigaMateriale['gruppo'], codice: string, quantita: number, costo: number): RigaMateriale =>
  ({ gruppo, codice, descrizione: codice, quantita, unita: gruppo === 'profili' ? 'm' : 'pz', costo })

const a = voce([riga('profili', 'P1', 5, 100), riga('accessori', 'K1', 1, 40), riga('vetri', 'V1', 1.5, 60)],
  { taglio: 0.5, lavorazione: 1, montaggio: 0.5, assemblaggio: 0, posa: 1 }, 2)
const b = voce([riga('profili', 'P1', 4, 80), riga('pannelli', 'PN', 1, 50)],
  { taglio: 0.25, lavorazione: 0.5, montaggio: 0, assemblaggio: 0, posa: 0.5 }, 1, 25)

describe('riepilogoCosti', () => {
  const r = riepilogoCosti([a, b])

  it('materiali per gruppo, per quantita\'', () => {
    expect(r.materiali).toEqual({ profili: 280, accessori: 80, vetri: 120, pannelli: 50 })
    expect(r.materialiTotale).toBe(530)
  })
  it('stesso codice sommato tra le voci', () => {
    expect(r.dettaglio.profili).toEqual([{ codice: 'P1', descrizione: 'P1', unita: 'm', quantita: 14, costo: 280 }])
  })
  it('lavoro per fase: la somma e\' il costo del lavoro', () => {
    expect(r.fasi!.posa).toEqual({ minuti: 150, costo: 125 })
    const somma = Object.values(r.fasi!).reduce((s, f) => s + f.costo, 0)
    expect(somma).toBeCloseTo(r.lavoro, 6)
    expect(r.lavoroMinuti).toBeCloseTo(435, 6)
  })
  it('le voci del riepilogo ricompongono l\'imponibile', () => {
    expect(r.costoPuro).toBeCloseTo(r.materialiTotale + r.lavoro, 6)
    const somma = r.costoPuro + r.speseGenerali + r.utile + r.provvigione + r.speseVarieTotale + r.extra
    expect(somma).toBeCloseTo(r.imponibile, 6)
    expect(Object.values(r.speseVarie!).reduce((s, x) => s + x, 0)).toBeCloseTo(r.speseVarieTotale, 6)
    expect(r.extra).toBe(25)
  })
  it('pezzi, mq e peso', () => {
    expect(r.pezzi).toBe(3)
    expect(r.mq).toBeCloseTo(4.5, 6)
    expect(r.peso).toBe(90)
  })
  it('calcolo vecchio senza profilo: lavoro e spese varie solo in totale, extra ricavati', () => {
    const vecchio = riepilogoCosti([a, voce([riga('profili', 'P2', 1, 10)], { taglio: 0, lavorazione: 1, montaggio: 0, assemblaggio: 0, posa: 0 }, 1, 12, null)])
    expect(vecchio.fasi).toBeNull()
    expect(vecchio.speseVarie).toBeNull()
    expect(vecchio.extra).toBeCloseTo(12, 6)
  })
})
