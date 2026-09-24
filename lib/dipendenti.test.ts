import { describe, it, expect } from 'vitest'
import {
  avvisoBustaInput,
  calcolaSaldoDipendente,
  validaBustaInput,
} from '@/lib/dipendenti'
import type { BustaPaga, PagamentoDipendente } from '@/types/dipendente'

const valido = { periodo: '2026-08-01', mensilita: 'mensile', netto: 1500, lordo: 2100 }

describe('validaBustaInput', () => {
  it('accetta una busta completa e coerente', () => {
    expect(validaBustaInput(valido)).toBeNull()
  })

  it('accetta il lordo assente', () => {
    expect(validaBustaInput({ ...valido, lordo: null })).toBeNull()
  })

  // Il netto è il "dovuto" del riepilogo crediti/debiti: una busta a zero
  // spariresse dal debito senza dare errore.
  it('rifiuta un netto non positivo', () => {
    expect(validaBustaInput({ ...valido, netto: 0 })).toMatch(/netto/i)
    expect(validaBustaInput({ ...valido, netto: -50 })).toMatch(/netto/i)
  })

  it('rifiuta un netto non numerico', () => {
    expect(validaBustaInput({ ...valido, netto: Number.NaN })).toMatch(/netto/i)
    expect(validaBustaInput({ ...valido, netto: Number.POSITIVE_INFINITY })).toMatch(/netto/i)
  })

  it('rifiuta un lordo negativo', () => {
    expect(validaBustaInput({ ...valido, lordo: -1 })).toMatch(/lordo/i)
  })

  // Non blocca: il lordo non entra in nessun calcolo, e rifiutare impedirebbe di
  // correggere il netto di una busta che ha già il lordo sbagliato — in archivio ce
  // n'è una (Blay, dicembre 2025: netto 1261,00 con lordo 1221,80).
  it('non blocca un lordo inferiore al netto: è un avviso, non un errore', () => {
    expect(validaBustaInput({ ...valido, netto: 1500, lordo: 1200 })).toBeNull()
  })

  it('accetta un lordo pari al netto', () => {
    expect(validaBustaInput({ ...valido, netto: 1500, lordo: 1500 })).toBeNull()
  })

  it('pretende il periodo nel formato YYYY-MM-01', () => {
    expect(validaBustaInput({ ...valido, periodo: '2026-08' })).toMatch(/mese/i)
    expect(validaBustaInput({ ...valido, periodo: '2026-08-15' })).toMatch(/mese/i)
    expect(validaBustaInput({ ...valido, periodo: '' })).toMatch(/mese/i)
    expect(validaBustaInput({ ...valido, periodo: '2026-13-01' })).toMatch(/mese/i)
  })

  it('rifiuta una mensilità non ammessa', () => {
    expect(validaBustaInput({ ...valido, mensilita: 'quindicesima' })).toMatch(/mensilit/i)
    expect(validaBustaInput({ ...valido, mensilita: '' })).toMatch(/mensilit/i)
  })

  it('accetta tutte le mensilità previste', () => {
    for (const m of ['mensile', 'tredicesima', 'quattordicesima', 'altro']) {
      expect(validaBustaInput({ ...valido, mensilita: m })).toBeNull()
    }
  })
})

describe('avvisoBustaInput', () => {
  it('segnala il lordo inferiore al netto', () => {
    expect(avvisoBustaInput({ netto: 1261, lordo: 1221.8 })).toMatch(/lordo/i)
  })

  it('tace quando il lordo è coerente o assente', () => {
    expect(avvisoBustaInput({ netto: 1500, lordo: 2100 })).toBeNull()
    expect(avvisoBustaInput({ netto: 1500, lordo: 1500 })).toBeNull()
    expect(avvisoBustaInput({ netto: 1500, lordo: null })).toBeNull()
  })
})

// ---- Amministratori senza busta paga ----

const busta = (periodo: string, netto: number) =>
  ({ periodo, mensilita: 'mensile', netto, id: periodo, created_at: periodo } as unknown as BustaPaga)

const pagamento = (periodo: string, importo: number) =>
  ({
    periodo_competenza: periodo,
    mensilita: 'mensile',
    importo,
    data_pagamento: periodo,
    id: `p${periodo}${importo}`,
  } as unknown as PagamentoDipendente)

describe('calcolaSaldoDipendente', () => {
  it('per un dipendente con busta paga conta dovuto, pagato e residuo', () => {
    const saldo = calcolaSaldoDipendente(
      [busta('2026-01-01', 1500)],
      [pagamento('2026-01-01', 1000)],
    )
    expect(saldo).toEqual({ dovuto: 1500, pagato: 1000, residuo: 500, mesi_aperti: 1 })
  })

  // Un amministratore preleva compensi quando serve: non esiste un dovuto, quindi
  // nemmeno un residuo. Mostrarne uno negativo lo farebbe sembrare in credito.
  it("per chi non riceve busta paga azzera dovuto, residuo e mesi aperti", () => {
    const saldo = calcolaSaldoDipendente(
      [],
      [pagamento('2026-01-01', 2150), pagamento('2026-02-01', 1220)],
      false,
    )
    expect(saldo).toEqual({ dovuto: 0, pagato: 3370, residuo: 0, mesi_aperti: 0 })
  })

  // Difesa: se restassero buste vecchie addosso a chi e' passato a "senza busta",
  // non devono far ricomparire un dovuto che l'utente non vuole piu' vedere.
  it('ignora eventuali buste residue di chi non riceve busta paga', () => {
    const saldo = calcolaSaldoDipendente(
      [busta('2026-01-01', 1500)],
      [pagamento('2026-01-01', 1000)],
      false,
    )
    expect(saldo).toEqual({ dovuto: 0, pagato: 1000, residuo: 0, mesi_aperti: 0 })
  })

  it('senza buste ne pagamenti vale zero', () => {
    expect(calcolaSaldoDipendente([], [])).toEqual({
      dovuto: 0, pagato: 0, residuo: 0, mesi_aperti: 0,
    })
  })
})
