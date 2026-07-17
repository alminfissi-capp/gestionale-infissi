import { describe, it, expect } from 'vitest'
import {
  calcolaTotaleRigaOrdine,
  calcolaTotaleOrdine,
  isInRitardo,
  prossimoNumeroOrdine,
} from '@/lib/produzione'

describe('calcolaTotaleRigaOrdine', () => {
  it('moltiplica quantita per prezzo unitario', () => {
    expect(calcolaTotaleRigaOrdine({ quantita: 3, prezzo_unitario: 10.5 })).toBe(31.5)
  })

  it('vale 0 se il prezzo manca (ordine senza prezzi)', () => {
    expect(calcolaTotaleRigaOrdine({ quantita: 3, prezzo_unitario: null })).toBe(0)
  })

  it('arrotonda a 2 decimali', () => {
    expect(calcolaTotaleRigaOrdine({ quantita: 3, prezzo_unitario: 0.3333 })).toBe(1)
  })
})

describe('calcolaTotaleOrdine', () => {
  it('somma le righe', () => {
    const righe = [
      { quantita: 2, prezzo_unitario: 10 },
      { quantita: 1, prezzo_unitario: 5.5 },
    ]
    expect(calcolaTotaleOrdine(righe)).toBe(25.5)
  })

  it('vale 0 senza righe', () => {
    expect(calcolaTotaleOrdine([])).toBe(0)
  })

  it('ignora le righe senza prezzo invece di produrre NaN', () => {
    const righe = [
      { quantita: 2, prezzo_unitario: 10 },
      { quantita: 5, prezzo_unitario: null },
    ]
    expect(calcolaTotaleOrdine(righe)).toBe(20)
  })
})

describe('isInRitardo', () => {
  const oggi = new Date('2026-07-17')

  it('e in ritardo se la consegna prevista e passata e non e arrivato', () => {
    expect(isInRitardo('2026-07-10', 'ordinato', oggi)).toBe(true)
    expect(isInRitardo('2026-07-10', 'da_ordinare', oggi)).toBe(true)
  })

  it('non e mai in ritardo se e arrivato', () => {
    expect(isInRitardo('2026-07-10', 'arrivato', oggi)).toBe(false)
  })

  it('non e in ritardo se e annullato', () => {
    expect(isInRitardo('2026-07-10', 'annullato', oggi)).toBe(false)
  })

  it('non e in ritardo se la consegna e futura', () => {
    expect(isInRitardo('2026-07-20', 'ordinato', oggi)).toBe(false)
  })

  it('non e in ritardo il giorno stesso della consegna', () => {
    expect(isInRitardo('2026-07-17', 'ordinato', oggi)).toBe(false)
  })

  it('non e in ritardo senza data di consegna prevista', () => {
    expect(isInRitardo(null, 'ordinato', oggi)).toBe(false)
  })
})

describe('prossimoNumeroOrdine', () => {
  it('parte da 001 se non ci sono ordini per quell anno', () => {
    expect(prossimoNumeroOrdine([], 2026)).toBe('2026-001')
  })

  it('incrementa il massimo dell anno', () => {
    expect(prossimoNumeroOrdine(['2026-001', '2026-002'], 2026)).toBe('2026-003')
  })

  it('ignora gli anni diversi', () => {
    expect(prossimoNumeroOrdine(['2025-009', '2026-001'], 2026)).toBe('2026-002')
  })

  it('ignora i numeri non conformi inseriti a mano', () => {
    expect(prossimoNumeroOrdine(['ordine urgente', '2026-004'], 2026)).toBe('2026-005')
  })

  it('usa il massimo, non il conteggio, se ci sono buchi', () => {
    expect(prossimoNumeroOrdine(['2026-001', '2026-007'], 2026)).toBe('2026-008')
  })
})
