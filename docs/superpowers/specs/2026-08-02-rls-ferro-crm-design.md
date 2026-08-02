# Isolamento per organizzazione: tabelle Ferro e crm_sessions — Design

Data: 2026-08-02
Stato: da eseguire in una sessione dedicata

## Obiettivo

Il controllo di sicurezza Supabase, eseguito dopo la migrazione `calcoli_incassi`,
ha segnalato due situazioni sulle tabelle del modulo Ferro e su `crm_sessions`.
Questo documento fissa cosa è stato realmente verificato, cosa va cambiato e cosa
invece è già corretto e non va toccato.

**Nessuno dei due punti è una falla attiva oggi**: nel database esiste una sola
organizzazione (`organizations` ha 1 riga). Il problema delle tabelle Ferro è
latente e diventa reale il giorno in cui viene aggiunta una seconda azienda.

## Stato attuale rilevato

Verificato direttamente sul database di produzione (`xawyrtqclpeylxnhwhwo`),
non dedotto dal codice.

### Tabelle Ferro

| Tabella | Righe | `organization_id` | Policy attuale |
|---------|-------|-------------------|----------------|
| `ferro_sezioni_piene`   | 34 | assente | `ferro_sezioni_piene_auth` — `FOR ALL USING (true)` |
| `ferro_sezioni_colonna` |  3 | assente | `ferro_sezioni_colonna_auth` — `FOR ALL USING (true)` |
| `ferro_binari`          |  0 | assente | `ferro_binari_auth` — `FOR ALL USING (true)` |
| `ferro_accessori`       | 14 | assente | `ferro_accessori_auth` — `FOR ALL USING (true)` |
| `ferro_preventivi`      |  0 | assente | `ferro_preventivi_auth` — `FOR ALL USING (true)` |

Le policy vengono da `supabase/migrations/066_ferro_rls_policies.sql`. Sono
`USING (true)` **e** `WITH CHECK (true)` per il ruolo `authenticated`: qualsiasi
utente autenticato, di qualunque organizzazione, può leggere, modificare e
cancellare queste righe.

Il punto che rende la cosa rilevante: `components/ferro/FerroCalcolatore.tsx`
interroga queste tabelle **direttamente dal browser** con `createClient()`
(righe 356-359, 480, 513-516, 534-537) e le modifica tramite `makeCrud` (riga 377).
Non c'è uno strato di server action con `getOrgId()` come nel resto del progetto.
Qui la policy RLS è l'unica barriera esistente.

### crm_sessions

| Colonna | Tipo |
|---------|------|
| `id` | `text` (chiave fissa `'main'`) |
| `cookies` | `jsonb` — cookie di sessione del CRM + `nOrdine` |
| `updated_at` | `timestamptz` |

RLS abilitata, **zero policy**. Letta solo lato server da
`getScraperPreventivo` (`actions/magazzino.ts:842-857`) tramite
`createServiceClient()`, che ha il service role e quindi ignora la RLS. Scritta
dallo scraper esterno.

## Decisione: crm_sessions non va toccata

L'avviso `rls_enabled_no_policy` è di livello INFO e segnala il caso in cui
qualcuno ha acceso la RLS dimenticando le policy. **Qui la situazione è invece
quella giusta.**

RLS accesa senza policy significa che nessuno, né anonimo né autenticato, può
leggere la tabella attraverso l'API pubblica. È esattamente il comportamento che
serve per una tabella che contiene cookie di sessione e a cui accede solo il
service role. Aggiungere una policy per far tacere l'avviso **peggiorerebbe** la
sicurezza.

Azione prevista: nessuna modifica al database. Si aggiunge un commento SQL sulla
tabella che documenta la scelta, così alla prossima verifica non si riapre la
discussione:

```sql
COMMENT ON TABLE crm_sessions IS
  'Solo service role: contiene i cookie di sessione del CRM. RLS attiva senza
   policy di proposito, per negare ogni accesso via API pubblica.';
```

## Il lavoro vero: isolare le tabelle Ferro

### Modello dati

Per ciascuna delle cinque tabelle:

1. Aggiungere `organization_id uuid` con FK a `organizations(id) ON DELETE CASCADE`.
2. Riempire le righe esistenti con l'unica organizzazione presente.
3. Portare la colonna a `NOT NULL` (possibile solo dopo il riempimento).
4. Sostituire la policy permissiva con quella per organizzazione.

L'ordine conta: mettere `NOT NULL` prima di riempire fa fallire la migrazione
sulle 51 righe già presenti.

### Il default che evita di riscrivere il client

