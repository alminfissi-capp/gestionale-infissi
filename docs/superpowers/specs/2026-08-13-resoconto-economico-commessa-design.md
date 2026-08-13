# Resoconto economico di commessa

Data: 2026-08-13

## Obiettivo

Generare, da dentro la scheda di una commessa, un PDF riepilogativo da consegnare
al cliente: preventivi accettati, fatture emesse, incassi ricevuti e situazione
contabile finale. Il documento riproduce il modello cartaceo gia' in uso
(`Resoconto_Commessa_174-2025_Tranchida.pdf`).

Le fatture non si ridigitano: il sistema legge i PDF gia' allegati alla commessa
ed estrae numero, data, descrizione e importi.

## Cosa non fa

Scelte prese di proposito, per non gonfiare il lavoro:

- nessuna estrazione AI: le fatture sono sempre generate da FattureInCloud, il
  formato e' fisso e si legge con espressioni regolari;
- nessun parser dei PDF di preventivo: i preventivi del gestionale sono gia' nel
  database, quelli esterni si compilano a mano;
- nessuno storico delle versioni: un resoconto per commessa, si sovrascrive;
- gli incassi non sono modificabili a mano: la fonte di verita' resta
  `acconti_commessa`;
- nessun confronto voce per voce tra preventivo e fattura: la fattura
  FattureInCloud ha un blocco descrittivo unico, senza quantita' e prezzi
  unitari, quindi i controlli lavorano sui totali e sulle intestazioni.

## Accesso

Nell'header di `DialogSchedaCommessa` nasce un menu tre puntini accanto a
Modifica / Stampa / Condividi, con la voce **Resoconto economico**. I tre
pulsanti esistenti restano dove sono.

La voce apre `DialogResoconto`: form precompilato, pulsante Salva, pulsante
Genera PDF.

## Origine dei dati

| Sezione del documento | Origine |
|---|---|
| Logo, denominazione, indirizzo, P.IVA, C.F., telefono, email, sito | `settings` |
| Coordinate bancarie nel piede | `settings.banca` + `settings.iban` |
| Nome cliente, n. commessa | `commesse` |
| Cliente: indirizzo, P.IVA, C.F. | inseriti nel form, salvati sul resoconto |
| Cantiere, progetto, CUP | inseriti nel form, salvati |
| Preventivi accettati | precompilati dai preventivi collegati, righe editabili |
| Fatture emesse e note di credito | lette dai PDF allegati, righe editabili |
| Incassi ricevuti | `acconti_commessa`, sola lettura |
| Situazione contabile | calcolata |
| Le tre note | inserite nel form, salvate |

Il logo si risolve come nella ricevuta acconto: `settings.logo_url` passato a
`getLogoSignedUrl`, poi passato al documento PDF.

## Impostazioni: tre campi nuovi

`settings` acquisisce `sito_web`, `banca`, `iban` (tutti `text`, nullable), con i
rispettivi campi nella pagina Impostazioni, nella sezione dei dati aziendali.
Servono al resoconto e sono riusabili da qualunque documento futuro. Il tipo
`Settings` in `types/impostazioni.ts` va esteso di conseguenza.

Quando un campo e' vuoto la riga corrispondente sparisce dal PDF, non compare
vuota.

## Lettura automatica delle fatture

### Estrazione del testo

`lib/pdfText.ts` — helper client-side che dato un URL restituisce il testo di
tutte le pagine di un PDF. Usa `pdfjs-dist` con
`GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`, lo stesso schema di
`components/cataloghi/PaginaCataloghi.tsx`. Nessuna dipendenza React: e' una
utility, ma gira solo nel browser.

### Riconoscimento

`lib/parseFattura.ts` — funzione pura, nessun side effect, con test Vitest.

```ts
export type TipoDocumentoFiscale = 'fattura' | 'nota_credito'

export type FatturaEstratta = {
  tipo: TipoDocumentoFiscale
  numero: string        // "97/2025"
  data: string          // YYYY-MM-DD
  descrizione: string
  imponibile: number    // negativo per le note di credito
  iva: number           // negativo per le note di credito
  totale: number        // imponibile + iva
  destinatario: string | null   // per il controllo di coerenza
  destinatarioIndirizzo: string | null
  destinatarioPiva: string | null
  destinatarioCf: string | null
  preventivoCitato: { numero: string; data: string } | null
}

export function parseFattura(text: string): FatturaEstratta | null
```

Ancoraggi sul formato FattureInCloud:

- intestazione `FATTURA nr. 97/2025 del 24/11/2025` oppure
  `NOTA DI CREDITO nr. ... del ...`, che determina `tipo`, `numero` e `data`;
