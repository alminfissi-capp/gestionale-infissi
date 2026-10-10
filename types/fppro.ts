// Tipi del Catalogo FP PRO (copia del MySQL di FP PRO, archivio EDILSIDER)
// e del ponte sul PC che la tiene aggiornata.

export type StatoRichiesta = 'in_attesa' | 'in_corso' | 'completata' | 'errore'

export interface RichiestaPonte {
  id: string
  tipo: 'sincronizza'
  stato: StatoRichiesta
  automatica: boolean
  created_at: string
  iniziata_at: string | null
  finita_at: string | null
  errore: string | null
  /** Righe copiate per tabella, es. { fp_profili: 2601 } */
  esito: Record<string, number> | null
}

export const TABELLE_CONTEGGIO = [
  'fp_serie',
  'fp_profili',
  'fp_colori',
  'fp_accessori',
  'fp_vetri',
  'fp_kit',
] as const

export type TabellaConteggio = (typeof TABELLE_CONTEGGIO)[number]

export interface CatalogoFpStato {
  ultimoSegnaleAt: string | null
  ultimaSyncAt: string | null
  versionePonte: string | null
  ultimaRichiesta: RichiestaPonte | null
  conteggi: Record<TabellaConteggio, number>
}

export interface SerieFp {
  fp_id: number
  nome: string
  descrizione: string | null
}

export type TipoCatalogo = 'profili' | 'accessori' | 'vetri' | 'colori'

/** Riga gia' pronta da mostrare nella tabella del catalogo. */
export interface RigaCatalogo {
  id: string
  codice: string
  descrizione: string
  serie: string
  dettaglio: string
  prezzo: string
  /** true quando il prezzo manca in FP PRO */
  senzaPrezzo: boolean
}
