// Tipi del rilievo in cantiere con le strutture di FP PRO (fase 3).
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export type Lato = 'sinistra' | 'alto' | 'destra' | 'basso'

export interface RifFp {
  fpId: number
  descrizione: string
}

/** Contenuto di rilievo_veloce_voci.fp */
export interface VoceFpDati {
  strutturaId: string
  percorso: string
  nome: string
  serie: string
  larghezza: number | null
  altezza: number | null
  /** codice nodo -> mm: traversi dal basso, montanti da sinistra, all'asse del profilo */
  quote: Record<string, number>
  coloreInt: RifFp | null
  coloreEst: RifFp | null
  /** Colore (trattamento) degli accessori: in FP PRO e' un elenco a parte. Assente = non scelto */
  coloreAcc?: RifFp | null
  /** codice nodo del riempimento -> vetro scelto (assente = come la struttura) */
  vetri: Record<string, { fpId: number; codice: string }>
  /** `${codiceNodo}:${indiceKit}` -> scelto (solo kit opzionali) */
  kit: Record<string, boolean>
  mano: 'sx' | 'dx' | null
  /** lato -> codice profilo di telaio (assente = come la struttura) */
  telai: Partial<Record<Lato, string>>
}

export interface RilievoFp {
  id: string
  cliente: ClienteSnapshotRilievo
  note: string
  creatoAt: string
  aggiornatoAt: string
}

export interface VoceFp {
  id: string
  rilievoId: string
  ordine: number
  posizione: string
  quantita: number
  note: string
  fp: VoceFpDati
  aggiornatoAt: string
}

/** Righe nel telefono: daInviare = 1 finche' il server non le ha ricevute. */
export type RilievoLocale = RilievoFp & { daInviare: 0 | 1 }
export type VoceLocale = VoceFp & { daInviare: 0 | 1 }
export interface EliminatoFp {
  id: string
  tipo: 'rilievo' | 'voce'
}

export type TabellaCatalogoLocale = 'fp_strutture' | 'fp_colori' | 'fp_vetri' | 'fp_telai' | 'fp_serie'

export interface StrutturaLocale {
  id: string
  percorso: string
  cartella: string
  nome: string
  codice: string | null
  descrizione: string | null
  serie: string[]
  l_nominale: number | null
  h_nominale: number | null
  albero: NodoStruttura[]
  poligoni: number[][]
  immagine: string | null
  presente: boolean
  segno_server: string
}

export interface ColoreLocale { fp_id: number; descrizione: string; presente: boolean; segno_server: string }
export interface VetroLocale { fp_id: number; codice: string; descrizione: string | null; presente: boolean; segno_server: string }
export interface TelaioLocale { fp_id: number; serie_fp_id: number | null; codice: string; descrizione: string | null; presente: boolean; segno_server: string }
export interface SerieLocale { fp_id: number; nome: string; descrizione: string | null; presente: boolean; segno_server: string }

export interface PreferenzaFp {
  /** `${tipo}:${rif}` */
  id: string
  tipo: 'struttura' | 'colore' | 'vetro'
  rif: string
  ordine: number
}

export interface ImmagineLocale { path: string; blob: Blob }

/** Posizione nel catalogo del server: segno del server e chiave dell'ultima riga letta. */
export interface PosizioneFp { segno: string; chiave: string | null }

/**
 * Segnalibri del telefono, per tabella:
 * - `ricevuto`: da dove ripartire allo scaricamento successivo (vedi posizioneSicura);
 * - `inCorso`: dove ripartire se lo scaricamento si e' interrotto a meta'.
 */
export interface MetaFp { chiave: string; ricevuto: PosizioneFp | null; inCorso: PosizioneFp | null }
