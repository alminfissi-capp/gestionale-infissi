// ============================================================
// Tipi per il modulo Rilievo Veloce
// ============================================================

export type TipoOpzione = 'accessorio' | 'colore' | 'vetro' | 'serratura' | 'serie' | 'struttura' | 'telaio'

// ─── Albero vani ────────────────────────────────────────────────────────────

export type TipoRiempimento = 'vetro' | 'pannello' | 'lamelle' | 'doghe'

/** Nodo foglia: un singolo vano configurato */
export interface VanoLeaf {
  type: 'leaf'
  id: string
  tipo_apertura: 'battente' | 'scorrevole' | 'alzante_scorrevole' | 'fisso' | null
  apertura: string | null   // es. 'battente_interno_sx', 'mobile_sx', 'fisso'…
  riempimento: TipoRiempimento
  pos_maniglia?: 'right' | 'left' | 'top' | 'bottom' | null
}

/** Nodo divisore: divide un vano in due figlie con un montante o traversa */
export interface VanoSplit {
  type: 'split'
  id: string
  direzione: 'montante' | 'traverso'   // montante = divisore verticale, traverso = orizzontale
  frazione: number                      // 0..1, posizione del divisore relativa al vano padre
  figli: [VanoNode, VanoNode]
}

export type VanoNode = VanoLeaf | VanoSplit

export interface RilievoOpzione {
  id: string
  organization_id: string
  tipo: TipoOpzione
  valore: string
  ordine: number
  attiva: boolean
  strutture_collegate: string[]   // UUID delle strutture compatibili (tipo='serie') o delle serie compatibili (tipo='telaio')
  created_at: string
}

export interface ClienteSnapshotRilievo {
  tipo: 'privato' | 'azienda'
  ragione_sociale: string | null
  nome: string | null
  cognome: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null
  cantiere: string | null
}

export interface RilievoVeloce {
  id: string
  organization_id: string
  cliente_snapshot: ClienteSnapshotRilievo
  note: string | null
  created_at: string
  updated_at: string
}

export interface RilievoVeloceCompleto extends RilievoVeloce {
  voci: VoceRilievoVeloce[]
}

export interface VoceRilievoVeloce {
  id: string
  rilievo_id: string
  organization_id: string
  ordine: number
  voce: string | null
  quantita: number
  tipologia: string | null
  larghezza_mm: number | null
  altezza_mm: number | null
  accessori: string[]
  colore_interno: string | null
  bicolore: boolean
  colore_esterno: string | null
  tipologia_vetro: string | null
  anta_ribalta: boolean
  serratura: boolean
  tipo_serratura: string | null
  struttura: string | null
  n_ante: number | null
  n_traverse: number | null
  anta_principale: number | null
  serie_profilo: string | null
  h_davanzale_mm: number | null
  pos_maniglia: 'right' | 'left' | 'top' | 'bottom' | null
  telaio_top: string | null
  telaio_left: string | null
  telaio_bottom: string | null
  telaio_right: string | null
  note: string | null
  tipo_apertura: 'battente' | 'scorrevole' | 'alzante_scorrevole' | null
  apertura_ante: string[]   // per-anta: es. 'battente_interno_sx', 'mobile_dx', 'fisso'…
  // Forma trapezoidale (fuori squadra)
  fuori_squadro: boolean
  altezza_sx_mm: number | null
  altezza_dx_mm: number | null
  // Albero vani avanzato (sostituisce n_ante × n_traverse quando presente)
  vani_tree: VanoNode | null
  created_at: string
}

/** Input per creare/modificare una voce (senza campi DB-only) */
export type VoceInput = Omit<VoceRilievoVeloce, 'id' | 'rilievo_id' | 'organization_id' | 'created_at'>

/** Input per creare un nuovo rilievo */
export interface RilievoInput {
  clienteSnapshot: ClienteSnapshotRilievo
  note: string
  voci: VoceInput[]
}

/** Opzione struttura — contiene id per il collegamento con le serie */
export interface StrutturaOpzione {
  id: string
  valore: string
}

/** Opzione serie — contiene le strutture compatibili */
export interface SerieOpzione {
  id: string
  valore: string
  strutture_collegate: string[]
}

/** Opzione telaio — contiene le serie profilo compatibili */
export interface TelaioOpzione {
  id: string
  valore: string
  serie_collegate: string[]   // UUID delle serie profilo compatibili (vuoto = valido per tutte)
}

/** Opzioni raggruppate per tipo — usate nel form */
export interface OpzioniRilievo {
  accessori: string[]
  colori: string[]
  vetri: string[]
  serrature: string[]
  strutture: StrutturaOpzione[]
  serie: SerieOpzione[]
  telai: TelaioOpzione[]
}
