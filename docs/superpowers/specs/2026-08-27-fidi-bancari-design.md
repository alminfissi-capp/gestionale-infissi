# Fidi bancari e linee di credito — Design

Data: 2026-08-27
Stato: approvato dall'utente, pronto per il piano di implementazione

## Obiettivo

Far entrare nei conti dell'azienda l'esposizione verso le banche, che oggi non esiste da
nessuna parte nel software:

1. **Fido di cassa sul conto corrente** — il conto va in rosso fino al limite accordato.
2. **Linee separate** — anticipo fatture, SBF, castelletto: affidamenti che non si vedono
   nel saldo del conto.

L'utilizzato di entrambi va sommato ai **Debiti da pagare** in `/commesse/statistiche` ed
entra nella **posizione netta**. Nei **Calcoli** la Liquidità corrente resta il numero che
è oggi, ma dice quanta parte è soldi propri e quanta è banca.

## La convenzione d'inserimento: si scrive il disponibile, non l'utilizzato

Scelta dell'utente, ed è il perno di tutto il disegno: **l'utilizzato non si inserisce mai,
si ricava**. Chi usa il software legge dall'home banking la disponibilità residua, che è il
numero che serve per decidere cosa pagare, e scrive quella.

```
fido accordato 40.000, disponibilità 10.000  →  utilizzato = 30.000
```

Da accordato `A` e disponibile `D`, per ogni conto e per ogni linea:

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

### `linee_credito` — tabella nuova

```sql
CREATE TABLE linee_credito (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  tipo             text        NOT NULL DEFAULT 'anticipo_fatture',
  accordato        numeric     NOT NULL DEFAULT 0,
  disponibile      numeric     NOT NULL DEFAULT 0,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE linee_credito ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON linee_credito
  FOR ALL USING (organization_id = get_user_organization_id());
CREATE INDEX linee_credito_org_idx ON linee_credito (organization_id);
```

`tipo` è `text` senza vincolo DB, come `CategoriaScadenza`: le etichette stanno in un
`Record<TipoLineaCredito, string>` in `types/commessa.ts`, così il compilatore segnala ogni
punto da completare quando la lista cresce. Valori: `anticipo_fatture`, `sbf`,
`castelletto`, `altro`.

**Perché una tabella separata e non una colonna `tipo` su `conti_correnti`.** A
`conti_correnti` puntano `scadenze.conto_id`, il selettore del `DialogScadenza`,
`ScadenzeView`, `ScadenzeDaProgrammareView` e la somma della Liquidità corrente nei Calcoli.
Aggiungere lì un tipo obbligherebbe a filtrare in cinque posti, e ogni punto dimenticato
farebbe entrare l'anticipo fatture nella cassa spendibile — l'esatto contrario della scelta
presa. Con una tabella separata non c'è nessun filtro da ricordare, e vale la regola già
scritta in `gotcha_blocchi_commesse_tipo`: filtrare in positivo, mai escludendo per nome.

## Logica pura — `lib/banche.ts`

File nuovo, nessuna dipendenza React né Supabase, sul modello di `lib/statistiche-commesse.ts`.

```ts
export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export type ContoBancaRow = { id: string; nome: string; disponibile: number; accordato: number }
export type LineaCreditoRow = ContoBancaRow & { tipo: TipoLineaCredito }

export type UtilizzoBanca = {
  id: string
  nome: string
  accordato: number
  disponibile: number
  utilizzato: number
  residuo: number
}

export type RiepilogoBanche = {
  conti: UtilizzoBanca[]        // solo quelli con accordato > 0
  linee: UtilizzoBanca[]
  liquiditaPropria: number      // Σ max(0, disponibile − accordato) sui conti
  fidoCassaUtilizzato: number
  lineeUtilizzato: number
  utilizzatoTotale: number      // fidoCassaUtilizzato + lineeUtilizzato
  residuoTotale: number         // margine ancora disponibile, conti + linee
}

export function riepilogoBanche(
  conti: ContoBancaRow[],
  linee: LineaCreditoRow[],
): RiepilogoBanche
```

I conti con `accordato = 0` restano fuori dagli array di dettaglio (una riga di fido a zero
non dice niente) ma la loro disponibilità entra tutta in `liquiditaPropria`.

### Test — `lib/banche.test.ts` (Vitest, già in progetto)

