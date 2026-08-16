import { describe, it, expect } from 'vitest'
import {
  aggregaFlussoMese,
  riepilogoCreditiDebiti,
  type AccontoRow,
  type ScadenzaRow,
  type StatRow,
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

const OGGI = '2026-08-16'

const commesseRiep: StatRow[] = [
  { id: 'c1', cliente_nome: 'Rossi', totale: 10000, data_conferma: '2026-02-01', blocco: '2026' },
  { id: 'c2', cliente_nome: 'Bianchi', totale: 5000, data_conferma: '2026-03-01', blocco: '2026' },
  { id: 'c3', cliente_nome: 'Verdi', totale: 2000, data_conferma: '2025-11-01', blocco: '2025' },
]

const accontiRiep: AccontoRow[] = [
  { commessa_id: 'c1', importo: 4000, data_pagamento: '2026-02-10' },
  { commessa_id: 'c2', importo: 7000, data_pagamento: '2026-03-05' }, // incassata in eccesso
]

const scadenzeRiep: ScadenzaRow[] = [
  { data_scadenza: '2026-07-01', importo: 300, pagato: false, annullata: false }, // scaduta
  { data_scadenza: '2026-08-16', importo: 100, pagato: false, annullata: false }, // oggi
  { data_scadenza: '2026-12-31', importo: 700, pagato: false, annullata: false }, // entro l'anno
  { data_scadenza: '2027-01-01', importo: 900, pagato: false, annullata: false }, // futura
  { data_scadenza: null, importo: 50, pagato: false, annullata: false },          // da programmare
  { data_scadenza: '2026-07-05', importo: 999, pagato: true, annullata: false },  // già pagata
  { data_scadenza: '2026-07-06', importo: 888, pagato: false, annullata: true },  // annullata
]

describe('riepilogoCreditiDebiti', () => {
  it('somma i crediti come residuo per commessa, senza compensare fra commesse', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], OGGI)
    // c1: 10000-4000 = 6000 · c2: -2000 → 0 (non riduce c1) · c3: 2000
    expect(r.crediti).toBe(8000)
  })

  it('divide i debiti per orizzonte rispetto a oggi', () => {
    const r = riepilogoCreditiDebiti([], [], scadenzeRiep, OGGI)
    expect(r.debitiScaduti).toBe(300)
    expect(r.debitiAnno).toBe(800) // 100 di oggi + 700 di fine anno
    expect(r.debitiFuturi).toBe(900)
    expect(r.debitiDaProgrammare).toBe(50)
  })

  it('una scadenza in data odierna non è ancora scaduta', () => {
    const r = riepilogoCreditiDebiti([], [], [
      { data_scadenza: OGGI, importo: 100, pagato: false, annullata: false },
    ], OGGI)
    expect(r.debitiScaduti).toBe(0)
    expect(r.debitiAnno).toBe(100)
  })

  it('esclude dai debiti le scadenze pagate e quelle annullate', () => {
    const r = riepilogoCreditiDebiti([], [], scadenzeRiep, OGGI)
    expect(r.debitiTotali).toBe(2050) // 300+800+900+50, senza 999 e 888
  })

  it('tiene le rate future fuori dalla posizione netta', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, scadenzeRiep, OGGI)
    // 8000 - (300 + 800 + 50) = 6850
    expect(r.posizioneNetta).toBe(6850)
  })

  it('regge liste vuote', () => {
    const r = riepilogoCreditiDebiti([], [], [], OGGI)
    expect(r).toEqual({
      crediti: 0,
      debitiScaduti: 0,
      debitiAnno: 0,
      debitiFuturi: 0,
      debitiDaProgrammare: 0,
      debitiTotali: 0,
      posizioneNetta: 0,
    })
  })
})
