# Resoconto mensile costi — costi fissi, variabili e tasse

Data: 2026-09-12
Stato: approvato, da implementare

## Obiettivo

Un blocco nuovo nella pagina `/commesse/statistiche` che mostra, mese per mese,
quanto costa l'azienda diviso in tre famiglie: **costi fissi**, **costi variabili**
e **tasse** (voce a parte).

La domanda a cui deve rispondere: *quanto mi costa un mese, e quanta parte di quel
costo è dovuta comunque vada?*

## Le tre famiglie

Le voci si incastrano nelle categorie di spesa che esistono già
(`CategoriaScadenza` in `types/commessa.ts`, `CATEGORIA_USCITA` in
`lib/statistiche-commesse.ts`). Nessuna modifica al database, nessuna
ricatalogazione dei dati esistenti.

| Famiglia | Voce | Origine |
|---|---|---|
| Costi fissi | Utenze | `scadenze.categoria = 'utenza'` |
| Costi fissi | Finanziamenti | `scadenze.categoria = 'finanziamento'` |
| Costi fissi | Stipendi | `buste_paga` + `movimenti_altro_dipendente` tipo `stipendio` |
| Costi variabili | Materiali e servizi | `scadenze.categoria = 'assegno'` |
| Costi variabili | Altre spese | `scadenze.categoria = 'altro'` |
| Tasse | Tasse e contributi | `scadenze.categoria = 'tassa'` |

Una categoria non prevista (valore nuovo aggiunto in futuro al tipo) finisce in
**Altre spese**, quindi fra i variabili: è il comportamento già adottato da
`aggregaUscitePerCategoria` e vale la stessa ragione, un costo sconosciuto non
deve sparire dai totali.

## Semantica: competenza, non cassa

Un costo conta nel mese in cui **matura**, non in quello in cui viene pagato.

- **Scadenze**: contano nel mese di `data_scadenza`, indipendentemente da `pagato`.
  Restano fuori solo quelle con `annullata = true`.
- **Stipendi dei dipendenti fissi**: `buste_paga.netto` nel mese di
  `buste_paga.periodo` (formato `'YYYY-MM-01'`). **Non** si usano i record di
  `pagamenti_dipendente`: il costo di settembre è la busta di settembre, anche se
  il bonifico parte a ottobre.
- **Stipendi degli altri dipendenti**: `movimenti_altro_dipendente` con
  `tipo = 'stipendio'`, nel mese di `periodo`. Per la cadenza settimanale
  `periodo` è il lunedì della settimana: il mese è quello che contiene quel lunedì.
  I movimenti di tipo `pagamento` sono esclusi, sono la cassa.

### Due conseguenze volute

1. **I mesi futuri dell'anno in corso non sono vuoti**: si riempiono con le rate
   dei finanziamenti e le utenze ricorrenti già inserite. È una previsione, ed è
   il motivo per cui la competenza è stata preferita alla cassa.

2. **Un mese senza buste paga caricate mostra zero stipendi**, e siccome gli
   stipendi sono la componente principale dei costi fissi, la linea della soglia
   fissa crolla in quel mese. Il blocco deve segnalarlo esplicitamente (vedi
   "Avviso mesi senza buste"), altrimenti un dato mancante si legge come un
   risparmio.

### Rapporto con il blocco "Uscite per categoria"

Il blocco esistente `uscite-categoria` ragiona **per cassa** (solo `pagato = true`).
Sullo stesso anno i due blocchi daranno numeri diversi, ed è corretto. Per evitare
che la differenza sembri un errore, il blocco nuovo porta accanto al titolo
un'etichetta `competenza`, sullo stesso modello del badge `a oggi` del blocco
`crediti-debiti`.

Nessuno dei due blocchi va modificato per "farli tornare": rispondono a domande
diverse.

## Visualizzazione

Scelta dopo confronto di tre mockup (opzione C).

**Dall'alto in basso:**

1. **Tre schede di riepilogo** dell'anno selezionato, una per famiglia: totale,
   media mensile, percentuale sul totale dei costi. Bordo sinistro colorato con
   il colore della famiglia.

2. **Grafico combinato** (`ComposedChart` di recharts), asse X = i dodici mesi:
   - tre `Bar` impilate sullo stesso `stackId` — fissi, variabili, tasse;
   - una `Line` tratteggiata sopra, che segue i **soli costi fissi**: è la soglia
     che il mese costa comunque vada. Usa lo stesso asse Y in euro, quindi non
     serve un secondo asse.

3. **Tabella di dettaglio**, chiusa di default e apribile col chevron (stesso
   schema dei dettagli già presenti in pagina): righe = le sei voci raggruppate
   per famiglia con un sottototale per famiglia, colonne = i dodici mesi più il
   totale d'anno.

4. **Avviso mesi senza buste**: sotto il grafico, quando nell'anno ci sono mesi
   già trascorsi senza nessuna busta paga caricata, una riga di testo che li
   elenca per nome ("Stipendi non ancora caricati per: luglio, agosto").

### Colori

Riuso i colori che le stesse voci hanno già in `COLORI_USCITA`
(`components/commesse/StatisticheCommesse.tsx`), così una voce ha lo stesso
colore in tutta la pagina:

