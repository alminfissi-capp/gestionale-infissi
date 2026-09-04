import { createClient } from '@/lib/supabase/server'
import { selectAll } from '@/lib/supabase/paginate'
import { getOrgId } from '@/lib/auth'
import StatisticheCommesse from '@/components/commesse/StatisticheCommesse'
import { getPreferenzeStatistiche } from '@/actions/preferenze'
import type {
  StatRow, AccontoRow, CostoCommessaRow, ScadenzaRow,
  AltroCreditoRow, PagamentoDipendenteRow, ContoDipendenteRow,
} from '@/lib/statistiche-commesse'
import { riepilogoBanche, type ContoBancaRow, type LineaCreditoRow, type AnticipoRow, type InfoCommessa } from '@/lib/banche'
import { calcolaCostiPreventivo, type ArticoloCosti } from '@/lib/preventivo-costi'
import type { DatiAndamento } from '@/lib/andamento-crediti-debiti'

export default async function StatisticheCommessePage() {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // Ogni select passa da selectAll: PostgREST tronca le risposte a "Max rows"
  // (1000 di default) senza segnalarlo, e una pagina di totali che perde righe
  // mostrerebbe numeri sbagliati con l'aria di essere giusti. Sulle tabelle
  // piccole il costo e' nullo: una pagina sola, una richiesta sola come prima.
  const [
    commesseRaw, accontiRaw, gruppiRaw, junctionRaw,
    scadenzeRaw, altriCreditiRaw, busteRaw,
    pagDipRaw, movAltriRaw,
    contiRaw, lineeRaw, anticipiRaw, legamiRaw, legamiAccontiRaw,
  ] =
    await Promise.all([
      selectAll((da, a) => supabase
        .from('commesse')
        .select('id, numero_commessa, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id, stato, anonima, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        // `id` serve a sapere quali acconti la banca ha trattenuto sugli anticipi.
        .from('acconti_commessa')
        .select('id, commessa_id, importo, ritenuta, data_pagamento')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('gruppi_commesse')
        .select('id, nome')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('preventivi_commessa')
        .select('commessa_id, preventivo_id')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('scadenze')
        .select('data_scadenza, importo, pagato, annullata, categoria, created_at')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      // Incassi in attesa: entrate che non nascono da una commessa
      selectAll((da, a) => supabase
        .from('calcoli_incassi')
        .select('importo, incassato, created_at')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('buste_paga')
        .select('dipendente_id, periodo, netto')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('pagamenti_dipendente')
        .select('dipendente_id, importo, data_pagamento')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('movimenti_altro_dipendente')
        .select('altro_dipendente_id, importo, data_pagamento, tipo')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('conti_correnti')
        .select('id, nome, saldo_attuale, fido_accordato')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('linee_credito')
        .select('id, nome, tipo, accordato')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      // A differenza della pagina Calcoli (che ha un toggle "mostra rimborsati" e quindi
      // carica tutto), qui gli anticipi finiscono solo dentro riepilogoBanche, che scarta
      // i rimborsati alla prima riga del suo ciclo: non serve mai mostrarli, e caricarli
      // tutti significherebbe accumulare righe morte man mano che gli anticipi vengono saldati.
      selectAll((da, a) => supabase
        .from('anticipi_fattura')
        .select('id, linea_id, descrizione, importo, data_scadenza, rimborsato, data_erogazione, rimborsato_at')
        .eq('organization_id', orgId)
        .eq('rimborsato', false)
        .order('id').range(da, a)),
      // I legami anticipo↔commesse: un anticipo può coprire più commesse, perché
      // una sola fattura può essere emessa per più lavori.
      // Tabella ponte senza `id`: l'ordine deterministico lo danno le due chiavi.
      selectAll((da, a) => supabase
        .from('anticipi_commesse')
        .select('anticipo_id, commessa_id')
        .eq('organization_id', orgId)
        .order('anticipo_id').order('commessa_id').range(da, a)),
      // Gli acconti che la banca ha trattenuto per rientrare: scalano il debito.
      selectAll((da, a) => supabase
        .from('anticipi_acconti')
        .select('anticipo_id, acconto_id')
        .eq('organization_id', orgId)
        .order('anticipo_id').order('acconto_id').range(da, a)),
    ])

  // Mappa gruppo_id → nome blocco (es. "2025", "2026")
  const nomeBlocco = new Map<string, string>()
  for (const g of gruppiRaw) nomeBlocco.set(g.id, g.nome)

  // Le commesse "in attesa" sono solo promemoria (accettate ma non formalizzate):
  // vanno escluse da TUTTE le statistiche finché non passano a un altro stato.
  const commesseValide = commesseRaw.filter((c) => c.stato !== 'in_attesa')
  const idsValide = new Set(commesseValide.map((c) => c.id))

  const commesse: StatRow[] = commesseValide.map((c) => ({
    id: c.id,
    cliente_nome: c.cliente_nome ?? '',
    totale: Number(c.totale) || 0,
    data_conferma: c.data_conferma,
    blocco: c.gruppo_id ? (nomeBlocco.get(c.gruppo_id) ?? null) : null,
    stato: c.stato ?? '',
    anonima: Boolean(c.anonima),
  }))

  // Acconti esclusi se la commessa collegata è "in attesa".
  const acconti: AccontoRow[] = accontiRaw
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
  for (const j of junctionRaw) {
    if (idsValide.has(j.commessa_id)) addLink(j.commessa_id, j.preventivo_id)
  }

  const tuttiPrevIds = [...new Set([...preventiviPerCommessa.values()].flatMap((s) => [...s]))]

  // Costi calcolati dai preventivi INTERNI, sommati per commessa.
  const sysPerCommessa = new Map<string, { materiali: number; posa: number; spese: number; utile: number }>()
  if (tuttiPrevIds.length > 0) {
    const [prevRaw, artRaw] = await Promise.all([
      selectAll((da, a) => supabase
        .from('preventivi')
        .select('id, totale_articoli, spese_trasporto')
        .in('id', tuttiPrevIds)
        .order('id').range(da, a)),
      // La tabella piu' grossa della pagina: qui il tetto delle 1000 righe e' una
      // questione di tempo, e senza paginazione i costi stimati calerebbero da soli.
      selectAll((da, a) => supabase
        .from('articoli_preventivo')
        .select('preventivo_id, tipo, quantita, costo_acquisto_unitario, costo_posa, config_su_misura, config_scorrevole, config_winconfig')
        .in('preventivo_id', tuttiPrevIds)
        .order('id').range(da, a)),
    ])

    const articoliPerPrev = new Map<string, ArticoloCosti[]>()
    for (const a of artRaw) {
      const list = articoliPerPrev.get(a.preventivo_id) ?? []
      list.push(a as ArticoloCosti)
      articoliPerPrev.set(a.preventivo_id, list)
    }
    const costiPerPrev = new Map<string, { materiali: number; posa: number; spese: number; utile: number }>()
    for (const p of prevRaw) {
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
  const scadenze: ScadenzaRow[] = scadenzeRaw.map((s) => ({
    data_scadenza: s.data_scadenza,
    importo: Number(s.importo) || 0,
    pagato: !!s.pagato,
    annullata: !!s.annullata,
    categoria: s.categoria ?? 'altro',
    created_at: s.created_at,
  }))

  const altriCrediti: AltroCreditoRow[] = altriCreditiRaw.map((a) => ({
    importo: Number(a.importo) || 0,
    incassato: !!a.incassato,
    created_at: a.created_at,
  }))

  // Uscite verso i dipendenti: buste pagate/bonifici dei fissi + movimenti di tipo
  // 'pagamento' degli altri dipendenti. Sono uscite di cassa come le scadenze.
  const pagamentiDipendenti: PagamentoDipendenteRow[] = [
    ...pagDipRaw.map((p) => ({
      data_pagamento: p.data_pagamento,
      importo: Number(p.importo) || 0,
    })),
    ...movAltriRaw
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
  for (const b of busteRaw) conto(`d:${b.dipendente_id}`).dovuto += Number(b.netto) || 0
  for (const p of pagDipRaw) conto(`d:${p.dipendente_id}`).pagato += Number(p.importo) || 0
  for (const m of movAltriRaw) {
    const c = conto(`a:${m.altro_dipendente_id}`)
    if (m.tipo === 'stipendio') c.dovuto += Number(m.importo) || 0
    else c.pagato += Number(m.importo) || 0
  }
  const contiDipendenti: ContoDipendenteRow[] = [...contiPerPersona.values()]

  const contiBanca: ContoBancaRow[] = contiRaw.map((c) => ({
    id: c.id,
    nome: c.nome,
    disponibile: Number(c.saldo_attuale) || 0,
    accordato: Number(c.fido_accordato) || 0,
  }))

  const lineeCredito: LineaCreditoRow[] = lineeRaw.map((l) => ({
    id: l.id,
    nome: l.nome,
    tipo: l.tipo,
    accordato: Number(l.accordato) || 0,
  }))

  const commessePerAnticipo = new Map<string, string[]>()
  for (const l of legamiRaw) {
    const list = commessePerAnticipo.get(l.anticipo_id) ?? []
    list.push(l.commessa_id)
    commessePerAnticipo.set(l.anticipo_id, list)
  }

  // Quanto è già rientrato per ogni anticipo. Gli importi si prendono dagli acconti
  // già caricati in pagina: sono gli stessi che alimentano i crediti da commessa.
  const importoAcconto = new Map<string, number>()
  for (const a of accontiRaw) importoAcconto.set(a.id, Number(a.importo) || 0)
  const scalatoPerAnticipo = new Map<string, number>()
  for (const l of legamiAccontiRaw) {
    scalatoPerAnticipo.set(
      l.anticipo_id,
      (scalatoPerAnticipo.get(l.anticipo_id) ?? 0) + (importoAcconto.get(l.acconto_id) ?? 0),
    )
  }

  const anticipi: AnticipoRow[] = anticipiRaw.map((a) => ({
    id: a.id,
    linea_id: a.linea_id,
    commesse_ids: commessePerAnticipo.get(a.id) ?? [],
    descrizione: a.descrizione ?? '',
    importo: Number(a.importo) || 0,
    scalato: scalatoPerAnticipo.get(a.id) ?? 0,
    data_scadenza: a.data_scadenza,
    rimborsato: !!a.rimborsato,
  }))

  // Etichetta e residuo delle commesse collegate agli anticipi. Si costruisce su
  // commesseRaw, NON su commesseValide: un anticipo può puntare a una commessa
  // "in attesa", che è esclusa dalle statistiche ma il cui debito con la banca esiste.
  const incassatoTot = new Map<string, number>()
  for (const a of accontiRaw) {
    incassatoTot.set(a.commessa_id, (incassatoTot.get(a.commessa_id) ?? 0) + (Number(a.importo) || 0))
  }
  const infoCommesse: Record<string, InfoCommessa> = {}
  for (const c of commesseRaw) {
    infoCommesse[c.id] = {
      etichetta: `${c.numero_commessa} — ${c.cliente_nome ?? ''}`.trim(),
      residuo: Math.max(0, (Number(c.totale) || 0) - (incassatoTot.get(c.id) ?? 0)),
    }
  }

  // Data locale italiana, non UTC: dopo mezzanotte a Roma il server UTC è ancora al
  // giorno prima e sposterebbe il confine dello "scaduto". 'en-CA' formatta YYYY-MM-DD.
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())

  const preferenze = await getPreferenzeStatistiche()

  // Fido utilizzato dei SOLI conti correnti: gli anticipi fattura (linee di
  // credito) sono già ricostruiti nella serie storica dalle loro date, quindi
  // sommarli anche qui li conterebbe due volte. Il saldo di un conto invece è
  // un numero scritto a mano senza storia: resta fuori dalla serie e compare
  // solo come nota sotto il grafico.
  const banche = riepilogoBanche(contiBanca, lineeCredito, anticipi, infoCommesse, oggi)
  const fidoUtilizzato = banche.fidoCassaUtilizzato

  // Gli acconti che la banca ha trattenuto su ciascun anticipo, ricavati
  // incrociando la tabella ponte con gli acconti già caricati sopra.
  const accontoPerId = new Map(accontiRaw.map((a) => [a.id, a]))
  const accontiPerAnticipo = new Map<string, { importo: number; data_pagamento: string | null }[]>()
  for (const l of legamiAccontiRaw) {
    const acc = accontoPerId.get(l.acconto_id)
    if (!acc) continue
    const lista = accontiPerAnticipo.get(l.anticipo_id) ?? []
    lista.push({ importo: Number(acc.importo) || 0, data_pagamento: acc.data_pagamento })
    accontiPerAnticipo.set(l.anticipo_id, lista)
  }

  const datiAndamento: DatiAndamento = {
    commesse: commesseValide.map((c) => ({
      id: c.id,
      totale: Number(c.totale) || 0,
      data_conferma: c.data_conferma,
      stato: c.stato ?? '',
    })),
    acconti: accontiRaw.map((a) => ({
      commessa_id: a.commessa_id,
      importo: Number(a.importo) || 0,
      data_pagamento: a.data_pagamento,
    })),
    scadenze: scadenze.map((s) => ({
      importo: s.importo,
      data_scadenza: s.data_scadenza,
      pagato: s.pagato,
      annullata: s.annullata,
      created_at: s.created_at ?? oggi,
    })),
    altriCrediti: altriCrediti.map((a) => ({
      importo: a.importo,
      incassato: a.incassato,
      created_at: a.created_at ?? oggi,
    })),
    buste: busteRaw.map((b) => ({
      dipendente_id: b.dipendente_id,
      periodo: b.periodo,
      netto: Number(b.netto) || 0,
    })),
    pagamentiDipendenti: pagDipRaw.map((p) => ({
      dipendente_id: p.dipendente_id,
      data_pagamento: p.data_pagamento,
      importo: Number(p.importo) || 0,
    })),
    anticipi: anticipiRaw.map((a) => ({
      id: a.id,
      importo: Number(a.importo) || 0,
      data_erogazione: a.data_erogazione,
      rimborsato: a.rimborsato,
      rimborsato_at: a.rimborsato_at,
      acconti: accontiPerAnticipo.get(a.id) ?? [],
    })),
  }

  return (
    <StatisticheCommesse
      dati={{
        commesse, acconti, anni, costiCommesse, scadenze, oggi,
        altriCrediti, pagamentiDipendenti, contiDipendenti,
        contiBanca, lineeCredito, anticipi, infoCommesse,
      }}
      datiAndamento={datiAndamento}
      oggi={oggi}
      fidoUtilizzato={fidoUtilizzato}
      ordineIniziale={preferenze.ordineBlocchi}
    />
  )
}
