# Fidi bancari e anticipi fattura — Design

Data: 2026-08-27
Stato: implementato e in produzione

> **Aggiornamento dello stesso giorno, dopo il rilascio.** Un anticipo può coprire **più
> commesse**: capita spesso di emettere una sola fattura per più lavori. Il legame è passato
> da `anticipi_fattura.commessa_id` (colonna singola, poi travasata ed eliminata) alla
> tabella `anticipi_commesse`, molti-a-molti. L'importo **non** si spezza fra le commesse —
> la banca anticipa la fattura, non il singolo lavoro — quindi le commesse collegate servono
> solo a sommare quanto il cliente deve ancora. Il promemoria "il cliente ha saldato" si
> accende **solo quando tutte** le commesse collegate sono note e insieme non devono più
> nulla. Dove qui sotto si legge "la commessa collegata" al singolare, vale ora il plurale.
>
> **Secondo aggiornamento, stesso giorno: rientri parziali.** Gli acconti che la banca
> trattiene per rientrare si spuntano a mano nel dialog dell'anticipo (tabella
> `anticipi_acconti`, un acconto su un solo anticipo) e **scalano il debito**: quello che
> pesa sui debiti e occupa il plafond è `daRestituire = max(0, importo − scalato)`, non
> l'erogato. Di conseguenza **il promemoria giallo ha cambiato significato**: si accende
> quando non resta niente da restituire, non più quando il cliente ha saldato le commesse.
> Quel vecchio segnale era fuorviante — se la banca non ha trattenuto gli acconti, alla
> banca si deve ancora tutto. Il residuo delle commesse resta mostrato, ma come
> informazione, non come invito a chiudere.

## Obiettivo

Far entrare nei conti dell'azienda l'esposizione verso le banche, che oggi non esiste da
nessuna parte nel software:

1. **Fido di cassa sul conto corrente** — il conto va in rosso fino al limite accordato.
2. **Anticipi fattura** — la banca anticipa una fattura: soldi già incassati che vanno
   restituiti, mentre il credito verso il cliente resta in piedi.

L'utilizzato di entrambi va sommato ai **Debiti da pagare** in `/commesse/statistiche` ed
entra nella **posizione netta**. Nei **Calcoli** la Liquidità corrente resta il numero che
è oggi, ma dice quanta parte è soldi propri e quanta è banca.

## Le due convenzioni d'inserimento, opposte e volute

Non è un'incoerenza: nei due casi si hanno in mano dati diversi.

**Conto corrente — si scrive il disponibile, l'utilizzato si ricava.** Del conto non si
conoscono i movimenti, si conosce il numero che l'home banking mostra: la disponibilità
residua. Che poi è quella che serve per decidere cosa pagare.

```
fido accordato 40.000, disponibilità 10.000  →  utilizzato = 30.000
```

**Anticipi fattura — si scrivono i singoli anticipi, utilizzato e disponibile si ricavano.**
Qui il dettaglio esiste: ogni anticipo ha una commessa, un importo, una data di erogazione e
una scadenza. Della linea si inserisce solo il plafond accordato.

```
utilizzato  = Σ importi degli anticipi non ancora rimborsati
disponibile = max(0, plafond − utilizzato)
```

Formule comuni, da accordato `A` e disponibile `D`:

```
utilizzato   = max(0, A − D)
soldi propri = max(0, D − A)     // solo sui conti: quanto avanza oltre il fido
fido residuo = min(D, A)
```

Il `max(0, …)` è il **floor per singola entità** già adottato per i crediti da commessa e
per i conti dipendenti: un conto in attivo non deve mascherare il rosso su un altro.

**Il caso che rende la migrazione innocua:** un conto senza fido ha `accordato = 0`, quindi
`utilizzato = 0` e tutta la disponibilità è liquidità propria. `0` è il default della
colonna nuova, perciò il giorno del deploy nessun numero si muove: la funzionalità si
accende conto per conto, man mano che i fidi vengono compilati.

