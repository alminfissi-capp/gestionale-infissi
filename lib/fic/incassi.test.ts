import { describe, it, expect } from 'vitest'
import {
  quotaLibera, fattoreFic, ripartisciIncasso, controllaQuote, propostaStorico, abbinaMetodiIncasso,
  type FatturaRipartibile, type IncassoDaRipartire,
} from '@/lib/fic/incassi'

const f = (over: Partial<FatturaRipartibile> = {}): FatturaRipartibile => ({
  fic_id: 1,
  tipo: 'fattura',
  data: '2026-01-10',
  importo_lordo: 1000,
  ritenuta: 0,
  disponibile: 1000,
  quota_libera: 1000,
  ...over,
})
const inc = (over: Partial<IncassoDaRipartire> = {}): IncassoDaRipartire => ({
  importo: 1000, ritenuta: 0, ritenuta_tipo: null, ...over,
})

describe('quotaLibera', () => {
  it('fattura intera meno le quote su altre commesse', () => {
    expect(quotaLibera(10_000, [4_000, 1_500])).toBe(4_500)
  })
  it('mai sotto zero', () => {
    expect(quotaLibera(1_000, [800, 400])).toBe(0)
  })
  it('nota di credito: negativa, meno le quote negative gia\' assegnate', () => {
    expect(quotaLibera(-500, [-200])).toBe(-300)
    expect(quotaLibera(-500, [-600])).toBe(0)
  })
})

describe('fattoreFic', () => {
  it('condominio con ritenuta in fattura: su FiC va il netto della ritenuta', () => {
    expect(fattoreFic(inc({ ritenuta_tipo: 'condominio', ritenuta: 8 }), f({ importo_lordo: 236, ritenuta: 8 }))).toBeCloseTo(236 / 244)
  })
  it('condominio ma fattura senza ritenuta: per intero', () => {
    expect(fattoreFic(inc({ ritenuta_tipo: 'condominio', ritenuta: 8 }), f({ ritenuta: 0 }))).toBe(1)
  })
  it('detrazioni 11%: sempre per intero', () => {
    expect(fattoreFic(inc({ ritenuta_tipo: 'detrazioni', ritenuta: 90 }), f({ ritenuta: 8 }))).toBe(1)
  })
})

describe('ripartisciIncasso', () => {
  it('dalla fattura piu\' vecchia, fino a esaurire l\'incasso', () => {
    const fatture = [
      f({ fic_id: 2, data: '2026-02-01', disponibile: 3000, quota_libera: 3000 }),
      f({ fic_id: 1, data: '2026-01-01', disponibile: 1000, quota_libera: 1000 }),
    ]
    expect(ripartisciIncasso(inc({ importo: 2500 }), fatture)).toEqual([
      { fic_documento_id: 1, tipo_documento: 'fattura', importo: 1000 },
      { fic_documento_id: 2, tipo_documento: 'fattura', importo: 1500 },
    ])
  })

  it('ogni fattura prende al massimo il minore fra quota libera e residuo su FiC', () => {
    const fatture = [
      f({ fic_id: 1, data: '2026-01-01', disponibile: 5000, quota_libera: 600 }),
      f({ fic_id: 2, data: '2026-01-02', disponibile: 300, quota_libera: 5000 }),
    ]
    expect(ripartisciIncasso(inc({ importo: 5000 }), fatture).map((q) => q.importo)).toEqual([600, 300])
  })

  it('salta le note di credito e le fatture gia\' incassate', () => {
    const fatture = [
      f({ fic_id: 1, tipo: 'nota_credito', importo_lordo: -200, disponibile: 200, quota_libera: -200 }),
      f({ fic_id: 2, disponibile: 0 }),
      f({ fic_id: 3, data: '2026-03-01' }),
    ]
    expect(ripartisciIncasso(inc({ importo: 400 }), fatture)).toEqual([
      { fic_documento_id: 3, tipo_documento: 'fattura', importo: 400 },
    ])
  })

  it('condominio 4% con ritenuta in fattura: paga quanto FiC indica da incassare', () => {
    // Imponibile 200, IVA 44, ritenuta 8: il cliente "paga" 244, al conto arrivano 236.
    const fattura = f({ importo_lordo: 236, ritenuta: 8, disponibile: 236, quota_libera: 236 })
    expect(ripartisciIncasso(inc({ importo: 244, ritenuta: 8, ritenuta_tipo: 'condominio' }), [fattura])).toEqual([
      { fic_documento_id: 1, tipo_documento: 'fattura', importo: 236 },
    ])
  })

  it('condominio 4% ma fattura senza ritenuta: per intero', () => {
    const fattura = f({ importo_lordo: 244, disponibile: 244, quota_libera: 244 })
    expect(ripartisciIncasso(inc({ importo: 244, ritenuta: 8, ritenuta_tipo: 'condominio' }), [fattura])[0].importo).toBe(244)
  })

  it('bonifico parlante 11%: la fattura si paga per intero', () => {
    const fattura = f({ importo_lordo: 1100, disponibile: 1100, quota_libera: 1100 })
    expect(ripartisciIncasso(inc({ importo: 1100, ritenuta: 99.18, ritenuta_tipo: 'detrazioni' }), [fattura])[0].importo).toBe(1100)
  })

  it('incasso piu\' grande delle fatture: ripartisce quanto puo\'', () => {
    expect(ripartisciIncasso(inc({ importo: 5000 }), [f()]).map((q) => q.importo)).toEqual([1000])
  })

  it('nessuna fattura → nessuna quota', () => {
    expect(ripartisciIncasso(inc(), [])).toEqual([])
  })
})

