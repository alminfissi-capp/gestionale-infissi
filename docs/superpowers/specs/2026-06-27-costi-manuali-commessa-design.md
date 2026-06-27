# Costi manuali su commesse con preventivo manuale — Design

Data: 2026-06-27
Stato: approvato dall'utente, pronto per il piano di implementazione

## Obiettivo

Permettere di inserire manualmente, su una commessa con preventivo **manuale** (caricato a
mano, non leggibile dal sistema), i costi stimati: **Materiale**, **Manodopera (posa)** e
**Utile**. Questi valori confluiscono nel grafico "Costi e utili stimati" della pagina
statistiche, sommandosi agli eventuali costi calcolati dai preventivi interni della stessa
commessa.

## Database

3 colonne nullable su `commesse` (migration `20260627xxxxxx_commesse_costi_manuali.sql`):
- `costo_materiali_manuale numeric` (null = non compilato)
- `costo_manodopera_manuale numeric`
- `utile_manuale numeric`

Tutte nullable, nessun default → "non compilato" resta distinguibile ma nel calcolo vale 0.

## UI — DialogCommessa (creazione e modifica)

- Quando la lista preventivi collegati contiene **almeno un preventivo di tipo 'manuale'**,
  compare una sezione **"Costi preventivo manuale (per statistiche)"** con 3 input numerici
  opzionali: Materiale (€), M. opera (€), Utile (€).
- I campi possono restare vuoti.
- I valori si salvano con la commessa (create e update) e sono modificabili riaprendo la
  scheda di una commessa esistente.
- La comparsa dei campi è legata alla presenza di un preventivo manuale; i valori già salvati
  restano in DB anche se la sezione non è visibile.

## Tipi e actions

- `types/commessa.ts`: aggiungere i 3 campi a `Commessa`, `CommessaCompleta`, `CommessaInput`.
- `actions/commesse.ts`: `createCommessa` e `updateCommessa` persistono i 3 campi;
  `getCommesse` / `getCommessa` li leggono.
- `DialogCommessa.tsx`: `emptyForm` include i 3 campi (null); reset in modifica li popola dalla
  commessa; submit li invia.

## Grafico costi/utili (pagina statistiche)

- In `app/(dashboard)/commesse/statistiche/page.tsx`, il contributo di ogni commessa diventa:
  - costi di **sistema** = somma dei preventivi interni collegati (logica attuale), **più**
  - valori **manuali** della commessa (`costo_materiali_manuale`, `costo_manodopera_manuale`,
    `utile_manuale`), trattati come 0 se null.
- `costiCommesse` include una riga per ogni commessa che ha **almeno un contributo** (interno
  o manuale).
- Query commesse aggiornata per leggere anche i 3 campi manuali.

## Contatore commesse escluse

- `contaCommesseSenzaPreventivo` resta invariata (conta le commesse del blocco non presenti in
  `costiCommesse`): ora una commessa con soli valori manuali NON è più esclusa.
- Etichetta aggiornata in `StatisticheCommesse.tsx`: "{n} commesse del blocco senza preventivo
  interno né costi manuali — escluse dalla stima".

## Casi limite

- Campi vuoti/null → 0, nessun contributo.
- Commessa con sistema + manuale → somma di entrambi (additivo).
- Valori manuali salvati ma preventivo manuale poi rimosso → i valori restano in DB e contano
  comunque nel grafico (la visibilità nel dialog è solo un aiuto UI).

## Fuori scope (YAGNI)

- Validazioni di coerenza tra utile manuale e totale commessa.
- Campi manuali per-preventivo (si è scelto: una terna per commessa).
