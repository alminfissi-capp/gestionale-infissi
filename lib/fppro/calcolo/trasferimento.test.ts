import { describe, expect, it } from 'vitest'
import { clienteDelRilievo, clienteEsistente, motivoCalcoloSuperato, motivoVoceNonCalcolabile } from './trasferimento'

describe('clienteEsistente', () => {
  const clienti = [
    { id: 'a', tipo: 'privato' as const, nome: 'Mario', cognome: 'Rossi', telefono: '+39 347 111 2222' },
    { id: 'b', tipo: 'privato' as const, nome: 'Mario', cognome: 'Rossi', telefono: '3209998888' },
    { id: 'c', tipo: 'azienda' as const, ragione_sociale: 'Edil Sud srl', telefono: null },
    { id: 'd', tipo: 'privato' as const, nome: 'Anna', cognome: 'Bianchi', telefono: null },
  ]
  const snap = (s: Partial<{ tipo: 'privato' | 'azienda'; ragione_sociale: string | null; nome: string | null; cognome: string | null; telefono: string | null }>) =>
    ({ tipo: 'privato' as const, ragione_sociale: null, nome: null, cognome: null, telefono: null, ...s })

  it('nome unico in anagrafica: quel cliente', () => {
    expect(clienteEsistente(snap({ nome: 'anna', cognome: 'bianchi' }), clienti)).toBe('d')
  })
  it('omonimi: decide il telefono, in qualunque formato', () => {
    expect(clienteEsistente(snap({ nome: 'Mario', cognome: 'Rossi', telefono: '3471112222' }), clienti)).toBe('a')
  })
  it('omonimi senza telefono che li distingua: nessuno (meglio un cliente nuovo che quello sbagliato)', () => {
    expect(clienteEsistente(snap({ nome: 'Mario', cognome: 'Rossi' }), clienti)).toBeNull()
  })
  it('azienda per ragione sociale', () => {
    expect(clienteEsistente(snap({ tipo: 'azienda', ragione_sociale: 'EDIL SUD SRL' }), clienti)).toBe('c')
  })
  it('nome assente o non in anagrafica: null', () => {
    expect(clienteEsistente(snap({}), clienti)).toBeNull()
    expect(clienteEsistente(snap({ nome: 'Luca', cognome: 'Verdi' }), clienti)).toBeNull()
  })
  it('nome solo contenuto in un altro (Anna vs Annamaria): non basta', () => {
    expect(clienteEsistente(snap({ nome: 'Ann', cognome: 'Bianchi' }), clienti)).toBeNull()
  })
})

describe('motivoCalcoloSuperato', () => {
  const calcolo = { calcolatoAt: '2026-10-11T10:00:00.000Z', voci: [{ voceId: 'v1' }], saltate: [{ voceId: 'v2' }] }
  it('nulla di cambiato dopo il calcolo: si puo\' trasferire', () => {
    expect(motivoCalcoloSuperato(calcolo, [
      { id: 'v1', updated_at: '2026-10-11T09:00:00Z', correzioni_fp_at: null },
      { id: 'v2', updated_at: '2026-10-11T09:30:00Z', correzioni_fp_at: null },
    ])).toBeNull()
  })
  it('voce modificata dal telefono dopo il calcolo', () => {
    expect(motivoCalcoloSuperato(calcolo, [
      { id: 'v1', updated_at: '2026-10-11T10:05:00Z', correzioni_fp_at: null },
      { id: 'v2', updated_at: '2026-10-11T09:30:00Z', correzioni_fp_at: null },
    ])).toMatch(/modificat/)
  })
  it('correzioni salvate dopo il calcolo (ricalcolo non riuscito)', () => {
    expect(motivoCalcoloSuperato(calcolo, [
      { id: 'v1', updated_at: '2026-10-11T09:00:00Z', correzioni_fp_at: '2026-10-11T10:01:00Z' },
      { id: 'v2', updated_at: '2026-10-11T09:30:00Z', correzioni_fp_at: null },
    ])).toMatch(/modificat/)
  })
  it('voce aggiunta o eliminata dopo il calcolo', () => {
    expect(motivoCalcoloSuperato(calcolo, [{ id: 'v1', updated_at: '2026-10-11T09:00:00Z', correzioni_fp_at: null }])).toMatch(/eliminat/)
    expect(motivoCalcoloSuperato(calcolo, [
      { id: 'v1', updated_at: '2026-10-11T09:00:00Z', correzioni_fp_at: null },
      { id: 'v2', updated_at: '2026-10-11T09:00:00Z', correzioni_fp_at: null },
      { id: 'v3', updated_at: '2026-10-11T09:00:00Z', correzioni_fp_at: null },
    ])).toMatch(/aggiunt/)
  })
})

describe('motivoVoceNonCalcolabile', () => {
  const struttura = { errore: null, albero: [{}] }
  it('voce con misure e struttura leggibile: si calcola', () => {
    expect(motivoVoceNonCalcolabile(struttura, { larghezza: 1000, altezza: 1200 })).toBeNull()
  })
  it('struttura assente, illeggibile o vuota', () => {
    expect(motivoVoceNonCalcolabile(undefined, { larghezza: 1000, altezza: 1200 })).toMatch(/non trovata/)
    expect(motivoVoceNonCalcolabile({ errore: 'formato vecchio', albero: [] }, { larghezza: 1000, altezza: 1200 })).toMatch(/non leggibile/)
    expect(motivoVoceNonCalcolabile({ errore: null, albero: [] }, { larghezza: 1000, altezza: 1200 })).toMatch(/non leggibile/)
  })
  it('misure mancanti', () => {
    expect(motivoVoceNonCalcolabile(struttura, { larghezza: null, altezza: 1200 })).toMatch(/misure/)
  })
})

describe('clienteDelRilievo', () => {
  const clienti = [
    { id: 'a', tipo: 'privato' as const, nome: 'Giuseppe', cognome: 'Palazzotto', telefono: '+39 335205800', ragione_sociale: null },
    { id: 'b', tipo: 'privato' as const, nome: 'Giuseppe', cognome: 'Palazzotto', telefono: null, ragione_sociale: null },
  ]
  const base = { tipo: 'privato' as const, ragione_sociale: null, nome: null, cognome: null, telefono: null }
  it('cliente scelto dall\'anagrafica in cantiere: proprio quello, anche tra omonimi', () => {
    expect(clienteDelRilievo({ ...base, nome: 'Giuseppe', cognome: 'Palazzotto', clienteId: 'b' }, clienti)).toBe('b')
  })
  it('cliente scelto ma poi eliminato dall\'anagrafica: si cerca per nome', () => {
    expect(clienteDelRilievo({ ...base, nome: 'Giuseppe', cognome: 'Palazzotto', telefono: '335205800', clienteId: 'x' }, clienti)).toBe('a')
  })
  it('senza cliente scelto: come clienteEsistente', () => {
    expect(clienteDelRilievo({ ...base, cognome: 'Giuseppe Palazzotto' }, clienti)).toBeNull()
  })
})
