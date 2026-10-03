import { describe, it, expect } from 'vitest'
import {
  applicaPagamento, costruisciScrittura, annullaPagamento, totaleRate, intenzioneDa, ritrovaScrittura, giaAnnullato,
  type ScritturaFic,
} from '@/lib/fic/pagamenti-fic'
import type { RataFic } from '@/lib/fic/tipi'

const OGGI = '2026-10-03'
const ASSEGNO = 546834
const r = (id: number, amount: number, due_date: string, status = 'not_paid', paid_date: string | null = null): RataFic =>
  ({ id, amount, due_date, status, paid_date, payment_account: null })

describe('applicaPagamento', () => {
  it('paga una rata intera', () => {
    const e = applicaPagamento([r(1, 500, '2026-01-31')], 500, OGGI, ASSEGNO)
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.rate).toEqual([{ ...r(1, 500, '2026-01-31'), status: 'paid', paid_date: OGGI, payment_account: { id: ASSEGNO } }])
    expect(e.indiciPagati).toEqual([0])
    expect(e.divisa).toBeNull()
  })

  it("paga piu' rate dalla prima scadenza, saltando quelle gia' pagate", () => {
    const rate = [r(3, 100, '2026-03-31'), r(1, 100, '2026-01-31', 'paid', '2026-01-31'), r(2, 100, '2026-02-28')]
    const e = applicaPagamento(rate, 200, OGGI, ASSEGNO)
    if (!e.ok) throw new Error('atteso ok')
    expect(e.indiciPagati).toEqual([2, 0])
    expect(e.rate[1]).toEqual(rate[1]) // la gia' pagata non si tocca
  })

  it("divide l'ultima rata: totale invariato", () => {
    const rate = [r(1, 1000, '2026-01-31')]
    const e = applicaPagamento(rate, 300, OGGI, ASSEGNO)
    if (!e.ok) throw new Error('atteso ok')
    expect(e.rate).toHaveLength(2)
    expect(e.rate[0]).toMatchObject({ id: 1, amount: 300, status: 'paid', paid_date: OGGI })
    expect(e.rate[1]).toMatchObject({ amount: 700, status: 'not_paid', due_date: '2026-01-31' })
    expect(e.rate[1]).not.toHaveProperty('id')
    expect(e.divisa).toEqual({ indicePagata: 0, importoOriginale: 1000 })
    expect(totaleRate(e.rate)).toBe(totaleRate(rate))
  })

  it('residuo insufficiente → nessuna modifica', () => {
    const e = applicaPagamento([r(1, 100, '2026-01-31'), r(2, 50, '2026-02-28', 'paid', '2026-02-01')], 200, OGGI, ASSEGNO)
    expect(e).toEqual({ ok: false, disponibile: 100 })
  })

  it('due scadenze sulla stessa fattura: la seconda copre il resto', () => {
    const prima = applicaPagamento([r(1, 1000, '2026-01-31')], 500, OGGI, ASSEGNO)
    if (!prima.ok) throw new Error('atteso ok')
    const dopoPut = prima.rate.map((x, i) => (i === 1 ? { ...x, id: 2 } : x)) // FiC assegna l'id alla rata nuova
    const seconda = applicaPagamento(dopoPut, 500, '2026-10-10', ASSEGNO)
    if (!seconda.ok) throw new Error('atteso ok')
    expect(seconda.rate.every((x) => x.status === 'paid')).toBe(true)
    expect(seconda.divisa).toBeNull()
    expect(totaleRate(seconda.rate)).toBe(1000)
  })
})

describe('costruisciScrittura', () => {
  it('prende gli id dalla risposta di FiC, anche in ordine diverso', () => {
    const prima = [r(1, 1000, '2026-01-31')]
    const e = applicaPagamento(prima, 300, OGGI, ASSEGNO)
    if (!e.ok) throw new Error('atteso ok')
    const dopo = [
      { ...r(55, 700, '2026-01-31') },
      { ...r(1, 300, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } },
    ]
    expect(costruisciScrittura(prima, e, dopo, OGGI, ASSEGNO)).toEqual<ScritturaFic>({
      data: OGGI,
      metodo_id: ASSEGNO,
      rate_pagate: [{ id: 1, importo: 300 }],
      rata_divisa: { pagata_id: 1, resto_id: 55, importo_originale: 1000 },
    })
  })
})

