# Buste paga manuali e modificabili — Design

Data: 2026-08-17
Stato: approvato dall'utente, pronto per il piano di implementazione

## Obiettivo

Nel modulo Dipendenti:

1. Registrare una busta paga **a mano**, senza allegare il PDF.
2. **Modificare** una busta già registrata: importi, mese, mensilità e allegato.

Oggi l'unica strada è `/dipendenti/carica`, che estrae i dati da un PDF con l'AI, e una
busta registrata si può solo cancellare.

## Perché i vincoli contano: questi dati alimentano i grafici

`buste_paga.netto` è il **dovuto** del riepilogo crediti/debiti in `/commesse/statistiche`
(voce "Stipendi da versare", che pesa sulla posizione netta) e del saldo mostrato nel
modulo Dipendenti da `calcolaSaldoDipendente`. Due conseguenze non negoziabili:

- **Netto obbligatorio e maggiore di zero.** Una busta a zero non darebbe errore ma
  spariresse dal debito senza lasciare traccia.
- **Una sola busta per (dipendente, periodo, mensilità).** Due buste sullo stesso mese
  raddoppiano il debito nei grafici, e guardando la posizione netta non si vede.

## Cosa esiste già

`addBustaPaga(input, formData?)` accetta **già** il caso senza PDF: `uploadPdf` restituisce
`null` quando `formData` non porta un file, e `buste_paga.file_path` è nullable. Manca solo
l'interfaccia. **Nessuna migrazione necessaria.**

Il modulo ha già il precedente da imitare: `DialogPagamentoManuale`, aperto dal pulsante
"Pagamento manuale" in `DettaglioDipendente`. La busta manuale gli sta accanto.

Manca del tutto `updateBustaPaga`.

## Server — `actions/dipendenti.ts`

### `esisteBusta` guadagna `escludiId`

```ts
esisteBusta(dipendenteId, periodo, mensilita, escludiId?): Promise<boolean>
```

Con `escludiId` valorizzato la query aggiunge `.neq('id', escludiId)`. Così lo stesso
controllo anti-duplicato serve creazione e modifica, invece di essere riscritto due volte.

### `updateBustaPaga(id, input, formData?)`

Permessi e filtro per organizzazione come le sorelle: `assertAccessoDipendenti(true)` e
`.eq('organization_id', orgId)`.

Ordine delle operazioni:

1. Rileggere la busta esistente (serve `file_path` per gestire l'allegato).
2. Se `(periodo, mensilita)` cambiano, verificare con `esisteBusta(..., escludiId: id)`;
   se occupato, errore parlante e nessuna scrittura.
3. Allegato, tre casi:
   - **file nuovo** → carica, poi cancella il vecchio dallo storage
   - **flag di rimozione** → cancella il vecchio, `file_path` a null
   - **nessuno dei due** → `file_path` invariato
4. `update` dei campi e `revalidatePath('/dipendenti', 'layout')`.

Il vecchio file va cancellato: lasciarlo produce rifiuti nello storage che nessuno
ritroverà più, non essendo referenziati da nessuna riga.

## Validazione pura — `lib/dipendenti.ts`

```ts
validaBustaInput(input: { periodo: string; mensilita: string; netto: number; lordo: number | null }):
  string | null   // messaggio d'errore, oppure null se va bene
```

Regole bloccanti: netto finito e maggiore di zero; lordo, se presente, non negativo;
periodo nel formato `YYYY-MM-01`; mensilità fra quelle ammesse.

Sta in `lib/` perché è la sola parte pura e perché è lei che protegge i grafici: la
chiamano sia il dialog (per il messaggio immediato) sia le due Server Action (perché il
confine vero è il server).

```ts
avvisoBustaInput(input: { netto: number; lordo: number | null }): string | null
```

**La severità segue la conseguenza**, e le due funzioni sono separate per questo. Un netto
a zero falsa i debiti nei grafici e va rifiutato. Un lordo inferiore al netto invece non
tocca nessun calcolo — `lordo` è solo mostrato — quindi è un avviso: bloccare impedirebbe
di correggere il netto di una busta che ha già il lordo sbagliato.

Il caso non è teorico: in archivio c'è una busta così (Blay, dicembre 2025, netto 1.261,00
con lordo 1.221,80, quasi certamente una lettura sbagliata dell'estrazione automatica).
Una regola bloccante avrebbe reso quella riga impossibile da correggere.

## Interfaccia

### `components/dipendenti/DialogBustaManuale.tsx`

Un solo dialog, due modi, modellato su `DialogPagamentoManuale`.

Campi: mese (`periodo`), mensilità, netto, lordo (opzionale), PDF (opzionale).

- **Creazione** — dal pulsante "Busta manuale", accanto a "Pagamento manuale".
- **Modifica** — dall'icona matita accanto a ogni busta in elenco, precompilata.

In modifica, cambiando mese o mensilità compare un **avviso inline**: il debito si sposta
in un altro conto. È un avvertimento, non un blocco. Il blocco scatta solo sul duplicato.

Per l'allegato: se la busta ha un PDF, mostrarlo con le opzioni sostituisci e rimuovi; se
non ce l'ha, offrire il campo per allegarlo.

Attenzione al caricamento da mobile: seguire il pattern già in uso nel progetto
(`label htmlFor` + `arrayBuffer()` + Server Action), vedi `feedback_mobile_file_upload`.

### `components/dipendenti/DettaglioDipendente.tsx`

Pulsante "Busta manuale" nella barra azioni; icona matita nella riga di ogni busta,
accanto a quelle esistenti di apertura file ed eliminazione.

## Test — `lib/dipendenti.test.ts`

Il file non esiste: va creato. Copre `validaBustaInput`:

- netto zero, negativo, `NaN` → errore
- netto valido → nessun errore
- lordo assente → ammesso
- lordo negativo → errore
- lordo inferiore al netto → errore
- periodo malformato (`'2026-08'`, `'2026-08-15'`, stringa vuota) → errore
- mensilità non ammessa → errore
- caso completo valido → `null`

## Fuori ambito

- Nessuna migrazione del database
- Nessuna modifica all'estrazione AI né alla pagina `/dipendenti/carica`
- I pagamenti restano come sono: hanno già l'inserimento manuale
- Nessun ricalcolo dei grafici: leggono `buste_paga` e si aggiornano da soli
