// Riga di acconti_commessa per un pagamento online riuscito (parte pura).
import { metodoAcconto, nomeMetodo } from './metodo'
import type { Pagamento } from './tipi'

export function rigaAcconto(p: Pagamento, commessaId: string, metodo: string | null, numeroPreventivo: string, oggi: string) {
  return {
    commessa_id: commessaId,
    organization_id: p.organization_id,
    importo: Number(p.importo),
    data_pagamento: oggi,
    metodo_pagamento: metodoAcconto(metodo),
    ritenuta: 0,
    pagamento_online_id: p.id,
    note: `Pagamento online (${nomeMetodo(metodo)}) – ${p.tipo} preventivo ${numeroPreventivo} – rif. ${p.stripe_payment_intent ?? p.stripe_session_id}`,
  }
}