Gli inserimenti partono dal browser (`makeCrud.onAdd` fa
`db.from(table).insert(item)` con l'oggetto che arriva dal form) e non
conoscono l'organizzazione. Due strade:

**Consigliata — default sulla colonna:**

```sql
ALTER TABLE ferro_sezioni_piene
  ALTER COLUMN organization_id SET DEFAULT get_user_organization_id();
```

Postgres riempie da solo la colonna con l'organizzazione di chi sta scrivendo.
`FerroCalcolatore.tsx` resta invariato e non c'è modo di dimenticarsi il campo in
un punto del codice. Il `WITH CHECK` della policy continua comunque a impedire di
scrivere righe di un'altra organizzazione, anche a chi forzasse il valore a mano.

**Alternativa — passare `organization_id` esplicito dal client.** Coerente con il
resto del progetto, ma richiede di portare l'id fino al componente e di
modificarne tutti i punti di inserimento. Più codice e più occasioni di sbagliare,
per lo stesso risultato.

La decisione va confermata a inizio sessione. Se si sceglie il default, va notato
che `get_user_organization_id()` restituisce `NULL` per una richiesta non
autenticata: la `NOT NULL` sulla colonna fa fallire l'inserimento, che è il
comportamento voluto.

### Policy nuova

Per ognuna delle cinque tabelle, al posto di quella esistente:

```sql
DROP POLICY "ferro_sezioni_piene_auth" ON ferro_sezioni_piene;

CREATE POLICY "org_access" ON ferro_sezioni_piene
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

Il `WITH CHECK` è indispensabile e mancava nell'impostazione originale: senza,
un utente potrebbe scrivere righe attribuite a un'altra organizzazione.

Il nome `org_access` allinea queste tabelle a tutte le altre del progetto.

### Migrazione

File unico `supabase/migrations/<timestamp>_ferro_organization_id.sql`, con le
cinque tabelle trattate nello stesso ordine. Da applicare con
`mcp__supabase__apply_migration`, che ora è disponibile.

## Punto minore: search_path delle funzioni

Sei funzioni `SECURITY DEFINER` hanno `search_path` non fissato
(`get_user_organization_id`, `increment_num_contatore`,
`increment_num_contatore_scorrevoli`, `trg_fn_ca_search_vector`,
`get_reparti_conteggio`, `get_gruppi_conteggio`). È un irrigidimento standard:

```sql
ALTER FUNCTION public.get_user_organization_id() SET search_path = public, pg_temp;
```

Rischio basso — sfruttarlo richiede già di poter creare oggetti in uno schema nel
search_path — ma la correzione è di una riga per funzione e non cambia
comportamento. Va fatto nella stessa sessione, in una migrazione separata, così
se qualcosa si comporta in modo strano è chiaro cosa tornare indietro.

`get_user_organization_id` va trattata per prima e verificata subito: tutte le
policy del progetto dipendono da lei.

## Avvisi esaminati e archiviati

Verificati e giudicati non azionabili. Elencati perché non tornino fuori come
novità alla prossima verifica.

- **`rls_auto_enable()` eseguibile da anonimo.** È la funzione dell'event trigger
  `ensure_rls`, che accende la RLS sulle tabelle appena create. Fuori da un evento
  DDL `pg_event_trigger_ddl_commands()` non restituisce nulla, quindi chiamarla
  direttamente non produce effetti. Da lasciare com'è.
- **`get_user_organization_id()` eseguibile da anonimo.** Il corpo è
  `SELECT organization_id FROM profiles WHERE id = auth.uid()`. Per una richiesta
  anonima `auth.uid()` è `NULL` e la funzione torna `NULL`, il che fa chiudere le
  policy invece di aprirle. Nessuna informazione esce.
- **Bucket pubblici che permettono l'elenco dei file**
  (`cataloghi-brochure`, `preventivi-allegati`). Reale ma di natura diversa:
  riguarda i file, non la RLS, e va valutato sapendo cosa c'è dentro quei bucket.
  Merita una sessione sua.
- **Protezione password compromesse disattivata.** Impostazione di Supabase Auth,
  si attiva dal pannello in un clic. Non è codice, non entra in questo lavoro.

## Verifica

1. Prima della migrazione, fotografare il conteggio righe delle cinque tabelle
   (34 / 3 / 0 / 14 / 0) per confrontarlo dopo.
2. Dopo la migrazione, ricontrollare che i conteggi siano identici e che
   `organization_id` sia valorizzato ovunque:
   `SELECT count(*) FROM ferro_sezioni_piene WHERE organization_id IS NULL` → 0.
3. Rieseguire `get_advisors` di tipo `security`: le cinque voci
   `rls_policy_always_true` devono sparire.
4. Aprire `/ferro` da autenticati e verificare che l'elenco sia ancora popolato,
   che si possa creare una voce nuova e che le si possa cambiare il prezzo: è il
   punto in cui il default sulla colonna dimostra di funzionare.
5. `npm run build`, `npx vitest run`, eslint sui file toccati.

## Fuori scopo

- Riscrivere il modulo Ferro con uno strato di server action come il resto del
  progetto. Sarebbe l'assetto giusto, ma è un lavoro a sé e questa spec serve a
  chiudere il buco di isolamento, non a rifare il modulo.
- I due bucket pubblici e l'impostazione password di Supabase Auth.
- Qualsiasi modifica a `crm_sessions` oltre al commento.
