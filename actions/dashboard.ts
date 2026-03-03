'use server'

import { createClient } from '@/lib/supabase/server'

export type ActivityItem = {
  tipo: 'preventivo' | 'cliente' | 'listino'
  descrizione: string
  href: string
  data: string
}

export type DashboardData = {
  attivitaRecenti: ActivityItem[]
  preventiviAnno: number
}

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const year = new Date().getFullYear()
  const startOfYear = new Date(year, 0, 1).toISOString()

  const [prevResult, clientiResult, listiniResult, countResult] = await Promise.all([
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
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', startOfYear),
  ])

  const prevItems: ActivityItem[] = (prevResult.data ?? []).map((p) => {
    const snap = p.cliente_snapshot as { nome?: string; cognome?: string } | null
    const nome = snap ? `${snap.nome ?? ''} ${snap.cognome ?? ''}`.trim() : 'Preventivo'
    return {
      tipo: 'preventivo',
      descrizione: nome || 'Preventivo',
      href: `/preventivi/${p.id}`,
      data: p.created_at,
    }
  })

  const clientiItems: ActivityItem[] = (clientiResult.data ?? []).map((c) => ({
    tipo: 'cliente',
    descrizione: `${c.nome ?? ''} ${c.cognome ?? ''}`.trim() || 'Cliente',
    href: '/clienti',
    data: c.created_at,
  }))

  const listiniItems: ActivityItem[] = (listiniResult.data ?? []).map((l) => ({
    tipo: 'listino',
    descrizione: l.nome ?? 'Listino',
    href: '/listini',
    data: l.created_at,
  }))

  const merged = [...prevItems, ...clientiItems, ...listiniItems]
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, 8)

  return {
    attivitaRecenti: merged,
    preventiviAnno: countResult.count ?? 0,
  }
}