describe('controllaQuote', () => {
  const fatture = [f({ fic_id: 1, disponibile: 1000, quota_libera: 800 })]

  it('tutto in regola', () => {
    const c = controllaQuote(inc({ importo: 800 }), fatture, [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 800 }])
    expect(c).toEqual({ errori: [], avvisi: [], totaleFic: 800, coperto: 800 })
  })

  it('oltre il residuo su FiC: errore che blocca', () => {
    const c = controllaQuote(inc({ importo: 1200 }), fatture, [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 1200 }])
    expect(c.errori).toHaveLength(1)
  })

  it('oltre la quota della commessa: avviso', () => {
    const c = controllaQuote(inc({ importo: 900 }), fatture, [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 900 }])
    expect(c.errori).toEqual([])
    expect(c.avvisi.some((a) => a.includes('quota'))).toBe(true)
  })

  it('le fatture non coprono tutto l\'incasso: avviso', () => {
    const c = controllaQuote(inc({ importo: 1000 }), fatture, [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 500 }])
    expect(c.coperto).toBe(500)
    expect(c.avvisi.some((a) => a.includes('500'))).toBe(true)
  })

  it('le fatture superano l\'incasso: errore', () => {
    const c = controllaQuote(inc({ importo: 300 }), fatture, [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 500 }])
    expect(c.errori.length).toBeGreaterThan(0)
  })

  it('condominio: copertura riportata al lordo dell\'incasso', () => {
    const fc = [f({ importo_lordo: 236, ritenuta: 8, disponibile: 236, quota_libera: 236 })]
    const c = controllaQuote(
      inc({ importo: 244, ritenuta: 8, ritenuta_tipo: 'condominio' }), fc,
      [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 236 }],
    )
    expect(c).toEqual({ errori: [], avvisi: [], totaleFic: 236, coperto: 244 })
  })

  it('quota a zero o negativa: errore', () => {
    const c = controllaQuote(inc(), fatture, [{ fic_documento_id: 1, tipo_documento: 'fattura', importo: 0 }])
    expect(c.errori.length).toBeGreaterThan(0)
  })
})

describe('propostaStorico', () => {
  it('incasso piu\' vecchio sulla fattura piu\' vecchia, consumando le capienze', () => {
    const fatture = [
      f({ fic_id: 10, data: '2026-01-01', disponibile: 1000, quota_libera: 1000 }),
      f({ fic_id: 20, data: '2026-03-01', disponibile: 2000, quota_libera: 2000 }),
    ]
    const incassi = [
      { id: 'b', data: '2026-03-10', ...inc({ importo: 1500 }) },
      { id: 'a', data: '2026-01-05', ...inc({ importo: 700 }) },
    ]
    expect(propostaStorico(incassi, fatture)).toEqual([
      { acconto_id: 'a', quote: [{ fic_documento_id: 10, tipo_documento: 'fattura', importo: 700 }] },
      {
        acconto_id: 'b',
        quote: [
          { fic_documento_id: 10, tipo_documento: 'fattura', importo: 300 },
          { fic_documento_id: 20, tipo_documento: 'fattura', importo: 1200 },
        ],
      },
    ])
  })

  it('fatture gia\' incassate su FiC: nessuna proposta per quell\'incasso', () => {
    const fatture = [f({ disponibile: 0 })]
    expect(propostaStorico([{ id: 'a', data: '2026-01-05', ...inc() }], fatture)).toEqual([])
  })
})

describe('abbinaMetodiIncasso', () => {
  it('abbina per nome; "altro" resta da scegliere', () => {
    const metodi = [
      { id: 546833, nome: 'Contanti' },
      { id: 546834, nome: 'Assegno' },
      { id: 546835, nome: 'Bonifico' },
      { id: 9, nome: 'Ri.Ba.' },
    ]
    expect(abbinaMetodiIncasso(metodi)).toEqual({ bonifico: 546835, contanti: 546833, riba: 9, altro: null })
  })
  it('senza corrispondenze: tutto null', () => {
    expect(abbinaMetodiIncasso([{ id: 1, nome: 'Carta' }])).toEqual({ bonifico: null, contanti: null, riba: null, altro: null })
  })
})
