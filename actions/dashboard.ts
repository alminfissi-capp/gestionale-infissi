'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { formatEuro } from '@/lib/pricing'

export type ActivityItem = {
  tipo: 'preventivo' | 'cliente' | 'commessa' | 'acconto'
  azione: string
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

function nomeCliente(snap: unknown): string {
  if (!snap || typeof snap !== 'object') return 'Sconosciuto'
  const s = snap as {
    tipo?: string
    ragione_sociale?: string | null
    nome?: string | null
    cognome?: string | null
    email?: string | null
    telefono?: string | null
  }
  if (s.tipo === 'azienda') {
    return s.ragione_sociale || s.email || s.telefono || 'Cliente'
  }
  const nomeCompleto = [s.cognome, s.nome].filter(Boolean).join(' ')
  return nomeCompleto || s.email || s.telefono || 'Cliente'
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const year = new Date().getFullYear()
  const startOfYear = new Date(year, 0, 1).toISOString()

  const [
    prevCreatiResult,
    prevStatoResult,
    prevModificatiResult,
    clientiResult,
    commesseResult,
    accontiResult,
    prevAnnoResult,
  ] = await Promise.all([
    supabase
      .from('preventivi')
      .select('id, cliente_snapshot, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('preventivi')
      .select('id, cliente_snapshot, stato, updated_at, created_at')
      .eq('organization_id', orgId)
      .in('stato', ['accettato', 'rifiutato', 'inviato'])
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('preventivi')
      .select('id, cliente_snapshot, updated_at, created_at')
      .eq('organization_id', orgId)
      .eq('stato', 'bozza')
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('clienti')
      .select('id, nome, cognome, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('commesse')
      .select('id, cliente_nome, numero_commessa, created_at')
      .eq('organization_id', orgId)
      // Solo il feed: i totali della dashboard devono continuare a comprendere
      // le vendite online. Qui sommergerebbero le dieci righe disponibili.
      .eq('anonima', false)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('acconti_commessa')
      .select('id, importo, created_at, commesse!inner(id, cliente_nome, anonima)')
      .eq('organization_id', orgId)
      .eq('commesse.anonima', false)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('preventivi')
      .select('id, stato, totale_articoli, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', startOfYear)
      .order('created_at', { ascending: true }),
  ])

  // ── Attività recenti ────────────────────────────────────────────────────────
  const STATO_LABEL: Record<string, string> = {
    accettato: 'Preventivo accettato',
    rifiutato: 'Preventivo rifiutato',
    inviato: 'Preventivo inviato',
  }

  const prevCreati: ActivityItem[] = (prevCreatiResult.data ?? []).map((p) => ({
    tipo: 'preventivo',
    azione: 'Preventivo creato',
    descrizione: nomeCliente(p.cliente_snapshot),
    href: `/preventivi/${p.id}`,
    data: p.created_at,
  }))

  const prevStato: ActivityItem[] = (prevStatoResult.data ?? [])
    .filter((p) => p.updated_at > p.created_at)
    .map((p) => ({
      tipo: 'preventivo',
      azione: STATO_LABEL[p.stato] ?? 'Preventivo aggiornato',
      descrizione: nomeCliente(p.cliente_snapshot),
      href: `/preventivi/${p.id}`,
      data: p.updated_at,
    }))

  const prevModificati: ActivityItem[] = (prevModificatiResult.data ?? [])
    .filter((p) => p.updated_at > p.created_at)
    .map((p) => ({
      tipo: 'preventivo',
      azione: 'Preventivo modificato',
      descrizione: nomeCliente(p.cliente_snapshot),
      href: `/preventivi/${p.id}`,
      data: p.updated_at,
    }))

  const clientiItems: ActivityItem[] = (clientiResult.data ?? []).map((c) => ({
    tipo: 'cliente',
    azione: 'Cliente inserito in anagrafica',
    descrizione: `${c.nome ?? ''} ${c.cognome ?? ''}`.trim() || 'Cliente',
    href: '/clienti',
    data: c.created_at,
  }))

  const commesseItems: ActivityItem[] = (commesseResult.data ?? []).map((c) => ({
    tipo: 'commessa',
    azione: c.numero_commessa ? `Commessa ${c.numero_commessa} aggiunta` : 'Commessa aggiunta',
    descrizione: c.cliente_nome ?? 'Cliente',
    href: `/commesse/${c.id}`,
    data: c.created_at,
  }))

  type CommessaRef = { id: string; cliente_nome: string }
  type AccontoRaw = { id: string; importo: number; created_at: string; commesse: CommessaRef | CommessaRef[] | null }
  const accontiItems: ActivityItem[] = ((accontiResult.data ?? []) as unknown as AccontoRaw[]).map((a) => {
    const raw = a.commesse
    const c: CommessaRef | null = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null)
    return {
      tipo: 'acconto',
      azione: `Acconto ricevuto — € ${formatEuro(a.importo)}`,
      descrizione: c?.cliente_nome ?? 'Cliente',
      href: c ? `/commesse/${c.id}` : '/commesse',
      data: a.created_at,
    }
  })

  const attivitaRecenti = [
    ...prevCreati,
    ...prevStato,
    ...prevModificati,
    ...clientiItems,
    ...commesseItems,
    ...accontiItems,
  ]
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, 10)

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