- `Imponibile € 15.163,94` per l'imponibile;
- `Totale IVA € 3.336,07` per l'imposta;
- il totale non si legge: e' la somma dei due, cosi' non si rischia di
  agganciare la cifra sbagliata tra scadenze e riepilogo IVA;
- descrizione: prima riga non vuota del blocco che segue `DESCRIZIONE`, quindi
  ad esempio `Acconto su preventivo n. 10040/2025 G del 22/11/2025`;
- dalla descrizione, se presente, `preventivo n. <numero> del <data>` diventa
  `preventivoCitato`;
- dopo `DESTINATARIO`: denominazione sulla prima riga utile, poi indirizzo; le
  etichette `P.IVA` e `CF` che precedono il blocco danno partita IVA e codice
  fiscale del cliente.

Per le note di credito `imponibile`, `iva` e `totale` sono negativi: entrano
nella stessa tabella delle fatture, marcate come "Nota di credito", e il totale
fatturato risulta gia' al netto.

Se l'intestazione non viene riconosciuta la funzione restituisce `null`: il
documento non e' una fattura e viene ignorato senza rumore.

I numeri in formato italiano (`15.163,94`) si convertono con lo stesso helper
gia' usato in `lib/parseBonificoScadenza.ts`.

### Test

Fixture con il testo reale delle tre fatture Tranchida (97/2025, 106/2025,
12/2026) piu' una nota di credito costruita sullo stesso layout, in
`lib/parseFattura.test.ts`. Casi coperti: fattura semplice, nota di credito con
segni negativi, PDF non fattura che deve dare `null`, importi con separatore
delle migliaia.

### Quando gira

All'apertura di `DialogResoconto`, per ogni documento della commessa con
estensione `.pdf`: signed URL con `getDocumentoCommessaUrl`, testo con
`lib/pdfText.ts`, parsing con `parseFattura`. Le fatture riconosciute diventano
righe, ordinate per data.

Se sulla commessa esiste gia' un resoconto salvato vincono le righe salvate: il
lavoro di correzione non si perde mai. Un pulsante **Rileggi allegati** ripete la
scansione e aggiunge soltanto le fatture il cui numero non e' gia' presente.

La scansione mostra uno stato di caricamento e non blocca il resto del form: se
un PDF non si scarica o non si legge, quel documento viene saltato e gli altri
proseguono.

## Calcoli

`lib/resoconto.ts` — funzioni pure, con test Vitest, nessuna dipendenza React.

```
totalePreventivato   = somma dei totali delle righe preventivo
totaleFatturato      = somma dei totali delle righe fattura (note di credito negative)
totaleIncassato      = somma degli acconti della commessa
saldoResiduoFatture  = totaleFatturato - totaleIncassato
preventivatoNonFatturato = totalePreventivato - totaleFatturato
totaleASaldo         = saldoResiduoFatture + preventivatoNonFatturato
```

Ogni totale esiste anche nella variante imponibile e IVA, perche' le tabelle
preventivi e fatture hanno tre colonne di importo.

La riga "Importo preventivato non ancora fatturato" compare nel PDF solo quando
il valore e' diverso da zero, con la tolleranza di un centesimo per assorbire gli
arrotondamenti.

Verifica sul caso reale Tranchida: preventivato 51.928,53, fatturato 51.576,67,
incassato 43.000,00, saldo residuo 8.576,67, non fatturato 351,86, totale a saldo
8.928,53.

## Controlli di coerenza

`lib/resoconto-controlli.ts` — funzione pura con test Vitest, che riceve righe
preventivi, righe fatture, acconti, aliquote IVA e nome cliente e restituisce un
elenco di avvisi.

```ts
export type CodiceAvviso =
  | 'preventivato_non_fatturato'
  | 'fatturato_oltre_preventivo'
  | 'incassato_oltre_fatturato'
  | 'fattura_duplicata'
  | 'allegato_non_letto'
  | 'iva_incoerente'
  | 'fattura_precede_preventivo'
  | 'destinatario_diverso'

export type Avviso = {
  codice: CodiceAvviso
  messaggio: string          // gia' scritto in italiano, con gli importi
  numeroFattura?: string     // per evidenziare la riga nel form
  differenza?: number
}

export function verificaResoconto(dati: DatiVerifica): Avviso[]
```

I controlli:

1. **preventivato_non_fatturato** — `totalePreventivato - totaleFatturato > 0.01`:
   c'e' del preventivato ancora da fatturare. E' il caso Tranchida da € 351,86.
2. **fatturato_oltre_preventivo** — la stessa differenza col segno opposto: si e'
   fatturato piu' del pattuito, oppure una fattura a saldo non espone in
   detrazione gli acconti gia' fatturati e sta contando due volte lo stesso
   importo.