- costi fissi: `#7c3aed` (violet-600, il colore dei finanziamenti)
- costi variabili: `#0284c7` (sky-600, il colore dei materiali)
- tasse: `#e11d48` (rose-600, già il colore delle tasse)
- linea soglia fissa: `#1f2937` (gray-800), tratteggiata

Il colore non porta mai da solo l'informazione: schede, legenda e tabella
riportano sempre il nome scritto della famiglia.

### Anno

Il blocco segue il selettore dell'anno globale della pagina, come gli altri
blocchi annuali. L'anno qui è l'anno di calendario delle date di scadenza e dei
periodi delle buste, non il nome del blocco commesse.

## Struttura del codice

### `lib/costi-mensili.ts` (nuovo)

Logica pura, nessuna dipendenza React né Supabase, sul modello di
`lib/andamento-crediti-debiti.ts`.

Espone:

- i tipi `FamigliaCosto` (`'fissi' | 'variabili' | 'tasse'`) e `VoceCosto`
  (le sei voci), più le mappe di etichette;
- la mappa voce → famiglia e la mappa `CategoriaScadenza` → voce;
- `aggregaCostiMensili(dati, anno, oggi)` che restituisce un `ResocontoCosti`:
  - `mesi`: dodici righe, ciascuna con l'importo delle sei voci, i tre totali di
    famiglia e il totale del mese (mesi senza costi inclusi, a zero: il grafico
    deve avere sempre dodici colonne);
  - `totali`: totale d'anno per famiglia e complessivo, con media mensile e
    percentuale;
  - `mesiSenzaStipendi`: gli indici dei mesi già trascorsi in cui non risulta
    nessuno stipendio. "Trascorso" si misura sulla data odierna passata dalla
    pagina (`oggi`, già calcolata in fuso Europe/Rome): per un anno passato sono
    tutti e dodici, per l'anno in corso quelli fino al mese corrente incluso, per
    un anno futuro nessuno. Se nell'anno non c'è nessuno stipendio l'elenco è
    vuoto: chi non usa il modulo dipendenti non deve vedere l'avviso su tutti e
    dodici i mesi.

Non lo metto dentro `lib/statistiche-commesse.ts`, che è già a 691 righe.

### `lib/costi-mensili.test.ts` (nuovo)

Vitest, come gli altri moduli di `lib/`. Casi da coprire:

- ogni categoria di scadenza finisce nella famiglia giusta;
- una categoria sconosciuta finisce in Altre spese;
- le scadenze annullate sono escluse, quelle non pagate no;
- una scadenza di un altro anno non entra;
- una busta paga conta nel mese del suo `periodo`, non in quello del pagamento;
- i movimenti `pagamento` degli altri dipendenti sono esclusi, gli `stipendio` no;
- un movimento settimanale finisce nel mese del suo lunedì;
- i dodici mesi ci sono sempre, anche a zero;
- `mesiSenzaStipendi` elenca solo i mesi trascorsi, non quelli futuri;
- `mesiSenzaStipendi` è vuoto se nell'anno non c'è nessuno stipendio.

### `components/commesse/CostiMensili.tsx` (nuovo)

Client component `CostiMensili`, riceve il `ResocontoCosti` già calcolato dal
padre via `useMemo`. Contiene schede, legenda, grafico, avviso e tabella
collassabile. Il tipo del risultato si chiama `ResocontoCosti` e non
`CostiMensili` proprio per non collidere col nome del componente.

Tooltip e legenda sono scritti a mano invece di usare quelli di recharts: la
`Line` condivide la serie `fissi` con la barra in basso, e i componenti standard
mostrerebbero quella voce due volte.

### `components/commesse/StatisticheCommesse.tsx` (modifica)

- registra il contenuto e il sottotitolo del blocco `costi-mensili`;
- calcola l'aggregazione in un `useMemo` legato all'anno selezionato.

### `types/statistiche.ts` (modifica)

Aggiunge `{ id: 'costi-mensili', titolo: 'Resoconto mensile costi' }` a
`BLOCCHI_STATISTICHE`, dopo `uscite-categoria`.

Chi ha già un ordine salvato non ha quell'id nella lista: `applicaOrdine`
accoda i blocchi sconosciuti, quindi il blocco nuovo compare in fondo alla
pagina finché l'utente non lo sposta. È il comportamento previsto dal commento
in `types/statistiche.ts` e non va aggirato.

### `app/(dashboard)/commesse/statistiche/page.tsx` (modifica)

I dati sono quasi tutti già caricati. Serve solo:

- aggiungere `periodo` alla select di `movimenti_altro_dipendente`;
- comporre e passare la prop nuova `datiCosti` (scadenze, buste, movimenti).

`datiCosti` è una prop a sé, **non** un campo di `DatiStatistiche`: è lo stesso
schema già usato da `datiAndamento`, e tiene `lib/costi-mensili.ts` libero di
importare `MESI_LABEL` da `lib/statistiche-commesse.ts` senza creare un ciclo di
import fra i due moduli.

Nessuna query nuova, nessuna colonna nuova nel database.

## Fuori perimetro

- Nessun confronto costi/ricavi: il blocco `incassi-pagamenti` lo fa già.
- Nessun confronto anno su anno: si cambia anno col selettore.
- Nessun export PDF o CSV del resoconto.
- Nessuna modifica alla semantica del blocco `uscite-categoria`.
