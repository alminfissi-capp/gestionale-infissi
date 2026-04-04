// ============================================================
// Tipi per il modulo Rilievo Veloce
// ============================================================

export type TipoOpzione = 'accessorio' | 'colore' | 'vetro' | 'serratura' | 'serie'

export interface RilievoOpzione {
  id: string
  organization_id: string
  tipo: TipoOpzione
  valore: string
  ordine: number
  attiva: boolean
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
  serie_profilo: string | null
  note: string | null
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

/** Opzioni raggruppate per tipo — usate nel form */
export interface OpzioniRilievo {
  accessori: string[]
  colori: string[]
  vetri: string[]
  serrature: string[]
  serie: string[]
}
