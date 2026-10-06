import type { StatoCommessa } from '@/types/commessa'
import type { Avanzamento } from '@/lib/avanzamento'

export type StatoOrdine = 'da_ordinare' | 'ordinato' | 'arrivato' | 'annullato'

export const STATI_ORDINE: { value: StatoOrdine; label: string }[] = [
  { value: 'da_ordinare', label: 'Da ordinare' },
  { value: 'ordinato',    label: 'Ordinato' },
  { value: 'arrivato',    label: 'Arrivato' },
  { value: 'annullato',   label: 'Annullato' },
]

/**
 * Gli stati di chi e' davvero entrato in produzione: elenco delle card,
 * colonna delle commesse da programmare sul calendario. 'in_attesa' non c'e':
 * e' il limbo di chi ha accettato il preventivo ma non ha ancora versato
 * l'acconto. La commessa parte quando la si porta a 'da_iniziare'.
 */
export const STATI_COMMESSA_PRODUZIONE: StatoCommessa[] = [
  'da_iniziare',
  'in_lavorazione',
  'da_consegnare',
  'parzialmente_consegnato',
]

/** Il limbo: confermata dal cliente, non ancora pagata, quindi non partita. */
export const STATO_COMMESSA_LIMBO: StatoCommessa = 'in_attesa'

/**
 * La produzione ha finito, l'archivio no: merce consegnata o commessa chiusa,
 * ma la commessa e' ancora fra le attive. Sono le candidate all'archiviazione,
 * che e' il gesto che dichiara finito tutto — produzione e conti.
 * 'parzialmente_consegnato' non c'e': quella e' ancora lavoro aperto e sta in
 * STATI_COMMESSA_PRODUZIONE.
 */
export const STATI_COMMESSA_COMPLETATE: StatoCommessa[] = [
  'consegnato',
  'concluso',
]

/** Tipi documento di competenza della Produzione (Commesse mostra gli altri). */
export const TIPI_DOCUMENTO_PRODUZIONE: { value: string; label: string }[] = [
  { value: 'disegno',          label: 'Disegno' },
  { value: 'scheda_tecnica',   label: 'Scheda tecnica' },
  { value: 'ddt',              label: 'DDT' },
  { value: 'conferma_ordine',  label: 'Conferma ordine' },
  { value: 'foto',             label: 'Foto' },
  { value: 'ordine_fornitore', label: 'Ordine fornitore' },
  // Caricato dal fornitore dal link dell'ordine: DDT, fattura di cortesia, altro.
  { value: 'documento_fornitore', label: 'Documento fornitore' },
]

export const TIPI_DOCUMENTO_PRODUZIONE_VALUES = TIPI_DOCUMENTO_PRODUZIONE.map((t) => t.value)

/**
 * PDF d'ordine pronto per l'archivio, in una delle due forme possibili.
 *
 * `path` e' la strada normale: il browser lo ha gia' caricato su Storage e alla
 * Server Action arriva solo il riferimento, perche' i byte non entrerebbero nel
 * corpo di una function. `base64` e' il ripiego per quando l'upload diretto non
 * parte, e vale solo per i file piccoli.
 */
export type PdfCaricato = { path: string } | { base64: string }

/** `separatore` = riga vuota che spezza l'elenco: niente quantita', testo o prezzo. */
export type TipoRigaOrdine = 'articolo' | 'separatore'

export type RigaOrdine = {
  id: string
  ordine_id: string
  organization_id: string
  tipo: TipoRigaOrdine
  descrizione: string
  codice_articolo: string | null
  finitura: string | null
  quantita: number | null
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
  created_at: string
}

export type RigaOrdineInput = {
  tipo: TipoRigaOrdine
  descrizione: string
  codice_articolo: string | null
  finitura: string | null
  /** null finché l'utente non digita la quantità: il campo parte vuoto. */
  quantita: number | null
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
  /** Copia col footer di tracking mostrata tra i documenti di commessa. */
  pdf_documento_path: string | null
  /** Motivo dell'ultimo invio fallito; resta finché un invio non riesce. */
  errore_invio: string | null
  errore_invio_at: string | null
  /** Il fornitore deve caricare una conferma d'ordine, da firmare e rimandare. */
  richiede_conferma: boolean
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
  richiede_conferma: boolean
  note: string | null
  righe: RigaOrdineInput[]
  /**
   * Arrivo previsto in calendario, nel giorno della consegna prevista.
   * undefined = non toccare l'evento; null = toglierlo; valorizzato = crearlo o aggiornarlo.
   */
  calendario?: EventoOrdineInput | null
}

/** Tipo d'attivita' (chiave dell'anagrafica) e orari 'HH:MM' dell'arrivo in calendario. */
export type EventoOrdineInput = { tipo: string; ora_inizio: string; ora_fine: string }

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
  /** Fasi programmate e quante ne sono state completate. */
  avanzamento: Avanzamento
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

export type TipoFileFornitore = 'conferma' | 'documento'

export type StatoConferma = 'da_firmare' | 'firmata' | 'firmata_manuale' | 'sostituita'

/**
 * File arrivato dal fornitore dal link dell'ordine (o caricato a mano).
 * I campi della firma valgono solo per le conferme.
 */
export type FileFornitoreOrdine = {
  id: string
  organization_id: string
  ordine_id: string
  tipo: TipoFileFornitore
  storage_path: string
  nome_file: string
  content_type: string | null
  dimensione: number | null
  caricato_da: 'fornitore' | 'utente'
  created_at: string
  stato: StatoConferma | null
  firmata_path: string | null
  firmata_at: string | null
  note_firma: string | null
  inviata_a: string | null
  inviata_at: string | null
  letta_at: string | null
  aperture: number
}

/** Riga del riquadro "Conferme da firmare" nel cruscotto. */
export type ConfermaDaFirmare = {
  id: string
  ordine_id: string
  commessa_id: string | null
  numero_ordine: string
  fornitore_nome: string | null
  numero_commessa: string | null
  cliente_nome: string | null
  created_at: string
}
