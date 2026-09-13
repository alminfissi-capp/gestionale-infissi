# Commessa inesigibile — il credito che non sarà incassato

Data: 2026-09-13
Stato: approvato, da implementare

## Obiettivo

Marcare una commessa già consegnata il cui saldo non verrà mai incassato, in modo
che i costi sostenuti restino contati ma il credito e l'utile spariscano dai
conti dell'azienda.

Caso reale che ha originato la richiesta: commessa consegnata, cliente che non
pagherà. I materiali e la manodopera sono stati spesi davvero; il margine
previsto no, e quel residuo non è un credito da incassare.

## Forma: una spunta, non un decimo stato

`inesigibile` è una **colonna booleana** su `commesse`, accanto allo stato, non
un valore nuovo di `StatoCommessa`.

Scelta deliberata, contro l'alternativa del decimo stato:

- conserva l'informazione che la commessa è "Consegnato": lo stato di lavorazione
  e l'esigibilità del credito sono due fatti diversi e indipendenti;
- **non tocca il `CHECK` su `commesse.stato`**, che elenca i nove stati ammessi.
  Aggiungere un valore lì avrebbe richiesto di riscrivere il vincolo, e un
  vincolo violato si manifesta come l'errore generico "Server Components render"
  (vedi `gotcha_vincoli_db_sconti`).

Il prezzo accettato: ogni lettura che ragiona sui crediti deve guardare anche la
spunta, non solo lo stato. I punti sono cinque, elencati sotto.

La spunta è disponibile su qualsiasi stato. Non ci sono incroci vietati: su una
commessa senza residuo la spunta semplicemente non cambia nessun numero.

## Cosa cambia nei numeri

Esempio di riferimento: totale € 18.400, acconti incassati € 5.000, residuo
€ 13.400.

| Blocco | Senza spunta | Con spunta |
|---|---|---|
| Crediti e debiti → Da commesse | +13.400 | 0 |
| Andamento crediti e debiti (storico) | +13.400 sulla linea crediti | fuori dalla linea |
| Costi e utili stimati | materiali, posa, spese, utile | costi contati, **utile 0** |
| Resoconto per cliente | saldo 13.400 | **saldo 0**; fatturato e incassato restano |
| Andamento commesse | 18.400 | 18.400, invariato |
| Flusso di cassa, Uscite per categoria, Resoconto mensile costi | — | invariati |

Due principi che spiegano l'intera tabella:

1. **Quello che è entrato resta entrato.** I € 5.000 già incassati contano
   ovunque come prima. Sparisce solo il residuo che non entrerà.
2. **Quello che è successo resta successo.** Il lavoro è stato prodotto,
   consegnato e fatturato: l'Andamento commesse lo conta a pieno, e i costi
   sostenuti restano nei costi. Cancellarli lascerebbe una spesa senza il ricavo
   che la giustificava e falserebbe lo storico.

I blocchi che leggono soldi realmente mossi (flusso di cassa, uscite per
categoria, resoconto mensile costi) non cambiano di una virgola: lì dentro non
c'è mai stato niente di questa commessa oltre agli acconti veri.

### Precisazione sullo storico

Nel grafico "Andamento crediti e debiti" la commessa esce dalla linea dei crediti
**per tutta la serie**, non dal giorno in cui viene spuntata.

È coerente con il comportamento già dichiarato di `lib/andamento-crediti-debiti.ts`,
che nel suo commento di testa avverte di usare lo stato **attuale** della
commessa e non quello che aveva a quella data, perché la storia degli stati non
viene conservata. La spunta si comporta come lo stato.

Avere la data esatta richiederebbe una colonna `inesigibile_at` e la
ricostruzione del momento del passaggio: fuori perimetro, non vale il prezzo.

## Interfaccia

Nella colonna **Stato** di `components/commesse/TabellaCommesse.tsx`, sotto la
tendina esistente, una spunta con etichetta `inesigibile`.

Quando è attiva:
- la riga diventa `bg-violet-50` e **questo colore vince** su quello dello stato
  (la funzione del colore riga controlla la spunta prima dello `switch` sullo
  stato);
- la spunta resta visibile e ri-cliccabile, così l'operazione è reversibile.

Il salvataggio passa da una Server Action nuova `toggleInesigibile`, modellata su
`toggleCalcoli` che già esiste in `actions/commesse.ts`.

