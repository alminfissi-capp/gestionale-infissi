# Collegamento Fatture in Cloud (fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare ogni organizzazione di WinStudio al proprio account Fatture in Cloud con un token incollato in Impostazioni, e tenere una copia locale delle spese FiC (fatture e note di credito fornitori, con le rate) aggiornata col pulsante "Sincronizza".

**Architecture:** Il token sta cifrato in Supabase Vault, letto solo da funzioni Postgres `SECURITY DEFINER` eseguibili dal service role. La logica FiC è codice puro in `lib/fic/` (client HTTP con `fetch` iniettabile, mappatura, confronto, orchestrazione della sincronizzazione con un archivio astratto), testata con Vitest. Le Server Action in `actions/fatture-in-cloud.ts` fanno permessi, blocco anti doppio clic e collegano `lib/fic/sincronizza.ts` alle tabelle Supabase. Due UI: scheda in `/impostazioni` e pagina `/fatture-fornitori`.

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (Postgres, RLS, Vault), Fatture in Cloud API v2 (`https://api-v2.fattureincloud.it`), shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-fatture-in-cloud-collegamento-design.md`

## Global Constraints

- Nessuna variabile d'ambiente nuova: il token sta in Supabase Vault (`supabase_vault` 0.3.1, già installato).
- Il token in chiaro non arriva mai al browser; la UI vede solo `token_finale` (ultime 4 cifre).
- Sincronizzazione **solo manuale**: niente webhook, niente cron, niente sync all'apertura della pagina.
- "Ultima sincronizzazione" = istante di **partenza** dell'ultima sincronizzazione **completata** (`ultima_sync_at`); parziale ed errore non la aggiornano.
- Solo spese registrate: `type=expense` → `fattura`, `type=passive_credit_note` → `nota_credito`. Niente pending, niente DDT.
- Nessuna scrittura su FiC in questa fase.
- FiC comanda: `fatture_fornitori` e `fatture_fornitori_rate` si riscrivono a ogni sync; dati solo-WinStudio andranno in tabelle separate.
- Eliminazioni locali solo dopo aver letto per intero l'elenco FiC.
- Nessun effetto su statistiche, crediti/debiti, flusso di cassa, costi mensili (continuano a leggere `scadenze`).
- Budget per giro: 250 chiamate FiC, 240 s (limite FiC: 300 chiamate / 5 min; `maxDuration` pagina 300 s).
- Blocco anti doppio clic: 5 minuti.
- Default "Sincronizza dal": 1° gennaio dell'anno precedente; modificabile solo finché `ultima_sync_at` è null.
- Permessi: collegamento = `impostazioni` in scrittura; pagina = `fatture_fornitori` in lettura; Sincronizza = `fatture_fornitori` in scrittura. Sempre verificati lato server.
- Le Server Action restituiscono oggetti `{ ok: false, errore }` invece di lanciare (vedi memoria "Vincoli DB sugli sconti": un throw diventa un errore generico illeggibile).
- Letture di tabelle intere con `selectAll()` di `lib/supabase/paginate.ts` (limite silenzioso di 1000 righe di PostgREST).
- Testi UI in italiano, date `gg/mm/aaaa`, importi con `formatEuro` di `lib/pricing.ts`.

**Scostamenti dalla spec, decisi scrivendo il piano (motivati):**

1. `fic_updated_at` è `text`, non `timestamptz`: FiC restituisce `"2026-09-28 14:32:10"` senza fuso; confrontare la stringa grezza evita falsi "modificati" dovuti a conversioni di fuso.
2. Colonna in più `ha_allegato boolean` su `fatture_fornitori`, e `fic_dati` salvato **senza** `attachment_url` / `attachment_preview_url` (URL temporanei, inutili da conservare).
3. L'elenco si chiede subito con `fieldset=detailed` (100 fatture per chiamata) invece che "solo id + data": se FiC include già `payments_list` nell'elenco, la chiamata per singola fattura non serve mai; se non lo include, `sincronizza()` la fa da sola per le sole nuove/modificate, entro il budget. Il comportamento visibile è quello della spec.
4. Importi delle note di credito salvati **negativi** con `-Math.abs(x)` in `lib/fic/mappa.ts` (unico punto), qualunque segno usi FiC. Le rate restano positive.

## Review Focus

- Token incollato con spazi o a capo attorno → va ripulito (`trim`) prima di verificarlo e salvarlo. `verificaTokenFic` e `salvaCollegamentoFic` fanno `trim` (Task 7); verifica manuale nel Task 8, Step 4.
- Spesa FiC senza fornitore (`entity` null) o senza partita IVA → la riga si salva con `fornitore_nome = '(senza fornitore)'` e `fornitore_piva = null`, non fallisce l'intero giro. Test in Task 5.
- Due clic ravvicinati su Sincronizza (stessa persona o due utenti) → il secondo riceve "Sincronizzazione già in corso", niente doppie scritture. Blocco condizionato in Task 7, verifica manuale in Task 10.
- Errore di rete a metà dell'elenco FiC (pagina 2 di 5) → nessuna fattura locale eliminata. Test in Task 6.
- Primo scaricamento più grande del budget → giro parziale con "Sincronizzate X fatture su Y: premi di nuovo Sincronizza per continuare", e il giro dopo riprende dalle mancanti senza rifare le già scaricate. Test in Task 6.

---

## Mappa dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260928100000_fatture_in_cloud.sql` | 3 tabelle, RLS, funzioni Vault, CHECK permessi |
| `types/fatture-fornitori.ts` | tipi condivisi UI/actions |
| `types/permessi.ts`, `lib/permessi.ts`, `components/layout/Sidebar.tsx` | nuovo modulo `fatture_fornitori` |
| `lib/fic/tipi.ts` | forma dei documenti FiC grezzi |
| `lib/fic/client.ts` | HTTP verso FiC, paginazione, errori tipizzati, contatore chiamate |
| `lib/fic/mappa.ts` | documento FiC → righe DB |
| `lib/fic/stato-pagamento.ts` | rate → stato pagamento; data di oggi a Roma |
| `lib/fic/confronto.ts` | nuove / modificate / eliminate |
| `lib/fic/sincronizza.ts` | orchestrazione di un giro, archivio astratto, messaggio parziale |
| `actions/fatture-in-cloud.ts` | collegamento, sincronizzazione, URL PDF |
| `actions/fatture-fornitori.ts` | letture per la pagina |
| `components/impostazioni/SezioneFattureInCloud.tsx` | scheda Impostazioni |
| `components/fatture-fornitori/BarraSincronizzazione.tsx` | pulsante + ultima sincronizzazione |
| `components/fatture-fornitori/ElencoFattureFornitori.tsx` | filtri, tabella/schede, totali |
| `components/fatture-fornitori/DialogFatturaFornitore.tsx` | dettaglio, rate, Apri PDF |
| `app/(dashboard)/fatture-fornitori/page.tsx` | pagina |

---

### Task 1: Sonda delle API FiC col token reale

Serve a confermare quattro assunzioni prima di scrivere il client. **Richiede il token dell'utente**: chiedergli di generarlo su Fatture in Cloud (Impostazioni → Applicazioni collegate → token manuale) con i permessi `received_documents:a`, `entity.suppliers:r`, `settings:r`, e di incollarlo in chat o in un file del scratchpad. Non salvarlo nel repo.

**Files:**
- Create (scratchpad, non nel repo): `sonda-fic.mjs`

**Interfaces:**
- Consumes: niente.
- Produces: note di esito, riportate nel messaggio di commit del Task 4 e nel PRD al Task 10.

- [ ] **Step 1: Scrivere la sonda nello scratchpad**

```js
// sonda-fic.mjs — uso: FIC_TOKEN=... node sonda-fic.mjs
const token = process.env.FIC_TOKEN?.trim()
if (!token) throw new Error('FIC_TOKEN mancante')
const base = 'https://api-v2.fattureincloud.it'
const qs = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
async function get(path, params = {}) {
  const url = `${base}${path}${Object.keys(params).length ? '?' + qs(params) : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  console.log('GET', url, '→', res.status, 'Retry-After:', res.headers.get('Retry-After'))
  return res.json()
}
const companies = await get('/user/companies')
console.log(JSON.stringify(companies, null, 2).slice(0, 1500))
const companyId = companies.data.companies[0].id
for (const type of ['expense', 'passive_credit_note']) {
  const list = await get(`/c/${companyId}/received_documents`, {
    type, fieldset: 'detailed', per_page: '100', page: '1', sort: 'id', q: "date >= '2025-01-01'",
  })
  console.log(type, 'current_page', list.current_page, 'last_page', list.last_page, 'total', list.total, 'righe', list.data?.length)
  const d = list.data?.[0]
  if (d) {
    console.log('chiavi:', Object.keys(d).join(', '))
    console.log('payments_list nell\'elenco:', Array.isArray(d.payments_list))
    console.log('esempio:', JSON.stringify({ id: d.id, date: d.date, updated_at: d.updated_at, amount_net: d.amount_net, amount_gross: d.amount_gross, entity: d.entity, payments_list: d.payments_list, attachment_url: d.attachment_url ? 'presente' : null }, null, 2))
    const one = await get(`/c/${companyId}/received_documents/${d.id}`, { fieldset: 'detailed' })
    console.log('dettaglio payments_list:', JSON.stringify(one.data?.payments_list, null, 2))
  }
}
```

- [ ] **Step 2: Eseguirla dalla macchina locale**

Run (bash): `FIC_TOKEN='<token>' node "<scratchpad>/sonda-fic.mjs"`
Expected: `/user/companies → 200` (se 401/403 dal locale, FiC limita gli IP: in quel caso le prove end-to-end si fanno solo in produzione, come per openapi.it).

- [ ] **Step 3: Annotare gli esiti e adattare se serve**

Verificare e annotare:
1. Forma di `/user/companies`: atteso `{ data: { companies: [{ id, name, ... }] } }`. Se diversa, adattare `aziende()` nel Task 4.
2. Il parametro si chiama `type` (non `received_document_type`) e `q` con `date >= '...'` filtra davvero (confrontare `total` con e senza `q`). Se `type` è rifiutato, usare il nome che accetta nel Task 4.
3. `payments_list` presente nell'elenco `detailed`? (Il codice funziona in entrambi i casi; cambia solo la velocità del primo scaricamento.)
4. Segno di `amount_net` / `amount_gross` sulle note di credito (il piano li rende comunque negativi).
5. Formato di `updated_at` (atteso `"YYYY-MM-DD HH:MM:SS"`).

Nessun commit in questo task.

---

### Task 2: Migrazione DB (tabelle, Vault, permesso)

**Files:**
- Create: `supabase/migrations/20260928100000_fatture_in_cloud.sql`

**Interfaces:**
- Produces: tabelle `fic_collegamenti`, `fatture_fornitori`, `fatture_fornitori_rate`; RPC `fic_salva_token(p_org uuid, p_token text) → uuid`, `fic_leggi_token(p_org uuid) → text`, `fic_elimina_token(p_org uuid) → void`; valore `'fatture_fornitori'` ammesso in `user_permissions.modulo`.

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- ============================================================
-- 20260928100000_fatture_in_cloud.sql
-- Collegamento a Fatture in Cloud (fase 1): token nel Vault,
-- copia locale delle spese FiC e delle loro rate.
-- FiC comanda: queste tabelle si riscrivono a ogni sincronizzazione.
-- Dati solo-WinStudio (commessa, note) vanno in tabelle separate.
-- ============================================================

-- ---- collegamento: una riga per organizzazione ----
CREATE TABLE fic_collegamenti (
  organization_id   uuid        PRIMARY KEY DEFAULT get_user_organization_id()
                                REFERENCES organizations(id) ON DELETE CASCADE,
  vault_secret_id   uuid,
  token_finale      text        NOT NULL DEFAULT '',
  fic_company_id    bigint      NOT NULL,
  fic_company_nome  text        NOT NULL,
  sincronizza_dal   date        NOT NULL,
  stato             text        NOT NULL DEFAULT 'attivo'
                                CHECK (stato IN ('attivo', 'da_ricollegare')),
  sync_in_corso_da  timestamptz,
  ultima_sync_at    timestamptz,
  ultimo_esito      text        CHECK (ultimo_esito IN ('ok', 'parziale', 'errore')),
  ultimo_esito_at   timestamptz,
  ultimo_messaggio  text,
  ultimi_conteggi   jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fic_collegamenti ENABLE ROW LEVEL SECURITY;
-- Solo lettura: stato e ultima sincronizzazione per la UI.
-- Le scritture passano dal service role nelle Server Action.
CREATE POLICY "fic_collegamenti_select" ON fic_collegamenti
  FOR SELECT USING (organization_id = get_user_organization_id());

-- ---- spese FiC ----
CREATE TABLE fatture_fornitori (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid          NOT NULL DEFAULT get_user_organization_id()
                                   REFERENCES organizations(id) ON DELETE CASCADE,
  fic_id             bigint        NOT NULL,
  tipo               text          NOT NULL CHECK (tipo IN ('fattura', 'nota_credito')),
  numero             text,
  data               date          NOT NULL,
  descrizione        text,
  categoria          text,
  elettronica        boolean       NOT NULL DEFAULT false,
  fornitore_fic_id   bigint,
  fornitore_nome     text          NOT NULL,
  fornitore_piva     text,
  importo_netto      numeric(12,2) NOT NULL,
  importo_iva        numeric(12,2) NOT NULL,
  ritenuta           numeric(12,2) NOT NULL DEFAULT 0,
  altra_ritenuta     numeric(12,2) NOT NULL DEFAULT 0,
  importo_lordo      numeric(12,2) NOT NULL,
  prossima_scadenza  date,
  ha_allegato        boolean       NOT NULL DEFAULT false,
  -- stringa grezza di FiC ("YYYY-MM-DD HH:MM:SS", senza fuso): si confronta cosi' com'e'
  fic_updated_at     text          NOT NULL,
  fic_dati           jsonb         NOT NULL,
  sincronizzata_at   timestamptz   NOT NULL,
  UNIQUE (organization_id, fic_id)
);

CREATE INDEX idx_fatture_fornitori_org_data ON fatture_fornitori (organization_id, data);
CREATE INDEX idx_fatture_fornitori_org_fornitore ON fatture_fornitori (organization_id, fornitore_nome);

ALTER TABLE fatture_fornitori ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fatture_fornitori_select" ON fatture_fornitori
  FOR SELECT USING (organization_id = get_user_organization_id());

-- ---- rate ----
CREATE TABLE fatture_fornitori_rate (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT get_user_organization_id()
                                 REFERENCES organizations(id) ON DELETE CASCADE,
  fattura_id       uuid          NOT NULL REFERENCES fatture_fornitori(id) ON DELETE CASCADE,
  fic_id           bigint,
  importo          numeric(12,2) NOT NULL,
  scadenza         date,
  stato            text          NOT NULL CHECK (stato IN ('pagata', 'da_pagare')),
  pagata_il        date,
  conto_fic_id     bigint,
  conto_nome       text,
  ordine           int           NOT NULL DEFAULT 0
);

CREATE INDEX idx_fatture_fornitori_rate_fattura ON fatture_fornitori_rate (fattura_id);

ALTER TABLE fatture_fornitori_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fatture_fornitori_rate_select" ON fatture_fornitori_rate
  FOR SELECT USING (organization_id = get_user_organization_id());

-- ---- token nel Vault: solo service role ----
CREATE OR REPLACE FUNCTION public.fic_salva_token(p_org uuid, p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_nome text := 'fic_token_' || p_org::text;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_token, v_nome, 'Token Fatture in Cloud');
  ELSE
    PERFORM vault.update_secret(v_id, p_token);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fic_leggi_token(p_org uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'fic_token_' || p_org::text;
$$;

CREATE OR REPLACE FUNCTION public.fic_elimina_token(p_org uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'fic_token_' || p_org::text;
$$;

REVOKE ALL ON FUNCTION public.fic_salva_token(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fic_leggi_token(uuid)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fic_elimina_token(uuid)     FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fic_salva_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fic_leggi_token(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.fic_elimina_token(uuid)     TO service_role;

-- ---- nuovo modulo permesso ----
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_modulo_check
  CHECK (modulo = ANY (ARRAY[
    'dashboard',
    'calendario',
    'preventivi',
    'clienti',
    'listini',
    'cataloghi',
    'rilievo',
    'winconfig',
    'magazzino',
    'commesse',
    'dipendenti',
    'produzione',
    'fatture_fornitori',
    'impostazioni'
  ]::text[]));
```

