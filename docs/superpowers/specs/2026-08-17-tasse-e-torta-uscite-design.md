# Categoria Tasse e torta delle uscite — Design

Data: 2026-08-17
Stato: approvato dall'utente, implementato

## Obiettivo

1. Nuova categoria **Tasse** per le scadenze: imposte e contributi vanno visti a parte,
   non annegati in "altro".
2. In `/commesse/statistiche`, una **torta delle uscite per categoria** con totale e
   percentuale per ogni voce.

## A. Categoria Tasse

`scadenze.categoria` è `text` con default `'altro'` e **nessun vincolo CHECK**: aggiungere
`'tassa'` non richiede migrazione. Basta il tipo TypeScript, e il compilatore fa il resto —
le etichette vivono in `Record<CategoriaScadenza, …>`, quindi ogni punto da completare
viene segnalato:

- `types/commessa.ts` — `CategoriaScadenza` guadagna `'tassa'`
- `DialogScadenza` — voce "Tassa / Contributo", icona `Scale`
- `RigaScadenza` — badge, bordo e sfondo in rosa; **ripetibile** come finanziamenti e
  utenze, perché F24, IVA e contributi tornano periodicamente
- `SchedaScadenzaStampa` — etichetta per la stampa

**Riclassificate 8 righe** da `altro` a `tassa`, solo sui quattro nomi confermati
dall'utente: Inps e Inail, Agenzia delle Entrate, Tasse, Ministero della giustizia
(€3.928,36). Nessuna inferenza sugli altri fornitori.

## B. Torta delle uscite

`aggregaUscitePerCategoria(scadenze, pagamentiDipendenti, anno)` in
`lib/statistiche-commesse.ts`. Sei voci:

| Voce | Da dove |
|---|---|
| Materiali e servizi | scadenze pagate, categoria `assegno` |
| Stipendi | `pagamenti_dipendente` + movimenti altri dipendenti di tipo `pagamento` |
| Finanziamenti | categoria `finanziamento` |
| Altre spese | categoria `altro` |
| Utenze | categoria `utenza` |
| Tasse | categoria `tassa` |

Solo pagamenti effettuati e non annullati, come il grafico del flusso. Segue il selettore
anno: un pagamento non può essere nel futuro, quindi per l'anno in corso equivale a "fino
ad oggi". Fette ordinate per importo, quelle a zero omesse. Una categoria non prevista
finisce fra le altre spese invece di sparire dal totale.

## Colore e leggibilità

La tavolozza a sei tinte è passata a `validate_palette.js` (skill dataviz). Passa banda di
luminosità, chroma, contrasto e separazione per daltonismo **su tutte le coppie
consecutive**, ma **nessuna** combinazione di sei tinte passa il controllo su *tutte* le
coppie: rosso, verde e arancio sono mutuamente confondibili sotto protanopia e con sei
categorie non si evita.

Per questo **ogni fetta porta la percentuale scritta** e l'elenco accanto riporta nome,
euro e percentuale: il colore diventa decorativo, non portante. È la codifica secondaria
che le linee guida richiedono, ed è più robusta di qualunque tavolozza.

Il colore è legato alla **categoria, non alla posizione**: le fette si riordinano per
importo e la voce di spesa mantiene il suo colore. Finanziamenti, utenze e tasse usano le
stesse tinte dei rispettivi badge nelle righe scadenza.

Se le fette piccole dovessero risultare strette, la stessa funzione alimenta senza
modifiche un grafico a barre orizzontali ordinate.

## Test

In `lib/statistiche-commesse.test.ts`: mappatura di ogni categoria, stipendi come voce
propria, esclusione di non pagate/annullate/altri anni, ordinamento decrescente,
percentuali che sommano a 100, omissione delle fette a zero, categoria non prevista che
ricade in "altre spese", e nessuna divisione per zero senza uscite.

## Fuori ambito

Nessun'altra ricategorizzazione di "altro": mutuo, banca, vitto e carburante restano dove
sono. Sono scelte dell'utente, e indovinarle dal nome del fornitore è proprio l'errore che
ho commesso su EDILSIDER — registrato sotto `utenza` perché fornisce assistenza software
FP-PRO, non perché fosse malcategorizzato.