## Credito e debito convivono: è corretto così

Il cliente deve 20.000, la banca ne ha anticipati 15.000. I tre numeri restano indipendenti
e nessuno compensa l'altro:

| Numero | Dove sta | Come ci arriva |
|---|---|---|
| 15.000 di disponibilità | Liquidità corrente nei Calcoli | l'utente aggiorna a mano il conto all'accredito |
| 15.000 di debito | riga "Banche" nei Debiti | `Σ anticipi aperti` |
| 20.000 di credito | riga "Da commesse" nei Crediti | `totale − acconti`, come già oggi |

**Scelta voluta, da non "correggere" in futuro:** l'utilizzato dell'anticipo convive con il
credito della stessa fattura, che sta già in "Da commesse". Non è un doppio conteggio
sbagliato — i soldi dalla banca sono già stati incassati e vanno restituiti — ma rende la
posizione netta più severa su ogni fattura anticipata. L'utente l'ha scelto sapendolo: la
banca può rientrare quando vuole, quindi il netto deve dirlo.

Accanto a ogni anticipo si mostra il residuo della commessa collegata, per leggere a colpo
d'occhio quanto il cliente deve ancora saldare rispetto a quanto si deve alla banca.

## Modello dati

### `conti_correnti` — una colonna in più

```sql
ALTER TABLE conti_correnti ADD COLUMN fido_accordato numeric NOT NULL DEFAULT 0;
```

`saldo_attuale` **non cambia nome e non cambia significato**: contiene già la disponibilità
col fido dentro, che è quello che l'utente ci scrive. Cambia solo l'etichetta
nell'interfaccia, da "Saldo" a "Disponibilità", in `FormConti.tsx` e in `TabellaCalcoli.tsx`.
Rinominare la colonna vorrebbe dire toccare `actions/conti.ts`, `types/commessa.ts`,
`FormConti`, `TabellaCalcoli` e `DialogScadenza` per zero vantaggio funzionale.

### `linee_credito` — il plafond, e basta

```sql
CREATE TABLE linee_credito (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  tipo             text        NOT NULL DEFAULT 'anticipo_fatture',
  accordato        numeric     NOT NULL DEFAULT 0,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE linee_credito ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON linee_credito
  FOR ALL USING (organization_id = get_user_organization_id());
CREATE INDEX linee_credito_org_idx ON linee_credito (organization_id);
```

Nessuna colonna `disponibile`: sarebbe un secondo modo di dire la stessa cosa e prima o poi
i due numeri litigherebbero. **L'utilizzato di una linea viene sempre e solo dagli anticipi**
— regola unica, nessuna doppia modalità da ricordare. Una linea di cui non si vuole il
dettaglio si registra con un anticipo unico e cumulativo, senza commessa.

`tipo` è `text` senza vincolo DB, come `CategoriaScadenza`: le etichette stanno in un
`Record<TipoLineaCredito, string>` in `types/commessa.ts`, così il compilatore segnala ogni
punto da completare quando la lista cresce. Valori: `anticipo_fatture`, `sbf`,
`castelletto`, `altro`.

### `anticipi_fattura` — i singoli anticipi

```sql
CREATE TABLE anticipi_fattura (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linea_id         uuid        NOT NULL REFERENCES linee_credito(id) ON DELETE CASCADE,
  commessa_id      uuid        REFERENCES commesse(id) ON DELETE SET NULL,
  descrizione      text        NOT NULL DEFAULT '',
  importo          numeric     NOT NULL DEFAULT 0,
  data_erogazione  date,
  data_scadenza    date,
  rimborsato       boolean     NOT NULL DEFAULT false,
  rimborsato_at    date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE anticipi_fattura ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON anticipi_fattura
  FOR ALL USING (organization_id = get_user_organization_id());
CREATE INDEX anticipi_fattura_org_idx ON anticipi_fattura (organization_id);
CREATE INDEX anticipi_fattura_linea_idx ON anticipi_fattura (linea_id);
```