- [ ] **Step 2: Applicarla al progetto Supabase**

Con l'MCP Supabase: `apply_migration` con `name: "fatture_in_cloud"` e il contenuto del file.
Expected: successo.

- [ ] **Step 3: Verificare permessi delle funzioni e Vault**

Con `execute_sql`:

```sql
select
  has_function_privilege('authenticated', 'public.fic_leggi_token(uuid)', 'execute') as auth_legge,
  has_function_privilege('anon', 'public.fic_leggi_token(uuid)', 'execute')          as anon_legge,
  has_function_privilege('service_role', 'public.fic_leggi_token(uuid)', 'execute')  as service_legge;
```
Expected: `false, false, true`.

Poi un giro completo su un'org fittizia (non tocca dati reali):

```sql
select public.fic_salva_token('00000000-0000-0000-0000-000000000001', 'prova-1') is not null as creato;
select public.fic_salva_token('00000000-0000-0000-0000-000000000001', 'prova-2') is not null as aggiornato;
select public.fic_leggi_token('00000000-0000-0000-0000-000000000001') as letto;
select public.fic_elimina_token('00000000-0000-0000-0000-000000000001');
select public.fic_leggi_token('00000000-0000-0000-0000-000000000001') as dopo;
```
Expected: `true`, `true`, `prova-2`, (vuoto), `null`.

Se `vault.update_secret` o `vault.create_secret` hanno firma diversa sulla versione installata, correggere la funzione e riapplicare.

Infine gli advisor: `get_advisors` (security) — nessun nuovo avviso sulle 3 tabelle (RLS attiva) né sulle funzioni (search_path fissato).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260928100000_fatture_in_cloud.sql
git commit -m "feat(fic): tabelle collegamento e fatture fornitori, token nel Vault"
```

---

### Task 3: Tipi e modulo permesso `fatture_fornitori`

**Files:**
- Create: `types/fatture-fornitori.ts`
- Modify: `types/permessi.ts` (MODULI_APP, MODULO_LABELS, PERMESSI_ADMIN, PERMESSI_VUOTI)
- Modify: `lib/permessi.ts:42-56` (MODULO_HOME)
- Modify: `components/layout/Sidebar.tsx` (import icona + voce NAV_ITEMS)

**Interfaces:**
- Produces (usati da tutti i task successivi):

```ts
export type TipoFatturaFornitore = 'fattura' | 'nota_credito'
export type StatoRata = 'pagata' | 'da_pagare'
export type StatoPagamento = 'pagata' | 'parziale' | 'da_pagare' | 'scaduta'
export type StatoCollegamentoFic = 'attivo' | 'da_ricollegare'
export type EsitoSync = 'ok' | 'parziale' | 'errore'
export type ConteggiSync = { nuove: number; aggiornate: number; eliminate: number }
export type AziendaFic = { id: number; nome: string }
export type CollegamentoFic = { ... }       // vedi Step 1
export type RataFatturaFornitore = { ... }
export type FatturaFornitore = { ... }      // include rate
export type EsitoSincronizzazione = { esito: EsitoSync; messaggio: string; conteggi: ConteggiSync }
```

- [ ] **Step 1: Creare `types/fatture-fornitori.ts`**

```ts
export type TipoFatturaFornitore = 'fattura' | 'nota_credito'
export type StatoRata = 'pagata' | 'da_pagare'
export type StatoPagamento = 'pagata' | 'parziale' | 'da_pagare' | 'scaduta'
export type StatoCollegamentoFic = 'attivo' | 'da_ricollegare'
export type EsitoSync = 'ok' | 'parziale' | 'errore'

export type ConteggiSync = { nuove: number; aggiornate: number; eliminate: number }

export const CONTEGGI_VUOTI: ConteggiSync = { nuove: 0, aggiornate: 0, eliminate: 0 }

/** Azienda raggiungibile col token, da GET /user/companies. */
export type AziendaFic = { id: number; nome: string }

/** Riga di fic_collegamenti come la vede la UI: niente token, niente id del Vault. */
export type CollegamentoFic = {
  fic_company_id: number
  fic_company_nome: string
  token_finale: string
  sincronizza_dal: string
  stato: StatoCollegamentoFic
  sync_in_corso_da: string | null
  ultima_sync_at: string | null
  ultimo_esito: EsitoSync | null
  ultimo_esito_at: string | null
  ultimo_messaggio: string | null
  ultimi_conteggi: ConteggiSync | null
}

export type RataFatturaFornitore = {
  id: string
  fattura_id: string
  fic_id: number | null
  importo: number
  scadenza: string | null
  stato: StatoRata
  pagata_il: string | null
  conto_fic_id: number | null
  conto_nome: string | null
  ordine: number
}

export type FatturaFornitore = {
  id: string
  fic_id: number
  tipo: TipoFatturaFornitore
  numero: string | null
  data: string
  descrizione: string | null
  categoria: string | null
  elettronica: boolean
  fornitore_fic_id: number | null
  fornitore_nome: string
  fornitore_piva: string | null
  importo_netto: number
  importo_iva: number
  ritenuta: number
  altra_ritenuta: number
  importo_lordo: number
  prossima_scadenza: string | null
  ha_allegato: boolean
  sincronizzata_at: string
  rate: RataFatturaFornitore[]
}

export type EsitoSincronizzazione = {
  esito: EsitoSync
  messaggio: string
  conteggi: ConteggiSync
}
```

- [ ] **Step 2: Aggiungere il modulo in `types/permessi.ts`**

In `MODULI_APP` inserire `'fatture_fornitori',` fra `'produzione',` e `'impostazioni',`.
In `MODULO_LABELS` aggiungere `fatture_fornitori: 'Fatture fornitori',` (dopo `produzione`).
In `PERMESSI_ADMIN` aggiungere `fatture_fornitori: 'scrittura',`.
In `PERMESSI_VUOTI` aggiungere `fatture_fornitori: 'nessuno',`.

- [ ] **Step 3: Aggiungere la home del modulo in `lib/permessi.ts`**

In `MODULO_HOME`, dopo `produzione: '/produzione',`:

```ts
  fatture_fornitori: '/fatture-fornitori',
```

- [ ] **Step 4: Voce in sidebar**

In `components/layout/Sidebar.tsx` aggiungere `Receipt,` all'import da `lucide-react`, e in `NAV_ITEMS` dopo la riga di `/produzione`:

```ts
  { href: '/fatture-fornitori',   label: 'Fatture fornitori',   icon: Receipt,         modulo: 'fatture_fornitori' },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (i `Record<ModuloApp, ...>` obbligano ad aver aggiunto la chiave ovunque; se tsc segnala un altro `Record<ModuloApp,…>`, aggiungere lì la voce).

- [ ] **Step 6: Commit**

```bash
git add types/fatture-fornitori.ts types/permessi.ts lib/permessi.ts components/layout/Sidebar.tsx
git commit -m "feat(fic): tipi fatture fornitori e modulo permesso dedicato"
```

---

### Task 4: Client HTTP Fatture in Cloud

**Files:**
- Create: `lib/fic/tipi.ts`
- Create: `lib/fic/client.ts`
- Test: `lib/fic/client.test.ts`

**Interfaces:**
- Consumes: `AziendaFic` da `types/fatture-fornitori.ts`.
- Produces:

```ts
// lib/fic/tipi.ts
export type TipoSpesaFic = 'expense' | 'passive_credit_note'
export type RataFic = { id?: number | null; amount?: number | null; due_date?: string | null; paid_date?: string | null; status?: string | null; payment_account?: { id?: number | null; name?: string | null } | null }
export type DocumentoFic = { id: number; date: string; updated_at: string; ...opzionali }
// lib/fic/client.ts
export const FIC_BASE_URL: string
export class FicNonAutorizzato extends Error
export class FicTroppeRichieste extends Error { retryAfter: number | null }
export class FicErrore extends Error { status: number }
export type FicClient = {
  chiamate: () => number
  aziende: () => Promise<AziendaFic[]>
  elencoSpese: (companyId: number, tipo: TipoSpesaFic, dal: string) => Promise<DocumentoFic[]>
  spesa: (companyId: number, id: number) => Promise<DocumentoFic>
}
export function creaClientFic(token: string, fetchImpl?: typeof fetch): FicClient
```

- [ ] **Step 1: Creare `lib/fic/tipi.ts`**

```ts
/**
 * Forma dei documenti di Fatture in Cloud (API v2) nella parte che usiamo.
 * Tutto opzionale tranne id, date, updated_at: FiC omette o manda null i campi
 * vuoti, e l'elenco "detailed" potrebbe non includere payments_list.
 */
export type TipoSpesaFic = 'expense' | 'passive_credit_note'

export type RataFic = {
  id?: number | null
  amount?: number | null
  due_date?: string | null
  paid_date?: string | null
  status?: string | null
  payment_account?: { id?: number | null; name?: string | null } | null
}

export type EntitaFic = {
  id?: number | null
  name?: string | null
  vat_number?: string | null
} | null

export type DocumentoFic = {
  id: number
  date: string
  updated_at: string
  type?: string | null
  entity?: EntitaFic
  category?: string | null
  description?: string | null
  invoice_number?: string | null
  e_invoice?: boolean | null
  amount_net?: number | null
  amount_vat?: number | null
  amount_withholding_tax?: number | null
  amount_other_withholding_tax?: number | null
  amount_gross?: number | null
  next_due_date?: string | null
  payments_list?: RataFic[] | null
  attachment_url?: string | null
  attachment_preview_url?: string | null
  [altro: string]: unknown
}
```

- [ ] **Step 2: Scrivere i test che falliscono**

`lib/fic/client.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  creaClientFic,
  FicNonAutorizzato,
  FicTroppeRichieste,
  FicErrore,
  FIC_BASE_URL,
} from '@/lib/fic/client'

type Chiamata = { url: string; auth: string | null }

function fetchFinto(risposte: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const chiamate: Chiamata[] = []
  let i = 0
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    chiamate.push({ url: String(input), auth: headers.get('Authorization') })
    const r = risposte[Math.min(i++, risposte.length - 1)]
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
    })
  }) as typeof fetch
  return { impl, chiamate }
}

describe('creaClientFic', () => {
  it('manda il token come Bearer e legge le aziende', async () => {
    const f = fetchFinto([{ status: 200, body: { data: { companies: [{ id: 42, name: 'ALM Infissi srl' }] } } }])
    const c = creaClientFic('tok123', f.impl)
    expect(await c.aziende()).toEqual([{ id: 42, nome: 'ALM Infissi srl' }])
    expect(f.chiamate[0].url).toBe(`${FIC_BASE_URL}/user/companies`)
    expect(f.chiamate[0].auth).toBe('Bearer tok123')
    expect(c.chiamate()).toBe(1)
  })

  it('nessuna azienda → elenco vuoto', async () => {
    const f = fetchFinto([{ status: 200, body: { data: null } }])
    expect(await creaClientFic('t', f.impl).aziende()).toEqual([])
  })

  it('segue la paginazione fino a last_page e codifica il filtro sulla data', async () => {
    const f = fetchFinto([
      { status: 200, body: { current_page: 1, last_page: 2, data: [{ id: 1, date: '2025-02-01', updated_at: 'a' }] } },
      { status: 200, body: { current_page: 2, last_page: 2, data: [{ id: 2, date: '2025-03-01', updated_at: 'b' }] } },
    ])
    const c = creaClientFic('t', f.impl)
    const docs = await c.elencoSpese(42, 'expense', '2025-01-01')
    expect(docs.map((d) => d.id)).toEqual([1, 2])
    expect(c.chiamate()).toBe(2)
    const u = f.chiamate[0].url
    expect(u.startsWith(`${FIC_BASE_URL}/c/42/received_documents?`)).toBe(true)
    expect(u).toContain('type=expense')
    expect(u).toContain('fieldset=detailed')
    expect(u).toContain('per_page=100')
    expect(u).toContain('page=1')
    expect(u).toContain(`q=${encodeURIComponent("date >= '2025-01-01'")}`)
    expect(f.chiamate[1].url).toContain('page=2')
  })

  it('elenco vuoto senza last_page → una sola chiamata', async () => {
    const f = fetchFinto([{ status: 200, body: { data: [] } }])
    const c = creaClientFic('t', f.impl)
    expect(await c.elencoSpese(42, 'passive_credit_note', '2025-01-01')).toEqual([])
    expect(c.chiamate()).toBe(1)
  })

  it('legge il dettaglio di una spesa', async () => {
    const f = fetchFinto([{ status: 200, body: { data: { id: 7, date: '2025-01-05', updated_at: 'x', payments_list: [] } } }])
    const d = await creaClientFic('t', f.impl).spesa(42, 7)
    expect(d.id).toBe(7)
    expect(f.chiamate[0].url).toBe(`${FIC_BASE_URL}/c/42/received_documents/7?fieldset=detailed`)
  })

  it('401 → FicNonAutorizzato', async () => {
    const f = fetchFinto([{ status: 401, body: { error: { message: 'Unauthorized' } } }])
    await expect(creaClientFic('t', f.impl).aziende()).rejects.toBeInstanceOf(FicNonAutorizzato)
  })

  it('429 → FicTroppeRichieste con Retry-After', async () => {
    const f = fetchFinto([{ status: 429, headers: { 'Retry-After': '120' } }])
    const err = await creaClientFic('t', f.impl).aziende().catch((e) => e)
    expect(err).toBeInstanceOf(FicTroppeRichieste)
    expect((err as FicTroppeRichieste).retryAfter).toBe(120)
  })

  it('429 senza Retry-After → retryAfter null', async () => {
    const f = fetchFinto([{ status: 429 }])
    const err = await creaClientFic('t', f.impl).aziende().catch((e) => e)
    expect((err as FicTroppeRichieste).retryAfter).toBeNull()
  })

  it('altri errori → FicErrore col messaggio di FiC', async () => {
    const f = fetchFinto([{ status: 403, body: { error: { message: 'Scope mancante' } } }])
    const err = await creaClientFic('t', f.impl).aziende().catch((e) => e)
    expect(err).toBeInstanceOf(FicErrore)
    expect((err as FicErrore).status).toBe(403)
    expect((err as Error).message).toContain('Scope mancante')
  })
})
```

