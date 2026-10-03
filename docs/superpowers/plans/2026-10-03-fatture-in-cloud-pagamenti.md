# Fatture in Cloud fase 2 — Pagamenti: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare le scadenze di WinStudio alle fatture e note di credito FiC e scrivere/annullare su FiC il pagamento quando la scadenza viene pagata o non lo è più.

**Architecture:** Tabella di collegamento `scadenze_fatture` (dato solo WinStudio) + colonna `scadenze.fic_metodo_id`. Tre moduli puri testati (`lib/fic/pagamenti.ts` ripartizione e controllo, `lib/fic/pagamenti-fic.ts` scrittura/annullamento sulle rate FiC, `lib/fic/allineamento.ts` decisione e messaggi). Un modulo server `lib/fic/allinea-scadenza.ts` con l'unico punto `allineaScadenzaFic`, chiamato da tutte le azioni delle scadenze e dalle nuove Server Action `actions/fic-pagamenti.ts`. UI: finestra di collegamento dalle righe scadenza, riquadro "da allineare" e sezione "Pagata con" nella pagina Fatture fornitori.

**Tech Stack:** Next.js 16 (Server Actions), Supabase, Fatture in Cloud API v2 (`PUT /c/{company}/received_documents/{id}`, `GET /c/{company}/settings/payment_accounts`), shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-fatture-in-cloud-pagamenti-design.md` (fase 1: `docs/superpowers/specs/2026-09-28-fatture-in-cloud-collegamento-design.md`)

## Global Constraints

- Scrivere sempre in italiano all'utente (memoria "Feedback lingua").
- Le statistiche, il flusso di cassa, i Calcoli e i costi NON cambiano: nessuna modifica a `lib/statistiche-commesse.ts`, `lib/costi-mensili.ts`, pagine statistiche/calcoli.
- `fatture_fornitori` e `fatture_fornitori_rate` restano "FiC comanda": il collegamento sta solo in `scadenze_fatture`.
- L'azione sulla scadenza riesce sempre in WinStudio; l'esito FiC torna come avviso. Unica eccezione: eliminare una scadenza con collegamenti `scritto` richiede che l'annullamento su FiC riesca.
- Stati collegamento: `non_scritto` / `scritto` / `da_allineare` (Riprova può risolvere) / `da_verificare` (serve una persona).
- Il totale delle rate di un documento FiC non cambia mai per mano di WinStudio.
- Confronti al centesimo (`Math.round(x*100)/100`).
- Data del pagamento su FiC = `data_scadenza`, o oggi a Roma se manca.
- Metodo FiC default "Assegno" (per nome, case-insensitive) per `categoria = 'assegno'`.
- Permessi: collegare/Riprova = scrittura `commesse` + almeno lettura `fatture_fornitori`, verificati lato server.
- Server Action: errori restituiti come valori dove l'utente li deve leggere; il codice esistente di `actions/scadenze.ts` continua a lanciare dove già lancia.
- Letture di tabelle intere con `selectAll()`.
- Lint a zero, `npm run build` verde.

**Scostamenti dalla spec (motivati):**

1. L'icona "Fatture" sta solo nella riga della scadenza, non dentro `DialogScadenza`: quella finestra serve anche a creare (senza id) e la riga è sempre a portata di mano. Costo: un clic in più se si è dentro la finestra.
2. Cambiare l'importo di una scadenza pagata non riapre la finestra con conferma: le quote restano com'erano e, se non tornano più con l'importo, l'esito mostra l'avviso "Gli importi delle fatture collegate non tornano più con la scadenza: apri Fatture per controllare". La conferma vera resta nella finestra.
3. `deleteGruppo` già rifiuta i blocchi con scadenze (`actions/commesse.ts:679`): nessuna modifica lì; il `ON DELETE RESTRICT` resta come rete.
4. Nella finestra, cambiare la selezione ricalcola tutte le quote (le correzioni manuali si perdono al cambio di selezione, non al cambio di una quota).

## Review Focus

- Scadenza pagata collegata a due fatture: una scrittura riesce, la seconda va in errore di rete → la prima resta `scritto`, la seconda `da_allineare`, e "Riprova" scrive solo la seconda senza toccare la prima. Test in Task 6 (decisione per collegamento) + verifica reale in Task 11.
- Due scadenze diverse che pagano la stessa fattura (metà ciascuna) → la seconda scrittura parte dalla fattura riletta con la prima metà già pagata e copre la seconda metà. Test in Task 5.
- Togli "pagato" dopo che qualcuno su FiC ha modificato a mano una rata scritta da WinStudio → nessuna modifica su FiC, collegamento `da_verificare` col motivo. Test in Task 5.
- Nota di credito più grande delle fatture selezionate (NC 500 €, fatture 300 €, scadenza 0 €… o scadenza 100 €) → il controllo segnala la differenza e non produce quote negative. Test in Task 4.
- Fornitore scritto diversamente sulla scadenza ("F.lli LALOMIA SRL" vs "F.LLI LALOMIA S.R.L.") → la ricerca lo trova. Test in Task 4.

---

## Mappa dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261003100000_fic_pagamenti.sql` | `scadenze.fic_metodo_id`, tabella `scadenze_fatture`, RLS |
| `types/fatture-fornitori.ts` | tipi nuovi condivisi (stati, riepiloghi, esito) |
| `lib/fic/client.ts` | + `aggiornaRate` (PUT), `metodiPagamento` |
| `lib/fic/tabelle-supabase.ts` | `tabelleSupabase` spostato fuori da `actions/fatture-in-cloud.ts` |
| `lib/fic/pagamenti.ts` | residuo, ripartizione, controllo, ricerca fornitore |
| `lib/fic/pagamenti-fic.ts` | `applicaPagamento`, `costruisciScrittura`, `annullaPagamento` |
| `lib/fic/allineamento.ts` | `decidiAzione`, `messaggioEsitoFic`, `avvisoImporti` |
| `lib/fic/allinea-scadenza.ts` | server: `allineaScadenzaFic`, `allineaSeCollegata`, `liberaPerEliminazione` |
| `actions/fic-pagamenti.ts` | Server Action della finestra, Riprova, riepiloghi |
| `actions/scadenze.ts` | le azioni esistenti chiamano l'allineamento |
| `hooks/useScadenzeRighe.ts`, `components/commesse/DialogScadenza.tsx` | toast con l'esito FiC |
| `components/commesse/esito-fic.ts` | `mostraEsitoFic` (toast) |
| `components/commesse/DialogCollegaFatture.tsx` | finestra di collegamento |
| `components/commesse/IconaFattureScadenza.tsx` | icona nella riga |
| `components/commesse/RigaScadenza.tsx`, `ScadenzeView.tsx`, `ScadenzeDaProgrammareView.tsx`, `app/(dashboard)/commesse/[id]/page.tsx` | aggancio icona + finestra |
| `components/fatture-fornitori/BannerPagamentiFic.tsx` | riquadro "da allineare" |
| `components/fatture-fornitori/DialogFatturaFornitore.tsx`, `ElencoFattureFornitori.tsx`, `app/(dashboard)/fatture-fornitori/page.tsx` | "Pagata con", icona programmata, banner |

---

### Task 1: Prova reale di scrittura e annullamento su FiC

**Ferma l'esecuzione e chiedi all'utente** il numero di una fattura fornitore (non elettronica bloccata, con almeno una rata da pagare) su cui provare. Scrittura su un servizio esterno: serve il suo via libera esplicito.

**Files:**
- Create (scratchpad, non nel repo): `prova-scrittura-fic.mjs`

**Interfaces:**
- Produces: esiti annotati nel ledger, che confermano o correggono i Task 3 e 5.

- [ ] **Step 1: Scrivere lo script nello scratchpad**

```js
// prova-scrittura-fic.mjs — uso (dalla root del progetto): node <scratchpad>/prova-scrittura-fic.mjs <fic_id>
// Divide la prima rata da pagare: meta' pagata, meta' da pagare. Poi rimette tutto com'era.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const ficId = Number(process.argv[2])
if (!ficId) throw new Error('manca fic_id')
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: coll } = await svc.from('fic_collegamenti').select('organization_id, fic_company_id').single()
const { data: token } = await svc.rpc('fic_leggi_token', { p_org: coll.organization_id })
const url = `https://api-v2.fattureincloud.it/c/${coll.fic_company_id}/received_documents/${ficId}`
const h = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
const leggi = async () => (await (await fetch(`${url}?fieldset=detailed`, { headers: h })).json()).data
const scrivi = async (payments_list) => {
  const r = await fetch(url, { method: 'PUT', headers: h, body: JSON.stringify({ data: { payments_list } }) })
  const j = await r.json()
  console.log('PUT', r.status, r.status >= 400 ? JSON.stringify(j) : '')
  return j.data
}
const prima = await leggi()
const rate = prima.payments_list
console.log('locked:', prima.locked, 'e_invoice:', prima.e_invoice, 'gross:', prima.amount_gross, 'rate:', JSON.stringify(rate))
const i = rate.findIndex((r) => r.status !== 'paid')
if (i < 0) throw new Error('nessuna rata da pagare')
const meta = Math.round(rate[i].amount * 50) / 100
const { id: _omit, ...senzaId } = rate[i]
const nuove = rate.map((r, k) => (k === i
  ? { ...r, amount: meta, status: 'paid', paid_date: new Date().toISOString().slice(0, 10), payment_account: { id: 546834 } }
  : r))
nuove.push({ ...senzaId, amount: Math.round((rate[i].amount - meta) * 100) / 100 })
const dopo = await scrivi(nuove)
console.log('dopo scrittura:', JSON.stringify(dopo?.payments_list?.map((r) => ({ id: r.id, amount: r.amount, status: r.status, due: r.due_date, paid: r.paid_date }))))
// somma sbagliata: deve essere rifiutata
const sbagliata = rate.map((r, k) => (k === i ? { ...r, amount: r.amount + 1 } : r))
await scrivi(sbagliata)
// ripristino esatto
const ripristino = await scrivi(rate.map(({ id, amount, due_date, paid_date, status, payment_account, payment_terms }) => ({ id, amount, due_date, paid_date, status, payment_account, payment_terms })))
const finale = await leggi()
console.log('ripristinato uguale:', JSON.stringify(finale.payments_list.map((r) => [r.amount, r.status, r.due_date])) === JSON.stringify(rate.map((r) => [r.amount, r.status, r.due_date])))
console.log('updated_at prima/dopo:', prima.updated_at, finale.updated_at, Boolean(ripristino))
```

- [ ] **Step 2: Eseguirlo sulla fattura scelta dall'utente**

Run: `node "<scratchpad>/prova-scrittura-fic.mjs" <fic_id>`
Expected: primo PUT 200 con una rata in più (la nuova ha un id nuovo); PUT con somma sbagliata → 4xx; ripristino 200; `ripristinato uguale: true`.

- [ ] **Step 3: Annotare nel ledger**

1. il PUT del solo `payments_list` è accettato? (se no, annotare il corpo minimo richiesto e adattare `aggiornaRate` nel Task 3);
2. la rata nuova riceve un id nella risposta? l'ordine della risposta coincide?;
3. somma diversa dal totale → codice e messaggio;
4. il ripristino riporta le rate identiche? (se FiC ricrea id diversi, `annullaPagamento` usa già gli id della scrittura: annotare);
5. se la fattura era elettronica, `locked` e esito.

Nessun commit.

---

### Task 2: Migrazione

**Files:**
- Create: `supabase/migrations/20261003100000_fic_pagamenti.sql`

**Interfaces:**
- Produces: colonna `scadenze.fic_metodo_id bigint`; tabella `scadenze_fatture`.

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- ============================================================
-- 20261003100000_fic_pagamenti.sql
-- Fatture in Cloud fase 2: collegamento scadenze ↔ fatture/note FiC.
-- Dato solo WinStudio: la sincronizzazione FiC non tocca questa tabella.
-- ============================================================

ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS fic_metodo_id bigint;

CREATE TABLE scadenze_fatture (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL DEFAULT get_user_organization_id()
                                  REFERENCES organizations(id) ON DELETE CASCADE,
  -- RESTRICT: nessuna cancellazione (diretta o in cascata) puo' far sparire un
  -- collegamento senza passare dall'annullamento su FiC
  scadenza_id       uuid          NOT NULL REFERENCES scadenze(id) ON DELETE RESTRICT,
  fic_documento_id  bigint        NOT NULL,
  tipo_documento    text          NOT NULL CHECK (tipo_documento IN ('fattura', 'nota_credito')),
  importo           numeric(12,2) NOT NULL CHECK (importo > 0),
  stato_fic         text          NOT NULL DEFAULT 'non_scritto'
                                  CHECK (stato_fic IN ('non_scritto', 'scritto', 'da_allineare', 'da_verificare')),
  messaggio_fic     text,
  scrittura_fic     jsonb,
  scritto_at        timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (scadenza_id, fic_documento_id)
);

CREATE INDEX idx_scadenze_fatture_scadenza ON scadenze_fatture (scadenza_id);
CREATE INDEX idx_scadenze_fatture_documento ON scadenze_fatture (organization_id, fic_documento_id);
CREATE INDEX idx_scadenze_fatture_stato ON scadenze_fatture (organization_id, stato_fic);

ALTER TABLE scadenze_fatture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scadenze_fatture_org" ON scadenze_fatture
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
```

- [ ] **Step 2: Applicarla** con `apply_migration` (`name: "fic_pagamenti"`). Expected: successo.

- [ ] **Step 3: Verificare**

