import { describe, expect, it } from 'vitest'
import { rigaAcconto } from './riga-acconto'
import type { Pagamento } from './tipi'

const pag: Pagamento = {
  id: 'pag1', organization_id: 'org1', preventivo_id: 'p1', tipo: 'acconto', importo: 510, stato: 'pagato',
  metodo: 'klarna', stripe_session_id: 'cs_1', stripe_payment_intent: 'pi_1', acconto_commessa_id: null,
  created_at: '2026-11-16T10:00:00Z', pagato_at: '2026-11-16T10:05:00Z',
}

describe('riga acconto da pagamento online', () => {
  it('Klarna -> metodo rate, stesso importo, collegata al pagamento', () => {
    expect(rigaAcconto(pag, 'comm1', 'klarna', '436/2026', '2026-11-16')).toEqual({
      commessa_id: 'comm1', organization_id: 'org1', importo: 510, data_pagamento: '2026-11-16',
      metodo_pagamento: 'rate', ritenuta: 0, pagamento_online_id: 'pag1',
      note: 'Pagamento online (Klarna) – acconto preventivo 436/2026 – rif. pi_1',
    })
  })
  it('carta e riferimento alla sessione se manca il payment intent', () => {
    const r = rigaAcconto({ ...pag, stripe_payment_intent: null, tipo: 'saldo' }, 'comm1', 'card', '1', '2026-11-16')
    expect(r.metodo_pagamento).toBe('carta')
    expect(r.note).toBe('Pagamento online (carta) – saldo preventivo 1 – rif. cs_1')
  })
})
