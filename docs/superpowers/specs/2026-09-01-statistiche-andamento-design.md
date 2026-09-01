# Statistiche — blocchi riordinabili e andamento crediti/debiti

Data: 2026-09-01
Stato: design approvato, da implementare

Due lavori indipendenti sulla stessa pagina, `/commesse/statistiche`. Possono
essere rilasciati separatamente.

---

# Parte 1 — Blocchi riordinabili

## Problema

I sei blocchi della pagina statistiche hanno un ordine fisso deciso nel codice.
Chi guarda soprattutto i crediti deve scorrere oltre tre grafici ogni volta.

## Soluzione

Due frecce nell'intestazione di ogni blocco: un tocco lo sposta di una
posizione, e la freccia si spegne in cima e in fondo. **Non trascinamento**: un
riquadro alto 400px trascinato lungo una pagina lunga è scomodo, soprattutto da
tablet, mentre una freccia è precisa anche col dito.

I blocchi riordinabili sono i sei esistenti: Andamento commesse, Incassi e
pagamenti, Uscite per categoria, Crediti e debiti, Costi e utili, Resoconto per
cliente — più il grafico nuovo della Parte 2, per un totale di sette.

## Dove si salva l'ordine

Colonna `preferenze_statistiche jsonb` su `profiles`, che è già la tabella
per-utente (chiave = `auth.users.id`). L'ordine segue l'account su ogni
dispositivo.

Il valore è una **lista di identificativi di blocco**, non di indici:

```json
{ "ordineBlocchi": ["crediti-debiti", "andamento", "incassi", …] }
```

Così un blocco aggiunto in futuro, che nessun ordine salvato conosce, **si
accoda in fondo invece di sparire**. Un ordine per indici si romperebbe alla
prima aggiunta.

Salvataggio a ogni spostamento, ottimistico: la pagina si riordina subito e la
scrittura parte in sottofondo. Se fallisce, un avviso e l'ordine resta quello
mostrato — non si riordina la pagina sotto le mani di chi sta guardando.

---

# Parte 2 — Grafico andamento crediti e debiti

## Problema

La pagina mostra crediti e debiti come **fotografia di oggi**. Non c'è modo di
vedere se la posizione sta migliorando o peggiorando, né di quanto.

## Soluzione

Un grafico a tre linee — crediti, debiti, posizione netta — col tempo in
orizzontale e gli importi in verticale. Sei periodi:

| Pulsante | Punti |
|---|---|
| 30 giorni | giornalieri |
| 3 mesi | giornalieri |
| 6 mesi | settimanali |
| 12 mesi | settimanali |
| 24 mesi | mensili |
| Tutto | mensili |

La fittezza segue il periodo: oltre i tre mesi una linea giornaliera diventa un
pettine illeggibile.

## Come si ricostruisce la storia

Il gestionale non conserva fotografie del passato: la serie si ricostruisce dai
movimenti, che sono datati.

### Crediti — esatti

A ogni data: per le commesse **già confermate** a quella data e in uno stato che
conta come credito, quanto mancava da incassare contando **solo gli acconti
versati fino a lì**. Residuo per commessa con floor a zero, come già fa il
riquadro esistente: una commessa incassata in eccesso non deve mascherare il
credito di un'altra.

Vanno contati anche gli **incassi in attesa** (`calcoli_incassi`), che il
riquadro "Crediti e debiti" comprende: senza di loro l'ultimo punto della linea
non coinciderebbe mai col riquadro, e il controllo di verifica qui sotto
fallirebbe sempre. Di quelli già incassati non si conosce la data — la tabella ha
`created_at` ma non una data d'incasso — quindi entrano solo i **non ancora
incassati**, aperti dal loro inserimento. È lo stesso filtro del riquadro, e
rende l'ultimo punto esatto; nel passato sono una piccola sottostima.

Una imprecisione da dichiarare nel codice: **lo stato della commessa è quello di
adesso, non quello che aveva allora.** Nella pratica pesa poco — otto stati su
nove contano come credito — ma va scritto, non nascosto.

### Debiti — tre fonti, tutte datate

**Scadenze fornitori.** Una scadenza pesa da quando è stata inserita
(`created_at`) fino alla sua `data_scadenza` **se è spuntata come pagata**,
altrimenti fino a oggi.

Il punto che governa tutto: **la data non chiude il debito da sola, lo chiude la
spunta.** Una scadenza non spuntata resta un debito aperto anche se la data è
passata da mesi. Chi paga in ritardo sposta la data, e la curva scende nel punto
giusto. Non è quindi una stima del sistema: **è una leva in mano all'utente**, e
se le date sono giuste il grafico è esatto.

