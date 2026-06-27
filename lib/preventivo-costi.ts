// Calcolo costi/utile di un preventivo — fonte unica della formula del "Report interno".
// Usato sia da DettaglioPreventivo (tabella per-articolo + riepilogo) sia dalle statistiche
// commesse (analisi costi/utili stimati per mese).

import type { ArticoloPreventivoRow } from '@/types/preventivo'

// Sottoinsieme di campi necessari al calcolo costi (così il server può passare righe parziali).
export type ArticoloCosti = Pick<
  ArticoloPreventivoRow,
  | 'tipo'
  | 'quantita'
  | 'costo_acquisto_unitario'
  | 'costo_posa'
  | 'config_su_misura'
  | 'config_scorrevole'
  | 'config_winconfig'
>

// Costo materiali (acq) e posa per UNITÀ di un articolo.
// Per su_misura/scorrevole/winconfig usa la config come fonte attendibile (funziona anche
// su articoli già salvati); altrimenti i campi costo della riga.
export function costiArticolo(a: ArticoloCosti): { acq: number; posa: number } {
  if (a.tipo === 'su_misura' && a.config_su_misura)
    return {
      acq: a.config_su_misura.totale_prodotto + a.config_su_misura.totale_accessori,
      posa: a.config_su_misura.mano_dopera,
    }
  if (a.tipo === 'scorrevole' && a.config_scorrevole)
    return {
      acq: a.config_scorrevole.dettaglio.totale_riga,
      posa: a.config_scorrevole.posa ?? a.costo_posa,
    }
  if (a.tipo === 'winconfig' && a.config_winconfig)
    return { acq: a.config_winconfig.costo_totale, posa: a.costo_posa }
  return { acq: a.costo_acquisto_unitario, posa: a.costo_posa }
}

export type CostiPreventivo = {
  materiali: number   // Σ acq × quantità
  posa: number        // Σ posa × quantità
  costoTotale: number // materiali + posa + spese trasporto
  utile: number       // totaleArticoli − costoTotale
}

// Aggrega i costi/utile di un intero preventivo.
// utile = totaleArticoli − (materiali + posa + speseTrasporto).
export function calcolaCostiPreventivo(
  articoli: ArticoloCosti[],
  totaleArticoli: number,
  speseTrasporto: number,
): CostiPreventivo {
  const materiali = articoli.reduce((sum, a) => sum + costiArticolo(a).acq * a.quantita, 0)
  const posa = articoli.reduce((sum, a) => sum + costiArticolo(a).posa * a.quantita, 0)
  const costoTotale = materiali + posa + speseTrasporto
  const utile = totaleArticoli - costoTotale
  return { materiali, posa, costoTotale, utile }
}