- conto in rosso: `A=40.000, D=10.000` → utilizzato 30.000, propria 0, residuo 10.000
- conto in attivo oltre il fido: `A=40.000, D=45.000` → utilizzato 0, propria 5.000
- **conto senza fido: `A=0, D=5.000`** → utilizzato 0, propria 5.000, fuori dal dettaglio
- linea usata al massimo: `A=100.000, D=0` → utilizzato 100.000, residuo 0
- linea intonsa: `A=100.000, D=100.000` → utilizzato 0
- somma su più conti e più linee, con un conto in rosso e uno in attivo insieme: il floor
  per entità impedisce la compensazione
- liste vuote → tutti zeri, nessuna eccezione

## Statistiche — `/commesse/statistiche`

### Query nella page

Il Server Component carica due sorgenti in più, dentro il `Promise.all` già presente:
`conti_correnti` (`id, nome, saldo_attuale, fido_accordato, ordine`) e `linee_credito`.

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
residuoFidi: number               // banche.residuoTotale, mostrato come testo di servizio
```

`debitiBanche` entra in `debitiTotali` **e in `posizioneNetta`**, accanto a scadute,
scadenze dell'anno, da programmare e stipendi arretrati.

**Scelta voluta, da non "correggere" in futuro:** l'utilizzato dell'anticipo fatture
convive con il credito della stessa fattura, che sta già in "Da commesse". Non è un doppio
conteggio sbagliato — i soldi dalla banca sono già stati incassati e vanno restituiti — ma
rende la posizione netta più severa su ogni fattura anticipata. L'utente l'ha scelto
sapendolo: la banca può rientrare quando vuole, quindi il netto deve dirlo.

### Interfaccia

Nel riquadro "Debiti da pagare" una riga nuova **"Banche (fido utilizzato)"**, con la
tendina che si apre sul dettaglio per conto e per linea. Stesso schema di "Da commesse":
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

**Blocco nuovo "Fidi e linee di credito"**, sotto Giacenze: una riga per linea con nome,
accordato, disponibile (modificabile inline, come i saldi dei conti), utilizzato e residuo.
**Fuori dal totale della Liquidità corrente**: il residuo di un anticipo fatture non è
cassa, lo diventa solo presentando fatture. È una scelta esplicita dell'utente.

I conti correnti restano dove sono, nel blocco Giacenze, con la sola etichetta cambiata in
"Disponibilità" e il fido residuo mostrato accanto quando `fido_accordato > 0`.

## Impostazioni — `/impostazioni`

- `FormConti.tsx`: campo **"Fido accordato"** accanto a nome e disponibilità, sia in
  modifica sia in creazione. `ContoCorrenteInput` guadagna `fido_accordato`.
- `FormLineeCredito.tsx` (nuovo): stessa forma di `FormConti` — elenco con salvataggio
  inline su blur, riga in fondo per aggiungerne una, eliminazione con conferma.

L'accordato sta qui perché cambia una volta l'anno; il disponibile si tocca dai Calcoli
perché cambia ogni giorno. Le due cose non vanno mescolate nella stessa pagina.

## Server Actions

`actions/conti.ts`: `createConto` e `updateConto` accettano `fido_accordato`;
`updateSaldoConto` resta com'è (tocca solo la disponibilità).

`actions/linee-credito.ts` (nuovo): `getLineeCredito`, `createLineaCredito`,
`updateLineaCredito`, `updateDisponibileLinea`, `deleteLineaCredito`. Ogni funzione con
`createClient()` + `getOrgId()` e filtro `organization_id`, e
`revalidatePath('/impostazioni')` + `revalidatePath('/commesse', 'layout')` come fa
`actions/conti.ts`.

## Fuori perimetro (YAGNI)

- **Storico delle letture.** Nessuna tabella di rilevazioni datate: si tiene il valore
  corrente, come già si fa per il saldo dei conti. Il grafico dell'andamento
  dell'esposizione nel tempo si potrà aggiungere dopo, se servirà davvero.
- **Proiezione del fido dal flusso di cassa futuro.** Niente calcolo di "dove sarà il fido
  a fine mese" a partire da scadenze e crediti previsti.
- **Movimenti bancari.** Il software non importa e non ricostruisce l'estratto conto.
- **Interessi e competenze bancarie.** Restano scadenze come oggi.
