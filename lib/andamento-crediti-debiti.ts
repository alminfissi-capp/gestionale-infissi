import { STATI_CREDITO } from '@/lib/statistiche-commesse'

/**
 * Ricostruzione nel tempo di crediti e debiti.
 *
 * Il gestionale non conserva fotografie del passato: la serie si ricava dai
 * movimenti, che sono datati. Le date ISO si confrontano come stringhe, quindi
 * tutto qui dentro resta puro e verificabile con date fisse.
 *
 * I crediti sono esatti. I debiti dipendono da una regola che l'utente
 * governa: la data di una scadenza non chiude il debito da sola, lo chiude la
 * spunta "pagato". Chi paga in ritardo sposta la data e la curva scende nel
 * punto giusto.
 *
 * Una imprecisione dichiarata: lo stato di una commessa e' quello di adesso,
 * non quello che aveva allora, perche' la storia degli stati non viene
 * conservata. Pesa poco — otto stati su nove contano come credito — ma esiste.
 */

export type PeriodoAndamento = '30g' | '3m' | '6m' | '12m' | '24m' | 'tutto'

export type PuntoAndamento = {
  data: string // 'YYYY-MM-DD'
  crediti: number
  debiti: number
  netta: number
}

export type CommessaAndamento = {
  id: string
  totale: number
  data_conferma: string | null
  stato: string
}
export type AccontoAndamento = {
  commessa_id: string
  importo: number
  data_pagamento: string | null
}
export type ScadenzaAndamento = {
  importo: number
  data_scadenza: string | null
  pagato: boolean
  annullata: boolean
  created_at: string
}
export type AltroCreditoAndamento = {
  importo: number
  incassato: boolean
  created_at: string
}
export type BustaAndamento = {
  dipendente_id: string
  periodo: string
  netto: number
}
export type PagamentoAndamento = {
  dipendente_id: string
  data_pagamento: string
  importo: number
}
export type AnticipoAndamento = {
  id: string
  importo: number
  data_erogazione: string | null
  rimborsato: boolean
  rimborsato_at: string | null
  acconti: { importo: number; data_pagamento: string | null }[]
}

export type DatiAndamento = {
  commesse: CommessaAndamento[]
  acconti: AccontoAndamento[]
  scadenze: ScadenzaAndamento[]
  altriCrediti: AltroCreditoAndamento[]
  buste: BustaAndamento[]
  pagamentiDipendenti: PagamentoAndamento[]
  anticipi: AnticipoAndamento[]
}

const SET_STATI_CREDITO: ReadonlySet<string> = new Set(STATI_CREDITO)

/** Solo la parte data di un timestamp: 'YYYY-MM-DDTHH:MM:SSZ' → 'YYYY-MM-DD'. */
function soloData(iso: string): string {
  return iso.slice(0, 10)
}

function euro(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Quanto restava da incassare alla data indicata. */
export function creditiAllaData(dati: DatiAndamento, data: string): number {
  const incassatoPerCommessa = new Map<string, number>()
  for (const a of dati.acconti) {
    if (!a.data_pagamento || soloData(a.data_pagamento) > data) continue
    const attuale = incassatoPerCommessa.get(a.commessa_id) ?? 0
    incassatoPerCommessa.set(a.commessa_id, attuale + (Number(a.importo) || 0))
  }

  let totale = 0
  for (const c of dati.commesse) {
    if (!SET_STATI_CREDITO.has(c.stato)) continue
    if (!c.data_conferma || soloData(c.data_conferma) > data) continue
    // Floor a zero per commessa: una incassata in eccesso non deve mascherare
    // il credito di un'altra.
    const residuo = (Number(c.totale) || 0) - (incassatoPerCommessa.get(c.id) ?? 0)
    if (residuo > 0) totale += residuo
  }

  // Incassi in attesa: entrano solo se non ancora incassati. Di quelli gia'
  // incassati non si conosce la data, quindi restano fuori dalla storia; cosi'
  // l'ultimo punto della serie coincide col riquadro "Crediti e debiti", che
  // applica lo stesso filtro.
  for (const a of dati.altriCrediti) {
    if (a.incassato) continue
    if (soloData(a.created_at) > data) continue
    totale += Number(a.importo) || 0
  }

  return euro(totale)
}

/** Quanto restava da pagare alla data indicata. Il fido di cassa resta fuori. */
export function debitiAllaData(dati: DatiAndamento, data: string): number {
  let totale = 0

  // ── Scadenze fornitori ────────────────────────────────────────────────────
  for (const s of dati.scadenze) {
    if (s.annullata) continue
    if (soloData(s.created_at) > data) continue
    // La data chiude il debito solo se la spunta "pagato" c'e'. Senza spunta
    // resta aperto anche se la data e' passata.
    if (s.pagato && s.data_scadenza && s.data_scadenza <= data) continue
    totale += Number(s.importo) || 0
  }

  // ── Dipendenti ────────────────────────────────────────────────────────────
  // Il debito matura al periodo di competenza della busta, non a quando la si
  // registra: chi inserisce le buste di marzo ad aprile vede comunque il
  // gradino a marzo. Floor per persona, come nel riquadro esistente.
  const dovutoPer = new Map<string, number>()
  for (const b of dati.buste) {
    if (soloData(b.periodo) > data) continue
    dovutoPer.set(b.dipendente_id, (dovutoPer.get(b.dipendente_id) ?? 0) + (Number(b.netto) || 0))
  }
  const pagatoPer = new Map<string, number>()
  for (const p of dati.pagamentiDipendenti) {
    if (soloData(p.data_pagamento) > data) continue
    pagatoPer.set(p.dipendente_id, (pagatoPer.get(p.dipendente_id) ?? 0) + (Number(p.importo) || 0))
  }
  for (const [id, dovuto] of dovutoPer) {
    const residuo = dovuto - (pagatoPer.get(id) ?? 0)
    if (residuo > 0) totale += residuo
  }

  // ── Anticipi fattura ──────────────────────────────────────────────────────
  // Nascono all'erogazione e calano con gli acconti del cliente che la banca
  // trattiene. Senza data di erogazione non si sa da quando esistono: restano
  // fuori dalla storia invece di comparire dall'inizio dei tempi.
  for (const a of dati.anticipi) {
    if (!a.data_erogazione || a.data_erogazione > data) continue
    if (a.rimborsato && a.rimborsato_at && a.rimborsato_at <= data) continue
    let residuo = Number(a.importo) || 0
    for (const ac of a.acconti) {
      if (!ac.data_pagamento || soloData(ac.data_pagamento) > data) continue
      residuo -= Number(ac.importo) || 0
    }
    if (residuo > 0) totale += residuo
  }

  return euro(totale)
}

function aggiungiGiorni(data: string, giorni: number): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + giorni)
  return d.toISOString().slice(0, 10)
}