- [ ] **Step 3: Verificare che falliscano**

Run: `npx vitest run lib/fic/client.test.ts`
Expected: FAIL, modulo `@/lib/fic/client` non trovato.

- [ ] **Step 4: Implementare `lib/fic/client.ts`**

```ts
import type { AziendaFic } from '@/types/fatture-fornitori'
import type { DocumentoFic, TipoSpesaFic } from '@/lib/fic/tipi'

export const FIC_BASE_URL = 'https://api-v2.fattureincloud.it'

/** Oltre questo numero di pagine c'e' un ciclo impazzito, non un archivio. */
const MAX_PAGINE = 500

export class FicNonAutorizzato extends Error {
  constructor() {
    super('Token Fatture in Cloud non valido, revocato o senza i permessi necessari')
    this.name = 'FicNonAutorizzato'
  }
}

export class FicTroppeRichieste extends Error {
  readonly retryAfter: number | null
  constructor(retryAfter: number | null) {
    super('Troppe richieste a Fatture in Cloud')
    this.name = 'FicTroppeRichieste'
    this.retryAfter = retryAfter
  }
}

export class FicErrore extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'FicErrore'
    this.status = status
  }
}

export type FicClient = {
  /** Chiamate HTTP fatte finora da questo client: serve al budget della sincronizzazione. */
  chiamate: () => number
  aziende: () => Promise<AziendaFic[]>
  elencoSpese: (companyId: number, tipo: TipoSpesaFic, dal: string) => Promise<DocumentoFic[]>
  spesa: (companyId: number, id: number) => Promise<DocumentoFic>
}

type RispostaElenco = {
  data?: DocumentoFic[] | null
  current_page?: number
  last_page?: number
}

/**
 * I parametri si codificano a mano con encodeURIComponent: URLSearchParams
 * trasformerebbe gli spazi del filtro `q` in "+", e FiC vuole "%20".
 */
function querystring(parametri: Record<string, string>): string {
  const coppie = Object.entries(parametri).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return coppie.length ? `?${coppie.join('&')}` : ''
}

export function creaClientFic(token: string, fetchImpl: typeof fetch = fetch): FicClient {
  let n = 0

  async function get<T>(percorso: string, parametri: Record<string, string> = {}): Promise<T> {
    n++
    const res = await fetchImpl(`${FIC_BASE_URL}${percorso}${querystring(parametri)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.status === 401) throw new FicNonAutorizzato()
    if (res.status === 429) {
      const secondi = Number(res.headers.get('Retry-After'))
      throw new FicTroppeRichieste(Number.isFinite(secondi) && secondi > 0 ? secondi : null)
    }
    if (!res.ok) {
      let messaggio = `Errore Fatture in Cloud (${res.status})`
      try {
        const corpo = (await res.json()) as { error?: { message?: string } }
        if (corpo?.error?.message) messaggio += `: ${corpo.error.message}`
      } catch {
        // corpo non JSON: resta il messaggio generico
      }
      throw new FicErrore(messaggio, res.status)
    }
    return (await res.json()) as T
  }

  return {
    chiamate: () => n,

    async aziende() {
      const r = await get<{ data?: { companies?: { id: number; name: string }[] | null } | null }>(
        '/user/companies',
      )
      return (r.data?.companies ?? []).map((c) => ({ id: c.id, nome: c.name }))
    },

    async elencoSpese(companyId, tipo, dal) {
      const documenti: DocumentoFic[] = []
      for (let pagina = 1; pagina <= MAX_PAGINE; pagina++) {
        const r = await get<RispostaElenco>(`/c/${companyId}/received_documents`, {
          type: tipo,
          fieldset: 'detailed',
          per_page: '100',
          page: String(pagina),
          sort: 'id',
          q: `date >= '${dal}'`,
        })
        documenti.push(...(r.data ?? []))
        if (!r.last_page || pagina >= r.last_page) return documenti
      }
      throw new FicErrore(`Elenco Fatture in Cloud oltre ${MAX_PAGINE} pagine`, 0)
    },

    async spesa(companyId, id) {
      const r = await get<{ data: DocumentoFic }>(`/c/${companyId}/received_documents/${id}`, {
        fieldset: 'detailed',
      })
      return r.data
    },
  }
}
```

- [ ] **Step 5: Verificare che passino**

Run: `npx vitest run lib/fic/client.test.ts`
Expected: PASS (9 test).

- [ ] **Step 6: Commit**

Il messaggio riporta gli esiti della sonda del Task 1.

```bash
git add lib/fic/tipi.ts lib/fic/client.ts lib/fic/client.test.ts
git commit -m "feat(fic): client API Fatture in Cloud con paginazione ed errori tipizzati"
```

---

### Task 5: Mappatura documenti e stato pagamento

**Files:**
- Create: `lib/fic/mappa.ts`, `lib/fic/stato-pagamento.ts`
- Test: `lib/fic/mappa.test.ts`, `lib/fic/stato-pagamento.test.ts`

**Interfaces:**
- Consumes: `DocumentoFic`, `TipoSpesaFic` (Task 4); tipi di `types/fatture-fornitori.ts` (Task 3).
- Produces:

```ts
// lib/fic/mappa.ts
export type RigaFattura = Omit<FatturaFornitore, 'id' | 'rate'> & { fic_updated_at: string; fic_dati: Record<string, unknown> }
export type RigaRata = Omit<RataFatturaFornitore, 'id' | 'fattura_id'>
export type DocumentoMappato = { fattura: RigaFattura; rate: RigaRata[] }
export const TIPO_DA_FIC: Record<TipoSpesaFic, TipoFatturaFornitore>
export function mappaDocumento(doc: DocumentoFic, tipoFic: TipoSpesaFic, ora: string): DocumentoMappato
// lib/fic/stato-pagamento.ts
export function statoPagamento(rate: Pick<RataFatturaFornitore, 'stato' | 'scadenza'>[], oggi: string): StatoPagamento
export function oggiRoma(adesso?: Date): string   // 'YYYY-MM-DD'
export const ETICHETTA_STATO_PAGAMENTO: Record<StatoPagamento, string>
```

- [ ] **Step 1: Test di `mappa` (falliscono)**

`lib/fic/mappa.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mappaDocumento } from '@/lib/fic/mappa'
import type { DocumentoFic } from '@/lib/fic/tipi'

const ORA = '2026-09-28T12:00:00.000Z'

const doc = (over: Partial<DocumentoFic> = {}): DocumentoFic => ({
  id: 101,
  date: '2026-03-10',
  updated_at: '2026-03-11 09:15:00',
  entity: { id: 9, name: 'Alluminio Sud srl', vat_number: '01234567890' },
  category: 'Materiali',
  description: 'Profili serie 45',
  invoice_number: 'FT 12/2026',
  e_invoice: true,
  amount_net: 1000,
  amount_vat: 220,
  amount_withholding_tax: 0,
  amount_other_withholding_tax: 0,
  amount_gross: 1220,
  next_due_date: '2026-04-30',
  attachment_url: 'https://temporaneo/abc',
  attachment_preview_url: 'https://temporaneo/prev',
  payments_list: [
    { id: 1, amount: 610, due_date: '2026-03-31', paid_date: '2026-03-31', status: 'paid', payment_account: { id: 5, name: 'Intesa' } },
    { id: 2, amount: 610, due_date: '2026-04-30', paid_date: null, status: 'not_paid', payment_account: null },
  ],
  ...over,
})

describe('mappaDocumento', () => {
  it('mappa una fattura con due rate', () => {
    const { fattura, rate } = mappaDocumento(doc(), 'expense', ORA)
    expect(fattura).toMatchObject({
      fic_id: 101,
      tipo: 'fattura',
      numero: 'FT 12/2026',
      data: '2026-03-10',
      descrizione: 'Profili serie 45',
      categoria: 'Materiali',
      elettronica: true,
      fornitore_fic_id: 9,
      fornitore_nome: 'Alluminio Sud srl',
      fornitore_piva: '01234567890',
      importo_netto: 1000,
      importo_iva: 220,
      ritenuta: 0,
      altra_ritenuta: 0,
      importo_lordo: 1220,
      prossima_scadenza: '2026-04-30',
      ha_allegato: true,
      fic_updated_at: '2026-03-11 09:15:00',
      sincronizzata_at: ORA,
    })
    expect(rate).toEqual([
      { fic_id: 1, importo: 610, scadenza: '2026-03-31', stato: 'pagata', pagata_il: '2026-03-31', conto_fic_id: 5, conto_nome: 'Intesa', ordine: 0 },
      { fic_id: 2, importo: 610, scadenza: '2026-04-30', stato: 'da_pagare', pagata_il: null, conto_fic_id: null, conto_nome: null, ordine: 1 },
    ])
  })

  it('non conserva gli URL temporanei degli allegati in fic_dati', () => {
    const { fattura } = mappaDocumento(doc(), 'expense', ORA)
    expect(fattura.fic_dati).not.toHaveProperty('attachment_url')
    expect(fattura.fic_dati).not.toHaveProperty('attachment_preview_url')
    expect(fattura.fic_dati).toHaveProperty('invoice_number', 'FT 12/2026')
  })

  it('nota di credito: importi sempre negativi, qualunque segno mandi FiC', () => {
    const pos = mappaDocumento(doc({ amount_net: 100, amount_vat: 22, amount_gross: 122 }), 'passive_credit_note', ORA)
    const neg = mappaDocumento(doc({ amount_net: -100, amount_vat: -22, amount_gross: -122 }), 'passive_credit_note', ORA)
    for (const { fattura } of [pos, neg]) {
      expect(fattura.tipo).toBe('nota_credito')
      expect(fattura.importo_netto).toBe(-100)
      expect(fattura.importo_iva).toBe(-22)
      expect(fattura.importo_lordo).toBe(-122)
    }
  })

  it('le rate di una nota di credito restano positive', () => {
    const { rate } = mappaDocumento(
      doc({ payments_list: [{ id: 3, amount: -122, due_date: '2026-03-10', status: 'paid', paid_date: '2026-03-10' }] }),
      'passive_credit_note',
      ORA,
    )
    expect(rate[0].importo).toBe(122)
  })

  it('senza fornitore né partita IVA non fallisce', () => {
    const { fattura } = mappaDocumento(doc({ entity: null }), 'expense', ORA)
    expect(fattura.fornitore_nome).toBe('(senza fornitore)')
    expect(fattura.fornitore_piva).toBeNull()
    expect(fattura.fornitore_fic_id).toBeNull()
  })

  it('campi mancanti diventano null o zero, niente allegato', () => {
    const { fattura, rate } = mappaDocumento(
      {
        id: 5,
        date: '2026-01-02',
        updated_at: '2026-01-02 08:00:00',
        entity: { name: '  Ferramenta Rossi  ', vat_number: '' },
      },
      'expense',
      ORA,
    )
    expect(fattura.fornitore_nome).toBe('Ferramenta Rossi')
    expect(fattura.fornitore_piva).toBeNull()
    expect(fattura.numero).toBeNull()
    expect(fattura.importo_netto).toBe(0)
    expect(fattura.importo_lordo).toBe(0)
    expect(fattura.elettronica).toBe(false)
    expect(fattura.ha_allegato).toBe(false)
    expect(rate).toEqual([])
  })

  it('arrotonda i centesimi', () => {
    const { fattura } = mappaDocumento(doc({ amount_net: 10.005, amount_vat: 2.2011, amount_gross: 12.2061 }), 'expense', ORA)
    expect(fattura.importo_netto).toBe(10.01)
    expect(fattura.importo_iva).toBe(2.2)
    expect(fattura.importo_lordo).toBe(12.21)
  })
})
```

- [ ] **Step 2: Test di `stato-pagamento` (falliscono)**

`lib/fic/stato-pagamento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { statoPagamento, oggiRoma } from '@/lib/fic/stato-pagamento'

const OGGI = '2026-09-28'
const r = (stato: 'pagata' | 'da_pagare', scadenza: string | null) => ({ stato, scadenza })

describe('statoPagamento', () => {
  it('tutte pagate → pagata', () => {
    expect(statoPagamento([r('pagata', '2026-01-01'), r('pagata', '2026-02-01')], OGGI)).toBe('pagata')
  })
  it('nessuna pagata, nessuna scaduta → da_pagare', () => {
    expect(statoPagamento([r('da_pagare', '2026-10-31')], OGGI)).toBe('da_pagare')
  })
  it('alcune pagate, le altre non scadute → parziale', () => {
    expect(statoPagamento([r('pagata', '2026-08-31'), r('da_pagare', '2026-10-31')], OGGI)).toBe('parziale')
  })
  it('una non pagata con scadenza passata → scaduta, anche se altre sono pagate', () => {
    expect(statoPagamento([r('pagata', '2026-07-31'), r('da_pagare', '2026-08-31')], OGGI)).toBe('scaduta')
  })
  it('scadenza oggi non è ancora scaduta', () => {
    expect(statoPagamento([r('da_pagare', OGGI)], OGGI)).toBe('da_pagare')
  })
  it('rata non pagata senza scadenza → da_pagare', () => {
    expect(statoPagamento([r('da_pagare', null)], OGGI)).toBe('da_pagare')
  })
  it('nessuna rata → da_pagare', () => {
    expect(statoPagamento([], OGGI)).toBe('da_pagare')
  })
})

describe('oggiRoma', () => {
  it('usa il fuso di Roma: le 23:30 UTC del 28 sono già il 29', () => {
    expect(oggiRoma(new Date('2026-09-28T23:30:00Z'))).toBe('2026-09-29')
  })
})
```

- [ ] **Step 3: Verificare che falliscano**

Run: `npx vitest run lib/fic/mappa.test.ts lib/fic/stato-pagamento.test.ts`
Expected: FAIL, moduli non trovati.

- [ ] **Step 4: Implementare `lib/fic/mappa.ts`**

```ts
import type {
  FatturaFornitore,
  RataFatturaFornitore,
  TipoFatturaFornitore,
} from '@/types/fatture-fornitori'
import type { DocumentoFic, TipoSpesaFic } from '@/lib/fic/tipi'

