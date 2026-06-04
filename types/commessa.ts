export type GruppoCommesse = {
  id: string
  organization_id: string
  nome: string
  ordine: number
  created_at: string
}

export type MetodoPagamento = 'contanti' | 'bonifico' | 'riba' | 'altro'
export type Reparto = 'alluminio' | 'ferro' | 'servizi' | 'rivendita' | 'ebay'
export const REPARTI: { value: Reparto; label: string }[] = [
  { value: 'alluminio', label: 'Alluminio' },
  { value: 'ferro',     label: 'Ferro' },
  { value: 'servizi',   label: 'Servizi' },
  { value: 'rivendita', label: 'Rivendita' },
  { value: 'ebay',      label: 'Ebay' },
]
export type StatoCommessa =
  | 'in_attesa'
  | 'da_iniziare'
  | 'in_lavorazione'
  | 'da_consegnare'
  | 'consegnato'
  | 'parzialmente_consegnato'
  | 'concluso'
  | 'bloccato'
  | 'annullato'

export type Commessa = {
  id: string
  organization_id: string
  numero_commessa: string
  preventivo_id: string | null
  numero_preventivo: string | null
  cliente_nome: string
  imponibile: number
  iva_totale: number
  totale: number
  data_conferma: string
  operatore_id: string | null
  operatore_nome: string | null
  note: string | null
  stato: StatoCommessa
  reparti: Reparto[]
  gruppo_id: string | null
  created_at: string
  updated_at: string
}

export type AccontoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  importo: number
  data_pagamento: string
  metodo_pagamento: MetodoPagamento
  note: string | null
  firma_immagine: string | null
  created_at: string
}

export type DocumentoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  nome_file: string
  storage_path: string
  tipo_documento: string
  created_at: string
}

export type PreventivoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  preventivo_id: string | null
  numero_preventivo: string | null
  nome_file: string | null
  storage_path: string | null
  ordine: number
  created_at: string
}

export type CommessaCompleta = Commessa & {
  acconti: AccontoCommessa[]
  documenti: DocumentoCommessa[]
  preventivi_collegati: PreventivoCommessa[]
  totale_acconti: number
  saldo: number
}

export type CommessaInput = {
  numero_commessa: string
  preventivo_id: string | null
  numero_preventivo: string | null
  cliente_nome: string
  imponibile: number
  iva_totale: number
  totale: number
  data_conferma: string
  operatore_id: string | null
  operatore_nome: string | null
  note: string | null
  reparti: Reparto[]
  gruppo_id?: string
}

export type AccontoInput = {
  importo: number
  data_pagamento: string
  metodo_pagamento: MetodoPagamento
  note: string | null
}

export type PreventivoPerCommessa = {
  id: string
  numero: string | null
  cliente_nome: string
  imponibile: number
  iva_totale: number
  totale: number
}

export type UtentePerCommessa = {
  id: string
  nome: string
}