`execute_sql`: `select column_name from information_schema.columns where table_name='scadenze' and column_name='fic_metodo_id';` → 1 riga. `get_advisors` security → nessun avviso nuovo su `scadenze_fatture`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261003100000_fic_pagamenti.sql
git commit -m "feat(fic): tabella collegamento scadenze-fatture e metodo FiC sulla scadenza"
```

---

### Task 3: Client FiC — scrittura rate e metodi di pagamento; tabelle Supabase condivise

**Files:**
- Modify: `lib/fic/client.ts`
- Modify: `lib/fic/client.test.ts`
- Create: `lib/fic/tabelle-supabase.ts`
- Modify: `actions/fatture-in-cloud.ts` (usa `tabelleSupabase` dal nuovo file)

**Interfaces:**
- Consumes: `RataFic`, `DocumentoFic` da `lib/fic/tipi.ts`.
- Produces:

```ts
// lib/fic/client.ts — FicClient esteso
aggiornaRate: (companyId: number, id: number, rate: RataFic[]) => Promise<DocumentoFic>
metodiPagamento: (companyId: number) => Promise<{ id: number; nome: string }[]>
// lib/fic/tabelle-supabase.ts
export function tabelleSupabase(svc: SupabaseClient): TabelleFatture
```

- [ ] **Step 1: Test che falliscono** — aggiungere in fondo a `lib/fic/client.test.ts` (dentro il `describe` esistente):

```ts
  it('aggiorna le rate con un PUT del solo payments_list', async () => {
    const chiamate: { url: string; metodo: string; corpo: string | null }[] = []
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      chiamate.push({ url: String(input), metodo: init?.method ?? 'GET', corpo: (init?.body as string) ?? null })
      return new Response(JSON.stringify({ data: { id: 7, date: '2026-01-01', updated_at: 'x', payments_list: [] } }), { status: 200 })
    }) as typeof fetch
    const rate = [{ id: 1, amount: 10, due_date: '2026-02-01', paid_date: '2026-02-01', status: 'paid', payment_account: { id: 5 } }]
    const doc = await creaClientFic('t', impl).aggiornaRate(42, 7, rate)
    expect(doc.id).toBe(7)
    expect(chiamate[0].url).toBe(`${FIC_BASE_URL}/c/42/received_documents/7`)
    expect(chiamate[0].metodo).toBe('PUT')
    expect(JSON.parse(chiamate[0].corpo!)).toEqual({ data: { payments_list: rate } })
  })

  it('legge i metodi di pagamento', async () => {
    const f = fetchFinto([{ status: 200, body: { data: [{ id: 546834, name: 'Assegno' }, { id: 546835, name: 'Bonifico' }] } }])
    const metodi = await creaClientFic('t', f.impl).metodiPagamento(42)
    expect(metodi).toEqual([{ id: 546834, nome: 'Assegno' }, { id: 546835, nome: 'Bonifico' }])
    expect(f.chiamate[0].url).toBe(`${FIC_BASE_URL}/c/42/settings/payment_accounts`)
  })

  it('un 404 diventa FicErrore con status 404', async () => {
    const f = fetchFinto([{ status: 404, body: { error: { message: 'Not found' } } }])
    const err = await creaClientFic('t', f.impl).spesa(42, 9).catch((e) => e)
    expect((err as FicErrore).status).toBe(404)
  })
