// 'da_programmare' e' un blocco di sistema, uno solo per organizzazione: raccoglie
// le scadenze ancora senza data di pagamento
export type TipoBlocco = 'commesse' | 'scadenze' | 'da_programmare'

export type GruppoCommesse = {
  id: string
  organization_id: string
  nome: string
  ordine: number
  tipo: TipoBlocco
  created_at: string
}

// Conto corrente (anagrafica): banca dove vengono addebitate le scadenze
export type ContoCorrente = {
  id: string
  organization_id: string
  nome: string
  saldo_attuale: number
  ordine: number
  created_at: string
  updated_at: string
}

export type ContoCorrenteInput = {
  nome: string
  saldo_attuale: number
}

// 'tassa' aggiunta il 2026-08-17: le imposte e i contributi sono un costo che va
// visto a parte, non annegato in 'altro'. La colonna DB è text senza vincolo, quindi
// non serve migrazione; le etichette stanno in Record<CategoriaScadenza, …> così il
// compilatore segnala ogni punto da completare quando la lista cresce.
export type CategoriaScadenza = 'finanziamento' | 'assegno' | 'utenza' | 'tassa' | 'altro'

// Scadenza fornitore / rateizzazione (blocco anno, raggruppata per mese da data_scadenza)
export type Scadenza = {
  id: string
  organization_id: string
  gruppo_id: string
  // Senza data = scadenza da programmare: vive nel blocco di sistema e non
  // appartiene a nessun mese finche' non viene pagata
  data_scadenza: string | null
  descrizione: string
  fornitore: string
  importo: number
  pagato: boolean
  categoria: CategoriaScadenza
  numero_rata: number | null
  totale_rate: number | null
  conto_id: string | null
  foto_path: string | null
  // Immagine della prima pagina, solo per gli allegati PDF: serve ad anteprima
  // e stampa, che sanno mostrare solo immagini
  anteprima_path: string | null
  in_calcoli: boolean
  // Annullata: la riga conserva tutti i dati (allegato compreso) ma esce da
  // ogni totale e dallo slot Calcoli. Serve quando una scadenza non viene
  // pagata perche' sostituita da un'altra.
  annullata: boolean
  ordine: number
  created_at: string
  updated_at: string
}

export type ScadenzaInput = {
  gruppo_id: string
  data_scadenza: string | null
  descrizione: string
  fornitore: string
  importo: number
  pagato: boolean
  categoria: CategoriaScadenza
  numero_rata: number | null
  totale_rate: number | null
  conto_id: string | null
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
  in_calcoli: boolean
  incasso_previsto: number | null
  costo_materiali_manuale: number | null
  costo_manodopera_manuale: number | null
  utile_manuale: number | null
  cantiere_lat: number | null
  cantiere_lng: number | null
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
  costo_materiali_manuale?: number | null
  costo_manodopera_manuale?: number | null
  utile_manuale?: number | null
  cantiere_lat?: number | null
  cantiere_lng?: number | null
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

// Riga libera dei Calcoli: giacenze banca / contanti / liquidità corrente
export type RigaCalcolo = {
  id: string
  organization_id: string
  descrizione: string
  importo: number
  ordine: number
  created_at: string
  updated_at: string
}

// Incasso in attesa: entrata che non nasce da una commessa (rimborsi, note di
// credito, prestiti). Inseribile solo dalla pagina Calcoli.
export type IncassoAttesa = {
  id: string
  organization_id: string
  nome: string
  descrizione: string
  importo: number
  incassato: boolean
  ordine: number
  created_at: string
  updated_at: string
}
