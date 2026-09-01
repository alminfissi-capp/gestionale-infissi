import { describe, it, expect } from 'vitest'
import {
  creditiAllaData,
  debitiAllaData,
  dateDelPeriodo,
  andamentoCreditiDebiti,
  type DatiAndamento,
} from './andamento-crediti-debiti'

const VUOTI: DatiAndamento = {
  commesse: [], acconti: [], scadenze: [], altriCrediti: [],
  buste: [], pagamentiDipendenti: [], anticipi: [],
}

describe('creditiAllaData', () => {
  const dati: DatiAndamento = {
    ...VUOTI,
    commesse: [{ id: 'c1', totale: 1000, data_conferma: '2026-03-10', stato: 'in_lavorazione' }],
    acconti: [{ commessa_id: 'c1', importo: 400, data_pagamento: '2026-04-05' }],
  }

  it('prima della conferma la commessa non è ancora un credito', () => {
    expect(creditiAllaData(dati, '2026-03-09')).toBe(0)
  })

  it('dalla conferma vale tutta, finché non arriva un acconto', () => {
    expect(creditiAllaData(dati, '2026-03-10')).toBe(1000)
    expect(creditiAllaData(dati, '2026-04-04')).toBe(1000)
  })

  it('l’acconto scala il credito dal giorno in cui è stato versato', () => {
    expect(creditiAllaData(dati, '2026-04-05')).toBe(600)
  })

  it('una commessa incassata in eccesso non maschera il credito di un’altra', () => {
    const due: DatiAndamento = {
      ...VUOTI,
      commesse: [
        { id: 'c1', totale: 100, data_conferma: '2026-01-01', stato: 'concluso' },
        { id: 'c2', totale: 500, data_conferma: '2026-01-01', stato: 'concluso' },
      ],
      acconti: [{ commessa_id: 'c1', importo: 300, data_pagamento: '2026-01-02' }],
    }
    expect(creditiAllaData(due, '2026-01-02')).toBe(500)
  })

  it('lo stato in_attesa non conta come credito', () => {
    const limbo: DatiAndamento = {
      ...VUOTI,
      commesse: [{ id: 'x', totale: 900, data_conferma: '2026-01-01', stato: 'in_attesa' }],
    }
    expect(creditiAllaData(limbo, '2026-06-01')).toBe(0)
  })

  it('gli incassi in attesa non ancora incassati contano dal loro inserimento', () => {
    const altri: DatiAndamento = {
      ...VUOTI,
      altriCrediti: [
        { importo: 200, incassato: false, created_at: '2026-02-01' },
        { importo: 999, incassato: true, created_at: '2026-02-01' },
      ],
    }
    expect(creditiAllaData(altri, '2026-01-31')).toBe(0)
    expect(creditiAllaData(altri, '2026-02-01')).toBe(200)
  })
})

describe('debitiAllaData — scadenze', () => {
  it('una scadenza pagata pesa dall’inserimento fino alla sua data', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 300, data_scadenza: '2026-05-20', pagato: true, annullata: false, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-03-31')).toBe(0)
    expect(debitiAllaData(d, '2026-04-01')).toBe(300)
    expect(debitiAllaData(d, '2026-05-19')).toBe(300)
    expect(debitiAllaData(d, '2026-05-20')).toBe(0)
  })

  it('una scadenza NON pagata resta aperta anche se la data è passata', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 300, data_scadenza: '2026-05-20', pagato: false, annullata: false, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-12-31')).toBe(300)
  })

  it('una scadenza senza data è aperta dall’inserimento in poi', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 150, data_scadenza: null, pagato: false, annullata: false, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-03-31')).toBe(0)
    expect(debitiAllaData(d, '2026-09-01')).toBe(150)
  })

  it('una scadenza annullata non pesa mai', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 500, data_scadenza: '2026-05-20', pagato: false, annullata: true, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-05-01')).toBe(0)
  })
})

describe('debitiAllaData — dipendenti', () => {
  const d: DatiAndamento = {
    ...VUOTI,
    buste: [{ dipendente_id: 'd1', periodo: '2026-03-01', netto: 1500 }],
    pagamentiDipendenti: [{ dipendente_id: 'd1', data_pagamento: '2026-04-10', importo: 1500 }],
  }

  it('il debito nasce al periodo di competenza', () => {
    expect(debitiAllaData(d, '2026-02-28')).toBe(0)
    expect(debitiAllaData(d, '2026-03-01')).toBe(1500)
  })

  it('e si chiude col pagamento', () => {
    expect(debitiAllaData(d, '2026-04-09')).toBe(1500)
    expect(debitiAllaData(d, '2026-04-10')).toBe(0)
  })

  it('un dipendente pagato in anticipo non azzera il debito verso un altro', () => {
    const due: DatiAndamento = {
      ...VUOTI,
      buste: [{ dipendente_id: 'd2', periodo: '2026-03-01', netto: 1000 }],
      pagamentiDipendenti: [{ dipendente_id: 'd1', data_pagamento: '2026-03-05', importo: 5000 }],
    }
    expect(debitiAllaData(due, '2026-03-05')).toBe(1000)
  })
})

