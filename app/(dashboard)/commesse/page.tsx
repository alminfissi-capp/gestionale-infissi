import { redirect } from 'next/navigation'
import { getGruppiCommesse, getGruppoCorrente } from '@/actions/commesse'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import GruppiCommesse from '@/components/commesse/GruppiCommesse'
import type { GruppoConStats } from '@/components/commesse/GruppiCommesse'

export default async function CommessePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const sp = await searchParams

  // Redirect da preventivo accettato → apre il blocco corrente
  if (sp.from) {
    const corrente = await getGruppoCorrente()
    if (corrente) redirect(`/commesse/${corrente.id}?from=${sp.from}`)
  }

  const gruppi = await getGruppiCommesse()

  // Statistiche aggregate: una sola query, raggruppamento in JS
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [{ data: statsRaw }, { data: accontiRaw }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, gruppo_id, totale, in_calcoli')
      .eq('organization_id', orgId),
    supabase
      .from('acconti_commessa')
      .select('commessa_id, importo')
      .eq('organization_id', orgId),
  ])

  const statsMap = new Map<string, { count: number; totale: number }>()
  for (const r of statsRaw ?? []) {
    if (!r.gruppo_id) continue
    const prev = statsMap.get(r.gruppo_id) ?? { count: 0, totale: 0 }
    statsMap.set(r.gruppo_id, {
      count: prev.count + 1,
      totale: prev.totale + Number(r.totale),
    })
  }

  // Slot "Calcoli": commesse stellate → incasso possibile = Σ(totale - acconti)
  const accontiPerCommessa = new Map<string, number>()
  for (const a of accontiRaw ?? []) {
    accontiPerCommessa.set(a.commessa_id, (accontiPerCommessa.get(a.commessa_id) ?? 0) + Number(a.importo))
  }
  const stellate = (statsRaw ?? []).filter((r) => r.in_calcoli)
  const calcoli = {
    count: stellate.length,
    saldo: stellate.reduce((s, r) => s + Number(r.totale) - (accontiPerCommessa.get(r.id) ?? 0), 0),
  }

  const gruppiConStats: GruppoConStats[] = gruppi.map((g) => ({
    ...g,
    count: statsMap.get(g.id)?.count ?? 0,
    totale: statsMap.get(g.id)?.totale ?? 0,
  }))

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Commesse</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Seleziona un blocco per visualizzare le commesse
        </p>
      </div>
      <GruppiCommesse gruppi={gruppiConStats} calcoli={calcoli} />
    </div>
  )
}
