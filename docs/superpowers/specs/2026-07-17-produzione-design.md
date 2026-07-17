# Sezione Produzione — Design

**Data:** 2026-07-17
**Branch:** `produzione`
**Stato:** approvato il modello dati; interfaccia e fasi da confermare

## Obiettivo

Dare alle commesse un lato operativo: i documenti tecnici e gli ordini ai fornitori.
Oggi il modulo Commesse copre il lato amministrativo (acconti, saldo, fatture) e non
esiste alcun posto dove registrare cosa è stato ordinato, a chi, e se è arrivato.

## Contesto verificato sul database di produzione (2026-07-17)

Numeri reali, non ipotesi — condizionano il disegno:

| Tabella | Righe | Conseguenza |
|---|---|---|
| `commesse` | 101 | dati vivi, la sezione ci si aggancia |
| `documenti_commessa` | 124 | archivio già in uso, da riusare non duplicare |
| `fornitori` | 16 (7 con email, 7 con telefono) | anagrafica riusabile; email copre meno della metà |
| `articoli_magazzino` | 0 | **anagrafica vuota: le righe d'ordine non possono agganciarsi al magazzino** |
| `varianti_prodotto` | 0 | idem |
| `movimenti_magazzino` | 0 | il modulo Magazzino è costruito ma non usato |

I 124 documenti esistenti hanno 5 tipi, tutti amministrativi:
`preventivo` (63), `fattura` (54), `documento` (4), `altro` (2), `contratto` (1).

## Decisioni

1. **Documenti divisi per ruolo, archivio unico.** Commesse resta l'amministrativo,
   Produzione l'operativo. Stessa tabella `documenti_commessa`, stesso bucket
   `commesse-docs`, filtro su `tipo_documento`. Nessuna migrazione dei 124 file.
2. **Righe d'ordine a testo libero, con suggerimenti.** L'anagrafica magazzino è
   vuota: agganciarcisi renderebbe la sezione inutilizzabile finché non viene
   popolata a mano. Le descrizioni già usate per un fornitore vengono suggerite,
   così l'anagrafica si costruisce con l'uso.
3. **PDF generato dall'app**, scaricabile da subito; invio via email in fase
   successiva, visibile solo per i fornitori che hanno l'indirizzo.
4. **Schermata principale a cruscotto**: prima ciò che richiede azione, poi le
   commesse in lavorazione.

## Modello dati

### Tabella `ordini_fornitore`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID NOT NULL → `organizations` | multi-tenancy |
| `commessa_id` | UUID NOT NULL → `commesse(id)` ON DELETE CASCADE | FK vera |
| `fornitore_id` | UUID → `fornitori(id)` ON DELETE SET NULL | |
| `numero_ordine` | TEXT NOT NULL DEFAULT `''` | progressivo `AAAA-NNN`, proposto ma editabile |
| `data_ordine` | DATE NOT NULL DEFAULT CURRENT_DATE | |
| `data_consegna_prevista` | DATE NULL | alimenta "in ritardo" |
| `stato` | TEXT NOT NULL DEFAULT `'da_ordinare'` | CHECK: `da_ordinare`, `ordinato`, `arrivato`, `annullato` |
| `pdf_path` | TEXT NULL | in `commesse-docs` |
| `inviato_at` | TIMESTAMPTZ NULL | valorizzata all'invio email |
| `note` | TEXT NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ DEFAULT NOW() | |

Indici: `(organization_id, stato)`, `(commessa_id)`, `(fornitore_id)`.

### Tabella `righe_ordine_fornitore`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | |
| `ordine_id` | UUID NOT NULL → `ordini_fornitore(id)` ON DELETE CASCADE | |
| `organization_id` | UUID NOT NULL | coerente con le altre tabelle figlie |
| `descrizione` | TEXT NOT NULL | testo libero |
| `quantita` | NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK > 0 | |
| `unita_misura` | TEXT NOT NULL DEFAULT `'pz'` | |
| `prezzo_unitario` | NUMERIC(10,4) NULL | può mancare (ordine senza prezzi) |
| `ordine` | INT NOT NULL DEFAULT 0 | ordinamento righe |

RLS su entrambe con `organization_id = get_user_organization_id()`, quattro policy
(select/insert/update/delete) come da `058_commesse.sql`.

### Totali

Non salvati in colonna: calcolati dalle righe in `lib/produzione.ts`. Un totale
salvato diverge dalle righe alla prima modifica non intercettata.

### Suggerimenti descrizioni

Nessuna tabella: `SELECT DISTINCT descrizione FROM righe_ordine_fornitore` join
`ordini_fornitore` filtrato per `fornitore_id`, ordinato per frequenza. La memoria è
un effetto collaterale dei dati già inseriti.

