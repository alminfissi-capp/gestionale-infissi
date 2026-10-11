import { describe, expect, it } from 'vitest'
import { separaNome } from './rilievo-cliente'

describe('separaNome (cliente nuovo scritto in cantiere)', () => {
  it('"Giuseppe Palazzotto": nome e cognome', () => expect(separaNome('Giuseppe Palazzotto')).toEqual({ nome: 'Giuseppe', cognome: 'Palazzotto' }))
  it('cognome composto: il resto e\' cognome', () => expect(separaNome('Anna De Luca')).toEqual({ nome: 'Anna', cognome: 'De Luca' }))
  it('una parola sola: cognome', () => expect(separaNome(' Rossi ')).toEqual({ nome: '', cognome: 'Rossi' }))
  it('spazi in piu\'', () => expect(separaNome('  Mario   Rossi ')).toEqual({ nome: 'Mario', cognome: 'Rossi' }))
})
