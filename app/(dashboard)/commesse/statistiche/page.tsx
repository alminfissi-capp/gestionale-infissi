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
        .select('id, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id, stato, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale')
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

  // Le commesse "in attesa" sono solo promemoria (accettate ma non formalizzate):
  // vanno escluse da TUTTE le statistiche finché non passano a un altro stato.
  const commesseValide = (commesseRaw ?? []).filter((c) => c.stato !== 'in_attesa')
  const idsValide = new Set(commesseValide.map((c) => c.id))

  const commesse: StatRow[] = commesseValide.map((c) => ({
    id: c.id,
    cliente_nome: c.cliente_nome ?? '',
    totale: Number(c.totale) || 0,
    data_conferma: c.data_conferma,
    blocco: c.gruppo_id ? (nomeBlocco.get(c.gruppo_id) ?? null) : null,
  }))

  // Acconti esclusi se la commessa collegata è "in attesa".
  const acconti: AccontoRow[] = (accontiRaw ?? [])
    .filter((a) => idsValide.has(a.commessa_id))
    .map((a) => ({
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
  for (const c of commesseValide) addLink(c.id, c.preventivo_id)
  for (const j of junctionRaw ?? []) {
    if (idsValide.has(j.commessa_id)) addLink(j.commessa_id, j.preventivo_id)
  }

  const tuttiPrevIds = [...new Set([...preventiviPerCommessa.values()].flatMap((s) => [...s]))]

  // Costi calcolati dai preventivi INTERNI, sommati per commessa.
  const sysPerCommessa = new Map<string, { materiali: number; posa: number; utile: number }>()
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
    for (const [commessaId, prevSet] of preventiviPerCommessa) {
      let materiali = 0, posa = 0, utile = 0
      for (const prevId of prevSet) {
        const cp = costiPerPrev.get(prevId)
        if (!cp) continue
        materiali += cp.materiali
        posa += cp.posa
        utile += cp.utile
      }
      sysPerCommessa.set(commessaId, { materiali, posa, utile })
    }
  }

  // Valori manuali per commessa (dai 3 campi sulla scheda).
  const manualePerCommessa = new Map<string, { materiali: number; posa: number; utile: number }>()
  for (const c of commesseValide) {
    const materiali = Number(c.costo_materiali_manuale) || 0
    const posa = Number(c.costo_manodopera_manuale) || 0
    const utile = Number(c.utile_manuale) || 0
    if (materiali !== 0 || posa !== 0 || utile !== 0) {
      manualePerCommessa.set(c.id, { materiali, posa, utile })
    }
  }

  // costiCommesse = somma sistema + manuale, per ogni commessa con almeno un contributo.
  const commessaInfo = new Map(commesse.map((c) => [c.id, c]))
  const costiCommesse: CostoCommessaRow[] = []
  for (const id of new Set([...sysPerCommessa.keys(), ...manualePerCommessa.keys()])) {
    const info = commessaInfo.get(id)
    if (!info) continue
    const sys = sysPerCommessa.get(id) ?? { materiali: 0, posa: 0, utile: 0 }
    const man = manualePerCommessa.get(id) ?? { materiali: 0, posa: 0, utile: 0 }
    costiCommesse.push({
      commessa_id: id,
      blocco: info.blocco,
      data_conferma: info.data_conferma,
      materiali: sys.materiali + man.materiali,
      posa: sys.posa + man.posa,
      utile: sys.utile + man.utile,
    })
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
