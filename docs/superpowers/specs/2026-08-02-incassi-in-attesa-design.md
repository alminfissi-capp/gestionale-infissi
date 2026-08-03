# Incassi in attesa nei Calcoli — Design

Data: 2026-08-02

> **Aggiornamento 2026-08-03** — dopo il primo uso reale il campo
> "incasso concordato" si è rivelato inutile: nessuna delle prime 6 righe
> inserite lo aveva valorizzato. Colonna eliminata dal database e dall'interfaccia,
> la riga ha guadagnato lo spazio. Restano quindi tre campi: creditore, causale,
> ammontare. Il nome del creditore è in grassetto e i campi di testo vanno a capo
> invece di troncare. Le parti di questo documento che parlano di
> `incasso_concordato` e del doppio totale sono superate.

## Obiettivo

Nella pagina Calcoli l'elenco degli incassi possibili nasce solo dalle commesse
stellate. Esistono però entrate che non sono commesse — rimborsi, note di
credito, prestiti da restituire — che oggi non trovano posto da nessuna parte.

Serve una sezione dove annotare a mano queste entrate: chi deve i soldi, una
descrizione, l'ammontare dovuto e, a fianco, l'eventuale incasso concordato.
Inseribile solo da questa pagina, come già avviene per le righe di Giacenze e
liquidità.

## Decisioni

- **Sezione separata sopra la tabella commesse**, con intestazione e totale
  propri. Non si somma ai totali delle commesse: resta un conteggio distinto.
- **Sempre visibile, anche a zero righe.** Le righe si creano solo da qui: se la
  sezione sparisse da vuota non ci sarebbe modo di inserire la prima.
- **Inserimento inline** con "Aggiungi riga" e salvataggio al blur, identico alle
  righe di Giacenze e liquidità. Nessun dialog.
- **Spunta "incassato"** invece della sola cancellazione: la riga resta visibile
  barrata ed esce dai totali, così rimane traccia di cosa è già rientrato. Si
  cancella a mano quando non serve più.
- **Nessuna data prevista.** Non è stata richiesta e la sezione non è un
  scadenzario: le date stanno nelle Scadenze.
- **Nessun legame con le commesse.** Queste entrate esistono proprio perché non
  sono commesse; convertirle in acconti non è nello scopo.

## Modello dati

Nuova tabella `calcoli_incassi`, ricalcata su `calcoli_righe`
(`supabase/migrations/20260613000000_calcoli_righe.sql`).

| Colonna              | Tipo          | Note                                    |
|----------------------|---------------|-----------------------------------------|
| `id`                 | `uuid`        | PK, `gen_random_uuid()`                 |
| `organization_id`    | `uuid`        | NOT NULL, FK `organizations` ON DELETE CASCADE |
| `nome`               | `text`        | NOT NULL DEFAULT `''` — chi deve i soldi |
| `descrizione`        | `text`        | NOT NULL DEFAULT `''`                   |
| `importo`            | `numeric`     | NOT NULL DEFAULT 0 — ammontare dovuto   |
| `incasso_concordato` | `numeric`     | nullable — NULL = non concordato        |
| `incassato`          | `boolean`     | NOT NULL DEFAULT false                  |
| `ordine`             | `int`         | NOT NULL DEFAULT 0                      |
| `created_at`         | `timestamptz` | DEFAULT `now()`                         |
| `updated_at`         | `timestamptz` | DEFAULT `now()`                         |

RLS abilitata con la stessa policy delle tabelle sorelle:
`FOR ALL USING (organization_id = get_user_organization_id())`.

`incasso_concordato` è nullable come `commesse.incasso_previsto`: distingue
"concordato zero" da "non ancora concordato" e lascia l'input vuoto invece che
a `0,00`.

## Tipi TypeScript (`types/commessa.ts`)

```ts
export type IncassoAttesa = {
  id: string
  organization_id: string
  nome: string
  descrizione: string
  importo: number
  incasso_concordato: number | null
  incassato: boolean
  ordine: number
  created_at: string
  updated_at: string
}
```

