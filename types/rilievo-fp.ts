// Tipi del rilievo in cantiere con le strutture di FP PRO (fase 3).
import type { NodoStruttura, TempiStruttura } from '@/lib/fppro/strutture-xml'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export type Lato = 'sinistra' | 'alto' | 'destra' | 'basso'

/** Fasi di lavoro con un tempo, come in FP PRO (FP_TIMES) */
export type FaseLavoro = 'taglio' | 'lavorazione' | 'montaggio' | 'assemblaggio' | 'posa'

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
  /** Colori accessori in ordine di preferenza (come FP PRO): per ogni accessorio vale il primo che esiste. Se presente vince su coloreAcc */
  coloriAcc?: RifFp[]
  /** codice nodo del riempimento -> vetro scelto (assente = come la struttura) */
  vetri: Record<string, { fpId: number; codice: string }>
  /** `${codiceNodo}:${indiceKit}` -> scelto (solo kit opzionali) */
  kit: Record<string, boolean>
  /**
   * Accessori opzionali dentro i kit o sciolti nella struttura (es. serratura, martellina):
   * chiaveAccessorio -> scelto. Assente = come FP PRO (confermato nella struttura).
   */
  accessori?: Record<string, boolean>
  /** Minuti di lavoro per pezzo scritti in cantiere: sostituiscono quelli della struttura (assente = struttura) */
  minuti?: Partial<Record<FaseLavoro, number>>
  mano: 'sx' | 'dx' | null
  /** lato -> codice profilo di telaio (assente = come la struttura) */
  telai: Partial<Record<Lato, string>>
  /** Codice del profilo anta scelto (assente = come la struttura) */
  anta?: string | null
  /** Note libere sui 4 lati del telaio */
  noteTelaio?: Partial<Record<Lato, string>>
}

export interface RilievoFp {
  id: string
  cliente: ClienteSnapshotRilievo
  note: string
  /** Data del rilievo (AAAA-MM-GG); assente nei rilievi fatti prima: vale creatoAt */
  dataRilievo?: string | null
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

export type TabellaCatalogoLocale = 'fp_strutture' | 'fp_colori' | 'fp_vetri' | 'fp_telai' | 'fp_serie' | 'fp_sezioni'

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
  /** Ore per fase della struttura (assente nelle strutture scaricate prima di Dexie v9) */
  tempi?: TempiStruttura | null
  presente: boolean
  segno_server: string
}

export interface ColoreLocale { fp_id: number; descrizione: string; per_profili?: boolean; per_accessori?: boolean; presente: boolean; segno_server: string }
export interface VetroLocale { fp_id: number; codice: string; descrizione: string | null; presente: boolean; segno_server: string }
/** Profilo di telaio o anta della serie (tabella locale fpTelai). utilizzi = codici FP PRO (8050 telaio, 8090/8100 anta) */
export interface TelaioLocale { fp_id: number; serie_fp_id: number | null; codice: string; descrizione: string | null; utilizzi: number[]; presente: boolean; segno_server: string }
/** Miniatura della sezione del profilo, ricavata dal DXF dal ponte */
export interface AnteprimaProfilo { viewBox: string; d: string }
export interface SezioneLocale { fp_id: number; codice: string; anteprima: AnteprimaProfilo | null; presente: boolean; segno_server: string }
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
