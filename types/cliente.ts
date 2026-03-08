export type Cliente = {
  id: string
  organization_id: string
  tipo: 'privato' | 'azienda'
  ragione_sociale: string | null
  nome: string | null
  cognome: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null  // legacy
  via: string | null
  civico: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  nazione: string | null
  codice_sdi: string | null
  cantiere: string | null
  cf_piva: string | null
  note: string | null
  created_at: string
  updated_at: string
}