Le **scadenze non programmate** (senza data) sono il caso più pulito, non il più
difficile: sono debiti aperti dal loro inserimento fino a oggi, senza alcuna
ipotesi. Per l'invariante del modulo — una riga esce dal limbo *solo* acquisendo
una data insieme a `pagato = true` — la combinazione "pagata ma senza data" non
esiste. E la data che riceve pagandola è la data vera del pagamento.

Le **annullate** restano fuori, come in ogni altro totale.

**Dipendenti.** Il debito nasce al **periodo di competenza** della busta paga
(`buste_paga.periodo`, non `created_at`: il debito matura quando matura, anche se
la busta viene registrata in ritardo) per il suo `netto`, e cala con i
`pagamenti_dipendente` alla loro `data_pagamento`. Floor a zero per persona, come
nel riquadro esistente.

**Anticipi fattura.** Il debito nasce alla `data_erogazione` per il suo
`importo`, e cala con gli acconti del cliente collegati in `anticipi_acconti`,
alla `data_pagamento` di ciascuno. Un anticipo con `rimborsato = true` si azzera
alla sua `rimborsato_at`.

### Cosa resta fuori, e perché uno solo

**Il fido di cassa utilizzato**, e nient'altro. `conti_correnti` ha
`saldo_attuale`, un numero aggiornato a mano che vale solo per l'oggi: non esiste
modo di sapere quale fosse tre mesi fa. È la convenzione opposta a quella delle
linee di credito — sul conto si scrive il disponibile, sulla linea si registrano
gli anticipi — ed è per questo che gli anticipi si ricostruiscono e il fido no.

Compare come numero di oggi sotto al grafico, non come linea: una linea piatta
stesa all'indietro sarebbe falsa in ogni punto tranne l'ultimo.

### La posizione netta non coinciderà col riquadro accanto

La terza linea è crediti − debiti **senza il fido**, mentre il riquadro "Crediti
e debiti" della stessa pagina il fido lo conta. I due numeri differiranno.

Va scritto sotto al grafico: due valori chiamati "posizione netta" che non
coincidono, senza spiegazione, sono una trappola per chi legge.

## Impianto

- `lib/andamento-crediti-debiti.ts` — funzione pura che costruisce la serie,
  coperta da Vitest. **File nuovo**: `lib/statistiche-commesse.ts` è già oltre le
  700 righe, e questo è un calcolo con una logica sua.
- `ScadenzaRow` guadagna `created_at`. Senza sapere quando una scadenza è nata,
  una rata inserita ieri risulterebbe un debito di due anni fa.
- La pagina statistiche carica tre insiemi nuovi: `buste_paga`
  (dipendente_id, periodo, netto), `pagamenti_dipendente` (dipendente_id,
  data_pagamento, importo), e i legami `anticipi_acconti`. Tutti con `selectAll`.
- `components/commesse/GraficoAndamento.tsx` — il grafico, con Recharts come gli
  altri della pagina.
- `components/commesse/BloccoStatistica.tsx` — l'involucro con le frecce, così
  `StatisticheCommesse.tsx` non cresce ancora.
- `actions/preferenze.ts` — lettura e scrittura dell'ordine.
- Migration per `profiles.preferenze_statistiche`.

## Verifica

- Vitest su `lib/andamento-crediti-debiti.ts`: crediti a una data con acconti
  prima e dopo; scadenza pagata che si chiude alla sua data; scadenza non pagata
  e scaduta che resta aperta; scadenza senza data aperta fino a oggi; annullata
  esclusa; busta paga che apre al periodo e pagamento che chiude; anticipo che
  cala con gli acconti collegati; serie vuota che non produce NaN; le tre
  granularità.
- `npx tsc --noEmit` pulito, `npm run lint` che resta a zero problemi.
- A mano: confrontare l'ultimo punto delle linee col riquadro "Crediti e debiti",
  che deve coincidere a meno del fido di cassa. È il controllo che smaschera un
  errore di ricostruzione.
- A mano: spostare un blocco, ricaricare, e ritrovarlo dove era; entrare da un
  altro dispositivo e ritrovare lo stesso ordine.

## Fuori perimetro

Il fido di cassa nel tempo, finché non si registra una storia dei saldi. Lo zoom
e la selezione di un intervallo a mano sul grafico. L'esportazione della serie.
Il riordino dei blocchi per organizzazione invece che per utente. Le previsioni
sull'andamento futuro.