```

Run: `npx vitest run lib/fic/client.test.ts` → FAIL (`aggiornaRate`/`metodiPagamento` non esistono).

- [ ] **Step 2: Implementare in `lib/fic/client.ts`**

Sostituire la funzione interna `get` con una `richiesta` generica e tenere `get` come scorciatoia:

```ts
  async function richiesta<T>(
    metodo: 'GET' | 'PUT',
    percorso: string,
    parametri: Record<string, string> = {},
    corpo?: unknown,
  ): Promise<T> {
    n++
    const res = await fetchImpl(`${FIC_BASE_URL}${percorso}${querystring(parametri)}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
    })
    // (corpo identico all'attuale `get`: 401, 429, !res.ok, json)
  }
  const get = <T,>(percorso: string, parametri: Record<string, string> = {}) =>
    richiesta<T>('GET', percorso, parametri)
```

Aggiungere a `FicClient` e all'oggetto restituito:

```ts
    async aggiornaRate(companyId, id, rate) {
      // Modalita' delta di FiC: si manda solo il campo che cambia.
      const r = await richiesta<{ data: DocumentoFic }>('PUT', `/c/${companyId}/received_documents/${id}`, {}, {
        data: { payments_list: rate },
      })
      return r.data
    },

    async metodiPagamento(companyId) {
      const r = await get<{ data?: { id: number; name: string }[] | null }>(`/c/${companyId}/settings/payment_accounts`)
      return (r.data ?? []).map((m) => ({ id: m.id, nome: m.name }))
    },
```

Tipi in `FicClient`:

```ts
  aggiornaRate: (companyId: number, id: number, rate: RataFic[]) => Promise<DocumentoFic>
  metodiPagamento: (companyId: number) => Promise<{ id: number; nome: string }[]>
```

(import di `RataFic` da `@/lib/fic/tipi`). Aggiornare anche il `clientFinto` di `lib/fic/sincronizza.test.ts` aggiungendo `aggiornaRate: async () => { throw new Error('non usato') }, metodiPagamento: async () => []`, altrimenti non compila.

- [ ] **Step 3: Spostare `tabelleSupabase`**

Creare `lib/fic/tabelle-supabase.ts` con la funzione `tabelleSupabase` e l'helper `blocchi` copiati da `actions/fatture-in-cloud.ts` (stesso corpo, `LOTTO_DB = 200`), export `tabelleSupabase`. In `actions/fatture-in-cloud.ts` rimuovere la funzione locale e importare `import { tabelleSupabase } from '@/lib/fic/tabelle-supabase'` (lasciare `blocchi` locale se ancora usato da `elimina`).

- [ ] **Step 4: Verifica**

Run: `npx vitest run lib/fic && npx tsc --noEmit && npx eslint lib/fic actions/fatture-in-cloud.ts`
Expected: tutto verde.

- [ ] **Step 5: Commit**

```bash
git add lib/fic/client.ts lib/fic/client.test.ts lib/fic/sincronizza.test.ts lib/fic/tabelle-supabase.ts actions/fatture-in-cloud.ts
git commit -m "feat(fic): scrittura delle rate e metodi di pagamento nel client FiC"
```

---

### Task 4: Ripartizione, controllo e ricerca fornitore (`lib/fic/pagamenti.ts`)

**Files:**
- Create: `lib/fic/pagamenti.ts`, `lib/fic/pagamenti.test.ts`
- Modify: `types/fatture-fornitori.ts`

**Interfaces:**
- Produces (in `types/fatture-fornitori.ts`):

```ts
export type StatoFic = 'non_scritto' | 'scritto' | 'da_allineare' | 'da_verificare'
export type DocumentoCollegabile = {
  fic_id: number; tipo: TipoFatturaFornitore; numero: string | null; data: string
  fornitore_nome: string; importo_lordo: number; residuo: number; prima_scadenza: string | null
}
```

- Produces (in `lib/fic/pagamenti.ts`):

```ts
export type QuotaAltraScadenza = { fic_documento_id: number; importo: number; stato_fic: StatoFic }
export function residuoDisponibile(residuoFic: number, ficId: number, altre: QuotaAltraScadenza[], giaScrittoQui: number): number
export type DaRipartire = Pick<DocumentoCollegabile, 'fic_id' | 'tipo' | 'residuo' | 'prima_scadenza' | 'data'>
export function ripartisci(importoScadenza: number, selezionati: DaRipartire[]): Record<number, number>
export type RigaControllo = { fic_id: number; tipo: TipoFatturaFornitore; numero: string | null; residuo: number; quota: number }
export type EsitoControllo = { livello: 'ok' | 'avviso' | 'blocco'; totaleFatture: number; totaleNote: number; differenza: number; messaggi: string[] }
export function controllaRipartizione(importoScadenza: number, righe: RigaControllo[]): EsitoControllo
export function normalizzaFornitore(s: string): string
export function fornitoreCorrisponde(cercato: string, nome: string): boolean
```

- [ ] **Step 1: Aggiungere i tipi** a `types/fatture-fornitori.ts`:

```ts
export type StatoFic = 'non_scritto' | 'scritto' | 'da_allineare' | 'da_verificare'

/** Documento FiC proponibile nella finestra di collegamento: residuo gia' al netto delle altre scadenze. */
export type DocumentoCollegabile = {
  fic_id: number
  tipo: TipoFatturaFornitore
  numero: string | null
  data: string
  fornitore_nome: string
  /** Con segno: note di credito negative, come in fatture_fornitori. */
  importo_lordo: number
  /** Positivo: quanto si puo' ancora assegnare da questa scadenza. */
  residuo: number
  prima_scadenza: string | null
}
```

- [ ] **Step 2: Test che falliscono** — `lib/fic/pagamenti.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  residuoDisponibile, ripartisci, controllaRipartizione, normalizzaFornitore, fornitoreCorrisponde,
  type DaRipartire,
} from '@/lib/fic/pagamenti'

const fatt = (fic_id: number, residuo: number, prima_scadenza: string | null, data = '2026-01-01'): DaRipartire =>
  ({ fic_id, tipo: 'fattura', residuo, prima_scadenza, data })
const nc = (fic_id: number, residuo: number): DaRipartire =>
  ({ fic_id, tipo: 'nota_credito', residuo, prima_scadenza: '2026-01-01', data: '2026-01-01' })

describe('residuoDisponibile', () => {
  it('toglie le quote promesse da altre scadenze non ancora scritte', () => {
    const altre = [
      { fic_documento_id: 1, importo: 100, stato_fic: 'non_scritto' as const },
      { fic_documento_id: 1, importo: 50, stato_fic: 'da_allineare' as const },
      { fic_documento_id: 1, importo: 70, stato_fic: 'scritto' as const }, // gia' nelle rate FiC
      { fic_documento_id: 2, importo: 999, stato_fic: 'non_scritto' as const },
    ]
    expect(residuoDisponibile(500, 1, altre, 0)).toBe(350)
  })
  it("restituisce alla scadenza corrente la quota che ha gia' scritto", () => {
    expect(residuoDisponibile(200, 1, [], 300)).toBe(500)
  })
  it('mai negativo', () => {
    expect(residuoDisponibile(100, 1, [{ fic_documento_id: 1, importo: 300, stato_fic: 'non_scritto' }], 0)).toBe(0)
  })
})

describe('ripartisci', () => {
  it("copre le fatture dalla prima scadenza, l'ultima in parte", () => {
    expect(ripartisci(5000, [fatt(3, 1000, '2026-03-01'), fatt(1, 2500, '2026-01-31'), fatt(2, 1700, '2026-02-28')]))
      .toEqual({ 1: 2500, 2: 1700, 3: 800 })
  })
  it('scala prima le note di credito: 4500 + NC 500 coprono 5000 di fatture', () => {
    expect(ripartisci(4500, [fatt(1, 3000, '2026-01-31'), fatt(2, 2000, '2026-02-28'), nc(9, 500)]))
      .toEqual({ 1: 3000, 2: 2000, 9: 500 })
  })
  it('importo oltre le fatture: ogni fattura al suo residuo, il resto avanza', () => {
    expect(ripartisci(5000, [fatt(1, 4700, '2026-01-31')])).toEqual({ 1: 4700 })
  })
  it('senza disponibile le fatture in coda ricevono 0', () => {
    expect(ripartisci(100, [fatt(1, 100, '2026-01-31'), fatt(2, 50, '2026-02-28')])).toEqual({ 1: 100, 2: 0 })
  })
  it('senza scadenza ordina per data fattura, poi per id', () => {
    expect(ripartisci(150, [fatt(2, 100, null, '2026-01-05'), fatt(1, 100, null, '2026-01-05')])).toEqual({ 1: 100, 2: 50 })
  })
  it('arrotonda al centesimo', () => {
    expect(ripartisci(0.3, [fatt(1, 0.1, '2026-01-01'), fatt(2, 0.2, '2026-01-02')])).toEqual({ 1: 0.1, 2: 0.2 })
  })
})

describe('controllaRipartizione', () => {
  const riga = (fic_id: number, quota: number, residuo: number, tipo: 'fattura' | 'nota_credito' = 'fattura', numero = `FT ${fic_id}`) =>
    ({ fic_id, tipo, numero, residuo, quota })

  it('differenza zero → ok', () => {
    const e = controllaRipartizione(4500, [riga(1, 3000, 3000), riga(2, 2000, 2000), riga(9, 500, 500, 'nota_credito', 'NC 1')])
    expect(e).toMatchObject({ livello: 'ok', totaleFatture: 5000, totaleNote: 500, differenza: 0, messaggi: [] })
  })
  it('fattura coperta in parte → avviso con quanto resta', () => {
    const e = controllaRipartizione(5000, [riga(1, 2500, 2500), riga(2, 2500, 2700, 'fattura', 'FT 12/2026')])
    expect(e.livello).toBe('avviso')
    expect(e.messaggi).toContain('200,00 € resteranno da pagare sulla fattura FT 12/2026')
  })
  it('importo oltre le fatture → avviso', () => {
    const e = controllaRipartizione(5000, [riga(1, 4700, 4700)])
    expect(e.livello).toBe('avviso')
    expect(e.differenza).toBe(300)
    expect(e.messaggi).toContain('300,00 € della scadenza non coprono nessuna fattura')
  })
  it('quote oltre la scadenza → avviso', () => {
    const e = controllaRipartizione(1000, [riga(1, 1200, 1500)])
    expect(e.livello).toBe('avviso')
    expect(e.messaggi).toContain("Le quote superano l'importo della scadenza di 200,00 €")
  })
  it('quota oltre il residuo → blocco', () => {
    const e = controllaRipartizione(1000, [riga(1, 1000, 800)])
    expect(e.livello).toBe('blocco')
    expect(e.messaggi).toContain('FT 1: al massimo 800,00 €')
  })
  it('quota zero su un documento spuntato → blocco', () => {
    const e = controllaRipartizione(100, [riga(1, 100, 100), riga(2, 0, 50)])
    expect(e.livello).toBe('blocco')
    expect(e.messaggi).toContain('FT 2: nessun importo assegnato, toglila o aumenta l\'importo')
  })
  it("nota di credito piu' grande delle fatture → avviso, niente quote negative", () => {
    const e = controllaRipartizione(100, [riga(1, 300, 300), riga(9, 500, 500, 'nota_credito', 'NC 1')])
    expect(e.livello).toBe('avviso')
    expect(e.differenza).toBe(300)
  })
})

describe('fornitore', () => {
  it('normalizza forme societarie, punteggiatura e maiuscole', () => {
    expect(normalizzaFornitore('PROFILSIDER S.r.l.')).toBe('profilsider')
    expect(normalizzaFornitore('F.lli LALOMIA SRL')).toBe('f lli lalomia')
    expect(normalizzaFornitore('Agrusa s.p.a.')).toBe('agrusa')
  })
  it('trova lo stesso fornitore scritto in modi diversi', () => {
    expect(fornitoreCorrisponde('F.lli LALOMIA SRL', 'F.LLI LALOMIA S.R.L.')).toBe(true)
    expect(fornitoreCorrisponde('PROFILSIDER SRL', 'Profilsider S.r.l.')).toBe(true)
    expect(fornitoreCorrisponde('EDILSIDER SPA', 'EDIL SIDER S.P.A.')).toBe(true)
    expect(fornitoreCorrisponde('SIRTAL', 'SIRTAL S.R.L.')).toBe(true)
  })
  it('non confonde fornitori diversi', () => {
    expect(fornitoreCorrisponde('SIRTAL', 'Profilsider S.r.l.')).toBe(false)
  })
  it('ricerca vuota trova tutto', () => {
    expect(fornitoreCorrisponde('  ', 'Qualsiasi')).toBe(true)
  })
})
```

Run: `npx vitest run lib/fic/pagamenti.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: Implementare `lib/fic/pagamenti.ts`**

```ts
import type { DocumentoCollegabile, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'
import { formatEuro } from '@/lib/pricing'

const cent = (v: number) => Math.round(v * 100) / 100

export type QuotaAltraScadenza = { fic_documento_id: number; importo: number; stato_fic: StatoFic }

/**
 * Quanto la scadenza corrente puo' ancora assegnare a un documento.
 * `residuoFic` sono le rate da pagare su FiC (copia locale). Le quote di altre
 * scadenze gia' `scritto` sono gia' dentro quelle rate; le altre (non scritte,
 * da allineare, da verificare) sono promesse e si tolgono. `giaScrittoQui` e'
 * quanto la scadenza corrente ha gia' scritto su questo documento: su FiC
 * risulta pagato, ma e' suo e torna disponibile per lei.
 */
export function residuoDisponibile(
  residuoFic: number,
  ficId: number,
  altre: QuotaAltraScadenza[],
  giaScrittoQui: number,
): number {
  const promesso = altre
    .filter((q) => q.fic_documento_id === ficId && q.stato_fic !== 'scritto')
    .reduce((s, q) => s + q.importo, 0)
  return Math.max(0, cent(residuoFic + giaScrittoQui - promesso))
}

export type DaRipartire = Pick<DocumentoCollegabile, 'fic_id' | 'tipo' | 'residuo' | 'prima_scadenza' | 'data'>

const chiaveOrdine = (d: DaRipartire) => d.prima_scadenza ?? d.data

/**
 * Ripartizione automatica: le note di credito si scalano per intero, poi le
 * fatture si coprono dalla prima scadenza finche' c'e' disponibile.
 */
export function ripartisci(importoScadenza: number, selezionati: DaRipartire[]): Record<number, number> {
  const quote: Record<number, number> = {}
  let disponibile = cent(importoScadenza)
  for (const n of selezionati.filter((d) => d.tipo === 'nota_credito')) {
    quote[n.fic_id] = cent(n.residuo)
    disponibile = cent(disponibile + n.residuo)
  }
  const fatture = selezionati
    .filter((d) => d.tipo === 'fattura')
    .sort((a, b) =>
      chiaveOrdine(a).localeCompare(chiaveOrdine(b)) || a.data.localeCompare(b.data) || a.fic_id - b.fic_id)
  for (const f of fatture) {
    const q = cent(Math.min(f.residuo, Math.max(0, disponibile)))
    quote[f.fic_id] = q
    disponibile = cent(disponibile - q)
  }
  return quote
}

export type RigaControllo = {
  fic_id: number
  tipo: TipoFatturaFornitore
  numero: string | null
  residuo: number
  quota: number
}

export type EsitoControllo = {
  livello: 'ok' | 'avviso' | 'blocco'
  totaleFatture: number
  totaleNote: number
  differenza: number
  messaggi: string[]
}

const etichetta = (r: RigaControllo) => r.numero ?? `${r.tipo === 'nota_credito' ? 'NC' : 'fattura'} #${r.fic_id}`

export function controllaRipartizione(importoScadenza: number, righe: RigaControllo[]): EsitoControllo {
  const totaleFatture = cent(righe.filter((r) => r.tipo === 'fattura').reduce((s, r) => s + r.quota, 0))
  const totaleNote = cent(righe.filter((r) => r.tipo === 'nota_credito').reduce((s, r) => s + r.quota, 0))
  const differenza = cent(importoScadenza - (totaleFatture - totaleNote))

  const blocchi: string[] = []
  for (const r of righe) {
    if (cent(r.quota) <= 0) blocchi.push(`${etichetta(r)}: nessun importo assegnato, toglila o aumenta l'importo`)
    else if (cent(r.quota) > cent(r.residuo)) blocchi.push(`${etichetta(r)}: al massimo ${formatEuro(r.residuo)} €`)
  }
  if (blocchi.length) return { livello: 'blocco', totaleFatture, totaleNote, differenza, messaggi: blocchi }

  const avvisi: string[] = []
  for (const r of righe) {
    if (r.tipo === 'fattura' && cent(r.quota) < cent(r.residuo)) {
      avvisi.push(`${formatEuro(cent(r.residuo - r.quota))} € resteranno da pagare sulla fattura ${etichetta(r)}`)
    }
  }
  if (differenza > 0) avvisi.push(`${formatEuro(differenza)} € della scadenza non coprono nessuna fattura`)
  if (differenza < 0) avvisi.push(`Le quote superano l'importo della scadenza di ${formatEuro(-differenza)} €`)

  return { livello: avvisi.length ? 'avviso' : 'ok', totaleFatture, totaleNote, differenza, messaggi: avvisi }
}

const FORME_SOCIETARIE = /\b(s r l s|s r l|srls|srl|s p a|spa|s n c|snc|s a s|sas)\b/g

/** Minuscole, senza accenti e punteggiatura, senza forma societaria. */
export function normalizzaFornitore(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(FORME_SOCIETARIE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ogni parola cercata deve stare nel nome, anche ignorando gli spazi del nome
 * ("EDILSIDER" trova "Edil Sider").
 */
export function fornitoreCorrisponde(cercato: string, nome: string): boolean {
  const c = normalizzaFornitore(cercato)
  if (!c) return true
  const n = normalizzaFornitore(nome)
  const nCompatto = n.replace(/ /g, '')
  return c.split(' ').every((p) => n.includes(p) || nCompatto.includes(p))
}
```

Nota: `formatEuro` di `lib/pricing.ts` restituisce `200,00` (virgola e punti delle migliaia): è il formato atteso dai test.

- [ ] **Step 4: Verifica**

Run: `npx vitest run lib/fic/pagamenti.test.ts` → PASS. `npx tsc --noEmit && npx eslint lib/fic types` → pulito.

- [ ] **Step 5: Commit**

```bash
git add lib/fic/pagamenti.ts lib/fic/pagamenti.test.ts types/fatture-fornitori.ts
git commit -m "feat(fic): ripartizione delle scadenze sulle fatture con controllo degli importi"
```

---

### Task 5: Scrittura e annullamento sulle rate FiC (`lib/fic/pagamenti-fic.ts`)

**Files:**
- Create: `lib/fic/pagamenti-fic.ts`, `lib/fic/pagamenti-fic.test.ts`

**Interfaces:**
- Consumes: `RataFic` (`lib/fic/tipi.ts`).
- Produces:

```ts
export type ScritturaFic = {
  data: string; metodo_id: number
  rate_pagate: { id: number; importo: number }[]
  rata_divisa: { pagata_id: number; resto_id: number; importo_originale: number } | null
}
export type PagamentoApplicato =
  | { ok: true; rate: RataFic[]; indiciPagati: number[]; divisa: { indicePagata: number; importoOriginale: number } | null }
  | { ok: false; disponibile: number }
export function applicaPagamento(rate: RataFic[], importo: number, data: string, metodoId: number): PagamentoApplicato
export function costruisciScrittura(prima: RataFic[], esito: Extract<PagamentoApplicato, { ok: true }>, dopo: RataFic[], data: string, metodoId: number): ScritturaFic
export type Annullamento = { ok: true; rate: RataFic[] } | { ok: false; motivo: string }
export function annullaPagamento(rate: RataFic[], s: ScritturaFic): Annullamento
export const totaleRate: (rate: RataFic[]) => number
```

- [ ] **Step 1: Test che falliscono** — `lib/fic/pagamenti-fic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applicaPagamento, costruisciScrittura, annullaPagamento, totaleRate, type ScritturaFic } from '@/lib/fic/pagamenti-fic'
import type { RataFic } from '@/lib/fic/tipi'

const OGGI = '2026-10-03'
const ASSEGNO = 546834
const r = (id: number, amount: number, due_date: string, status = 'not_paid', paid_date: string | null = null): RataFic =>
  ({ id, amount, due_date, status, paid_date, payment_account: null })

describe('applicaPagamento', () => {
  it('paga una rata intera', () => {
    const e = applicaPagamento([r(1, 500, '2026-01-31')], 500, OGGI, ASSEGNO)
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.rate).toEqual([{ ...r(1, 500, '2026-01-31'), status: 'paid', paid_date: OGGI, payment_account: { id: ASSEGNO } }])
    expect(e.indiciPagati).toEqual([0])
    expect(e.divisa).toBeNull()
  })

  it("paga piu' rate dalla prima scadenza, saltando quelle gia' pagate", () => {
    const rate = [r(3, 100, '2026-03-31'), r(1, 100, '2026-01-31', 'paid', '2026-01-31'), r(2, 100, '2026-02-28')]
    const e = applicaPagamento(rate, 200, OGGI, ASSEGNO)
    if (!e.ok) throw new Error('atteso ok')
    expect(e.indiciPagati).toEqual([2, 0])
    expect(e.rate[1]).toEqual(rate[1]) // la gia' pagata non si tocca
  })

  it("divide l'ultima rata: totale invariato", () => {
    const rate = [r(1, 1000, '2026-01-31')]
    const e = applicaPagamento(rate, 300, OGGI, ASSEGNO)
    if (!e.ok) throw new Error('atteso ok')
    expect(e.rate).toHaveLength(2)
    expect(e.rate[0]).toMatchObject({ id: 1, amount: 300, status: 'paid', paid_date: OGGI })
    expect(e.rate[1]).toMatchObject({ amount: 700, status: 'not_paid', due_date: '2026-01-31' })
    expect(e.rate[1]).not.toHaveProperty('id')
    expect(e.divisa).toEqual({ indicePagata: 0, importoOriginale: 1000 })
    expect(totaleRate(e.rate)).toBe(totaleRate(rate))
  })

  it('residuo insufficiente → nessuna modifica', () => {
    const e = applicaPagamento([r(1, 100, '2026-01-31'), r(2, 50, '2026-02-28', 'paid', '2026-02-01')], 200, OGGI, ASSEGNO)
    expect(e).toEqual({ ok: false, disponibile: 100 })
  })

  it('due scadenze sulla stessa fattura: la seconda copre il resto', () => {
    const prima = applicaPagamento([r(1, 1000, '2026-01-31')], 500, OGGI, ASSEGNO)
    if (!prima.ok) throw new Error('atteso ok')
    const dopoPut = prima.rate.map((x, i) => (i === 1 ? { ...x, id: 2 } : x)) // FiC assegna l'id alla rata nuova
    const seconda = applicaPagamento(dopoPut, 500, '2026-10-10', ASSEGNO)
    if (!seconda.ok) throw new Error('atteso ok')
    expect(seconda.rate.every((x) => x.status === 'paid')).toBe(true)
    expect(seconda.divisa).toBeNull()
    expect(totaleRate(seconda.rate)).toBe(1000)
  })
})

describe('costruisciScrittura', () => {
  it('prende gli id dalla risposta di FiC, anche in ordine diverso', () => {
    const prima = [r(1, 1000, '2026-01-31')]
    const e = applicaPagamento(prima, 300, OGGI, ASSEGNO)
    if (!e.ok) throw new Error('atteso ok')
    const dopo = [
      { ...r(55, 700, '2026-01-31') },
      { ...r(1, 300, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } },
    ]
    expect(costruisciScrittura(prima, e, dopo, OGGI, ASSEGNO)).toEqual<ScritturaFic>({
      data: OGGI,
      metodo_id: ASSEGNO,
      rate_pagate: [{ id: 1, importo: 300 }],
      rata_divisa: { pagata_id: 1, resto_id: 55, importo_originale: 1000 },
    })
  })
})

describe('annullaPagamento', () => {
  const scrittura: ScritturaFic = {
    data: OGGI, metodo_id: ASSEGNO,
    rate_pagate: [{ id: 1, importo: 300 }],
    rata_divisa: { pagata_id: 1, resto_id: 55, importo_originale: 1000 },
  }
  const scritte = () => [
    { ...r(1, 300, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } },
    r(55, 700, '2026-01-31'),
  ]

  it('rimette da pagare e riunisce la rata divisa', () => {
    const a = annullaPagamento(scritte(), scrittura)
    if (!a.ok) throw new Error('atteso ok')
    expect(a.rate).toHaveLength(1)
    expect(a.rate[0]).toMatchObject({ id: 1, amount: 1000, status: 'not_paid', paid_date: null })
  })

  it('resto toccato su FiC: annulla senza riunire, totale invariato', () => {
    const rate = scritte()
    rate[1] = { ...rate[1], due_date: '2026-05-31' }
    const a = annullaPagamento(rate, scrittura)
    if (!a.ok) throw new Error('atteso ok')
    expect(a.rate).toHaveLength(2)
    expect(totaleRate(a.rate)).toBe(1000)
  })

  it('rata pagata modificata a mano su FiC → conflitto, niente modifiche', () => {
    const rate = scritte()
    rate[0] = { ...rate[0], amount: 250 }
    expect(annullaPagamento(rate, scrittura)).toEqual({ ok: false, motivo: 'Una rata pagata da WinStudio e\' stata modificata su FiC: sistemala a mano' })
  })

  it('rata pagata sparita su FiC → conflitto', () => {
    expect(annullaPagamento([r(55, 700, '2026-01-31')], scrittura))
      .toEqual({ ok: false, motivo: 'Una rata pagata da WinStudio non esiste piu\' su FiC: sistemala a mano' })
  })

  it('scrittura senza divisione: solo stato e data', () => {
    const s: ScritturaFic = { data: OGGI, metodo_id: ASSEGNO, rate_pagate: [{ id: 1, importo: 500 }], rata_divisa: null }
    const a = annullaPagamento([{ ...r(1, 500, '2026-01-31', 'paid', OGGI), payment_account: { id: ASSEGNO } }], s)
    if (!a.ok) throw new Error('atteso ok')
    expect(a.rate[0]).toMatchObject({ amount: 500, status: 'not_paid', paid_date: null })
  })
})
```

Run: `npx vitest run lib/fic/pagamenti-fic.test.ts` → FAIL (modulo mancante).

- [ ] **Step 2: Implementare `lib/fic/pagamenti-fic.ts`**

```ts
import type { RataFic } from '@/lib/fic/tipi'

const cent = (v: number) => Math.round(v * 100) / 100
const pagata = (r: RataFic) => r.status === 'paid'

export const totaleRate = (rate: RataFic[]) => cent(rate.reduce((s, r) => s + (r.amount ?? 0), 0))

/** Cosa WinStudio ha fatto su un documento FiC: serve ad annullare solo quello. */
export type ScritturaFic = {
  data: string
  metodo_id: number
  rate_pagate: { id: number; importo: number }[]
  rata_divisa: { pagata_id: number; resto_id: number; importo_originale: number } | null
}

export type PagamentoApplicato =
  | {
      ok: true
      rate: RataFic[]
      indiciPagati: number[]
      divisa: { indicePagata: number; importoOriginale: number } | null
    }
  | { ok: false; disponibile: number }

/**
 * Segna pagate le rate non pagate, dalla prima scadenza, fino a coprire
 * `importo`. Se l'ultima rata supera il rimanente la divide: la parte pagata
 * tiene l'id, il resto diventa una rata nuova (senza id) con la stessa
 * scadenza. Il totale delle rate non cambia mai.
 */
export function applicaPagamento(rate: RataFic[], importo: number, data: string, metodoId: number): PagamentoApplicato {
  const obiettivo = cent(importo)
  const disponibile = cent(rate.filter((r) => !pagata(r)).reduce((s, r) => s + (r.amount ?? 0), 0))
  if (obiettivo <= 0 || disponibile < obiettivo) return { ok: false, disponibile }

  const nuove: RataFic[] = rate.map((r) => ({ ...r }))
  const ordine = rate
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !pagata(r))
    .sort((a, b) => (a.r.due_date ?? '9999').localeCompare(b.r.due_date ?? '9999') || a.i - b.i)

  const indiciPagati: number[] = []
  let divisa: { indicePagata: number; importoOriginale: number } | null = null
  let resto = obiettivo
  const segnaPagata = { status: 'paid', paid_date: data, payment_account: { id: metodoId } }

  for (const { i } of ordine) {
    if (resto <= 0) break
    const r = nuove[i]
    const importoRata = cent(r.amount ?? 0)
    if (importoRata <= resto) {
      Object.assign(r, segnaPagata)
      resto = cent(resto - importoRata)
    } else {
      const { id: _id, ...senzaId } = r
      void _id
      nuove.push({ ...senzaId, amount: cent(importoRata - resto) })
      Object.assign(r, segnaPagata, { amount: resto })
      divisa = { indicePagata: i, importoOriginale: importoRata }
      resto = 0
    }
    indiciPagati.push(i)
  }

  return { ok: true, rate: nuove, indiciPagati, divisa }
}

/**
 * Dopo il PUT: gli id veri vengono dalla risposta di FiC. Le rate pagate
 * tengono il loro id; la rata resto e' quella con un id che prima non c'era.
 */
export function costruisciScrittura(
  prima: RataFic[],
  esito: Extract<PagamentoApplicato, { ok: true }>,
  dopo: RataFic[],
  data: string,
  metodoId: number,
): ScritturaFic {
  const idPrima = new Set(prima.map((r) => r.id).filter((id): id is number => typeof id === 'number'))
  const rate_pagate = esito.indiciPagati.map((i) => ({ id: esito.rate[i].id as number, importo: cent(esito.rate[i].amount ?? 0) }))
  let rata_divisa: ScritturaFic['rata_divisa'] = null
  if (esito.divisa) {
    const nuova = dopo.find((r) => typeof r.id === 'number' && !idPrima.has(r.id))
    const pagataId = esito.rate[esito.divisa.indicePagata].id as number
    if (nuova?.id) rata_divisa = { pagata_id: pagataId, resto_id: nuova.id, importo_originale: esito.divisa.importoOriginale }
  }
  return { data, metodo_id: metodoId, rate_pagate, rata_divisa }
}

export type Annullamento = { ok: true; rate: RataFic[] } | { ok: false; motivo: string }

/**
 * Rimette da pagare solo le rate che WinStudio ha segnato pagate, e riunisce la
 * rata divisa se il resto e' ancora com'era. Se una rata scritta da WinStudio
 * e' stata toccata su FiC non modifica niente: la decisione spetta a una persona.
 */
export function annullaPagamento(rate: RataFic[], s: ScritturaFic): Annullamento {
  const nuove: RataFic[] = rate.map((r) => ({ ...r }))
  for (const p of s.rate_pagate) {
    const r = nuove.find((x) => x.id === p.id)
    if (!r) return { ok: false, motivo: 'Una rata pagata da WinStudio non esiste piu\' su FiC: sistemala a mano' }
    if (!pagata(r) || cent(r.amount ?? 0) !== cent(p.importo) || r.paid_date !== s.data) {
      return { ok: false, motivo: 'Una rata pagata da WinStudio e\' stata modificata su FiC: sistemala a mano' }
    }
    r.status = 'not_paid'
    r.paid_date = null
  }
  if (s.rata_divisa) {
    const d = s.rata_divisa
    const principale = nuove.find((x) => x.id === d.pagata_id)
    const iResto = nuove.findIndex((x) => x.id === d.resto_id)
    if (principale && iResto >= 0) {
      const resto = nuove[iResto]
      const intatta =
        !pagata(resto) &&
        resto.due_date === principale.due_date &&
        cent((principale.amount ?? 0) + (resto.amount ?? 0)) === cent(d.importo_originale)
      if (intatta) {
        principale.amount = d.importo_originale
        nuove.splice(iResto, 1)
      }
    }
  }
  return { ok: true, rate: nuove }
}
```

- [ ] **Step 3: Verifica**

Run: `npx vitest run lib/fic/pagamenti-fic.test.ts` → PASS; `npx tsc --noEmit && npx eslint lib/fic` → pulito (se eslint segnala `_id`, il `void _id` lo usa).

- [ ] **Step 4: Commit**

```bash
git add lib/fic/pagamenti-fic.ts lib/fic/pagamenti-fic.test.ts
git commit -m "feat(fic): scrittura e annullamento dei pagamenti sulle rate FiC"
```

---

### Task 6: Decisione e messaggi (`lib/fic/allineamento.ts`)

**Files:**
- Create: `lib/fic/allineamento.ts`, `lib/fic/allineamento.test.ts`
- Modify: `types/fatture-fornitori.ts`

**Interfaces:**
- Produces (in `types/fatture-fornitori.ts`):

```ts
export type EsitoFic = { scritti: number; annullati: number; problemi: string[]; avvisi: string[] }
export type RiepilogoCollegamento = { n: number; stato: 'non_scritto' | 'scritto' | 'problema'; messaggio: string | null }
```

- Produces (in `lib/fic/allineamento.ts`):

```ts
export type Desiderato = { pagare: boolean; data: string; metodoId: number | null }
export type Azione = 'niente' | 'scrivi' | 'annulla' | 'riscrivi'
export function decidiAzione(c: { importo: number; scrittura_fic: ScritturaFic | null }, d: Desiderato): Azione
export const ESITO_VUOTO: EsitoFic
export function messaggioEsitoFic(e: EsitoFic): { tipo: 'successo' | 'avviso' | 'niente'; testo: string }
export function avvisoImporti(importoScadenza: number, collegamenti: { tipo_documento: TipoFatturaFornitore; importo: number }[]): string | null
export function riepilogaCollegamenti(c: { stato_fic: StatoFic; messaggio_fic: string | null }[]): RiepilogoCollegamento
```

- [ ] **Step 1: Tipi** in `types/fatture-fornitori.ts`:

```ts
/** Cosa e' successo su FiC dopo un'azione su una scadenza. */
export type EsitoFic = { scritti: number; annullati: number; problemi: string[]; avvisi: string[] }

/** Per l'icona nella riga della scadenza. */
export type RiepilogoCollegamento = {
  n: number
  stato: 'non_scritto' | 'scritto' | 'problema'
  messaggio: string | null
}
```

- [ ] **Step 2: Test che falliscono** — `lib/fic/allineamento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decidiAzione, messaggioEsitoFic, avvisoImporti, riepilogaCollegamenti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import type { ScritturaFic } from '@/lib/fic/pagamenti-fic'

const s: ScritturaFic = { data: '2026-10-03', metodo_id: 1, rate_pagate: [{ id: 1, importo: 300 }, { id: 2, importo: 200 }], rata_divisa: null }
const d = { pagare: true, data: '2026-10-03', metodoId: 1 }

describe('decidiAzione', () => {
  it('da pagare e mai scritto → scrivi', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: null }, d)).toBe('scrivi')
  })
  it('gia\' scritto uguale → niente', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, d)).toBe('niente')
  })
  it('data, metodo o importo cambiati → riscrivi', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, { ...d, data: '2026-10-04' })).toBe('riscrivi')
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, { ...d, metodoId: 2 })).toBe('riscrivi')
    expect(decidiAzione({ importo: 450, scrittura_fic: s }, d)).toBe('riscrivi')
  })
  it('non piu\' da pagare: annulla se scritto, altrimenti niente', () => {
    expect(decidiAzione({ importo: 500, scrittura_fic: s }, { ...d, pagare: false })).toBe('annulla')
    expect(decidiAzione({ importo: 500, scrittura_fic: null }, { ...d, pagare: false })).toBe('niente')
  })
})

