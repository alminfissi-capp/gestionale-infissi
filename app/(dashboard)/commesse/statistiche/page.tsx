import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import StatisticheCommesse from '@/components/commesse/StatisticheCommesse'
import type { StatRow, AccontoRow } from '@/lib/statistiche-commesse'

export default async function StatisticheCommessePage() {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: commesseRaw }, { data: accontiRaw }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, cliente_nome, totale, data_conferma')
      .eq('organization_id', orgId),
    supabase
      .from('acconti_commessa')
      .select('commessa_id, importo, data_pagamento')
      .eq('organization_id', orgId),
  ])

  const commesse: StatRow[] = (commesseRaw ?? []).map((c) => ({
    id: c.id,
    cliente_nome: c.cliente_nome ?? '',
    totale: Number(c.totale) || 0,
    data_conferma: c.data_conferma,
  }))

  const acconti: AccontoRow[] = (accontiRaw ?? []).map((a) => ({
    commessa_id: a.commessa_id,
    importo: Number(a.importo) || 0,
    data_pagamento: a.data_pagamento,
  }))

  // Anni disponibili: da data_conferma commesse + data_pagamento acconti, desc.
  const anniSet = new Set<number>()
  for (const c of commesse) {
    const y = Number(c.data_conferma?.slice(0, 4))
    if (Number.isFinite(y) && y > 1900) anniSet.add(y)
  }
  for (const a of acconti) {
    const y = Number(a.data_pagamento?.slice(0, 4))
    if (Number.isFinite(y) && y > 1900) anniSet.add(y)
  }
  const anni = [...anniSet].sort((a, b) => b - a)

  return <StatisticheCommesse dati={{ commesse, acconti, anni }} />
}
