'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

export type ActivityItem = {
  tipo: 'preventivo' | 'cliente' | 'listino'
  descrizione: string
  href: string
  data: string
}

export type StatoStats = {
  count: number
  percentuale: number
  imponibile: number
}

export type GiornoPoint = {
  data: string   // formato dd/mm
  totale: number
  accettati: number
  rifiutati: number
  bozze: number
}

export type DashboardData = {
  attivitaRecenti: ActivityItem[]
  totale: number
  imponibileTotale: number
  accettati: StatoStats
  rifiutati: StatoStats
  bozze: StatoStats
  inviati: StatoStats
  grafico: GiornoPoint[]
  graficoPeriodo: GiornoPoint[] // 12 mesi anno corrente
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const year = new Date().getFullYear()
  const startOfYear = new Date(year, 0, 1).toISOString()

  const [prevResult, clientiResult, listiniResult, prevAnnoResult] = await Promise.all([
    supabase
      .from('preventivi')
      .select('id, cliente_snapshot, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('clienti')
      .select('id, nome, cognome, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('categorie_listini')
      .select('id, nome, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('preventivi')
      .select('id, stato, totale_articoli, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', startOfYear)
      .order('created_at', { ascending: true }),
  ])

  // ── Attività recenti ────────────────────────────────────────────────────────
  const prevItems: ActivityItem[] = (prevResult.data ?? []).map((p) => {
    const snap = p.cliente_snapshot as { nome?: string; cognome?: string } | null
    const nome = snap ? `${snap.nome ?? ''} ${snap.cognome ?? ''}`.trim() : 'Preventivo'
    return { tipo: 'preventivo', descrizione: nome || 'Preventivo', href: `/preventivi/${p.id}`, data: p.created_at }
  })
  const clientiItems: ActivityItem[] = (clientiResult.data ?? []).map((c) => ({
    tipo: 'cliente', descrizione: `${c.nome ?? ''} ${c.cognome ?? ''}`.trim() || 'Cliente', href: '/clienti', data: c.created_at,
  }))
  const listiniItems: ActivityItem[] = (listiniResult.data ?? []).map((l) => ({
    tipo: 'listino', descrizione: l.nome ?? 'Listino', href: '/listini', data: l.created_at,
  }))
  const attivitaRecenti = [...prevItems, ...clientiItems, ...listiniItems]
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, 8)

  // ── Statistiche preventivi anno ─────────────────────────────────────────────
  const prevAnno = prevAnnoResult.data ?? []
  const totale = prevAnno.length
  const imponibileTotale = prevAnno.reduce((s, p) => s + (p.totale_articoli ?? 0), 0)

  function calcStats(stato: string): StatoStats {
    const items = prevAnno.filter((p) => p.stato === stato)
    return {
      count: items.length,
      percentuale: totale > 0 ? Math.round((items.length / totale) * 100) : 0,
      imponibile: items.reduce((s, p) => s + (p.totale_articoli ?? 0), 0),
    }
  }

  // ── Grafico ultimi 30 giorni ────────────────────────────────────────────────
  const oggi = new Date()
  const giorni30fa = new Date(oggi)
  giorni30fa.setDate(oggi.getDate() - 29)

  const grafico: GiornoPoint[] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(giorni30fa)
    d.setDate(giorni30fa.getDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayPrev = prevAnno.filter((p) => p.created_at.slice(0, 10) === dateStr)
    grafico.push({
      data: d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
      totale: dayPrev.length,
      accettati: dayPrev.filter((p) => p.stato === 'accettato').length,
      rifiutati: dayPrev.filter((p) => p.stato === 'rifiutato').length,
      bozze: dayPrev.filter((p) => p.stato === 'bozza').length,
    })
  }

  // ── Grafico per mese (anno corrente) ───────────────────────────────────────
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  const graficoPeriodo: GiornoPoint[] = MESI.map((label, idx) => {
    const monthPrev = prevAnno.filter((p) => {
      const d = new Date(p.created_at)
      return d.getMonth() === idx
    })
    return {
      data: label,
      totale: monthPrev.length,
      accettati: monthPrev.filter((p) => p.stato === 'accettato').length,
      rifiutati: monthPrev.filter((p) => p.stato === 'rifiutato').length,
      bozze: monthPrev.filter((p) => p.stato === 'bozza').length,
    }
  })

  return {
    attivitaRecenti,
    totale,
    imponibileTotale,
    accettati: calcStats('accettato'),
    rifiutati: calcStats('rifiutato'),
    bozze: calcStats('bozza'),
    inviati: calcStats('inviato'),
    grafico,
    graficoPeriodo,
  }
}
