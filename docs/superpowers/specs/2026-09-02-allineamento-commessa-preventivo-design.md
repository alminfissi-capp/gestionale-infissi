# Allineamento commessa ↔ preventivo

Data: 2026-09-02
Branch: `feat/allineamento-commessa-preventivo`

## Il problema

Il totale di una commessa è una **fotografia**, non un collegamento. Viene copiato dal
preventivo una sola volta, alla conversione (`DialogCommessa.tsx:203-212`). Da lì in poi
`imponibile` e `iva_totale` sono due campi che l'utente compila a mano nella scheda.

`updatePreventivo` (`actions/preventivi.ts:580`) ricalcola tutto sul preventivo e **non
tocca la tabella `commesse`**. Non esiste nessun trigger, né in codice né in Postgres.

Conseguenza osservata il 2026-09-02 sulla commessa `33-2026` (Guarracino Loredana):

| | valore | ultimo aggiornamento |
|---|---|---|
| Preventivo `PRE WIN 251/2026 G` | `totale_finale` 2450, IVA 0 | 2026-09-02 |
| Commessa `33-2026` | `imponibile` 2400, `totale` 2400 | 2026-08-26 |

Il guaio è che le due metà della pagina Statistiche leggono da **sorgenti diverse**:

- **ricavi** (fatturato, andamento, resoconto, crediti, posizione netta) → `commesse.totale`,
  cioè la fotografia: 2400;
- **costi e utile** → ricalcolati dal vivo dagli articoli del preventivo
  (`app/(dashboard)/commesse/statistiche/page.tsx:161-190`): 2450.

Risultato: 50 € di utile senza il ricavo corrispondente, e un credito residuo sottostimato
di 50 €. Serve un modo per accorgersene e un modo per rimediare.

## Cosa si costruisce

Due cose, deliberatamente separate:

1. un **avviso** che segnala le commesse il cui totale non corrisponde più ai preventivi collegati;
2. un **pulsante "Allinea"** che ricopia i totali correnti, su richiesta esplicita.

## Scelte di fondo — da non ribaltare

**Niente allineamento automatico.** `imponibile` e `iva_totale` sulla commessa sono campi
manuali e a volte divergono dal preventivo di proposito (la commessa Guarracino ha IVA 0
mentre il preventivo ha il suo riepilogo). Un trigger che riallinea da solo sovrascriverebbe
in silenzio numeri contabili decisi dall'utente. L'allineamento è sempre un gesto esplicito.

**Il confronto non costa query.** `/commesse/[id]` carica già `getPreventiviPerCommessa()`,
che restituisce `totale_finale` e `iva_totale` **live** di ogni preventivo accettato, e li
passa già a `TabellaCommesse`. Il verdetto si calcola con una funzione pura sui dati già in
pagina. Non va spostato dentro `getCommesse`: `CommessaCompleta` finisce anche nella cache
offline Dexie, e lì un campo derivato diventerebbe stantio proprio quando serve.

**Chi non è confrontabile non viene segnalato.** Se il sistema non può conoscere il valore
di tutti i preventivi collegati, tace: meglio nessun avviso che un avviso falso.

**La scrittura rilegge dal DB.** La server action non si fida dei numeri arrivati dal client:
la pagina può essere aperta da un'ora e i preventivi essere cambiati nel frattempo.

## 1. `lib/allineamento-commessa.ts` — funzione pura

```ts
export type MotivoNonConfrontabile =
  | 'nessun_preventivo'
  | 'preventivi_manuali'
  | 'preventivo_mancante'

export type StatoAllineamento =
  | { tipo: 'allineata' }
  | { tipo: 'non_confrontabile'; motivo: MotivoNonConfrontabile }
  | {
      tipo: 'disallineata'
      totaleCommessa: number
      totalePreventivi: number
      ivaPreventivi: number
      differenza: number // totalePreventivi − totaleCommessa
    }

export function statoAllineamento(
  commessa: CommessaCompleta,
  preventiviById: Map<string, PreventivoPerCommessa>,
): StatoAllineamento
```

Regole, valutate in quest'ordine:

1. commessa `anonima` → `non_confrontabile / nessun_preventivo`
   (le anonime non arrivano mai a `TabellaCommesse`, che filtra `anonima = false`;
   il controllo è difensivo, la funzione è pura e riusabile);
2. **collegamenti**: si usano i `preventivi_collegati` (tabella `preventivi_commessa`).
   Se la lista è vuota ma la riga ha ancora il vecchio `commessa.preventivo_id` valorizzato,
   quello vale come collegamento singolo (retrocompatibilità: la junction è la sorgente di
   verità odierna, `DialogCommessa.tsx:364`, ma le commesse vecchie possono avere solo la colonna);
3. nessun collegamento → `non_confrontabile / nessun_preventivo`;
4. almeno un collegato allegato a mano (`preventivo_id === null`, PDF esterno)
   → `non_confrontabile / preventivi_manuali`;
