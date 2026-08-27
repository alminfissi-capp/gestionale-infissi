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

  it('conto in pari col fido: niente utilizzato e niente soldi propri', () => {
    const r = utilizzoConto(conto({ accordato: 40000, disponibile: 40000 }))
    expect(r.utilizzato).toBe(0)
    expect(r.propria).toBe(0)
    expect(r.residuo).toBe(40000)
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

  it('conto senza fido ma in rosso: entra nel dettaglio, altrimenti il totale non torna', () => {
    const r = riepilogoBanche(
      [conto({ id: 'x', accordato: 0, disponibile: -500 })],
      [], [], {}, '2026-08-27',
    )
    expect(r.fidoCassaUtilizzato).toBe(500)
    expect(r.conti).toHaveLength(1)
    expect(r.conti[0].utilizzato).toBe(500)
    // L'invariante che questo test difende: le righe del dettaglio sommano sempre al totale
    expect(r.conti.reduce((s, c) => s + c.utilizzato, 0)).toBe(r.fidoCassaUtilizzato)
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
  commesse_ids: [],
  descrizione: '',
  importo: 15000,
  scalato: 0,
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
    const r = riepilogoBanche([], [linea()], [anticipo({ commesse_ids: ['ignota'] })], {}, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.residuoCommesse).toBeNull()
    expect(a.commesse).toEqual([])
    expect(a.daChiudere).toBe(false)
  })

  // Il promemoria NON dipende dal saldo delle commesse: la banca a volte trattiene
  // l'acconto per rientrare, a volte no. Finché non si spuntano gli acconti trattenuti,
  // alla banca si deve ancora tutto, anche se il cliente ha già pagato.
  it('cliente che ha saldato ma banca che non ha trattenuto: si deve ancora tutto', () => {
    const commesse: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
    }
    const r = riepilogoBanche([], [linea()], [anticipo({ commesse_ids: ['c1'] })], commesse, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.residuoCommesse).toBe(0)
    expect(a.daRestituire).toBe(15000)
    expect(a.daChiudere).toBe(false)
    expect(r.lineeUtilizzato).toBe(15000)
    expect(r.anticipiDaChiudere).toBe(0)
  })

  it('commessa collegata ma non ancora saldata: nessun promemoria', () => {
    const commesse: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 500 },
    }
    const r = riepilogoBanche([], [linea()], [anticipo({ commesse_ids: ['c1'] })], commesse, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.residuoCommesse).toBe(500)
    expect(a.commesse.map((c) => c.etichetta)).toEqual(['C-2026-014 — Rossi'])
    expect(a.daChiudere).toBe(false)
    expect(r.anticipiDaChiudere).toBe(0)
  })

  // Una fattura sola emessa per più lavori: l'anticipo copre più commesse insieme.
  const dueCommesse: Record<string, InfoCommessa> = {
    c1: { etichetta: 'C-2026-014 — Rossi', residuo: 500 },
    c2: { etichetta: 'C-2026-015 — Bianchi', residuo: 300 },
  }

  it('più commesse collegate: il residuo è la somma, e le mostra tutte', () => {
    const r = riepilogoBanche(
      [], [linea()], [anticipo({ commesse_ids: ['c1', 'c2'] })], dueCommesse, OGGI,
    )
    const a = r.linee[0].anticipi[0]
    expect(a.residuoCommesse).toBe(800)
    expect(a.commesse.map((c) => c.etichetta))
      .toEqual(['C-2026-014 — Rossi', 'C-2026-015 — Bianchi'])
    expect(a.daChiudere).toBe(false)
  })

  it('più commesse: si sommano i residui, ma non decidono il promemoria', () => {
    const unaSola: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
      c2: { etichetta: 'C-2026-015 — Bianchi', residuo: 300 },
    }
    const r = riepilogoBanche(
      [], [linea()], [anticipo({ commesse_ids: ['c1', 'c2'] })], unaSola, OGGI,
    )
    expect(r.linee[0].anticipi[0].residuoCommesse).toBe(300)
    expect(r.linee[0].anticipi[0].daChiudere).toBe(false)
  })

  it('una commessa collegata non si trova: niente promemoria, nemmeno se le altre sono saldate', () => {
    const soloUna: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
    }
    const r = riepilogoBanche(
      [], [linea()], [anticipo({ commesse_ids: ['c1', 'sparita'] })], soloUna, OGGI,
    )
    const a = r.linee[0].anticipi[0]
    expect(a.commesse).toHaveLength(1)
    expect(a.residuoCommesse).toBe(0)
    expect(a.daChiudere).toBe(false)
  })

  it('anticipo senza nessuna commessa: nessun residuo e nessun promemoria', () => {
    const r = riepilogoBanche([], [linea()], [anticipo({ commesse_ids: [] })], dueCommesse, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.commesse).toEqual([])
    expect(a.residuoCommesse).toBeNull()
    expect(a.daChiudere).toBe(false)
  })

  // ── Rientri parziali: gli acconti che la banca trattiene scalano il debito ──
  it('acconti trattenuti: 10.000 erogati con 4.000 rientrati pesano 6.000', () => {
    const r = riepilogoBanche(
      [], [linea()], [anticipo({ importo: 10000, scalato: 4000 })], {}, OGGI,
    )
    const a = r.linee[0].anticipi[0]
    expect(a.importo).toBe(10000)
    expect(a.scalato).toBe(4000)
    expect(a.daRestituire).toBe(6000)
    expect(a.daChiudere).toBe(false)
  })

  it('il plafond si libera man mano che la banca rientra', () => {
    const r = riepilogoBanche(
      [], [linea({ accordato: 100000 })], [anticipo({ importo: 10000, scalato: 4000 })], {}, OGGI,
    )
    expect(r.lineeUtilizzato).toBe(6000)
    expect(r.linee[0].disponibile).toBe(94000)
  })

  it('acconti che superano l’erogato: niente da restituire, mai un credito', () => {
    const r = riepilogoBanche(
      [], [linea()], [anticipo({ importo: 10000, scalato: 12000 })], {}, OGGI,
    )
    const a = r.linee[0].anticipi[0]
    expect(a.daRestituire).toBe(0)
    expect(r.lineeUtilizzato).toBe(0)
    expect(a.daChiudere).toBe(true)
  })

  it('rientro completo: promemoria acceso, ma resta nei debiti a zero finché non si archivia', () => {
    const r = riepilogoBanche(
      [], [linea()], [anticipo({ importo: 10000, scalato: 10000 })], {}, OGGI,
    )
    const a = r.linee[0].anticipi[0]
    expect(a.daRestituire).toBe(0)
    expect(a.daChiudere).toBe(true)
    expect(r.anticipiDaChiudere).toBe(1)
    // Sta ancora nell'elenco: la spunta "rimborsato" la mette una persona.
    expect(r.linee[0].anticipi).toHaveLength(1)
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
      [anticipo({ commesse_ids: ['c1'], data_scadenza: '2026-01-01', rimborsato: true })],
      commesse, OGGI,
    )
    expect(r.anticipiScaduti).toBe(0)
    expect(r.anticipiDaChiudere).toBe(0)
    expect(r.linee[0].anticipi).toHaveLength(0)
  })

  it('anticipo che punta a una linea inesistente: resta fuori da tutti i totali', () => {
    const r = riepilogoBanche([], [linea({ id: 'l1' })], [anticipo({ linea_id: 'l-sconosciuta' })], {}, OGGI)
    expect(r.lineeUtilizzato).toBe(0)
    expect(r.utilizzatoTotale).toBe(0)
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
