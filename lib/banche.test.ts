import { describe, it, expect } from 'vitest'
import {
  utilizzoConto,
  riepilogoBanche,
  type ContoBancaRow,
  type LineaCreditoRow,
  type AnticipoRow,
  type InfoCommessa,
} from '@/lib/banche'

const conto = (over: Partial<ContoBancaRow> = {}): ContoBancaRow => ({
  id: 'cc1',
  nome: 'Intesa c/c',
  disponibile: 0,
  accordato: 0,
  ...over,
})

describe('utilizzoConto', () => {
  it('ricava utilizzato e residuo dal disponibile', () => {
    const r = utilizzoConto(conto({ accordato: 40000, disponibile: 10000 }))
    expect(r.utilizzato).toBe(30000)
    expect(r.propria).toBe(0)
    expect(r.residuo).toBe(10000)
  })

  it('conto in attivo oltre il fido: niente utilizzato, il resto sono soldi propri', () => {
    const r = utilizzoConto(conto({ accordato: 40000, disponibile: 45000 }))
    expect(r.utilizzato).toBe(0)
    expect(r.propria).toBe(5000)
    expect(r.residuo).toBe(40000)
  })

  it('conto senza fido: tutto liquidità propria', () => {
    const r = utilizzoConto(conto({ accordato: 0, disponibile: 5000 }))
    expect(r.utilizzato).toBe(0)
    expect(r.propria).toBe(5000)
    expect(r.residuo).toBe(0)
  })
})

describe('riepilogoBanche — conti correnti', () => {
  it('somma i conti col floor per singola entità: l’attivo non compensa il rosso', () => {
    const r = riepilogoBanche(
      [
        conto({ id: 'a', accordato: 40000, disponibile: 10000 }), // 30.000 usati
        conto({ id: 'b', accordato: 20000, disponibile: 25000 }), // 5.000 propri
      ],
      [], [], {}, '2026-08-27',
    )
    expect(r.fidoCassaUtilizzato).toBe(30000)
    expect(r.liquiditaPropria).toBe(5000)
    expect(r.utilizzatoTotale).toBe(30000)
  })

  it('i conti senza fido restano fuori dal dettaglio ma dentro la liquidità propria', () => {
    const r = riepilogoBanche(
      [conto({ id: 'a', accordato: 0, disponibile: 5000 })],
      [], [], {}, '2026-08-27',
    )
    expect(r.conti).toHaveLength(0)
    expect(r.liquiditaPropria).toBe(5000)
  })

  it('liste vuote: tutti zeri, nessuna eccezione', () => {
    const r = riepilogoBanche([], [], [], {}, '2026-08-27')
    expect(r.utilizzatoTotale).toBe(0)
    expect(r.residuoTotale).toBe(0)
    expect(r.conti).toEqual([])
    expect(r.linee).toEqual([])
  })
})

const linea = (over: Partial<LineaCreditoRow> = {}): LineaCreditoRow => ({
  id: 'l1',
  nome: 'Anticipo fatture Intesa',
  tipo: 'anticipo_fatture',
  accordato: 100000,
  ...over,
})

const anticipo = (over: Partial<AnticipoRow> = {}): AnticipoRow => ({
  id: 'a1',
  linea_id: 'l1',
  commessa_id: null,
  descrizione: '',
  importo: 15000,
  data_scadenza: null,
  rimborsato: false,
  ...over,
})

const OGGI = '2026-08-27'

