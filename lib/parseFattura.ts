// Lettura delle fatture e note di credito generate da FattureInCloud, a
// partire dal testo estratto dal PDF (lib/pdfText.ts nel browser).
//
// Nessuna AI: il layout e' fisso e bastano le espressioni regolari, come per
// le contabili dei bonifici in lib/parseBonificoScadenza.ts. Il parser e' puro
// e testato su tre fatture reali (lib/parseFattura.fixtures.ts).
//
// Attenzione all'ordine del testo: pdfjs restituisce i blocchi nell'ordine in
// cui stanno nel PDF, che non e' quello in cui appaiono a schermo. Nelle
// fatture FattureInCloud il blocco DESTINATARIO arriva in fondo alla pagina,
// dopo i totali, e su un documento di piu' pagine si ripete solo sulla prima.
// Per questo nessuna regex qui sotto fa affidamento sull'ordine globale.

export type TipoDocumentoFiscale = 'fattura' | 'nota_credito'

export type FatturaEstratta = {
  tipo: TipoDocumentoFiscale
  numero: string
  data: string // YYYY-MM-DD
  descrizione: string
  imponibile: number // negativo per le note di credito
  iva: number // negativo per le note di credito
  totale: number // imponibile + iva
  destinatario: string | null
  destinatarioIndirizzo: string | null
  destinatarioPiva: string | null
  destinatarioCf: string | null
  preventivoCitato: { numero: string; data: string } | null
}

