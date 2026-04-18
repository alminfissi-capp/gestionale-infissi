// ============================================================
// Tipi TypeScript per il modulo WinConfig
// ============================================================

export type Materiale = 'alluminio' | 'pvc' | 'legno_alluminio'
export type TipoProfilo = 'telaio' | 'anta' | 'traversa' | 'montante' | 'fermavetro' | 'coprifilo' | 'altro'
export type UnitaAccessorio = 'pz' | 'ml' | 'coppia'
export type TipoRiempimento = 'vetro' | 'pannello' | 'persiana' | 'altro'
export type TipoSovrapprezzo = 'percentuale' | 'mq' | 'fisso'
export type FormaSerramento = 'rettangolare' | 'fuori_squadro'
export type LatoInclinazione = 'testa' | 'base'
export type TipoApertura = 'battente' | 'vasistas' | 'fisso' | 'scorrevole' | 'anta_ribalta'
export type VersoApertura = 'sx' | 'dx' | 'bilico'

// ---- Tabelle DB ----

export type WcSerie = {
  id: string
  organization_id: string
  nome: string
  materiale: Materiale
  descrizione: string | null
  sfrido_nodo_mm: number
  sfrido_angolo_mm: number
  lunghezza_barra_mm: number
  attiva: boolean
  ordine: number
  created_at: string
  updated_at: string
}

export type WcProfilo = {
  id: string
  serie_id: string
  organization_id: string
  codice: string
  nome: string
  tipo: TipoProfilo
  peso_ml: number
  prezzo_ml: number
  prezzo_acquisto_ml: number
  ordine: number
  created_at: string
}

export type RegolaQty = {
  larghezza_max: number
  altezza_max: number
  qty: number
}

export type WcAccessorio = {
  id: string
  serie_id: string
  organization_id: string
  nome: string
  codice: string
  unita: UnitaAccessorio
  prezzo: number
  prezzo_acquisto: number
  regole_qty: RegolaQty[]
  qty_fissa: number | null
  ordine: number
  created_at: string
}

export type WcRiempimento = {
  id: string
  organization_id: string
  serie_id: string | null
  nome: string
  tipo: TipoRiempimento
  spessore_mm: number | null
  prezzo_mq: number
  prezzo_acquisto_mq: number
  mq_minimo: number
  ordine: number
  created_at: string
}

export type WcColore = {
  id: string
  serie_id: string
  organization_id: string
  nome: string
  codice_ral: string | null
  tipo_sovrapprezzo: TipoSovrapprezzo
  valore_sovrapprezzo: number
  bicolore_disponibile: boolean
  ordine: number
  created_at: string
}

// Serie con tutti i dati annidati
export type WcSerieCompleta = WcSerie & {
  profili: WcProfilo[]
  accessori: WcAccessorio[]
  riempimenti: WcRiempimento[]
  colori: WcColore[]
}

// ---- Configurazione serramento (salvata in config_winconfig JSONB) ----

export type ConfigWinConfig = {
  serie_id: string
  serie_nome: string
  materiale: Materiale
  sfrido_nodo_mm: number
  sfrido_angolo_mm: number

  // Geometria
  forma: FormaSerramento
  lato_inclinazione: LatoInclinazione | null   // null se rettangolare
  larghezza_mm: number
  altezza_sx_mm: number   // = altezza_mm se rettangolare
  altezza_dx_mm: number   // = altezza_mm se rettangolare

  // Apertura
  tipo_apertura: TipoApertura
  verso_apertura: VersoApertura | null
  n_ante: number

  // Colore
  colore_id: string | null
  colore_nome: string | null
  bicolore: boolean
  colore_esterno_id: string | null
  colore_esterno_nome: string | null

  // Riempimento
  riempimento_id: string | null
  riempimento_nome: string | null

  // Distinta calcolata (snapshot al momento del salvataggio)
  distinta: DistintaWinConfig

  // Prezzi parziali
  prezzo_profili: number
  prezzo_accessori: number
  prezzo_riempimenti: number
  prezzo_colore: number
  prezzo_totale: number
  costo_profili: number
  costo_accessori: number
  costo_riempimenti: number
  costo_totale: number
}

// ---- Distinta materiali ----

export type RigaDistintaProfilo = {
  profilo_id: string
  codice: string
  nome: string
  tipo: TipoProfilo
  lunghezza_mm: number       // lunghezza netta del pezzo (escluso sfrido)
  sfrido_mm: number          // sfrido applicato
  lunghezza_totale_mm: number // lunghezza_mm + sfrido_mm
  n_pezzi: number
  ml_totali: number          // (lunghezza_totale_mm / 1000) * n_pezzi
  prezzo_ml: number
  prezzo_totale: number
  costo_ml: number
  costo_totale: number
  note: string               // es. "Montante SX", "Traversa testa inclinata"
}

export type RigaDistintaAccessorio = {
  accessorio_id: string
  codice: string
  nome: string
  unita: UnitaAccessorio
  qty: number
  prezzo: number
  prezzo_totale: number
  costo: number
  costo_totale: number
}

export type RigaDistintaRiempimento = {
  riempimento_id: string
  nome: string
  tipo: TipoRiempimento
  area_mq: number
  area_applicata_mq: number  // max(area_mq, mq_minimo)
  prezzo_mq: number
  prezzo_totale: number
  costo_mq: number
  costo_totale: number
}

export type DistintaWinConfig = {
  profili: RigaDistintaProfilo[]
  accessori: RigaDistintaAccessorio[]
  riempimenti: RigaDistintaRiempimento[]
}

// ---- Input form (per le Server Actions) ----

export type WcSerieInput = {
  nome: string
  materiale: Materiale
  descrizione?: string | null
  sfrido_nodo_mm: number
  sfrido_angolo_mm: number
  lunghezza_barra_mm: number
  attiva: boolean
  ordine: number
}

export type WcProfiloInput = Omit<WcProfilo, 'id' | 'serie_id' | 'organization_id' | 'created_at'>
export type WcAccessorioInput = Omit<WcAccessorio, 'id' | 'serie_id' | 'organization_id' | 'created_at'>
export type WcRiempimentoInput = Omit<WcRiempimento, 'id' | 'organization_id' | 'created_at'>
export type WcColoreInput = Omit<WcColore, 'id' | 'serie_id' | 'organization_id' | 'created_at'>
