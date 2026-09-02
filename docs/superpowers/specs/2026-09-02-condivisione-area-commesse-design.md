# Condivisione da Android — area Commesse

Data: 2026-09-02
Branch: `feat/condivisione-area-commesse`

## Il problema

Condividendo un PDF da Android, WinStudio compare nel foglio di condivisione e la pagina
`/condividi` mostra un imbuto: prima l'area, poi i passi dell'area. Oggi è acceso **solo il
ramo Produzione** (commessa → tipo documento). Una fattura o un contratto che arrivano sul
telefono devono ancora fare il giro lungo: aprire l'app dal computer, cercare la commessa,
ripescare il file dal file manager.

Serve il ramo **Commesse**: scegli l'area, cerchi la commessa per nome cliente, numero
preventivo o numero commessa, scegli il tipo e il file è dentro.

## Cosa si costruisce

Una nuova area dell'imbuto, `Commesse`, con due passi: ricerca della commessa e scelta del
tipo di documento. Il file finisce in `documenti_commessa` con un `tipo_documento` fra i
cinque già usati dal pulsante Documenti nella scheda commessa, quindi compare esattamente
dove l'utente lo cerca già.

## Perché una nuova area e non un componente condiviso

Le due aree hanno quasi la stessa forma — cerca una commessa, scegli un tipo — e la
tentazione è generalizzare `AreaProduzione` in un componente parametrico. Si scarta:
differiscono per sorgente delle commesse, campi di ricerca e lista dei tipi, quindi
servirebbero quattro parametri. È esattamente il "motore generico di passi" che
l'invariante 3 di [[project-condivisione-android]] dice di non costruire. Con **due** aree
la copia costa meno dell'astrazione; il momento giusto per unificare sarà una terza area
della stessa forma, non questa.

`AreaProduzione` non viene toccata: funziona, ed è stata spedita ieri.

## 1. Tipi di documento: da array locale a costante condivisa

Oggi vivono come array di stringhe dentro `components/commesse/DialogDocumenti.tsx:29`:

```ts
const TIPI = ['fattura', 'nota di credito', 'bolla', 'contratto', 'altro']
```

Si spostano in `types/commessa.ts` come `TIPI_DOCUMENTO_COMMESSA`, coppie valore/etichetta,
sulla falsariga di `TIPI_DOCUMENTO_PRODUZIONE` in `types/produzione.ts`:

```ts
export const TIPI_DOCUMENTO_COMMESSA: { value: string; label: string }[] = [
  { value: 'fattura',         label: 'Fattura' },
  { value: 'nota di credito', label: 'Nota di credito' },
  { value: 'bolla',           label: 'Bolla' },
  { value: 'contratto',       label: 'Contratto' },
  { value: 'altro',           label: 'Altro' },
]
```

**I valori restano identici a quelli di oggi, spazi compresi.** Cambiarli scollegherebbe i
documenti già caricati, che portano quella stringa in `tipo_documento`.

`DialogDocumenti` importa la costante al posto della sua copia, così le due liste non
possono più divergere.

Il filtro `FILTRO_TIPI_PRODUZIONE` in `actions/commesse.ts` non cambia: i documenti
commessa si distinguono già per **non** essere nella lista produzione.

## 2. `lib/ricerca-commesse.ts` — la ricerca, pura

```ts
export type CommessaRicercabile = {
  numero_commessa: string | null
  cliente_nome: string
  numeri_preventivo: string[]
}

export function filtraCommesse<T extends CommessaRicercabile>(
  commesse: T[],
  query: string,
): T[]
```

Usa `normalizzaTesto` da `lib/ricerca-clienti.ts` — minuscolo, accenti via, apostrofi
tipografici normalizzati, spazi compattati — e ne eredita la regola già scelta lì: la query
si spezza in parole e **ogni parola** deve trovare riscontro in almeno uno dei campi, in
qualunque ordine. I campi sono numero commessa, nome cliente e i numeri dei preventivi
collegati.

Così "guarracino 251" trova la commessa anche se le due parole stanno in campi diversi,
cosa che un `includes` sulla concatenazione non garantirebbe in ordine libero.

Query vuota o di soli spazi: restituisce tutte le commesse.

Nessuna dipendenza React o Supabase: gira in Vitest.