3. **incassato_oltre_fatturato** — `totaleIncassato - totaleFatturato > 0.01`:
   manca una fattura, oppure un acconto e' stato registrato due volte.
4. **fattura_duplicata** — stesso tipo e stesso numero letti da due allegati
   diversi.
5. **allegato_non_letto** — un PDF il cui `tipo_documento` e' `fattura`, oppure
   il cui nome contiene "fattura" o "nota di credito", che il parser non ha
   riconosciuto. Va guardato a mano.
6. **iva_incoerente** — l'aliquota implicita (`iva / imponibile`) non
   corrisponde a nessuna delle `settings.aliquote_iva`, con mezzo punto di
   tolleranza.
7. **fattura_precede_preventivo** — la data della fattura e' anteriore a quella
   del preventivo citato nella sua descrizione.
8. **destinatario_diverso** — il destinatario della fattura non sembra il cliente
   della commessa.

Il confronto del destinatario non puo' essere letterale: sul caso reale la
commessa dice "AZIENDA AGRICOLA DI GIANLUCA TRANCHIDA" e la fattura "AZIENDA
AGRICOLA DI TRANCHIDA GIANLUCA", con nome e cognome invertiti. Si normalizza
(maiuscole, accenti, punteggiatura), si scartano le parole di due lettere o meno
e si confrontano gli insiemi di parole ignorando l'ordine: l'avviso scatta solo
se meno di due terzi delle parole del cliente compaiono nel destinatario. Il test
usa proprio questa coppia come caso che **non** deve dare avviso.

Nessun avviso e' bloccante: si puo' sempre salvare e stampare. Gli avvisi non
finiscono mai nel PDF da soli.

### Bozza della nota

Per `preventivato_non_fatturato` e `fatturato_oltre_preventivo`,
`lib/resoconto.ts` produce anche una bozza di nota — titolo e testo, con importi
e IVA gia' calcolati, sullo stile di quella del documento cartaceo. Nel form
compare un pulsante che la copia nel riquadro Nota, dove poi si corregge e si
completa con la spiegazione di merito. Finche' non si preme quel pulsante il
riquadro resta com'era.

## Persistenza

Nuova tabella `resoconti_commessa`, una riga per commessa.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null | multi-tenancy |
| `commessa_id` | uuid not null unique | on delete cascade |
| `data_documento` | date not null | default oggi |
| `cliente_indirizzo` | text | |
| `cliente_piva` | text | |
| `cliente_cf` | text | |
| `cantiere_nome` | text | es. "Frantoio" |
| `cantiere_indirizzo` | text | |
| `progetto_titolo` | text | es. "PSR 2014/2020" |
| `progetto_sottotitolo` | text | es. "Bando 2016 – sottomisura 4.1" |
| `progetto_cup` | text | |
| `righe_preventivi` | jsonb not null default `[]` | |
| `righe_fatture` | jsonb not null default `[]` | |
| `nota_fatture` | text | riga sotto la tabella fatture |
| `nota_titolo` | text | titolo del riquadro evidenziato |
| `nota_testo` | text | corpo del riquadro evidenziato |
| `nota_finale` | text | righe piccole sopra le firme |
| `created_at`, `updated_at` | timestamptz | |

Forma delle righe JSONB:

```ts
type RigaPreventivo = {
  numero: string
  data: string | null      // YYYY-MM-DD
  oggetto: string
  imponibile: number
  iva: number
  totale: number
}

type RigaFattura = {
  tipo: 'fattura' | 'nota_credito'
  numero: string
  data: string | null
  descrizione: string
  imponibile: number
  iva: number
  totale: number
  daAllegato: boolean      // letta da un PDF, non digitata
}
```

RLS: policy su `organization_id = get_user_organization_id()` per select, insert,
update e delete, come le altre tabelle del modulo.

Gli incassi non si salvano: si rileggono ogni volta da `acconti_commessa`.

Migrazione unica `supabase/migrations/20260813110000_resoconto_economico.sql`,
che contiene sia i tre campi nuovi di `settings` sia la tabella con le sue
policy.

## Server actions

In `actions/resoconto-commessa.ts`, tutte con `getOrgId()`:

- `getResocontoCommessa(commessaId)` — il resoconto salvato oppure `null`;
- `saveResocontoCommessa(commessaId, input)` — upsert su `commessa_id`;
- `deleteResocontoCommessa(commessaId)` — per ripartire da zero;
- `getDatiPreventiviCommessa(commessaId)` — per i preventivi collegati che hanno
  un `preventivo_id`, legge da `preventivi` numero, data, imponibile, IVA e
  totale; serve a precompilare la tabella dei preventivi accettati.

