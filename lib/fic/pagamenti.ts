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
  for (const n of selezionati.filter((d) => d.tipo === 'nota_credito')) {
    quote[n.fic_id] = cent(n.residuo)
    disponibile = cent(disponibile + n.residuo)
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
  if (differenza > 0) avvisi.push(`${formatEuro(differenza)} € della scadenza non coprono nessuna fattura`)
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
