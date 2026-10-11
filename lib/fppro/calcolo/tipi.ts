// Tipi del motore di calcolo "come FP PRO" (fase 4a).

/** Profilo di calcolo di FP PRO (configprev): percentuali come frazioni (0.05 = 5%), costi in €/h */
export interface ProfiloCalcolo {
  spese_generali: number
  utile: number
  provvigione: number
  costo_taglio: number
  costo_lavorazione: number
  costo_montaggio: number
  costo_assemblaggio: number
  costo_posa: number
  imballo: number
  viaggio: number
  materiali_vari: number
  altro: number
}

/** Ore per una struttura */
export interface OreVoce {
  taglio: number
  lavorazione: number
  montaggio: number
  assemblaggio: number
  posa: number
}

/** Correzioni fatte a mano su una voce: valgono solo per quella voce */
export interface CorrezioniVoce {
  ore?: Partial<OreVoce>
  percentuali?: Partial<Pick<ProfiloCalcolo, 'spese_generali' | 'utile' | 'provvigione' | 'imballo' | 'viaggio' | 'materiali_vari' | 'altro'>>
  extra?: { descrizione: string; importo: number }[]
}
