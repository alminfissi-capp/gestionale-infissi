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
  codice_articolo: string | null
  finitura: string | null
  quantita: number
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
  created_at: string
}

export type RigaOrdineInput = {
  descrizione: string
  codice_articolo: string | null
  finitura: string | null
  quantita: number
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
}

export type AllegatoOrdine = {
  id: string
  organization_id: string
  ordine_id: string
  nome_file: string
  storage_path: string
  content_type: string | null
  created_at: string
}

export type OrdineFornitore = {
  id: string
  organization_id: string
  commessa_id: string | null
  fornitore_id: string | null
  numero_ordine: string
  data_ordine: string
  data_consegna_prevista: string | null
  stato: StatoOrdine
  pdf_path: string | null
  inviato_at: string | null
  tracking_token: string | null
  pdf_inviato_path: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type OrdineInput = {
  commessa_id: string | null
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

/**
 * Ordine con il contesto della commessa quando c'è, altrimenti ordine di
 * magazzino (commessa_id null). Usato nell'elenco ordini del magazzino.
 */
export type OrdineConContesto = OrdineCompleto & {
  numero_commessa: string | null
  cliente_nome: string | null
}

/** Opzione commessa per il selettore nel dialog ordine (dal magazzino). */
export type CommessaOpzione = {
  id: string
  numero_commessa: string
  cliente_nome: string
}

/** Card commessa nel cruscotto. */
export type CommessaProduzione = {
  id: string
  numero_commessa: string
  cliente_nome: string
  stato: StatoCommessa
  data_conferma: string | null
  ordini_aperti: number
  ordini_in_ritardo: number
  documenti: number
}

export type TipoEventoTracking =
  | 'inviato'
  | 'email_aperta'
  | 'pagina_aperta'
  | 'pdf_scaricato'

/** Riga di `tracking_email_ordine`, nella forma che serve al riepilogo. */
export type EventoTracking = {
  tipo: TipoEventoTracking
  avvenuto_at: string
  destinatario: string | null
}

export type StatoInvio = 'non_inviato' | 'inviato' | 'letto'

/** Stato corrente derivato dagli eventi successivi all'ultimo invio. */
export type TrackingOrdine = {
  stato: StatoInvio
  inviatoAt: string | null
  destinatario: string | null
  emailApertaAt: string | null
  paginaApertaAt: string | null
  pdfScaricatoAt: string | null
  /** Aperture pagina + download dopo l'ultimo invio. */
  aperture: number
  /** Quante volte l'ordine è stato inviato in tutto. */
  invii: number
}