describe('messaggioEsitoFic', () => {
  it('niente da dire', () => {
    expect(messaggioEsitoFic(ESITO_VUOTO)).toEqual({ tipo: 'niente', testo: '' })
  })
  it('scrittura riuscita', () => {
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, scritti: 3 })).toEqual({ tipo: 'successo', testo: 'Pagamento scritto su FiC: 3 documenti' })
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, scritti: 1 })).toEqual({ tipo: 'successo', testo: 'Pagamento scritto su FiC: 1 documento' })
  })
  it('annullamento riuscito', () => {
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, annullati: 2 })).toEqual({ tipo: 'successo', testo: 'Pagamento tolto da FiC: 2 documenti' })
  })
  it('problemi e avvisi vincono e si elencano', () => {
    expect(messaggioEsitoFic({ scritti: 1, annullati: 0, problemi: ['FT 3: FiC non ha risposto'], avvisi: [] }))
      .toEqual({ tipo: 'avviso', testo: 'Pagato in WinStudio, ma non tutto e\' su FiC. FT 3: FiC non ha risposto' })
    expect(messaggioEsitoFic({ ...ESITO_VUOTO, avvisi: ['Gli importi non tornano'] }))
      .toEqual({ tipo: 'avviso', testo: 'Gli importi non tornano' })
  })
})

describe('avvisoImporti', () => {
  it('nessun avviso se torna o se non ci sono collegamenti', () => {
    expect(avvisoImporti(4500, [{ tipo_documento: 'fattura', importo: 5000 }, { tipo_documento: 'nota_credito', importo: 500 }])).toBeNull()
    expect(avvisoImporti(4500, [])).toBeNull()
  })
  it('avvisa se non torna', () => {
    expect(avvisoImporti(4000, [{ tipo_documento: 'fattura', importo: 5000 }]))
      .toBe('Gli importi delle fatture collegate non tornano piu\' con la scadenza: apri Fatture per controllare')
  })
})