5. almeno un `preventivo_id` assente da `preventiviById` — preventivo cancellato, oppure
   non più in stato `accettato`, dato che `getPreventiviPerCommessa` filtra
   `.eq('stato', 'accettato')` → `non_confrontabile / preventivo_mancante`;
6. altrimenti `totalePreventivi = Σ totale`, `ivaPreventivi = Σ iva_totale`,
   `differenza = totalePreventivi − totaleCommessa`;
   `|differenza| ≤ 0.01` → `allineata`, altrimenti `disallineata`.

Nessun filtro sullo stato della commessa: si controllano anche le concluse e le annullate,
perché i numeri storici devono restare esatti per le statistiche degli anni passati.

La soglia 0,01 vale come costante esportata (`TOLLERANZA_ALLINEAMENTO`), coerente con le
soglie 0,005 già usate in `TabellaCommesse` per il saldo.

## 2. `allineaCommessaAlPreventivo(commessaId)` — server action

In `actions/commesse.ts`, accanto alle altre azioni sulle commesse.

1. `getOrgId()`, poi legge la commessa filtrando per `organization_id`;
2. ricava i `preventivo_id` collegati con le stesse regole del punto 2 sopra
   (junction, con fallback sulla colonna);
3. rilegge da `preventivi` `id, iva_totale, totale_finale` per quegli id, filtrando per
   `organization_id`. **Non filtra per stato**: se l'utente ha chiesto l'allineamento,
   il preventivo va letto comunque;
4. se non resta nessun preventivo interno → errore parlante, niente scrittura;
5. scrive `iva_totale = Σ iva`, `totale = Σ totale_finale`, `imponibile = totale − iva`,
   `updated_at`;
6. `revalidatePath('/commesse', 'layout')`.

Non tocca acconti, costi manuali, stato, reparti, gruppo. Il saldo si ricalcola da sé,
essendo `totale − Σ acconti`.

Ritorna `{ totale, iva_totale, imponibile }` così l'interfaccia può dire cosa ha scritto.

## 3. Badge nell'elenco commesse

In `components/commesse/TabellaCommesse.tsx`, riga desktop e card mobile, accanto al totale:
un `TriangleAlert` ambra `h-3.5 w-3.5` quando lo stato è `disallineata`, altrimenti niente.

`title` parlante, per esempio:
`"I preventivi collegati valgono ora € 2.450,00 (+50,00). Apri la scheda per allineare."`

Il click apre la scheda della commessa (`setSchedaCommessaId`), che è dove si rimedia.

La mappa `preventiviById` si costruisce una volta sola nel componente, con `useMemo` sulla
prop `preventivi` che già arriva dalla pagina.

## 4. Avviso e pulsante nella scheda

`DialogSchedaCommessa` oggi non riceve i preventivi: si aggiunge la prop
`preventiviById: Map<string, PreventivoPerCommessa>` — la stessa mappa memoizzata del
punto 3, costruita una volta sola in `TabellaCommesse` e passata a entrambi i consumatori.

Sotto il blocco Totale / Imponibile / IVA (`DialogSchedaCommessa.tsx:860-872`):

- **`disallineata`** → striscia ambra con i tre numeri (totale commessa, totale preventivi,
  differenza col segno) e il pulsante **Allinea**;
- **`non_confrontabile / preventivi_manuali`** → nessuna striscia; un pulsante discreto
  *"Allinea ai preventivi interni"* in grigio. Premendolo compare una conferma che dice
  quanti allegati a mano restano fuori dal conto;
- **`allineata`**, **`nessun_preventivo`**, **`preventivo_mancante`** → niente.

Un solo percorso di scrittura: il pulsante chiama sempre `allineaCommessaAlPreventivo`,
poi `router.refresh()` e `toast`. Nessuna scrittura passa dai campi del form.

Il pulsante è disabilitato mentre l'azione è in volo e quando si è offline
(`useOnlineStatus`, già presente nel componente).

## 5. Test

`lib/allineamento-commessa.test.ts`, un caso per ramo:

- commessa e preventivo uguali → `allineata`
- differenza di 50 → `disallineata` con `differenza = 50`
- differenza di 0,004 → `allineata` (tolleranza)
- due preventivi collegati → somma corretta di totale e IVA
- un collegato manuale accanto a uno di sistema → `preventivi_manuali`
- `preventivo_id` non presente nella mappa → `preventivo_mancante`
- nessun collegamento → `nessun_preventivo`
- `preventivi_collegati` vuoto ma `commessa.preventivo_id` valorizzato → usa il fallback
- commessa `anonima` → `nessun_preventivo`

## Fuori scope

- **Blocco riepilogativo in Statistiche.** Valutato e scartato in questa passata: l'avviso
  vive dove si lavora, cioè nell'elenco e nella scheda.
- **Allineamento massivo.** Nessun "allinea tutte": ogni commessa è una decisione contabile.
- **`getPreventiviPerCommessa` non usa `selectAll()`** e quindi si taglia a 1000 righe
  (vedi `gotcha_postgrest_max_rows`). Oggi i preventivi in tutto sono 218, il limite è
  preesistente e resta dov'è.
