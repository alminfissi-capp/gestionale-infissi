import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import StatisticheCommesse from '@/components/commesse/StatisticheCommesse'
import type { StatRow, AccontoRow } from '@/lib/statistiche-commesse'

export default async function StatisticheCommessePage() {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: commesseRaw }, { data: accontiRaw }, { data: gruppiRaw }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, cliente_nome, totale, data_conferma, gruppo_id')
      .eq('organization_id', orgId),
    supabase
      .from('acconti_commessa')
      .select('commessa_id, importo, data_pagamento')
      .eq('organization_id', orgId),
    supabase
      .from('gruppi_commesse')
      .select('id, nome')
      .eq('organization_id', orgId),
  ])

  // Mappa gruppo_id → nome blocco (es. "2025", "2026")
  const nomeBlocco = new Map<string, string>()
  for (const g of gruppiRaw ?? []) nomeBlocco.set(g.id, g.nome)

  const commesse: StatRow[] = (commesseRaw ?? []).map((c) => ({
    id: c.id,
    cliente_nome: c.cliente_nome ?? '',
    totale: Number(c.totale) || 0,
    data_conferma: c.data_conferma,
    blocco: c.gruppo_id ? (nomeBlocco.get(c.gruppo_id) ?? null) : null,
  }))

  const acconti: AccontoRow[] = (accontiRaw ?? []).map((a) => ({
    commessa_id: a.commessa_id,
    importo: Number(a.importo) || 0,
    data_pagamento: a.data_pagamento,
  }))

  // Anni del selettore: nomi dei blocchi che hanno commesse + anni di pagamento.
  const anniSet = new Set<string>()
  for (const c of commesse) {
    if (c.blocco) anniSet.add(c.blocco)
  }
  for (const a of acconti) {
    const y = a.data_pagamento?.slice(0, 4)
    if (y && /^\d{4}$/.test(y)) anniSet.add(y)
  }
  const anni = [...anniSet].sort((a, b) => {
    const na = Number(a), nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
    return b.localeCompare(a)
  })

  return <StatisticheCommesse dati={{ commesse, acconti, anni }} />
}
