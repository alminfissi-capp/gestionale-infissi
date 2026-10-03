# Fatture in Cloud — fase 2: pagamenti delle fatture fornitori

Data: 2026-10-03
Fase precedente: `docs/superpowers/specs/2026-09-28-fatture-in-cloud-collegamento-design.md`

## Obiettivo

Collegare le **scadenze** di WinStudio alle **fatture e note di credito fornitori**
scaricate da Fatture in Cloud (FiC), e scrivere su FiC il pagamento quando la
scadenza è pagata, così che FiC rifletta i pagamenti realmente fatti.

Dati reali al 2026-10-03 che motivano il disegno:

- su FiC (dal 2026) 710 rate da pagare per ~317.000 € verso 98 fornitori, solo 31
  pagate: i pagamenti oggi non si segnano su FiC;
- nelle scadenze non ci sono le singole fatture fornitori ma gli **assegni** (35 da
  incassare per 131.000 €, 92 pagati per 259.000 €), più finanziamenti, utenze,
  tasse e piccole spese;
- un assegno paga quasi sempre **più fatture** (es. 3 assegni Profilsider contro 131
  fatture FiC).

## Regole decise con l'utente

1. **Ogni pagamento a un fornitore è una scadenza** in WinStudio, come oggi. Non si
   segnano pagamenti direttamente sulle fatture.
2. Una scadenza **si può collegare** a una o più fatture e note di credito FiC, ma
   **non è obbligatorio**: la fattura può non esserci o arrivare dopo; in quel caso
   si torna sulla scadenza e la si collega.
3. Scadenza **pagata** in WinStudio → WinStudio scrive su FiC il pagamento delle
   fatture collegate. **Tolto il pagato** → WinStudio toglie da FiC quel pagamento.
4. La scrittura su FiC avviene **subito, al clic**. Se FiC non risponde, la scadenza
   cambia stato comunque in WinStudio e il collegamento resta **"da allineare"** con
   il pulsante Riprova: niente si perde in silenzio, niente blocca l'utente.
5. Importi: **ripartizione automatica** in ordine di scadenza, correggibile a mano,
   con un **controllo** che avvisa quando le fatture selezionate non tornano con
   l'importo della scadenza.
6. Le **note di credito** si collegano già ora e si scalano: assegno 4.500 € =
   fatture 5.000 € − nota di credito 500 €.
7. **Le statistiche non cambiano**: debiti, flusso di cassa, costi e Calcoli leggono
   solo le scadenze; le fatture FiC non entrano nei conti, quindi il doppio conteggio
   non può nascere.

## Cosa non fa

- nessun "Registra pagamento" dalla pagina Fatture fornitori che crei la scadenza da
  sé: si parte sempre dalla scadenza;
- nessuna modifica a statistiche, flusso di cassa, Calcoli, costi mensili;
- nessun aggancio alla tabella `fornitori` del magazzino: il fornitore si cerca per
  nome fra quelli delle fatture FiC;
- nessun metodo "compensazione": la nota di credito si chiude con lo stesso metodo
  della scadenza (se il commercialista ne vuole uno apposito, si crea su FiC e lo si
  sceglie);
- nessuna scrittura automatica in background: solo azioni dell'utente o "Riprova".

## Dati

Migrazione unica.

### `scadenze` — una colonna nuova

| Colonna | Tipo | Note |
|---|---|---|
| `fic_metodo_id` | bigint NULL | conto di pagamento FiC (in FiC sono metodi: Contanti, Assegno, Bonifico, Carta di credito, SDD) |

Default applicativo: per `categoria = 'assegno'` il metodo FiC chiamato "Assegno",
se esiste; per le altre si sceglie nella finestra di collegamento. Senza metodo la
scrittura su FiC non parte e il collegamento resta "da allineare" con il messaggio
"Scegli il metodo di pagamento".

### `scadenze_fatture` — il collegamento (dato solo WinStudio)

