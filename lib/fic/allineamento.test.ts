import { describe, it, expect } from 'vitest'
import { decidiAzione, messaggioEsitoFic, avvisoImporti, riepilogaCollegamenti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import type { ScritturaFic } from '@/lib/fic/pagamenti-fic'

const s: ScritturaFic = { data: '2026-10-03', metodo_id: 1, rate_pagate: [{ id: 1, importo: 300 }, { id: 2, importo: 200 }], rata_divisa: null }
const d = { pagare: true, data: '2026-10-03', metodoId: 1 }

describe('decidiAzione', () => {
  it('da pagare e mai scritto → scrivi', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: null }, d)).toBe('scrivi')
  })
  it('gia\' scritto uguale → niente', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, d)).toBe('niente')
  })
  it('data, metodo o importo cambiati → riscrivi', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, { ...d, data: '2026-10-04' })).toBe('riscrivi')
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, { ...d, metodoId: 2 })).toBe('riscrivi')
    expect(decidiAzione({ importo: 450, scrittura_fic: s }, d)).toBe('riscrivi')
  })
  it('non piu\' da pagare: annulla se scritto, altrimenti niente', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, { ...d, pagare: false })).toBe('annulla')
    expect(decidiAzione({ importo: 500, scrittura_fic: null }, { ...d, pagare: false })).toBe('niente')
  })
})

describe('messaggioEsitoFic', () => {
  it('niente da dire', () => {
    expect(messaggioEsitoFic(ESITO_VUOTO)).toEqual({ tipo: 'niente', testo: '' })
  })
  it('scrittura riuscita', () => {
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, scritti: 3 })).toEqual({ tipo: 'successo', testo: 'Pagamento scritto su FiC: 3 documenti' })
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, scritti: 1 })).toEqual({ tipo: 'successo', testo: 'Pagamento scritto su FiC: 1 documento' })
  })
  it('annullamento riuscito', () => {
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, annullati: 2 })).toEqual({ tipo: 'successo', testo: 'Pagamento tolto da FiC: 2 documenti' })
  })
  it('problemi e avvisi vincono e si elencano', () => {
    expect(messaggioEsitoFic({ scritti: 1, annullati: 0, problemi: ['FT 3: FiC non ha risposto'], avvisi: [] }))
      .toEqual({ tipo: 'avviso', testo: 'Pagato in WinStudio, ma non tutto e\' su FiC. FT 3: FiC non ha risposto' })
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, avvisi: ['Gli importi non tornano'] }))
      .toEqual({ tipo: 'avviso', testo: 'Gli importi non tornano' })
  })
})

describe('avvisoImporti', () => {
  it('nessun avviso se torna o se non ci sono collegamenti', () => {
    expect(avvisoImporti(4500, [{ tipo_documento: 'fattura', importo: 5000 }, { tipo_documento: 'nota_credito', importo: 500 }])).toBeNull()
    expect(avvisoImporti(4500, [])).toBeNull()
  })
  it('avvisa se non torna', () => {
    expect(avvisoImporti(4000, [{ tipo_documento: 'fattura', importo: 5000 }]))
      .toBe('Gli importi delle fatture collegate non tornano piu\' con la scadenza: apri Fatture per controllare')
  })
})

describe('riepilogaCollegamenti', () => {
  it('problema vince, poi non scritto, poi scritto', () => {
    expect(riepilogaCollegamenti([{ stato_fic: 'scritto', messaggio_fic: null }, { stato_fic: 'da_allineare', messaggio_fic: 'rete' }]))
      .toEqual({ n: 2, stato: 'problema', messaggio: 'rete' })
    expect(riepilogaCollegamenti([{ stato_fic: 'scritto', messaggio_fic: null }, { stato_fic: 'non_scritto', messaggio_fic: null }]))
      .toEqual({ n: 2, stato: 'non_scritto', messaggio: null })
    expect(riepilogaCollegamenti([{ stato_fic: 'scritto', messaggio_fic: null }]))
      .toEqual({ n: 1, stato: 'scritto', messaggio: null })
  })
})
