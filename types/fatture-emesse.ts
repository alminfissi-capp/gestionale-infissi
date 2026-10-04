import type { ConteggiSync, EsitoSync, StatoFic, StatoRata } from '@/types/fatture-fornitori'

export type TipoFatturaEmessa = 'fattura' | 'nota_credito'
export type StatoIncasso = 'incassata' | 'parziale' | 'da_incassare' | 'scaduta'

export type RataFatturaEmessa = {
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

/**
 * Copia locale di una fattura emessa su FiC. `importo_lordo` e' il totale da
 * incassare come lo intende FiC, gia' al netto della ritenuta (200 + 44 IVA − 8 = 236).
 */
export type FatturaEmessa = {
  id: string
  fic_id: number
  tipo: TipoFatturaEmessa
  numero: string | null
  data: string
  cliente_fic_id: number | null
  cliente_nome: string
  cliente_piva: string | null
  importo_netto: number
  importo_iva: number
  ritenuta: number
  importo_lordo: number
  prossima_scadenza: string | null
  elettronica: boolean
  sincronizzata_at: string
  rate: RataFatturaEmessa[]
}

/** Stato della sincronizzazione delle emesse, dalle colonne emesse_* di fic_collegamenti. */
export type SyncEmesse = {
  sincronizza_dal: string
  sync_in_corso_da: string | null
  ultima_sync_at: string | null
  ultimo_esito: EsitoSync | null
  ultimo_esito_at: string | null
  ultimo_messaggio: string | null
  ultimi_conteggi: ConteggiSync | null
}

export type MetodoIncasso = 'bonifico' | 'contanti' | 'riba' | 'altro'
/** Metodo WinStudio → conto di pagamento FiC (null = non abbinato: non si scrive). */
export type MetodiIncassoFic = Record<MetodoIncasso, number | null>

/** Fattura collegata a una commessa, come la vede la finestra "Fatture emesse". */
export type CollegamentoCommessaFattura = {
  fic_documento_id: number
  tipo_documento: TipoFatturaEmessa
  quota: number
}

/** Fattura proponibile nella finestra di collegamento a una commessa. */
export type FatturaCollegabile = {
  fic_id: number
  tipo: TipoFatturaEmessa
  numero: string | null
  data: string
  cliente_nome: string
  /** Con segno: note di credito negative. */
  importo_lordo: number
  ritenuta: number
  /** Positivo: rate non incassate su FiC. */
  da_incassare: number
  /** Quote su altre commesse (con segno), per mostrare "4.000 € su 08-2026". */
  altre: { commessa_id: string; commessa_nome: string; quota: number }[]
}

export type DatiFattureCommessa = {
  commessa: { id: string; nome: string; cliente: string; totale: number; data_conferma: string | null }
  collegamenti: CollegamentoCommessaFattura[]
  fatture: FatturaCollegabile[]
  periodo: { dal: string; al: string }
  /** Incassi della commessa senza fatture collegate: se >0 dopo il salvataggio si propone lo storico. */
  incassi_scollegati: number
}

/** Una quota di incasso su una fattura, come la vede la finestra dell'incasso. */
export type QuotaIncasso = {
  fic_documento_id: number
  tipo_documento: TipoFatturaEmessa
  importo: number
  stato_fic?: StatoFic
  messaggio_fic?: string | null
}

/** Fattura della commessa nella sezione "Fatture pagate da questo incasso". */
export type FatturaPerIncasso = {
  fic_id: number
  tipo: TipoFatturaEmessa
  numero: string | null
  data: string
  importo_lordo: number
  ritenuta: number
  /** Rate non incassate su FiC, piu' quanto questo stesso incasso vi ha gia' scritto (si puo' riscrivere). */
  disponibile: number
  /** Quota della commessa non ancora coperta da altri incassi. */
  quota_libera: number
}

export type DatiIncassoFatture = {
  fatture: FatturaPerIncasso[]
  quote: QuotaIncasso[]
  metodi: MetodiIncassoFic
}
