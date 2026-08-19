// types/calendario.ts

/** Tipi che nascono nel calendario della Produzione. */
export type TipoEventoProduzione =
  | 'ricez_alluminio'
  | 'lavorazione'
  | 'ricez_vetri'
  | 'ricez_accessori'
  | 'carico'
  | 'posa'

/** Tipi che nascono nel calendario dell'Amministrazione. */
export type TipoEventoAdmin =
  | 'appuntamento'
  | 'impegno_interno'
  | 'promemoria'
  | 'scadenza'

export type TipoEvento = TipoEventoProduzione | TipoEventoAdmin

export const TIPI_PRODUZIONE: TipoEventoProduzione[] = [
  'ricez_alluminio',
  'lavorazione',
  'ricez_vetri',
  'ricez_accessori',
  'carico',
  'posa',
]

/**
 * Aspetto della barra. Il colore deriva dal tipo e non e' scelto a mano:
 * la legenda appesa in officina deve restare vera.
 */
export type AspettoTipo = {
  label: string
  /** Colore di sfondo della barra, in esadecimale. */
  sfondo: string
  /** Colore del testo sopra lo sfondo. */
  testo: string
}

export const ASPETTO_TIPO: Record<TipoEvento, AspettoTipo> = {
  ricez_alluminio: { label: 'Ricez. Alluminio',      sfondo: '#6699CC', testo: '#0B1B2B' },
  lavorazione:     { label: 'Lavorazione',           sfondo: '#FF8C00', testo: '#2B1400' },
  ricez_vetri:     { label: 'Ricez. Vetri',          sfondo: '#00E5EE', testo: '#00252A' },
  ricez_accessori: { label: 'Ricez. Accessori',      sfondo: '#C8C8C8', testo: '#1F1F1F' },
  carico:          { label: 'Carico/Imballo/Trasp.', sfondo: '#FFFF00', testo: '#2B2B00' },
  posa:            { label: 'Posa/Consegna',         sfondo: '#A6D64B', testo: '#152300' },
  appuntamento:    { label: 'Appuntamento',          sfondo: '#7C6BF5', testo: '#FFFFFF' },
  impegno_interno: { label: 'Impegno interno',       sfondo: '#8A8A8A', testo: '#FFFFFF' },
  promemoria:      { label: 'Promemoria',            sfondo: '#E8B4B8', testo: '#2B0F12' },
  scadenza:        { label: 'Scadenza',              sfondo: '#D64545', testo: '#FFFFFF' },
}

export type StatoEvento = 'programmato' | 'completato' | 'annullato'

export type EventoCalendario = {
  id: string
  organization_id: string
  tipo: TipoEvento
  titolo: string | null
  /** 'YYYY-MM-DD' */
  data: string
  /** 'HH:MM' o 'HH:MM:SS' come arriva da Postgres */
  ora_inizio: string
  ora_fine: string
  tutto_il_giorno: boolean
  commessa_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  fornitore_id: string | null
  ordine_id: string | null
  scadenza_id: string | null
  catena_id: string | null
  confermato_cliente: boolean
  note: string | null
  visibile_produzione: boolean
  visibile_amministrazione: boolean
  stato: StatoEvento
  avvisato_email_at: string | null
  avvisato_whatsapp_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Evento arricchito con i nomi che servono all'etichetta della barra. */
export type EventoConContesto = EventoCalendario & {
  numero_commessa: string | null
  fornitore_nome: string | null
}

export type EventoInput = {
  tipo: TipoEvento
  titolo: string | null
  data: string
  ora_inizio: string
  ora_fine: string
  tutto_il_giorno: boolean
  commessa_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  fornitore_id: string | null
  ordine_id: string | null
  catena_id: string | null
  confermato_cliente: boolean
  note: string | null
  visibile_produzione: boolean
  visibile_amministrazione: boolean
}

/** Orario di un giorno della settimana. */
export type OrarioGiorno = {
  aperto: boolean
  /** 'HH:MM' */
  apertura: string
  chiusura: string
}

/** Sette elementi, indice 0 = lunedi'. */
export type OrariLavoro = OrarioGiorno[]

export const ORARI_LAVORO_DEFAULT: OrariLavoro = [
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '12:30' },
  { aperto: false, apertura: '08:00', chiusura: '19:00' },
]

export const GIORNI_SETTIMANA = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
] as const

export type Chiusura = {
  id: string
  organization_id: string
  data_inizio: string
  data_fine: string
  descrizione: string
  created_at: string
}

export type ChiusuraInput = {
  data_inizio: string
  data_fine: string
  descrizione: string
}

export type CategoriaFornitore = 'alluminio' | 'vetri' | 'accessori'

/** Tipo di ricezione generato da un ordine, per categoria del fornitore. */
export const RICEZIONE_PER_CATEGORIA: Record<CategoriaFornitore, TipoEventoProduzione> = {
  alluminio: 'ricez_alluminio',
  vetri:     'ricez_vetri',
  accessori: 'ricez_accessori',
}

/** Riga della coda "da pianificare": commessa senza attivita' o ordine senza ricezione. */
export type VoceDaPianificare =
  | {
      genere: 'commessa'
      id: string
      numero_commessa: string
      cliente_nome: string
      /** Quali fra lavorazione, posa e carico non sono ancora stati collocati. */
      tipi_mancanti: TipoEventoProduzione[]
    }
  | {
      genere: 'ordine'
      id: string
      numero_ordine: string
      fornitore_id: string | null
      fornitore_nome: string | null
      data_consegna_prevista: string
      /** Deriva da fornitori.categoria_calendario; 'ricez_accessori' se non impostata. */
      tipo_ricezione: TipoEventoProduzione
      categoria_mancante: boolean
    }
