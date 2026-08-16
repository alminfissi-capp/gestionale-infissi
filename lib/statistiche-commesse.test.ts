import { describe, it, expect } from 'vitest'
import {
  aggregaFlussoMese,
  type AccontoRow,
  type ScadenzaRow,
} from '@/lib/statistiche-commesse'

const acconti: AccontoRow[] = [
  { commessa_id: 'c1', importo: 1000, data_pagamento: '2026-01-15' },
  { commessa_id: 'c2', importo: 500, data_pagamento: '2026-01-20' },
  { commessa_id: 'c3', importo: 2000, data_pagamento: '2026-03-02' },
  { commessa_id: 'c4', importo: 999, data_pagamento: '2025-01-10' }, // altro anno
  { commessa_id: 'c5', importo: 777, data_pagamento: null },         // senza data
]

const scadenze: ScadenzaRow[] = [
  { data_scadenza: '2026-01-31', importo: 400, pagato: true, annullata: false },
  { data_scadenza: '2026-03-10', importo: 300, pagato: true, annullata: false },
  { data_scadenza: '2026-03-15', importo: 900, pagato: false, annullata: false }, // non pagata
  { data_scadenza: '2026-03-20', importo: 800, pagato: true, annullata: true },   // annullata
  { data_scadenza: '2027-01-05', importo: 100, pagato: true, annullata: false },  // altro anno
  { data_scadenza: null, importo: 50, pagato: false, annullata: false },          // da programmare
]

describe('aggregaFlussoMese', () => {
  it('restituisce sempre 12 mesi in ordine', () => {
    const r = aggregaFlussoMese([], [], '2026')
    expect(r).toHaveLength(12)
    expect(r[0].mese).toBe('Gen')
    expect(r[11].mese).toBe('Dic')
    expect(r.every((p) => p.incasso === 0 && p.pagamento === 0 && p.saldo === 0)).toBe(true)
  })

  it('somma gli incassi sul mese della data di pagamento', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    expect(r[0].incasso).toBe(1500) // gennaio: 1000 + 500
    expect(r[2].incasso).toBe(2000) // marzo
    expect(r[1].incasso).toBe(0)    // febbraio
  })

  it('conta come pagamento solo le scadenze pagate e non annullate', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    expect(r[0].pagamento).toBe(400) // gennaio
    expect(r[2].pagamento).toBe(300) // marzo: esclude la non pagata e l'annullata
  })

  it('ignora le righe di un altro anno o senza data', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    const totIncassi = r.reduce((s, p) => s + p.incasso, 0)
    const totPagamenti = r.reduce((s, p) => s + p.pagamento, 0)
    expect(totIncassi).toBe(3500) // esclusi 999 (2025) e 777 (senza data)
    expect(totPagamenti).toBe(700) // esclusi 100 (2027) e 50 (senza data)
  })

  it('calcola il saldo mensile come incassi meno pagamenti', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    expect(r[0].saldo).toBe(1100) // 1500 - 400
    expect(r[2].saldo).toBe(1700) // 2000 - 300
  })

  it('produce un saldo negativo quando esce più di quanto entra', () => {
    const soloUscite: ScadenzaRow[] = [
      { data_scadenza: '2026-05-10', importo: 250, pagato: true, annullata: false },
    ]
    const r = aggregaFlussoMese([], soloUscite, '2026')
    expect(r[4].saldo).toBe(-250)
  })
})