Tabella separata come stabilito nella fase 1: la sincronizzazione FiC non la tocca.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | DEFAULT `get_user_organization_id()`, FK organizations |
| `scadenza_id` | uuid NOT NULL | FK `scadenze` ON DELETE **RESTRICT** (vedi "Eliminazioni") |
| `fic_documento_id` | bigint NOT NULL | id FiC della fattura o nota (non l'uuid locale: sopravvive alle risincronizzazioni) |
| `tipo_documento` | text NOT NULL | CHECK `fattura` / `nota_credito` |
| `importo` | numeric(12,2) NOT NULL | CHECK > 0; quota assegnata (per le note: quota usata, positiva) |
| `stato_fic` | text NOT NULL | CHECK `non_scritto` / `scritto` / `da_allineare` / `da_verificare` |
| `messaggio_fic` | text | ultimo errore o motivo |
| `scrittura_fic` | jsonb | cosa WinStudio ha scritto (vedi sotto); null se `non_scritto` |
| `scritto_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

UNIQUE (`scadenza_id`, `fic_documento_id`). Indici su `scadenza_id` e su
(`organization_id`, `fic_documento_id`). RLS: SELECT/INSERT/UPDATE/DELETE per
l'organizzazione (le scritture passano comunque dalle Server Action con controllo
permessi).

**`scrittura_fic`** — la nota di quello che WinStudio ha fatto sul documento:

```json
{
  "data": "2026-10-03",
  "metodo_id": 546834,
  "rate_pagate": [{ "id": 111, "importo": 300.00 }, { "id": 112, "importo": 200.00 }],
  "rata_divisa": { "pagata_id": 112, "resto_id": 113, "importo_originale": 500.00 }
}
```

`rata_divisa` è null se nessuna rata è stata spezzata.

**Stati:**

- `non_scritto` — scadenza non pagata: il collegamento prepara solo la ripartizione;
- `scritto` — pagamento presente su FiC come descritto da `scrittura_fic`;
- `da_allineare` — FiC non raggiungibile, token rifiutato, documento bloccato, metodo
  mancante: un **Riprova** può risolverlo;
- `da_verificare` — su FiC qualcosa non torna (residuo insufficiente, rate scritte da
  WinStudio poi modificate a mano): serve una persona, Riprova non basta.

## Residuo e ripartizione (logica pura, `lib/fic/pagamenti.ts`)

**Residuo di un documento** = somma delle rate locali `da_pagare` (copia FiC) −
quote assegnate da collegamenti `non_scritto` di **altre** scadenze. I collegamenti
`scritto` sono già riflessi nelle rate FiC; `da_allineare`/`da_verificare` contano
come assegnati (non si promette due volte lo stesso residuo).

**Ripartizione automatica**, dato l'importo della scadenza `S` e i documenti spuntati:

1. si scalano per intero (fino al residuo) le note di credito spuntate: `disponibile = S + Σ note`;
2. si coprono le fatture spuntate in ordine di prima scadenza non pagata
   (a parità: data fattura, poi id): ognuna fino al suo residuo, finché c'è disponibile;
3. le fatture spuntate rimaste senza disponibile ricevono 0 e vengono segnalate.

L'utente può correggere ogni quota a mano; la ripartizione automatica si ricalcola
solo quando cambia la selezione o l'importo della scadenza, non sopra le correzioni.

**Controllo** — `differenza = S − (Σ quote fatture − Σ quote note)`:

| Caso | Esito |
|---|---|
| differenza = 0 | verde, si salva |
| differenza < 0 (fatture oltre l'importo) | avviso: "X € resteranno da pagare sulla fattura N" — salvabile con conferma |
| differenza > 0 (importo oltre le fatture) | avviso: "X € della scadenza non coprono nessuna fattura" — salvabile con conferma |
| quota > residuo del documento | **blocco** |
| quota ≤ 0 su un documento spuntato | **blocco** |

Confronti al centesimo (arrotondamento a 2 decimali prima di confrontare).

## Scrittura su FiC (`lib/fic/pagamenti-fic.ts`, logica pura + client)

Su FiC il pagamento sta nelle **rate** (`payments_list`) del documento. Funzioni pure,
testate senza rete:

**`applicaPagamento(rate, importo, data, metodoId)`** → `{ rate nuove, scrittura }` o errore:

1. rate `not_paid` ordinate per `due_date` (poi ordine originale);
2. si segnano `paid` con `paid_date = data` e `payment_account = { id: metodoId }`
   finché coprono `importo`;
3. se l'ultima supera il rimanente, si **divide**: una rata pagata pari al rimanente
   (mantiene id) e una nuova rata `not_paid` con la differenza e la stessa scadenza;
4. se le rate non pagate non bastano → errore `residuo_insufficiente` (nessuna modifica).

Il totale delle rate non cambia mai.

**`annullaPagamento(rate, scrittura)`** → `{ rate nuove }` o conflitto:

1. ogni rata in `scrittura.rate_pagate` deve esistere ed essere ancora `paid` con lo
   stesso importo e la stessa `paid_date`; altrimenti → conflitto (nessuna modifica);
2. si rimettono `not_paid`, `paid_date` null;
3. se c'è `rata_divisa` e la rata resto esiste ancora `not_paid` con la stessa scadenza,
   si **riuniscono** (importo originale, la rata resto si elimina); se il resto è stato
   toccato, si lascia separata (nessun conflitto: il totale torna comunque).

**Sequenza di una scrittura reale** (Server Action, per ogni collegamento):

1. GET del documento (`fieldset=detailed`) appena riletto;
2. `applicaPagamento` sulle sue rate;
3. PUT del documento con il nuovo `payments_list` (solo quel campo, modalità delta di FiC);
4. dalla risposta: ids reali delle rate (la rata resto nasce con id nuovo) → `scrittura_fic`;
5. aggiornamento immediato della copia locale (`fatture_fornitori` + rate) con la
   risposta, usando le funzioni di salvataggio della fase 1.

Annullamento: GET → `annullaPagamento` → PUT → copia locale.

**Da verificare con una prova reale prima di scrivere il resto** (primo passo del
piano, su una fattura scelta dall'utente, che viene rimessa com'era): che FiC accetti
il PUT del solo `payments_list` con una rata divisa; come assegna gli id alle rate
nuove; che rifiuti somme diverse dal totale; come risponde su un documento `locked`;
che l'annullamento riporti il documento allo stato di partenza.

## Quando WinStudio parla con FiC

Un unico punto, `allineaScadenzaFic(scadenzaId)`, chiamato da **tutte** le azioni che
cambiano qualcosa di rilevante su una scadenza collegata. Confronta ciò che dovrebbe
esserci su FiC (scadenza pagata? data, metodo, quote) con `scrittura_fic` e fa solo
quello che serve: scrivere, annullare, o annullare e riscrivere.

| Azione | File oggi | Effetto su FiC |
|---|---|---|
| spunta pagato | `setPagatoScadenza` | scrive |
| tolgo pagato | `setPagatoScadenza` | annulla |
| modifica dalla finestra (pagato, importo, data) | `updateScadenza` | annulla e/o riscrive secondo il caso |
| programmazione dal blocco "da programmare" | `programmaScadenza` | come sopra |
| riporto in "da programmare" (perde data e pagato) | `spostaInDaProgrammare` | annulla |
| annullo la scadenza | `setAnnullataScadenza` | annulla (ripristinandola, riscrive se pagata) |
| elimino la scadenza | `deleteScadenza` | annulla, poi elimina i collegamenti e la scadenza |
| elimino un blocco di scadenze | eliminazione gruppo in `actions/commesse.ts` | annulla tutte quelle collegate, poi elimina |
| collego / scollego / cambio quote | nuova azione della finestra | scrive / annulla / riscrive se la scadenza è pagata |
| cambio importo di una scadenza pagata | `updateScadenza` | ricalcolo: se la ripartizione non torna più, la modifica chiede conferma come la finestra |

Data del pagamento su FiC = `data_scadenza`; se manca (caso limite) la data di oggi a Roma.

**Eliminazioni:** `scadenze_fatture.scadenza_id` è `ON DELETE RESTRICT`. Così nessuna
cancellazione (diretta o in cascata dal blocco) può far sparire un collegamento senza
passare da `allineaScadenzaFic`: se un percorso dimenticato provasse a cancellare,
il database rifiuta invece di lasciare un pagamento orfano su FiC.

**Esito per l'utente:** l'azione sulla scadenza riesce sempre in WinStudio. Il
risultato FiC torna come avviso: "Pagamento scritto su FiC: 3 fatture, 1 nota di
credito" oppure "Pagato in WinStudio, ma FiC non ha risposto: da allineare".

**Eccezione all'"azione riesce sempre":** eliminare una scadenza (o un blocco) con
collegamenti `scritto` richiede che l'annullamento su FiC riesca; se FiC non risponde
l'eliminazione si ferma con "Prima va tolto il pagamento da FiC: riprova", perché
dopo non resterebbe traccia di cosa annullare.

### Errori

| Caso | Stato collegamento |
|---|---|
| rete / 5xx / 429 | `da_allineare` |
| 401 | `da_allineare` + collegamento FiC → `da_ricollegare` (come fase 1) |
| documento `locked` o errore di validazione FiC | `da_allineare` con il messaggio FiC |
| metodo mancante | `da_allineare` "Scegli il metodo di pagamento" |
| residuo FiC insufficiente | `da_verificare` "Su FiC restano X €, servono Y €" |
| annullamento con rate modificate su FiC | `da_verificare` "Rate modificate su FiC: sistemare a mano" |
| documento eliminato su FiC | `da_verificare` "Documento non più presente su FiC" |

## Interfaccia

### Scadenze (Commesse → Scadenze)

- Nuova icona **"Fatture"** in `RigaScadenza` e nella `DialogScadenza`: grigia se non
  collegata; con il numero di documenti se collegata; verde se pagata e tutto `scritto`;
  rossa se qualche collegamento è `da_allineare`/`da_verificare` (tooltip col motivo).
  Visibile solo con lettura su `fatture_fornitori` e collegamento FiC presente.
- Dopo pagato/togli pagato su una scadenza collegata: toast con l'esito FiC.

### Finestra di collegamento (`DialogCollegaFatture`)

1. intestazione: fornitore, importo, data, pagata sì/no, **metodo FiC** (select coi
   conti FiC letti da `GET /c/{company}/settings/payment_accounts`, default "Assegno"
   per la categoria assegno);
2. campo **fornitore** precompilato dal testo della scadenza, ricerca tollerante
   (maiuscole, punteggiatura, "srl/s.r.l./spa" ignorati, parole contenute) fra i
   `fornitore_nome` delle fatture locali; modificabile;
3. elenco di fatture e note di credito del fornitore **con residuo > 0** più quelle già
   collegate a questa scadenza, dalla prima scadenza; le note col segno meno ed
   etichetta NC; casella + quota modificabile;
4. barra di controllo: *Scadenza · Fatture · Note di credito · Differenza* con gli
   esiti della tabella sopra; "Salva" / "Salva comunque" (conferma) / bloccato;
5. al salvataggio: se la scadenza è pagata parte subito `allineaScadenzaFic`.

### Fatture fornitori

- riquadro **"N pagamenti da allineare su FiC"** con **Riprova tutti** (scorre i
  collegamenti `da_allineare`; i `da_verificare` restano elencati col motivo);
- nel dettaglio fattura, sezione **"Pagata con"**: scadenze collegate, data, quota,
  stato FiC, link alla scadenza;
- nell'elenco, icona sulle fatture con una scadenza collegata **non ancora pagata**
  ("pagamento programmato").

### Permessi

- collegare/scollegare/cambiare quote: **scrittura su `commesse`** e almeno **lettura
  su `fatture_fornitori`**, verificati nella Server Action;
- la scrittura FiC è una conseguenza: parte da azioni già autorizzate sulle scadenze
  e usa il token dal Vault come nella fase 1;
- Riprova / Riprova tutti: scrittura su `commesse`.

## Test

Vitest, logica pura:

- `pagamenti.ts`: residuo (con collegamenti di altre scadenze nei vari stati),
  ripartizione con e senza note di credito, ordine di scadenza, quote a zero, controllo
  nei 5 casi, arrotondamento al centesimo;
- `pagamenti-fic.ts`: pagamento che copre una rata intera, più rate, rata divisa,
  residuo insufficiente, annullamento semplice, annullamento con riunione della rata
  divisa, rata resto toccata (niente riunione), rata pagata modificata (conflitto),
  totale invariato in ogni caso;
- decisione di `allineaScadenzaFic` come funzione pura (stato desiderato vs
  `scrittura_fic` → scrivi / annulla / riscrivi / niente).

Prove reali con l'utente: prova di scrittura e annullamento su una fattura scelta;
poi una scadenza vera collegata a due fatture e una nota di credito, segnata pagata,
verificata su FiC, tolta, riverificata.