export type RigaFattura = Omit<FatturaFornitore, 'id' | 'rate'> & {
  fic_updated_at: string
  fic_dati: Record<string, unknown>
}
export type RigaRata = Omit<RataFatturaFornitore, 'id' | 'fattura_id'>
export type DocumentoMappato = { fattura: RigaFattura; rate: RigaRata[] }

export const TIPO_DA_FIC: Record<TipoSpesaFic, TipoFatturaFornitore> = {
  expense: 'fattura',
  passive_credit_note: 'nota_credito',
}

const cent = (v: number | null | undefined): number => Math.round((v ?? 0) * 100) / 100
const testo = (v: string | null | undefined): string | null => {
  const t = v?.trim()
  return t ? t : null
}

/**
 * Documento FiC → righe di fatture_fornitori e fatture_fornitori_rate.
 * Unico punto in cui si decide il segno: le note di credito sono sempre
 * negative (riducono il costo), le rate restano positive.
 */
export function mappaDocumento(doc: DocumentoFic, tipoFic: TipoSpesaFic, ora: string): DocumentoMappato {
  const tipo = TIPO_DA_FIC[tipoFic]
  const segno = (v: number | null | undefined) => (tipo === 'nota_credito' ? -Math.abs(cent(v)) : cent(v))

  // Gli URL degli allegati sono temporanei: conservarli non serve, il PDF si chiede al clic.
  const { attachment_url, attachment_preview_url, ...resto } = doc
  void attachment_preview_url

  const fattura: RigaFattura = {
    fic_id: doc.id,
    tipo,
    numero: testo(doc.invoice_number),
    data: doc.date,
    descrizione: testo(doc.description),
    categoria: testo(doc.category),
    elettronica: doc.e_invoice === true,
    fornitore_fic_id: doc.entity?.id ?? null,
    fornitore_nome: testo(doc.entity?.name) ?? '(senza fornitore)',
    fornitore_piva: testo(doc.entity?.vat_number),
    importo_netto: segno(doc.amount_net),
    importo_iva: segno(doc.amount_vat),
    ritenuta: cent(doc.amount_withholding_tax),
    altra_ritenuta: cent(doc.amount_other_withholding_tax),
    importo_lordo: segno(doc.amount_gross),
    prossima_scadenza: doc.next_due_date ?? null,
    ha_allegato: Boolean(attachment_url),
    fic_updated_at: doc.updated_at,
    fic_dati: resto,
    sincronizzata_at: ora,
  }

  const rate: RigaRata[] = (doc.payments_list ?? []).map((p, ordine) => ({
    fic_id: p.id ?? null,
    importo: Math.abs(cent(p.amount)),
    scadenza: p.due_date ?? null,
    stato: p.status === 'paid' ? 'pagata' : 'da_pagare',
    pagata_il: p.paid_date ?? null,
    conto_fic_id: p.payment_account?.id ?? null,
    conto_nome: testo(p.payment_account?.name),
    ordine,
  }))

  return { fattura, rate }
}
```

- [ ] **Step 5: Implementare `lib/fic/stato-pagamento.ts`**

```ts
import type { RataFatturaFornitore, StatoPagamento } from '@/types/fatture-fornitori'

export const ETICHETTA_STATO_PAGAMENTO: Record<StatoPagamento, string> = {
  pagata: 'Pagata',
  parziale: 'Parziale',
  da_pagare: 'Da pagare',
  scaduta: 'Scaduta',
}

/**
 * Stato di una fattura ricavato dalle rate. "Scaduta" vince su "parziale":
 * una rata non pagata oltre la scadenza e' la cosa da vedere per prima.
 * `oggi` e' 'YYYY-MM-DD' (vedi oggiRoma): la scadenza di oggi non e' ancora scaduta.
 */
export function statoPagamento(
  rate: Pick<RataFatturaFornitore, 'stato' | 'scadenza'>[],
  oggi: string,
): StatoPagamento {
  if (rate.length === 0) return 'da_pagare'
  const nonPagate = rate.filter((r) => r.stato !== 'pagata')
  if (nonPagate.length === 0) return 'pagata'
  if (nonPagate.some((r) => r.scadenza !== null && r.scadenza < oggi)) return 'scaduta'
  return nonPagate.length < rate.length ? 'parziale' : 'da_pagare'
}

/** Data di oggi a Roma come 'YYYY-MM-DD' (il server Vercel gira in UTC). */
export function oggiRoma(adesso: Date = new Date()): string {
  return adesso.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}
```

- [ ] **Step 6: Verificare che passino**

Run: `npx vitest run lib/fic/mappa.test.ts lib/fic/stato-pagamento.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/fic/mappa.ts lib/fic/mappa.test.ts lib/fic/stato-pagamento.ts lib/fic/stato-pagamento.test.ts
git commit -m "feat(fic): mappatura spese FiC e stato pagamento dalle rate"
```

---

### Task 6: Confronto e orchestrazione della sincronizzazione

**Files:**
- Create: `lib/fic/confronto.ts`, `lib/fic/sincronizza.ts`
- Test: `lib/fic/confronto.test.ts`, `lib/fic/sincronizza.test.ts`

**Interfaces:**
- Consumes: `FicClient`, `FicTroppeRichieste` (Task 4); `mappaDocumento`, `DocumentoMappato` (Task 5); `ConteggiSync` (Task 3).
- Produces:

```ts
// lib/fic/confronto.ts
export type VoceFic = { fic_id: number; updated_at: string }
export type VoceLocale = { fic_id: number; fic_updated_at: string }
export type Differenze = { nuove: number[]; modificate: number[]; eliminate: number[] }
export function confronta(fic: VoceFic[], locali: VoceLocale[]): Differenze
// lib/fic/sincronizza.ts
export type ArchivioFatture = {
  vociLocali: () => Promise<VoceLocale[]>
  salva: (documenti: DocumentoMappato[]) => Promise<void>
  elimina: (ficIds: number[]) => Promise<void>
}
export type MotivoStop = 'budget' | 'tempo' | 'troppe_richieste'
export type RisultatoSync = { completa: boolean; conteggi: ConteggiSync; daScaricare: number; scaricate: number; motivoStop: MotivoStop | null }
export type OpzioniSync = { client: FicClient; archivio: ArchivioFatture; companyId: number; dal: string; budgetChiamate: number; limiteMs: number; adesso?: () => number }
export const LOTTO_SALVATAGGIO = 50
export async function sincronizza(o: OpzioniSync): Promise<RisultatoSync>
export function messaggioParziale(r: RisultatoSync): string
```

- [ ] **Step 1: Test di `confronta` (falliscono)**

`lib/fic/confronto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { confronta } from '@/lib/fic/confronto'

describe('confronta', () => {
  it('trova nuove, modificate ed eliminate', () => {
    const d = confronta(
      [
        { fic_id: 1, updated_at: '2026-01-01 10:00:00' }, // invariata
        { fic_id: 2, updated_at: '2026-02-02 11:00:00' }, // modificata
        { fic_id: 4, updated_at: '2026-03-03 12:00:00' }, // nuova
      ],
      [
        { fic_id: 1, fic_updated_at: '2026-01-01 10:00:00' },
        { fic_id: 2, fic_updated_at: '2026-02-01 09:00:00' },
        { fic_id: 3, fic_updated_at: '2026-01-15 08:00:00' }, // eliminata su FiC
      ],
    )
    expect(d).toEqual({ nuove: [4], modificate: [2], eliminate: [3] })
  })

  it('niente differenze', () => {
    expect(
      confronta([{ fic_id: 1, updated_at: 'a' }], [{ fic_id: 1, fic_updated_at: 'a' }]),
    ).toEqual({ nuove: [], modificate: [], eliminate: [] })
  })

  it('primo giro: tutto nuovo', () => {
    expect(confronta([{ fic_id: 1, updated_at: 'a' }, { fic_id: 2, updated_at: 'b' }], [])).toEqual({
      nuove: [1, 2],
      modificate: [],
      eliminate: [],
    })
  })
})
```

- [ ] **Step 2: Test di `sincronizza` (falliscono)**

`lib/fic/sincronizza.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sincronizza, messaggioParziale, type ArchivioFatture } from '@/lib/fic/sincronizza'
import { FicErrore, FicTroppeRichieste, type FicClient } from '@/lib/fic/client'
import type { DocumentoFic, TipoSpesaFic } from '@/lib/fic/tipi'
import type { DocumentoMappato } from '@/lib/fic/mappa'
import type { VoceLocale } from '@/lib/fic/confronto'

const rata = { id: 1, amount: 10, due_date: '2026-01-31', status: 'not_paid' }
const d = (id: number, updated_at = 'u1', conRate = true, date = '2026-01-10'): DocumentoFic => ({
  id,
  date,
  updated_at,
  entity: { name: `Fornitore ${id}` },
  amount_net: 10,
  amount_gross: 12.2,
  ...(conRate ? { payments_list: [rata] } : {}),
})

function clientFinto(
  elenco: Partial<Record<TipoSpesaFic, DocumentoFic[] | Error>>,
  opz: { dettaglio?: (id: number) => DocumentoFic | Error } = {},
): FicClient & { richiesteDettaglio: number[] } {
  let n = 0
  const richiesteDettaglio: number[] = []
  return {
    richiesteDettaglio,
    chiamate: () => n,
    aziende: async () => [],
    elencoSpese: async (_c, tipo) => {
      n++
      const r = elenco[tipo] ?? []
      if (r instanceof Error) throw r
      return r
    },
    spesa: async (_c, id) => {
      n++
      richiesteDettaglio.push(id)
      const r = opz.dettaglio ? opz.dettaglio(id) : d(id)
      if (r instanceof Error) throw r
      return r
    },
  }
}

function archivioFinto(locali: VoceLocale[] = []) {
  const salvati: DocumentoMappato[] = []
  const lotti: number[] = []
  const eliminati: number[] = []
  const archivio: ArchivioFatture = {
    vociLocali: async () => locali,
    salva: async (docs) => {
      lotti.push(docs.length)
      salvati.push(...docs)
    },
    elimina: async (ids) => {
      eliminati.push(...ids)
    },
  }
  return { archivio, salvati, lotti, eliminati }
}

const base = { companyId: 42, dal: '2025-01-01', budgetChiamate: 250, limiteMs: 240_000 }

describe('sincronizza', () => {
  it('primo giro completo: salva fatture e note di credito, conta le nuove', async () => {
    const client = clientFinto({ expense: [d(1), d(2)], passive_credit_note: [d(3)] })
    const a = archivioFinto()
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(r.completa).toBe(true)
    expect(r.motivoStop).toBeNull()
    expect(r.conteggi).toEqual({ nuove: 3, aggiornate: 0, eliminate: 0 })
    expect(a.salvati.map((s) => [s.fattura.fic_id, s.fattura.tipo])).toEqual(
      expect.arrayContaining([[1, 'fattura'], [2, 'fattura'], [3, 'nota_credito']]),
    )
    expect(client.richiesteDettaglio).toEqual([]) // payments_list gia' nell'elenco
  })

  it('giro successivo: tocca solo modificate, elimina le sparite', async () => {
    const client = clientFinto({ expense: [d(1, 'u1'), d(2, 'u2')] })
    const a = archivioFinto([
      { fic_id: 1, fic_updated_at: 'u1' },
      { fic_id: 2, fic_updated_at: 'vecchio' },
      { fic_id: 9, fic_updated_at: 'u1' },
    ])
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(r.conteggi).toEqual({ nuove: 0, aggiornate: 1, eliminate: 1 })
    expect(a.salvati.map((s) => s.fattura.fic_id)).toEqual([2])
    expect(a.eliminati).toEqual([9])
  })

  it('elenco interrotto da un errore: non elimina e non salva niente', async () => {
    const client = clientFinto({ expense: [d(1)], passive_credit_note: new FicErrore('rete', 502) })
    const a = archivioFinto([{ fic_id: 9, fic_updated_at: 'u1' }])
    await expect(sincronizza({ ...base, client, archivio: a.archivio })).rejects.toBeInstanceOf(FicErrore)
    expect(a.eliminati).toEqual([])
    expect(a.salvati).toEqual([])
  })

  it('senza rate nell\'elenco chiede il dettaglio delle sole nuove/modificate', async () => {
    const client = clientFinto({ expense: [d(1, 'u1', false), d(2, 'u2', false)] })
    const a = archivioFinto([{ fic_id: 1, fic_updated_at: 'u1' }])
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(client.richiesteDettaglio).toEqual([2])
    expect(r.completa).toBe(true)
    expect(a.salvati[0].rate).toHaveLength(1)
  })

  it('budget esaurito: giro parziale che salva il gia\' scaricato, il giro dopo riprende', async () => {
    const docs = [d(1, 'u', false), d(2, 'u', false), d(3, 'u', false), d(4, 'u', false)]
    const primo = archivioFinto()
    // 2 chiamate di elenco + 2 dettagli = 4
    const r1 = await sincronizza({ ...base, budgetChiamate: 4, client: clientFinto({ expense: docs }), archivio: primo.archivio })
    expect(r1.completa).toBe(false)
    expect(r1.motivoStop).toBe('budget')
    expect(r1.scaricate).toBe(2)
    expect(r1.daScaricare).toBe(4)
    expect(primo.salvati).toHaveLength(2)

    const giaSalvate = primo.salvati.map((s) => ({ fic_id: s.fattura.fic_id, fic_updated_at: s.fattura.fic_updated_at }))
    const secondoClient = clientFinto({ expense: docs })
    const secondo = archivioFinto(giaSalvate)
    const r2 = await sincronizza({ ...base, client: secondoClient, archivio: secondo.archivio })
    expect(r2.completa).toBe(true)
    expect(secondoClient.richiesteDettaglio.sort()).toEqual(
      docs.map((x) => x.id).filter((id) => !giaSalvate.some((g) => g.fic_id === id)).sort(),
    )
  })

  it('tempo esaurito → parziale per tempo', async () => {
    let t = 0
    const client = clientFinto({ expense: [d(1, 'u', false), d(2, 'u', false)] }, {
      dettaglio: (id) => {
        t += 250_000
        return d(id)
      },
    })
    const a = archivioFinto()
    const r = await sincronizza({ ...base, client, archivio: a.archivio, adesso: () => t })
    expect(r.motivoStop).toBe('tempo')
    expect(r.scaricate).toBe(1)
  })

  it('429 durante i dettagli → parziale, salva quelle gia\' scaricate', async () => {
    const client = clientFinto({ expense: [d(1, 'u', false), d(2, 'u', false)] }, {
      dettaglio: (id) => (id === 1 ? d(1) : new FicTroppeRichieste(60)),
    })
    const a = archivioFinto()
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(r.motivoStop).toBe('troppe_richieste')
    expect(a.salvati).toHaveLength(1)
  })

  it('scarica prima le fatture piu\' recenti', async () => {
    const client = clientFinto({ expense: [d(1, 'u', true, '2025-01-01'), d(2, 'u', true, '2026-06-01')] })
    const a = archivioFinto()
    await sincronizza({ ...base, client, archivio: a.archivio })
    expect(a.salvati.map((s) => s.fattura.fic_id)).toEqual([2, 1])
  })

  it('salva a lotti di 50', async () => {
    const docs = Array.from({ length: 120 }, (_, i) => d(i + 1))
    const a = archivioFinto()
    await sincronizza({ ...base, client: clientFinto({ expense: docs }), archivio: a.archivio })
    expect(a.lotti).toEqual([50, 50, 20])
  })
})