## Server action (`actions/commesse.ts`)

Accanto alla sezione "Righe Calcoli", stessa forma delle sorelle: `createClient()`,
`getOrgId()`, filtro `organization_id` su ogni query. Nessun `revalidatePath` —
come per `calcoli_righe`, lo stato lo tiene il client.

| Funzione | Firma | Note |
|----------|-------|------|
| `getIncassiAttesa` | `(): Promise<IncassoAttesa[]>` | ordinati per `ordine`, poi `created_at`; `importo` e `incasso_concordato` normalizzati a number |
| `addIncassoAttesa` | `(): Promise<IncassoAttesa>` | riga vuota con `ordine = max+1`, ritorna la riga creata |
| `updateIncassoAttesa` | `(id, campi: { nome, descrizione, importo, incasso_concordato })` | salvataggio al blur |
| `setIncassatoAttesa` | `(id, incassato: boolean)` | spunta |
| `deleteIncassoAttesa` | `(id)` | cestino |

## UI

Nuovo componente client `components/commesse/IncassiAttesa.tsx`, **non** dentro
`TabellaCalcoli.tsx`: quel file è già a ~490 righe e gestisce quattro sezioni,
aggiungerne una quinta lo renderebbe ingestibile. Il nuovo componente riceve
`incassi` come prop e gestisce il proprio stato locale.

Montato in `app/(dashboard)/commesse/calcoli/page.tsx` come fratello sopra
`<TabellaCalcoli>`, dentro un wrapper `space-y-6` per allinearsi al ritmo delle
altre sezioni.

**Struttura del riquadro** — stessa veste di "Giacenze e liquidità":

- Intestazione: icona `HandCoins`, titolo "Incassi in attesa", sottotitolo
  "(entrate che non sono commesse)", pulsante "Aggiungi riga" a destra.
- Riga: `nome` · `descrizione` · `importo` · `incasso_concordato` · spunta
  incassato · cestino. Input testuali con `parseImporto`/`formatImporto` già
  presenti in `TabellaCalcoli` per accettare il formato italiano.
- Riga incassata: testo barrato e attenuato, spunta verde piena.
- Vuoto: messaggio "Nessun incasso in attesa. Usa «Aggiungi riga»…".
- Footer: "Totale in attesa" con due cifre — ammontare in ambra, concordato in
  verde, gli stessi colori che la pagina usa già per "saldo da incassare" e
  "incasso previsto".

**Responsive** — sei campi in fila non stanno su telefono: sotto `sm` la riga va
su due livelli, nome e descrizione sopra, importi e azioni sotto.

**Formato importi** — `parseImporto` e `formatImporto` oggi sono definiti dentro
`TabellaCalcoli.tsx` e servono a entrambi i componenti. Vanno spostati in
`lib/pricing.ts`, accanto a `formatEuro`, e importati dai due file. È logica di
formattazione pura, il posto giusto secondo la convenzione del progetto.

## Totali

Solo le righe con `incassato = false` entrano nei totali:

- **Totale in attesa (ammontare)** = somma di `importo`
- **Totale concordato** = somma di `incasso_concordato`

Restano separati dai totali della tabella commesse: la pagina non ha un totale
generale unico e questa sezione non ne introduce uno.

## Test

`lib/pricing.ts` è già coperto da vitest (`lib/**/*.test.ts`, environment node).
`parseImporto` diventa testabile una volta spostata lì: vanno coperti i formati
italiani ("1.234,56"), il punto decimale ("1234.56"), le migliaia senza decimali
("1.234"), la stringa vuota e il testo non numerico → 0.

Il componente non ha test automatici: il progetto non ha ambiente DOM
configurato (vitest è `environment: node` sui soli `lib/`) e introdurne uno non
rientra in questo lavoro. Verifica manuale sulla pagina Calcoli.

## Fuori scopo

- Data prevista di incasso e promemoria
- Conversione in acconto su commessa
- Allegati o foto sulla riga
- Riordino manuale delle righe (il campo `ordine` c'è, l'interfaccia no)
