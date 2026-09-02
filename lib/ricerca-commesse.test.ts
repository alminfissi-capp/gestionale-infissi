import { describe, it, expect } from 'vitest'
import { filtraCommesse, type CommessaRicercabile } from './ricerca-commesse'

const COMMESSE: CommessaRicercabile[] = [
  { numero_commessa: '33-2026', cliente_nome: 'Guarracino Loredana', numeri_preventivo: ['PRE WIN 251/2026 G'] },
  { numero_commessa: '12-2026', cliente_nome: 'Comparato Niño',      numeri_preventivo: ['PRE WIN 174/2026 G', 'PRE WIN 180/2026 G'] },
  { numero_commessa: null,      cliente_nome: 'Rossi Mario',         numeri_preventivo: [] },
]

const numeri = (r: CommessaRicercabile[]) => r.map((c) => c.numero_commessa)

describe('filtraCommesse', () => {
  it('trova per numero commessa', () => {
    expect(numeri(filtraCommesse(COMMESSE, '33-2026'))).toEqual(['33-2026'])
  })

  it('trova per nome cliente, ignorando accenti e maiuscole', () => {
    expect(numeri(filtraCommesse(COMMESSE, 'NINO'))).toEqual(['12-2026'])
  })

  it('trova per il numero di un preventivo secondario, non solo il principale', () => {
    expect(numeri(filtraCommesse(COMMESSE, '180/2026'))).toEqual(['12-2026'])
  })

  // La regola ereditata da lib/ricerca-clienti.ts: ogni parola deve trovare
  // riscontro in almeno un campo, non tutte nello stesso.
  it('accetta parole sparse su campi diversi, in qualunque ordine', () => {
    expect(numeri(filtraCommesse(COMMESSE, 'guarracino 251'))).toEqual(['33-2026'])
    expect(numeri(filtraCommesse(COMMESSE, '251 guarracino'))).toEqual(['33-2026'])
  })

  it('con query vuota o di soli spazi restituisce tutto', () => {
    expect(filtraCommesse(COMMESSE, '')).toHaveLength(3)
    expect(filtraCommesse(COMMESSE, '   ')).toHaveLength(3)
  })

  it('senza riscontro restituisce elenco vuoto', () => {
    expect(filtraCommesse(COMMESSE, 'inesistente')).toEqual([])
  })

  it('regge una commessa senza numero', () => {
    expect(numeri(filtraCommesse(COMMESSE, 'rossi'))).toEqual([null])
  })
})
