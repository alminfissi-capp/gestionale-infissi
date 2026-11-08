import { describe, expect, it } from 'vitest'
import { clienteDaRegistrare, separaNome, snapshotDalModulo, snapshotPerModulo } from './rilievo-cliente'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

describe('separaNome (cliente nuovo scritto in cantiere)', () => {
  it('"Giuseppe Palazzotto": nome e cognome', () => expect(separaNome('Giuseppe Palazzotto')).toEqual({ nome: 'Giuseppe', cognome: 'Palazzotto' }))
  it('cognome composto: il resto e\' cognome', () => expect(separaNome('Anna De Luca')).toEqual({ nome: 'Anna', cognome: 'De Luca' }))
  it('una parola sola: cognome', () => expect(separaNome(' Rossi ')).toEqual({ nome: '', cognome: 'Rossi' }))
  it('spazi in piu\'', () => expect(separaNome('  Mario   Rossi ')).toEqual({ nome: 'Mario', cognome: 'Rossi' }))
})

describe('cliente del rilievo e modulo dei preventivi', () => {
  const privato: ClienteSnapshotRilievo = {
    tipo: 'privato', ragione_sociale: null, nome: 'Anna', cognome: 'De Luca', telefono: '+39 333 1234567', email: 'a@b.it',
    indirizzo: 'Via Roma 12, 90100 Palermo', cantiere: 'Mondello', clienteId: 'c1',
    via: 'Via Roma', civico: '12', cap: '90100', citta: 'Palermo', provincia: 'PA', nazione: 'Italia', codice_sdi: null, cf_piva: 'DLCNNA80A41G273X',
  }
  const azienda: ClienteSnapshotRilievo = {
    tipo: 'azienda', ragione_sociale: 'Edil Srl', nome: null, cognome: null, telefono: null, email: null,
    indirizzo: null, cantiere: null, clienteId: null, codice_sdi: 'ABC1234', cf_piva: '01234567890',
  }
  it('andata e ritorno senza perdite (privato)', () =>
    expect(snapshotDalModulo(snapshotPerModulo(privato), 'c1')).toEqual(privato))
  it('andata e ritorno senza perdite (azienda)', () => {
    const r = snapshotDalModulo(snapshotPerModulo(azienda), null)
    expect(r.ragione_sociale).toBe('Edil Srl')
    expect(r.codice_sdi).toBe('ABC1234')
    expect(r.cf_piva).toBe('01234567890')
    expect(r.clienteId).toBeNull()
  })
  it('indirizzo composto dai campi quando manca', () => {
    const s = { ...snapshotPerModulo(privato), indirizzo: null }
    expect(snapshotDalModulo(s, null).indirizzo).toBe('Via Roma 12, 90100 Palermo')
  })
  it('vecchi rilievi senza i campi dell indirizzo: si apre il modulo senza errori', () => {
    const vecchio: ClienteSnapshotRilievo = { tipo: 'privato', ragione_sociale: null, nome: 'Mario', cognome: 'Rossi', telefono: null, email: null, indirizzo: 'Via Etna 3', cantiere: null }
    expect(snapshotPerModulo(vecchio).via).toBeNull()
    expect(snapshotDalModulo(snapshotPerModulo(vecchio), null).indirizzo).toBe('Via Etna 3')
  })
  it('da registrare: solo con la rete, senza scheda e con un nome', () => {
    expect(clienteDaRegistrare({ ...privato, clienteId: null }, true)).toBe(true)
    expect(clienteDaRegistrare({ ...privato, clienteId: null }, false)).toBe(false)
    expect(clienteDaRegistrare(privato, true)).toBe(false)
    expect(clienteDaRegistrare({ ...privato, clienteId: null, nome: null, cognome: null }, true)).toBe(false)
    expect(clienteDaRegistrare({ ...azienda }, true)).toBe(true)
  })
})
