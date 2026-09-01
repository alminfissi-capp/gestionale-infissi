/** I blocchi della pagina statistiche, nell'ordine di partenza. */
export const BLOCCHI_STATISTICHE = [
  { id: 'andamento-commesse', titolo: 'Andamento commesse' },
  { id: 'incassi-pagamenti',  titolo: 'Incassi e pagamenti' },
  { id: 'uscite-categoria',   titolo: 'Uscite per categoria' },
  { id: 'crediti-debiti',     titolo: 'Crediti e debiti' },
  { id: 'andamento-storico',  titolo: 'Andamento crediti e debiti' },
  { id: 'costi-utili',        titolo: 'Costi e utili stimati' },
  { id: 'resoconto-cliente',  titolo: 'Resoconto per cliente' },
] as const

export type IdBlocco = (typeof BLOCCHI_STATISTICHE)[number]['id']

/**
 * Preferenze personali della pagina statistiche.
 *
 * `ordineBlocchi` e' una lista di identificativi, non di indici: un blocco
 * aggiunto in futuro, che un ordine salvato non conosce, si accoda invece di
 * sparire. Con gli indici il primo blocco nuovo romperebbe ogni ordine salvato.
 */
export type PreferenzeStatistiche = {
  ordineBlocchi?: string[]
}
