# Design — "Altri Dipendenti"

Data: 2026-07-12
Modulo: Dipendenti (estensione)

## Obiettivo

Gestire i lavoratori per cui **non** si caricano buste paga né contabili bonifico (nessun PDF): stipendio dovuto e pagamenti inseriti **tutti a mano**, con cadenza **settimanale** oppure **mensile** scelta per singolo lavoratore. La funzione è una **sezione separata** raggiunta da un pulsante nero "Altri Dipendenti" nella pagina Dipendenti, e **non modifica** il flusso esistente (dipendenti con buste/bonifici).

## Decisioni confermate (brainstorming)

1. **Stipendio a voci manuali** (gemello manuale delle buste): il dovuto = somma delle voci inserite. Nessun importo ricorrente automatico.
2. **Abbinamento per periodo**: residuo calcolato riga per riga sul periodo (come i mesi delle buste), non come semplice saldo totale.
3. **Cadenza fissa per dipendente**: alla creazione si sceglie `settimanale` **oppure** `mensile`; tutti i suoi stipendi e pagamenti seguono quella cadenza (niente cadenze miste).
4. **Settimana = lunedì→domenica**: si sceglie una data qualsiasi e il sistema la aggancia alla settimana (lunedì) che la contiene.

## Modello dati (nuove tabelle Supabase)

### `altri_dipendenti`
| colonna | tipo | note |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid | FK org, RLS |
| nome | text | |
| cognome | text | |
| cadenza | text | `'settimanale'` \| `'mensile'` (CHECK) |
| attivo | boolean | default true |
| note | text null | |
| created_at | timestamptz | default now() |

### `movimenti_altro_dipendente`
| colonna | tipo | note |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid | FK org, RLS |
| altro_dipendente_id | uuid | FK `altri_dipendenti` ON DELETE CASCADE |
| tipo | text | `'stipendio'` \| `'pagamento'` (CHECK) |
| periodo | date | **chiave canonica**: mensile → `YYYY-MM-01`; settimanale → lunedì della settimana `YYYY-MM-DD` |
| importo | numeric | > 0 |
| data_pagamento | date null | valorizzata solo per `tipo='pagamento'` (data effettiva del pagamento) |
| metodo | text null | `'contanti'`\|`'bonifico'`\|`'altro'`, solo per i pagamenti |
| note | text null | |
| created_at | timestamptz | default now() |

- **RLS**: policy per `organization_id` come le altre tabelle del progetto (`get_user_organization_id()`).
- **Permessi**: modulo `dipendenti` (riuso `assertAccessoDipendenti(scrittura?)` da `lib/permessi-dipendenti.ts`) in ogni action.
- Nessun bucket storage (nessun file).

## Logica di calcolo (pura, `lib/altri-dipendenti.ts`)

- **Normalizzazione periodo** dato una data e la cadenza:
  - `mensile` → primo giorno del mese (`YYYY-MM-01`).
  - `settimanale` → lunedì della settimana che contiene la data (settimana lunedì–domenica).
- **`calcolaRigheAltro(movimenti, cadenza)`** → righe per `periodo`:
  - `dovuto = Σ importi tipo 'stipendio'`, `pagato = Σ importi tipo 'pagamento'`, `residuo = dovuto − pagato`.
  - Ordinate dal periodo più recente; include periodi con soli pagamenti (dovuto 0 → residuo negativo).
- **`calcolaSaldoAltro(movimenti)`** → `{ dovuto, pagato, residuo, periodi_aperti }` (periodi con residuo > 0). Arrotondamento a 2 decimali come in `lib/dipendenti.ts`.
- **Etichette periodo**:
  - mensile → `formatPeriodo` esistente ("luglio 2026").
  - settimanale → "Settimana dal lun 07/07 al dom 13/07".

## Server Actions (`actions/altri-dipendenti.ts`)

