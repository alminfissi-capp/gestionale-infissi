import { describe, it, expect } from 'vitest'
import { mappaDocumento } from '@/lib/fic/mappa'
import type { DocumentoFic } from '@/lib/fic/tipi'

const ORA = '2026-09-28T12:00:00.000Z'

const doc = (over: Partial<DocumentoFic> = {}): DocumentoFic => ({
  id: 101,
  date: '2026-03-10',
  updated_at: '2026-03-11 09:15:00',
  entity: { id: 9, name: 'Alluminio Sud srl', vat_number: '01234567890' },
  category: 'Materiali',
  description: 'Profili serie 45',
  invoice_number: 'FT 12/2026',
  e_invoice: true,
  amount_net: 1000,
  amount_vat: 220,
  amount_withholding_tax: 0,
  amount_other_withholding_tax: 0,
  amount_gross: 1220,
  next_due_date: '2026-04-30',
  attachment_url: 'https://temporaneo/abc',
  attachment_preview_url: 'https://temporaneo/prev',
  payments_list: [
    { id: 1, amount: 610, due_date: '2026-03-31', paid_date: '2026-03-31', status: 'paid', payment_account: { id: 5, name: 'Intesa' } },
    { id: 2, amount: 610, due_date: '2026-04-30', paid_date: null, status: 'not_paid', payment_account: null },
  ],
  ...over,
})

describe('mappaDocumento', () => {
  it('mappa una fattura con due rate', () => {
    const { fattura, rate } = mappaDocumento(doc(), 'expense', ORA)
    expect(fattura).toMatchObject({
      fic_id: 101,
      tipo: 'fattura',
      numero: 'FT 12/2026',
      data: '2026-03-10',
      descrizione: 'Profili serie 45',
      categoria: 'Materiali',
      elettronica: true,
      fornitore_fic_id: 9,
      fornitore_nome: 'Alluminio Sud srl',
      fornitore_piva: '01234567890',
      importo_netto: 1000,
      importo_iva: 220,
      ritenuta: 0,
      altra_ritenuta: 0,
      importo_lordo: 1220,
      prossima_scadenza: '2026-04-30',
      ha_allegato: true,
      fic_updated_at: '2026-03-11 09:15:00',
      sincronizzata_at: ORA,
    })
    expect(rate).toEqual([
      { fic_id: 1, importo: 610, scadenza: '2026-03-31', stato: 'pagata', pagata_il: '2026-03-31', conto_fic_id: 5, conto_nome: 'Intesa', ordine: 0 },
      { fic_id: 2, importo: 610, scadenza: '2026-04-30', stato: 'da_pagare', pagata_il: null, conto_fic_id: null, conto_nome: null, ordine: 1 },
    ])
  })

  it('non conserva gli URL temporanei degli allegati in fic_dati', () => {
    const { fattura } = mappaDocumento(doc(), 'expense', ORA)
    expect(fattura.fic_dati).not.toHaveProperty('attachment_url')
    expect(fattura.fic_dati).not.toHaveProperty('attachment_preview_url')
    expect(fattura.fic_dati).toHaveProperty('invoice_number', 'FT 12/2026')
  })

  it('nota di credito: importi sempre negativi, qualunque segno mandi FiC', () => {
    const pos = mappaDocumento(doc({ amount_net: 100, amount_vat: 22, amount_gross: 122 }), 'passive_credit_note', ORA)
    const neg = mappaDocumento(doc({ amount_net: -100, amount_vat: -22, amount_gross: -122 }), 'passive_credit_note', ORA)
    for (const { fattura } of [pos, neg]) {
      expect(fattura.tipo).toBe('nota_credito')
      expect(fattura.importo_netto).toBe(-100)
      expect(fattura.importo_iva).toBe(-22)
      expect(fattura.importo_lordo).toBe(-122)
    }
  })

  it('le rate di una nota di credito restano positive', () => {
    const { rate } = mappaDocumento(
      doc({ payments_list: [{ id: 3, amount: -122, due_date: '2026-03-10', status: 'paid', paid_date: '2026-03-10' }] }),
      'passive_credit_note',
      ORA,
    )
    expect(rate[0].importo).toBe(122)
  })

  it('senza fornitore né partita IVA non fallisce', () => {
    const { fattura } = mappaDocumento(doc({ entity: null }), 'expense', ORA)
    expect(fattura.fornitore_nome).toBe('(senza fornitore)')
    expect(fattura.fornitore_piva).toBeNull()
    expect(fattura.fornitore_fic_id).toBeNull()
  })

  it('campi mancanti diventano null o zero, niente allegato', () => {
    const { fattura, rate } = mappaDocumento(
      {
        id: 5,
        date: '2026-01-02',
        updated_at: '2026-01-02 08:00:00',
        entity: { name: '  Ferramenta Rossi  ', vat_number: '' },
      },
      'expense',
      ORA,
    )
    expect(fattura.fornitore_nome).toBe('Ferramenta Rossi')
    expect(fattura.fornitore_piva).toBeNull()
    expect(fattura.numero).toBeNull()
    expect(fattura.importo_netto).toBe(0)
    expect(fattura.importo_lordo).toBe(0)
    expect(fattura.elettronica).toBe(false)
    expect(fattura.ha_allegato).toBe(false)
    expect(rate).toEqual([])
  })

  it('arrotonda i centesimi', () => {
    const { fattura } = mappaDocumento(doc({ amount_net: 10.005, amount_vat: 2.2011, amount_gross: 12.2061 }), 'expense', ORA)
    expect(fattura.importo_netto).toBe(10.01)
    expect(fattura.importo_iva).toBe(2.2)
    expect(fattura.importo_lordo).toBe(12.21)
  })
})