## Struttura del codice

### Migrazione `supabase/migrations/20260913100000_commesse_inesigibile.sql`

```sql
ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS inesigibile BOOLEAN NOT NULL DEFAULT false;
```

Le commesse esistenti diventano tutte `false` e si comportano esattamente come
adesso. Nessun vincolo da riscrivere, nessun dato da migrare.

### `types/commessa.ts`

Campo `inesigibile: boolean` su `Commessa`.

### `actions/commesse.ts`

`toggleInesigibile(id: string, valore: boolean)`, filtrata per `organization_id`
come tutte le altre, con la `revalidatePath` che usano le azioni vicine.

Le letture dell'elenco usano `select('*')` e prendono la colonna da sole.

### `lib/statistiche-commesse.ts` — tre punti

Il flag viaggia come campo **opzionale** su `StatRow` e `CostoCommessaRow`
(`inesigibile?: boolean`), così le chiamate che non lo passano continuano a
comportarsi come prima.

1. `riepilogoCreditiDebiti` — una commessa inesigibile non contribuisce né a
   `creditiCommesse` né alla riga per stato del dettaglio.
2. `aggregaCostiUtiliMese` — di una riga inesigibile si sommano `materiali`,
   `posa` e `spese`; `utile` no.
3. `resocontoCliente` — il saldo del blocco si calcola al netto del residuo
   positivo delle commesse inesigibili: `fatturato` e `incassato` restano pieni.
   Solo il residuo positivo viene escluso, coerente con il floor a zero già
   applicato in `riepilogoCreditiDebiti`.

### `lib/andamento-crediti-debiti.ts` — un punto

`CommessaAndamento` prende `inesigibile?: boolean`; nel ciclo che somma i crediti
a una certa data, una commessa inesigibile viene saltata come se il suo stato non
fosse fra gli `STATI_CREDITO`.

### `app/(dashboard)/commesse/statistiche/page.tsx`

Aggiunge `inesigibile` alla select esplicita delle commesse e lo porta dentro
`StatRow`, `CostoCommessaRow` e `datiAndamento.commesse`.

### Cosa NON va toccato, e perché

La superficie è stata verificata: `STATI_CREDITO` è usato in due soli punti
(`riepilogoCreditiDebiti` e il ciclo dei crediti di `andamentoCreditiDebiti`), e
le tre funzioni da modificare sono usate esclusivamente dai componenti della
pagina statistiche. `ResocontoCliente.tsx` riceve lo stesso array `StatRow` di
`StatisticheCommesse`, quindi il campo nuovo lo raggiunge senza passaggi in più.

**Produzione e Calendario non cambiano.** `STATI_COMMESSA_PRODUZIONE` contiene
solo `da_iniziare`, `in_lavorazione`, `da_consegnare` e
`parzialmente_consegnato`: una commessa consegnata è già fuori da quelle viste, e
una commessa ancora in lavorazione marcata inesigibile deve restare in
produzione, perché il lavoro va comunque finito. La spunta riguarda i soldi, non
la fabbrica.

## Test

I quattro punti di logica stanno in funzioni pure già coperte da test. Casi nuovi
da aggiungere:

- una commessa inesigibile con residuo non entra in `creditiCommesse`;
- non compare nemmeno nel dettaglio per stato;
- una commessa **non** inesigibile nello stesso stato continua a contare
  (la spunta non deve spegnere l'intero stato);
- `aggregaCostiUtiliMese`: i costi di una riga inesigibile si sommano, l'utile no;
- `resocontoCliente`: fatturato e incassato pieni, saldo azzerato;
- `resocontoCliente`: un cliente con una commessa inesigibile e una normale tiene
  il saldo della sola normale;
- `andamentoCreditiDebiti`: la commessa inesigibile non compare nella linea dei
  crediti in nessun punto della serie.

## Fuori perimetro

- Nessuna colonna `inesigibile_at` e nessuna ricostruzione storica del momento
  del passaggio.
- Nessuna scrittura contabile di "perdita su crediti": il gestionale non tiene la
  partita doppia.
- Nessun cambiamento ai blocchi di cassa (flusso, uscite per categoria, resoconto
  mensile costi).
- Nessun filtro nuovo negli elenchi: le commesse inesigibili restano dove sono,
  riconoscibili dal colore.