`commessa_id` è **facoltativo** e con `ON DELETE SET NULL`: non tutte le fatture nascono da
una commessa registrata (vedi `gotcha_clienti_anagrafica`), e la cancellazione di una
commessa non deve portarsi via il debito verso la banca, che resta comunque dovuto. Quando
manca il collegamento vale la `descrizione` libera.

### Perché tabelle separate e non colonne su `conti_correnti`

A `conti_correnti` puntano `scadenze.conto_id`, il selettore del `DialogScadenza`,
`ScadenzeView`, `ScadenzeDaProgrammareView` e la somma della Liquidità corrente nei Calcoli.
Infilare lì le linee con una colonna `tipo` obbligherebbe a filtrare in cinque posti, e ogni
punto dimenticato farebbe entrare il plafond nella cassa spendibile — l'esatto contrario
della scelta presa. Con tabelle separate non c'è nessun filtro da ricordare, e vale la
regola già scritta in `gotcha_blocchi_commesse_tipo`: filtrare in positivo, mai escludendo
per nome.

## L'anticipo non genera una scadenza

Scelta esplicita dell'utente. L'anticipo tiene la propria `data_scadenza` dentro il blocco
"Fidi e anticipi" e **non crea nessuna riga in `scadenze`**: il debito viene contato una
volta sola, nella riga "Banche".

Il prezzo, accettato consapevolmente: gli anticipi non compaiono nello scadenzario, nel
calendario, né nel grafico incassi/pagamenti mensile. Chi in futuro volesse portarceli deve
**spostare** il conteggio, non aggiungerlo, altrimenti ogni anticipo pesa doppio sui debiti.

## L'anticipo non è un costo

Restituire un anticipo non impoverisce l'azienda: quei soldi erano già suoi, la banca li ha
solo passati prima. È un'operazione finanziaria, non un'uscita di gestione.

Conseguenza pratica: gli anticipi **non entrano mai** in `aggregaUscitePerCategoria`, nel
grafico a torta delle uscite, nell'analisi costi/utili né nel margine di commessa. Oggi ci
restano fuori da soli, perché non generano righe in `scadenze` — ma è un effetto collaterale
della struttura, non una regola scritta, quindi eccola scritta: se un domani gli anticipi
arrivassero nello scadenzario, dovrebbero comunque restare fuori dai costi.

Gli **interessi e le commissioni** dell'anticipo, quelli sì che sono un costo. Restano fuori
da questo lavoro: si vedranno più avanti, quando saranno chiare le condizioni applicate
dalla banca. Nel frattempo continuano a essere registrati come scadenze, com'è già oggi.

## Chiusura dell'anticipo: a mano, col suggerimento

`rimborsato` si spunta a mano, come `scadenze.pagato`. Il software non chiude mai da solo:
un cliente che paga a rate o in ritardo farebbe sparire il debito verso la banca prima del
dovuto.

Quando però la commessa collegata risulta saldata (residuo ≤ 0) l'anticipo si evidenzia con
la scritta *"il cliente ha saldato, la banca dovrebbe essere rientrata"*. È un promemoria,
non un'azione: finché non si spunta, l'anticipo resta nei debiti e occupa il plafond.

## Logica pura — `lib/banche.ts`

File nuovo, nessuna dipendenza React né Supabase, sul modello di `lib/statistiche-commesse.ts`.