describe('messaggioParziale', () => {
  const r = { completa: false, conteggi: { nuove: 250, aggiornate: 0, eliminate: 0 }, daScaricare: 1340, scaricate: 250 }
  it('budget o tempo → invito a premere di nuovo', () => {
    expect(messaggioParziale({ ...r, motivoStop: 'budget' })).toBe(
      'Sincronizzate 250 fatture su 1.340: premi di nuovo Sincronizza per continuare',
    )
    expect(messaggioParziale({ ...r, motivoStop: 'tempo' })).toBe(
      'Sincronizzate 250 fatture su 1.340: premi di nuovo Sincronizza per continuare',
    )
  })
  it('troppe richieste → invito ad aspettare', () => {
    expect(messaggioParziale({ ...r, motivoStop: 'troppe_richieste' })).toBe(
      'Sincronizzate 250 fatture su 1.340. Fatture in Cloud ha chiesto una pausa: riprova fra qualche minuto',
    )
  })
})
```

- [ ] **Step 3: Verificare che falliscano**

Run: `npx vitest run lib/fic/confronto.test.ts lib/fic/sincronizza.test.ts`
Expected: FAIL, moduli non trovati.

- [ ] **Step 4: Implementare `lib/fic/confronto.ts`**

```ts
export type VoceFic = { fic_id: number; updated_at: string }
export type VoceLocale = { fic_id: number; fic_updated_at: string }
export type Differenze = { nuove: number[]; modificate: number[]; eliminate: number[] }

/**
 * Confronta l'elenco FiC con la copia locale. La data di modifica si confronta
 * come stringa grezza di FiC: e' cosi' che la salviamo, niente fusi di mezzo.
 */
export function confronta(fic: VoceFic[], locali: VoceLocale[]): Differenze {
  const localiPerId = new Map(locali.map((l) => [l.fic_id, l.fic_updated_at]))
  const suFic = new Set(fic.map((f) => f.fic_id))
  const nuove: number[] = []
  const modificate: number[] = []
  for (const f of fic) {
    const locale = localiPerId.get(f.fic_id)
    if (locale === undefined) nuove.push(f.fic_id)
    else if (locale !== f.updated_at) modificate.push(f.fic_id)
  }
  const eliminate = locali.filter((l) => !suFic.has(l.fic_id)).map((l) => l.fic_id)
  return { nuove, modificate, eliminate }
}
```

- [ ] **Step 5: Implementare `lib/fic/sincronizza.ts`**

```ts
import type { ConteggiSync } from '@/types/fatture-fornitori'
import { FicTroppeRichieste, type FicClient } from '@/lib/fic/client'
import { confronta, type VoceLocale } from '@/lib/fic/confronto'
import { mappaDocumento, type DocumentoMappato } from '@/lib/fic/mappa'
import type { DocumentoFic, TipoSpesaFic } from '@/lib/fic/tipi'

/** Dove finiscono i dati: Supabase nelle Server Action, un finto nei test. */
export type ArchivioFatture = {
  vociLocali: () => Promise<VoceLocale[]>
  salva: (documenti: DocumentoMappato[]) => Promise<void>
  elimina: (ficIds: number[]) => Promise<void>
}

export type MotivoStop = 'budget' | 'tempo' | 'troppe_richieste'

export type RisultatoSync = {
  completa: boolean
  conteggi: ConteggiSync
  daScaricare: number
  scaricate: number
  motivoStop: MotivoStop | null
}

export type OpzioniSync = {
  client: FicClient
  archivio: ArchivioFatture
  companyId: number
  dal: string
  budgetChiamate: number
  limiteMs: number
  adesso?: () => number
}

export const LOTTO_SALVATAGGIO = 50

const TIPI: TipoSpesaFic[] = ['expense', 'passive_credit_note']

/**
 * Un giro di sincronizzazione.
 *
 * 1. Legge l'elenco completo da FiC. Se fallisce a meta', l'errore risale
 *    prima di qualunque scrittura: nessuna eliminazione su un elenco monco.
 * 2. Confronta con la copia locale ed elimina le sparite.
 * 3. Salva nuove e modificate, piu' recenti prima, a lotti. Se l'elenco non
 *    porta le rate chiede il dettaglio, entro budget di chiamate e di tempo:
 *    esaurito il budget il giro e' parziale e il successivo riprende da solo,
 *    perche' il confronto ritrova le mancanti.
 */
export async function sincronizza(o: OpzioniSync): Promise<RisultatoSync> {
  const adesso = o.adesso ?? Date.now
  const inizio = adesso()
  const ora = new Date().toISOString()

  const perId = new Map<number, { doc: DocumentoFic; tipo: TipoSpesaFic }>()
  for (const tipo of TIPI) {
    for (const doc of await o.client.elencoSpese(o.companyId, tipo, o.dal)) {
      perId.set(doc.id, { doc, tipo })
    }
  }

  const locali = await o.archivio.vociLocali()
  const diff = confronta(
    [...perId.values()].map(({ doc }) => ({ fic_id: doc.id, updated_at: doc.updated_at })),
    locali,
  )
  if (diff.eliminate.length > 0) await o.archivio.elimina(diff.eliminate)

  const nuove = new Set(diff.nuove)
  const daScaricare = [...diff.nuove, ...diff.modificate].sort((a, b) => {
    const da = perId.get(a)!.doc.date
    const db = perId.get(b)!.doc.date
    return da < db ? 1 : da > db ? -1 : a - b
  })

  const conteggi: ConteggiSync = { nuove: 0, aggiornate: 0, eliminate: diff.eliminate.length }
  let motivoStop: MotivoStop | null = null
  let scaricate = 0
  let lotto: DocumentoMappato[] = []
  const svuota = async () => {
    if (lotto.length === 0) return
    const daSalvare = lotto
    lotto = []
    await o.archivio.salva(daSalvare)
  }

  for (const id of daScaricare) {
    const { doc, tipo } = perId.get(id)!
    let completo = doc
    if (!Array.isArray(doc.payments_list)) {
      if (o.client.chiamate() >= o.budgetChiamate) { motivoStop = 'budget'; break }
      if (adesso() - inizio >= o.limiteMs) { motivoStop = 'tempo'; break }
      try {
        completo = await o.client.spesa(o.companyId, id)
      } catch (e) {
        if (e instanceof FicTroppeRichieste) { motivoStop = 'troppe_richieste'; break }
        await svuota()
        throw e
      }
    }
    lotto.push(mappaDocumento(completo, tipo, ora))
    scaricate++
    if (nuove.has(id)) conteggi.nuove++
    else conteggi.aggiornate++
    if (lotto.length >= LOTTO_SALVATAGGIO) await svuota()
  }
  await svuota()

  return { completa: motivoStop === null, conteggi, daScaricare: daScaricare.length, scaricate, motivoStop }
}

const numero = (n: number) => n.toLocaleString('it-IT')

export function messaggioParziale(r: RisultatoSync): string {
  const quante = `Sincronizzate ${numero(r.scaricate)} fatture su ${numero(r.daScaricare)}`
  if (r.motivoStop === 'troppe_richieste') {
    return `${quante}. Fatture in Cloud ha chiesto una pausa: riprova fra qualche minuto`
  }
  return `${quante}: premi di nuovo Sincronizza per continuare`
}
```

Nota: `toLocaleString('it-IT')` su Node con ICU completo dà `1.340`. Se il test di `messaggioParziale` fallisce per il separatore, sostituire `numero` con `String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')`.

- [ ] **Step 6: Verificare che passino**

Run: `npx vitest run lib/fic`
Expected: PASS su tutti i file di `lib/fic`.

- [ ] **Step 7: Commit**

```bash
git add lib/fic/confronto.ts lib/fic/confronto.test.ts lib/fic/sincronizza.ts lib/fic/sincronizza.test.ts
git commit -m "feat(fic): sincronizzazione incrementale con budget e ripresa"
```

---

### Task 7: Server Action — collegamento, sincronizzazione, PDF, letture

**Files:**
- Create: `actions/fatture-in-cloud.ts`
- Create: `actions/fatture-fornitori.ts`

**Interfaces:**
- Consumes: Task 3-6; `getOrgId` (`@/lib/auth`), `getMyPermissions` (`@/lib/permessi`), `createClient` (`@/lib/supabase/server`), `createServiceClient` (`@/lib/supabase/service`), `selectAll` (`@/lib/supabase/paginate`).
- Produces:

```ts
// actions/fatture-in-cloud.ts ('use server')
export type RisultatoVerificaFic = { ok: true; aziende: AziendaFic[] } | { ok: false; errore: string }
export type RisultatoFic = { ok: true } | { ok: false; errore: string; richiedeConferma?: boolean }
export async function getCollegamentoFic(): Promise<CollegamentoFic | null>
export async function verificaTokenFic(token: string): Promise<RisultatoVerificaFic>
export async function salvaCollegamentoFic(input: { token: string; companyId: number; sincronizzaDal: string; confermaCambioAzienda: boolean }): Promise<RisultatoFic>
export async function aggiornaSincronizzaDal(data: string): Promise<RisultatoFic>
export async function scollegaFic(): Promise<RisultatoFic>
export async function sincronizzaFattureFornitori(): Promise<EsitoSincronizzazione>
export async function getUrlPdfFatturaFornitore(id: string): Promise<{ url: string | null; errore?: string }>
// actions/fatture-fornitori.ts ('use server')
export async function getFattureFornitori(anno: number): Promise<FatturaFornitore[]>
export async function getAnniFattureFornitori(): Promise<number[]>
```

