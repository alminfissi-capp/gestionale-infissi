import { describe, expect, it } from 'vitest'
import { pagamentiDaRegistrare, vociPagamentiDashboard } from './attivita'

describe('voci della dashboard per i pagamenti online', () => {
  it('pagato con Klarna: importo, metodo, cliente e link alla commessa se c\'e\'', () => {
    const v = vociPagamentiDashboard([
      { id: 'a', importo: 300, stato: 'pagato', metodo: 'klarna', pagato_at: '2026-11-16T10:00:00Z', updated_at: '2026-11-16T10:00:00Z',
        preventivo_id: 'p1', cliente: 'Mario Rossi', commessa_id: 'c1' },
    ])
    expect(v).toEqual([{ tipo: 'pagamento', azione: 'Pagato online — € 300,00 (Klarna)', descrizione: 'Mario Rossi', href: '/commesse/c1', data: '2026-11-16T10:00:00Z' }])
  })

  it('rimborsato e senza commessa: link al preventivo', () => {
    const v = vociPagamentiDashboard([
      { id: 'b', importo: 300, stato: 'rimborsato', metodo: 'card', pagato_at: '2026-11-16T10:00:00Z', updated_at: '2026-11-17T09:00:00Z',
        preventivo_id: 'p2', cliente: 'Edil Sud', commessa_id: null },
    ])
    expect(v[0]).toMatchObject({ azione: 'Pagamento online rimborsato — € 300,00', href: '/preventivi/p2', data: '2026-11-17T09:00:00Z' })
  })
})

describe('pagamenti da portare in commessa', () => {
  it('solo i pagati senza acconto, mai due volte', () => {
    const pagamenti = [
      { id: 'x', stato: 'pagato', acconto_commessa_id: null },
      { id: 'y', stato: 'pagato', acconto_commessa_id: 'acc1' },
      { id: 'z', stato: 'rimborsato', acconto_commessa_id: null },
      { id: 'w', stato: 'creato', acconto_commessa_id: null },
    ]
    expect(pagamentiDaRegistrare(pagamenti, new Set())).toEqual(['x'])
    // risalvando i preventivi collegati: l'acconto di x esiste gia' -> niente
    expect(pagamentiDaRegistrare(pagamenti, new Set(['x']))).toEqual([])
  })
})