describe('riepilogaCollegamenti', () => {
  it('problema vince, poi non scritto, poi scritto', () => {
    expect(riepilogaCollegamenti([{ stato_fic: 'scritto', messaggio_fic: null }, { stato_fic: 'da_allineare', messaggio_fic: 'rete' }]))
      .toEqual({ n: 2, stato: 'problema', messaggio: 'rete' })
    expect(riepilogaCollegamenti([{ stato_fic: 'scritto', messaggio_fic: null }, { stato_fic: 'non_scritto', messaggio_fic: null }]))
      .toEqual({ n: 2, stato: 'non_scritto', messaggio: null })
    expect(riepilogaCollegamenti([{ stato_fic: 'scritto', messaggio_fic: null }]))
      .toEqual({ n: 1, stato: 'scritto', messaggio: null })
  })
})
```

Run → FAIL (modulo mancante).

- [ ] **Step 3: Implementare `lib/fic/allineamento.ts`**

```ts
import type { EsitoFic, RiepilogoCollegamento, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'
import type { ScritturaFic } from '@/lib/fic/pagamenti-fic'

const cent = (v: number) => Math.round(v * 100) / 100

export type Desiderato = { pagare: boolean; data: string; metodoId: number | null }
export type Azione = 'niente' | 'scrivi' | 'annulla' | 'riscrivi'

/** Confronta cio' che dovrebbe esserci su FiC con cio' che WinStudio ha scritto. */
export function decidiAzione(c: { importo: number; scrittura_fic: ScritturaFic | null }, d: Desiderato): Azione {
  const s = c.scrittura_fic
  if (!d.pagare) return s ? 'annulla' : 'niente'
  if (!s) return 'scrivi'
  const scritto = cent(s.rate_pagate.reduce((t, r) => t + r.importo, 0))
  if (s.data !== d.data || s.metodo_id !== d.metodoId || scritto !== cent(c.importo)) return 'riscrivi'
  return 'niente'
}

export const ESITO_VUOTO: EsitoFic = { scritti: 0, annullati: 0, problemi: [], avvisi: [] }

const documenti = (n: number) => `${n} ${n === 1 ? 'documento' : 'documenti'}`

export function messaggioEsitoFic(e: EsitoFic): { tipo: 'successo' | 'avviso' | 'niente'; testo: string } {
  if (e.problemi.length) {
    return { tipo: 'avviso', testo: `Pagato in WinStudio, ma non tutto e' su FiC. ${e.problemi.join(' · ')}` }
  }
  if (e.avvisi.length) return { tipo: 'avviso', testo: e.avvisi.join(' · ') }
  if (e.scritti) return { tipo: 'successo', testo: `Pagamento scritto su FiC: ${documenti(e.scritti)}` }
  if (e.annullati) return { tipo: 'successo', testo: `Pagamento tolto da FiC: ${documenti(e.annullati)}` }
  return { tipo: 'niente', testo: '' }
}

export function avvisoImporti(
  importoScadenza: number,
  collegamenti: { tipo_documento: TipoFatturaFornitore; importo: number }[],
): string | null {
  if (collegamenti.length === 0) return null
  const netto = collegamenti.reduce((s, c) => s + (c.tipo_documento === 'nota_credito' ? -c.importo : c.importo), 0)
  return cent(netto) === cent(importoScadenza)
    ? null
    : 'Gli importi delle fatture collegate non tornano piu\' con la scadenza: apri Fatture per controllare'
}

export function riepilogaCollegamenti(c: { stato_fic: StatoFic; messaggio_fic: string | null }[]): RiepilogoCollegamento {
  const problema = c.find((x) => x.stato_fic === 'da_allineare' || x.stato_fic === 'da_verificare')
  if (problema) return { n: c.length, stato: 'problema', messaggio: problema.messaggio_fic }
  if (c.some((x) => x.stato_fic === 'non_scritto')) return { n: c.length, stato: 'non_scritto', messaggio: null }
  return { n: c.length, stato: 'scritto', messaggio: null }
}
```

Nota: nel test sopra il messaggio con apostrofo è scritto con `\'`: il testo reale è `non tutto e' su FiC` (apostrofo semplice, come nel resto dei commenti del progetto).

- [ ] **Step 4: Verifica** — `npx vitest run lib/fic/allineamento.test.ts` → PASS; tsc + eslint puliti.

- [ ] **Step 5: Commit**

```bash
git add lib/fic/allineamento.ts lib/fic/allineamento.test.ts types/fatture-fornitori.ts
git commit -m "feat(fic): decisione di allineamento e messaggi per l'utente"
```

---

### Task 7: Allineamento lato server e Server Action della finestra

**Files:**
- Create: `lib/fic/allinea-scadenza.ts`
- Create: `actions/fic-pagamenti.ts`
- Modify: `types/fatture-fornitori.ts`

**Interfaces:**
- Consumes: Task 3-6; `createServiceClient`, `getOrgId`, `getMyPermissions`, `selectAll`, `mappaDocumento`, `salvaDocumenti`, `tabelleSupabase`, `oggiRoma`.
- Produces:

```ts
// lib/fic/allinea-scadenza.ts (modulo server, NON 'use server')
export async function allineaScadenzaFic(svc: SupabaseClient, orgId: string, scadenzaId: string): Promise<EsitoFic>
export async function allineaSeCollegata(orgId: string, scadenzaId: string): Promise<EsitoFic | null>
export async function liberaPerEliminazione(orgId: string, scadenzaId: string): Promise<{ ok: true } | { ok: false; errore: string }>
// actions/fic-pagamenti.ts ('use server')
export async function getDatiCollegamento(scadenzaId: string): Promise<DatiCollegamento | { errore: string }>
export async function salvaCollegamentiScadenza(input: SalvaCollegamentiInput): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }>
export async function riprovaScadenzaFic(scadenzaId: string): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }>
export async function riprovaTuttiFic(): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }>
export async function getRiepiloghiCollegamenti(scadenzaIds: string[]): Promise<Record<string, RiepilogoCollegamento>>
export async function getPagamentiFatture(ficIds: number[]): Promise<Record<number, PagamentoFattura[]>>
export async function getProblemiFic(): Promise<ProblemiFic>
```

- [ ] **Step 1: Tipi** in `types/fatture-fornitori.ts`:

```ts
export type MetodoFic = { id: number; nome: string }

export type CollegamentoScadenza = {
  fic_documento_id: number
  tipo_documento: TipoFatturaFornitore
  importo: number
  stato_fic: StatoFic
  messaggio_fic: string | null
}

export type DatiCollegamento = {
  scadenza: {
    id: string; fornitore: string; descrizione: string; importo: number
    pagato: boolean; data_scadenza: string | null; categoria: string; fic_metodo_id: number | null
  }
  collegamenti: CollegamentoScadenza[]
  metodi: MetodoFic[]
  /** Tutti i documenti con residuo per questa scadenza (piu' quelli gia' collegati): il filtro per fornitore e' nel browser. */
  documenti: DocumentoCollegabile[]
}

export type SalvaCollegamentiInput = {
  scadenzaId: string
  metodoId: number | null
  quote: { fic_documento_id: number; tipo_documento: TipoFatturaFornitore; importo: number }[]
}

export type PagamentoFattura = {
  scadenza_id: string
  gruppo_id: string
  data_scadenza: string | null
  fornitore: string
  descrizione: string
  importo: number
  scadenza_pagata: boolean
  stato_fic: StatoFic
  messaggio_fic: string | null
}

