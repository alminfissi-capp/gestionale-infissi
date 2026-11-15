import { describe, expect, it } from 'vitest'
import { testoWhatsappPagamento } from './formato'
import { calcolaOpzioni } from './regole'
import { IMPOSTAZIONI_PREDEFINITE, type Preventivo } from './tipi'
import { PARAMETRI_PROVA } from './test-doppi'

const p: Preventivo = { id: 'p1', organization_id: 'o', numero: '1', stato: 'accettato', firma_stato: null, totale_finale: 1000, cliente_snapshot: { tipo: 'privato' }, share_token: 't' }

describe('frase del pagamento nel messaggio WhatsApp', () => {
  it('acconto 30% su 1000: importo, metodi e link', () => {
    const e = calcolaOpzioni({ preventivo: p, impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, preventivo_id: 'p1', abilitato: true, acconto_percentuale: 30 }, pagamenti: [], parametri: PARAMETRI_PROVA })
    const t = testoWhatsappPagamento(e, 'https://x/p/t')
    expect(t).toContain('300,00')
    expect(t).toContain('https://x/p/t')
    expect(t).not.toMatch(/interessi/i)
  })
  it('pagamento non attivo: niente frase', () => {
    const e = calcolaOpzioni({ preventivo: p, impostazioni: null, pagamenti: [], parametri: PARAMETRI_PROVA })
    expect(testoWhatsappPagamento(e, 'https://x/p/t')).toBe('')
  })
})
