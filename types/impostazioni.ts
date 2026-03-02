export type Settings = {
  id: string
  organization_id: string
  denominazione: string | null
  indirizzo: string | null
  piva: string | null
  codice_fiscale: string | null
  telefono: string | null
  email: string | null
  logo_url: string | null
  aliquote_iva: number[]
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
