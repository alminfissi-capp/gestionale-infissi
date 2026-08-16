# Incassi vs pagamenti e riepilogo crediti/debiti — Design

Data: 2026-08-16
Stato: approvato dall'utente, pronto per il piano di implementazione

## Obiettivo

Nella pagina `/commesse/statistiche` ("Grafici e statistiche"):

1. Trasformare il grafico **Incassi** in **"Incassi e pagamenti"**, che confronta mese per
   mese i soldi entrati con quelli usciti.
2. Aggiungere un riepilogo **"Crediti e debiti"**: la posizione dell'azienda a oggi, cioè
   quanto deve ancora incassare e quanto deve ancora pagare.

Nessuna nuova tabella e nessuna migrazione: i dati esistono già tutti.

## Da dove vengono i due flussi

| Flusso | Sorgente | Data di riferimento |
|---|---|---|
| Incassi | `acconti_commessa.importo` | `data_pagamento` |
| Pagamenti | `scadenze.importo` | `data_scadenza` |

Le scadenze sono le uscite dell'azienda (fornitori, finanziamenti, assegni, utenze). La
pagina Grafici oggi **non le carica**: va aggiunta la query.

### Quali scadenze contano come pagamento

Solo quelle con `pagato = true` e `annullata = false`, così il grafico confronta soldi
realmente usciti con soldi realmente entrati. Le scadenze annullate restano fuori da
qualunque totale, coerentemente col resto del modulo.

`data_scadenza` è la data prevista, non quella dell'effettivo pagamento: sulle scadenze non
esiste un campo separato per quest'ultima. Il grafico quindi attribuisce il pagamento al
mese in cui era dovuto. È un'approssimazione accettabile e va **detta nell'interfaccia**,
non nascosta.

Invariante utile: nel database non esiste nessuna scadenza pagata senza data (verificato:
105 pagate, 0 senza data), perché una scadenza esce dal blocco "da programmare" solo
quando riceve data e spunta insieme — vedi `project_scadenze_da_programmare`.

## Determinismo della data

Il riepilogo dipende da "oggi", ma le funzioni pure **non devono chiamare `new Date()`**:
la data va calcolata nel Server Component e passata come stringa ISO `YYYY-MM-DD`.
Altrimenti i test non sono riproducibili e il risultato cambia fra server e client.

## Logica pura — `lib/statistiche-commesse.ts`

### Nuovo tipo in ingresso

```ts
export type ScadenzaRow = {
  data_scadenza: string | null
  importo: number
  pagato: boolean
  annullata: boolean
}
```

`DatiStatistiche` si estende con `scadenze: ScadenzaRow[]` e `oggi: string`.

### `aggregaFlussoMese(acconti, scadenze, anno): PuntoFlusso[]`

Sostituisce `aggregaIncassiMese`, che ha un solo chiamante. Restituisce 12 righe:

```ts
export type PuntoFlusso = { mese: string; incasso: number; pagamento: number; saldo: number }
```

- `incasso`: acconti il cui anno di `data_pagamento` è quello selezionato (logica invariata)
- `pagamento`: scadenze pagate e non annullate, sul mese di `data_scadenza`
- `saldo`: `incasso − pagamento`

### `riepilogoCreditiDebiti(commesse, acconti, scadenze, oggi): RiepilogoFinanziario`

```ts
export type RiepilogoFinanziario = {
  crediti: number
  debitiScaduti: number
  debitiAnno: number
  debitiFuturi: number
  debitiDaProgrammare: number
  debitiTotali: number
  posizioneNetta: number
}
```

**Crediti** — somma per commessa di `max(0, totale − acconti incassati)`. Il floor a zero
è deliberato: una commessa incassata in eccesso non deve mascherare il credito di
un'altra. Le commesse `in_attesa` sono già escluse a monte dal Server Component.

**Debiti** — solo scadenze `pagato = false` e `annullata = false`, divise per orizzonte
rispetto a `oggi`:

| Secchio | Criterio |
|---|---|
| `debitiScaduti` | `data_scadenza < oggi` |
| `debitiAnno` | `data_scadenza >= oggi` e stesso anno di `oggi` |
| `debitiFuturi` | anno successivo a quello di `oggi` o oltre |
| `debitiDaProgrammare` | `data_scadenza is null` |

La divisione per orizzonte non è cosmetica: dei €522.885 di debiti attuali, €382.500 sono
rate di finanziamento che arrivano fino al 2031. Un totale unico farebbe leggere come
emergenza quella che è esposizione pluriennale normale.

**Posizione netta** = `crediti − (debitiScaduti + debitiAnno + debitiDaProgrammare)`.

Le rate oltre l'anno restano fuori dal netto ma dentro `debitiTotali`, così il numero
guardato ogni giorno risponde a "quest'anno reggo?" senza perdere il quadro completo.
Le scadenze da programmare pesano nel netto: sono debiti veri, semplicemente non ancora
collocati nel calendario.

## Interfaccia

### Grafico "Incassi e pagamenti — {anno}"

Sostituisce la Card "Incassi". Due barre affiancate per mese, sotto i totali dell'anno:
incassato, pagato e saldo di cassa. Gli incassi mantengono il colore sky già in uso; i
pagamenti prendono un colore distinto e leggibile accanto ad esso. Continua a seguire il
selettore anno in cima alla pagina.

### Card "Crediti e debiti"

Collocata subito **dopo** il grafico di flusso — sono entrambi "cassa" — e prima di
Costi/Utili. Porta in evidenza l'etichetta **a oggi**, perché a differenza di ogni altra
sezione della pagina **non segue il selettore dell'anno**: senza quell'etichetta la
discrepanza sembrerebbe un difetto.

Struttura: crediti in cima, i quattro secchi dei debiti, il totale debiti, e infine la
posizione netta evidenziata. Gli importi scaduti vanno marcati visivamente: sono l'unica
riga che richiede un'azione immediata.

## Test — `lib/statistiche-commesse.test.ts`

Il file non esiste ancora: va creato.

- aggregazione mensile di incassi e pagamenti, con `saldo` coerente
- esclusione delle scadenze annullate e di quelle non pagate dal grafico
- crediti: floor a zero per commessa, con un caso di sovra-incasso che non deve
  compensare il credito di un'altra commessa
- i quattro secchi dei debiti rispetto a un `oggi` fisso, compresi i confini
  (scadenza esattamente oggi → `debitiAnno`, non scaduta; 31 dicembre → anno; 1 gennaio
  successivo → futuri)
- posizione netta, verificando che le rate future ne restino fuori
- casi limite: date nulle, anno senza dati, liste vuote

## Fuori ambito

- Nessun filtro per categoria di scadenza nel grafico
- Nessuna nuova voce nel selettore degli anni
- Nessuna modifica ai grafici Andamento commesse, Costi/Utili e Resoconto cliente

## Nota sui dati attuali

Selezionando il **2025** le barre dei pagamenti risultano a zero: la prima scadenza
registrata è del 10 gennaio 2026. È la realtà dei dati, non un difetto da compensare.
