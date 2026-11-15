import { describe, expect, it } from 'vitest'
import { situazioneDaEsito } from './situazione-pubblica'
import { calcolaOpzioni } from './regole'
import { IMPOSTAZIONI_PREDEFINITE, type Preventivo } from './tipi'
import { PARAMETRI_PROVA } from './test-doppi'

const prev = (x: Partial<Preventivo> = {}): Preventivo => ({
  id: 'p1', organization_id: 'o1', numero: '436/2026', stato: 'accettato', firma_stato: null,
  totale_finale: 1000, cliente_snapshot: { tipo: 'privato' }, share_token: 't', ...x,
})
const banca = { iban: 'IT60X0542811101000000123456', intestatario: 'A.L.M. Infissi' }

describe('cosa vede il cliente', () => {
  it('pagamento non attivo, preventivo accettato: niente Paga ora ma bonifico con causale', () => {
    const p = prev()
    const esito = calcolaOpzioni({ preventivo: p, impostazioni: null, pagamenti: [], parametri: PARAMETRI_PROVA })
    const s = situazioneDaEsito(p, esito, [], banca)
    expect(s.pagabile).toBe(false)
    expect(s.opzioni).toEqual([])
    expect(s.bonifico).toEqual({ ...banca, causale: 'Preventivo 436/2026' })
  })

  it('preventivo non accettato e pagamento non attivo: niente bonifico', () => {
    const p = prev({ stato: 'inviato' })
    const esito = calcolaOpzioni({ preventivo: p, impostazioni: null, pagamenti: [], parametri: PARAMETRI_PROVA })
    expect(situazioneDaEsito(p, esito, [], banca).bonifico).toBeNull()
  })

  it('attivo: acconto 30% e bonifico come alternativa; nessun id interno', () => {
    const p = prev()
    const esito = calcolaOpzioni({ preventivo: p, impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, preventivo_id: 'p1', abilitato: true, acconto_percentuale: 30 }, pagamenti: [], parametri: PARAMETRI_PROVA })
    const s = situazioneDaEsito(p, esito, [], banca)
    expect(s.pagabile).toBe(true)
    expect(s.opzioni).toEqual([{ tipo: 'acconto', importo: 300, etichetta: 'Acconto 30%', rateIndicative: ['Klarna', 'Scalapay'] }])
    expect(JSON.stringify(s)).not.toContain('p1')
  })

  it('senza IBAN in impostazioni: niente bonifico', () => {
    const p = prev()
    const esito = calcolaOpzioni({ preventivo: p, impostazioni: null, pagamenti: [], parametri: PARAMETRI_PROVA })
    expect(situazioneDaEsito(p, esito, [], { iban: '', intestatario: 'x' }).bonifico).toBeNull()
  })
})