- `getAltriDipendenti()` → lista con saldo (`AltroDipendenteConSaldo`).
- `getAltroDipendente(id)` → dettaglio + movimenti.
- `createAltroDipendente(input)` / `updateAltroDipendente(id, input)` / `deleteAltroDipendente(id)`.
- `addMovimentoAltro(input)` (tipo stipendio o pagamento; il periodo viene normalizzato server-side dalla data scelta + cadenza del dipendente) / `deleteMovimentoAltro(id)`.
- Tutte: `assertAccessoDipendenti(true)` per le scritture, `assertAccessoDipendenti()` per le letture; filtro `organization_id`; `revalidatePath('/dipendenti', 'layout')`.

## UI

- **`/dipendenti`**: nella riga azioni in alto, **accanto al pulsante "+ Nuovo dipendente"**, un pulsante nero **"Altri Dipendenti"** (`bg-black text-white`, icona `Users`) → `/dipendenti/altri`.
- **`/dipendenti/altri`** (`PaginaAltriDipendenti`): tabella `Dipendente · Cadenza · Dovuto · Pagato · Da pagare` (stile identico a `PaginaDipendenti`, `formatEuro`, colore residuo rosso/verde); pulsante "Nuovo altro dipendente" apre `DialogAltroDipendente` (nome, cognome, cadenza, attivo, note). Riga → `/dipendenti/altri/[id]`.
- **`/dipendenti/altri/[id]`** (`DettaglioAltroDipendente`): intestazione con nome, badge cadenza, saldo (dovuto/pagato/residuo); pulsanti **"Aggiungi stipendio"** e **"Aggiungi pagamento"** (aprono `DialogMovimento`); tabella dei periodi (settimana o mese) con dovuto/pagato/residuo, espandibile per vedere le singole voci ed eliminarle; pulsanti Modifica/Elimina dipendente.
- **`DialogMovimento`** campi:
  - **Stipendio**: `periodo` (una data che si aggancia a settimana/mese secondo la cadenza, etichetta mostrata sotto il campo), `importo`, `note`.
  - **Pagamento**: `periodo di competenza` (stessa logica di aggancio → definisce l'abbinamento), `importo`, `data_pagamento` (data effettiva del pagamento, default oggi), `metodo`, `note`. La competenza e la data effettiva sono distinte: si può pagare a luglio una competenza di giugno.

## Tipi (`types/dipendente.ts`)

- `CadenzaAltro = 'settimanale' | 'mensile'`
- `TipoMovimentoAltro = 'stipendio' | 'pagamento'`
- `AltroDipendente`, `AltroDipendenteInput`
- `MovimentoAltroDipendente`, `MovimentoAltroInput`
- `AltroDipendenteCompleto = { dipendente, movimenti }`

## File

- `supabase/migrations/<timestamp>_altri_dipendenti.sql`
- `types/dipendente.ts` (append nuovi tipi)
- `lib/altri-dipendenti.ts` (calcolo puro, no React/Supabase)
- `actions/altri-dipendenti.ts`
- `app/(dashboard)/dipendenti/altri/page.tsx`, `app/(dashboard)/dipendenti/altri/[id]/page.tsx`
- `components/dipendenti/PaginaAltriDipendenti.tsx`, `DettaglioAltroDipendente.tsx`, `DialogAltroDipendente.tsx`, `DialogMovimento.tsx`

## Statistiche (futuro)

Questi lavoratori **entreranno** nelle statistiche/calcoli aziendali futuri. Per **questa** implementazione ci concentriamo solo sulla creazione (CRUD + saldo), ma il modello dati è pensato per essere aggregabile in seguito (importi, periodi e cadenza già normalizzati). L'implementazione delle statistiche è un lavoro separato successivo.

## Fuori scope (per ora)

- Nessun PDF, upload o anteprima.
- Nessuna cadenza mista sullo stesso dipendente.
- Nessuna implementazione di statistiche/aggregati in questa fase (solo predisposizione dati).
- Nessun matching automatico (non esistono buste/bonifici da abbinare).
