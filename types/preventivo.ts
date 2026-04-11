export type StatoPreventivo = 'bozza' | 'inviato' | 'accettato' | 'rifiutato' | 'scaduto'

export type ClienteSnapshot = {
  tipo?: 'privato' | 'azienda'
  ragione_sociale?: string | null
  nome: string | null
  cognome: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null  // legacy
  via?: string | null
  civico?: string | null
  cap?: string | null
  citta?: string | null
  provincia?: string | null
  nazione?: string | null
  codice_sdi?: string | null
  cantiere: string | null
  cf_piva: string | null
}

export type AccessorioSelezionato = {
  id: string
  nome: string
  prezzo: number
  prezzo_acquisto: number
  qty: number
}

export type AccessorioGrigliaSelezionato = {
  id: string
  nome: string
  gruppo: string
  tipo_prezzo: 'pezzo' | 'mq' | 'percentuale'
  prezzo: number
  prezzo_acquisto: number
  mq_minimo: number | null
}

export type AccessorioSuMisuraSelezionato = {
  accessorio_id: string
  gruppo_id: string
  nome: string
  unita: 'pz' | 'mq' | 'ml'
  qty: number
  prezzo_unitario: number
  totale: number
}

export type ConfigSuMisuraArticolo = {
  listino_id: string
  nome_prodotto: string
  larghezza: number
  altezza: number
  mq: number
  finitura_id: string | null
  nome_finitura: string | null
  tipo_maggiorazione_finitura: 'percentuale' | 'mq' | 'fisso' | null
  prezzo_mq_base: number
  prezzo_mq_finale: number
  totale_prodotto: number
  accessori: AccessorioSuMisuraSelezionato[]
  totale_accessori: number
  mano_dopera: number
  utile_percentuale: number | null
  utile_fisso: number | null
  utile_calcolato: number
}

export type ArticoloPreventivoRow = {
  id: string
  preventivo_id: string
  organization_id: string
  tipo: 'listino' | 'libera' | 'listino_libero' | 'scorrevole' | 'su_misura'
  listino_id: string | null
  listino_libero_id: string | null
  prodotto_id: string | null
  accessori_selezionati: AccessorioSelezionato[] | null
  accessori_griglia: AccessorioGrigliaSelezionato[] | null
  tipologia: string
  categoria_nome: string | null
  larghezza_mm: number | null
  altezza_mm: number | null
  larghezza_listino_mm: number | null
  altezza_listino_mm: number | null
  misura_arrotondata: boolean
  finitura_nome: string | null
  finitura_aumento: number
  finitura_aumento_euro: number
  note: string | null
  immagine_url: string | null
  quantita: number
  prezzo_base: number | null
  prezzo_unitario: number
  sconto_articolo: number
  prezzo_totale_riga: number
  costo_acquisto_unitario: number
  costo_posa: number
  aliquota_iva: number | null
  ordine: number
  created_at: string
  /** Quota di spese trasporto attribuita a questo articolo (calcolata al volo, non in DB) */
  quota_trasporto?: number
  /** Configurazione completa per articoli tipo 'scorrevole' */
  config_scorrevole?: import('@/types/scorrevoli').ConfigScorrevoleArticolo | null
  /** Configurazione completa per articoli tipo 'su_misura' */
  config_su_misura?: ConfigSuMisuraArticolo | null
}

// Articolo durante la compilazione del wizard (non ancora salvato)
export type ArticoloWizard = Omit<
  ArticoloPreventivoRow,
  'id' | 'preventivo_id' | 'organization_id' | 'created_at'
> & { tempId: string }

export type Preventivo = {
  id: string
  organization_id: string
  cliente_id: string | null
  numero: string | null
  cliente_snapshot: ClienteSnapshot
  sconto_globale: number
  note: string | null
  subtotale: number
  importo_sconto: number
  totale_articoli: number
  spese_trasporto: number
  modalita_trasporto: 'separato' | 'ripartito'
  totale_costi_acquisto: number
  iva_totale: number
  riepilogo_iva: { aliquota: number; imponibile: number; iva: number }[]
  totale_finale: number
  totale_pezzi: number
  stato: StatoPreventivo
  mostra_sconto_riga: boolean
  share_token: string | null
  condiviso_at: string | null
  visualizzato_at: string | null
  email_aperta_at: string | null
  cataloghi_allegati: string[]
  created_at: string
  updated_at: string
}

export type PreventivoCompleto = Preventivo & {
  articoli: ArticoloPreventivoRow[]
  cataloghi_allegati_data: { id: string; nome: string; url: string }[]
  allegati_calcoli_data: { id: string; nome: string; storage_path: string; url: string }[]
}

// Payload inviato al Server Action
export type PreventivoInput = {
  clienteId: string | null
  clienteSnapshot: ClienteSnapshot
  numero: string
  articoli: Omit<ArticoloWizard, 'tempId'>[]
  scontoGlobale: number
  mostraSconto: boolean
  note: string
}