function aggiungiMesi(data: string, mesi: number): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + mesi)
  return d.toISOString().slice(0, 10)
}

/**
 * Le date dei punti del grafico, dalla piu' vecchia a oggi.
 *
 * La fittezza segue il periodo: oltre i tre mesi una linea giornaliera diventa
 * un pettine illeggibile.
 */
export function dateDelPeriodo(
  periodo: PeriodoAndamento,
  oggi: string,
  primaData: string | null,
): string[] {
  let inizio: string
  let passo: number
  let unita: 'giorno' | 'mese'

  if (periodo === '30g')      { inizio = aggiungiGiorni(oggi, -30);  passo = 1; unita = 'giorno' }
  else if (periodo === '3m')  { inizio = aggiungiMesi(oggi, -3);     passo = 1; unita = 'giorno' }
  else if (periodo === '6m')  { inizio = aggiungiMesi(oggi, -6);     passo = 7; unita = 'giorno' }
  else if (periodo === '12m') { inizio = aggiungiMesi(oggi, -12);    passo = 7; unita = 'giorno' }
  else if (periodo === '24m') { inizio = aggiungiMesi(oggi, -24);    passo = 1; unita = 'mese' }
  else {
    // "tutto": dal primo movimento. Senza movimenti c'e' solo l'oggi.
    if (!primaData) return [oggi]
    inizio = primaData
    unita = 'mese'
    passo = 1
  }

  const date: string[] = []
  let corrente = inizio
  // Rete di sicurezza: oltre questo numero di punti c'e' un ciclo impazzito,
  // non un periodo lungo.
  for (let i = 0; corrente < oggi && i < 2000; i++) {
    date.push(corrente)
    corrente = unita === 'giorno' ? aggiungiGiorni(corrente, passo) : aggiungiMesi(corrente, passo)
  }
  // L'ultimo punto e' sempre oggi: e' il numero che si confronta col riquadro.
  date.push(oggi)
  return date
}

/** La data del movimento piu' vecchio, per il periodo "tutto". */
export function primoMovimento(dati: DatiAndamento): string | null {
  const candidate: string[] = []
  for (const c of dati.commesse) if (c.data_conferma) candidate.push(soloData(c.data_conferma))
  for (const s of dati.scadenze) candidate.push(soloData(s.created_at))
  for (const b of dati.buste) candidate.push(soloData(b.periodo))
  for (const a of dati.anticipi) if (a.data_erogazione) candidate.push(a.data_erogazione)
  for (const a of dati.altriCrediti) candidate.push(soloData(a.created_at))
  if (candidate.length === 0) return null
  return candidate.reduce((min, d) => (d < min ? d : min))
}

/** La serie completa per il grafico. */
export function andamentoCreditiDebiti(
  dati: DatiAndamento,
  periodo: PeriodoAndamento,
  oggi: string,
): PuntoAndamento[] {
  const date = dateDelPeriodo(periodo, oggi, primoMovimento(dati))
  return date.map((data) => {
    const crediti = creditiAllaData(dati, data)
    const debiti = debitiAllaData(dati, data)
    return { data, crediti, debiti, netta: euro(crediti - debiti) }
  })
}