- [ ] **Step 1: Scrivere `actions/fatture-in-cloud.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { creaClientFic, FicNonAutorizzato, FicTroppeRichieste } from '@/lib/fic/client'
import { sincronizza, messaggioParziale, type ArchivioFatture } from '@/lib/fic/sincronizza'
import type { VoceLocale } from '@/lib/fic/confronto'
import {
  CONTEGGI_VUOTI,
  type AziendaFic,
  type CollegamentoFic,
  type ConteggiSync,
  type EsitoSincronizzazione,
} from '@/types/fatture-fornitori'

export type RisultatoVerificaFic = { ok: true; aziende: AziendaFic[] } | { ok: false; errore: string }
export type RisultatoFic = { ok: true } | { ok: false; errore: string; richiedeConferma?: boolean }

const BUDGET_CHIAMATE = 250
const LIMITE_MS = 240_000
const BLOCCO_MS = 5 * 60_000
const LOTTO_DB = 200

const COLONNE_COLLEGAMENTO =
  'fic_company_id, fic_company_nome, token_finale, sincronizza_dal, stato, sync_in_corso_da, ultima_sync_at, ultimo_esito, ultimo_esito_at, ultimo_messaggio, ultimi_conteggi'

async function erroreSeNonPuoiModificareImpostazioni(): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  return permessi.impostazioni === 'scrittura' ? null : 'Non autorizzato a modificare le impostazioni'
}

async function leggiToken(svc: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (error) throw new Error(error.message)
  if (!data) throw new FicNonAutorizzato()
  return data as string
}

function messaggioErrore(e: unknown): string {
  if (e instanceof FicNonAutorizzato) return 'Token non valido, revocato o senza i permessi necessari'
  if (e instanceof FicTroppeRichieste) return 'Troppe richieste a Fatture in Cloud: riprova fra qualche minuto'
  return e instanceof Error ? e.message : 'Errore sconosciuto'
}

const blocchi = <T,>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

// ── Collegamento ────────────────────────────────────────────────────────────

export async function getCollegamentoFic(): Promise<CollegamentoFic | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('fic_collegamenti').select(COLONNE_COLLEGAMENTO).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as CollegamentoFic | null) ?? null
}

export async function verificaTokenFic(token: string): Promise<RisultatoVerificaFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const pulito = token.trim()
  if (!pulito) return { ok: false, errore: 'Incolla il token generato su Fatture in Cloud' }
  try {
    const aziende = await creaClientFic(pulito).aziende()
    if (aziende.length === 0) return { ok: false, errore: 'Il token non dà accesso a nessuna azienda' }
    return { ok: true, aziende }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}

export async function salvaCollegamentoFic(input: {
  token: string
  companyId: number
  sincronizzaDal: string
  confermaCambioAzienda: boolean
}): Promise<RisultatoFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const token = input.token.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sincronizzaDal)) return { ok: false, errore: 'Data "Sincronizza dal" non valida' }

  // Il server non si fida di nome e id arrivati dal browser: riverifica il token.
  const verifica = await verificaTokenFic(token)
  if (!verifica.ok) return verifica
  const azienda = verifica.aziende.find((a) => a.id === input.companyId)
  if (!azienda) return { ok: false, errore: "L'azienda scelta non è raggiungibile con questo token" }

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: esistente, error: errLettura } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, sincronizza_dal, ultima_sync_at')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errLettura) return { ok: false, errore: errLettura.message }

  const cambioAzienda = esistente !== null && Number(esistente.fic_company_id) !== azienda.id
  if (cambioAzienda && !input.confermaCambioAzienda) {
    return {
      ok: false,
      richiedeConferma: true,
      errore: `Il token è di un'altra azienda (${azienda.nome}). Le fatture scaricate dall'azienda precedente verranno eliminate.`,
    }
  }

  const { data: secretId, error: errVault } = await svc.rpc('fic_salva_token', { p_org: orgId, p_token: token })
  if (errVault) return { ok: false, errore: errVault.message }

  if (cambioAzienda) {
    const { error } = await svc.from('fatture_fornitori').delete().eq('organization_id', orgId)
    if (error) return { ok: false, errore: error.message }
  }

  // "Sincronizza dal" non si cambia dopo la prima sincronizzazione completata della stessa azienda.
  const mantieniDal = esistente !== null && !cambioAzienda && esistente.ultima_sync_at !== null
  const { error: errSalva } = await svc.from('fic_collegamenti').upsert(
    {
      organization_id: orgId,
      vault_secret_id: secretId as string,
      token_finale: token.slice(-4),
      fic_company_id: azienda.id,
      fic_company_nome: azienda.nome,
      sincronizza_dal: mantieniDal ? esistente!.sincronizza_dal : input.sincronizzaDal,
      stato: 'attivo',
      updated_at: new Date().toISOString(),
      ...(cambioAzienda
        ? { ultima_sync_at: null, ultimo_esito: null, ultimo_esito_at: null, ultimo_messaggio: null, ultimi_conteggi: null }
        : {}),
    },
    { onConflict: 'organization_id' },
  )
  if (errSalva) return { ok: false, errore: errSalva.message }

  revalidatePath('/impostazioni')
  revalidatePath('/fatture-fornitori')
  return { ok: true }
}

export async function aggiornaSincronizzaDal(data: string): Promise<RisultatoFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, errore: 'Data non valida' }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: aggiornate, error } = await svc
    .from('fic_collegamenti')
    .update({ sincronizza_dal: data, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .is('ultima_sync_at', null)
    .select('organization_id')
  if (error) return { ok: false, errore: error.message }
  if (!aggiornate?.length) return { ok: false, errore: 'Non modificabile dopo la prima sincronizzazione' }
  revalidatePath('/impostazioni')
  return { ok: true }
}

export async function scollegaFic(): Promise<RisultatoFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { error: errVault } = await svc.rpc('fic_elimina_token', { p_org: orgId })
  if (errVault) return { ok: false, errore: errVault.message }
  const { error } = await svc.from('fic_collegamenti').delete().eq('organization_id', orgId)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/impostazioni')
  revalidatePath('/fatture-fornitori')
  return { ok: true }
}

// ── Sincronizzazione ────────────────────────────────────────────────────────

function archivioSupabase(svc: SupabaseClient, orgId: string): ArchivioFatture {
  return {
    vociLocali: () =>
      selectAll<VoceLocale>((da, a) =>
        svc
          .from('fatture_fornitori')
          .select('fic_id, fic_updated_at')
          .eq('organization_id', orgId)
          .order('fic_id')
          .range(da, a),
      ),

    async salva(documenti) {
      const { data: salvate, error } = await svc
        .from('fatture_fornitori')
        .upsert(
          documenti.map((d) => ({ ...d.fattura, organization_id: orgId })),
          { onConflict: 'organization_id,fic_id' },
        )
        .select('id, fic_id')
      if (error) throw new Error(error.message)

      const idPerFic = new Map((salvate ?? []).map((r) => [Number(r.fic_id), r.id as string]))
      const ids = [...idPerFic.values()]
      const { error: errDel } = await svc.from('fatture_fornitori_rate').delete().in('fattura_id', ids)
      if (errDel) throw new Error(errDel.message)

      const rate = documenti.flatMap((d) =>
        d.rate.map((r) => ({ ...r, organization_id: orgId, fattura_id: idPerFic.get(d.fattura.fic_id)! })),
      )
      for (const blocco of blocchi(rate, LOTTO_DB)) {
        const { error: errIns } = await svc.from('fatture_fornitori_rate').insert(blocco)
        if (errIns) throw new Error(errIns.message)
      }
    },

    async elimina(ficIds) {
      for (const blocco of blocchi(ficIds, LOTTO_DB)) {
        const { error } = await svc
          .from('fatture_fornitori')
          .delete()
          .eq('organization_id', orgId)
          .in('fic_id', blocco)
        if (error) throw new Error(error.message)
      }
    },
  }
}

export async function sincronizzaFattureFornitori(): Promise<EsitoSincronizzazione> {
  const errore = (messaggio: string): EsitoSincronizzazione => ({ esito: 'errore', messaggio, conteggi: CONTEGGI_VUOTI })

  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori !== 'scrittura') return errore('Non autorizzato a sincronizzare')

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll, error: errColl } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, sincronizza_dal, stato')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errColl) return errore(errColl.message)
  if (!coll) return errore('Fatture in Cloud non è collegato: vai in Impostazioni → Fatture in Cloud')
  if (coll.stato !== 'attivo') return errore('Il collegamento va rinnovato: sostituisci il token in Impostazioni → Fatture in Cloud')

  // Blocco anti doppio clic: si prende solo se libero o scaduto.
  const inizio = new Date()
  const scaduto = new Date(inizio.getTime() - BLOCCO_MS).toISOString()
  const { data: preso, error: errBlocco } = await svc
    .from('fic_collegamenti')
    .update({ sync_in_corso_da: inizio.toISOString() })
    .eq('organization_id', orgId)
    .or(`sync_in_corso_da.is.null,sync_in_corso_da.lt.${scaduto}`)
    .select('organization_id')
  if (errBlocco) return errore(errBlocco.message)
  if (!preso?.length) return errore('Sincronizzazione già in corso')

  let esito: EsitoSincronizzazione
  let tokenRifiutato = false
  try {
    const token = await leggiToken(svc, orgId)
    const r = await sincronizza({
      client: creaClientFic(token),
      archivio: archivioSupabase(svc, orgId),
      companyId: Number(coll.fic_company_id),
      dal: coll.sincronizza_dal as string,
      budgetChiamate: BUDGET_CHIAMATE,
      limiteMs: LIMITE_MS,
    })
    esito = r.completa
      ? { esito: 'ok', messaggio: '', conteggi: r.conteggi }
      : { esito: 'parziale', messaggio: messaggioParziale(r), conteggi: r.conteggi }
  } catch (e) {
    tokenRifiutato = e instanceof FicNonAutorizzato
    esito = e instanceof FicTroppeRichieste
      ? { esito: 'parziale', messaggio: messaggioErrore(e), conteggi: CONTEGGI_VUOTI }
      : errore(messaggioErrore(e))
  }

  // Rilascio del blocco ed esito: gira sempre, perche' il catch sopra intercetta ogni errore.
  const conteggi: ConteggiSync = esito.conteggi
  const { error: errEsito } = await svc
    .from('fic_collegamenti')
    .update({
      sync_in_corso_da: null,
      ultimo_esito: esito.esito,
      ultimo_esito_at: new Date().toISOString(),
      ultimo_messaggio: esito.messaggio || null,
      ultimi_conteggi: conteggi,
      updated_at: new Date().toISOString(),
      ...(esito.esito === 'ok' ? { ultima_sync_at: inizio.toISOString() } : {}),
      ...(tokenRifiutato ? { stato: 'da_ricollegare' } : {}),
    })
    .eq('organization_id', orgId)
  if (errEsito) return errore(errEsito.message)

  revalidatePath('/fatture-fornitori')
  revalidatePath('/impostazioni')
  return esito
}

// ── PDF ─────────────────────────────────────────────────────────────────────

export async function getUrlPdfFatturaFornitore(id: string): Promise<{ url: string | null; errore?: string }> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno') return { url: null, errore: 'Non autorizzato' }

  // Lettura con RLS: garantisce che la fattura sia dell'organizzazione dell'utente.
  const supabase = await createClient()
  const { data: fattura, error } = await supabase.from('fatture_fornitori').select('fic_id').eq('id', id).maybeSingle()
  if (error) return { url: null, errore: error.message }
  if (!fattura) return { url: null, errore: 'Fattura non trovata' }

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll } = await svc.from('fic_collegamenti').select('fic_company_id').eq('organization_id', orgId).maybeSingle()
  if (!coll) return { url: null, errore: 'Fatture in Cloud non è collegato' }

  try {
    const token = await leggiToken(svc, orgId)
    const doc = await creaClientFic(token).spesa(Number(coll.fic_company_id), Number(fattura.fic_id))
    return doc.attachment_url ? { url: doc.attachment_url } : { url: null, errore: 'Nessun PDF allegato su Fatture in Cloud' }
  } catch (e) {
    if (e instanceof FicNonAutorizzato) {
      await svc.from('fic_collegamenti').update({ stato: 'da_ricollegare' }).eq('organization_id', orgId)
    }
    return { url: null, errore: messaggioErrore(e) }
  }
}
```

- [ ] **Step 2: Scrivere `actions/fatture-fornitori.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import type { FatturaFornitore } from '@/types/fatture-fornitori'

// fic_dati resta fuori di proposito: e' il documento FiC intero, pesante e inutile all'elenco.
const COLONNE =
  'id, fic_id, tipo, numero, data, descrizione, categoria, elettronica, fornitore_fic_id, fornitore_nome, fornitore_piva, importo_netto, importo_iva, ritenuta, altra_ritenuta, importo_lordo, prossima_scadenza, ha_allegato, sincronizzata_at, rate:fatture_fornitori_rate(id, fattura_id, fic_id, importo, scadenza, stato, pagata_il, conto_fic_id, conto_nome, ordine)'

export async function getFattureFornitori(anno: number): Promise<FatturaFornitore[]> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const righe = await selectAll<FatturaFornitore>((da, a) =>
    supabase
      .from('fatture_fornitori')
      .select(COLONNE)
      .eq('organization_id', orgId)
      .gte('data', `${anno}-01-01`)
      .lte('data', `${anno}-12-31`)
      .order('data', { ascending: false })
      .order('id')
      .range(da, a),
  )
  return righe.map((f) => ({
    ...f,
    importo_netto: Number(f.importo_netto),
    importo_iva: Number(f.importo_iva),
    ritenuta: Number(f.ritenuta),
    altra_ritenuta: Number(f.altra_ritenuta),
    importo_lordo: Number(f.importo_lordo),
    rate: [...(f.rate ?? [])]
      .map((r) => ({ ...r, importo: Number(r.importo) }))
      .sort((x, y) => x.ordine - y.ordine),
  }))
}

export async function getAnniFattureFornitori(): Promise<number[]> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const righe = await selectAll<{ data: string }>((da, a) =>
    supabase.from('fatture_fornitori').select('data').eq('organization_id', orgId).order('id').range(da, a),
  )
  const anni = new Set(righe.map((r) => Number(r.data.slice(0, 4))))
  anni.add(new Date().getFullYear())
  return [...anni].sort((a, b) => b - a)
}
```

- [ ] **Step 3: Typecheck e lint**

Run: `npx tsc --noEmit && npx eslint actions/fatture-in-cloud.ts actions/fatture-fornitori.ts`
Expected: nessun errore. Se `numeric` torna come stringa o `bigint` come stringa, le conversioni `Number(...)` già presenti lo coprono.

- [ ] **Step 4: Commit**

```bash
git add actions/fatture-in-cloud.ts actions/fatture-fornitori.ts
git commit -m "feat(fic): server action per collegamento, sincronizzazione e PDF"
```

---

### Task 8: Scheda "Fatture in Cloud" in Impostazioni

**Files:**
- Create: `components/impostazioni/SezioneFattureInCloud.tsx`
- Modify: `app/(dashboard)/impostazioni/page.tsx` (import, dati, `TabsTrigger` + `TabsContent`)

**Interfaces:**
- Consumes: `getCollegamentoFic`, `verificaTokenFic`, `salvaCollegamentoFic`, `aggiornaSincronizzaDal`, `scollegaFic` (Task 7); `CollegamentoFic`, `AziendaFic` (Task 3); `getMyPermissions`.
- Produces: `export default function SezioneFattureInCloud({ collegamento, puoModificare }: { collegamento: CollegamentoFic | null; puoModificare: boolean })`; helper `export function formatDataOra(iso: string): string` in `lib/fic/formato.ts` (usato anche dal Task 9).

- [ ] **Step 1: Helper di formato condiviso, con test**

`lib/fic/formato.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatDataOra, formatData, descriviConteggi } from '@/lib/fic/formato'

describe('formato', () => {
  it('data e ora a Roma', () => {
    expect(formatDataOra('2026-09-28T12:32:00Z')).toBe('28/09/2026 14:32')
  })
  it('solo data', () => {
    expect(formatData('2026-03-05')).toBe('05/03/2026')
  })
  it('conteggi, omettendo gli zeri', () => {
    expect(descriviConteggi({ nuove: 12, aggiornate: 3, eliminate: 0 })).toBe('12 nuove, 3 aggiornate')
    expect(descriviConteggi({ nuove: 0, aggiornate: 0, eliminate: 0 })).toBe('nessuna novità')
    expect(descriviConteggi({ nuove: 1, aggiornate: 0, eliminate: 1 })).toBe('1 nuova, 1 eliminata')
  })
})
```

`lib/fic/formato.ts`:

```ts
import type { ConteggiSync } from '@/types/fatture-fornitori'

export function formatDataOra(iso: string): string {
  const d = new Date(iso)
  const data = d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' })
  const ora = d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })
  return `${data} ${ora}`
}

/** 'YYYY-MM-DD' → 'gg/mm/aaaa' senza passare da Date (niente sorprese di fuso). */
export function formatData(iso: string): string {
  const [a, m, g] = iso.slice(0, 10).split('-')
  return `${g}/${m}/${a}`
}

export function descriviConteggi(c: ConteggiSync): string {
  const parti: string[] = []
  if (c.nuove) parti.push(`${c.nuove} ${c.nuove === 1 ? 'nuova' : 'nuove'}`)
  if (c.aggiornate) parti.push(`${c.aggiornate} ${c.aggiornate === 1 ? 'aggiornata' : 'aggiornate'}`)
  if (c.eliminate) parti.push(`${c.eliminate} ${c.eliminate === 1 ? 'eliminata' : 'eliminate'}`)
  return parti.length ? parti.join(', ') : 'nessuna novità'
}
```

Run: `npx vitest run lib/fic/formato.test.ts` → prima FAIL (modulo mancante), poi PASS dopo aver creato il file.

