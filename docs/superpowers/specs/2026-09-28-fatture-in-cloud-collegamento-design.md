# Collegamento a Fatture in Cloud (fase 1: fatture fornitori)

Data: 2026-09-28

## Obiettivo

Collegare WinStudio a Fatture in Cloud (FiC) tramite le API v2, per organizzazione,
e tenere in WinStudio una copia delle **spese registrate su FiC** (fatture e note di
credito dei fornitori) con le loro rate di pagamento. La sincronizzazione parte
**solo a mano**, dal pulsante "Sincronizza", e l'interfaccia mostra sempre data e ora
dell'ultima sincronizzazione completata.

Il collegamento deve essere alla portata di chi non è un informatico: si genera il
token su FiC, lo si incolla in Impostazioni, si preme Verifica e Salva. Nessuna URL
da configurare, nessuna variabile d'ambiente.

Questa è la fase 1 di un percorso più lungo:

1. **(questa)** collegamento + copia delle fatture fornitori + pagina di consultazione;
2. registrare i pagamenti delle fatture da WinStudio, scrivendoli anche su FiC;
3. collegare le fatture d'acquisto alle commesse per attribuire i costi reali dei
   materiali.

Il modello dati di questa fase non deve impedire la 2 e la 3.

## Cosa non fa

Scelte prese di proposito:

- **niente webhook e niente cron**: WinStudio non si aggiorna mai da solo. Così
  "ultima sincronizzazione" dice il vero, e non c'è un endpoint pubblico da
  proteggere né una sottoscrizione che può scadere senza che nessuno se ne accorga.
  Se servirà, il webhook si aggiunge dopo senza toccare questo modello;
- **niente OAuth**: si usa l'autenticazione a token manuale di FiC (il token non
  scade, può solo essere revocato). Ogni organizzazione incolla il proprio;
- **niente documenti "da registrare"** (pending, casella SdI): solo le spese già
  registrate su FiC. I DDT passivi restano fuori;
- **niente scrittura su FiC** in questa fase: rate e pagamenti in sola lettura.
  Il token però si genera già con la scrittura sulle spese, per non doverlo
  rigenerare nella fase 2;
- **nessun effetto sui numeri esistenti**: statistiche, crediti/debiti, flusso di
  cassa e costi mensili continuano a leggere da `scadenze`. Come far convivere le
  due fonti senza contare due volte lo stesso debito si decide nella fase 2;
- **nessun collegamento a `fornitori`** del magazzino: si salva la fotografia del
  fornitore FiC (nome, partita IVA); l'aggancio è di una fase successiva;
- **il PDF non si archivia**: il link di FiC al file è temporaneo, si chiede al
  momento del clic.

## Il collegamento (Impostazioni → Fatture in Cloud)

Nuova scheda nella pagina `/impostazioni`.

**Scollegato:**

1. istruzioni passo passo: dove si genera il token su FiC (Impostazioni →
   Applicazioni collegate / token manuale) e quali permessi spuntare:
   - Spese (documenti ricevuti): lettura e scrittura, `received_documents:a`;
   - Fornitori: lettura, `entity.suppliers:r`;
   - Impostazioni: lettura, `settings:r` (conti di pagamento, servirà in fase 2);
2. campo **Token** + pulsante **Verifica**: chiama `GET /user/companies` col token.
   Una sola azienda → scelta in automatico; più aziende → menu a tendina;
   nessuna azienda o 401 → messaggio "Token non valido o senza permessi";
3. campo **Sincronizza dal** (data), default 1° gennaio dell'anno precedente;
4. **Salva collegamento**.

**Collegato:**

- "Collegato a *{nome azienda}*" (con ID azienda FiC), token mascherato
  (`••••••••` + ultime 4 cifre), ultima sincronizzazione ed esito;
- **Sincronizza dal**: modificabile solo prima della prima sincronizzazione completata;
- **Sostituisci token**: stesso flusso di Verifica. Se il nuovo token porta a
  un'**azienda diversa**, conferma esplicita ("Le fatture scaricate dall'azienda
  precedente verranno eliminate") e svuotamento di `fatture_fornitori`
  dell'organizzazione: gli ID FiC di aziende diverse non si mescolano;
