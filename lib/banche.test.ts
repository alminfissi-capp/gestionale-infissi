import { describe, it, expect } from 'vitest'
import {
  utilizzoConto,
  riepilogoBanche,
  type ContoBancaRow,
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
