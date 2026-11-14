import { describe, expect, it } from 'vitest'
import { confrontaAccessori } from './confronto-fp'

describe('confronto accessori WinStudio / FP PRO', () => {
  const fp = [{ codice: 'ACP 5151/D', quantita: 1 }, { codice: 'AGP 4000', quantita: 4.04 }, { codice: 'RB304', quantita: 7 }]
  it('stessi accessori e quantita\': nessuna differenza', () => {
    expect(confrontaAccessori([{ codice: 'RB304', quantita: 7 }, { codice: 'ACP 5151/D', quantita: 1 }, { codice: 'AGP 4000', quantita: 4.04 }], fp))
      .toEqual({ inPiu: [], mancanti: [], diverse: [] })
  })
  it('accessorio in piu\', mancante, quantita\' diversa (oltre 0,01)', () => {
    const r = confrontaAccessori([
      { codice: 'ACP 5151/D', quantita: 1 }, { codice: 'ACP 5151/S', quantita: 1 }, { codice: 'AGP 4000', quantita: 4.5 },
    ], fp)
    expect(r.inPiu).toEqual([{ codice: 'ACP 5151/S', quantita: 1 }])
    expect(r.mancanti).toEqual([{ codice: 'RB304', quantita: 7 }])
    expect(r.diverse).toEqual([{ codice: 'AGP 4000', winstudio: 4.5, fp: 4.04 }])
  })
  it('stesso codice su piu\' righe: si sommano prima di confrontare', () => {
    expect(confrontaAccessori([{ codice: 'RB304', quantita: 3 }, { codice: 'RB304', quantita: 4 }], [{ codice: 'RB304', quantita: 7 }]).diverse).toEqual([])
  })
  it('codici "_AVVISO" di FP PRO: ignorati', () => {
    expect(confrontaAccessori([{ codice: '_AVVISO1', quantita: 1 }], []).inPiu).toEqual([])
  })
})