- [ ] **Step 2: Scrivere `components/impostazioni/SezioneFattureInCloud.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  verificaTokenFic, salvaCollegamentoFic, aggiornaSincronizzaDal, scollegaFic,
} from '@/actions/fatture-in-cloud'
import { formatDataOra, descriviConteggi } from '@/lib/fic/formato'
import type { AziendaFic, CollegamentoFic } from '@/types/fatture-fornitori'

const PERMESSI_FIC = [
  ['Spese (documenti ricevuti)', 'Lettura e scrittura'],
  ['Fornitori', 'Lettura'],
  ['Impostazioni', 'Lettura'],
] as const

const dalDefault = () => `${new Date().getFullYear() - 1}-01-01`

export default function SezioneFattureInCloud({
  collegamento,
  puoModificare,
}: {
  collegamento: CollegamentoFic | null
  puoModificare: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [inModifica, setInModifica] = useState(collegamento === null)
  const [token, setToken] = useState('')
  const [aziende, setAziende] = useState<AziendaFic[] | null>(null)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [dal, setDal] = useState(collegamento?.sincronizza_dal ?? dalDefault())
  const [confermaCambio, setConfermaCambio] = useState<string | null>(null)
  const [confermaScollega, setConfermaScollega] = useState(false)

  const dalModificabile = !collegamento || collegamento.ultima_sync_at === null

  function azzera() {
    setToken('')
    setAziende(null)
    setCompanyId(null)
  }

  function verifica() {
    startTransition(async () => {
      const r = await verificaTokenFic(token)
      if (!r.ok) {
        setAziende(null)
        toast.error(r.errore)
        return
      }
      setAziende(r.aziende)
      setCompanyId(r.aziende.length === 1 ? r.aziende[0].id : null)
    })
  }

  function salva(conferma: boolean) {
    if (companyId === null) return
    startTransition(async () => {
      const r = await salvaCollegamentoFic({ token, companyId, sincronizzaDal: dal, confermaCambioAzienda: conferma })
      if (!r.ok) {
        if (r.richiedeConferma) setConfermaCambio(r.errore)
        else toast.error(r.errore)
        return
      }
      setConfermaCambio(null)
      toast.success('Fatture in Cloud collegato')
      azzera()
      setInModifica(false)
      router.refresh()
    })
  }

  function salvaDal(nuova: string) {
    setDal(nuova)
    if (!collegamento) return
    startTransition(async () => {
      const r = await aggiornaSincronizzaDal(nuova)
      if (!r.ok) toast.error(r.errore)
      else router.refresh()
    })
  }

  function scollega() {
    startTransition(async () => {
      const r = await scollegaFic()
      setConfermaScollega(false)
      if (!r.ok) {
        toast.error(r.errore)
        return
      }
      toast.success('Fatture in Cloud scollegato')
      setInModifica(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {collegamento && (
        <div className="space-y-2 rounded-md border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Collegato a {collegamento.fic_company_nome}</span>
            {collegamento.stato === 'attivo'
              ? <Badge variant="secondary">Attivo</Badge>
              : <Badge variant="destructive">Da ricollegare</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            ID azienda {collegamento.fic_company_id} · token ••••••••{collegamento.token_finale}
          </p>
          <p className="text-sm text-muted-foreground">
            Ultima sincronizzazione:{' '}
            {collegamento.ultima_sync_at
              ? `${formatDataOra(collegamento.ultima_sync_at)}${collegamento.ultimi_conteggi ? ` · ${descriviConteggi(collegamento.ultimi_conteggi)}` : ''}`
              : 'mai'}
          </p>
          {collegamento.stato === 'da_ricollegare' && (
            <p className="text-sm text-destructive">
              Fatture in Cloud ha rifiutato il token (revocato o permessi cambiati). Genera un nuovo token e sostituiscilo.
            </p>
          )}
          {puoModificare && !inModifica && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setInModifica(true)}>Sostituisci token</Button>
              <Button variant="outline" size="sm" onClick={() => setConfermaScollega(true)}>Scollega</Button>
            </div>
          )}
        </div>
      )}

      {puoModificare && inModifica && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Entra in Fatture in Cloud e apri <strong>Impostazioni → Applicazioni collegate</strong>.</li>
            <li>Crea un nuovo <strong>token manuale</strong> e spunta questi permessi:
              <ul className="mt-1 list-disc pl-5">
                {PERMESSI_FIC.map(([voce, livello]) => (
                  <li key={voce}>{voce}: <strong>{livello}</strong></li>
                ))}
              </ul>
            </li>
            <li>Copia il token, incollalo qui sotto e premi <strong>Verifica</strong>.</li>
          </ol>

          <div className="space-y-2">
            <Label htmlFor="fic-token">Token</Label>
            <div className="flex gap-2">
              <Input
                id="fic-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => { setToken(e.target.value); setAziende(null); setCompanyId(null) }}
                placeholder="Incolla qui il token"
              />
              <Button onClick={verifica} disabled={pending || !token.trim()}>Verifica</Button>
            </div>
          </div>

          {aziende && aziende.length > 1 && (
            <div className="space-y-2">
              <Label>Azienda</Label>
              <Select value={companyId === null ? '' : String(companyId)} onValueChange={(v) => setCompanyId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Scegli l'azienda" /></SelectTrigger>
                <SelectContent>
                  {aziende.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {aziende && aziende.length === 1 && (
            <p className="text-sm">Token valido per <strong>{aziende[0].nome}</strong>.</p>
          )}

          {dalModificabile && (
            <div className="space-y-2">
              <Label htmlFor="fic-dal">Sincronizza dal</Label>
              <Input id="fic-dal" type="date" className="w-44" value={dal} onChange={(e) => setDal(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Le fatture con data precedente non vengono scaricate. Non si può cambiare dopo la prima sincronizzazione.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => salva(false)} disabled={pending || companyId === null}>Salva collegamento</Button>
            {collegamento && (
              <Button variant="ghost" onClick={() => { azzera(); setInModifica(false) }} disabled={pending}>Annulla</Button>
            )}
          </div>
        </div>
      )}

      {puoModificare && collegamento && !inModifica && dalModificabile && (
        <div className="space-y-2">
          <Label htmlFor="fic-dal-coll">Sincronizza dal</Label>
          <Input id="fic-dal-coll" type="date" className="w-44" value={dal} onChange={(e) => salvaDal(e.target.value)} disabled={pending} />
        </div>
      )}

      {!puoModificare && !collegamento && (
        <p className="text-sm text-muted-foreground">Fatture in Cloud non è collegato.</p>
      )}

      <AlertDialog open={confermaCambio !== null} onOpenChange={(o) => { if (!o) setConfermaCambio(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiare azienda?</AlertDialogTitle>
            <AlertDialogDescription>{confermaCambio}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => salva(true)}>Cambia azienda</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confermaScollega} onOpenChange={setConfermaScollega}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare Fatture in Cloud?</AlertDialogTitle>
            <AlertDialogDescription>
              Il token viene cancellato. Le fatture già scaricate restano consultabili, ma non si potranno più sincronizzare finché non ricolleghi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={scollega}>Scollega</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Agganciare la scheda in `app/(dashboard)/impostazioni/page.tsx`**

Import in cima:

```ts
import { getMyPermissions } from '@/lib/permessi'
import { getCollegamentoFic } from '@/actions/fatture-in-cloud'
import SezioneFattureInCloud from '@/components/impostazioni/SezioneFattureInCloud'
```

Nel `Promise.all` aggiungere in coda `getCollegamentoFic()` e `getMyPermissions()`, destrutturando `collegamentoFic, { permessi }`.

Dopo `<TabsTrigger value="banca">Banca</TabsTrigger>`:

```tsx
          <TabsTrigger value="fic">Fatture in Cloud</TabsTrigger>
```

Dopo il `</TabsContent>` della scheda `banca`:

```tsx
        {/* ── Fatture in Cloud: collegamento per scaricare le fatture fornitori ── */}
        <TabsContent value="fic" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fatture in Cloud</CardTitle>
          <CardDescription>
            Collega il tuo account Fatture in Cloud per scaricare le fatture dei fornitori
            registrate come spese. La sincronizzazione si avvia a mano dalla pagina Fatture fornitori.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SezioneFattureInCloud
            collegamento={collegamentoFic}
            puoModificare={permessi.impostazioni === 'scrittura'}
          />
        </CardContent>
      </Card>
        </TabsContent>
```

Se `TabsList` su mobile va a capo male con 5 schede, aggiungere `className="flex-wrap h-auto"` al `TabsList`.

- [ ] **Step 4: Verifica**

Run: `npx tsc --noEmit && npx eslint components/impostazioni/SezioneFattureInCloud.tsx "app/(dashboard)/impostazioni/page.tsx" lib/fic && npx vitest run lib/fic`
Expected: nessun errore, test verdi.

Manuale (`npm run dev`, login admin): la scheda "Fatture in Cloud" compare; token vuoto → Verifica disattivato; token con spazi attorno → Verifica ok (trim); token finto → toast "Token non valido…".

- [ ] **Step 5: Commit**

```bash
git add lib/fic/formato.ts lib/fic/formato.test.ts components/impostazioni/SezioneFattureInCloud.tsx "app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(fic): scheda Fatture in Cloud nelle impostazioni"
```

---

### Task 9: Pagina "Fatture fornitori"

**Files:**
- Create: `app/(dashboard)/fatture-fornitori/page.tsx`
- Create: `components/fatture-fornitori/BarraSincronizzazione.tsx`
- Create: `components/fatture-fornitori/ElencoFattureFornitori.tsx`
- Create: `components/fatture-fornitori/DialogFatturaFornitore.tsx`
- Create: `lib/fic/filtri.ts` + `lib/fic/filtri.test.ts`

**Interfaces:**
- Consumes: `getFattureFornitori`, `getAnniFattureFornitori` (Task 7), `getCollegamentoFic`, `sincronizzaFattureFornitori`, `getUrlPdfFatturaFornitore` (Task 7), `statoPagamento`, `oggiRoma`, `ETICHETTA_STATO_PAGAMENTO` (Task 5), `formatData`, `formatDataOra`, `descriviConteggi` (Task 8), `formatEuro` (`@/lib/pricing`), `usePermissions` (`@/contexts/PermissionsContext`).
- Produces:

```ts
// lib/fic/filtri.ts
export type FiltroStato = StatoPagamento | 'tutte'
export function filtraFatture(fatture: FatturaFornitore[], ricerca: string, stato: FiltroStato, oggi: string): FatturaFornitore[]
export function totaliFatture(fatture: FatturaFornitore[]): { netto: number; iva: number; lordo: number }
```

- [ ] **Step 1: Test dei filtri (falliscono)**

`lib/fic/filtri.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filtraFatture, totaliFatture } from '@/lib/fic/filtri'
import type { FatturaFornitore } from '@/types/fatture-fornitori'

const OGGI = '2026-09-28'
const f = (over: Partial<FatturaFornitore>): FatturaFornitore => ({
  id: 'x', fic_id: 1, tipo: 'fattura', numero: 'FT 1', data: '2026-01-01', descrizione: null,
  categoria: null, elettronica: true, fornitore_fic_id: null, fornitore_nome: 'Alluminio Sud',
  fornitore_piva: null, importo_netto: 100, importo_iva: 22, ritenuta: 0, altra_ritenuta: 0,
  importo_lordo: 122, prossima_scadenza: null, ha_allegato: false, sincronizzata_at: '', rate: [],
  ...over,
})
const rata = (stato: 'pagata' | 'da_pagare', scadenza: string) => ({
  id: 'r', fattura_id: 'x', fic_id: null, importo: 1, scadenza, stato, pagata_il: null,
  conto_fic_id: null, conto_nome: null, ordine: 0,
})

describe('filtraFatture', () => {
  const elenco = [
    f({ id: 'a', fornitore_nome: 'Alluminio Sud', numero: 'FT 12', rate: [rata('pagata', '2026-01-31')] }),
    f({ id: 'b', fornitore_nome: 'Ferramenta Rossi', numero: 'A/77', rate: [rata('da_pagare', '2026-08-31')] }),
    f({ id: 'c', fornitore_nome: 'Vetri Nord', numero: null, rate: [rata('da_pagare', '2026-12-31')] }),
  ]
  it('ricerca per fornitore, senza maiuscole', () => {
    expect(filtraFatture(elenco, 'rossi', 'tutte', OGGI).map((x) => x.id)).toEqual(['b'])
  })
  it('ricerca per numero', () => {
    expect(filtraFatture(elenco, 'ft 12', 'tutte', OGGI).map((x) => x.id)).toEqual(['a'])
  })
  it('numero null non rompe la ricerca', () => {
    expect(filtraFatture(elenco, 'vetri', 'tutte', OGGI).map((x) => x.id)).toEqual(['c'])
  })
  it('filtro per stato pagamento', () => {
    expect(filtraFatture(elenco, '', 'scaduta', OGGI).map((x) => x.id)).toEqual(['b'])
    expect(filtraFatture(elenco, '', 'pagata', OGGI).map((x) => x.id)).toEqual(['a'])
    expect(filtraFatture(elenco, '', 'da_pagare', OGGI).map((x) => x.id)).toEqual(['c'])
  })
})

describe('totaliFatture', () => {
  it('somma, con le note di credito gia\' negative', () => {
    const t = totaliFatture([
      f({ importo_netto: 100, importo_iva: 22, importo_lordo: 122 }),
      f({ tipo: 'nota_credito', importo_netto: -10, importo_iva: -2.2, importo_lordo: -12.2 }),
    ])
    expect(t).toEqual({ netto: 90, iva: 19.8, lordo: 109.8 })
  })
})
```

Run: `npx vitest run lib/fic/filtri.test.ts` → FAIL (modulo mancante).

- [ ] **Step 2: Implementare `lib/fic/filtri.ts`**

```ts
import type { FatturaFornitore, StatoPagamento } from '@/types/fatture-fornitori'
import { statoPagamento } from '@/lib/fic/stato-pagamento'

export type FiltroStato = StatoPagamento | 'tutte'

export function filtraFatture(
  fatture: FatturaFornitore[],
  ricerca: string,
  stato: FiltroStato,
  oggi: string,
): FatturaFornitore[] {
  const q = ricerca.trim().toLowerCase()
  return fatture.filter((f) => {
    if (q && !f.fornitore_nome.toLowerCase().includes(q) && !(f.numero ?? '').toLowerCase().includes(q)) return false
    if (stato !== 'tutte' && statoPagamento(f.rate, oggi) !== stato) return false
    return true
  })
}

const cent = (v: number) => Math.round(v * 100) / 100

export function totaliFatture(fatture: FatturaFornitore[]): { netto: number; iva: number; lordo: number } {
  const t = fatture.reduce(
    (acc, f) => ({ netto: acc.netto + f.importo_netto, iva: acc.iva + f.importo_iva, lordo: acc.lordo + f.importo_lordo }),
    { netto: 0, iva: 0, lordo: 0 },
  )
  return { netto: cent(t.netto), iva: cent(t.iva), lordo: cent(t.lordo) }
}
```

Run: `npx vitest run lib/fic/filtri.test.ts` → PASS.

- [ ] **Step 3: `components/fatture-fornitori/BarraSincronizzazione.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sincronizzaFattureFornitori } from '@/actions/fatture-in-cloud'
import { formatDataOra, descriviConteggi } from '@/lib/fic/formato'
import type { CollegamentoFic } from '@/types/fatture-fornitori'