I tipi stanno in `types/resoconto.ts`: `ResocontoCommessa`,
`ResocontoCommessaInput`, `RigaPreventivo`, `RigaFattura`.

## Il form

`components/commesse/DialogResoconto.tsx`, a sezioni:

1. **Documento** — data di emissione.
2. **Cliente** — indirizzo, P.IVA e C.F., precompilati dal destinatario della
   prima fattura letta quando il resoconto e' nuovo, comunque modificabili.
3. **Cantiere e progetto** — nome cantiere, indirizzo, titolo progetto,
   sottotitolo, CUP.
4. **Preventivi accettati** — tabella di righe editabili, precompilata dai
   preventivi collegati alla commessa; per quelli con `preventivo_id` arrivano
   gia' numero, data e importi, per quelli allegati solo come PDF arriva il
   numero e il resto si compila; si aggiungono ed eliminano righe.
5. **Fatture emesse** — stessa tabella, alimentata dalla scansione degli
   allegati; le righe lette portano un segno che le distingue da quelle
   digitate; pulsante Rileggi allegati.
6. **Incassi ricevuti** — sola lettura: data, numero ricevuta (le ultime sei
   cifre dell'id dell'acconto in maiuscolo, come in `RicevutaAcconto`), metodo,
   importo.
7. **Situazione contabile** — sola lettura, ricalcolata mentre scrivi.
8. **Note** — nota sotto le fatture, riquadro evidenziato (titolo e testo), note
   finali. Quando c'e' uno scostamento tra preventivato e fatturato, qui compare
   il pulsante che porta la bozza nel riquadro.

In cima al form, sopra tutto, il banner giallo con gli avvisi trovati: uno per
riga, con l'importo della differenza dove ha senso. Le righe fattura coinvolte
si evidenziano nella loro tabella. Il banner si ricalcola mentre correggi, cosi'
si vede subito quando un problema rientra.

In fondo: Salva e Genera PDF. Genera PDF salva prima, cosi' quello che vedi
stampato e' quello che resta memorizzato. Gli avvisi non impediscono ne' il
salvataggio ne' la stampa.

## Il PDF

`components/commesse/ResocontoPdfDocument.tsx`, con `@react-pdf/renderer`, sulla
falsariga di `RicevutaPdfDocument.tsx`: font Helvetica, teal `#0E8F9C`, stessi
grigi.

Impaginazione su A4:

- header: logo a sinistra, dati azienda al centro, titolo "RESOCONTO ECONOMICO DI
  COMMESSA" e data di emissione a destra;
- fascia con cliente (denominazione, indirizzo, P.IVA, C.F.), numero commessa e
  cantiere, progetto e CUP;
- tabella preventivi accettati, con riga di totale;
- tabella fatture emesse, con riga di totale e la nota sotto;
- tabella incassi ricevuti, con riga di totale;
- riquadro della situazione contabile, con il totale a saldo in evidenza;
- riquadro della nota, se valorizzata;
- note finali, coordinate bancarie, riquadro firme "Per presa visione – Il
  Cliente";
- piede con la denominazione e la dicitura "Documento riepilogativo privo di
  valenza fiscale".

Le sezioni prive di contenuto non vengono stampate.

Il file si chiama `Resoconto_Commessa_{numero_commessa}_{cliente}.pdf`, con nome
cliente ripulito dai caratteri non validi. Download e condivisione seguono
`RicevutaAcconto`: `pdf(...).toBlob()`, poi `navigator.share` quando disponibile
e in alternativa il download diretto.

## File toccati

Nuovi:

- `supabase/migrations/20260813xxxxxx_resoconto_economico.sql`
- `types/resoconto.ts`
- `lib/pdfText.ts`
- `lib/parseFattura.ts` + `lib/parseFattura.test.ts`
- `lib/resoconto.ts` + `lib/resoconto.test.ts`
- `lib/resoconto-controlli.ts` + `lib/resoconto-controlli.test.ts`
- `actions/resoconto-commessa.ts`
- `components/commesse/DialogResoconto.tsx`
- `components/commesse/ResocontoPdfDocument.tsx`

Modificati:

- `types/impostazioni.ts` — `sito_web`, `banca`, `iban`
- pagina e form Impostazioni — i tre campi nuovi
- `components/commesse/DialogSchedaCommessa.tsx` — menu tre puntini e apertura
  del dialog

## Verifica

- `npx vitest run` verde sui parser e sui calcoli;
- `npm run lint` e `npm run build` senza errori;
- prova manuale sulla commessa Tranchida 174-2025: i tre PDF fattura allegati
  devono essere riconosciuti da soli, la situazione contabile deve chiudere sui
  numeri del documento cartaceo, deve comparire l'avviso dei € 351,86 non
  fatturati e **non** deve comparire quello sul destinatario.
