/**
 * Istante di generazione di una pagina server, da passare a useAggiornaSeVecchia.
 * Funzione a parte: la regola react-hooks/purity non accetta Date.now() nel corpo del componente.
 */
export function istanteGenerazione(): number {
  return Date.now()
}
