# Commesse anonime — vendite e-commerce ed eBay

Data: 2026-08-31
Stato: design approvato, da implementare

## Problema

Oltre alle commesse su misura, l'azienda vende online (e-commerce ed eBay). Sono
molte transazioni piccole e già saldate. Contabilmente sono ricavi a tutti gli
effetti — devono entrare nel fatturato, negli incassi e nel calcolo dell'utile —
ma **non sono lavori**: non hanno una scheda di produzione, non stanno sul
calendario, non hanno acconti né saldo residuo.

Oggi registrarle come commesse normali le farebbe finire in Produzione e nel
calendario; non registrarle affatto lascia il fatturato incompleto.

## Soluzione in una frase

Dentro ogni blocco anno delle commesse, sezioni create a richiesta ("Commesse
anonime") dove ogni riga è una vendita già incassata, con costo materiale,
costo manodopera e utile calcolato — salvata come commessa marchiata `anonima`
così da entrare in tutti i totali restando fuori da ogni flusso operativo.

## Decisioni prese

| Domanda | Scelta |
|---|---|
| Unità di registrazione | 1 riga = 1 vendita = 1 incasso unico |
| Rapporto con i totali esistenti | Dentro tutti i totali, come le commesse |
| Dove vivono | Sezioni create a richiesta dentro il blocco anno, in cima |
| Quante sezioni per blocco | Più di una, con nome libero |
| IVA | Si registra il lordo, il sistema scorpora (aliquota per riga, 22% default) |
| Costi | Materiale e manodopera a mano; utile calcolato, non modificabile |
| Campi riga | Data, descrizione, canale, metodo di pagamento |
| Inserimento | Dialog "Nuova vendita" |
| Elenco | Raggruppato per mese, con sottototali |
| Card del blocco su `/commesse` | Tutto sommato, senza distinzione |
| Impianto dati | Riuso di `commesse` con flag `anonima` |
| Campo `cliente_nome` | Il nome della sezione |

## Perché riusare `commesse` e non una tabella nuova

Le due liste sono opposte e lunghe: queste vendite devono **entrare** in
fatturato, incassi, flusso di cassa, costi/utile, dashboard e totale della card,
e **uscire** da produzione, calendario, tabella commesse e anticipi bancari.
Qualunque impianto lascia una delle due liste da mantenere a mano.

Col riuso, la lista da mantenere a mano è quella delle esclusioni. Se un filtro
viene dimenticato, compare una riga di troppo dove non dovrebbe: **visibile e
correggibile in un minuto**. Con una tabella separata, la lista da mantenere a
mano sarebbe quella delle inclusioni, e una dimenticanza produrrebbe **numeri
sbagliati in silenzio** — proprio ciò che questa funzione deve evitare.

In più, il riuso eredita gratis tre cose già costruite:
`costo_materiali_manuale` / `costo_manodopera_manuale` / `utile_manuale` già
alimentano il grafico costi/utile; `acconti_commessa` già alimenta il flusso di
cassa per data di pagamento; la card del blocco somma già `commesse.totale`.

## Modello dati

Migration `20260831HHMMSS_commesse_anonime.sql`.

### Nuova tabella `sezioni_anonime`

```
id                UUID PK
organization_id   UUID NOT NULL → organizations(id) ON DELETE CASCADE
gruppo_id         UUID NOT NULL → gruppi_commesse(id) ON DELETE CASCADE
nome              TEXT NOT NULL
ordine            INT  NOT NULL DEFAULT 0
created_at        TIMESTAMPTZ DEFAULT NOW()
updated_at        TIMESTAMPTZ DEFAULT NOW()
```

RLS abilitata con le quattro policy del modulo
(`organization_id = get_user_organization_id()`), come `gruppi_commesse`.

### Colonne aggiunte a `commesse`

```
anonima             BOOLEAN NOT NULL DEFAULT FALSE
sezione_anonima_id  UUID → sezioni_anonime(id) ON DELETE CASCADE
canale              TEXT
```

Indici: `(organization_id, anonima)` e `(sezione_anonima_id)`.

`anonima` è una colonna a sé e non un valore di `stato` o di `reparti`: deve
poter essere filtrata senza dipendere da campi che l'utente modifica.

### Come si scrive una vendita

Ogni vendita produce **due** record, in una sola server action transazionale:

1. **`commesse`**
   - `anonima = true`, `sezione_anonima_id`, `canale`
   - `gruppo_id` = blocco anno della sezione
   - `totale` = importo lordo incassato
   - `imponibile` = lordo / (1 + aliquota), `iva_totale` = lordo − imponibile
   - `costo_materiali_manuale`, `costo_manodopera_manuale`
   - `utile_manuale` = imponibile − materiale − manodopera (scritto in colonna
     perché è così che il grafico costi/utile lo legge; ricalcolato a ogni
     salvataggio, mai modificabile a mano)
   - `cliente_nome` = nome della sezione
   - `note` = descrizione libera della vendita
   - `data_conferma` = data della vendita
   - `stato = 'concluso'`, `numero_commessa = ''`, `preventivo_id = null`
   - `archiviata = false`, `in_calcoli = false`

2. **`acconti_commessa`**
   - `importo` = lordo incassato, `data_pagamento` = data della vendita,
     `metodo_pagamento` scelto nel dialog

Il secondo record è ciò che rende la vendita visibile al flusso di cassa senza
toccarne il codice. Ne discende che **saldo = totale − acconti = 0**: queste
vendite non generano mai crediti fantasma nel riepilogo crediti/debiti.

Modificare una vendita riscrive entrambi i record; eliminarla cancella la
commessa, e l'acconto se ne va per `ON DELETE CASCADE`.

## Logica pura — `lib/vendite-anonime.ts`

Nessuna dipendenza React né Supabase, coperta da Vitest.

```ts
export const ALIQUOTA_IVA_DEFAULT = 22

/** Scorpora l'IVA da un lordo. Aliquota in punti percentuali (22 = 22%). */
export function scorporaIva(lordo: number, aliquota: number):
  { imponibile: number; iva: number }

/** Utile = imponibile − materiale − manodopera. Può essere negativo. */
export function calcolaUtile(
  imponibile: number, materiale: number, manodopera: number,
): number

/** Margine % sull'imponibile. 0 quando l'imponibile è 0 (niente divisioni per zero). */
export function margine(imponibile: number, utile: number): number

/** Totali di un gruppo di vendite: lordo, imponibile, costi, utile, margine. */
export function totaliVendite(vendite: VenditaAnonima[]): TotaliVendite
```

Casi limite da coprire nei test: aliquota 0, importo 0, arrotondamento a due
decimali (il lordo deve restare esattamente imponibile + IVA), utile negativo,
elenco vuoto.

## Interfaccia

### Dove

`app/(dashboard)/commesse/[id]/page.tsx`, solo per i blocchi di tipo `commesse`:
un nuovo componente `<SezioniAnonime>` montato **sopra** `<TabellaCommesse>`.
`TabellaCommesse.tsx` (876 righe) non viene toccata.

### Pulsante di creazione

`+ Commesse anonime` sopra la tabella, sempre disponibile: apre
`DialogSezioneAnonima` che chiede solo il nome. Se il blocco non ha sezioni, la
pagina resta identica a oggi — niente riquadri vuoti negli anni senza vendite
online.

### Riquadro sezione

Intestazione: nome, e i totali della sezione — **incassato (lordo)**,
**imponibile**, **materiale**, **manodopera**, **utile**, **margine %**. Menu
con Rinomina ed Elimina; Elimina è disabilitata se la sezione contiene vendite,
com'è già per i blocchi.

Corpo: vendite raggruppate per mese di `data_conferma`, ogni mese apribile e
chiudibile con il proprio sottototale, sullo stesso modello di `ScadenzeView`.
Colonne di riga: data, descrizione, canale, metodo, incassato, materiale,
manodopera, utile. Menu di riga: Modifica, Elimina (con conferma).

Pulsante **Nuova vendita** nell'intestazione della sezione.

### `DialogVenditaAnonima`

Campi: data (default oggi), descrizione, canale, metodo di pagamento, importo
incassato, aliquota IVA (default 22), costo materiale, costo manodopera.

Sotto i campi, un riepilogo aggiornato mentre si digita: imponibile, IVA,
**utile**, margine %. L'utile è mostrato, mai digitabile.

Validazione: importo > 0, data valorizzata, costi ≥ 0, aliquota ≥ 0.

Il canale resta un campo di riga anche se le sezioni hanno un nome: la sezione
organizza, il canale classifica la singola vendita.

## Integrazione con il resto del gestionale

### Entrano da sole (nessuna modifica)

- Fatturato mensile (`aggregaMese` legge `commesse.totale`)
- Incassi e flusso di cassa (`aggregaFlussoMese` legge `acconti_commessa`)
- Grafico costi e utili (`aggregaCostiUtiliMese` legge le colonne `*_manuale`)
- Totale e conteggio della card del blocco in `app/(dashboard)/commesse/page.tsx`
- Riepilogo crediti/debiti (vi entrano con residuo zero, che è il valore giusto)

### Filtro `.eq('anonima', false)` da aggiungere

| File | Funzione | Perché |
|---|---|---|
| `actions/produzione.ts:~129` | `getCommessePerOrdine` | Non ordinabili a fornitore |
| `actions/produzione.ts:~199` | elenco cruscotto produzione | Nessuna scheda in produzione |
| `actions/commesse.ts` | `getCommesse(gruppoId)` | Fuori dalla tabella del blocco |
| `actions/banche.ts:~296` | `getCommessePerAnticipo` | Non collegabili a un anticipo |
| `actions/banche.ts:~344` | acconti selezionabili per anticipo | Idem, sugli incassi |
| `actions/calendario.ts:~441` | `getCommesseAperte` | Fuori dal calendario |
| `actions/dashboard.ts:~101` | feed "ultime commesse" e "ultimi acconti" | Sommergerebbero il feed |

`calendario.ts` filtra già per `STATI_COMMESSA_PRODUZIONE`, che non contiene
`'concluso'`: il filtro esplicito è una cintura di sicurezza, non l'unica
difesa. `dashboard.ts` va filtrato **solo nei due feed di attività recente**: i
totali aggregati della dashboard devono continuare a comprendere le vendite.

Le letture per `id` (`produzione.ts:~169`, `~308`, `banche.ts:~455`) non vanno
toccate: risolvono etichette per record già selezionati.

### Due correzioni in `app/(dashboard)/commesse/statistiche/page.tsx`

1. `contaCommesseSenzaPreventivo` conterebbe ogni vendita anonima come
   "commessa senza preventivo", gonfiando l'indicatore. Le anonime vanno escluse
   dall'insieme su cui si calcola.
2. `clientiUnici` e `resocontoCliente` riempirebbero il selettore clienti con
   una voce per sezione. Il resoconto è per cliente reale: le anonime restano
   fuori da entrambi.

Entrambe agiscono sull'array già caricato, non su nuove query.

## File

**Nuovi**
- `supabase/migrations/20260831HHMMSS_commesse_anonime.sql`
- `lib/vendite-anonime.ts` + `lib/vendite-anonime.test.ts`
- `actions/vendite-anonime.ts` — `getSezioniAnonime(gruppoId)`,
  `createSezione`, `renameSezione`, `deleteSezione`, `createVendita`,
  `updateVendita`, `deleteVendita`
- `components/commesse/SezioniAnonime.tsx`
- `components/commesse/DialogSezioneAnonima.tsx`
- `components/commesse/DialogVenditaAnonima.tsx`

**Modificati**
- `types/commessa.ts` — `SezioneAnonima`, `VenditaAnonima`, `VenditaAnonimaInput`;
  tre campi nuovi su `Commessa`
- `app/(dashboard)/commesse/[id]/page.tsx` — carica e monta `<SezioniAnonime>`
- `app/(dashboard)/commesse/statistiche/page.tsx` — le due correzioni
- `actions/commesse.ts`, `actions/produzione.ts`, `actions/banche.ts`,
  `actions/calendario.ts`, `actions/dashboard.ts` — i filtri

## Verifica

- Vitest su `lib/vendite-anonime.ts` (scorporo, utile, margine, totali, limiti)
- `npm run lint` e `npm run build` puliti
- A mano, su una vendita di prova: compare nel fatturato del mese giusto, nel
  flusso di cassa alla data giusta, nel grafico costi/utile; **non** compare in
  `/produzione`, nel calendario, nella tabella commesse del blocco, tra le
  commesse e gli acconti selezionabili per un anticipo; il totale della card del
  blocco la include; il riepilogo crediti/debiti non le attribuisce residuo

## Fuori perimetro

Import CSV da eBay o dall'e-commerce, riconciliazione automatica col conto
corrente, inserimento inline stile foglio di calcolo, allegati per riga. Se
l'inserimento a dialog risulterà lento sul volume reale, l'inline si valuterà
allora, con i numeri in mano.