```ts
export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export type ContoBancaRow = { id: string; nome: string; disponibile: number; accordato: number }
export type LineaCreditoRow = { id: string; nome: string; tipo: TipoLineaCredito; accordato: number }

export type AnticipoRow = {
  id: string
  linea_id: string
  commessa_id: string | null
  descrizione: string
  importo: number
  data_scadenza: string | null   // 'YYYY-MM-DD'
  rimborsato: boolean
}

// Quello che la pagina sa delle commesse collegate. Chiave = commessa_id.
// Una chiave mancante non è un errore: l'anticipo si mostra senza residuo.
export type InfoCommessa = { etichetta: string; residuo: number }

export type AnticipoCalcolato = AnticipoRow & {
  etichettaCommessa: string | null   // "C-2026-014 — Rossi"
  residuoCommessa: number | null     // null se la commessa non è fra quelle note
  scaduto: boolean                   // !rimborsato && data_scadenza < oggi
  daChiudere: boolean                // !rimborsato && residuoCommessa !== null && residuoCommessa <= 0
}

export type UtilizzoBanca = {
  id: string
  nome: string
  accordato: number
  disponibile: number
  utilizzato: number
  residuo: number
  anticipi: AnticipoCalcolato[]      // vuoto per i conti correnti
}

export type RiepilogoBanche = {
  conti: UtilizzoBanca[]        // quelli con un fido accordato o con uno scoperto in corso
  linee: UtilizzoBanca[]
  liquiditaPropria: number      // Σ max(0, disponibile − accordato) sui conti
  fidoCassaUtilizzato: number
  lineeUtilizzato: number
  utilizzatoTotale: number      // fidoCassaUtilizzato + lineeUtilizzato
  residuoTotale: number         // margine ancora disponibile, conti + linee
  anticipiScaduti: number       // quanti anticipi aperti hanno superato la data
  anticipiDaChiudere: number    // quanti hanno la commessa già saldata
}

export function riepilogoBanche(
  conti: ContoBancaRow[],
  linee: LineaCreditoRow[],
  anticipi: AnticipoRow[],
  commesse: Record<string, InfoCommessa>,
  oggi: string,                 // 'YYYY-MM-DD', calcolato nel Server Component
): RiepilogoBanche
```

`oggi` arriva come stringa dal Server Component con
`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' })`: le funzioni pure non chiamano
`new Date()`, altrimenti i test non sono riproducibili e il confine dello "scaduto" salta di
un giorno fra server UTC e ora italiana. È la stessa regola già in vigore in
`riepilogoCreditiDebiti`.

Restano fuori dagli array di dettaglio solo i conti che non hanno niente da dire: né un fido
accordato né uno scoperto in corso. La loro disponibilità entra comunque tutta in
`liquiditaPropria`. **Un conto senza fido ma in rosso ci deve stare**: altrimenti il suo
scoperto finisce nel totale senza una riga che lo spieghi, e salta l'invariante "le righe
del dettaglio sommano sempre al totale". C'è un test apposta che lo difende. Gli anticipi
rimborsati non entrano mai in `utilizzato`, e nemmeno negli array di dettaglio: lo storico si
consulta nel blocco Calcoli con un interruttore "mostra i rimborsati", non passa da qui.

### Test — `lib/banche.test.ts` (Vitest, già in progetto)

Conti:
- conto in rosso: `A=40.000, D=10.000` → utilizzato 30.000, propria 0, residuo 10.000
- conto in attivo oltre il fido: `A=40.000, D=45.000` → utilizzato 0, propria 5.000
- **conto senza fido: `A=0, D=5.000`** → utilizzato 0, propria 5.000, fuori dal dettaglio
- più conti insieme, uno in rosso e uno in attivo: il floor per entità impedisce la
  compensazione

Linee e anticipi:
- plafond 100.000 con anticipi 15.000 + 20.000 aperti → utilizzato 35.000, disponibile 65.000
- un anticipo rimborsato non conta e libera il plafond
- anticipi oltre il plafond: `disponibile = 0`, mai negativo
- linea senza anticipi → utilizzato 0, disponibile = plafond
- anticipo con `commessa_id` sconosciuto → `residuoCommessa` null, `daChiudere` false
- anticipo con commessa a residuo 0 → `daChiudere` true, ma **resta nell'utilizzato**
- anticipo con `data_scadenza` di ieri → `scaduto` true; con quella di oggi → false
- anticipo rimborsato e scaduto insieme → né `scaduto` né `daChiudere`: è chiuso
- liste vuote → tutti zeri, nessuna eccezione

