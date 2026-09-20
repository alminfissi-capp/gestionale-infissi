export type Settings = {
  id: string
  organization_id: string
  denominazione: string | null
  indirizzo: string | null
  piva: string | null
  codice_fiscale: string | null
  telefono: string | null
  email: string | null
  sito_web: string | null
  banca: string | null
  iban: string | null
  logo_url: string | null
  aliquote_iva: number[]
  // Validità preventivi
  giorni_validita_preventivo: number
  // Numerazione automatica preventivi
  num_prefisso: string | null
  num_prefisso_calcoli: string | null
  num_operatore: string | null
  num_contatore: number
  num_anno: number
  num_padding: number
  firma_default: string | null
  /** Sette elementi, indice 0 = lunedì. Vedi types/calendario.ts */
  orari_lavoro: unknown
  created_at: string
  updated_at: string
}

export type NoteTemplate = {
  id: string
  organization_id: string
  testo: string
  ordine: number
  created_at: string
}

/**
 * Un'immagine caricata una volta e ripescabile da tutte le voci libere.
 * Si salva il path nel bucket pubblico `preventivi-allegati`, non l'URL: l'URL
 * si ricava dal path e tenerli tutti e due vorrebbe dire tenerli d'accordo.
 */
export type IconaPreventivo = {
  id: string
  organization_id: string
  nome: string
  storage_path: string
  ordine: number
  created_at: string
}
