// lib/avanzamento.test.ts
import { describe, it, expect } from 'vitest'
import { calcolaAvanzamento, AVANZAMENTO_VUOTO } from '@/lib/avanzamento'
import type { AspettiTipo } from '@/types/calendario'

const ASPETTI: AspettiTipo = {
  lavorazione: { label: 'Lavorazione', sfondo: '#FF8C00', testo: '#2B1400' },
  posa:        { label: 'Posa',        sfondo: '#A6D64B', testo: '#152300' },
  carico:      { label: 'Carico',      sfondo: '#FFFF00', testo: '#2B2B00' },
}

describe('calcolaAvanzamento', () => {
  it('senza attività restituisce l’avanzamento vuoto', () => {
    expect(calcolaAvanzamento([], ASPETTI)).toEqual(AVANZAMENTO_VUOTO)
  })

  it('una completata su quattro fa 25%', () => {
    const a = calcolaAvanzamento([
      { tipo: 'lavorazione', stato: 'completato' },
      { tipo: 'lavorazione', stato: 'programmato' },
      { tipo: 'carico',      stato: 'in_corso' },
      { tipo: 'posa',        stato: 'bloccato' },
    ], ASPETTI)
    expect(a.totale).toBe(4)
    expect(a.completate).toBe(1)
    expect(a.percentuale).toBe(25)
  })

  it('la stessa attività completata su cinque fasi vale 20%', () => {
    const a = calcolaAvanzamento([
      { tipo: 'lavorazione', stato: 'completato' },
      { tipo: 'lavorazione', stato: 'programmato' },
      { tipo: 'lavorazione', stato: 'programmato' },
      { tipo: 'carico',      stato: 'programmato' },
      { tipo: 'posa',        stato: 'programmato' },
    ], ASPETTI)
    expect(a.percentuale).toBe(20)
  })

  it('tutte completate fanno 100%', () => {
    const a = calcolaAvanzamento([
      { tipo: 'lavorazione', stato: 'completato' },
      { tipo: 'posa',        stato: 'completato' },
    ], ASPETTI)
    expect(a.percentuale).toBe(100)
    expect(a.fette.every((f) => f.completata)).toBe(true)
  })

  it('ogni fetta porta il colore del suo tipo, nell’ordine ricevuto', () => {
    const a = calcolaAvanzamento([
      { tipo: 'carico',      stato: 'completato' },
      { tipo: 'lavorazione', stato: 'programmato' },
    ], ASPETTI)
    expect(a.fette).toEqual([
      { colore: '#FFFF00', completata: true },
      { colore: '#FF8C00', completata: false },
    ])
  })

  it('un tipo cancellato dall’anagrafica non fa esplodere il conto', () => {
    const a = calcolaAvanzamento([{ tipo: 'sparito', stato: 'completato' }], ASPETTI)
    expect(a.percentuale).toBe(100)
    expect(a.fette[0].colore).toBe('#D4D4D4')
  })

  it('le attività annullate non contano come fasi', () => {
    const a = calcolaAvanzamento([
      { tipo: 'lavorazione', stato: 'completato' },
      { tipo: 'posa',        stato: 'annullato' },
    ], ASPETTI)
    expect(a.totale).toBe(1)
    expect(a.percentuale).toBe(100)
  })

  it('arrotonda le percentuali che non tornano intere', () => {
    const a = calcolaAvanzamento([
      { tipo: 'lavorazione', stato: 'completato' },
      { tipo: 'lavorazione', stato: 'programmato' },
      { tipo: 'lavorazione', stato: 'programmato' },
    ], ASPETTI)
    expect(a.percentuale).toBe(33)
  })
})
