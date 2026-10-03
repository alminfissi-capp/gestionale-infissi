export type TipoFatturaFornitore = 'fattura' | 'nota_credito'
export type StatoRata = 'pagata' | 'da_pagare'
export type StatoPagamento = 'pagata' | 'parziale' | 'da_pagare' | 'scaduta'
export type StatoCollegamentoFic = 'attivo' | 'da_ricollegare'
export type EsitoSync = 'ok' | 'parziale' | 'errore'

export type ConteggiSync = { nuove: number; aggiornate: number; eliminate: number }

export const CONTEGGI_VUOTI: ConteggiSync = { nuove: 0, aggiornate: 0, eliminate: 0 }

/** Azienda raggiungibile col token, da GET /user/companies. */
export type AziendaFic = { id: number; nome: string }

/** Riga di fic_collegamenti come la vede la UI: niente token, niente id del Vault. */
export type CollegamentoFic = {
  fic_company_id: number
  fic_company_nome: string
  token_finale: string
  sincronizza_dal: string
  stato: StatoCollegamentoFic
  sync_in_corso_da: string | null
  ultima_sync_at: string | null
  ultimo_esito: EsitoSync | null
  ultimo_esito_at: string | null
  ultimo_messaggio: string | null
  ultimi_conteggi: ConteggiSync | null
}

export type RataFatturaFornitore = {
  id: string
  fattura_id: string
  fic_id: number | null
  importo: number
  scadenza: string | null
  stato: StatoRata
  pagata_il: string | null
  conto_fic_id: number | null
  conto_nome: string | null
  ordine: number
}

export type FatturaFornitore = {
  id: string
  fic_id: number
  tipo: TipoFatturaFornitore
  numero: string | null
  data: string
  descrizione: string | null
  categoria: string | null
  elettronica: boolean
  fornitore_fic_id: number | null
  fornitore_nome: string
  fornitore_piva: string | null
  importo_netto: number
  importo_iva: number
  ritenuta: number
  altra_ritenuta: number
  importo_lordo: number
  prossima_scadenza: string | null
  ha_allegato: boolean
  sincronizzata_at: string
  rate: RataFatturaFornitore[]
}

export type EsitoSincronizzazione = {
  esito: EsitoSync
  messaggio: string
  conteggi: ConteggiSync
}

export type StatoFic = 'non_scritto' | 'scritto' | 'da_allineare' | 'da_verificare'

/** Documento FiC proponibile nella finestra di collegamento: residuo gia' al netto delle altre scadenze. */
export type DocumentoCollegabile = {
  fic_id: number
  tipo: TipoFatturaFornitore
  numero: string | null
  data: string
  fornitore_nome: string
  /** Con segno: note di credito negative, come in fatture_fornitori. */
  importo_lordo: number
  /** Positivo: quanto si puo' ancora assegnare da questa scadenza. */
  residuo: number
  prima_scadenza: string | null
}

/** Cosa e' successo su FiC dopo un'azione su una scadenza. */
export type EsitoFic = { scritti: number; annullati: number; problemi: string[]; avvisi: string[] }

/** Per l'icona nella riga della scadenza. */
export type RiepilogoCollegamento = {
  n: number
  stato: 'non_scritto' | 'scritto' | 'problema'
  messaggio: string | null
}
