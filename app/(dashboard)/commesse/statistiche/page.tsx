import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import StatisticheCommesse from '@/components/commesse/StatisticheCommesse'
import type {
  StatRow, AccontoRow, CostoCommessaRow, ScadenzaRow,
  AltroCreditoRow, PagamentoDipendenteRow, ContoDipendenteRow,
} from '@/lib/statistiche-commesse'
import { calcolaCostiPreventivo, type ArticoloCosti } from '@/lib/preventivo-costi'

export default async function StatisticheCommessePage() {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [
    { data: commesseRaw }, { data: accontiRaw }, { data: gruppiRaw }, { data: junctionRaw },
    { data: scadenzeRaw }, { data: altriCreditiRaw }, { data: busteRaw },
    { data: pagDipRaw }, { data: movAltriRaw },
  ] =
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
      supabase
        .from('scadenze')
        .select('data_scadenza, importo, pagato, annullata, categoria')
        .eq('organization_id', orgId),
      // Incassi in attesa: entrate che non nascono da una commessa
      supabase
        .from('calcoli_incassi')
        .select('importo, incassato')
        .eq('organization_id', orgId),
      supabase
        .from('buste_paga')
        .select('dipendente_id, netto')
        .eq('organization_id', orgId),
      supabase
        .from('pagamenti_dipendente')
        .select('dipendente_id, importo, data_pagamento')
        .eq('organization_id', orgId),
      supabase
        .from('movimenti_altro_dipendente')
        .select('altro_dipendente_id, importo, data_pagamento, tipo')
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
    stato: c.stato ?? '',
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
  const sysPerCommessa = new Map<string, { materiali: number; posa: number; spese: number; utile: number }>()
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
    const costiPerPrev = new Map<string, { materiali: number; posa: number; spese: number; utile: number }>()
    for (const p of prevRaw ?? []) {
      const arts = articoliPerPrev.get(p.id) ?? []
      const { materiali, posa, spese, utile } = calcolaCostiPreventivo(
        arts,
        Number(p.totale_articoli) || 0,
        Number(p.spese_trasporto) || 0,
      )
      costiPerPrev.set(p.id, { materiali, posa, spese, utile })
    }
    for (const [commessaId, prevSet] of preventiviPerCommessa) {
      let materiali = 0, posa = 0, spese = 0, utile = 0
      for (const prevId of prevSet) {
        const cp = costiPerPrev.get(prevId)
        if (!cp) continue
        materiali += cp.materiali
        posa += cp.posa
        spese += cp.spese
        utile += cp.utile
      }
      sysPerCommessa.set(commessaId, { materiali, posa, spese, utile })
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
    const sys = sysPerCommessa.get(id) ?? { materiali: 0, posa: 0, spese: 0, utile: 0 }
    const man = manualePerCommessa.get(id) ?? { materiali: 0, posa: 0, utile: 0 }
    costiCommesse.push({
      commessa_id: id,
      blocco: info.blocco,
      data_conferma: info.data_conferma,
      materiali: sys.materiali + man.materiali,
      posa: sys.posa + man.posa,
      spese: sys.spese, // le spese varie esistono solo lato preventivo, non tra i costi manuali
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

  // Le scadenze non appartengono ai blocchi commesse: entrano come lista a sé.
  const scadenze: ScadenzaRow[] = (scadenzeRaw ?? []).map((s) => ({
    data_scadenza: s.data_scadenza,
    importo: Number(s.importo) || 0,
    pagato: !!s.pagato,
    annullata: !!s.annullata,
    categoria: s.categoria ?? 'altro',
  }))

  const altriCrediti: AltroCreditoRow[] = (altriCreditiRaw ?? []).map((a) => ({
    importo: Number(a.importo) || 0,
    incassato: !!a.incassato,
  }))

  // Uscite verso i dipendenti: buste pagate/bonifici dei fissi + movimenti di tipo
  // 'pagamento' degli altri dipendenti. Sono uscite di cassa come le scadenze.
  const pagamentiDipendenti: PagamentoDipendenteRow[] = [
    ...(pagDipRaw ?? []).map((p) => ({
      data_pagamento: p.data_pagamento,
      importo: Number(p.importo) || 0,
    })),
    ...(movAltriRaw ?? [])
      .filter((m) => m.tipo === 'pagamento')
      .map((m) => ({ data_pagamento: m.data_pagamento, importo: Number(m.importo) || 0 })),
  ]

  // Conto per persona: netto delle buste (o stipendi maturati) contro quanto versato.
  // Aggregato qui perché il floor a zero va applicato per singola persona.
  const contiPerPersona = new Map<string, { dovuto: number; pagato: number }>()
  function conto(id: string) {
    let c = contiPerPersona.get(id)
    if (!c) {
      c = { dovuto: 0, pagato: 0 }
      contiPerPersona.set(id, c)
    }
    return c
  }
  for (const b of busteRaw ?? []) conto(`d:${b.dipendente_id}`).dovuto += Number(b.netto) || 0
  for (const p of pagDipRaw ?? []) conto(`d:${p.dipendente_id}`).pagato += Number(p.importo) || 0
  for (const m of movAltriRaw ?? []) {
    const c = conto(`a:${m.altro_dipendente_id}`)
    if (m.tipo === 'stipendio') c.dovuto += Number(m.importo) || 0
    else c.pagato += Number(m.importo) || 0
  }
  const contiDipendenti: ContoDipendenteRow[] = [...contiPerPersona.values()]

  // Data locale italiana, non UTC: dopo mezzanotte a Roma il server UTC è ancora al
  // giorno prima e sposterebbe il confine dello "scaduto". 'en-CA' formatta YYYY-MM-DD.
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())

  return (
    <StatisticheCommesse
      dati={{
        commesse, acconti, anni, costiCommesse, scadenze, oggi,
        altriCrediti, pagamentiDipendenti, contiDipendenti,
      }}
    />
  )
}
