export type Mensilita = 'mensile' | 'tredicesima' | 'quattordicesima' | 'altro'
export type MetodoPagamentoDipendente = 'bonifico' | 'contanti' | 'altro'

export interface Dipendente {
  id: string
  organization_id: string
  nome: string
  cognome: string
  codice_fiscale: string | null
  iban: string | null
  attivo: boolean
  note: string | null
  created_at: string
}

export interface DipendenteInput {
  nome: string
  cognome: string
  codice_fiscale: string | null
  iban: string | null
  attivo: boolean
  note: string | null
}

export interface BustaPaga {
  id: string
  organization_id: string
  dipendente_id: string
  periodo: string // 'YYYY-MM-01'
  mensilita: Mensilita
  netto: number
  lordo: number | null
  file_path: string | null
  pagina: number | null
  dati_estratti: Record<string, unknown> | null
  created_at: string
}

export interface BustaPagaInput {
  dipendente_id: string
  periodo: string // 'YYYY-MM-01'
  mensilita: Mensilita
  netto: number
  lordo: number | null
  pagina: number | null
  dati_estratti?: Record<string, unknown> | null
}

export interface PagamentoDipendente {
  id: string
  organization_id: string
  dipendente_id: string
  data_pagamento: string // 'YYYY-MM-DD'
  importo: number
  metodo: MetodoPagamentoDipendente
  periodo_competenza: string // 'YYYY-MM-01'
  mensilita: Mensilita
  file_path: string | null
  dati_estratti: Record<string, unknown> | null
  note: string | null
  created_at: string
}

export interface PagamentoInput {
  dipendente_id: string
  data_pagamento: string
  importo: number
  metodo: MetodoPagamentoDipendente
  periodo_competenza: string // 'YYYY-MM-01'
  mensilita: Mensilita
  note: string | null
  dati_estratti?: Record<string, unknown> | null
}

export interface DipendenteCompleto {
  dipendente: Dipendente
  buste: BustaPaga[]
  pagamenti: PagamentoDipendente[]
}

/** Risultato lettura automatica di una busta paga (lib/parseBustaPaga.ts) */
export interface BustaEstratta {
  nome: string
  cognome: string
  codice_fiscale: string | null
  periodo: string // 'YYYY-MM'
  mensilita: Mensilita
  netto: number
  lordo: number | null
  pagina: number
}

/** Risultato lettura automatica di una contabile bonifico (lib/parseBonifico.ts) */
export interface BonificoEstratto {
  beneficiario: string | null
  iban_beneficiario: string | null
  data_pagamento: string | null // 'YYYY-MM-DD'
  importo: number | null
  causale: string | null
  periodo_competenza: string | null // 'YYYY-MM'
  mensilita: Mensilita
}
