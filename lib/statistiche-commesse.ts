// Logica pura per i grafici/statistiche commesse. Nessuna dipendenza React o Supabase.
//
// Definizione di "anno":
// - Andamento commesse e Resoconto cliente → l'anno è il BLOCCO di appartenenza
//   (i blocchi commesse sono nominati per anno: "2025", "2026"). I 12 mesi del
//   grafico vengono dalla data di conferma.
// - Incassi → l'anno è quello della DATA DI PAGAMENTO dell'acconto, a prescindere
//   dal blocco della commessa collegata.

import { normalizzaTesto } from '@/lib/ricerca-clienti'

export type StatRow = {
  id: string
  cliente_nome: string
  totale: number
  data_conferma: string | null
  blocco: string | null // nome del blocco/gruppo commesse di appartenenza
  stato: string         // stato commessa: decide se il residuo è un credito (STATI_CREDITO)
}

export type AccontoRow = {
  commessa_id: string
  importo: number
  data_pagamento: string | null
}

// Uscita dell'azienda: fornitori, finanziamenti, assegni, utenze, tasse.
export type ScadenzaRow = {
  data_scadenza: string | null
  importo: number
  pagato: boolean
  annullata: boolean
  categoria: string
}

// Credito che non nasce da una commessa (rimborsi, note di credito, prestiti).
// Vive nella pagina Calcoli ma è un credito aziendale a tutti gli effetti.
export type AltroCreditoRow = {
  importo: number
  incassato: boolean
}

// Uscita verso un dipendente già effettuata: busta pagata, bonifico o contanti.
export type PagamentoDipendenteRow = {
  data_pagamento: string | null
  importo: number
}

// Conto di un dipendente: netto delle buste (o stipendi maturati per gli altri
// dipendenti) contro quanto gli è già stato versato. Il server lo aggrega per
// persona, così qui resta una somma semplice.
export type ContoDipendenteRow = {
  dovuto: number
  pagato: number
}

// Contributo costi/utile di una commessa, sommato dai suoi preventivi INTERNI.
export type CostoCommessaRow = {
  commessa_id: string
  blocco: string | null
  data_conferma: string | null
  materiali: number
  posa: number
  spese: number // spese varie degli articoli su misura (costo, non utile)
  utile: number
}

export type DatiStatistiche = {
  commesse: StatRow[]
  acconti: AccontoRow[]
  anni: string[] // valori del selettore (nomi blocco + anni di pagamento), desc
  costiCommesse: CostoCommessaRow[] // commesse con ≥1 preventivo interno collegato
  scadenze: ScadenzaRow[] // uscite: usate per flusso mensile e debiti
  oggi: string // 'YYYY-MM-DD' calcolata sul server, per rendere puro il riepilogo
  altriCrediti: AltroCreditoRow[] // incassi in attesa, non legati a commesse
  pagamentiDipendenti: PagamentoDipendenteRow[] // stipendi già versati
  contiDipendenti: ContoDipendenteRow[] // dovuto/pagato per persona
}

export type PuntoMese = { mese: string; valore: number; numero: number }
export type PuntoFlusso = { mese: string; incasso: number; pagamento: number; saldo: number }
export type PuntoCostiUtili = { mese: string; materiali: number; posa: number; spese: number; costi: number; utile: number }
export type RigaResoconto = {
  anno: string // nome del blocco (o etichetta totale)
  numero: number
  fatturato: number
  incassato: number
  saldo: number
}

export const MESI_LABEL = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
]

// Estrae l'anno (stringa "YYYY") da una data ISO. '' se non valida.
function annoStr(data: string | null): string {
  if (!data || data.length < 4) return ''
  const y = data.slice(0, 4)
  return /^\d{4}$/.test(y) ? y : ''
}