- **Scollega**: elimina il token dal Vault e la riga di collegamento. Le fatture
  già scaricate restano consultabili; il pulsante Sincronizza si disattiva.

**Stato "da ricollegare":** se una chiamata FiC risponde 401 (token revocato o
permessi tolti), `stato = 'da_ricollegare'` e avviso sia nella scheda sia nella
pagina fatture. Si esce sostituendo il token.

**Permessi:** la scheda si vede con l'accesso a `impostazioni`; salvare, sostituire
e scollegare richiedono l'accesso in **scrittura** a `impostazioni`, verificato
anche lato server nelle Server Action.

## Sicurezza del token

- Il token sta in **Supabase Vault** (`supabase_vault` 0.3.1, già installato):
  cifrato a riposo, chiave gestita da Supabase. Nessuna variabile d'ambiente nuova.
- Accesso tramite tre funzioni Postgres `SECURITY DEFINER` con
  `search_path` fissato, eseguibili **solo da `service_role`**
  (`REVOKE ... FROM public, anon, authenticated`):
  - `fic_salva_token(p_org uuid, p_token text) returns uuid` — crea o sostituisce
    il segreto (nome `fic_token_{org}`), restituisce l'id del segreto;
  - `fic_leggi_token(p_org uuid) returns text`;
  - `fic_elimina_token(p_org uuid) returns void`.
- Le Server Action le chiamano con `createServiceClient()` **dopo** `getOrgId()`,
  passando sempre l'org dell'utente: nessun parametro org arriva dal client.
- Il token in chiaro non esce mai verso il browser: la UI riceve solo le ultime 4
  cifre (salvate in chiaro in `fic_collegamenti.token_finale`).

## Dati

Migrazione unica. Tutte le tabelle hanno `organization_id` con
`DEFAULT get_user_organization_id()` e RLS attiva.

### `fic_collegamenti` — una riga per organizzazione

| Colonna | Tipo | Note |
|---|---|---|
| `organization_id` | uuid PK | → `organizations`, ON DELETE CASCADE |
| `vault_secret_id` | uuid | id del segreto nel Vault |
| `token_finale` | text | ultime 4 cifre, solo per la UI |
| `fic_company_id` | bigint NOT NULL | |
| `fic_company_nome` | text NOT NULL | |
| `sincronizza_dal` | date NOT NULL | |
| `stato` | text NOT NULL | CHECK `attivo` / `da_ricollegare` |
| `sync_in_corso_da` | timestamptz | blocco anti doppio clic |
| `ultima_sync_at` | timestamptz | inizio dell'ultima sincronizzazione **completata** |
| `ultimo_esito` | text | CHECK `ok` / `parziale` / `errore` |
| `ultimo_esito_at` | timestamptz | quando si è chiuso l'ultimo tentativo |
| `ultimo_messaggio` | text | errore o "250 su 1.340, premi di nuovo" |
| `ultimi_conteggi` | jsonb | `{ nuove, aggiornate, eliminate }` |
| `created_at`, `updated_at` | timestamptz | |

RLS: solo `SELECT` per l'organizzazione (serve alla UI per stato e ultima
sincronizzazione). Scritture solo via service role dalle Server Action.

### `fatture_fornitori` — copia delle spese FiC

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `fic_id` | bigint NOT NULL | UNIQUE (`organization_id`, `fic_id`) |
| `tipo` | text NOT NULL | CHECK `fattura` / `nota_credito` (da `expense` / `passive_credit_note`) |
| `numero` | text | `invoice_number` |
| `data` | date NOT NULL | |
| `descrizione` | text | |
| `categoria` | text | categoria FiC |
| `elettronica` | boolean NOT NULL | `e_invoice` |
| `fornitore_fic_id` | bigint | `entity.id` |
| `fornitore_nome` | text NOT NULL | `entity.name` |
| `fornitore_piva` | text | `entity.vat_number` |
| `importo_netto` | numeric(12,2) NOT NULL | |
| `importo_iva` | numeric(12,2) NOT NULL | |
| `ritenuta` | numeric(12,2) NOT NULL DEFAULT 0 | `amount_withholding_tax` |
| `altra_ritenuta` | numeric(12,2) NOT NULL DEFAULT 0 | `amount_other_withholding_tax` |
| `importo_lordo` | numeric(12,2) NOT NULL | `amount_gross` |
| `prossima_scadenza` | date | `next_due_date` |
| `fic_updated_at` | timestamptz NOT NULL | per riconoscere le modifiche |
| `fic_dati` | jsonb NOT NULL | documento FiC completo |
| `sincronizzata_at` | timestamptz NOT NULL | |

