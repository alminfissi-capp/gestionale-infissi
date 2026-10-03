import type { EsitoFic, RiepilogoCollegamento, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'
import type { ScritturaFic } from '@/lib/fic/pagamenti-fic'

const cent = (v: number) => Math.round(v * 100) / 100

export type Desiderato = { pagare: boolean; data: string; metodoId: number | null }
export type Azione = 'niente' | 'scrivi' | 'annulla' | 'riscrivi'

/** Confronta cio' che dovrebbe esserci su FiC con cio' che WinStudio ha scritto. */
export function decidiAzione(c: { importo: number; scrittura_fic: ScritturaFic | null }, d: Desiderato): Azione {
  const s = c.scrittura_fic
  if (!d.pagare) return s ? 'annulla' : 'niente'
  if (!s) return 'scrivi'
  const scritto = cent(s.rate_pagate.reduce((t, r) => t + r.importo, 0))
  if (s.data !== d.data || s.metodo_id !== d.metodoId || scritto !== cent(c.importo)) return 'riscrivi'
  return 'niente'
}

export const ESITO_VUOTO: EsitoFic = { scritti: 0, annullati: 0, problemi: [], avvisi: [] }

const documenti = (n: number) => `${n} ${n === 1 ? 'documento' : 'documenti'}`

export function messaggioEsitoFic(e: EsitoFic): { tipo: 'successo' | 'avviso' | 'niente'; testo: string } {
  if (e.problemi.length) {
    return { tipo: 'avviso', testo: `Pagato in WinStudio, ma non tutto e' su FiC. ${e.problemi.join(' · ')}` }
  }
  if (e.avvisi.length) return { tipo: 'avviso', testo: e.avvisi.join(' · ') }
  if (e.scritti) return { tipo: 'successo', testo: `Pagamento scritto su FiC: ${documenti(e.scritti)}` }
  if (e.annullati) return { tipo: 'successo', testo: `Pagamento tolto da FiC: ${documenti(e.annullati)}` }
  return { tipo: 'niente', testo: '' }
}

export function avvisoImporti(
  importoScadenza: number,
  collegamenti: { tipo_documento: TipoFatturaFornitore; importo: number }[],
): string | null {
  if (collegamenti.length === 0) return null
  const netto = collegamenti.reduce((s, c) => s + (c.tipo_documento === 'nota_credito' ? -c.importo : c.importo), 0)
  return cent(netto) === cent(importoScadenza)
    ? null
    : 'Gli importi delle fatture collegate non tornano piu\' con la scadenza: apri Fatture per controllare'
}

export function riepilogaCollegamenti(c: { stato_fic: StatoFic; messaggio_fic: string | null }[]): RiepilogoCollegamento {
  const problema = c.find((x) => x.stato_fic === 'da_allineare' || x.stato_fic === 'da_verificare')
  if (problema) return { n: c.length, stato: 'problema', messaggio: problema.messaggio_fic }
  if (c.some((x) => x.stato_fic === 'non_scritto')) return { n: c.length, stato: 'non_scritto', messaggio: null }
  return { n: c.length, stato: 'scritto', messaggio: null }
}