## 3. `getCommessePerCondivisione()` — Server Action

In `actions/commesse.ts`, accanto alle altre letture.

Restituisce:

```ts
export type CommessaCondivisione = {
  id: string
  numero_commessa: string | null
  numero_preventivo: string | null   // quello principale, mostrato in elenco
  cliente_nome: string
  numeri_preventivo: string[]        // tutti i collegati, per la ricerca
}
```

Due letture in parallelo, entrambe filtrate per `organization_id`:

1. `commesse` con `anonima = false`, ordinate per `data_conferma` decrescente — le vendite
   online non entrano, come già fa `getCommessePerOrdine` *(scelta dell'utente)*;
2. `preventivi_commessa`, per comporre `numeri_preventivo`.

`numeri_preventivo` raccoglie **tutti** i preventivi collegati *(scelta dell'utente)*, con
la regola di sempre: la junction è la sorgente di verità, la vecchia colonna
`commesse.preventivo_id` vale come ripiego quando la junction non ha righe per quella
commessa. I duplicati e i valori vuoti si scartano.

Entrambe le letture passano da `selectAll()` di `lib/supabase/paginate.ts`: sopra le mille
righe PostgREST tronca in silenzio e certe commesse diventerebbero introvabili senza che
nessuno se ne accorga (vedi [[gotcha-postgrest-max-rows]]).

## 4. `components/condivisione/AreaCommesse.tsx`

Riceve `PassiProps` (`file`, `onFatto`, `onIndietro`) come ogni area. Due passi.

**Primo passo — quale commessa.** Carica l'elenco una volta con `useEffect`, campo di
ricerca con `autoFocus`, filtro dal vivo con `filtraCommesse`. Ogni riga: numero commessa e
cliente in evidenza, numero preventivo sotto, così si vede di aver preso quella giusta.
Primi 50 risultati, come fa già Produzione. Il pulsante in alto torna alla scelta dell'area.

**Secondo passo — che tipo di documento.** I cinque pulsanti da `TIPI_DOCUMENTO_COMMESSA`,
in griglia a due colonne, con lo spinner su quello premuto e gli altri disabilitati durante
il salvataggio. Il pulsante in alto torna alla scelta della commessa.

Il salvataggio passa da `caricaDocumentoCommessa` di `lib/upload-documento.ts`, **non
duplicato**: prima l'upload diretto dal browser, che aggira il limite di ~4,5 MB sul corpo
delle Server Action, poi il ripiego sulla Server Action perché su Android il client può non
avere la sessione. È l'invariante 4 di [[project-condivisione-android]] e vale identica qui.

A salvataggio riuscito: `toast` con il numero della commessa e `onFatto()`, che cancella il
file dal database locale e chiude. In caso di errore, `toast.error` col messaggio
restituito e si resta sul passo, così il file non si perde.

## 5. Una riga in `components/condivisione/aree.ts`

```ts
{
  id: 'commesse',
  label: 'Commesse',
  descrizione: 'Fatture, bolle e contratti di una commessa',
  icona: Briefcase,
  Passi: AreaCommesse,
}
```

`Briefcase` è già l'icona delle commesse nella barra laterale. Produzione resta prima:
non c'è motivo di riordinare.

## 6. Test

`lib/ricerca-commesse.test.ts`:

- match per numero commessa
- match per nome cliente, con accenti e maiuscole diverse
- match per il numero di un preventivo **secondario**, non solo il principale
- due parole che stanno in campi diversi ("guarracino 251")
- query vuota o di soli spazi → tutte
- nessun riscontro → elenco vuoto
- commessa con `numero_commessa` null → non fa esplodere nulla

## Fuori scope

- **`AreaProduzione` non si tocca**, la sua copia locale di `normalizza` compresa.
- **Nessun permesso di modulo sul singolo ramo**: la pagina `/condividi` eredita
  l'autenticazione dal gruppo `(dashboard)`, come già oggi per Produzione.
- **Resta solo Android, con la PWA installata.** Safari non apre il foglio di condivisione
  alle PWA: su iPhone e iPad non funzionerà, e non è una mancanza da colmare.
- Nessuna nuova area oltre a questa: Dipendenti e Magazzino restano spente.
