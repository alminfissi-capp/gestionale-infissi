import type { StatoCommessa } from '@/types/commessa'

export type StatoOrdine = 'da_ordinare' | 'ordinato' | 'arrivato' | 'annullato'

export const STATI_ORDINE: { value: StatoOrdine; label: string }[] = [
  { value: 'da_ordinare', label: 'Da ordinare' },
  { value: 'ordinato',    label: 'Ordinato' },
  { value: 'arrivato',    label: 'Arrivato' },
  { value: 'annullato',   label: 'Annullato' },
]

/** Stati commessa considerati "aperti" in Produzione: default del cruscotto. */
export const STATI_COMMESSA_APERTI: StatoCommessa[] = [
  'in_attesa',
  'da_iniziare',
  'in_lavorazione',
  'da_consegnare',
  'parzialmente_consegnato',
]

/** Tipi documento di competenza della Produzione (Commesse mostra gli altri). */
export const TIPI_DOCUMENTO_PRODUZIONE: { value: string; label: string }[] = [
  { value: 'disegno',          label: 'Disegno' },
  { value: 'scheda_tecnica',   label: 'Scheda tecnica' },
  { value: 'ddt',              label: 'DDT' },
  { value: 'conferma_ordine',  label: 'Conferma ordine' },
  { value: 'foto',             label: 'Foto' },
  { value: 'ordine_fornitore', label: 'Ordine fornitore' },
]

export const TIPI_DOCUMENTO_PRODUZIONE_VALUES = TIPI_DOCUMENTO_PRODUZIONE.map((t) => t.value)

export type RigaOrdine = {
  id: string
  ordine_id: string
  organization_id: string
  descrizione: string
  quantita: number
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
  created_at: string
}

export type RigaOrdineInput = {
  descrizione: string
  quantita: number
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
}

export type OrdineFornitore = {
  id: string
  organization_id: string
  commessa_id: string
  fornitore_id: string | null
  numero_ordine: string
  data_ordine: string
  data_consegna_prevista: string | null
  stato: StatoOrdine
  pdf_path: string | null
  inviato_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type OrdineInput = {
  commessa_id: string
  fornitore_id: string | null
  numero_ordine: string
  data_ordine: string
  data_consegna_prevista: string | null
  stato: StatoOrdine
  note: string | null
  righe: RigaOrdineInput[]
}

export type OrdineCompleto = OrdineFornitore & {
  righe: RigaOrdine[]
  fornitore_nome: string | null
  totale: number
  in_ritardo: boolean
}

/** Riga del cruscotto: ordine con il contesto della commessa. */
export type OrdineConCommessa = OrdineCompleto & {
  numero_commessa: string
  cliente_nome: string
}

/** Card commessa nel cruscotto. */
export type CommessaProduzione = {
  id: string
  numero_commessa: string
  cliente_nome: string
  stato: StatoCommessa
  ordini_aperti: number
  ordini_in_ritardo: number
  documenti: number
}