// Estrae l'indice mese 0-11 da una data ISO. null se non valida.
function meseDi(data: string | null): number | null {
  if (!data || data.length < 7) return null
  const m = Number(data.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null
}

// Andamento commesse del blocco selezionato (12 righe gen-dic), distribuite per
// mese di data_conferma.
export function aggregaMese(commesse: StatRow[], anno: string): PuntoMese[] {
  const out: PuntoMese[] = MESI_LABEL.map((mese) => ({ mese, valore: 0, numero: 0 }))
  for (const c of commesse) {
    if (c.blocco !== anno) continue
    const m = meseDi(c.data_conferma)
    if (m === null) continue
    out[m].valore += Number(c.totale) || 0
    out[m].numero += 1
  }
  return out
}

// Flusso di cassa del mese: acconti incassati contro scadenze effettivamente pagate.
// L'anno è quello della data di pagamento (acconti) e di scadenza (uscite), non il
// blocco della commessa. Le scadenze annullate e quelle non ancora pagate restano
// fuori: il grafico confronta soldi realmente usciti con soldi realmente entrati.
export function aggregaFlussoMese(
  acconti: AccontoRow[],
  scadenze: ScadenzaRow[],
  pagamentiDipendenti: PagamentoDipendenteRow[],
  anno: string,
): PuntoFlusso[] {
  const out: PuntoFlusso[] = MESI_LABEL.map((mese) => ({ mese, incasso: 0, pagamento: 0, saldo: 0 }))

  for (const a of acconti) {
    if (annoStr(a.data_pagamento) !== anno) continue
    const m = meseDi(a.data_pagamento)
    if (m === null) continue
    out[m].incasso += Number(a.importo) || 0
  }

  for (const s of scadenze) {
    if (!s.pagato || s.annullata) continue
    if (annoStr(s.data_scadenza) !== anno) continue
    const m = meseDi(s.data_scadenza)
    if (m === null) continue
    out[m].pagamento += Number(s.importo) || 0
  }

  // Gli stipendi sono uscite come le altre: senza, il grafico direbbe che
  // dall'azienda esce molto meno di quanto esce davvero.
  for (const p of pagamentiDipendenti) {
    if (annoStr(p.data_pagamento) !== anno) continue
    const m = meseDi(p.data_pagamento)
    if (m === null) continue
    out[m].pagamento += Number(p.importo) || 0
  }

  for (const p of out) p.saldo = p.incasso - p.pagamento
  return out
}

// Costi/utili stimati per mese del blocco selezionato (12 righe gen-dic),
// distribuiti per mese di data_conferma della commessa.
export function aggregaCostiUtiliMese(costi: CostoCommessaRow[], anno: string): PuntoCostiUtili[] {
  const out: PuntoCostiUtili[] = MESI_LABEL.map((mese) => ({ mese, materiali: 0, posa: 0, spese: 0, costi: 0, utile: 0 }))
  for (const c of costi) {
    if (c.blocco !== anno) continue
    const m = meseDi(c.data_conferma)
    if (m === null) continue
    out[m].materiali += Number(c.materiali) || 0
    out[m].posa += Number(c.posa) || 0
    out[m].spese += Number(c.spese) || 0
    out[m].utile += Number(c.utile) || 0
  }
  for (const p of out) p.costi = p.materiali + p.posa + p.spese
  return out
}

// Quante commesse del blocco selezionato NON hanno un preventivo interno (escluse dalla stima).
export function contaCommesseSenzaPreventivo(
  commesse: StatRow[],
  costi: CostoCommessaRow[],
  anno: string,
): number {
  const conPreventivo = new Set(costi.filter((c) => c.blocco === anno).map((c) => c.commessa_id))
  const totBlocco = commesse.filter((c) => c.blocco === anno).length
  return Math.max(0, totBlocco - conPreventivo.size)
}

/**
 * Chiave di raggruppamento di un nome cliente: parole normalizzate e messe in ordine
 * alfabetico, così "Moritz Kind" e "Kind Moritz" sono lo stesso cliente.
 *
 * `commesse.cliente_nome` è testo libero senza legame con l'anagrafica: chi compila
 * scrive a volte "Nome Cognome" e a volte "Cognome Nome", e col confronto sulla stringa
 * intera lo stesso cliente si spezzava in due voci. Due persone diverse con le stesse
 * parole in ordine diverso sono, di fatto, la stessa persona.
 */
function chiaveCliente(nome: string): string {
  return normalizzaTesto(nome).split(' ').filter(Boolean).sort().join(' ')
}

// Lista clienti unici (indipendente dall'ordine delle parole, label originale), ordinati.
export function clientiUnici(commesse: StatRow[]): string[] {
  const map = new Map<string, string>()
  for (const c of commesse) {
    const nome = (c.cliente_nome ?? '').trim()
    if (!nome) continue
    const key = chiaveCliente(nome)
    if (!key) continue
    if (!map.has(key)) map.set(key, nome)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'it'))
}