export type ProblemiFic = {
  daAllineare: number
  elenco: { scadenza_id: string; gruppo_id: string; fornitore: string; stato_fic: StatoFic; messaggio_fic: string | null }[]
}
```

- [ ] **Step 2: `lib/fic/allinea-scadenza.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { creaClientFic, FicErrore, FicNonAutorizzato, type FicClient } from '@/lib/fic/client'
import { mappaDocumento } from '@/lib/fic/mappa'
import { salvaDocumenti } from '@/lib/fic/salvataggio'
import { tabelleSupabase } from '@/lib/fic/tabelle-supabase'
import { applicaPagamento, annullaPagamento, costruisciScrittura, type ScritturaFic } from '@/lib/fic/pagamenti-fic'
import { decidiAzione, avvisoImporti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { formatEuro } from '@/lib/pricing'
import type { DocumentoFic } from '@/lib/fic/tipi'
import type { EsitoFic, StatoFic, TipoFatturaFornitore } from '@/types/fatture-fornitori'

/*
 * Unico punto in cui WinStudio scrive o toglie pagamenti su FiC. Tutte le azioni
 * sulle scadenze passano da qui (vedi actions/scadenze.ts e actions/fic-pagamenti.ts).
 * Non e' un file 'use server': non deve diventare un endpoint chiamabile dal browser.
 */

type Riga = {
  id: string
  fic_documento_id: number
  tipo_documento: TipoFatturaFornitore
  importo: number
  stato_fic: StatoFic
  scrittura_fic: ScritturaFic | null
}

const TIPO_FIC = { fattura: 'expense', nota_credito: 'passive_credit_note' } as const

class Problema extends Error {
  constructor(readonly stato: 'da_allineare' | 'da_verificare', messaggio: string) {
    super(messaggio)
  }
}

function classifica(e: unknown): Problema {
  if (e instanceof Problema) return e
  if (e instanceof FicNonAutorizzato) return new Problema('da_allineare', 'Token FiC rifiutato: ricollega in Impostazioni')
  if (e instanceof FicErrore && e.status === 404) return new Problema('da_verificare', 'Documento non piu\' presente su FiC')
  if (e instanceof FicErrore) return new Problema('da_allineare', e.message)
  return new Problema('da_allineare', 'FiC non ha risposto: riprova')
}

async function aggiorna(svc: SupabaseClient, id: string, campi: Record<string, unknown>) {
  const { error } = await svc.from('scadenze_fatture').update({ ...campi, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** La pagina Fatture fornitori vede subito il pagamento, senza aspettare la sincronizzazione. */
async function aggiornaCopiaLocale(svc: SupabaseClient, orgId: string, doc: DocumentoFic, tipo: TipoFatturaFornitore) {
  await salvaDocumenti(tabelleSupabase(svc), orgId, [mappaDocumento(doc, TIPO_FIC[tipo], new Date().toISOString())])
}

async function annulla(client: FicClient, companyId: number, r: Riga): Promise<DocumentoFic> {
  const doc = await client.spesa(companyId, r.fic_documento_id)
  const a = annullaPagamento(doc.payments_list ?? [], r.scrittura_fic!)
  if (!a.ok) throw new Problema('da_verificare', a.motivo)
  return client.aggiornaRate(companyId, r.fic_documento_id, a.rate)
}

async function scrivi(
  client: FicClient, companyId: number, r: Riga, data: string, metodoId: number,
): Promise<{ doc: DocumentoFic; scrittura: ScritturaFic }> {
  const doc = await client.spesa(companyId, r.fic_documento_id)
  const prima = doc.payments_list ?? []
  const e = applicaPagamento(prima, r.importo, data, metodoId)
  if (!e.ok) {
    throw new Problema('da_verificare', `Su FiC restano ${formatEuro(e.disponibile)} €, servono ${formatEuro(r.importo)} €`)
  }
  const dopo = await client.aggiornaRate(companyId, r.fic_documento_id, e.rate)
  return { doc: dopo, scrittura: costruisciScrittura(prima, e, dopo.payments_list ?? [], data, metodoId) }
}

export async function allineaScadenzaFic(svc: SupabaseClient, orgId: string, scadenzaId: string): Promise<EsitoFic> {
  const esito: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }

  const { data: sc, error: errSc } = await svc
    .from('scadenze')
    .select('importo, pagato, annullata, data_scadenza, fic_metodo_id')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errSc) throw new Error(errSc.message)
  if (!sc) return esito

  const { data: righe, error: errRighe } = await svc
    .from('scadenze_fatture')
    .select('id, fic_documento_id, tipo_documento, importo, stato_fic, scrittura_fic')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (errRighe) throw new Error(errRighe.message)
  const collegamenti: Riga[] = (righe ?? []).map((x) => ({
    ...(x as Riga), fic_documento_id: Number(x.fic_documento_id), importo: Number(x.importo),
  }))
  if (collegamenti.length === 0) return esito

  const avviso = avvisoImporti(Number(sc.importo), collegamenti)
  if (avviso) esito.avvisi.push(avviso)

  const desiderato = {
    pagare: sc.pagato && !sc.annullata,
    data: (sc.data_scadenza as string | null) ?? oggiRoma(),
    metodoId: sc.fic_metodo_id === null ? null : Number(sc.fic_metodo_id),
  }

  const { data: coll } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, stato')
    .eq('organization_id', orgId)
    .maybeSingle()

  let client: FicClient | null = null
  const ottieniClient = async (): Promise<FicClient> => {
    if (client) return client
    if (!coll) throw new Problema('da_allineare', 'Fatture in Cloud non e\' collegato')
    if (coll.stato !== 'attivo') throw new Problema('da_allineare', 'Collegamento FiC da rinnovare in Impostazioni')
    const { data: token, error } = await svc.rpc('fic_leggi_token', { p_org: orgId })
    if (error || !token) throw new Problema('da_allineare', 'Token FiC non disponibile')
    client = creaClientFic(token as string)
    return client
  }

  for (const r of collegamenti) {
    const azione = decidiAzione(r, desiderato)
    if (azione === 'niente') {
      // Mai scritto e non da pagare: il collegamento torna "pronto", senza vecchi errori.
      if (!desiderato.pagare && !r.scrittura_fic && r.stato_fic !== 'non_scritto') {
        await aggiorna(svc, r.id, { stato_fic: 'non_scritto', messaggio_fic: null })
      }
      continue
    }
    try {
      if ((azione === 'scrivi' || azione === 'riscrivi') && desiderato.metodoId === null) {
        throw new Problema('da_allineare', 'Scegli il metodo di pagamento nella finestra Fatture')
      }
      const c = await ottieniClient()
      const companyId = Number(coll!.fic_company_id)

      if (azione === 'annulla' || azione === 'riscrivi') {
        const doc = await annulla(c, companyId, r)
        await aggiornaCopiaLocale(svc, orgId, doc, r.tipo_documento)
        await aggiorna(svc, r.id, { stato_fic: 'non_scritto', messaggio_fic: null, scrittura_fic: null, scritto_at: null })
        r.scrittura_fic = null
        if (azione === 'annulla') esito.annullati++
      }
      if (azione === 'scrivi' || azione === 'riscrivi') {
        const { doc, scrittura } = await scrivi(c, companyId, r, desiderato.data, desiderato.metodoId!)
        await aggiornaCopiaLocale(svc, orgId, doc, r.tipo_documento)
        await aggiorna(svc, r.id, {
          stato_fic: 'scritto', messaggio_fic: null, scrittura_fic: scrittura, scritto_at: new Date().toISOString(),
        })
        esito.scritti++
      }
    } catch (e) {
      const p = classifica(e)
      if (e instanceof FicNonAutorizzato) {
        await svc.from('fic_collegamenti').update({ stato: 'da_ricollegare' }).eq('organization_id', orgId)
      }
      await aggiorna(svc, r.id, { stato_fic: p.stato, messaggio_fic: p.message })
      esito.problemi.push(p.message)
    }
  }
  return esito
}

/** Per le azioni delle scadenze: niente lavoro (e niente query FiC) se la scadenza non e' collegata. */
export async function allineaSeCollegata(orgId: string, scadenzaId: string): Promise<EsitoFic | null> {
  const svc = createServiceClient()
  const { count } = await svc
    .from('scadenze_fatture')
    .select('id', { count: 'exact', head: true })
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (!count) return null
  return allineaScadenzaFic(svc, orgId, scadenzaId)
}

/**
 * Prima di eliminare una scadenza: toglie da FiC tutto cio' che WinStudio ha
 * scritto e cancella i collegamenti. Se un annullamento non riesce si ferma:
 * dopo non resterebbe traccia di cosa togliere.
 */
export async function liberaPerEliminazione(
  orgId: string, scadenzaId: string,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const svc = createServiceClient()
  const { data: righe } = await svc
    .from('scadenze_fatture')
    .select('id, scrittura_fic')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (!righe?.length) return { ok: true }
  if (righe.some((r) => r.scrittura_fic)) {
    // Trattare la scadenza come "non piu' da pagare" porta ad annullare tutto.
    const { error } = await svc.from('scadenze').update({ pagato: false }).eq('id', scadenzaId).eq('organization_id', orgId)
    if (error) return { ok: false, errore: error.message }
    const esito = await allineaScadenzaFic(svc, orgId, scadenzaId)
    if (esito.problemi.length) {
      return { ok: false, errore: `Prima va tolto il pagamento da Fatture in Cloud: ${esito.problemi.join(' · ')}` }
    }
  }
  const { error } = await svc.from('scadenze_fatture').delete().eq('scadenza_id', scadenzaId).eq('organization_id', orgId)
  return error ? { ok: false, errore: error.message } : { ok: true }
}
```

Nota sul `pagato: false` in `liberaPerEliminazione`: se l'annullamento fallisce la scadenza resta "non pagata" in WinStudio anche se l'eliminazione non avviene. È coerente con "sto per eliminarla" e il messaggio lo dice; il `deleteScadenza` chiamante restituisce l'errore. Ledger se in esecuzione emerge un caso diverso.

- [ ] **Step 3: `actions/fic-pagamenti.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { creaClientFic } from '@/lib/fic/client'
import { allineaScadenzaFic } from '@/lib/fic/allinea-scadenza'
import { controllaRipartizione, residuoDisponibile, type QuotaAltraScadenza } from '@/lib/fic/pagamenti'
import { riepilogaCollegamenti, ESITO_VUOTO } from '@/lib/fic/allineamento'
import type {
  DatiCollegamento, DocumentoCollegabile, EsitoFic, MetodoFic, PagamentoFattura, ProblemiFic,
  RiepilogoCollegamento, SalvaCollegamentiInput, StatoFic, TipoFatturaFornitore,
} from '@/types/fatture-fornitori'

async function permessoCollegare(): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  if (permessi.commesse !== 'scrittura') return 'Serve la scrittura sulle Commesse'
  if (permessi.fatture_fornitori === 'nessuno') return 'Serve almeno la lettura sulle Fatture fornitori'
  return null
}

async function metodiFic(orgId: string): Promise<MetodoFic[]> {
  const svc = createServiceClient()
  const { data: coll } = await svc.from('fic_collegamenti').select('fic_company_id').eq('organization_id', orgId).maybeSingle()
  if (!coll) return []
  const { data: token } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (!token) return []
  try {
    return await creaClientFic(token as string).metodiPagamento(Number(coll.fic_company_id))
  } catch {
    return []
  }
}

type RigaDoc = {
  fic_id: number | string; tipo: TipoFatturaFornitore; numero: string | null; data: string
  fornitore_nome: string; importo_lordo: number | string
  rate: { importo: number | string; stato: string; scadenza: string | null }[]
}

export async function getDatiCollegamento(scadenzaId: string): Promise<DatiCollegamento | { errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  const { data: sc } = await svc
    .from('scadenze')
    .select('id, fornitore, descrizione, importo, pagato, data_scadenza, categoria, fic_metodo_id')
    .eq('id', scadenzaId).eq('organization_id', orgId).maybeSingle()
  if (!sc) return { errore: 'Scadenza non trovata' }

  const [tutti, docs, metodi] = await Promise.all([
    selectAll<{ scadenza_id: string; fic_documento_id: number | string; tipo_documento: TipoFatturaFornitore; importo: number | string; stato_fic: StatoFic; messaggio_fic: string | null }>((da, a) =>
      svc.from('scadenze_fatture')
        .select('scadenza_id, fic_documento_id, tipo_documento, importo, stato_fic, messaggio_fic')
        .eq('organization_id', orgId).order('id').range(da, a)),
    selectAll<RigaDoc>((da, a) =>
      svc.from('fatture_fornitori')
        .select('fic_id, tipo, numero, data, fornitore_nome, importo_lordo, rate:fatture_fornitori_rate(importo, stato, scadenza)')
        .eq('organization_id', orgId).order('id').range(da, a)),
    metodiFic(orgId),
  ])

  const qui = tutti.filter((c) => c.scadenza_id === scadenzaId)
  const altre: QuotaAltraScadenza[] = tutti
    .filter((c) => c.scadenza_id !== scadenzaId)
    .map((c) => ({ fic_documento_id: Number(c.fic_documento_id), importo: Number(c.importo), stato_fic: c.stato_fic }))
  const scrittoQui = new Map(
    qui.filter((c) => c.stato_fic === 'scritto').map((c) => [Number(c.fic_documento_id), Number(c.importo)]),
  )
  const collegatiQui = new Set(qui.map((c) => Number(c.fic_documento_id)))

  const documenti: DocumentoCollegabile[] = []
  for (const d of docs) {
    const ficId = Number(d.fic_id)
    const daPagare = d.rate.filter((r) => r.stato !== 'pagata')
    const residuoFic = daPagare.reduce((s, r) => s + Number(r.importo), 0)
    const residuo = residuoDisponibile(residuoFic, ficId, altre, scrittoQui.get(ficId) ?? 0)
    if (residuo <= 0 && !collegatiQui.has(ficId)) continue
    const scadenze = daPagare.map((r) => r.scadenza).filter((x): x is string => !!x).sort()
    documenti.push({
      fic_id: ficId, tipo: d.tipo, numero: d.numero, data: d.data, fornitore_nome: d.fornitore_nome,
      importo_lordo: Number(d.importo_lordo), residuo, prima_scadenza: scadenze[0] ?? null,
    })
  }

  return {
    scadenza: {
      id: sc.id, fornitore: sc.fornitore, descrizione: sc.descrizione, importo: Number(sc.importo),
      pagato: sc.pagato, data_scadenza: sc.data_scadenza, categoria: sc.categoria,
      fic_metodo_id: sc.fic_metodo_id === null ? null : Number(sc.fic_metodo_id),
    },
    collegamenti: qui.map((c) => ({
      fic_documento_id: Number(c.fic_documento_id), tipo_documento: c.tipo_documento,
      importo: Number(c.importo), stato_fic: c.stato_fic, messaggio_fic: c.messaggio_fic,
    })),
    metodi,
    documenti,
  }
}

export async function salvaCollegamentiScadenza(
  input: SalvaCollegamentiInput,
): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()

  // Il server rifà il controllo: il browser non decide i residui.
  const dati = await getDatiCollegamento(input.scadenzaId)
  if ('errore' in dati) return { ok: false, errore: dati.errore }
  const perId = new Map(dati.documenti.map((d) => [d.fic_id, d]))
  const righe = input.quote.map((q) => {
    const d = perId.get(q.fic_documento_id)
    return { fic_id: q.fic_documento_id, tipo: q.tipo_documento, numero: d?.numero ?? null, residuo: d?.residuo ?? 0, quota: q.importo }
  })
  const controllo = controllaRipartizione(dati.scadenza.importo, righe)
  if (controllo.livello === 'blocco') return { ok: false, errore: controllo.messaggi.join(' · ') }

  const { error: errMetodo } = await svc
    .from('scadenze').update({ fic_metodo_id: input.metodoId, updated_at: new Date().toISOString() })
    .eq('id', input.scadenzaId).eq('organization_id', orgId)
  if (errMetodo) return { ok: false, errore: errMetodo.message }

  // Togliere un collegamento gia' scritto: prima si annulla su FiC (quota a "non pagare").
  const tenuti = new Set(input.quote.map((q) => q.fic_documento_id))
  const daTogliere = dati.collegamenti.filter((c) => !tenuti.has(c.fic_documento_id))
  for (const c of daTogliere) {
    const { data: riga } = await svc.from('scadenze_fatture').select('id, scrittura_fic')
      .eq('scadenza_id', input.scadenzaId).eq('fic_documento_id', c.fic_documento_id).maybeSingle()
    if (riga?.scrittura_fic) {
      // Scollegare un documento gia' pagato su FiC: prima si toglie il pagamento.
      const esito = await annullaSingolo(svc, orgId, input.scadenzaId, c.fic_documento_id)
      if (esito) return { ok: false, errore: `Non riesco a togliere il pagamento da FiC: ${esito}` }
    }
    await svc.from('scadenze_fatture').delete().eq('scadenza_id', input.scadenzaId).eq('fic_documento_id', c.fic_documento_id)
  }

  for (const q of input.quote) {
    const { error } = await svc.from('scadenze_fatture').upsert(
      {
        organization_id: orgId, scadenza_id: input.scadenzaId, fic_documento_id: q.fic_documento_id,
        tipo_documento: q.tipo_documento, importo: q.importo, updated_at: new Date().toISOString(),
      },
      { onConflict: 'scadenza_id,fic_documento_id' },
    )
    if (error) return { ok: false, errore: error.message }
  }

  const esito = await allineaScadenzaFic(svc, orgId, input.scadenzaId)
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true, esito }
}
```

`annullaSingolo` va esportato da `lib/fic/allinea-scadenza.ts` (aggiungerlo lì, non in questo file):

```ts
/** Toglie da FiC il pagamento di un solo collegamento (scollegamento da una scadenza pagata). Null se riuscito. */
export async function annullaSingolo(
  svc: SupabaseClient, orgId: string, scadenzaId: string, ficDocumentoId: number,
): Promise<string | null> {
  const { data: x } = await svc.from('scadenze_fatture')
    .select('id, fic_documento_id, tipo_documento, importo, stato_fic, scrittura_fic')
    .eq('scadenza_id', scadenzaId).eq('fic_documento_id', ficDocumentoId).eq('organization_id', orgId).maybeSingle()
  if (!x?.scrittura_fic) return null
  const { data: coll } = await svc.from('fic_collegamenti').select('fic_company_id').eq('organization_id', orgId).maybeSingle()
  const { data: token } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (!coll || !token) return 'Fatture in Cloud non e\' collegato'
  const r: Riga = { ...(x as Riga), fic_documento_id: Number(x.fic_documento_id), importo: Number(x.importo) }
  try {
    const doc = await annulla(creaClientFic(token as string), Number(coll.fic_company_id), r)
    await aggiornaCopiaLocale(svc, orgId, doc, r.tipo_documento)
    return null
  } catch (e) {
    return classifica(e).message
  }
}
```

e importato in `actions/fic-pagamenti.ts` (`import { allineaScadenzaFic, annullaSingolo } from '@/lib/fic/allinea-scadenza'`).

Il resto di `actions/fic-pagamenti.ts`:

```ts
export async function riprovaScadenzaFic(scadenzaId: string): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const esito = await allineaScadenzaFic(createServiceClient(), await getOrgId(), scadenzaId)
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true, esito }
}

export async function riprovaTuttiFic(): Promise<{ ok: true; esito: EsitoFic } | { ok: false; errore: string }> {
  const vietato = await permessoCollegare()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data } = await svc.from('scadenze_fatture').select('scadenza_id')
    .eq('organization_id', orgId).eq('stato_fic', 'da_allineare')
  const ids = [...new Set((data ?? []).map((r) => r.scadenza_id as string))]
  const totale: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  for (const id of ids) {
    const e = await allineaScadenzaFic(svc, orgId, id)
    totale.scritti += e.scritti
    totale.annullati += e.annullati
    totale.problemi.push(...e.problemi)
  }
  revalidatePath('/commesse', 'layout')
  revalidatePath('/fatture-fornitori')
  return { ok: true, esito: totale }
}

export async function getRiepiloghiCollegamenti(scadenzaIds: string[]): Promise<Record<string, RiepilogoCollegamento>> {
  if (scadenzaIds.length === 0) return {}
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno') return {}
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const righe: { scadenza_id: string; stato_fic: StatoFic; messaggio_fic: string | null }[] = []
  for (let i = 0; i < scadenzaIds.length; i += 200) {
    const { data } = await svc.from('scadenze_fatture').select('scadenza_id, stato_fic, messaggio_fic')
      .eq('organization_id', orgId).in('scadenza_id', scadenzaIds.slice(i, i + 200))
    righe.push(...((data ?? []) as typeof righe))
  }
  const perScadenza = new Map<string, typeof righe>()
  for (const r of righe) perScadenza.set(r.scadenza_id, [...(perScadenza.get(r.scadenza_id) ?? []), r])
  return Object.fromEntries([...perScadenza].map(([id, c]) => [id, riepilogaCollegamenti(c)]))
}

