import { describe, it, expect } from 'vitest'
import { CAMPI_IDENTITA, deveScollegareCliente, nomeCliente, trovaClientePerNome } from '@/lib/clienti-identita'

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

describe('nomeCliente', () => {
  it('usa la ragione sociale per le aziende', () => {
    expect(nomeCliente(italywater)).toBe('ITALYWATER')
  })

  it('unisce nome e cognome per i privati', () => {
    expect(nomeCliente(giovanna)).toBe('Giovanna Reale')
  })

  it('non lascia spazi penzolanti se manca una metà del nome', () => {
    expect(nomeCliente({ tipo: 'privato', nome: 'Marcello', cognome: null })).toBe('Marcello')
    expect(nomeCliente({ tipo: 'privato', nome: null, cognome: 'Labarbera' })).toBe('Labarbera')
  })

  it('ripiega sull email quando non c è nessun nome', () => {
    expect(nomeCliente({ tipo: 'azienda', ragione_sociale: '', email: 'info@telimar.it' })).toBe('info@telimar.it')
    expect(nomeCliente({ tipo: 'privato', nome: '', cognome: '', email: 'mario@rossi.it' })).toBe('mario@rossi.it')
  })

  it('non torna mai stringa vuota: senza dati mostra il trattino', () => {
    expect(nomeCliente({ tipo: 'privato' })).toBe('—')
    expect(nomeCliente({ tipo: 'azienda' })).toBe('—')
  })
})

describe('trovaClientePerNome', () => {
  const anagrafica = [
    { id: 'g', ...giovanna },
    { id: 'i', ...italywater },
    { id: 't', tipo: 'azienda' as const, ragione_sociale: "TELIMAR - TEMPO LIBERO MARE SOCIETA' COOPERATIVA" },
  ]

  it('trova il cliente il cui nome coincide con quello salvato sulla commessa', () => {
    expect(trovaClientePerNome(anagrafica, 'Giovanna Reale')?.id).toBe('g')
    expect(trovaClientePerNome(anagrafica, 'ITALYWATER')?.id).toBe('i')
  })

  it('ignora maiuscole, accenti, apostrofi tipografici e spazi doppi', () => {
    expect(trovaClientePerNome(anagrafica, '  giovanna   reale ')?.id).toBe('g')
    expect(trovaClientePerNome(anagrafica, "telimar - tempo libero mare societa\u2019 cooperativa")?.id).toBe('t')
  })

  it('non aggancia un nome solo somigliante: meglio nessuno che il cliente sbagliato', () => {
    // il caso reale: la commessa scritta "TeliMar" non e' la societa' in anagrafica
    expect(trovaClientePerNome(anagrafica, 'TeliMar')).toBeNull()
    expect(trovaClientePerNome(anagrafica, 'Giovanna')).toBeNull()
  })

  it('non aggancia niente se il nome e vuoto o assente', () => {
    expect(trovaClientePerNome(anagrafica, '')).toBeNull()
    expect(trovaClientePerNome(anagrafica, '   ')).toBeNull()
    expect(trovaClientePerNome(anagrafica, null)).toBeNull()
    expect(trovaClientePerNome(anagrafica, undefined)).toBeNull()
  })
})