// Ordina valori "anno" (nomi blocco numerici) in modo decrescente.
function ordinaAnniDesc(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
  return b.localeCompare(a)
}

// Resoconto per cliente, diviso per BLOCCO: fatturato, incassato, saldo residuo.
// Indipendente dal selettore: include tutti i blocchi del cliente.
export function resocontoCliente(
  commesse: StatRow[],
  acconti: AccontoRow[],
  cliente: string,
): { righe: RigaResoconto[]; totale: RigaResoconto } {
  const target = chiaveCliente(cliente)
  const commesseCliente = commesse.filter(
    (c) => chiaveCliente(c.cliente_nome ?? '') === target,
  )
  const bloccoPerCommessa = new Map<string, string>()
  const perBlocco = new Map<string, RigaResoconto>()

  function riga(blocco: string): RigaResoconto {
    let r = perBlocco.get(blocco)
    if (!r) {
      r = { anno: blocco, numero: 0, fatturato: 0, incassato: 0, saldo: 0 }
      perBlocco.set(blocco, r)
    }
    return r
  }

  for (const c of commesseCliente) {
    const blocco = c.blocco ?? '(senza blocco)'
    bloccoPerCommessa.set(c.id, blocco)
    const r = riga(blocco)
    r.numero += 1
    r.fatturato += Number(c.totale) || 0
  }

  // Acconti: attribuiti al blocco della commessa collegata (coerente con fatturato/saldo).
  const idsCliente = new Set(commesseCliente.map((c) => c.id))
  for (const a of acconti) {
    if (!idsCliente.has(a.commessa_id)) continue
    const blocco = bloccoPerCommessa.get(a.commessa_id)
    if (blocco === undefined) continue
    riga(blocco).incassato += Number(a.importo) || 0
  }

  const righe = [...perBlocco.values()].sort((a, b) => ordinaAnniDesc(a.anno, b.anno))
  for (const r of righe) r.saldo = r.fatturato - r.incassato

  const totale: RigaResoconto = righe.reduce(
    (acc, r) => ({
      anno: '',
      numero: acc.numero + r.numero,
      fatturato: acc.fatturato + r.fatturato,
      incassato: acc.incassato + r.incassato,
      saldo: acc.saldo + r.saldo,
    }),
    { anno: '', numero: 0, fatturato: 0, incassato: 0, saldo: 0 },
  )

  return { righe, totale }
}

// ── Uscite per categoria (istantanea del pagato) ──────────────────────────────

export type CategoriaUscita =
  | 'materiali' | 'stipendi' | 'finanziamenti' | 'utenze' | 'tasse' | 'altro'

export type FettaUscita = {
  categoria: CategoriaUscita
  label: string
  importo: number
  percentuale: number
}

// La categoria delle scadenze mappata sulle voci di spesa: gli assegni sono i
// pagamenti ai fornitori di materiali e servizi.
const CATEGORIA_USCITA: Record<string, CategoriaUscita> = {
  assegno: 'materiali',
  finanziamento: 'finanziamenti',
  utenza: 'utenze',
  tassa: 'tasse',
  altro: 'altro',
}

export const LABEL_USCITA: Record<CategoriaUscita, string> = {
  materiali: 'Materiali e servizi',
  stipendi: 'Stipendi',
  finanziamenti: 'Finanziamenti',
  utenze: 'Utenze',
  tasse: 'Tasse',
  altro: 'Altre spese',
}

