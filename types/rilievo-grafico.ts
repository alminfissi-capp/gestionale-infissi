// Rilievo grafico: serramenti fuori standard disegnati come in FP PRO. In cantiere si
// disegna la struttura (forma + divisioni + ante + riempimenti), in ufficio si assegnano
// profili, vetri, pannelli, doghe e lamelle pezzo per pezzo. Tutte le misure in mm, con
// x verso destra e y verso l'alto (origine in basso a sinistra, come FP PRO).

export interface Pt { x: number; y: number }

/** Forma esterna: un modello di FP PRO (Prm\MODELS) con le sue misure, oppure a punti */
export type Forma =
  | { tipo: 'modello'; modello: string; misure: Record<string, number> }
  | { tipo: 'punti'; punti: PuntoForma[] }

/**
 * Vertice della forma a punti: distanza dal lato sinistro e altezza da terra. `freccia` =
 * quanto sale (positiva, verso l'esterno) o rientra (negativa) l'arco del lato che parte
 * da questo punto e arriva al successivo; assente o 0 = lato dritto.
 */
export interface PuntoForma { x: number; h: number; freccia?: number }

export type Materiale = 'vetro' | 'pannello' | 'doghe' | 'lamelle'
export type Apertura = 'battente' | 'anta_ribalta' | 'ribalta' | 'scorrevole'
export type Verso = 'montante' | 'traverso'

/**
 * Dove stanno i tagli di una divisione, all'asse del profilo. `inizio` = dal lato sinistro
 * della zona (montanti) o dal basso (traversi); `fine` = da destra o dall'alto.
 */
export type PosizioneTagli =
  | { modo: 'uguali' }
  | { modo: 'quote'; da: 'inizio' | 'fine'; quote: number[] }

export type Contenuto =
  | { tipo: 'vuoto' }
  | { tipo: 'riempimento'; materiale: Materiale }
  /** parti: da sinistra a destra (montanti) o dal basso in alto (traversi) */
  | { tipo: 'divisione'; id: string; verso: Verso; posizione: PosizioneTagli; parti: Zona[] }
  /** Una zona per anta, da sinistra a destra; dentro ognuna il suo contenuto */
  | { tipo: 'anta'; id: string; apertura: Apertura; mano: 'sx' | 'dx' | null; ante: Zona[] }

export interface Zona { id: string; contenuto: Contenuto }

/** Profilo, vetro, pannello o doga assegnati in ufficio */
export interface Assegnazione {
  fpId: number | null
  codice: string
  descrizione: string | null
  /** Solo per i riempimenti: per cosa era stato scelto (cambiato il materiale, non vale piu') */
  materiale?: Materiale
}

export interface DisegnoGrafico {
  forma: Forma
  /** Contenuto del telaio */
  radice: Zona
  /** fp_id delle serie scelte per questo serramento */
  serie: number[]
  /** id del pezzo -> profilo */
  profili: Record<string, Assegnazione>
  /** id della zona riempita -> vetro, pannello, doga o lamella */
  riempimenti: Record<string, Assegnazione>
}

export interface RilievoGrafico {
  id: string
  nome: string
  cliente: string
  note: string
  quantita: number
  disegno: DisegnoGrafico
  creatoAt: string
  aggiornatoAt: string
}

/** Riga nel dispositivo: daInviare = 1 finche' il server non l'ha ricevuta */
export type RilievoGraficoLocale = RilievoGrafico & { daInviare: 0 | 1 }
export interface EliminatoGrafico { id: string }

export type RuoloPezzo =
  | 'telaio' | 'montante' | 'traverso' | 'anta' | 'anta_scorrevole' | 'riporto'
  | 'fermavetro' | 'fermapannello'

/** Profilo del catalogo FP PRO offerto in ufficio */
export interface ProfiloCatalogo {
  fpId: number
  serieFpId: number | null
  codice: string
  descrizione: string | null
  utilizzi: number[]
  anteprima: { viewBox: string; d: string } | null
}
