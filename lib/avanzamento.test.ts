// lib/avanzamento.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcolaAvanzamento, calcolaSemaforo, formattaDurata, AVANZAMENTO_VUOTO,
} from '@/lib/avanzamento'
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
    expect(a.inCorso).toBe(1)
    expect(a.bloccate).toBe(1)
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

describe('calcolaSemaforo', () => {
  const con = (stati: string[]) =>
    calcolaSemaforo(calcolaAvanzamento(stati.map((stato) => ({ tipo: 'posa', stato })), ASPETTI))

  it('senza attività resta in stand-by', () => {
    expect(calcolaSemaforo(AVANZAMENTO_VUOTO)).toEqual({ verde: false, giallo: true, rosso: false })
  })

  it('con tutto ancora da fare resta in stand-by', () => {
    expect(con(['programmato', 'programmato'])).toEqual({ verde: false, giallo: true, rosso: false })
  })

  it('una attività in corso accende il verde e spegne il giallo', () => {
    expect(con(['in_corso', 'programmato'])).toEqual({ verde: true, giallo: false, rosso: false })
  })

  it('due in corso e una bloccata tengono accesi verde e rosso insieme', () => {
    expect(con(['in_corso', 'in_corso', 'bloccato'])).toEqual({
      verde: true, giallo: false, rosso: true,
    })
  })

  it('una bloccata senza nessuno al lavoro accende giallo e rosso', () => {
    expect(con(['bloccato', 'programmato'])).toEqual({ verde: false, giallo: true, rosso: true })
  })

  it('il rosso non spegne mai il giallo: e‘ il verde a farlo', () => {
    expect(con(['bloccato'])).toMatchObject({ giallo: true })
    expect(con(['bloccato', 'in_corso'])).toMatchObject({ giallo: false })
  })
})

describe('formattaDurata', () => {
  it('sotto il minuto mostra i secondi', () => {
    expect(formattaDurata(0)).toBe('0s')
    expect(formattaDurata(45)).toBe('45s')
  })

  it('sopra il minuto mostra i minuti interi', () => {
    expect(formattaDurata(60)).toBe('1m')
    expect(formattaDurata(12 * 60 + 59)).toBe('12m')
  })

  it('sopra l’ora mostra ore e minuti a due cifre', () => {
    expect(formattaDurata(3600)).toBe('1h 00m')
    expect(formattaDurata(2 * 3600 + 5 * 60)).toBe('2h 05m')
  })

  it('non va sotto zero con i secondi negativi', () => {
    expect(formattaDurata(-10)).toBe('0s')
  })
})