/**
 * Istantanea di quanto è uscito nell'anno, diviso per voce di spesa. Solo pagamenti
 * effettuati e non annullati, come il grafico del flusso: un pagamento non può essere
 * nel futuro, quindi per l'anno in corso equivale a "fino ad oggi".
 *
 * Le fette tornano ordinate per importo decrescente e quelle a zero sono omesse: una
 * categoria senza spese non merita una voce in legenda.
 */
export function aggregaUscitePerCategoria(
  scadenze: ScadenzaRow[],
  pagamentiDipendenti: PagamentoDipendenteRow[],
  anno: string,
): { fette: FettaUscita[]; totale: number } {
  const somme = new Map<CategoriaUscita, number>()
  const somma = (cat: CategoriaUscita, importo: number) => {
    somme.set(cat, (somme.get(cat) ?? 0) + importo)
  }

  for (const s of scadenze) {
    if (!s.pagato || s.annullata) continue
    if (annoStr(s.data_scadenza) !== anno) continue
    // una categoria non prevista non va persa: finisce fra le altre spese
    somma(CATEGORIA_USCITA[s.categoria] ?? 'altro', Number(s.importo) || 0)
  }

  for (const p of pagamentiDipendenti) {
    if (annoStr(p.data_pagamento) !== anno) continue
    somma('stipendi', Number(p.importo) || 0)
  }

  const totale = [...somme.values()].reduce((s, v) => s + v, 0)

  const fette: FettaUscita[] = [...somme.entries()]
    .filter(([, importo]) => importo > 0)
    .map(([categoria, importo]) => ({
      categoria,
      label: LABEL_USCITA[categoria],
      importo,
      // totale > 0 garantito se almeno una fetta lo è: nessuna divisione per zero
      percentuale: totale > 0 ? (importo / totale) * 100 : 0,
    }))
    .sort((a, b) => b.importo - a.importo)

  return { fette, totale }
}

// Stati di commessa il cui residuo conta come credito, nell'ordine del flusso di lavoro.
// Elenco in POSITIVO: uno stato nuovo resta fuori finché non lo si aggiunge qui, che è il
// comportamento sicuro. Fuori solo 'in_attesa': accettata ma non formalizzata, è già
// scartata a monte da tutte le statistiche.
// 'concluso' significa consegnato e pagato, quindi in teoria residuo zero: sta nella lista
// proprio perché un importo diverso da zero lì dentro è il sintomo di uno stato messo per
// sbaglio, e va visto invece di sparire.
export const STATI_CREDITO = [
  'da_iniziare',
  'in_lavorazione',
  'da_consegnare',
  'consegnato',
  'parzialmente_consegnato',
  'concluso',
  'bloccato',
  'annullato',
] as const

export type StatoCredito = (typeof STATI_CREDITO)[number]

export const LABEL_STATO_CREDITO: Record<StatoCredito, string> = {
  da_iniziare: 'Da iniziare',
  in_lavorazione: 'In lavorazione',
  da_consegnare: 'Da consegnare',
  consegnato: 'Consegnato',
  parzialmente_consegnato: 'Parz. consegnato',
  concluso: 'Concluso',
  bloccato: 'Bloccato',
  annullato: 'Annullato',
}

const SET_STATI_CREDITO: ReadonlySet<string> = new Set(STATI_CREDITO)

// Una riga del dettaglio "Da commesse", aperto dalla tendina nel riquadro crediti.
export type CreditoPerStato = {
  stato: StatoCredito
  label: string
  importo: number
  numero: number // quante commesse hanno ancora un residuo in quello stato
}

// Posizione dell'azienda a una certa data: quanto resta da incassare e quanto da pagare.
// Indipendente dal selettore anno della pagina.
export type RiepilogoFinanziario = {
  creditiCommesse: number
  creditiPerStato: CreditoPerStato[] // dettaglio di creditiCommesse: le righe sommano al totale
  creditiAltri: number // incassi in attesa: entrate che non nascono da una commessa
  crediti: number      // totale
  debitiScaduti: number
  debitiAnno: number
  debitiFuturi: number
  debitiDaProgrammare: number
  debitiDipendenti: number
  debitiTotali: number
  posizioneNetta: number
}

