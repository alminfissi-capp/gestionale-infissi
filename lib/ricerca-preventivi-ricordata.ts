// Ricerca dell'elenco preventivi ricordata mentre si aprono i preventivi trovati e si torna indietro.
// Vive in memoria: sparisce chiudendo l'app o andando in un'altra sezione (vedi LayoutShell).
let ricerca = ''

export const leggiRicercaPreventivi = () => ricerca
export const salvaRicercaPreventivi = (testo: string) => { ricerca = testo }
export const dimenticaRicercaPreventivi = () => { ricerca = '' }