Gli importi si salvano **col segno di FiC**; la UI mostra le note di credito in
negativo (segno applicato in un solo punto, `lib/fic/mappa.ts`). Da verificare sul
primo dato reale se FiC restituisce già negativi gli importi delle note di credito.

Indici: (`organization_id`, `data`), (`organization_id`, `fornitore_nome`).
RLS: `SELECT` per l'organizzazione; scritture solo via service role.

### `fatture_fornitori_rate`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `fattura_id` | uuid NOT NULL | → `fatture_fornitori`, ON DELETE CASCADE |
| `fic_id` | bigint | id della rata su FiC |
| `importo` | numeric(12,2) NOT NULL | |
| `scadenza` | date | |
| `stato` | text NOT NULL | CHECK `pagata` / `da_pagare` (da `paid` / `not_paid`) |
| `pagata_il` | date | |
| `conto_fic_id` | bigint | `payment_account.id` |
| `conto_nome` | text | `payment_account.name` |
| `ordine` | int NOT NULL | posizione nell'elenco FiC |

RLS come sopra.

### Tre regole da non rompere

1. **FiC comanda.** Le tre tabelle vengono riscritte da FiC a ogni sincronizzazione.
   Tutto ciò che in futuro sarà solo di WinStudio (collegamento a commessa, note)
   va in **tabelle separate**, mai in queste colonne.
2. **Una spesa eliminata su FiC viene eliminata anche qui**, con le sue rate
   (cascade).
3. **Le eliminazioni avvengono solo se l'elenco FiC è stato letto per intero.**

## Sincronizzazione

Codice puro in `lib/fic/` (nessuna dipendenza da Supabase o React), chiamato da
`actions/fatture-in-cloud.ts`:

- `lib/fic/client.ts` — `fetch` verso `https://api-v2.fattureincloud.it`, header
  `Authorization: Bearer`, paginazione, errori tipizzati (`FicNonAutorizzato`,
  `FicTroppeRichieste` con `retryAfter`, `FicErrore`), conteggio chiamate;
- `lib/fic/mappa.ts` — documento FiC → riga `fatture_fornitori` + righe rate;
- `lib/fic/confronto.ts` — dati elenco FiC + dati locali → `{ nuove, modificate, eliminate }`;
- `lib/fic/stato-pagamento.ts` — rate → `pagata` / `parziale` / `da_pagare` / `scaduta`.

### Passi di `sincronizzaFattureFornitori()`

1. **Permesso**: scrittura su `fatture_fornitori`. Collegamento presente e `attivo`.
2. **Blocco**: se `sync_in_corso_da` è di meno di 5 minuti fa → errore "Sincronizzazione
   già in corso". Altrimenti lo imposta a `now()` (update condizionato, per evitare
   la corsa fra due clic). Il blocco si toglie sempre alla fine (`finally`).
3. **Istante di partenza** `t0 = now()`.
4. **Elenco leggero**: `GET /c/{company}/received_documents` per `type=expense` e per
   `type=passive_credit_note`, filtro `date >= sincronizza_dal`, campi `id,updated_at`,
   `per_page=100`, tutte le pagine.
5. **Confronto** con `fic_id, fic_updated_at` locali:
   nuove (su FiC, non qui), modificate (`updated_at` diverso), eliminate (qui, non su FiC).
6. **Dettaglio** di nuove e modificate, con le rate, entro un **budget** di chiamate
   (default 250, per restare sotto le 300 chiamate ogni 5 minuti di FiC) e di tempo
   (si ferma a 240 s, sotto il limite della funzione Vercel).
7. **Scrittura** (service role): upsert su (`organization_id`, `fic_id`); per ogni
   fattura toccata, rate cancellate e reinserite; delete delle eliminate (solo se il
   passo 4 è completo, e lo è sempre quando si arriva qui).