export async function getPagamentiFatture(ficIds: number[]): Promise<Record<number, PagamentoFattura[]>> {
  if (ficIds.length === 0) return {}
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const out: Record<number, PagamentoFattura[]> = {}
  for (let i = 0; i < ficIds.length; i += 200) {
    const { data, error } = await svc.from('scadenze_fatture')
      .select('fic_documento_id, importo, stato_fic, messaggio_fic, scadenza:scadenze(id, gruppo_id, data_scadenza, fornitore, descrizione, pagato)')
      .eq('organization_id', orgId).in('fic_documento_id', ficIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const s = r.scadenza as unknown as { id: string; gruppo_id: string; data_scadenza: string | null; fornitore: string; descrizione: string; pagato: boolean }
      const k = Number(r.fic_documento_id)
      ;(out[k] ??= []).push({
        scadenza_id: s.id, gruppo_id: s.gruppo_id, data_scadenza: s.data_scadenza, fornitore: s.fornitore,
        descrizione: s.descrizione, importo: Number(r.importo), scadenza_pagata: s.pagato,
        stato_fic: r.stato_fic as StatoFic, messaggio_fic: r.messaggio_fic as string | null,
      })
    }
  }
  return out
}

export async function getProblemiFic(): Promise<ProblemiFic> {
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data } = await svc.from('scadenze_fatture')
    .select('stato_fic, messaggio_fic, scadenza:scadenze(id, gruppo_id, fornitore)')
    .eq('organization_id', orgId).in('stato_fic', ['da_allineare', 'da_verificare'])
  const elenco = (data ?? []).map((r) => {
    const s = r.scadenza as unknown as { id: string; gruppo_id: string; fornitore: string }
    return { scadenza_id: s.id, gruppo_id: s.gruppo_id, fornitore: s.fornitore, stato_fic: r.stato_fic as StatoFic, messaggio_fic: r.messaggio_fic as string | null }
  })
  return { daAllineare: elenco.filter((e) => e.stato_fic === 'da_allineare').length, elenco }
}
```

- [ ] **Step 4: Verifica** — `npx tsc --noEmit && npx eslint lib/fic actions/fic-pagamenti.ts && npx vitest run lib/fic` → tutto verde.

- [ ] **Step 5: Commit**

```bash
git add lib/fic/allinea-scadenza.ts actions/fic-pagamenti.ts types/fatture-fornitori.ts
git commit -m "feat(fic): allineamento scadenze-FiC e server action del collegamento"
```

---

### Task 8: Le azioni delle scadenze passano dall'allineamento

**Files:**
- Modify: `actions/scadenze.ts` (`setPagatoScadenza`, `updateScadenza`, `programmaScadenza`, `spostaInDaProgrammare`, `setAnnullataScadenza`, `deleteScadenza`)
- Create: `components/commesse/esito-fic.ts`
- Modify: `hooks/useScadenzeRighe.ts`, `components/commesse/DialogScadenza.tsx`

**Interfaces:**
- Consumes: `allineaSeCollegata`, `liberaPerEliminazione` (Task 7); `messaggioEsitoFic` (Task 6).
- Produces: `setPagatoScadenza`, `updateScadenza`, `spostaInDaProgrammare`, `setAnnullataScadenza` → `Promise<EsitoFic | null>`; `programmaScadenza` → `{ spostata; anno; fic: EsitoFic | null }`; `mostraEsitoFic(e: EsitoFic | null | undefined): void`.

- [ ] **Step 1: `actions/scadenze.ts`**

Import: `import { allineaSeCollegata, liberaPerEliminazione } from '@/lib/fic/allinea-scadenza'` e `import type { EsitoFic } from '@/types/fatture-fornitori'`.

In `setPagatoScadenza`, `updateScadenza`, `spostaInDaProgrammare`, `setAnnullataScadenza`: firma `Promise<EsitoFic | null>`, e prima del `revalidatePath` finale:

```ts
  // Se la scadenza paga fatture FiC, FiC segue: scrive, toglie o riscrive il pagamento.
  const fic = await allineaSeCollegata(orgId, id)
```

e `return fic` dopo il `revalidatePath`. In `programmaScadenza`: stessa chiamata dopo l'eventuale spostamento, `return { spostata, anno, fic }` (tipo di ritorno aggiornato).

In `deleteScadenza`, subito dopo `const orgId = await getOrgId()`:

```ts
  const libera = await liberaPerEliminazione(orgId, id)
  if (!libera.ok) throw new Error(libera.errore)
```

- [ ] **Step 2: `components/commesse/esito-fic.ts`**

```ts
import { toast } from 'sonner'
import { messaggioEsitoFic } from '@/lib/fic/allineamento'
import type { EsitoFic } from '@/types/fatture-fornitori'

/** Avviso con l'esito su FiC di un'azione sulla scadenza. Niente se non c'era niente da fare. */
export function mostraEsitoFic(e: EsitoFic | null | undefined) {
  if (!e) return
  const m = messaggioEsitoFic(e)
  if (m.tipo === 'successo') toast.success(m.testo)
  else if (m.tipo === 'avviso') toast.warning(m.testo, { duration: 10000 })
}
```

- [ ] **Step 3: `hooks/useScadenzeRighe.ts`**

- `handleTogglePagato`: `const fic = await setPagatoScadenza(s.id, nuovo); mostraEsitoFic(fic); if (fic) router.refresh()` (il refresh aggiorna l'icona).
- `handleToggleAnnullata`: `mostraEsitoFic(await setAnnullataScadenza(s.id, nuovo))` al posto della sola await.
- `handleSpostaInLimbo`: `mostraEsitoFic(await spostaInDaProgrammare(s.id))`.
- `handleDelete`: nel `catch (e)`, `toast.error(e instanceof Error && e.message ? e.message : "Errore nell'eliminazione")`. (Nota: in produzione Next.js nasconde i messaggi degli errori delle Server Action; se il messaggio arriva generico, trasformare `deleteScadenza` per restituire `{ ok: false, errore }` invece di lanciare e ledgerare la scelta.)

Import `import { mostraEsitoFic } from '@/components/commesse/esito-fic'`.

- [ ] **Step 4: `components/commesse/DialogScadenza.tsx`**

Nel `handleSubmit`: `const esito = await programmaScadenza(...)` → dopo, `mostraEsitoFic(esito.fic)`; `await updateScadenza(scadenza.id, payload)` → `mostraEsitoFic(await updateScadenza(scadenza.id, payload))`. In `ScadenzeView.tsx:153` (`updateScadenza(scadenza.id, { totale_rate })`) nessun cambio: il valore restituito si ignora.

- [ ] **Step 5: Verifica** — `npx tsc --noEmit && npm run lint && npm run test` → verdi (le funzioni di `actions/scadenze.ts` non hanno test unitari: il comportamento si prova nel Task 11).

- [ ] **Step 6: Commit**

```bash
git add actions/scadenze.ts components/commesse/esito-fic.ts hooks/useScadenzeRighe.ts components/commesse/DialogScadenza.tsx
git commit -m "feat(fic): pagato, modifiche, annullamento ed eliminazione delle scadenze allineano FiC"
```

---

### Task 9: Finestra di collegamento e icona nelle scadenze

**Files:**
- Create: `components/commesse/DialogCollegaFatture.tsx`, `components/commesse/IconaFattureScadenza.tsx`
- Modify: `components/commesse/RigaScadenza.tsx`, `components/commesse/ScadenzeView.tsx`, `components/commesse/ScadenzeDaProgrammareView.tsx`, `app/(dashboard)/commesse/[id]/page.tsx`

**Interfaces:**
- Consumes: `getDatiCollegamento`, `salvaCollegamentiScadenza`, `riprovaScadenzaFic`, `getRiepiloghiCollegamenti` (Task 7); `ripartisci`, `controllaRipartizione`, `fornitoreCorrisponde` (Task 4); `mostraEsitoFic` (Task 8).
- Produces: `DialogCollegaFatture({ scadenza, onClose })`; `IconaFattureScadenza({ riepilogo, onClick })`; prop nuove `riepilogoFatture?: RiepilogoCollegamento` e `onApriFatture?: (s: Scadenza) => void` su `RigaScadenza`; prop `collegamentiFic?: Record<string, RiepilogoCollegamento> | null` sulle due viste (null = funzione non disponibile).

- [ ] **Step 1: `IconaFattureScadenza.tsx`**

```tsx
'use client'

import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RiepilogoCollegamento } from '@/types/fatture-fornitori'

const COLORE = {
  nessuno: 'text-gray-300 hover:text-gray-600',
  non_scritto: 'text-sky-600',
  scritto: 'text-emerald-600',
  problema: 'text-rose-600',
} as const

export default function IconaFattureScadenza({
  riepilogo, onClick,
}: { riepilogo?: RiepilogoCollegamento; onClick: () => void }) {
  const stato = riepilogo?.stato ?? 'nessuno'
  const titolo = !riepilogo
    ? 'Collega alle fatture FiC'
    : stato === 'problema'
      ? `Problema con FiC: ${riepilogo.messaggio ?? 'apri per i dettagli'}`
      : stato === 'scritto' ? `Pagamento scritto su FiC (${riepilogo.n})` : `Collegata a ${riepilogo.n} documenti FiC`
  return (
    <Button variant="ghost" size="icon" className={`relative h-8 w-8 shrink-0 ${COLORE[stato]}`} title={titolo} onClick={onClick}>
      <Receipt className="h-4 w-4" />
      {riepilogo && (
        <span className="absolute -right-0.5 -top-0.5 rounded-full bg-gray-700 px-1 text-[10px] leading-4 text-white">
          {riepilogo.n}
        </span>
      )}
    </Button>
  )
}
```

- [ ] **Step 2: `RigaScadenza.tsx`**

Aggiungere a `RigaScadenzaProps`:

```ts
  /** Riepilogo dei documenti FiC collegati; assente se non collegata. */
  riepilogoFatture?: RiepilogoCollegamento
  /** Assente quando la funzione non e' disponibile (FiC non collegato o niente permesso). */
  onApriFatture?: (s: Scadenza) => void
```

destrutturarle e, subito prima della "Stella Calcoli":

```tsx
      {onApriFatture && (
        <IconaFattureScadenza riepilogo={riepilogoFatture} onClick={() => onApriFatture(s)} />
      )}
```

- [ ] **Step 3: `DialogCollegaFatture.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getDatiCollegamento, salvaCollegamentiScadenza, riprovaScadenzaFic } from '@/actions/fic-pagamenti'
import { ripartisci, controllaRipartizione, fornitoreCorrisponde } from '@/lib/fic/pagamenti'
import { formatData } from '@/lib/fic/formato'
import { formatEuro } from '@/lib/pricing'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import type { DatiCollegamento, DocumentoCollegabile } from '@/types/fatture-fornitori'
import type { Scadenza } from '@/types/commessa'

const STATO_LABEL = { non_scritto: 'Non ancora su FiC', scritto: 'Scritto su FiC', da_allineare: 'Da allineare', da_verificare: 'Da verificare' } as const