describe('annullaPagamento', () => {
  const scrittura: ScritturaFic = {
    data: OGGI, metodo_id: ASSEGNO,
    rate_pagate: [{ id: 1, importo: 300 }],
    rata_divisa: { pagata_id: 1, resto_id: 55, importo_originale: 1000 },
  }
  const scritte = () => [
    { ...r(1, 300, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } },
    r(55, 700, '2026-01-31'),
  ]

  it('rimette da pagare e riunisce la rata divisa', () => {
    const a = annullaPagamento(scritte(), scrittura)
    if (!a.ok) throw new Error('atteso ok')
    expect(a.rate).toHaveLength(1)
    expect(a.rate[0]).toMatchObject({ id: 1, amount: 1000, status: 'not_paid', paid_date: null })
  })

  it('resto toccato su FiC: annulla senza riunire, totale invariato', () => {
    const rate = scritte()
    rate[1] = { ...rate[1], due_date: '2026-05-31' }
    const a = annullaPagamento(rate, scrittura)
    if (!a.ok) throw new Error('atteso ok')
    expect(a.rate).toHaveLength(2)
    expect(totaleRate(a.rate)).toBe(1000)
  })

  it('rata pagata modificata a mano su FiC → conflitto, niente modifiche', () => {
    const rate = scritte()
    rate[0] = { ...rate[0], amount: 250 }
    expect(annullaPagamento(rate, scrittura)).toEqual({ ok: false, motivo: 'Una rata pagata da WinStudio e\' stata modificata su FiC: sistemala a mano' })
  })

  it('rata pagata sparita su FiC → conflitto', () => {
    expect(annullaPagamento([r(55, 700, '2026-01-31')], scrittura))
      .toEqual({ ok: false, motivo: 'Una rata pagata da WinStudio non esiste piu\' su FiC: sistemala a mano' })
  })

  it('scrittura senza divisione: solo stato e data', () => {
    const s: ScritturaFic = { data: OGGI, metodo_id: ASSEGNO, rate_pagate: [{ id: 1, importo: 500 }], rata_divisa: null }
    const a = annullaPagamento([{ ...r(1, 500, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } }], s)
    if (!a.ok) throw new Error('atteso ok')
    expect(a.rate[0]).toMatchObject({ amount: 500, status: 'not_paid', paid_date: null })
  })
})

describe('giaAnnullato', () => {
  const s: ScritturaFic = {
    data: OGGI, metodo_id: ASSEGNO,
    rate_pagate: [{ id: 1, importo: 300 }],
    rata_divisa: { pagata_id: 1, resto_id: 55, importo_originale: 1000 },
  }
  it('vero se le rate scritte da WinStudio risultano gia\' da pagare (risposta del PUT persa)', () => {
    expect(giaAnnullato([r(1, 1000, '2026-01-31')], s)).toBe(true)
  })
  it('falso se sono ancora pagate', () => {
    expect(giaAnnullato([{ ...r(1, 300, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } }, r(55, 700, '2026-01-31')], s)).toBe(false)
  })
  it('falso se una rata non esiste piu\'', () => {
    expect(giaAnnullato([r(55, 700, '2026-01-31')], s)).toBe(false)
  })
})

describe("intenzione: ritrovare una scrittura gia' applicata da FiC", () => {
  const prima = [r(1, 1000, '2026-01-31'), r(2, 500, '2026-02-28')]
  const esito = applicaPagamento(prima, 1200, OGGI, ASSEGNO)
  if (!esito.ok) throw new Error('atteso ok')
  const intenzione = intenzioneDa(prima, esito, OGGI, ASSEGNO)

  it("descrive le rate che verranno pagate, con gli id gia' esistenti", () => {
    expect(intenzione).toEqual({
      data: OGGI, metodo_id: ASSEGNO, id_prima: [1, 2],
      rate_pagate: [{ id: 1, importo: 1000 }, { id: 2, importo: 200 }],
      rata_divisa: { pagata_id: 2, importo_originale: 500 },
    })
  })

  it("se FiC l'ha gia' applicata la ritrova, rata resto compresa", () => {
    const suFic = [
      { ...r(1, 1000, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } },
      { ...r(2, 200, '2026-02-28', 'paid', OGGI), payment_account: { id: ASSEGNO } },
      r(77, 300, '2026-02-28'),
    ]
    expect(ritrovaScrittura(suFic, intenzione)).toEqual<ScritturaFic>({
      data: OGGI, metodo_id: ASSEGNO,
      rate_pagate: [{ id: 1, importo: 1000 }, { id: 2, importo: 200 }],
      rata_divisa: { pagata_id: 2, resto_id: 77, importo_originale: 500 },
    })
  })

  it("se FiC non l'ha applicata → null", () => {
    expect(ritrovaScrittura(prima, intenzione)).toBeNull()
  })

  it("pagata con un'altra data → null", () => {
    const altra = [
      { ...r(1, 1000, '2026-01-31', 'paid', '2026-09-01'), payment_account: { id: ASSEGNO } },
      { ...r(2, 200, '2026-02-28', 'paid', OGGI), payment_account: { id: ASSEGNO } },
      r(77, 300, '2026-02-28'),
    ]
    expect(ritrovaScrittura(altra, intenzione)).toBeNull()
  })
})