// `oggi` arriva dal server come 'YYYY-MM-DD': le date ISO si confrontano come stringhe
// e la funzione resta pura, quindi testabile con una data fissa.
export function riepilogoCreditiDebiti(
  commesse: StatRow[],
  acconti: AccontoRow[],
  altriCrediti: AltroCreditoRow[],
  scadenze: ScadenzaRow[],
  contiDipendenti: ContoDipendenteRow[],
  oggi: string,
): RiepilogoFinanziario {
  const incassatoPerCommessa = new Map<string, number>()
  for (const a of acconti) {
    const attuale = incassatoPerCommessa.get(a.commessa_id) ?? 0
    incassatoPerCommessa.set(a.commessa_id, attuale + (Number(a.importo) || 0))
  }

  // Residuo per commessa con floor a zero: una commessa incassata in eccesso non deve
  // mascherare il credito di un'altra. Le commesse fuori da STATI_CREDITO non entrano né
  // nel totale né nel dettaglio, così le righe della tendina sommano sempre al totale.
  let creditiCommesse = 0
  const perStato = new Map<StatoCredito, { importo: number; numero: number }>()
  for (const c of commesse) {
    if (!SET_STATI_CREDITO.has(c.stato)) continue
    const residuo = (Number(c.totale) || 0) - (incassatoPerCommessa.get(c.id) ?? 0)
    if (residuo <= 0) continue
    creditiCommesse += residuo
    const stato = c.stato as StatoCredito
    const riga = perStato.get(stato) ?? { importo: 0, numero: 0 }
    riga.importo += residuo
    riga.numero += 1
    perStato.set(stato, riga)
  }

  // Ordine di STATI_CREDITO, non per importo: il dettaglio si legge come il flusso di
  // lavoro. Gli stati senza residuo restano fuori: una riga a zero non dice nulla.
  const creditiPerStato: CreditoPerStato[] = STATI_CREDITO.flatMap((stato) => {
    const riga = perStato.get(stato)
    return riga ? [{ stato, label: LABEL_STATO_CREDITO[stato], ...riga }] : []
  })

  let creditiAltri = 0
  for (const a of altriCrediti) {
    if (a.incassato) continue
    creditiAltri += Number(a.importo) || 0
  }
  const crediti = creditiCommesse + creditiAltri

  // Stesso floor delle commesse: un dipendente pagato in anticipo non azzera
  // il debito verso gli altri.
  let debitiDipendenti = 0
  for (const c of contiDipendenti) {
    const residuo = (Number(c.dovuto) || 0) - (Number(c.pagato) || 0)
    if (residuo > 0) debitiDipendenti += residuo
  }

  const annoOggi = annoStr(oggi)
  let debitiScaduti = 0
  let debitiAnno = 0
  let debitiFuturi = 0
  let debitiDaProgrammare = 0

  for (const s of scadenze) {
    if (s.pagato || s.annullata) continue
    const importo = Number(s.importo) || 0
    if (!s.data_scadenza) {
      debitiDaProgrammare += importo
    } else if (s.data_scadenza < oggi) {
      debitiScaduti += importo
    } else if (annoStr(s.data_scadenza) === annoOggi) {
      debitiAnno += importo
    } else {
      debitiFuturi += importo
    }
  }

  const debitiTotali =
    debitiScaduti + debitiAnno + debitiFuturi + debitiDaProgrammare + debitiDipendenti
  // Le rate oltre l'anno restano fuori dal netto: risponde a "reggo quest'anno?".
  // Gli stipendi arretrati invece ci entrano: sono dovuti adesso.
  const posizioneNetta =
    crediti - (debitiScaduti + debitiAnno + debitiDaProgrammare + debitiDipendenti)

  return {
    creditiCommesse,
    creditiPerStato,
    creditiAltri,
    crediti,
    debitiScaduti,
    debitiAnno,
    debitiFuturi,
    debitiDaProgrammare,
    debitiDipendenti,
    debitiTotali,
    posizioneNetta,
  }
}
