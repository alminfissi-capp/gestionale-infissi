# Ordini dal magazzino: nominativo libero

Data: 2026-11-20. Approvato dall'utente con anteprima.

**Perche':** una sostituzione in garanzia di un lavoro di anni precedenti non ha una commessa a cui
attribuire l'ordine fornitore. Oltre a "Magazzino" e alle commesse serve poter scrivere un nominativo.

**Come:** nel campo Commessa del dialog ordine (solo dal magazzino) voce "✎ Altro nominativo…" con casella
"Nominativo" (obbligatoria se scelta). Colonna `ordini_fornitore.riferimento_libero` (nullable), valida solo
senza commessa (l'azione la azzera se c'e' una commessa). L'elenco ordini mostra il nominativo con icona
matita; il PDF al fornitore stampa "Riferimento: <nominativo>" al posto di "Commessa: Magazzino".
Nessun effetto sul magazzino (l'ordine non carica giacenze). Regola unica in `riferimentoOrdine()` (lib/produzione.ts).

Approcci: select + casella (scelto, minimo e chiaro) contro combobox con testo libero (piu' invasivo).
