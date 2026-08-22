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
 * Tipi che si creano dall'agenda. 'scadenza' non c'e': nasce dalla spunta su
 * una riga di Commesse ed e' in sola lettura.
 */
export const TIPI_ADMIN: TipoEventoAdmin[] = [
  'appuntamento',
  'impegno_interno',
  'promemoria',
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

/**
 * Un tipo di attivita' come lo vede l'organizzazione: etichetta, colori e la
 * spunta che colora il riquadro del giorno. Vive su `tipi_attivita`, non nel
 * codice, cosi' si personalizza dalle Impostazioni.
 */
export type AmbitoTipo = 'produzione' | 'amministrazione'

export type TipoAttivita = {
  id: string
  organization_id: string
  /** Chiave stabile salvata in `eventi_calendario.tipo`. */
  chiave: string
  etichetta: string
  sfondo: string
  testo: string
  ambito: AmbitoTipo
  evidenzia_giorno: boolean
  /** I tipi di sistema non si eliminano: nascono da altri moduli. */
  sistema: boolean
  ordine: number
}

export type TipoAttivitaInput = {
  chiave?: string
  etichetta: string
  sfondo: string
  testo: string
  ambito: AmbitoTipo
  evidenzia_giorno: boolean
}

/** Mappa chiave -> aspetto, come la ricevono i componenti del calendario. */
export type AspettiTipo = Record<string, AspettoTipo>

/**
 * Aspetto neutro per una chiave che non e' piu' in anagrafica: un tipo
 * eliminato non deve far sparire (ne' far esplodere) gli eventi gia' inseriti.
 */
export const ASPETTO_SCONOSCIUTO: AspettoTipo = {
  label: 'Attività',
  sfondo: '#D4D4D4',
  testo: '#1F1F1F',
}

export function aspettoDi(aspetti: AspettiTipo, tipo: string): AspettoTipo {
  return aspetti[tipo] ?? ASPETTO_SCONOSCIUTO
}

/** Valori di partenza: e' con questi che si popola una organizzazione nuova. */
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

/** Ordine e ambito dei tipi di partenza, per il seed della nuova anagrafica. */
export const TIPI_DEFAULT: {
  chiave: TipoEvento
  ambito: AmbitoTipo
  evidenzia_giorno: boolean
  sistema: boolean
}[] = [
  { chiave: 'ricez_alluminio', ambito: 'produzione',      evidenzia_giorno: false, sistema: false },
  { chiave: 'lavorazione',     ambito: 'produzione',      evidenzia_giorno: false, sistema: false },
  { chiave: 'ricez_vetri',     ambito: 'produzione',      evidenzia_giorno: false, sistema: false },
  { chiave: 'ricez_accessori', ambito: 'produzione',      evidenzia_giorno: false, sistema: false },
  { chiave: 'carico',          ambito: 'produzione',      evidenzia_giorno: false, sistema: false },
  { chiave: 'posa',            ambito: 'produzione',      evidenzia_giorno: true,  sistema: false },
  { chiave: 'appuntamento',    ambito: 'amministrazione', evidenzia_giorno: false, sistema: false },
  { chiave: 'impegno_interno', ambito: 'amministrazione', evidenzia_giorno: false, sistema: false },
  { chiave: 'promemoria',      ambito: 'amministrazione', evidenzia_giorno: false, sistema: false },
  { chiave: 'scadenza',        ambito: 'amministrazione', evidenzia_giorno: false, sistema: true  },
]

/**
 * Avanzamento dell'attivita'. I tasti nel riquadro Attivita' della commessa
 * scrivono qui: un'attivita' parte, si ferma, resta bloccata, si chiude.
 * 'annullato' non nasce dai tasti: e' la sepoltura di un evento che non si
 * deve piu' disegnare.
 */
export type StatoEvento =
  | 'programmato'
  | 'in_corso'
  | 'bloccato'
  | 'completato'
  | 'annullato'

/** Etichetta e colore dello stato, per i badge fuori dal calendario. */
export const STATO_EVENTO_LABEL: Record<StatoEvento, string> = {
  programmato: 'Programmata',
  in_corso:    'In corso',
  bloccato:    'Bloccata',
  completato:  'Completata',
  annullato:   'Annullata',
}

export type EventoCalendario = {
  id: string
  organization_id: string
  /** Chiave di `tipi_attivita`: i tipi non sono piu' una lista chiusa. */
  tipo: string
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
  /** Valorizzato solo mentre il cronometro corre. */
  avviato_at: string | null
  /** Tempo gia' accumulato nelle sessioni chiuse, in secondi. */
  secondi_lavorati: number
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

/**
 * Campi che l'interfaccia compila creando o modificando un evento.
 * Non contiene `scadenza_id` di proposito: un evento di tipo 'scadenza' e' lo
 * specchio di una riga di `scadenze` e nasce spuntando la casella in Commesse,
 * non da questo form.
 */
export type EventoInput = {
  tipo: string
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

/**
 * Giorno o periodo di chiusura. Se `ricorrente` e' vero contano soltanto
 * giorno e mese: l'anno memorizzato e' il 2000 (bisestile, cosi' il 29
 * febbraio e' rappresentabile) e la chiusura torna ogni anno.
 */
export type Chiusura = {
  id: string
  organization_id: string
  data_inizio: string
  data_fine: string
  descrizione: string
  ricorrente: boolean
  created_at: string
}

export type ChiusuraInput = {
  data_inizio: string
  data_fine: string
  descrizione: string
  ricorrente: boolean
}

/** Anno segnaposto delle chiusure ricorrenti: bisestile, per il 29 febbraio. */
export const ANNO_RICORRENTE = '2000'

export const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
] as const

/**
 * Festivita' italiane a data fissa, per compilare le chiusure in un colpo solo.
 * Pasqua e Pasquetta si spostano ogni anno: vanno aggiunte a mano, anno per
 * anno, come chiusure non ricorrenti.
 */
export const FESTIVITA_ITALIANE: { giornoMese: string; descrizione: string }[] = [
  { giornoMese: '01-01', descrizione: 'Capodanno' },
  { giornoMese: '01-06', descrizione: 'Epifania' },
  { giornoMese: '04-25', descrizione: 'Liberazione' },
  { giornoMese: '05-01', descrizione: 'Festa del lavoro' },
  { giornoMese: '06-02', descrizione: 'Festa della Repubblica' },
  { giornoMese: '08-15', descrizione: 'Ferragosto' },
  { giornoMese: '11-01', descrizione: 'Ognissanti' },
  { giornoMese: '12-08', descrizione: 'Immacolata' },
  { giornoMese: '12-25', descrizione: 'Natale' },
  { giornoMese: '12-26', descrizione: 'Santo Stefano' },
]

export type CategoriaFornitore = 'alluminio' | 'vetri' | 'accessori'

/** Tipo di ricezione generato da un ordine, per categoria del fornitore. */
export const RICEZIONE_PER_CATEGORIA: Record<CategoriaFornitore, TipoEventoProduzione> = {
  alluminio: 'ricez_alluminio',
  vetri:     'ricez_vetri',
  accessori: 'ricez_accessori',
}