describe('debitiAllaData — anticipi fattura', () => {
  it('nasce all’erogazione e cala con gli acconti collegati', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      anticipi: [{
        id: 'a1', importo: 5000, data_erogazione: '2026-01-15',
        rimborsato: false, rimborsato_at: null,
        acconti: [{ importo: 2000, data_pagamento: '2026-02-10' }],
      }],
    }
    expect(debitiAllaData(d, '2026-01-14')).toBe(0)
    expect(debitiAllaData(d, '2026-01-15')).toBe(5000)
    expect(debitiAllaData(d, '2026-02-10')).toBe(3000)
  })

  it('un anticipo rimborsato si azzera alla sua data di rimborso', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      anticipi: [{
        id: 'a1', importo: 5000, data_erogazione: '2026-01-15',
        rimborsato: true, rimborsato_at: '2026-03-01', acconti: [],
      }],
    }
    expect(debitiAllaData(d, '2026-02-28')).toBe(5000)
    expect(debitiAllaData(d, '2026-03-01')).toBe(0)
  })

  it('un anticipo senza data di erogazione non entra nella storia', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      anticipi: [{
        id: 'a1', importo: 5000, data_erogazione: null,
        rimborsato: false, rimborsato_at: null, acconti: [],
      }],
    }
    expect(debitiAllaData(d, '2026-06-01')).toBe(0)
  })
})

describe('dateDelPeriodo', () => {
  it('30 giorni dà 31 punti giornalieri, l’ultimo è oggi', () => {
    const p = dateDelPeriodo('30g', '2026-03-31', '2020-01-01')
    expect(p.length).toBe(31)
    expect(p[0]).toBe('2026-03-01')
    expect(p[p.length - 1]).toBe('2026-03-31')
  })

  it('6 mesi dà punti settimanali', () => {
    const p = dateDelPeriodo('6m', '2026-06-30', '2020-01-01')
    expect(p.length).toBeGreaterThan(20)
    expect(p.length).toBeLessThan(32)
    expect(p[p.length - 1]).toBe('2026-06-30')
  })

  it('24 mesi dà punti mensili', () => {
    const p = dateDelPeriodo('24m', '2026-06-30', '2020-01-01')
    expect(p.length).toBeGreaterThan(20)
    expect(p.length).toBeLessThan(28)
    expect(p[p.length - 1]).toBe('2026-06-30')
  })

  it('"tutto" parte dal primo movimento, non dall’inizio dei tempi', () => {
    const p = dateDelPeriodo('tutto', '2026-06-30', '2026-01-15')
    expect(p[0] <= '2026-01-15').toBe(true)
    expect(p[0] >= '2025-12-01').toBe(true)
  })

  it('senza alcun movimento non esplode', () => {
    expect(dateDelPeriodo('tutto', '2026-06-30', null)).toEqual(['2026-06-30'])
  })
})

describe('andamentoCreditiDebiti', () => {
  it('la posizione netta è crediti meno debiti, punto per punto', () => {
    const dati: DatiAndamento = {
      ...VUOTI,
      commesse: [{ id: 'c1', totale: 1000, data_conferma: '2026-03-01', stato: 'concluso' }],
      scadenze: [{ importo: 400, data_scadenza: null, pagato: false, annullata: false, created_at: '2026-03-01' }],
    }
    const serie = andamentoCreditiDebiti(dati, '30g', '2026-03-31')
    const ultimo = serie[serie.length - 1]
    expect(ultimo.crediti).toBe(1000)
    expect(ultimo.debiti).toBe(400)
    expect(ultimo.netta).toBe(600)
  })

  it('su dati vuoti restituisce zeri, non NaN', () => {
    const serie = andamentoCreditiDebiti(VUOTI, '30g', '2026-03-31')
    expect(serie.length).toBe(31)
    expect(serie.every((p) => p.crediti === 0 && p.debiti === 0 && p.netta === 0)).toBe(true)
  })
})