8. **Esito**:
   - tutto dettagliato → `ultimo_esito = 'ok'`, **`ultima_sync_at = t0`**;
   - budget esaurito → `'parziale'`, messaggio "Sincronizzate X fatture su Y: premi di
     nuovo Sincronizza per continuare", `ultima_sync_at` invariato;
   - errore → `'errore'`, messaggio, `ultima_sync_at` invariato.
   Sempre: `ultimo_esito_at`, `ultimi_conteggi`.

Ripresa: il giro successivo rifà l'elenco e il confronto trova da solo quelle che
mancano o sono cambiate. Nessuno stato di ripresa da salvare.

**Da verificare al primo passo dell'implementazione, col token reale:**

- se l'elenco con `fieldset=detailed` include già `payments_list`: in tal caso il
  passo 6 si fa con l'elenco (100 fatture per chiamata) invece che con una chiamata
  per fattura;
- la sintassi del filtro `q` sulla data;
- che FiC non abbia restrizioni per indirizzo IP (quindi prova possibile anche in locale);
- il segno degli importi delle note di credito.

### Errori

| Caso | Effetto |
|---|---|
| 401 | `stato = 'da_ricollegare'`, esito `errore`, avviso in UI |
| 429 | stop, salvataggio del già scaricato, esito `parziale` "Troppe richieste a Fatture in Cloud, riprova fra qualche minuto" |
| rete / 5xx | esito `errore`, nessuna scrittura parziale delle eliminazioni |

## Pagina `/fatture-fornitori`

- Nuovo modulo permesso `fatture_fornitori` ("Fatture fornitori"): aggiunto a
  `MODULI_APP`, `MODULO_LABELS`, `PERMESSI_ADMIN`, `PERMESSI_VUOTI` e al CHECK di
  `user_permissions.modulo` (migrazione). Voce nella sidebar.
- `requireAccesso('fatture_fornitori')`; il pulsante Sincronizza richiede la scrittura.

**Testata:** pulsante **Sincronizza** + "Ultima sincronizzazione: gg/mm/aaaa hh:mm ·
N nuove, N aggiornate, N eliminate". Esito parziale o errore in evidenza. Senza
collegamento o con `da_ricollegare`: pulsante disattivato e link a Impostazioni →
Fatture in Cloud.

**Elenco:** data, numero, fornitore, tipo, imponibile, IVA, totale, prossima
scadenza, stato pagamento. Filtri: anno, ricerca (fornitore o numero), stato
pagamento. Totali del filtrato in fondo. Su mobile, schede. Letture con
`selectAll()` (limite 1000 righe di PostgREST).

**Dettaglio (dialog):** dati fattura, fornitore con partita IVA, tabella rate in
sola lettura, pulsante **Apri PDF** → Server Action che chiede a FiC il documento
(`GET /c/{company}/received_documents/{id}`) e restituisce `attachment_url`;
se non c'è allegato, pulsante assente (`fic_dati.attachment_url` al momento della
sync dice se esiste).

## File

- `supabase/migrations/20260928100000_fatture_in_cloud.sql`
- `lib/fic/client.ts`, `mappa.ts`, `confronto.ts`, `stato-pagamento.ts` (+ `.test.ts`)
- `types/fatture-fornitori.ts`
- `actions/fatture-in-cloud.ts` (collegamento: verifica, salva, sostituisci, scollega;
  sincronizzazione; URL PDF) e `actions/fatture-fornitori.ts` (letture per la pagina)
- `components/impostazioni/SezioneFattureInCloud.tsx`
- `components/fatture-fornitori/` — `ElencoFattureFornitori.tsx`,
  `BarraSincronizzazione.tsx`, `DialogFatturaFornitore.tsx`
- `app/(dashboard)/fatture-fornitori/page.tsx`
- `types/permessi.ts`, sidebar

## Test

Vitest:

- `confronto`: nuove, modificate, eliminate, nessuna differenza;
- `mappa`: fattura, nota di credito, più rate, rata pagata con conto, entity senza P.IVA;
- `stato-pagamento`: pagata, parziale, da pagare, scaduta (con data di riferimento iniettata);
- `client`: paginazione, 401 → `FicNonAutorizzato`, 429 → `FicTroppeRichieste` con `retryAfter`;
- regola: la sincronizzazione non elimina nulla se l'elenco è incompleto.

Prova end-to-end col token reale di ALM, in produzione o in locale se FiC non
limita gli IP.