export default function BarraSincronizzazione({
  collegamento,
  puoSincronizzare,
}: {
  collegamento: CollegamentoFic | null
  puoSincronizzare: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const attivo = collegamento?.stato === 'attivo'

  function sincronizzaOra() {
    startTransition(async () => {
      const r = await sincronizzaFattureFornitori()
      if (r.esito === 'ok') toast.success(`Sincronizzazione completata: ${descriviConteggi(r.conteggi)}`)
      else if (r.esito === 'parziale') toast.warning(r.messaggio)
      else toast.error(r.messaggio)
      router.refresh()
    })
  }

  if (!collegamento || !attivo) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
        {collegamento
          ? 'Il collegamento a Fatture in Cloud va rinnovato: il token è stato rifiutato.'
          : 'Fatture in Cloud non è collegato.'}{' '}
        <Link href="/impostazioni" className="font-medium underline">Vai in Impostazioni → Fatture in Cloud</Link>
      </div>
    )
  }

  const esitoDaMostrare =
    collegamento.ultimo_esito && collegamento.ultimo_esito !== 'ok' && collegamento.ultimo_messaggio
      ? collegamento.ultimo_messaggio
      : null

  return (
    <div className="flex flex-wrap items-center gap-3">
      {puoSincronizzare && (
        <Button onClick={sincronizzaOra} disabled={pending}>
          <RefreshCw className={pending ? 'animate-spin' : ''} />
          {pending ? 'Sincronizzazione…' : 'Sincronizza'}
        </Button>
      )}
      <div className="text-sm text-muted-foreground">
        Ultima sincronizzazione:{' '}
        {collegamento.ultima_sync_at ? (
          <>
            <span className="font-medium text-foreground">{formatDataOra(collegamento.ultima_sync_at)}</span>
            {collegamento.ultimo_esito === 'ok' && collegamento.ultimi_conteggi && ` · ${descriviConteggi(collegamento.ultimi_conteggi)}`}
          </>
        ) : 'mai'}
      </div>
      {esitoDaMostrare && (
        <div className={`w-full text-sm ${collegamento.ultimo_esito === 'errore' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
          {esitoDaMostrare}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `components/fatture-fornitori/DialogFatturaFornitore.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getUrlPdfFatturaFornitore } from '@/actions/fatture-in-cloud'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import type { FatturaFornitore } from '@/types/fatture-fornitori'

export default function DialogFatturaFornitore({
  fattura,
  onClose,
}: {
  fattura: FatturaFornitore | null
  onClose: () => void
}) {
  const [apertura, setApertura] = useState(false)

  async function apriPdf() {
    if (!fattura) return
    // La finestra si apre subito, dentro il gesto del clic: aperta dopo l'await
    // i browser mobili la bloccherebbero come popup.
    const finestra = window.open('', '_blank')
    setApertura(true)
    const r = await getUrlPdfFatturaFornitore(fattura.id)
    setApertura(false)
    if (r.url) {
      if (finestra) finestra.location.href = r.url
      else window.location.href = r.url
    } else {
      finestra?.close()
      toast.error(r.errore ?? 'PDF non disponibile')
    }
  }

  return (
    <Dialog open={fattura !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        {fattura && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {fattura.tipo === 'nota_credito' ? 'Nota di credito' : 'Fattura'} {fattura.numero ?? '(senza numero)'}
                <span className="text-muted-foreground font-normal">del {formatData(fattura.data)}</span>
                {fattura.elettronica && <Badge variant="secondary">Elettronica</Badge>}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Fornitore</div>
                <div className="font-medium">{fattura.fornitore_nome}</div>
                {fattura.fornitore_piva && <div>P.IVA {fattura.fornitore_piva}</div>}
              </div>
              <div>
                <div className="text-muted-foreground">Categoria</div>
                <div>{fattura.categoria ?? '—'}</div>
              </div>
              {fattura.descrizione && (
                <div className="sm:col-span-2">
                  <div className="text-muted-foreground">Descrizione</div>
                  <div className="whitespace-pre-wrap">{fattura.descrizione}</div>
                </div>
              )}
              <div className="sm:col-span-2 grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3">
                <div><div className="text-muted-foreground">Imponibile</div>€ {formatEuro(fattura.importo_netto)}</div>
                <div><div className="text-muted-foreground">IVA</div>€ {formatEuro(fattura.importo_iva)}</div>
                <div><div className="text-muted-foreground">Totale</div><strong>€ {formatEuro(fattura.importo_lordo)}</strong></div>
                {(fattura.ritenuta !== 0 || fattura.altra_ritenuta !== 0) && (
                  <div className="col-span-3 text-muted-foreground">
                    Ritenute: € {formatEuro(fattura.ritenuta + fattura.altra_ritenuta)}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Rate</h3>
              {fattura.rate.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna rata su Fatture in Cloud.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scadenza</TableHead>
                        <TableHead className="text-right">Importo</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead>Pagata il</TableHead>
                        <TableHead>Conto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fattura.rate.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.scadenza ? formatData(r.scadenza) : '—'}</TableCell>
                          <TableCell className="text-right">€ {formatEuro(r.importo)}</TableCell>
                          <TableCell>
                            {r.stato === 'pagata' ? <Badge variant="secondary">Pagata</Badge> : <Badge variant="outline">Da pagare</Badge>}
                          </TableCell>
                          <TableCell>{r.pagata_il ? formatData(r.pagata_il) : '—'}</TableCell>
                          <TableCell>{r.conto_nome ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {fattura.ha_allegato && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={apriPdf} disabled={apertura}>
                  <FileText /> {apertura ? 'Apertura…' : 'Apri PDF'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: `components/fatture-fornitori/ElencoFattureFornitori.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermissions } from '@/contexts/PermissionsContext'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import { filtraFatture, totaliFatture, type FiltroStato } from '@/lib/fic/filtri'
import { statoPagamento, oggiRoma, ETICHETTA_STATO_PAGAMENTO } from '@/lib/fic/stato-pagamento'
import BarraSincronizzazione from '@/components/fatture-fornitori/BarraSincronizzazione'
import DialogFatturaFornitore from '@/components/fatture-fornitori/DialogFatturaFornitore'
import type { CollegamentoFic, FatturaFornitore, StatoPagamento } from '@/types/fatture-fornitori'

const VARIANTE_STATO: Record<StatoPagamento, 'secondary' | 'outline' | 'destructive' | 'default'> = {
  pagata: 'secondary',
  parziale: 'default',
  da_pagare: 'outline',
  scaduta: 'destructive',
}

export default function ElencoFattureFornitori({
  fatture,
  anni,
  anno,
  collegamento,
}: {
  fatture: FatturaFornitore[]
  anni: number[]
  anno: number
  collegamento: CollegamentoFic | null
}) {
  const router = useRouter()
  const { canEdit } = usePermissions()
  const [ricerca, setRicerca] = useState('')
  const [stato, setStato] = useState<FiltroStato>('tutte')
  const [aperta, setAperta] = useState<FatturaFornitore | null>(null)
  const oggi = oggiRoma()

  const filtrate = useMemo(() => filtraFatture(fatture, ricerca, stato, oggi), [fatture, ricerca, stato, oggi])
  const totali = totaliFatture(filtrate)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fatture fornitori</h1>
        <p className="mt-1 text-sm text-muted-foreground">Spese registrate su Fatture in Cloud.</p>
      </div>

      <BarraSincronizzazione collegamento={collegamento} puoSincronizzare={canEdit('fatture_fornitori')} />

      <div className="flex flex-wrap gap-2">
        <Select value={String(anno)} onValueChange={(v) => router.push(`/fatture-fornitori?anno=${v}`)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anni.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:w-64"
          placeholder="Cerca fornitore o numero"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
        />
        <Select value={stato} onValueChange={(v) => setStato(v as FiltroStato)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutti gli stati</SelectItem>
            {(Object.keys(ETICHETTA_STATO_PAGAMENTO) as StatoPagamento[]).map((s) => (
              <SelectItem key={s} value={s}>{ETICHETTA_STATO_PAGAMENTO[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtrate.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {fatture.length === 0 ? `Nessuna fattura per il ${anno}.` : 'Nessuna fattura corrisponde ai filtri.'}
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Imponibile</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead>Prossima scadenza</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrate.map((f) => {
                  const s = statoPagamento(f.rate, oggi)
                  return (
                    <TableRow key={f.id} className="cursor-pointer" onClick={() => setAperta(f)}>
                      <TableCell>{formatData(f.data)}</TableCell>
                      <TableCell>
                        {f.numero ?? '—'}
                        {f.tipo === 'nota_credito' && <Badge variant="outline" className="ml-2">NC</Badge>}
                      </TableCell>
                      <TableCell>{f.fornitore_nome}</TableCell>
                      <TableCell className="text-right">€ {formatEuro(f.importo_netto)}</TableCell>
                      <TableCell className="text-right">€ {formatEuro(f.importo_iva)}</TableCell>
                      <TableCell className="text-right font-medium">€ {formatEuro(f.importo_lordo)}</TableCell>
                      <TableCell>{f.prossima_scadenza ? formatData(f.prossima_scadenza) : '—'}</TableCell>
                      <TableCell><Badge variant={VARIANTE_STATO[s]}>{ETICHETTA_STATO_PAGAMENTO[s]}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>{filtrate.length} documenti</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totali.netto)}</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totali.iva)}</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totali.lordo)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {filtrate.map((f) => {
              const s = statoPagamento(f.rate, oggi)
              return (
                <button
                  key={f.id}
                  type="button"
                  className="w-full rounded-md border p-3 text-left"
                  onClick={() => setAperta(f)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{f.fornitore_nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.tipo === 'nota_credito' ? 'NC ' : ''}{f.numero ?? '—'} · {formatData(f.data)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">€ {formatEuro(f.importo_lordo)}</div>
                      <Badge variant={VARIANTE_STATO[s]}>{ETICHETTA_STATO_PAGAMENTO[s]}</Badge>
                    </div>
                  </div>
                </button>
              )
            })}
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              {filtrate.length} documenti · Totale <strong>€ {formatEuro(totali.lordo)}</strong>
            </div>
          </div>
        </>
      )}

      <DialogFatturaFornitore fattura={aperta} onClose={() => setAperta(null)} />
    </div>
  )
}
```

- [ ] **Step 6: `app/(dashboard)/fatture-fornitori/page.tsx`**

```tsx
import { requireAccesso } from '@/lib/permessi'
import { getFattureFornitori, getAnniFattureFornitori } from '@/actions/fatture-fornitori'
import { getCollegamentoFic } from '@/actions/fatture-in-cloud'
import ElencoFattureFornitori from '@/components/fatture-fornitori/ElencoFattureFornitori'

export const dynamic = 'force-dynamic'
// La Server Action di sincronizzazione gira nel contesto di questa pagina:
// il suo budget di tempo (240 s) deve stare sotto questo limite.
export const maxDuration = 300

export default async function FattureFornitoriPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>
}) {
  await requireAccesso('fatture_fornitori')
  const { anno } = await searchParams
  const annoScelto = Number(anno) > 2000 ? Number(anno) : new Date().getFullYear()

  const [fatture, anni, collegamento] = await Promise.all([
    getFattureFornitori(annoScelto),
    getAnniFattureFornitori(),
    getCollegamentoFic(),
  ])

  return (
    <ElencoFattureFornitori
      fatture={fatture}
      anni={anni.includes(annoScelto) ? anni : [annoScelto, ...anni].sort((a, b) => b - a)}
      anno={annoScelto}
      collegamento={collegamento}
    />
  )
}
```

- [ ] **Step 7: Verifica**

Run: `npx tsc --noEmit && npx eslint components/fatture-fornitori "app/(dashboard)/fatture-fornitori" lib/fic && npx vitest run lib/fic`
Expected: nessun errore, test verdi.

Manuale (`npm run dev`): voce "Fatture fornitori" in sidebar; senza collegamento compare l'avviso con link a Impostazioni; un utente con permesso `fatture_fornitori = nessuno` non vede la voce e viene rediretto se apre l'URL.

- [ ] **Step 8: Commit**

```bash
git add lib/fic/filtri.ts lib/fic/filtri.test.ts components/fatture-fornitori "app/(dashboard)/fatture-fornitori"
git commit -m "feat(fic): pagina fatture fornitori con sincronizzazione manuale"
```

---

### Task 10: Prova end-to-end, build, documentazione, merge

**Files:**
- Modify: `PRD.md` (sezione del nuovo modulo)
- Create: memoria `project_fatture_in_cloud.md` + riga in `MEMORY.md`

- [ ] **Step 1: Suite completa, lint, build**

Run: `npm run test && npm run lint && npm run build`
Expected: tutti i test verdi, lint a zero (vedi memoria "Lint a zero"), build ok. Se la build locale fallisce per `RESEND_API_KEY` mancante, rilanciare con una chiave fittizia (problema preesistente, vedi MEMORY.md).

- [ ] **Step 2: Prova reale col token dell'utente**

Dove: in locale se la sonda del Task 1 ha avuto 200 dal locale, altrimenti su un deploy di anteprima/produzione.
1. Impostazioni → Fatture in Cloud: incollare il token, Verifica, Salva. Atteso: "Collegato a …", token mascherato con le ultime 4 cifre.
2. Controllo nel DB (`execute_sql`): `select token_finale, vault_secret_id is not null from fic_collegamenti;` e `select count(*) from vault.secrets where name like 'fic_token_%';` → 1. Il token in chiaro non compare in nessuna colonna di `fic_collegamenti`.
3. Fatture fornitori → Sincronizza. Atteso: esito ok o parziale con "premi di nuovo"; ripetere fino a ok. "Ultima sincronizzazione" mostra data e ora.
4. Confrontare con FiC: numero di spese dell'anno corrente, totale lordo di 2-3 fatture, stato delle rate di una fattura pagata e di una da pagare, una nota di credito col segno meno.
5. Doppio clic rapido su Sincronizza da due schede: la seconda riceve "Sincronizzazione già in corso".
6. Su FiC modificare una spesa (es. la descrizione) → Sincronizza → "1 aggiornata", descrizione cambiata.
7. "Apri PDF" su una fattura con allegato: si apre il PDF.
8. Token sbagliato in "Sostituisci token" → Verifica mostra l'errore, il collegamento esistente resta intatto.

- [ ] **Step 3: Aggiornare `PRD.md`**

Aggiungere nella sezione delle fasi completate un blocco "Collegamento Fatture in Cloud — fase 1 (2026-09-28)" con: cosa fa, file principali (`lib/fic/*`, `actions/fatture-in-cloud.ts`, `actions/fatture-fornitori.ts`, componenti, migrazione), le regole ferme (FiC comanda; eliminazioni solo su elenco completo; nessun effetto su statistiche), gli esiti della sonda del Task 1, e nel backlog le fasi 2 (pagamenti scritti su FiC, convivenza con `scadenze`) e 3 (fatture → commesse).

- [ ] **Step 4: Memoria di progetto**

Creare `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\project_fatture_in_cloud.md` con frontmatter (`name: project-fatture-in-cloud`, `type: project`) e le scelte da non ribaltare: token manuale per organizzazione nel Vault (niente env), sync solo manuale e perché, `ultima_sync_at` = partenza dell'ultima completa, `fic_updated_at` stringa grezza, note di credito negative in `mappa.ts`, dati solo-WinStudio in tabelle separate, fasi 2-3 aperte. Aggiungere la riga in `MEMORY.md`.

- [ ] **Step 5: Commit, merge, pulizia branch**

```bash
git add PRD.md
git commit -m "docs(fic): PRD aggiornato col collegamento Fatture in Cloud"
git checkout master
git merge --no-ff feat/fatture-in-cloud -m "merge: collegamento a Fatture in Cloud e fatture fornitori"
git push origin master
git branch -d feat/fatture-in-cloud
git push origin --delete feat/fatture-in-cloud 2>/dev/null || true
```

(Pulizia del branch senza chiedere: memoria "Feedback pulizia branch".)
