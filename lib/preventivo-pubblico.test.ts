import { describe, expect, it } from 'vitest'
import { preventivoPerCliente, settingsPerCliente } from './preventivo-pubblico'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

const prev = {
  id: 'p1', numero: '1/2026', totale_finale: 1220, totale_costi_acquisto: 600,
  provvigione_percentuale: 5, provvigione_importo: 50, provvigione_importo_fisso: null,
  token_conferma: 'segreto', firma_documento_id: 'doc1', firma_signing_url: 'https://firma', firma_stato: 'in_attesa',
  articoli: [{ id: 'a1', descrizione: 'Finestra', prezzo_unitario: 500, costo_acquisto_unitario: 300, costo_posa: 40, costo_prodotto_bypass: 280, config_fppro: { calcolo: { utile: 100 } } }],
  cataloghi_allegati_data: [], allegati_pdf_data: [], allegati_calcoli_data: [],
} as unknown as PreventivoCompleto

describe('preventivo per il cliente', () => {
  it('toglie costi, provvigione, calcolo interno e token del callback di firma', () => {
    const p = preventivoPerCliente(prev) as unknown as Record<string, unknown>
    expect(p.totale_costi_acquisto).toBe(0)
    expect(p.provvigione_importo).toBe(0)
    expect(p.token_conferma).toBeNull()
    expect(p.firma_documento_id).toBeNull()
    const a = (p.articoli as Record<string, unknown>[])[0]
    expect(a.costo_acquisto_unitario).toBe(0)
    expect(a.costo_posa).toBe(0)
    expect(a.costo_prodotto_bypass).toBeNull()
    expect('config_fppro' in a).toBe(false)
  })

  it('tiene quello che il documento mostra', () => {
    const p = preventivoPerCliente(prev)
    expect(p.totale_finale).toBe(1220)
    expect(p.firma_signing_url).toBe('https://firma')
    expect(p.articoli[0].prezzo_unitario).toBe(500)
  })

  it('settings: solo intestazione e contatti', () => {
    const s = settingsPerCliente({ denominazione: 'ALM', iban: 'IT00', firma_conferme: 'data:image', tariffa_manodopera_giornaliera: 70 } as unknown as Settings) as unknown as Record<string, unknown>
    expect(s.denominazione).toBe('ALM')
    expect(s.iban).toBeUndefined()
    expect(s.firma_conferme).toBeUndefined()
    expect(s.tariffa_manodopera_giornaliera).toBeUndefined()
  })
})