describe('riepilogoBanche — linee e anticipi', () => {
  it('utilizzato = somma degli anticipi aperti, disponibile = plafond meno utilizzato', () => {
    const r = riepilogoBanche(
      [],
      [linea()],
      [anticipo({ id: 'a1', importo: 15000 }), anticipo({ id: 'a2', importo: 20000 })],
      {}, OGGI,
    )
    expect(r.lineeUtilizzato).toBe(35000)
    expect(r.linee[0].disponibile).toBe(65000)
    expect(r.linee[0].residuo).toBe(65000)
    expect(r.utilizzatoTotale).toBe(35000)
  })

  it('un anticipo rimborsato non è più debito e libera il plafond', () => {
    const r = riepilogoBanche(
      [],
      [linea()],
      [anticipo({ id: 'a1', importo: 15000, rimborsato: true }), anticipo({ id: 'a2', importo: 20000 })],
      {}, OGGI,
    )
    expect(r.lineeUtilizzato).toBe(20000)
    expect(r.linee[0].disponibile).toBe(80000)
    expect(r.linee[0].anticipi).toHaveLength(1)
    expect(r.linee[0].anticipi[0].id).toBe('a2')
  })

  it('anticipi oltre il plafond: disponibile a zero, mai negativo', () => {
    const r = riepilogoBanche([], [linea({ accordato: 10000 })], [anticipo({ importo: 15000 })], {}, OGGI)
    expect(r.linee[0].utilizzato).toBe(15000)
    expect(r.linee[0].disponibile).toBe(0)
    expect(r.residuoTotale).toBe(0)
  })

  it('linea senza anticipi: utilizzato zero, disponibile pari al plafond', () => {
    const r = riepilogoBanche([], [linea()], [], {}, OGGI)
    expect(r.linee[0].utilizzato).toBe(0)
    expect(r.linee[0].disponibile).toBe(100000)
  })

  it('commessa sconosciuta: niente residuo e niente promemoria', () => {
    const r = riepilogoBanche([], [linea()], [anticipo({ commessa_id: 'ignota' })], {}, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.residuoCommessa).toBeNull()
    expect(a.etichettaCommessa).toBeNull()
    expect(a.daChiudere).toBe(false)
  })

  it('commessa saldata: promemoria acceso, ma l’anticipo resta nei debiti', () => {
    const commesse: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
    }
    const r = riepilogoBanche([], [linea()], [anticipo({ commessa_id: 'c1' })], commesse, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.daChiudere).toBe(true)
    expect(a.etichettaCommessa).toBe('C-2026-014 — Rossi')
    expect(r.lineeUtilizzato).toBe(15000)
    expect(r.anticipiDaChiudere).toBe(1)
  })

  it('scaduto solo se la data è passata: oggi non è scaduto', () => {
    const ieri = riepilogoBanche([], [linea()], [anticipo({ data_scadenza: '2026-08-26' })], {}, OGGI)
    const stessoGiorno = riepilogoBanche([], [linea()], [anticipo({ data_scadenza: OGGI })], {}, OGGI)
    expect(ieri.linee[0].anticipi[0].scaduto).toBe(true)
    expect(ieri.anticipiScaduti).toBe(1)
    expect(stessoGiorno.linee[0].anticipi[0].scaduto).toBe(false)
    expect(stessoGiorno.anticipiScaduti).toBe(0)
  })

  it('un anticipo rimborsato non è né scaduto né da chiudere: è chiuso', () => {
    const commesse: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
    }
    const r = riepilogoBanche(
      [],
      [linea()],
      [anticipo({ commessa_id: 'c1', data_scadenza: '2026-01-01', rimborsato: true })],
      commesse, OGGI,
    )
    expect(r.anticipiScaduti).toBe(0)
    expect(r.anticipiDaChiudere).toBe(0)
    expect(r.linee[0].anticipi).toHaveLength(0)
  })

  it('conti e linee si sommano nel totale e nel residuo', () => {
    const r = riepilogoBanche(
      [conto({ accordato: 40000, disponibile: 10000 })],
      [linea({ accordato: 100000 })],
      [anticipo({ importo: 20000 })],
      {}, OGGI,
    )
    expect(r.utilizzatoTotale).toBe(50000)   // 30.000 di cassa + 20.000 di anticipi
    expect(r.residuoTotale).toBe(90000)      // 10.000 + 80.000
  })
})
