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

export type ArticoloPreventivoRow = {
  id: string
  preventivo_id: string
  organization_id: string
  listino_id: string | null
  tipologia: string
  categoria_nome: string | null
  larghezza_mm: number
  altezza_mm: number
  larghezza_listino_mm: number
  altezza_listino_mm: number
  misura_arrotondata: boolean
  finitura_nome: string | null
  finitura_aumento: number
  quantita: number
  prezzo_base: number
  prezzo_unitario: number
  sconto_articolo: number
  prezzo_totale_riga: number
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
}
