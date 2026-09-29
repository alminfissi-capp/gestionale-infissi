import { describe, it, expect } from 'vitest'
import { filtraFatture, totaliFatture } from '@/lib/fic/filtri'
import type { FatturaFornitore } from '@/types/fatture-fornitori'

const OGGI = '2026-09-28'
const f = (over: Partial<FatturaFornitore>): FatturaFornitore => ({
  id: 'x', fic_id: 1, tipo: 'fattura', numero: 'FT 1', data: '2026-01-01', descrizione: null,
  categoria: null, elettronica: true, fornitore_fic_id: null, fornitore_nome: 'Alluminio Sud',
  fornitore_piva: null, importo_netto: 100, importo_iva: 22, ritenuta: 0, altra_ritenuta: 0,
  importo_lordo: 122, prossima_scadenza: null, ha_allegato: false, sincronizzata_at: '', rate: [],
  ...over,
})
const rata = (stato: 'pagata' | 'da_pagare', scadenza: string) => ({
  id: 'r', fattura_id: 'x', fic_id: null, importo: 1, scadenza, stato, pagata_il: null,
  conto_fic_id: null, conto_nome: null, ordine: 0,
})

describe('filtraFatture', () => {
  const elenco = [
    f({ id: 'a', fornitore_nome: 'Alluminio Sud', numero: 'FT 12', rate: [rata('pagata', '2026-01-31')] }),
    f({ id: 'b', fornitore_nome: 'Ferramenta Rossi', numero: 'A/77', rate: [rata('da_pagare', '2026-08-31')] }),
    f({ id: 'c', fornitore_nome: 'Vetri Nord', numero: null, rate: [rata('da_pagare', '2026-12-31')] }),
  ]
  it('ricerca per fornitore, senza maiuscole', () => {
    expect(filtraFatture(elenco, 'rossi', 'tutte', OGGI).map((x) => x.id)).toEqual(['b'])
  })
  it('ricerca per numero', () => {
    expect(filtraFatture(elenco, 'ft 12', 'tutte', OGGI).map((x) => x.id)).toEqual(['a'])
  })
  it('numero null non rompe la ricerca', () => {
    expect(filtraFatture(elenco, 'vetri', 'tutte', OGGI).map((x) => x.id)).toEqual(['c'])
  })
  it('filtro per stato pagamento', () => {
    expect(filtraFatture(elenco, '', 'scaduta', OGGI).map((x) => x.id)).toEqual(['b'])
    expect(filtraFatture(elenco, '', 'pagata', OGGI).map((x) => x.id)).toEqual(['a'])
    expect(filtraFatture(elenco, '', 'da_pagare', OGGI).map((x) => x.id)).toEqual(['c'])
  })
})

describe('totaliFatture', () => {
  it('somma, con le note di credito gia\' negative', () => {
    const t = totaliFatture([
      f({ importo_netto: 100, importo_iva: 22, importo_lordo: 122 }),
      f({ tipo: 'nota_credito', importo_netto: -10, importo_iva: -2.2, importo_lordo: -12.2 }),
    ])
    expect(t).toEqual({ netto: 90, iva: 19.8, lordo: 109.8 })
  })
})
