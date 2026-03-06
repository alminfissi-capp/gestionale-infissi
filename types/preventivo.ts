export type StatoPreventivo = 'bozza' | 'inviato' | 'accettato' | 'rifiutato' | 'scaduto'

export type ClienteSnapshot = {
  nome: string | null
  cognome: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null
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

export type ArticoloPreventivoRow = {
  id: string
  preventivo_id: string
  organization_id: string
  tipo: 'listino' | 'libera' | 'listino_libero'
  listino_id: string | null
  listino_libero_id: string | null
  prodotto_id: string | null
  accessori_selezionati: AccessorioSelezionato[] | null
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
  created_at: string
  updated_at: string
}

export type PreventivoCompleto = Preventivo & {
  articoli: ArticoloPreventivoRow[]
}

// Payload inviato al Server Action
export type PreventivoInput = {
  clienteId: string | null
  clienteSnapshot: ClienteSnapshot
  numero: string
  articoli: Omit<ArticoloWizard, 'tempId'>[]
  scontoGlobale: number
  note: string
  modalitaTrasporto: 'separato' | 'ripartito'
}