### Tipi documento

Costante condivisa in `types/produzione.ts`:

- **Amministrativi** (Commesse): `preventivo`, `fattura`, `contratto`, `documento`, `altro`
- **Produzione**: `disegno`, `scheda_tecnica`, `ddt`, `conferma_ordine`, `foto`, `ordine_fornitore`

`ordine_fornitore` è il tipo assegnato ai PDF generati dall'app. Il campo resta TEXT
libero a DB (nessun CHECK): i 5 valori esistenti restano validi e non serve migrare.

## Interfaccia

### `/produzione` — cruscotto

Due fasce verticali:

1. **Da fare** — ordini con `stato = 'da_ordinare'`, e ordini **in ritardo**, definiti
   come `data_consegna_prevista < oggi AND stato IN ('da_ordinare','ordinato')`.
   Un ordine `arrivato` non è mai in ritardo. Se non c'è nulla, la fascia sparisce
   invece di mostrare una lista vuota.
2. **Commesse in lavorazione** — le commesse con `stato = 'in_lavorazione'`, ognuna con
   il conteggio di ordini aperti e documenti. Click → dettaglio.

### `/produzione/[commessaId]` — spazio di produzione della commessa

Intestazione con numero commessa e cliente, poi due blocchi:

- **Ordini fornitore** — tabella degli ordini della commessa (fornitore, numero, stato,
  consegna prevista, totale), con azioni: nuovo, modifica, PDF, cambia stato, elimina.
- **Documenti di produzione** — stessa UX del `DialogDocumenti` esistente, filtrata sui
  tipi di produzione.

### Dialog ordine

Testata (fornitore, numero, date, stato, note) più righe editabili inline con
autocomplete sulla descrizione. Totale calcolato a schermo mentre scrivi.

## PDF

`@react-pdf/renderer` lato client, come i preventivi. Intestazione con i dati
dell'organizzazione da `settings`, dati fornitore, righe, totale, note. Alla
generazione il file viene caricato in `commesse-docs`, `pdf_path` valorizzato, e
compare tra i documenti della commessa come `ordine_fornitore`.

## Email

Resend (già configurato). Il pulsante appare solo se `fornitore.email` è valorizzata —
oggi 7 fornitori su 16. All'invio valorizza `inviato_at` e porta lo stato a `ordinato`.

## File

- `supabase/migrations/2026071X_produzione_ordini.sql`
- `types/produzione.ts` — OrdineFornitore, RigaOrdine, StatoOrdine, TIPI_DOCUMENTO_*
- `lib/produzione.ts` — puro: `calcolaTotaleOrdine`, `isInRitardo`, `prossimoNumeroOrdine`
- `actions/produzione.ts` — CRUD ordini/righe, cruscotto, suggerimenti, upload PDF
- `components/produzione/` — CruscottoProduzione, ProduzioneCommessa, DialogOrdine,
  RigheOrdine, DocumentiProduzione, OrdinePDF
- `app/(dashboard)/produzione/page.tsx` (sostituisce il placeholder), `[commessaId]/page.tsx`

Vincoli da rispettare (già appresi altrove nel progetto):

- Upload via server action con `FormData` + service client, non dal browser: è la
  scelta che fa funzionare i caricamenti da iOS/Android. Path
  `{orgId}/{commessaId}/{timestamp}.{ext}`, limite 20 MB, fallback MIME per estensione.
- `params` è una `Promise` (Next.js 16) → `await params`.
- Ogni action chiama `getOrgId()` da `@/lib/auth`; le pagine chiamano
  `requireAccesso('produzione')`.
- Note multiriga mostrate con `whitespace-pre-line`.

## Fasi

Ogni fase è utilizzabile da sola e si chiude con un commit.

1. **Fondamenta** — migration, tipi, `lib/produzione.ts` con i test della logica pura.
2. **Ordini** — actions CRUD + dettaglio commessa + dialog ordine con righe e
   suggerimenti. A fine fase registri già gli ordini a mano.
3. **Cruscotto** — la home di `/produzione` con "da fare" e commesse in lavorazione.
4. **Documenti di produzione** — upload e tipi nel dettaglio commessa.
5. **PDF** — generazione, download, salvataggio in `commesse-docs`.
6. **Email** — invio via Resend ai fornitori con indirizzo.

## Fuori scopo

- Aggancio degli ordini al magazzino e carico automatico delle giacenze: l'anagrafica
  è vuota, se ne riparla se e quando verrà popolata.
- Portali fornitori, EDI, importazione automatica delle conferme d'ordine.
- Fasi di avanzamento produzione (taglio, assemblaggio, posa): non richieste.
- Modifica di come Commesse gestisce i suoi documenti amministrativi.
