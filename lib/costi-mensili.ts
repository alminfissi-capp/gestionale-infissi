// Resoconto mensile dei costi: costi fissi, costi variabili e tasse, mese per mese.
// Logica pura: nessuna dipendenza React o Supabase.
//
// Definizione di "anno": l'anno di CALENDARIO in cui il costo matura — la data di
// scadenza per le scadenze, il periodo di competenza per gli stipendi. Non è il
// nome del blocco commesse.
//
// COMPETENZA, NON CASSA: un costo conta nel mese in cui matura anche se non è
// ancora stato pagato. È la differenza con `aggregaUscitePerCategoria`, che somma
// solo il pagato: i due blocchi rispondono a domande diverse e i loro totali NON
// devono tornare uguali. Non "correggere" l'uno per farlo somigliare all'altro.

export type FamigliaCosto = 'fissi' | 'variabili' | 'tasse'

export type VoceCosto =
  | 'utenze' | 'finanziamenti' | 'stipendi'   // fissi
  | 'materiali' | 'altro'                      // variabili
  | 'tasse'                                    // a parte

export const FAMIGLIE: FamigliaCosto[] = ['fissi', 'variabili', 'tasse']

export const FAMIGLIA_LABEL: Record<FamigliaCosto, string> = {
  fissi: 'Costi fissi',
  variabili: 'Costi variabili',
  tasse: 'Tasse',
}

// Ordine di stampa nella tabella: le voci raggruppate per famiglia.
export const VOCI: VoceCosto[] = [
  'utenze', 'finanziamenti', 'stipendi', 'materiali', 'altro', 'tasse',
]

export const VOCE_LABEL: Record<VoceCosto, string> = {
  utenze: 'Utenze',
  finanziamenti: 'Finanziamenti',
  stipendi: 'Stipendi',
  materiali: 'Materiali e servizi',
  altro: 'Altre spese',
  tasse: 'Tasse e contributi',
}

export const FAMIGLIA_DI: Record<VoceCosto, FamigliaCosto> = {
  utenze: 'fissi',
  finanziamenti: 'fissi',
  stipendi: 'fissi',
  materiali: 'variabili',
  altro: 'variabili',
  tasse: 'tasse',
}

// Nomi estesi: servono all'avviso sui mesi senza stipendi, dove "luglio" si legge
// meglio di "Lug".
export const MESI_ESTESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

// `CategoriaScadenza` (types/commessa.ts) → voce di spesa. Gli assegni sono i
// pagamenti ai fornitori di materiali e servizi, come in `CATEGORIA_USCITA`.
const VOCE_DI_CATEGORIA: Record<string, VoceCosto> = {
  utenza: 'utenze',
  finanziamento: 'finanziamenti',
  assegno: 'materiali',
  tassa: 'tasse',
  altro: 'altro',
}

/**
 * La voce di spesa di una scadenza. Una categoria non prevista non va persa:
 * finisce fra le altre spese, quindi fra i variabili.
 */
export function voceDiCategoria(categoria: string): VoceCosto {
  return VOCE_DI_CATEGORIA[categoria] ?? 'altro'
}