## Statistiche — `/commesse/statistiche`

### Query nella page

Il Server Component carica tre sorgenti in più dentro il `Promise.all` già presente:
`conti_correnti` (`id, nome, saldo_attuale, fido_accordato, ordine`), `linee_credito` e
`anticipi_fattura`. Il `Record<string, InfoCommessa>` si costruisce lì, dalle `commesse` e
dagli `acconti` che la pagina carica già: `residuo = totale − Σ acconti`, con lo stesso
floor a zero del resto del riquadro.

### `riepilogoCreditiDebiti`

Prende un parametro in più, `banche: RiepilogoBanche` — l'oggetto già calcolato da
`riepilogoBanche`, non le righe grezze: le due funzioni restano indipendenti e testabili da
sole, e il dettaglio conserva la distinzione fra conti e linee, che serve alla tendina.
Aggiunge al `RiepilogoFinanziario`:

```ts
debitiBanche: number              // banche.utilizzatoTotale
debitiPerBanca: {                 // dettaglio: le righe sommano sempre a debitiBanche
  conti: UtilizzoBanca[]          // solo quelli con utilizzato > 0
  linee: UtilizzoBanca[]
}
residuoFidi: number               // banche.residuoTotale, testo di servizio
```

`debitiBanche` entra in `debitiTotali` **e in `posizioneNetta`**, accanto a scadute,
scadenze dell'anno, da programmare e stipendi arretrati.

### Interfaccia

Nel riquadro "Debiti da pagare" una riga nuova **"Banche (fido utilizzato)"**, con la tendina
che si apre sul dettaglio: prima i conti col fido di cassa, poi le linee, e sotto ogni linea
i suoi anticipi aperti con commessa, importo e scadenza. Stesso schema di "Da commesse":
`useState` per l'apertura, default chiuso, righe che sommano sempre al totale, righe a zero
mai mostrate. Sotto, come testo piccolo, *"margine ancora disponibile: €X"*.

Se `debitiBanche` è 0 la riga non compare, come già fanno `debitiScaduti` e
`debitiDaProgrammare`.

## Calcoli — `/commesse/calcoli`

**La Liquidità corrente non cambia numero.** Resta la somma delle disponibilità più le
righe libere, perché è quello che si può davvero pagare: è la ragione per cui l'utente
scrive il disponibile invece dell'utilizzato. Sotto al totale compare la scomposizione:

> di cui €30.000 di fido bancario — soldi tuoi: €X

dove `soldi tuoi = Liquidità corrente − fidoCassaUtilizzato`. Le righe libere delle Giacenze
(contanti, altre disponibilità) stanno fra i soldi propri: non hanno un fido dietro. Non si
usa `liquiditaPropria` da sola, che guarda solo i conti correnti e ignorerebbe le righe.

**Blocco nuovo "Fidi e anticipi"**, sotto Giacenze, ed è qui che si lavora tutti i giorni:

- una riga per linea con nome, plafond, utilizzato, residuo;
- sotto, gli anticipi aperti: commessa (numero + cliente), importo, scadenza, residuo della
  commessa, spunta "rimborsato";
- gli anticipi scaduti in rosso, quelli `daChiudere` in ambra con il promemoria;
- un pulsante per aggiungere un anticipo (dialog: linea, commessa da elenco, importo, data
  erogazione, scadenza, descrizione);
- un interruttore "mostra i rimborsati", spento di default.

Tutto questo blocco **resta fuori dal totale della Liquidità corrente**: il residuo di un
plafond non è cassa, lo diventa solo presentando fatture. Scelta esplicita dell'utente.

