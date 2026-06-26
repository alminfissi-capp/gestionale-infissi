import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
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
  const [{ data: statsRaw }, { data: accontiRaw }, { data: scadenzeRaw }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, gruppo_id, totale, in_calcoli')
      .eq('organization_id', orgId),
    supabase
      .from('acconti_commessa')
      .select('commessa_id, importo')
      .eq('organization_id', orgId),
    supabase
      .from('scadenze')
      .select('gruppo_id, importo, pagato')
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

  // Statistiche scadenze per blocco: count + totale da pagare (non pagato)
  const scadMap = new Map<string, { count: number; daPagare: number }>()
  for (const r of scadenzeRaw ?? []) {
    if (!r.gruppo_id) continue
    const prev = scadMap.get(r.gruppo_id) ?? { count: 0, daPagare: 0 }
    scadMap.set(r.gruppo_id, {
      count: prev.count + 1,
      daPagare: prev.daPagare + (r.pagato ? 0 : Number(r.importo)),
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
    count: g.tipo === 'scadenze' ? (scadMap.get(g.id)?.count ?? 0) : (statsMap.get(g.id)?.count ?? 0),
    totale: g.tipo === 'scadenze' ? (scadMap.get(g.id)?.daPagare ?? 0) : (statsMap.get(g.id)?.totale ?? 0),
  }))

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commesse / Scadenze</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Seleziona un blocco per visualizzare commesse o scadenze
          </p>
        </div>
        <Link
          href="/commesse/statistiche"
          className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100 transition-colors"
        >
          <BarChart3 className="h-4 w-4" />
          Grafici e statistiche
        </Link>
      </div>
      <GruppiCommesse gruppi={gruppiConStats} calcoli={calcoli} />
    </div>
  )
}
