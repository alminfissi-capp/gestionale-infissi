import { describe, it, expect } from 'vitest'
import { CAMPI_IDENTITA, deveScollegareCliente } from '@/lib/clienti-identita'

const giovanna = { tipo: 'privato' as const, nome: 'Giovanna', cognome: 'Reale', ragione_sociale: null }
const italywater = { tipo: 'azienda' as const, nome: null, cognome: null, ragione_sociale: 'ITALYWATER' }

describe('deveScollegareCliente', () => {
  it('scollega se il cognome diventa quello di un altra persona', () => {
    // il caso reale: selezionata Giovanna Reale, riscritto sopra Marcello Zamueli
    expect(deveScollegareCliente(giovanna, 'cognome', 'Zamueli')).toBe(true)
    expect(deveScollegareCliente(giovanna, 'nome', 'Marcello')).toBe(true)
  })

  it('scollega se cambia la ragione sociale di un azienda', () => {
    expect(deveScollegareCliente(italywater, 'ragione_sociale', 'ALBERICO COSTRUZIONI')).toBe(true)
  })

  it('non scollega se non c è nessun cliente collegato', () => {
    expect(deveScollegareCliente(null, 'cognome', 'Zamueli')).toBe(false)
    expect(deveScollegareCliente(undefined, 'nome', 'Marcello')).toBe(false)
  })

  it('non scollega sui campi che non riguardano l identità', () => {
    for (const campo of ['telefono', 'email', 'cantiere', 'via', 'citta', 'cf_piva', 'cap']) {
      expect(deveScollegareCliente(giovanna, campo, 'qualunque cosa')).toBe(false)
    }
  })

  it('non scollega se il valore è di fatto lo stesso', () => {
    expect(deveScollegareCliente(giovanna, 'cognome', 'Reale')).toBe(false)
    expect(deveScollegareCliente(giovanna, 'cognome', '  reale ')).toBe(false)
    expect(deveScollegareCliente(giovanna, 'cognome', 'REALE')).toBe(false)
  })

  it('non scollega mentre si sta ancora digitando lo stesso valore', () => {
    // cancellando e riscrivendo "Reale" si passa da "" a "R", "Re", ... : sono
    // prefissi del valore attuale, scollegare qui darebbe un doppione a ogni ritocco
    expect(deveScollegareCliente(giovanna, 'cognome', '')).toBe(false)
    expect(deveScollegareCliente(giovanna, 'cognome', 'R')).toBe(false)
    expect(deveScollegareCliente(giovanna, 'cognome', 'Rea')).toBe(false)
  })

  it('scollega appena si esce dal prefisso', () => {
    expect(deveScollegareCliente(giovanna, 'cognome', 'Rex')).toBe(true)
    expect(deveScollegareCliente(giovanna, 'cognome', 'Realee')).toBe(true)
  })

  it('tratta null e stringa vuota allo stesso modo', () => {
    expect(deveScollegareCliente(italywater, 'nome', null)).toBe(false)
    expect(deveScollegareCliente(italywater, 'nome', '')).toBe(false)
  })

  it('espone i campi identità usati', () => {
    expect([...CAMPI_IDENTITA]).toEqual(['nome', 'cognome', 'ragione_sociale'])
  })
})