export default function DialogCollegaFatture({ scadenza, onClose }: { scadenza: Scadenza; onClose: () => void }) {
  const router = useRouter()
  const [dati, setDati] = useState<DatiCollegamento | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [ricerca, setRicerca] = useState(scadenza.fornitore)
  const [metodoId, setMetodoId] = useState<number | null>(null)
  const [quote, setQuote] = useState<Record<number, number>>({})
  const [testoQuote, setTestoQuote] = useState<Record<number, string>>({})
  const [pending, startTransition] = useTransition()

  // Caricamento alla prima apertura: un'unica lettura, poi tutto nel browser.
  useEffect(() => {
    let annullato = false
    getDatiCollegamento(scadenza.id)
      .then((d) => {
        if (annullato) return
        if ('errore' in d) { setErrore(d.errore); return }
        setDati(d)
        const assegno = d.metodi.find((m) => m.nome.toLowerCase() === 'assegno')
        setMetodoId(d.scadenza.fic_metodo_id ?? (d.scadenza.categoria === 'assegno' ? assegno?.id ?? null : null))
        setQuote(Object.fromEntries(d.collegamenti.map((c) => [c.fic_documento_id, c.importo])))
      })
      .catch(() => { if (!annullato) setErrore('Connessione interrotta: riprova') })
    return () => { annullato = true }
  }, [scadenza.id])

  const perId = useMemo(() => new Map((dati?.documenti ?? []).map((d) => [d.fic_id, d])), [dati])
  const selezionati = Object.keys(quote).map(Number)
  const visibili = useMemo(
    () => (dati?.documenti ?? [])
      .filter((d) => quote[d.fic_id] !== undefined || (d.residuo > 0 && fornitoreCorrisponde(ricerca, d.fornitore_nome)))
      .sort((a, b) => (a.prima_scadenza ?? a.data).localeCompare(b.prima_scadenza ?? b.data)),
    [dati, quote, ricerca],
  )

  const righeControllo = selezionati.map((id) => {
    const d = perId.get(id)
    return { fic_id: id, tipo: d?.tipo ?? 'fattura', numero: d?.numero ?? null, residuo: d?.residuo ?? 0, quota: quote[id] }
  })
  const controllo = controllaRipartizione(scadenza.importo, righeControllo)

  function cambiaSelezione(d: DocumentoCollegabile, spuntato: boolean) {
    const nuovi = spuntato ? [...selezionati, d.fic_id] : selezionati.filter((x) => x !== d.fic_id)
    const ripartiti = ripartisci(scadenza.importo, nuovi.map((id) => perId.get(id)!).filter(Boolean))
    setQuote(ripartiti)
    setTestoQuote({})
  }

  function cambiaQuota(id: number, testo: string) {
    setTestoQuote((t) => ({ ...t, [id]: testo }))
    const n = Number(testo.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) setQuote((q) => ({ ...q, [id]: Math.round(n * 100) / 100 }))
  }

  function salva() {
    startTransition(async () => {
      try {
        const r = await salvaCollegamentiScadenza({
          scadenzaId: scadenza.id,
          metodoId,
          quote: selezionati.map((id) => ({ fic_documento_id: id, tipo_documento: perId.get(id)!.tipo, importo: quote[id] })),
        })
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Collegamenti salvati')
        mostraEsitoFic(r.esito)
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  function riprova() {
    startTransition(async () => {
      try {
        const r = await riprovaScadenzaFic(scadenza.id)
        if (!r.ok) toast.error(r.errore)
        else mostraEsitoFic(r.esito)
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  const coloreBarra = controllo.livello === 'ok' ? 'bg-emerald-50 border-emerald-300' : controllo.livello === 'avviso' ? 'bg-amber-50 border-amber-300' : 'bg-rose-50 border-rose-300'
  const conProblemi = dati?.collegamenti.some((c) => c.stato_fic === 'da_allineare' || c.stato_fic === 'da_verificare')

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fatture pagate da questa scadenza</DialogTitle>
        </DialogHeader>

        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Fornitore:</span> {scadenza.fornitore || '—'}</div>
          <div><span className="text-muted-foreground">Importo:</span> <strong>€ {formatEuro(scadenza.importo)}</strong></div>
          <div><span className="text-muted-foreground">Data:</span> {scadenza.data_scadenza ? formatData(scadenza.data_scadenza) : '—'}</div>
          <div>{scadenza.pagato ? <Badge variant="secondary">Pagata</Badge> : <Badge variant="outline">Non ancora pagata</Badge>}</div>
        </div>

        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {!dati && !errore && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}

        {dati && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Metodo di pagamento su FiC</Label>
                <Select value={metodoId === null ? '' : String(metodoId)} onValueChange={(v) => setMetodoId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Scegli il metodo" /></SelectTrigger>
                  <SelectContent>
                    {dati.metodi.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fic-fornitore">Fornitore su FiC</Label>
                <Input id="fic-fornitore" value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Cerca fornitore" />
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              {visibili.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nessuna fattura da pagare per questo fornitore.</p>
              ) : visibili.map((d) => {
                const spuntato = quote[d.fic_id] !== undefined
                const collegamento = dati.collegamenti.find((c) => c.fic_documento_id === d.fic_id)
                return (
                  <div key={d.fic_id} className="flex flex-wrap items-center gap-3 border-b p-2 text-sm last:border-b-0">
                    <Checkbox checked={spuntato} onCheckedChange={(v) => cambiaSelezione(d, v === true)} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {d.tipo === 'nota_credito' && <Badge variant="outline" className="mr-1">NC</Badge>}
                        {d.numero ?? '(senza numero)'} · {formatData(d.data)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {d.fornitore_nome} · totale € {formatEuro(d.importo_lordo)} · residuo € {formatEuro(d.tipo === 'nota_credito' ? -d.residuo : d.residuo)}
                        {d.prima_scadenza ? ` · scade ${formatData(d.prima_scadenza)}` : ''}
                        {collegamento ? ` · ${STATO_LABEL[collegamento.stato_fic]}` : ''}
                      </div>
                    </div>
                    {spuntato && (
                      <Input
                        className="w-28 text-right"
                        inputMode="decimal"
                        value={testoQuote[d.fic_id] ?? String(quote[d.fic_id]).replace('.', ',')}
                        onChange={(e) => cambiaQuota(d.fic_id, e.target.value)}
                        aria-label="Importo assegnato"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className={`rounded-md border p-3 text-sm ${coloreBarra}`}>
              <div className="flex flex-wrap gap-x-4">
                <span>Scadenza € {formatEuro(scadenza.importo)}</span>
                <span>Fatture € {formatEuro(controllo.totaleFatture)}</span>
                <span>Note di credito −€ {formatEuro(controllo.totaleNote)}</span>
                <strong>Differenza € {formatEuro(controllo.differenza)}</strong>
              </div>
              {controllo.messaggi.map((m) => <div key={m}>{m}</div>)}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {conProblemi && <Button variant="outline" onClick={riprova} disabled={pending}>Riprova su FiC</Button>}
              <Button variant="ghost" onClick={onClose} disabled={pending}>Annulla</Button>
              <Button
                onClick={salva}
                disabled={pending || controllo.livello === 'blocco'}
                className={controllo.livello === 'avviso' ? 'bg-amber-600 hover:bg-amber-700' : ''}
              >
                {pending ? 'Salvataggio…' : controllo.livello === 'avviso' ? 'Salva comunque' : 'Salva'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

Se eslint segnala `react-hooks/set-state-in-effect` sul caricamento, seguire lo schema già usato in `CruscottoProduzione` (disabilitare la regola sulla riga con commento che spiega perché) e ledgerare.

- [ ] **Step 4: Viste e loader**

In `ScadenzeView.tsx` e `ScadenzeDaProgrammareView.tsx`:
- nuova prop `collegamentiFic?: Record<string, RiepilogoCollegamento> | null`;
- stato `const [scadenzaFatture, setScadenzaFatture] = useState<Scadenza | null>(null)`;
- su ogni `<RigaScadenza …>`: `riepilogoFatture={collegamentiFic?.[s.id]}` e `onApriFatture={collegamentiFic ? setScadenzaFatture : undefined}`;
- in fondo al JSX: `{scadenzaFatture && <DialogCollegaFatture scadenza={scadenzaFatture} onClose={() => setScadenzaFatture(null)} />}`.

In `app/(dashboard)/commesse/[id]/page.tsx`, `ScadenzeViewLoader`: dopo aver letto `scadenze`,

```ts
  // La funzione compare solo con FiC collegato e permesso sulle fatture fornitori.
  const [{ permessi }, collegamentoFic] = await Promise.all([getMyPermissions(), getCollegamentoFic()])
  const ficDisponibile = collegamentoFic !== null && permessi.fatture_fornitori !== 'nessuno' && permessi.commesse === 'scrittura'
  const collegamentiFic = ficDisponibile ? await getRiepiloghiCollegamenti(scadenze.map((s) => s.id)) : null
```

e passare `collegamentiFic={collegamentiFic}` a entrambe le viste. Import: `getMyPermissions` da `@/lib/permessi`, `getCollegamentoFic` da `@/actions/fatture-in-cloud`, `getRiepiloghiCollegamenti` da `@/actions/fic-pagamenti`.

- [ ] **Step 5: Verifica** — `npx tsc --noEmit && npm run lint && npm run test` → verdi.

- [ ] **Step 6: Commit**

```bash
git add components/commesse "app/(dashboard)/commesse/[id]/page.tsx"
git commit -m "feat(fic): finestra di collegamento scadenza-fatture con controllo degli importi"
```

---

### Task 10: Pagina Fatture fornitori — riquadro, "Pagata con", pagamento programmato

**Files:**
- Create: `components/fatture-fornitori/BannerPagamentiFic.tsx`
- Modify: `app/(dashboard)/fatture-fornitori/page.tsx`, `components/fatture-fornitori/ElencoFattureFornitori.tsx`, `components/fatture-fornitori/DialogFatturaFornitore.tsx`

**Interfaces:**
- Consumes: `getPagamentiFatture`, `getProblemiFic`, `riprovaTuttiFic` (Task 7), `mostraEsitoFic` (Task 8).
- Produces: prop `pagamenti: Record<number, PagamentoFattura[]>` e `problemi: ProblemiFic` su `ElencoFattureFornitori`; prop `pagamenti: PagamentoFattura[]` su `DialogFatturaFornitore`.

- [ ] **Step 1: `BannerPagamentiFic.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { riprovaTuttiFic } from '@/actions/fic-pagamenti'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import type { ProblemiFic } from '@/types/fatture-fornitori'

export default function BannerPagamentiFic({ problemi, puoRiprovare }: { problemi: ProblemiFic; puoRiprovare: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (problemi.elenco.length === 0) return null

  function riprova() {
    startTransition(async () => {
      try {
        const r = await riprovaTuttiFic()
        if (!r.ok) toast.error(r.errore)
        else mostraEsitoFic(r.esito)
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm dark:bg-rose-950/30">
      <div className="flex flex-wrap items-center gap-3">
        <strong>{problemi.elenco.length} pagamenti non allineati su FiC</strong>
        {puoRiprovare && problemi.daAllineare > 0 && (
          <Button size="sm" variant="outline" onClick={riprova} disabled={pending}>
            {pending ? 'Riprovo…' : 'Riprova tutti'}
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {problemi.elenco.map((p, i) => (
          <li key={`${p.scadenza_id}-${i}`}>
            <Link href={`/commesse/${p.gruppo_id}`} className="underline">{p.fornitore || 'Scadenza'}</Link>
            {' — '}{p.stato_fic === 'da_verificare' ? 'da verificare: ' : 'da allineare: '}{p.messaggio_fic ?? ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Pagina**

In `app/(dashboard)/fatture-fornitori/page.tsx`, dopo il `Promise.all` esistente:

```ts
  const [pagamenti, problemi] = await Promise.all([
    getPagamentiFatture(fatture.map((f) => f.fic_id)),
    getProblemiFic(),
  ])
```

e passare `pagamenti={pagamenti}` e `problemi={problemi}` a `ElencoFattureFornitori`.

- [ ] **Step 3: `ElencoFattureFornitori.tsx`**

- nuove prop `pagamenti: Record<number, PagamentoFattura[]>` e `problemi: ProblemiFic`;
- sotto `BarraSincronizzazione`: `<BannerPagamentiFic problemi={problemi} puoRiprovare={canEdit('commesse')} />`;
- nella cella Stato (tabella) e nel badge mobile, accanto al badge di stato:

```tsx
{(pagamenti[f.fic_id] ?? []).some((p) => !p.scadenza_pagata) && (
  <span title="Pagamento programmato con una scadenza">
    <CalendarClock className="ml-1 inline h-4 w-4 text-sky-600" />
  </span>
)}
```

(import `CalendarClock` da `lucide-react`);
- `<DialogFatturaFornitore fattura={aperta} pagamenti={aperta ? pagamenti[aperta.fic_id] ?? [] : []} onClose=… />`.

- [ ] **Step 4: `DialogFatturaFornitore.tsx`** — prop `pagamenti: PagamentoFattura[]`; prima del pulsante "Apri PDF":

```tsx
            {pagamenti.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Pagata con</h3>
                <ul className="space-y-1 text-sm">
                  {pagamenti.map((p) => (
                    <li key={p.scadenza_id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/commesse/${p.gruppo_id}`} className="underline">
                        {p.descrizione || p.fornitore || 'Scadenza'}
                      </Link>
                      <span>{p.data_scadenza ? formatData(p.data_scadenza) : 'senza data'}</span>
                      <span>€ {formatEuro(p.importo)}</span>
                      {!p.scadenza_pagata
                        ? <Badge variant="outline">Programmato</Badge>
                        : p.stato_fic === 'scritto'
                          ? <Badge variant="secondary">Su FiC</Badge>
                          : <Badge variant="destructive" title={p.messaggio_fic ?? ''}>{p.stato_fic === 'da_verificare' ? 'Da verificare' : 'Da allineare'}</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
```

(import `Link` da `next/link`).

- [ ] **Step 5: Verifica** — `npx tsc --noEmit && npm run lint && npm run test && (RESEND_API_KEY=${RESEND_API_KEY:-re_fittizia} npm run build)` → verdi.

- [ ] **Step 6: Commit**

```bash
git add components/fatture-fornitori "app/(dashboard)/fatture-fornitori/page.tsx"
git commit -m "feat(fic): pagamenti visibili nella pagina fatture fornitori"
```

---

### Task 11: Prova reale, documentazione, merge

**Files:**
- Memoria: `project_fatture_in_cloud.md`, `PRD.md` (memoria), `MEMORY.md` se serve
- Modify: `PRD.md` del repo (riga Integrazione contabilità)

- [ ] **Step 1: Suite, lint, build** — `npm run test && npm run lint && npm run build` (chiave Resend fittizia se manca).

- [ ] **Step 2: Prova reale con l'utente** (`npm run dev`, login dell'utente):
1. scegliere con l'utente una scadenza **non pagata** di un fornitore con fatture e una nota di credito su FiC; aprire "Fatture", spuntare due fatture e la nota: verificare ripartizione, barra e avvisi;
2. salvare; nessuna scrittura su FiC (scadenza non pagata): icona azzurra, "Programmato" nella fattura;
3. segnare pagata: toast "Pagamento scritto su FiC: 3 documenti"; su FiC le fatture e la nota risultano pagate con data e metodo; icona verde;
4. togliere pagato: toast "Pagamento tolto da FiC"; su FiC tutto come prima (rate riunite);
5. controllo DB: `select stato_fic, scrittura_fic is null from scadenze_fatture;`
6. se la scadenza non era dell'utente da tenere così, rimetterla nello stato voluto dall'utente.

- [ ] **Step 3: Revisione finale** del branch con revisore fresco (vedi executing-plans), fix di Critical/Important con test RED→GREEN.

- [ ] **Step 4: Documentazione**
- `project_fatture_in_cloud.md`: aggiungere "Fase 2 (data)": scadenza = pagamento, `scadenze_fatture` con 4 stati, `allineaScadenzaFic` unico punto, RESTRICT, statistiche invariate, `scrittura_fic` per annullare solo quanto scritto, esiti della prova del Task 1;
- PRD memoria: riga del modulo aggiornata e backlog (resta la fase 3: costi per commessa);
- `MEMORY.md`: aggiornare la descrizione della riga Fatture in Cloud.

- [ ] **Step 5: Commit, merge, push, pulizia**

```bash
git add PRD.md
git commit -m "docs(fic): PRD aggiornato con i pagamenti delle fatture fornitori"
git checkout master && git pull --ff-only origin master
git merge --no-ff feat/fic-pagamenti -m "merge: pagamenti delle fatture fornitori su Fatture in Cloud"
git push origin master
git branch -d feat/fic-pagamenti
```