I conti correnti restano dove sono, nel blocco Giacenze, con la sola etichetta cambiata in
"Disponibilità" e il fido residuo mostrato accanto quando `fido_accordato > 0`.

Per il residuo delle commesse collegate serve una query dedicata: la pagina Calcoli carica
solo le commesse selezionate per i Calcoli, non tutte. Va aggiunta un'action
`getCommessePerAnticipo()` che restituisce `OpzioneCommessa[]` (id, etichetta, residuo)
leggendo `commesse` e `acconti_commessa`. Serve a due cose insieme — l'elenco del dialog e
il residuo mostrato accanto all'anticipo — così la formula del residuo resta in un posto solo.

**Le commesse `in_attesa` restano selezionabili**, a differenza di quanto fanno le
statistiche, che le escludono da ogni calcolo. Non è una dimenticanza: il debito verso la
banca esiste comunque, e la ricerca di etichetta e residuo comprende di proposito anche le
commesse in attesa, altrimenti un anticipo collegato a una di esse perderebbe il nome e non
sarebbe più ricollegabile. Chi in futuro volesse filtrarle deve tenere presente che il
filtro va messo solo sull'elenco del dialog, mai sulla ricerca.

## Impostazioni — `/impostazioni`

- `FormConti.tsx`: campo **"Fido accordato"** accanto a nome e disponibilità, sia in
  modifica sia in creazione. `ContoCorrenteInput` guadagna `fido_accordato`.
- `FormLineeCredito.tsx` (nuovo): nome, tipo, plafond accordato. Stessa forma di
  `FormConti` — elenco con salvataggio inline su blur, riga in fondo per aggiungerne una,
  eliminazione con conferma. **La cancellazione di una linea porta via i suoi anticipi**
  (`ON DELETE CASCADE`): la conferma deve dirlo e mostrare quanti sono.

Il plafond sta qui perché cambia una volta l'anno; gli anticipi si inseriscono dai Calcoli
perché si muovono ogni settimana. Le due cose non vanno mescolate nella stessa pagina.

## Server Actions

`actions/conti.ts`: `createConto` e `updateConto` accettano `fido_accordato`;
`updateSaldoConto` resta com'è (tocca solo la disponibilità).

`actions/banche.ts` (nuovo): `getLineeCredito`, `createLineaCredito`, `updateLineaCredito`,
`deleteLineaCredito`, `getAnticipi`, `createAnticipo`, `updateAnticipo`,
`setAnticipoRimborsato`, `deleteAnticipo`, `getCommessePerAnticipo`. Ogni funzione con
`createClient()` + `getOrgId()` e filtro `organization_id`, e
`revalidatePath('/impostazioni')` + `revalidatePath('/commesse', 'layout')` come fa
`actions/conti.ts`.

## Fuori perimetro (YAGNI)

- **Storico delle letture del conto.** Nessuna tabella di rilevazioni datate: si tiene il
  valore corrente, come già si fa per il saldo. Il grafico dell'andamento dell'esposizione
  nel tempo si potrà aggiungere dopo, se servirà davvero. Gli anticipi, invece, uno storico
  ce l'hanno già: restano in tabella con `rimborsato = true`.
- **Proiezione del fido dal flusso di cassa futuro.** Niente calcolo di "dove sarà il fido
  a fine mese" a partire da scadenze e crediti previsti.
- **Movimenti bancari.** Il software non importa e non ricostruisce l'estratto conto: la
  disponibilità del conto la aggiorna l'utente, anche dopo l'accredito di un anticipo.
- **Interessi, commissioni e competenze bancarie.** Restano scadenze come oggi.
- **Chiusura automatica dell'anticipo dal saldo della commessa.** Solo il suggerimento.
- **Interessi e commissioni sugli anticipi.** Sono un costo, ma le condizioni della banca
  non sono ancora chiare: si affronteranno in un lavoro a parte. Fino ad allora restano
  scadenze come oggi.
