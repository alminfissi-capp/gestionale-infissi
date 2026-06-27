import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import StatisticheCommesse from '@/components/commesse/StatisticheCommesse'
import type { StatRow, AccontoRow, CostoCommessaRow } from '@/lib/statistiche-commesse'
import { calcolaCostiPreventivo, type ArticoloCosti } from '@/lib/preventivo-costi'

export default async function StatisticheCommessePage() {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: commesseRaw }, { data: accontiRaw }, { data: gruppiRaw }, { data: junctionRaw }] =
    await Promise.all([
      supabase
        .from('commesse')
        .select('id, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id')
        .eq('organization_id', orgId),
      supabase
        .from('acconti_commessa')
        .select('commessa_id, importo, data_pagamento')
        .eq('organization_id', orgId),
      supabase
        .from('gruppi_commesse')
        .select('id, nome')
        .eq('organization_id', orgId),
      supabase
        .from('preventivi_commessa')
        .select('commessa_id, preventivo_id')
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

  // ── Preventivi INTERNI collegati per commessa (preventivo_id non null) ──
  // Link diretto (commesse.preventivo_id) + junction (preventivi_commessa).
  const preventiviPerCommessa = new Map<string, Set<string>>()
  function addLink(commessaId: string, prevId: string | null) {
    if (!prevId) return
    const s = preventiviPerCommessa.get(commessaId) ?? new Set<string>()
    s.add(prevId)
    preventiviPerCommessa.set(commessaId, s)
  }
  for (const c of commesseRaw ?? []) addLink(c.id, c.preventivo_id)
  for (const j of junctionRaw ?? []) addLink(j.commessa_id, j.preventivo_id)

  const tuttiPrevIds = [...new Set([...preventiviPerCommessa.values()].flatMap((s) => [...s]))]

  // Carica preventivi (totale_articoli, spese_trasporto) + articoli con costi/config.
  const costiCommesse: CostoCommessaRow[] = []
  if (tuttiPrevIds.length > 0) {
    const [{ data: prevRaw }, { data: artRaw }] = await Promise.all([
      supabase
        .from('preventivi')
        .select('id, totale_articoli, spese_trasporto')
        .in('id', tuttiPrevIds),
      supabase
        .from('articoli_preventivo')
        .select('preventivo_id, tipo, quantita, costo_acquisto_unitario, costo_posa, config_su_misura, config_scorrevole, config_winconfig')
        .in('preventivo_id', tuttiPrevIds),
    ])

    const articoliPerPrev = new Map<string, ArticoloCosti[]>()
    for (const a of artRaw ?? []) {
      const list = articoliPerPrev.get(a.preventivo_id) ?? []
      list.push(a as ArticoloCosti)
      articoliPerPrev.set(a.preventivo_id, list)
    }
    // Costi per preventivo
    const costiPerPrev = new Map<string, { materiali: number; posa: number; utile: number }>()
    for (const p of prevRaw ?? []) {
      const arts = articoliPerPrev.get(p.id) ?? []
      const { materiali, posa, utile } = calcolaCostiPreventivo(
        arts,
        Number(p.totale_articoli) || 0,
        Number(p.spese_trasporto) || 0,
      )
      costiPerPrev.set(p.id, { materiali, posa, utile })
    }

    // Somma per commessa (su tutti i suoi preventivi interni)
    const commessaInfo = new Map(commesse.map((c) => [c.id, c]))
    for (const [commessaId, prevSet] of preventiviPerCommessa) {
      const info = commessaInfo.get(commessaId)
      if (!info) continue
      let materiali = 0, posa = 0, utile = 0
      for (const prevId of prevSet) {
        const cp = costiPerPrev.get(prevId)
        if (!cp) continue
        materiali += cp.materiali
        posa += cp.posa
        utile += cp.utile
      }
      costiCommesse.push({
        commessa_id: commessaId,
        blocco: info.blocco,
        data_conferma: info.data_conferma,
        materiali,
        posa,
        utile,
      })
    }
  }

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

  return <StatisticheCommesse dati={{ commesse, acconti, anni, costiCommesse }} />
}
