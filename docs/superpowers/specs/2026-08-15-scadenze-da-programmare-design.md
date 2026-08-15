# Scadenze da programmare — design

Data: 2026-08-15

## Problema

Alcune scadenze si conoscono come importo e fornitore, ma non hanno ancora una
data di pagamento. Oggi finiscono in un blocco chiamato "altre scadenze" che è
un normale blocco anno: mostra i 12 mesi e obbliga a inventare una data pur di
inserire la riga. Serve invece un contenitore senza mesi, dove la scadenza resta
in attesa finché non viene effettivamente pagata.

## Regola di fondo

**Scadenza senza data = scadenza da programmare.**

`scadenze.data_scadenza` diventa facoltativa. Non serve nessun altro flag: la
sola assenza della data dice tutto, in ogni punto del programma.

## Contenitore

Un **blocco di sistema** `gruppi_commesse.tipo = 'da_programmare'`, uno solo per
organizzazione:

- creato dal sistema alla prima apertura di `/commesse` (get-or-create);
- unicità garantita da un indice unico parziale sul database, non solo dall'interfaccia;
- non rinominabile, non eliminabile, non creabile a mano dal dialog "Nuovo blocco";
- compare in testa alla sezione Scadenze dell'elenco blocchi, con aspetto diverso
  dalle schede degli anni (icona e colore propri, nessun menù ⋮).

Le righe restano nella tabella `scadenze`: cambia solo il blocco che le contiene
e il fatto che `data_scadenza` sia `NULL`.

## Vista del blocco

`ScadenzeDaProgrammareView`: elenco piatto, niente fisarmonica dei mesi.

- righe identiche a quelle degli anni (categoria colorata, allegato con lettura
  automatica di assegni e bonifici, importo, stella Calcoli, menù azioni,
  annullamento), meno la colonna del giorno;
- riordino manuale per trascinamento su tutto l'elenco (non più vincolato al mese);
- riepilogo in alto: quante scadenze in attesa e totale;
- una riga che ha già una data ma non è ancora pagata mostra la data come
  promemoria grigio ("prevista il …").

Non compaiono le voci "Copia al mese successivo", "Genera piano rate" e "Ripeti
su più mesi": contano i mesi a partire da una data che qui può non esserci.

## Uscita dal limbo

Serve **data + spunta "Già pagata"**. Due strade, stesso risultato:

- menù ⋮ → Modifica: si compila la data, si spunta "Già pagata", si salva;
- cerchietto verde della riga: apre la stessa scheda con la data di oggi già
  precompilata e "Già pagata" già spuntata (nel limbo il cerchietto non fa da
  interruttore, perché senza data la spunta non avrebbe dove collocare la riga).

Al salvataggio la scadenza si sposta nel blocco dell'anno di quella data — creato
se non esiste, con la stessa funzione già usata dai piani rate — e finisce in
coda al mese corrispondente. Porta con sé allegato, conto, categoria, importo,
numero di rata.

Data senza spunta "pagata": la riga resta nel limbo con la data segnata.

## Percorso inverso

Nel menù ⋮ di una riga dentro un mese: **"Sposta in Da programmare"**. La data
viene azzerata, `pagato` torna a `false`, la riga passa al blocco di sistema
conservando tutto il resto. È anche il modo per svuotare l'attuale blocco "altre
scadenze" riga per riga e poi eliminarlo.

## Effetti sul resto del programma

| Punto | Comportamento |
|---|---|
| Scheda blocco in `/commesse` | Card dedicata: numero di scadenze in attesa e totale; nessun "saldato". |
| Calcoli (stella) | Attiva anche nel limbo. Le righe senza data entrano nelle uscite previste, con l'etichetta "da programmare" al posto della data, ordinate in fondo. |
| Statistiche | Escluse: i grafici ragionano per mese e anno. Senza data non hanno collocazione. |
| Scheda di stampa | Al posto della data stampa "Da programmare". |
| `copiaScadenzaRate` | Rifiuta un'origine senza data con un messaggio chiaro. |

## Struttura del codice

`ScadenzeView.tsx` è a 1034 righe e contiene riga, caricamento allegati,
anteprime e dialoghi. Duplicarlo per la vista piatta significherebbe mantenere
due copie destinate a divergere. Si estrae quindi la parte condivisa:

- `components/commesse/RigaScadenza.tsx` — la riga trascinabile, con la colonna
  del giorno e le voci di copia condizionate a una prop;
- `hooks/useScadenzeRighe.ts` — stato locale sincronizzato col server, URL firmati
  degli allegati, caricamento file con OCR/parsing, spunte pagato/Calcoli/annullata,
  eliminazione, copia;
- `ScadenzeView.tsx` — resta il raggruppamento per mese, la fisarmonica e i totali;
- `ScadenzeDaProgrammareView.tsx` — elenco piatto e totali del limbo.

Riordino contenuto e mirato: nessun refactoring che esca da questo perimetro.

## Database

```sql
ALTER TABLE scadenze ALTER COLUMN data_scadenza DROP NOT NULL;

CREATE UNIQUE INDEX gruppi_commesse_da_programmare_unico
  ON gruppi_commesse (organization_id)
  WHERE tipo = 'da_programmare';
```

## Tipi

- `TipoBlocco = 'commesse' | 'scadenze' | 'da_programmare'`
- `Scadenza.data_scadenza: string | null`
- `ScadenzaInput.data_scadenza: string | null`

Il compilatore segnala così ogni punto che oggi dà la data per scontata.

## Azioni nuove

- `getGruppoDaProgrammare()` — get-or-create del blocco di sistema.
- `programmaScadenza(id, input)` — salva e, se ci sono data e spunta "pagata",
  ricolloca la riga nel blocco dell'anno.
- `spostaInDaProgrammare(id)` — percorso inverso.

`createScadenza` applica la stessa regola in creazione: una riga nata nel limbo
già datata e già pagata viene inserita direttamente nel blocco dell'anno.
