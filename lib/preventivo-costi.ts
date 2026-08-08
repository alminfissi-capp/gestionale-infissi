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

// Costo materiali (acq), posa e spese varie per UNITÀ di un articolo.
// Per su_misura/scorrevole/winconfig usa la config come fonte attendibile (funziona anche
// su articoli già salvati); altrimenti i campi costo della riga.
// Le spese varie (solo su_misura) sono un COSTO aggiuntivo incluso nel prezzo di vendita:
// il form compone prezzo = prodotto + accessori + mano d'opera + spese varie + utile.
// Ometterle qui le farebbe ricadere sull'utile, gonfiandolo.
export function costiArticolo(a: ArticoloCosti): { acq: number; posa: number; spese: number } {
  if (a.tipo === 'su_misura' && a.config_su_misura)
    return {
      acq: a.config_su_misura.totale_prodotto + a.config_su_misura.totale_accessori,
      posa: a.config_su_misura.mano_dopera,
      spese: a.config_su_misura.spese_varie_calcolate || 0,
    }
  if (a.tipo === 'scorrevole' && a.config_scorrevole)
    return {
      acq: a.config_scorrevole.dettaglio.totale_riga,
      posa: a.config_scorrevole.posa ?? a.costo_posa,
      spese: 0,
    }
  if (a.tipo === 'winconfig' && a.config_winconfig)
    return { acq: a.config_winconfig.costo_totale, posa: a.costo_posa, spese: 0 }
  return { acq: a.costo_acquisto_unitario, posa: a.costo_posa, spese: 0 }
}

export type CostiPreventivo = {
  materiali: number   // Σ acq × quantità
  posa: number        // Σ posa × quantità
  spese: number       // Σ spese varie × quantità (solo articoli su misura)
  costoTotale: number // materiali + posa + spese + spese trasporto
  utile: number       // totaleArticoli − costoTotale
}

// Aggrega i costi/utile di un intero preventivo.
// utile = totaleArticoli − (materiali + posa + speseVarie + speseTrasporto).
export function calcolaCostiPreventivo(
  articoli: ArticoloCosti[],
  totaleArticoli: number,
  speseTrasporto: number,
): CostiPreventivo {
  let materiali = 0
  let posa = 0
  let spese = 0
  for (const a of articoli) {
    const c = costiArticolo(a)
    materiali += c.acq * a.quantita
    posa += c.posa * a.quantita
    spese += c.spese * a.quantita
  }
  const costoTotale = materiali + posa + spese + speseTrasporto
  const utile = totaleArticoli - costoTotale
  return { materiali, posa, spese, costoTotale, utile }
}