/** Numero in formato italiano: 15.163,94 → 15163.94 */
function parseNum(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

/** 24/11/2025 → 2025-11-24 */
function parseData(g: string, m: string, a: string): string {
  return `${a}-${m}-${g}`
}

const righeNonVuote = (blocco: string): string[] =>
  blocco.split('\n').map((r) => r.trim()).filter(Boolean)

/**
 * Intestazione del documento. Deve stare a inizio riga e in maiuscolo: e' cosi'
 * che FattureInCloud stampa il titolo. Il vincolo serve a non agganciare ne' il
 * piede di pagina ("Fattura nr. 97/2025 del 24/11/2025 - 1 / 1"), ne' le
 * fatture citate dentro le righe di una fattura a saldo ("Detratta Ns. fattura
 * nr.97 del 24/11/2025"), che porterebbero a leggere il numero sbagliato.
 */
function estraiIntestazione(
  text: string
): { tipo: TipoDocumentoFiscale; numero: string; data: string } | null {
  const m = text.match(
    /^[ \t]*(FATTURA|NOTA DI CREDITO)\s+nr\.?\s*(\S+)\s+del\s+(\d{2})\/(\d{2})\/(\d{4})/m
  )
  if (!m) return null
  return {
    tipo: m[1] === 'FATTURA' ? 'fattura' : 'nota_credito',
    numero: m[2],
    data: parseData(m[3], m[4], m[5]),
  }
}

/**
 * Descrizione da mostrare nel resoconto. Il blocco OGGETTO, quando c'e', e' gia'
 * la sintesi buona ("Fattura a saldo - Progetto PSR..."); altrimenti si prende
 * la prima riga sotto l'intestazione della tabella, che nelle fatture di acconto
 * e' "Acconto su preventivo n. ...".
 */
function estraiDescrizione(text: string): string {
  const oggetto = text.match(/^[ \t]*OGGETTO[ \t]*$/m)
  if (oggetto?.index != null) {
    const dopo = text.slice(oggetto.index + oggetto[0].length)
    const fine = dopo.search(/^[ \t]*DESCRIZIONE\b/m)
    const righe = righeNonVuote(fine >= 0 ? dopo.slice(0, fine) : dopo)
    if (righe.length > 0) return righe.join(' ')
  }

  const descrizione = text.match(/^[ \t]*DESCRIZIONE\b.*$/m)
  if (descrizione?.index != null) {
    const dopo = text.slice(descrizione.index + descrizione[0].length)
    const prima = righeNonVuote(dopo)[0]
    if (prima) return prima
  }

  return ''
}

/**
 * Preventivo citato nel documento: "preventivo n. 10040/2025 G del 22/11/2025"
 * nelle fatture di acconto, "Rif. Prev.n.10040/2025 G del 22/11/2025" in quelle
 * a saldo. Il numero puo' finire con una lettera di serie ("G").
 */
function estraiPreventivoCitato(text: string): { numero: string; data: string } | null {
  const m = text.match(
    /(?:preventivo|prev)\.?\s*n\.?\s*(\d[\w/\-.]*(?:\s+[A-Za-z]{1,2}\b)?)\s+del\s+(\d{2})\/(\d{2})\/(\d{4})/i
  )
  if (!m) return null
  return {
    numero: m[1].replace(/\s+/g, ' ').trim(),
    data: parseData(m[2], m[3], m[4]),
  }
}

type Destinatario = {
  nome: string | null
  indirizzo: string | null
  piva: string | null
  cf: string | null
}

const DESTINATARIO_VUOTO: Destinatario = { nome: null, indirizzo: null, piva: null, cf: null }

/**
 * Blocco del destinatario. P.IVA e codice fiscale del cliente stanno subito
 * prima dell'etichetta DESTINATARIO, mentre quelli dell'emittente sono in cima
 * al documento: per non scambiarli si cerca in una finestra stretta attorno
 * all'etichetta invece che nell'intero testo.
 */
function estraiDestinatario(text: string): Destinatario {
  const etichetta = text.search(/^[ \t]*DESTINATARIO[ \t]*$/m)
  if (etichetta < 0) return DESTINATARIO_VUOTO

  const finestra = text.slice(Math.max(0, etichetta - 300), etichetta + 300)
  const piva = finestra.match(/P\.IVA\s*(\d{11})/)?.[1] ?? null
  const cf = finestra.match(/\bCF\s+([A-Z0-9]{11,16})\b/)?.[1] ?? null

  const dopo = text.slice(etichetta)
  const righe = dopo.split('\n').slice(1).map((r) => r.trim())

  let nome: string | null = null
  const indirizzo: string[] = []
  for (const riga of righe) {
    // Il blocco finisce con la pagina: su un documento di piu' pagine subito
    // dopo ricomincia l'intestazione dell'emittente.
    if (!riga || /^(FATTURA|A\.L\.M\.|P\.iva\b)/i.test(riga)) break
    if (!nome) nome = riga
    else indirizzo.push(riga)
    if (indirizzo.length >= 3) break
  }

  return {
    nome,
    indirizzo: indirizzo.length > 0 ? indirizzo.join(' - ') : null,
    piva,
    cf,
  }
}

/**
 * Legge una fattura o una nota di credito. Restituisce null quando il testo non
 * e' un documento fiscale riconoscibile: il chiamante lo tratta come allegato
 * qualsiasi e lo ignora.
 */
export function parseFattura(text: string): FatturaEstratta | null {
  const intestazione = estraiIntestazione(text)
  if (!intestazione) return null

  // Il totale non si legge mai dal documento: nel riepilogo e nelle scadenze
  // compaiono piu' cifre uguali e si rischia di prendere quella sbagliata.
  // Imponibile e IVA sono etichettati in modo univoco, la somma e' sicura.
  const imponibile = parseNum(text.match(/Imponibile\s*€?\s*([\d.]*\d,\d{2})/)?.[1])
  const iva = parseNum(text.match(/Totale\s+IVA\s*€?\s*([\d.]*\d,\d{2})/)?.[1])
  if (imponibile === null || iva === null) return null

  const segno = intestazione.tipo === 'nota_credito' ? -1 : 1
  const imp = segno * Math.abs(imponibile)
  const impIva = segno * Math.abs(iva)
  const destinatario = estraiDestinatario(text)

  return {
    tipo: intestazione.tipo,
    numero: intestazione.numero,
    data: intestazione.data,
    descrizione: estraiDescrizione(text),
    imponibile: imp,
    iva: impIva,
    totale: Math.round((imp + impIva) * 100) / 100,
    destinatario: destinatario.nome,
    destinatarioIndirizzo: destinatario.indirizzo,
    destinatarioPiva: destinatario.piva,
    destinatarioCf: destinatario.cf,
    preventivoCitato: estraiPreventivoCitato(text),
  }
}
