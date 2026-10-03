import type { DocumentoCollegabile, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'
import { formatEuro } from '@/lib/pricing'

const cent = (v: number) => Math.round(v * 100) / 100

export type QuotaAltraScadenza = { fic_documento_id: number; importo: number; stato_fic: StatoFic }

/**
 * Quanto la scadenza corrente puo' ancora assegnare a un documento.
 * `residuoFic` sono le rate da pagare su FiC (copia locale). Le quote di altre
 * scadenze gia' `scritto` sono gia' dentro quelle rate; le altre (non scritte,
 * da allineare, da verificare) sono promesse e si tolgono. `giaScrittoQui` e'
 * quanto la scadenza corrente ha gia' scritto su questo documento: su FiC
 * risulta pagato, ma e' suo e torna disponibile per lei.
 */
export function residuoDisponibile(
  residuoFic: number,
  ficId: number,
  altre: QuotaAltraScadenza[],
  giaScrittoQui: number,
): number {
  const promesso = altre
    .filter((q) => q.fic_documento_id === ficId && q.stato_fic !== 'scritto')
    .reduce((s, q) => s + q.importo, 0)
  return Math.max(0, cent(residuoFic + giaScrittoQui - promesso))
}

export type DaRipartire = Pick<DocumentoCollegabile, 'fic_id' | 'tipo' | 'residuo' | 'prima_scadenza' | 'data'>

const chiaveOrdine = (d: DaRipartire) => d.prima_scadenza ?? d.data

/**
 * Ripartizione automatica: le note di credito si scalano per intero, poi le
 * fatture si coprono dalla prima scadenza finche' c'e' disponibile.
 */
export function ripartisci(importoScadenza: number, selezionati: DaRipartire[]): Record<number, number> {
  const quote: Record<number, number> = {}
  let disponibile = cent(importoScadenza)
  // Una nota di credito si usa solo per quanto servono le fatture selezionate:
  // il resto del credito resta disponibile sulla nota, non si brucia.
  let fattureDaCoprire = cent(
    selezionati.filter((d) => d.tipo === 'fattura').reduce((s, d) => s + d.residuo, 0),
  )
  for (const n of selezionati.filter((d) => d.tipo === 'nota_credito')) {
    const q = cent(Math.min(n.residuo, Math.max(0, fattureDaCoprire)))
    quote[n.fic_id] = q
    disponibile = cent(disponibile + q)
    fattureDaCoprire = cent(fattureDaCoprire - q)
  }
  const fatture = selezionati
    .filter((d) => d.tipo === 'fattura')
    .sort((a, b) =>
      chiaveOrdine(a).localeCompare(chiaveOrdine(b)) || a.data.localeCompare(b.data) || a.fic_id - b.fic_id)
  for (const f of fatture) {
    const q = cent(Math.min(f.residuo, Math.max(0, disponibile)))
    quote[f.fic_id] = q
    disponibile = cent(disponibile - q)
  }
  return quote
}

export type RigaControllo = {
  fic_id: number
  tipo: TipoFatturaFornitore
  numero: string | null
  residuo: number
  quota: number
}

export type EsitoControllo = {
  livello: 'ok' | 'avviso' | 'blocco'
  totaleFatture: number
  totaleNote: number
  differenza: number
  messaggi: string[]
}

const etichetta = (r: RigaControllo) => r.numero ?? `${r.tipo === 'nota_credito' ? 'NC' : 'fattura'} #${r.fic_id}`

export function controllaRipartizione(importoScadenza: number, righe: RigaControllo[]): EsitoControllo {
  const totaleFatture = cent(righe.filter((r) => r.tipo === 'fattura').reduce((s, r) => s + r.quota, 0))
  const totaleNote = cent(righe.filter((r) => r.tipo === 'nota_credito').reduce((s, r) => s + r.quota, 0))
  const differenza = cent(importoScadenza - (totaleFatture - totaleNote))

  const blocchi: string[] = []
  for (const r of righe) {
    if (cent(r.quota) <= 0) blocchi.push(`${etichetta(r)}: nessun importo assegnato, toglila o aumenta l'importo`)
    else if (cent(r.quota) > cent(r.residuo)) blocchi.push(`${etichetta(r)}: al massimo ${formatEuro(r.residuo)} €`)
  }
  if (blocchi.length) return { livello: 'blocco', totaleFatture, totaleNote, differenza, messaggi: blocchi }

  const avvisi: string[] = []
  for (const r of righe) {
    if (r.tipo === 'fattura' && cent(r.quota) < cent(r.residuo)) {
      avvisi.push(`${formatEuro(cent(r.residuo - r.quota))} € resteranno da pagare sulla fattura ${etichetta(r)}`)
    }
  }
  if (totaleNote > totaleFatture) {
    avvisi.push(`Le note di credito superano le fatture di ${formatEuro(cent(totaleNote - totaleFatture))} €`)
  } else if (differenza > 0) {
    avvisi.push(`${formatEuro(differenza)} € della scadenza non coprono nessuna fattura`)
  }
  if (differenza < 0) avvisi.push(`Le quote superano l'importo della scadenza di ${formatEuro(-differenza)} €`)

  return { livello: avvisi.length ? 'avviso' : 'ok', totaleFatture, totaleNote, differenza, messaggi: avvisi }
}

const FORME_SOCIETARIE = /\b(s r l s|s r l|srls|srl|s p a|spa|s n c|snc|s a s|sas)\b/g

/** Minuscole, senza accenti e punteggiatura, senza forma societaria. */
export function normalizzaFornitore(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(FORME_SOCIETARIE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ogni parola cercata deve stare nel nome, anche ignorando gli spazi del nome
 * ("EDILSIDER" trova "Edil Sider").
 */
export function fornitoreCorrisponde(cercato: string, nome: string): boolean {
  const c = normalizzaFornitore(cercato)
  if (!c) return true
  const n = normalizzaFornitore(nome)
  const nCompatto = n.replace(/ /g, '')
  return c.split(' ').every((p) => n.includes(p) || nCompatto.includes(p))
}

/**
 * Importo scritto a mano. La virgola e' il separatore decimale italiano; senza
 * virgola, un solo punto seguito da una o due cifre e' un decimale (tastiere
 * dei telefoni che hanno solo il punto), altrimenti i punti sono migliaia.
 */
export function parseImporto(testo: string): number | null {
  const t = testo.trim().replace(/\s/g, '').replace('€', '')
  if (!t) return null
  let normale: string
  if (t.includes(',')) normale = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d+\.\d{1,2}$/.test(t)) normale = t
  else normale = t.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(normale)) return null
  return cent(Number(normale))
}

export type Periodo = { dal: string; al: string }

/**
 * Periodo proposto nella finestra di collegamento: sei mesi di calendario fino
 * alla data della scadenza (il mese della scadenza e i cinque prima), dove di
 * solito stanno le fatture che quell'assegno paga. Senza data si parte da oggi.
 */
export function periodoIniziale(dataScadenza: string | null, oggi: string): Periodo {
  const al = dataScadenza ?? oggi
  const anno = Number(al.slice(0, 4))
  const mese = Number(al.slice(5, 7))
  const indice = anno * 12 + (mese - 1) - 5
  const annoDal = Math.floor(indice / 12)
  const meseDal = (indice % 12) + 1
  return { dal: `${annoDal}-${String(meseDal).padStart(2, '0')}-01`, al }
}

/** Senza metodo WinStudio non sa cosa dire a FiC: con documenti collegati e' obbligatorio. */
export function erroreMetodo(metodoId: number | null, numeroDocumenti: number): string | null {
  return numeroDocumenti > 0 && metodoId === null ? 'Scegli il metodo di pagamento su Fatture in Cloud' : null
}

/**
 * Metodo da proporre nella finestra: quello gia' scelto sulla scadenza, poi
 * quello usato l'ultima volta con lo stesso fornitore (un'utenza in SDD resta in
 * SDD, un fornitore pagato con bonifico resta bonifico anche se la categoria e'
 * "Ass./Bon."), poi Assegno per la categoria assegno. Mai un metodo che su FiC
 * non esiste piu'.
 */
export function metodoProposto(p: {
  categoria: string
  metodoScadenza: number | null
  ultimoDelFornitore: number | null
  metodi: { id: number; nome: string }[]
}): number | null {
  const esiste = (id: number | null) => id !== null && p.metodi.some((m) => m.id === id)
  if (esiste(p.metodoScadenza)) return p.metodoScadenza
  if (esiste(p.ultimoDelFornitore)) return p.ultimoDelFornitore
  if (p.categoria === 'assegno') return p.metodi.find((m) => m.nome.toLowerCase() === 'assegno')?.id ?? null
  return null
}
