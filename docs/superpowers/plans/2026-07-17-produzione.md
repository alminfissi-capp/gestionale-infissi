# Sezione Produzione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare alle commesse un lato operativo — documenti tecnici e ordini ai fornitori — in una sezione `/produzione` con cruscotto e dettaglio per commessa.

**Architecture:** Due tabelle nuove (`ordini_fornitore`, `righe_ordine_fornitore`) agganciate con FK vere a `commesse` e `fornitori`. I documenti riusano `documenti_commessa` e il bucket `commesse-docs`, separati da Commesse per `tipo_documento`. La logica pura (totali, ritardo, numerazione) sta in `lib/produzione.ts` senza dipendenze React ed è l'unica parte con test.

**Tech Stack:** Next.js 16 App Router (React 19, TS strict), Supabase (Postgres + RLS), shadcn/ui + Tailwind, `@react-pdf/renderer`, Resend, Vitest (nuovo).

**Spec:** `docs/superpowers/specs/2026-07-17-produzione-design.md`

## Global Constraints

- Branch di lavoro: `produzione`. Un commit per task.
- Ogni server action chiama `getOrgId()` da `@/lib/auth` e filtra per `organization_id`. Mai bypassare la RLS fuori dagli upload con service role.
- Ogni pagina di `/produzione` chiama `await requireAccesso('produzione')` da `@/lib/permessi`.
- `params` e `searchParams` sono `Promise` in Next.js 16 → `await params`.
- Upload file: **sempre** via server action con `FormData` + `createServiceClient()`, mai dal browser. È la scelta che fa funzionare i caricamenti da iOS/Android. Path `{orgId}/{commessaId}/{timestamp}.{ext}`, limite 20 MB, fallback MIME per estensione.
- Le note multiriga si mostrano con `whitespace-pre-line`.
- Import dei tipi con `import type`. Zero variabili inutilizzate: `npm run lint` deve passare pulito.
- Verifica di fine task: `npx tsc --noEmit` e `npm run lint` devono passare. `npm run build` fallisce in locale se manca `RESEND_API_KEY` — è pre-esistente, usare una chiave fittizia se serve buildare.
- Denaro: `NUMERIC(10,2)`; quantità `NUMERIC(10,3)`; prezzi unitari `NUMERIC(10,4)`. Da Supabase arrivano come stringhe → `Number()` esplicito nelle action di lettura.
- Stati commessa "non chiusi" (default del cruscotto): `in_attesa`, `da_iniziare`, `in_lavorazione`, `da_consegnare`, `parzialmente_consegnato`.

---

### Task 1: Migration + tipi

**Files:**
- Create: `supabase/migrations/20260717120000_produzione_ordini.sql`
- Create: `types/produzione.ts`

**Interfaces:**
- Consumes: `commesse(id)`, `fornitori(id)`, funzione Postgres `get_user_organization_id()`.
- Produces: tabelle `ordini_fornitore`, `righe_ordine_fornitore`; tipi `StatoOrdine`, `OrdineFornitore`, `RigaOrdine`, `RigaOrdineInput`, `OrdineInput`, `OrdineCompleto`, `TIPI_DOCUMENTO_PRODUZIONE`, `STATI_ORDINE`, `STATI_COMMESSA_APERTI`.

- [x] **Step 1: Scrivere la migration**

Create `supabase/migrations/20260717120000_produzione_ordini.sql`:

```sql
-- ============================================================
-- 20260717120000_produzione_ordini.sql
-- Sezione Produzione: ordini fornitore e righe
-- ============================================================

CREATE TABLE ordini_fornitore (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commessa_id            UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  fornitore_id           UUID REFERENCES fornitori(id) ON DELETE SET NULL,
  numero_ordine          TEXT NOT NULL DEFAULT '',
  data_ordine            DATE NOT NULL DEFAULT CURRENT_DATE,
  data_consegna_prevista DATE,
  stato                  TEXT NOT NULL DEFAULT 'da_ordinare'
    CHECK (stato IN ('da_ordinare', 'ordinato', 'arrivato', 'annullato')),
  pdf_path               TEXT,
  inviato_at             TIMESTAMPTZ,
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE righe_ordine_fornitore (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordine_id       UUID NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  descrizione     TEXT NOT NULL,
  quantita        NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantita > 0),
  unita_misura    TEXT NOT NULL DEFAULT 'pz',
  prezzo_unitario NUMERIC(10,4),
  ordine          INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordini_fornitore_org_stato ON ordini_fornitore(organization_id, stato);
CREATE INDEX idx_ordini_fornitore_commessa  ON ordini_fornitore(commessa_id);
CREATE INDEX idx_ordini_fornitore_fornitore ON ordini_fornitore(fornitore_id);
CREATE INDEX idx_righe_ordine_ordine        ON righe_ordine_fornitore(ordine_id);

ALTER TABLE ordini_fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE righe_ordine_fornitore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordini_fornitore_select" ON ordini_fornitore FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "ordini_fornitore_insert" ON ordini_fornitore FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "ordini_fornitore_update" ON ordini_fornitore FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "ordini_fornitore_delete" ON ordini_fornitore FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "righe_ordine_select" ON righe_ordine_fornitore FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "righe_ordine_insert" ON righe_ordine_fornitore FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "righe_ordine_update" ON righe_ordine_fornitore FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "righe_ordine_delete" ON righe_ordine_fornitore FOR DELETE USING (organization_id = get_user_organization_id());
```

- [x] **Step 2: Applicare la migration**

Applicare al progetto Supabase `xawyrtqclpeylxnhwhwo` con il tool MCP `apply_migration`, nome `produzione_ordini`, passando lo stesso SQL.

- [x] **Step 3: Verificare che le tabelle esistano**

Eseguire con il tool MCP `execute_sql`:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ordini_fornitore', 'righe_ordine_fornitore');
```

Atteso: due righe.

- [x] **Step 4: Scrivere i tipi**

Create `types/produzione.ts`:

```typescript
import type { StatoCommessa } from '@/types/commessa'

export type StatoOrdine = 'da_ordinare' | 'ordinato' | 'arrivato' | 'annullato'

export const STATI_ORDINE: { value: StatoOrdine; label: string }[] = [
  { value: 'da_ordinare', label: 'Da ordinare' },
  { value: 'ordinato',    label: 'Ordinato' },
  { value: 'arrivato',    label: 'Arrivato' },
  { value: 'annullato',   label: 'Annullato' },
]

/** Stati commessa considerati "aperti" in Produzione: default del cruscotto. */
export const STATI_COMMESSA_APERTI: StatoCommessa[] = [
  'in_attesa',
  'da_iniziare',
  'in_lavorazione',
  'da_consegnare',
  'parzialmente_consegnato',
]

/** Tipi documento di competenza della Produzione (Commesse mostra gli altri). */
export const TIPI_DOCUMENTO_PRODUZIONE: { value: string; label: string }[] = [
  { value: 'disegno',          label: 'Disegno' },
  { value: 'scheda_tecnica',   label: 'Scheda tecnica' },
  { value: 'ddt',              label: 'DDT' },
  { value: 'conferma_ordine',  label: 'Conferma ordine' },
  { value: 'foto',             label: 'Foto' },
  { value: 'ordine_fornitore', label: 'Ordine fornitore' },
]

export const TIPI_DOCUMENTO_PRODUZIONE_VALUES = TIPI_DOCUMENTO_PRODUZIONE.map((t) => t.value)

export type RigaOrdine = {
  id: string
  ordine_id: string
  organization_id: string
  descrizione: string
  quantita: number
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
  created_at: string
}

export type RigaOrdineInput = {
  descrizione: string
  quantita: number
  unita_misura: string
  prezzo_unitario: number | null
  ordine: number
}

export type OrdineFornitore = {
  id: string
  organization_id: string
  commessa_id: string
  fornitore_id: string | null
  numero_ordine: string
  data_ordine: string
  data_consegna_prevista: string | null
  stato: StatoOrdine
  pdf_path: string | null
  inviato_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type OrdineInput = {
  commessa_id: string
  fornitore_id: string | null
  numero_ordine: string
  data_ordine: string
  data_consegna_prevista: string | null
  stato: StatoOrdine
  note: string | null
  righe: RigaOrdineInput[]
}

export type OrdineCompleto = OrdineFornitore & {
  righe: RigaOrdine[]
  fornitore_nome: string | null
  totale: number
  in_ritardo: boolean
}

/** Riga del cruscotto: ordine con il contesto della commessa. */
export type OrdineConCommessa = OrdineCompleto & {
  numero_commessa: string
  cliente_nome: string
}

/** Card commessa nel cruscotto. */
export type CommessaProduzione = {
  id: string
  numero_commessa: string
  cliente_nome: string
  stato: StatoCommessa
  ordini_aperti: number
  ordini_in_ritardo: number
  documenti: number
}
```

- [x] **Step 5: Verificare tipi e lint**

```bash
npx tsc --noEmit
npx eslint types/produzione.ts
```

Atteso: nessun errore.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20260717120000_produzione_ordini.sql types/produzione.ts
git commit -m "feat: produzione - migration ordini fornitore e tipi"
```

---

### Task 2: Vitest + logica pura

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/produzione.ts`
- Create: `lib/produzione.test.ts`
- Modify: `package.json` (script `test`, devDependencies)

**Interfaces:**
- Consumes: tipi da `types/produzione.ts` (Task 1).
- Produces: `calcolaTotaleRigaOrdine(riga)`, `calcolaTotaleOrdine(righe)`, `isInRitardo(dataConsegnaPrevista, stato, oggi)`, `prossimoNumeroOrdine(numeriEsistenti, anno)`.

- [x] **Step 1: Installare Vitest**

```bash
npm install -D vitest@^3
```

- [x] **Step 2: Configurare Vitest**

Create `vitest.config.ts`. L'alias `@` replica `paths` di `tsconfig.json`; `environment: 'node'` perché si testa solo logica pura senza DOM.

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [x] **Step 3: Aggiungere lo script test**

Modify `package.json`: aggiungere in `"scripts"`, dopo `"lint": "eslint",`:

```json
    "test": "vitest run",
```

- [x] **Step 4: Scrivere i test che falliscono**

Create `lib/produzione.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  calcolaTotaleRigaOrdine,
  calcolaTotaleOrdine,
  isInRitardo,
  prossimoNumeroOrdine,
} from '@/lib/produzione'

describe('calcolaTotaleRigaOrdine', () => {
  it('moltiplica quantita per prezzo unitario', () => {
    expect(calcolaTotaleRigaOrdine({ quantita: 3, prezzo_unitario: 10.5 })).toBe(31.5)
  })

  it('vale 0 se il prezzo manca (ordine senza prezzi)', () => {
    expect(calcolaTotaleRigaOrdine({ quantita: 3, prezzo_unitario: null })).toBe(0)
  })

  it('arrotonda a 2 decimali', () => {
    expect(calcolaTotaleRigaOrdine({ quantita: 3, prezzo_unitario: 0.3333 })).toBe(1)
  })
})

describe('calcolaTotaleOrdine', () => {
  it('somma le righe', () => {
    const righe = [
      { quantita: 2, prezzo_unitario: 10 },
      { quantita: 1, prezzo_unitario: 5.5 },
    ]
    expect(calcolaTotaleOrdine(righe)).toBe(25.5)
  })

  it('vale 0 senza righe', () => {
    expect(calcolaTotaleOrdine([])).toBe(0)
  })

  it('ignora le righe senza prezzo invece di produrre NaN', () => {
    const righe = [
      { quantita: 2, prezzo_unitario: 10 },
      { quantita: 5, prezzo_unitario: null },
    ]
    expect(calcolaTotaleOrdine(righe)).toBe(20)
  })
})

describe('isInRitardo', () => {
  const oggi = new Date('2026-07-17')

  it('e in ritardo se la consegna prevista e passata e non e arrivato', () => {
    expect(isInRitardo('2026-07-10', 'ordinato', oggi)).toBe(true)
    expect(isInRitardo('2026-07-10', 'da_ordinare', oggi)).toBe(true)
  })

  it('non e mai in ritardo se e arrivato', () => {
    expect(isInRitardo('2026-07-10', 'arrivato', oggi)).toBe(false)
  })

  it('non e in ritardo se e annullato', () => {
    expect(isInRitardo('2026-07-10', 'annullato', oggi)).toBe(false)
  })

  it('non e in ritardo se la consegna e futura', () => {
    expect(isInRitardo('2026-07-20', 'ordinato', oggi)).toBe(false)
  })

  it('non e in ritardo il giorno stesso della consegna', () => {
    expect(isInRitardo('2026-07-17', 'ordinato', oggi)).toBe(false)
  })

  it('non e in ritardo senza data di consegna prevista', () => {
    expect(isInRitardo(null, 'ordinato', oggi)).toBe(false)
  })
})

describe('prossimoNumeroOrdine', () => {
  it('parte da 001 se non ci sono ordini per quell anno', () => {
    expect(prossimoNumeroOrdine([], 2026)).toBe('2026-001')
  })

  it('incrementa il massimo dell anno', () => {
    expect(prossimoNumeroOrdine(['2026-001', '2026-002'], 2026)).toBe('2026-003')
  })

  it('ignora gli anni diversi', () => {
    expect(prossimoNumeroOrdine(['2025-009', '2026-001'], 2026)).toBe('2026-002')
  })

  it('ignora i numeri non conformi inseriti a mano', () => {
    expect(prossimoNumeroOrdine(['ordine urgente', '2026-004'], 2026)).toBe('2026-005')
  })

  it('usa il massimo, non il conteggio, se ci sono buchi', () => {
    expect(prossimoNumeroOrdine(['2026-001', '2026-007'], 2026)).toBe('2026-008')
  })
})
```

- [x] **Step 5: Eseguire i test e verificare che falliscano**

```bash
npm test
```

Atteso: FAIL — `Failed to resolve import "@/lib/produzione"`.

- [x] **Step 6: Implementare la logica**

Create `lib/produzione.ts`:

```typescript
import type { StatoOrdine } from '@/types/produzione'

type RigaCalcolabile = { quantita: number; prezzo_unitario: number | null }

const arrotonda2 = (n: number): number => Math.round(n * 100) / 100

export function calcolaTotaleRigaOrdine(riga: RigaCalcolabile): number {
  if (riga.prezzo_unitario === null) return 0
  return arrotonda2(riga.quantita * riga.prezzo_unitario)
}

export function calcolaTotaleOrdine(righe: RigaCalcolabile[]): number {
  return arrotonda2(righe.reduce((tot, r) => tot + calcolaTotaleRigaOrdine(r), 0))
}

/**
 * Un ordine è in ritardo se la consegna prevista è già passata e non è
 * ancora arrivato. Gli ordini arrivati o annullati non sono mai in ritardo.
 */
export function isInRitardo(
  dataConsegnaPrevista: string | null,
  stato: StatoOrdine,
  oggi: Date = new Date()
): boolean {
  if (!dataConsegnaPrevista) return false
  if (stato === 'arrivato' || stato === 'annullato') return false
  const previsto = new Date(`${dataConsegnaPrevista}T00:00:00`)
  const riferimento = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  return previsto.getTime() < riferimento.getTime()
}

const RE_NUMERO_ORDINE = /^(\d{4})-(\d{3})$/

/**
 * Progressivo AAAA-NNN. Usa il massimo esistente dell'anno, non il conteggio:
 * con i numeri modificabili a mano possono esserci buchi e duplicati.
 */
export function prossimoNumeroOrdine(numeriEsistenti: string[], anno: number): string {
  let massimo = 0
  for (const numero of numeriEsistenti) {
    const match = RE_NUMERO_ORDINE.exec(numero.trim())
    if (!match) continue
    if (Number(match[1]) !== anno) continue
    massimo = Math.max(massimo, Number(match[2]))
  }
  return `${anno}-${String(massimo + 1).padStart(3, '0')}`
}
```

- [x] **Step 7: Eseguire i test e verificare che passino**

```bash
npm test
```

Atteso: PASS, 18 test.

- [x] **Step 8: Verificare tipi e lint**

```bash
npx tsc --noEmit
npx eslint lib/produzione.ts lib/produzione.test.ts vitest.config.ts
```

Atteso: nessun errore. Se eslint segnala `vitest.config.ts` o i file di test come non inclusi in tsconfig, aggiungerli a `include` in `tsconfig.json`.

- [x] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/produzione.ts lib/produzione.test.ts
git commit -m "feat: produzione - vitest e logica pura (totali, ritardo, numerazione)"
```

---

### Task 3: Server actions

**Files:**
- Create: `actions/produzione.ts`

**Interfaces:**
- Consumes: `getOrgId()` da `@/lib/auth`, `createClient()` da `@/lib/supabase/server`, `createServiceClient()` da `@/lib/supabase/service`, tipi Task 1, logica Task 2.
- Produces:
  - `getOrdiniCommessa(commessaId: string): Promise<OrdineCompleto[]>`
  - `getCommessaProduzione(commessaId: string): Promise<{ id, numero_commessa, cliente_nome, stato } | null>`
  - `getCruscottoProduzione(stati?: StatoCommessa[]): Promise<{ daFare: OrdineConCommessa[]; commesse: CommessaProduzione[] }>`
  - `getFornitoriPerOrdine(): Promise<{ id: string; nome: string; email: string | null }[]>`
  - `getDescrizioniFornitore(fornitoreId: string): Promise<string[]>`
  - `getProssimoNumeroOrdine(): Promise<string>`
  - `createOrdine(input: OrdineInput): Promise<string>` — ritorna l'id
  - `updateOrdine(id: string, input: OrdineInput): Promise<void>`
  - `setStatoOrdine(id: string, stato: StatoOrdine): Promise<void>`
  - `deleteOrdine(id: string): Promise<void>`

- [x] **Step 1: Scrivere le action**

Create `actions/produzione.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { calcolaTotaleOrdine, isInRitardo, prossimoNumeroOrdine } from '@/lib/produzione'
import { STATI_COMMESSA_APERTI, TIPI_DOCUMENTO_PRODUZIONE_VALUES } from '@/types/produzione'
import type {
  OrdineCompleto,
  OrdineConCommessa,
  OrdineInput,
  RigaOrdine,
  StatoOrdine,
  CommessaProduzione,
} from '@/types/produzione'
import type { StatoCommessa } from '@/types/commessa'

type FornitoreOpzione = { id: string; nome: string; email: string | null }

const numeraRighe = (righe: RigaOrdine[]): RigaOrdine[] =>
  righe.map((r) => ({
    ...r,
    quantita: Number(r.quantita),
    prezzo_unitario: r.prezzo_unitario === null ? null : Number(r.prezzo_unitario),
  }))

export async function getFornitoriPerOrdine(): Promise<FornitoreOpzione[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('fornitori')
    .select('id, nome, email')
    .eq('organization_id', orgId)
    .order('nome', { ascending: true })
  return data ?? []
}

/** Descrizioni già usate per quel fornitore, più frequenti in cima. */
export async function getDescrizioniFornitore(fornitoreId: string): Promise<string[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('righe_ordine_fornitore')
    .select('descrizione, ordini_fornitore!inner(fornitore_id)')
    .eq('organization_id', orgId)
    .eq('ordini_fornitore.fornitore_id', fornitoreId)
    .limit(500)

  const frequenze = new Map<string, number>()
  for (const riga of data ?? []) {
    const d = riga.descrizione.trim()
    if (!d) continue
    frequenze.set(d, (frequenze.get(d) ?? 0) + 1)
  }
  return [...frequenze.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([descrizione]) => descrizione)
}

function componiOrdini(
  ordini: {
    id: string
    fornitore_id: string | null
    data_consegna_prevista: string | null
    stato: StatoOrdine
    [k: string]: unknown
  }[],
  fornitori: FornitoreOpzione[],
  righePerOrdine: Map<string, RigaOrdine[]>
): OrdineCompleto[] {
  const nomeFornitore = new Map(fornitori.map((f) => [f.id, f.nome]))
  return ordini.map((o) => {
    const righe = righePerOrdine.get(o.id) ?? []
    return {
      ...(o as unknown as OrdineCompleto),
      righe,
      fornitore_nome: o.fornitore_id ? (nomeFornitore.get(o.fornitore_id) ?? null) : null,
      totale: calcolaTotaleOrdine(righe),
      in_ritardo: isInRitardo(o.data_consegna_prevista, o.stato),
    }
  })
}

export async function getOrdiniCommessa(commessaId: string): Promise<OrdineCompleto[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: ordini }, fornitori] = await Promise.all([
    supabase
      .from('ordini_fornitore')
      .select('*')
      .eq('organization_id', orgId)
      .eq('commessa_id', commessaId)
      .order('data_ordine', { ascending: false }),
    getFornitoriPerOrdine(),
  ])
  if (!ordini || ordini.length === 0) return []

  const { data: righe } = await supabase
    .from('righe_ordine_fornitore')
    .select('*')
    .in('ordine_id', ordini.map((o) => o.id))
    .order('ordine', { ascending: true })

  const righePerOrdine = new Map<string, RigaOrdine[]>()
  for (const r of numeraRighe((righe ?? []) as RigaOrdine[])) {
    righePerOrdine.set(r.ordine_id, [...(righePerOrdine.get(r.ordine_id) ?? []), r])
  }
  return componiOrdini(ordini, fornitori, righePerOrdine)
}

export async function getCruscottoProduzione(
  stati: StatoCommessa[] = STATI_COMMESSA_APERTI
): Promise<{ daFare: OrdineConCommessa[]; commesse: CommessaProduzione[] }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: commesse } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome, stato')
    .eq('organization_id', orgId)
    .in('stato', stati)
    .order('data_conferma', { ascending: false })

  if (!commesse || commesse.length === 0) return { daFare: [], commesse: [] }
  const commessaIds = commesse.map((c) => c.id)

  const [{ data: ordini }, { data: documenti }, fornitori] = await Promise.all([
    supabase
      .from('ordini_fornitore')
      .select('*')
      .eq('organization_id', orgId)
      .in('commessa_id', commessaIds)
      .neq('stato', 'annullato'),
    supabase
      .from('documenti_commessa')
      .select('commessa_id, tipo_documento')
      .eq('organization_id', orgId)
      .in('commessa_id', commessaIds),
    getFornitoriPerOrdine(),
  ])

  const listaOrdini = ordini ?? []
  const { data: righe } = listaOrdini.length
    ? await supabase
        .from('righe_ordine_fornitore')
        .select('*')
        .in('ordine_id', listaOrdini.map((o) => o.id))
        .order('ordine', { ascending: true })
    : { data: [] }

  const righePerOrdine = new Map<string, RigaOrdine[]>()
  for (const r of numeraRighe((righe ?? []) as RigaOrdine[])) {
    righePerOrdine.set(r.ordine_id, [...(righePerOrdine.get(r.ordine_id) ?? []), r])
  }
  const completi = componiOrdini(listaOrdini, fornitori, righePerOrdine)
  const datiCommessa = new Map(commesse.map((c) => [c.id, c]))

  const daFare: OrdineConCommessa[] = completi
    .filter((o) => o.stato === 'da_ordinare' || o.in_ritardo)
    .map((o) => {
      const c = datiCommessa.get(o.commessa_id)
      return {
        ...o,
        numero_commessa: c?.numero_commessa ?? '',
        cliente_nome: c?.cliente_nome ?? '',
      }
    })
    .sort((a, b) => Number(b.in_ritardo) - Number(a.in_ritardo))

  const docProduzione = (documenti ?? []).filter((d) =>
    TIPI_DOCUMENTO_PRODUZIONE_VALUES.includes(d.tipo_documento)
  )

  const cards: CommessaProduzione[] = commesse.map((c) => {
    const suoi = completi.filter((o) => o.commessa_id === c.id)
    return {
      id: c.id,
      numero_commessa: c.numero_commessa,
      cliente_nome: c.cliente_nome,
      stato: c.stato as StatoCommessa,
      ordini_aperti: suoi.filter((o) => o.stato !== 'arrivato').length,
      ordini_in_ritardo: suoi.filter((o) => o.in_ritardo).length,
      documenti: docProduzione.filter((d) => d.commessa_id === c.id).length,
    }
  })

  return { daFare, commesse: cards }
}

export async function getCommessaProduzione(commessaId: string): Promise<{
  id: string
  numero_commessa: string
  cliente_nome: string
  stato: StatoCommessa
} | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome, stato')
    .eq('id', commessaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data as { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa } | null
}

export async function getProssimoNumeroOrdine(): Promise<string> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const anno = new Date().getFullYear()
  const { data } = await supabase
    .from('ordini_fornitore')
    .select('numero_ordine')
    .eq('organization_id', orgId)
  return prossimoNumeroOrdine((data ?? []).map((o) => o.numero_ordine), anno)
}

async function salvaRighe(ordineId: string, orgId: string, righe: OrdineInput['righe']) {
  const supabase = await createClient()
  await supabase.from('righe_ordine_fornitore').delete().eq('ordine_id', ordineId)
  const valide = righe.filter((r) => r.descrizione.trim() !== '')
  if (valide.length === 0) return
  const { error } = await supabase.from('righe_ordine_fornitore').insert(
    valide.map((r, i) => ({
      ordine_id: ordineId,
      organization_id: orgId,
      descrizione: r.descrizione.trim(),
      quantita: r.quantita,
      unita_misura: r.unita_misura,
      prezzo_unitario: r.prezzo_unitario,
      ordine: i,
    }))
  )
  if (error) throw new Error(error.message)
}

export async function createOrdine(input: OrdineInput): Promise<string> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { righe, ...testata } = input
  const { data, error } = await supabase
    .from('ordini_fornitore')
    .insert({ ...testata, organization_id: orgId })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Errore creazione ordine')
  await salvaRighe(data.id, orgId, righe)
  revalidatePath('/produzione', 'layout')
  return data.id
}

export async function updateOrdine(id: string, input: OrdineInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { righe, ...testata } = input
  const { error } = await supabase
    .from('ordini_fornitore')
    .update({ ...testata, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  await salvaRighe(id, orgId, righe)
  revalidatePath('/produzione', 'layout')
}

export async function setStatoOrdine(id: string, stato: StatoOrdine): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('ordini_fornitore')
    .update({ stato, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}

export async function deleteOrdine(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('ordini_fornitore')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}
```

- [x] **Step 2: Verificare tipi e lint**

```bash
npx tsc --noEmit
npx eslint actions/produzione.ts
```

Atteso: nessun errore. Se il join `ordini_fornitore!inner(fornitore_id)` in `getDescrizioniFornitore` non tipizza, verificare il nome della FK con il tool MCP `execute_sql`:

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'righe_ordine_fornitore'::regclass;
```

- [x] **Step 3: Commit**

```bash
git add actions/produzione.ts
git commit -m "feat: produzione - server actions ordini fornitore"
```

---

### Task 4: Dettaglio commessa e dialog ordine

**Files:**
- Create: `components/produzione/RigheOrdine.tsx`
- Create: `components/produzione/DialogOrdine.tsx`
- Create: `components/produzione/ProduzioneCommessa.tsx`
- Create: `app/(dashboard)/produzione/[commessaId]/page.tsx`

**Interfaces:**
- Consumes: action Task 3, tipi Task 1, `calcolaTotaleOrdine` Task 2.
- Produces: `<ProduzioneCommessa commessa ordini fornitori />`, rotta `/produzione/[commessaId]`.

- [x] **Step 1: Righe editabili**

Create `components/produzione/RigheOrdine.tsx`. `datalist` dà l'autocomplete nativo, senza dipendenze:

```tsx
'use client'

import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/pricing'
import { calcolaTotaleRigaOrdine } from '@/lib/produzione'
import type { RigaOrdineInput } from '@/types/produzione'

interface Props {
  righe: RigaOrdineInput[]
  suggerimenti: string[]
  onChange: (righe: RigaOrdineInput[]) => void
}

export default function RigheOrdine({ righe, suggerimenti, onChange }: Props) {
  const aggiorna = (i: number, patch: Partial<RigaOrdineInput>) => {
    onChange(righe.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const aggiungi = () => {
    onChange([
      ...righe,
      { descrizione: '', quantita: 1, unita_misura: 'pz', prezzo_unitario: null, ordine: righe.length },
    ])
  }

  const rimuovi = (i: number) => {
    onChange(righe.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, ordine: idx })))
  }

  return (
    <div className="space-y-2">
      <datalist id="suggerimenti-righe">
        {suggerimenti.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {righe.map((riga, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input
            className="col-span-5"
            list="suggerimenti-righe"
            placeholder="Descrizione"
            value={riga.descrizione}
            onChange={(e) => aggiorna(i, { descrizione: e.target.value })}
          />
          <Input
            className="col-span-2"
            type="number"
            step="0.001"
            min="0.001"
            value={riga.quantita}
            onChange={(e) => aggiorna(i, { quantita: Number(e.target.value) })}
          />
          <Input
            className="col-span-1"
            value={riga.unita_misura}
            onChange={(e) => aggiorna(i, { unita_misura: e.target.value })}
          />
          <Input
            className="col-span-2"
            type="number"
            step="0.0001"
            placeholder="Prezzo"
            value={riga.prezzo_unitario ?? ''}
            onChange={(e) =>
              aggiorna(i, { prezzo_unitario: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
          <span className="col-span-1 text-sm text-right text-gray-600 dark:text-gray-400">
            {formatEuro(calcolaTotaleRigaOrdine(riga))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="col-span-1 h-8 w-8 p-0 text-red-600"
            onClick={() => rimuovi(i)}
            aria-label="Rimuovi riga"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={aggiungi} className="gap-2">
        <Plus className="h-4 w-4" /> Aggiungi riga
      </Button>
    </div>
  )
}
```

- [x] **Step 2: Verificare la firma di formatEuro**

```bash
npx eslint components/produzione/RigheOrdine.tsx
npx tsc --noEmit
```

Se `formatEuro` non è esportato da `@/lib/pricing` con questa firma, controllare e adattare:

```bash
grep -n "export function formatEuro" lib/pricing.ts
```

- [x] **Step 3: Dialog ordine**

Create `components/produzione/DialogOrdine.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import RigheOrdine from './RigheOrdine'
import { formatEuro } from '@/lib/pricing'
import { calcolaTotaleOrdine } from '@/lib/produzione'
import { createOrdine, updateOrdine, getDescrizioniFornitore } from '@/actions/produzione'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, RigaOrdineInput, StatoOrdine } from '@/types/produzione'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  commessaId: string
  ordine: OrdineCompleto | null
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
}

const oggiISO = () => new Date().toISOString().slice(0, 10)

export default function DialogOrdine({
  open, onOpenChange, commessaId, ordine, fornitori, numeroProposto,
}: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [fornitoreId, setFornitoreId] = useState<string>('')
  const [numero, setNumero] = useState('')
  const [dataOrdine, setDataOrdine] = useState(oggiISO())
  const [consegna, setConsegna] = useState('')
  const [stato, setStato] = useState<StatoOrdine>('da_ordinare')
  const [note, setNote] = useState('')
  const [righe, setRighe] = useState<RigaOrdineInput[]>([])
  const [suggerimenti, setSuggerimenti] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setFornitoreId(ordine?.fornitore_id ?? '')
    setNumero(ordine?.numero_ordine ?? numeroProposto)
    setDataOrdine(ordine?.data_ordine ?? oggiISO())
    setConsegna(ordine?.data_consegna_prevista ?? '')
    setStato(ordine?.stato ?? 'da_ordinare')
    setNote(ordine?.note ?? '')
    setRighe(
      ordine?.righe.map((r) => ({
        descrizione: r.descrizione,
        quantita: r.quantita,
        unita_misura: r.unita_misura,
        prezzo_unitario: r.prezzo_unitario,
        ordine: r.ordine,
      })) ?? [{ descrizione: '', quantita: 1, unita_misura: 'pz', prezzo_unitario: null, ordine: 0 }]
    )
  }, [open, ordine, numeroProposto])

  useEffect(() => {
    if (!fornitoreId) {
      setSuggerimenti([])
      return
    }
    getDescrizioniFornitore(fornitoreId).then(setSuggerimenti).catch(() => setSuggerimenti([]))
  }, [fornitoreId])

  const salva = async () => {
    if (righe.every((r) => r.descrizione.trim() === '')) {
      toast.error('Aggiungi almeno una riga')
      return
    }
    setSaving(true)
    try {
      const input = {
        commessa_id: commessaId,
        fornitore_id: fornitoreId || null,
        numero_ordine: numero.trim(),
        data_ordine: dataOrdine,
        data_consegna_prevista: consegna || null,
        stato,
        note: note.trim() || null,
        righe,
      }
      if (ordine) await updateOrdine(ordine.id, input)
      else await createOrdine(input)
      toast.success(ordine ? 'Ordine aggiornato' : 'Ordine creato')
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ordine ? 'Modifica ordine' : 'Nuovo ordine fornitore'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Fornitore</Label>
            <Select value={fornitoreId} onValueChange={setFornitoreId}>
              <SelectTrigger><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
              <SelectContent>
                {fornitori.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Numero ordine</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data ordine</Label>
            <Input type="date" value={dataOrdine} onChange={(e) => setDataOrdine(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Consegna prevista</Label>
            <Input type="date" value={consegna} onChange={(e) => setConsegna(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Stato</Label>
            <Select value={stato} onValueChange={(v) => setStato(v as StatoOrdine)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATI_ORDINE.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Righe</Label>
          <RigheOrdine righe={righe} suggerimenti={suggerimenti} onChange={setRighe} />
        </div>

        <div className="text-right text-sm font-semibold">
          Totale: {formatEuro(calcolaTotaleOrdine(righe))}
        </div>

        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [x] **Step 4: Verificare che Textarea e sonner esistano**

```bash
ls components/ui/textarea.tsx components/ui/select.tsx components/ui/dialog.tsx components/ui/label.tsx
grep -rn "from 'sonner'" --include=*.tsx components | head -3
```

Textarea non è installata di default da shadcn. Se manca: `npx shadcn@latest add textarea`. Se il progetto non usa `sonner`, usare lo stesso import toast degli altri dialog (verificare in `components/commesse/DialogAcconto.tsx`).

- [x] **Step 5: Pagina dettaglio**

Create `components/produzione/ProduzioneCommessa.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DialogOrdine from './DialogOrdine'
import { formatEuro } from '@/lib/pricing'
import { deleteOrdine, setStatoOrdine } from '@/actions/produzione'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, StatoOrdine } from '@/types/produzione'
import type { StatoCommessa } from '@/types/commessa'

interface Props {
  commessa: { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa }
  ordini: OrdineCompleto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
}

export default function ProduzioneCommessa({ commessa, ordini, fornitori, numeroProposto }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inModifica, setInModifica] = useState<OrdineCompleto | null>(null)

  const cambiaStato = async (id: string, stato: StatoOrdine) => {
    try {
      await setStatoOrdine(id, stato)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  const elimina = async (id: string) => {
    if (!confirm('Eliminare questo ordine?')) return
    try {
      await deleteOrdine(id)
      toast.success('Ordine eliminato')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/produzione">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Produzione
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {commessa.numero_commessa || 'Commessa'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{commessa.cliente_nome}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ordini fornitore</h2>
          <Button size="sm" className="gap-2" onClick={() => { setInModifica(null); setOpen(true) }}>
            <Plus className="h-4 w-4" /> Nuovo ordine
          </Button>
        </div>

        {ordini.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessun ordine per questa commessa.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="p-2 font-medium">Numero</th>
                  <th className="p-2 font-medium">Fornitore</th>
                  <th className="p-2 font-medium">Consegna</th>
                  <th className="p-2 font-medium">Stato</th>
                  <th className="p-2 font-medium text-right">Totale</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => (
                  <tr key={o.id} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="p-2">{o.numero_ordine || '—'}</td>
                    <td className="p-2">{o.fornitore_nome ?? '—'}</td>
                    <td className="p-2">
                      <span className={o.in_ritardo ? 'text-red-600 font-medium inline-flex items-center gap-1' : ''}>
                        {o.in_ritardo && <AlertTriangle className="h-3.5 w-3.5" />}
                        {o.data_consegna_prevista ?? '—'}
                      </span>
                    </td>
                    <td className="p-2">
                      <Select value={o.stato} onValueChange={(v) => cambiaStato(o.id, v as StatoOrdine)}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATI_ORDINE.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-right">{formatEuro(o.totale)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => { setInModifica(o); setOpen(true) }} aria-label="Modifica">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600"
                        onClick={() => elimina(o.id)} aria-label="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DialogOrdine
        open={open}
        onOpenChange={setOpen}
        commessaId={commessa.id}
        ordine={inModifica}
        fornitori={fornitori}
        numeroProposto={numeroProposto}
      />
    </div>
  )
}
```

- [x] **Step 6: Rotta dettaglio**

Create `app/(dashboard)/produzione/[commessaId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'
import {
  getCommessaProduzione, getOrdiniCommessa, getFornitoriPerOrdine, getProssimoNumeroOrdine,
} from '@/actions/produzione'
import ProduzioneCommessa from '@/components/produzione/ProduzioneCommessa'

export const dynamic = 'force-dynamic'

export default async function ProduzioneCommessaPage({
  params,
}: {
  params: Promise<{ commessaId: string }>
}) {
  await requireAccesso('produzione')
  const { commessaId } = await params

  const commessa = await getCommessaProduzione(commessaId)
  if (!commessa) notFound()

  const [ordini, fornitori, numeroProposto] = await Promise.all([
    getOrdiniCommessa(commessaId),
    getFornitoriPerOrdine(),
    getProssimoNumeroOrdine(),
  ])

  return (
    <ProduzioneCommessa
      commessa={commessa}
      ordini={ordini}
      fornitori={fornitori}
      numeroProposto={numeroProposto}
    />
  )
}
```

- [x] **Step 7: Verificare**

```bash
npx tsc --noEmit
npx eslint "app/(dashboard)/produzione" components/produzione
npm test
```

Atteso: tutto pulito, 18 test verdi.

- [ ] **Step 8: Prova manuale**

Avviare `npm run dev`, aprire `/produzione/<id di una commessa reale>`, creare un ordine con due righe, verificare che il totale a schermo corrisponda e che dopo il salvataggio l'ordine compaia in tabella.

- [x] **Step 9: Commit**

```bash
git add components/produzione "app/(dashboard)/produzione"
git commit -m "feat: produzione - dettaglio commessa e dialog ordine fornitore"
```

---

### Task 5: Cruscotto

**Files:**
- Create: `components/produzione/CruscottoProduzione.tsx`
- Modify: `app/(dashboard)/produzione/page.tsx` (sostituisce il placeholder)

**Interfaces:**
- Consumes: `getCruscottoProduzione(stati?)` Task 3, tipi Task 1.
- Produces: `/produzione` funzionante.

- [ ] **Step 1: Componente cruscotto**

Create `components/produzione/CruscottoProduzione.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Factory, AlertTriangle, FileText, Package } from 'lucide-react'
import { formatEuro } from '@/lib/pricing'
import { STATI_COMMESSA_APERTI } from '@/types/produzione'
import type { OrdineConCommessa, CommessaProduzione } from '@/types/produzione'

interface Props {
  daFare: OrdineConCommessa[]
  commesse: CommessaProduzione[]
  statoFiltro: string
}

const OPZIONI_FILTRO = [
  { value: 'aperte', label: 'Aperte' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'da_iniziare', label: 'Da iniziare' },
  { value: 'tutte', label: 'Tutte' },
]

export default function CruscottoProduzione({ daFare, commesse, statoFiltro }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const cambiaFiltro = (valore: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('stato', valore)
    router.push(`/produzione?${params.toString()}`)
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Produzione</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Documenti, file e ordini fornitori delle commesse
          </p>
        </div>
      </div>

      {daFare.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Da fare</h2>
          <div className="space-y-1.5">
            {daFare.map((o) => (
              <Link
                key={o.id}
                href={`/produzione/${o.commessa_id}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {o.in_ritardo ? (
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                ) : (
                  <Package className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                    {o.fornitore_nome ?? 'Fornitore non indicato'} — {o.numero_commessa || 'commessa'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {o.cliente_nome}
                    {o.in_ritardo && o.data_consegna_prevista
                      ? ` · in ritardo dal ${o.data_consegna_prevista}`
                      : ' · da ordinare'}
                  </p>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
                  {formatEuro(o.totale)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Commesse</h2>
          <div className="flex gap-1">
            {OPZIONI_FILTRO.map((o) => (
              <button
                key={o.value}
                onClick={() => cambiaFiltro(o.value)}
                className={
                  statoFiltro === o.value
                    ? 'rounded-md px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                    : 'rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {commesse.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessuna commessa con questo filtro.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {commesse.map((c) => (
              <Link
                key={c.id}
                href={`/produzione/${c.id}`}
                className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                  {c.numero_commessa || 'Senza numero'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.cliente_nome}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> {c.ordini_aperti}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {c.documenti}
                  </span>
                  {c.ordini_in_ritardo > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> {c.ordini_in_ritardo}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export { STATI_COMMESSA_APERTI }
```

- [ ] **Step 2: Pagina cruscotto**

Modify `app/(dashboard)/produzione/page.tsx` — sostituire **tutto** il contenuto del placeholder:

```tsx
import { requireAccesso } from '@/lib/permessi'
import { getCruscottoProduzione } from '@/actions/produzione'
import CruscottoProduzione from '@/components/produzione/CruscottoProduzione'
import { STATI_COMMESSA_APERTI } from '@/types/produzione'
import type { StatoCommessa } from '@/types/commessa'

export const dynamic = 'force-dynamic'

const TUTTI_GLI_STATI: StatoCommessa[] = [
  'in_attesa', 'da_iniziare', 'in_lavorazione', 'da_consegnare',
  'consegnato', 'parzialmente_consegnato', 'concluso', 'bloccato', 'annullato',
]

function statiDaFiltro(filtro: string): StatoCommessa[] {
  if (filtro === 'tutte') return TUTTI_GLI_STATI
  if (filtro === 'in_lavorazione') return ['in_lavorazione']
  if (filtro === 'da_iniziare') return ['da_iniziare']
  return STATI_COMMESSA_APERTI
}

export default async function ProduzionePage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>
}) {
  await requireAccesso('produzione')
  const { stato } = await searchParams
  const filtro = stato ?? 'aperte'

  const { daFare, commesse } = await getCruscottoProduzione(statiDaFiltro(filtro))

  return <CruscottoProduzione daFare={daFare} commesse={commesse} statoFiltro={filtro} />
}
```

- [ ] **Step 3: Verificare**

```bash
npx tsc --noEmit
npx eslint "app/(dashboard)/produzione" components/produzione
```

Se eslint segnala `STATI_COMMESSA_APERTI` re-esportato ma inutilizzato in `CruscottoProduzione.tsx`, rimuovere sia l'import sia la riga `export { STATI_COMMESSA_APERTI }` da quel file: la pagina lo importa già da `@/types/produzione`.

- [ ] **Step 4: Prova manuale**

`npm run dev` → `/produzione`. Verificare: il filtro cambia l'elenco, "Aperte" mostra 32 commesse, "Tutte" 101, e che i contatori sulle card siano coerenti con gli ordini creati nel Task 4.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/produzione/page.tsx" components/produzione/CruscottoProduzione.tsx
git commit -m "feat: produzione - cruscotto con da fare e filtro stato commesse"
```

---

### Task 6: Documenti di produzione

**Files:**
- Create: `components/produzione/DocumentiProduzione.tsx`
- Create: `actions/produzione-documenti.ts`
- Modify: `components/produzione/ProduzioneCommessa.tsx` (aggiungere la sezione documenti)
- Modify: `app/(dashboard)/produzione/[commessaId]/page.tsx` (caricare i documenti)

**Interfaces:**
- Consumes: `documenti_commessa`, bucket `commesse-docs`, `TIPI_DOCUMENTO_PRODUZIONE` Task 1.
- Produces: `getDocumentiProduzione(commessaId)`, `uploadDocumentoProduzione(formData)`, `deleteDocumentoProduzione(id, storagePath)`, `getDocumentoSignedUrl(storagePath)`.

- [ ] **Step 1: Action documenti**

Create `actions/produzione-documenti.ts`. Ricalca `uploadDocumentoCommessa` in `actions/commesse.ts:243-283` — stesso bucket, stesso schema path, stesso limite:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { TIPI_DOCUMENTO_PRODUZIONE_VALUES } from '@/types/produzione'
import type { DocumentoCommessa } from '@/types/commessa'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export async function getDocumentiProduzione(commessaId: string): Promise<DocumentoCommessa[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('documenti_commessa')
    .select('*')
    .eq('organization_id', orgId)
    .eq('commessa_id', commessaId)
    .in('tipo_documento', TIPI_DOCUMENTO_PRODUZIONE_VALUES)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function uploadDocumentoProduzione(formData: FormData): Promise<{ error?: string }> {
  const file = formData.get('file') as File | null
  const commessaId = formData.get('commessaId') as string
  const tipo = formData.get('tipo') as string

  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (file.size > 20 * 1024 * 1024) return { error: 'File troppo grande (max 20 MB)' }
  if (!TIPI_DOCUMENTO_PRODUZIONE_VALUES.includes(tipo)) return { error: 'Tipo documento non valido' }

  const orgId = await getOrgId()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const storagePath = `${orgId}/${commessaId}/${Date.now()}.${ext}`
  const contentType =
    file.type && file.type !== 'application/octet-stream'
      ? file.type
      : (MIME_BY_EXT[ext] ?? 'application/pdf')

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, file, { contentType })
  if (uploadError) return { error: uploadError.message }

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('documenti_commessa').insert({
    commessa_id: commessaId,
    organization_id: orgId,
    nome_file: file.name,
    storage_path: storagePath,
    tipo_documento: tipo,
  })
  if (dbError) {
    await service.storage.from('commesse-docs').remove([storagePath])
    return { error: dbError.message }
  }

  revalidatePath('/produzione', 'layout')
  return {}
}

export async function getDocumentoSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from('commesse-docs').createSignedUrl(storagePath, 3600)
  return data?.signedUrl ?? null
}

export async function deleteDocumentoProduzione(id: string, storagePath: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  await supabase.storage.from('commesse-docs').remove([storagePath])
  const { error } = await supabase
    .from('documenti_commessa')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}
```

- [ ] **Step 2: Componente documenti**

Create `components/produzione/DocumentiProduzione.tsx`. L'input file è nascosto e attivato da una `<label htmlFor>`: è ciò che fa funzionare l'upload da iOS/Android dentro un Dialog.

```tsx
'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  uploadDocumentoProduzione, deleteDocumentoProduzione, getDocumentoSignedUrl,
} from '@/actions/produzione-documenti'
import { TIPI_DOCUMENTO_PRODUZIONE } from '@/types/produzione'
import type { DocumentoCommessa } from '@/types/commessa'

interface Props {
  commessaId: string
  documenti: DocumentoCommessa[]
}

const labelTipo = (v: string) => TIPI_DOCUMENTO_PRODUZIONE.find((t) => t.value === v)?.label ?? v

export default function DocumentiProduzione({ commessaId, documenti }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState('disegno')
  const [caricamento, setCaricamento] = useState(false)

  const carica = async (file: File) => {
    setCaricamento(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('commessaId', commessaId)
      formData.append('tipo', tipo)
      const { error } = await uploadDocumentoProduzione(formData)
      if (error) toast.error(error)
      else {
        toast.success('Documento caricato')
        router.refresh()
      }
    } finally {
      setCaricamento(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const apri = async (storagePath: string) => {
    const url = await getDocumentoSignedUrl(storagePath)
    if (url) window.open(url, '_blank')
    else toast.error('Impossibile aprire il file')
  }

  const elimina = async (id: string, storagePath: string) => {
    if (!confirm('Eliminare questo documento?')) return
    try {
      await deleteDocumentoProduzione(id, storagePath)
      toast.success('Documento eliminato')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Documenti di produzione
        </h2>
        <div className="flex items-center gap-2">
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPI_DOCUMENTO_PRODUZIONE.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            ref={inputRef}
            id="upload-produzione"
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) carica(file)
            }}
          />
          <Button asChild size="sm" variant="outline" disabled={caricamento}>
            <label htmlFor="upload-produzione" className="cursor-pointer gap-2">
              <Upload className="h-4 w-4" />
              {caricamento ? 'Caricamento...' : 'Carica'}
            </label>
          </Button>
        </div>
      </div>

      {documenti.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
          Nessun documento di produzione.
        </p>
      ) : (
        <div className="space-y-1.5">
          {documenti.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2.5"
            >
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <button
                onClick={() => apri(d.storage_path)}
                className="min-w-0 flex-1 text-left text-sm text-blue-700 dark:text-blue-400 hover:underline truncate"
              >
                {d.nome_file}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {labelTipo(d.tipo_documento)}
              </span>
              <Button
                variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 shrink-0"
                onClick={() => elimina(d.id, d.storage_path)} aria-label="Elimina"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Agganciare al dettaglio**

Modify `components/produzione/ProduzioneCommessa.tsx`:

Aggiungere l'import in cima, dopo `import DialogOrdine from './DialogOrdine'`:

```tsx
import DocumentiProduzione from './DocumentiProduzione'
import type { DocumentoCommessa } from '@/types/commessa'
```

Aggiungere a `Props`, dopo `numeroProposto: string`:

```tsx
  documenti: DocumentoCommessa[]
```

Aggiungere `documenti` ai parametri destrutturati della funzione, e inserire il componente subito prima di `<DialogOrdine`:

```tsx
      <DocumentiProduzione commessaId={commessa.id} documenti={documenti} />
```

Modify `app/(dashboard)/produzione/[commessaId]/page.tsx`: aggiungere l'import

```tsx
import { getDocumentiProduzione } from '@/actions/produzione-documenti'
```

estendere il `Promise.all` a quattro elementi e passare la prop:

```tsx
  const [ordini, fornitori, numeroProposto, documenti] = await Promise.all([
    getOrdiniCommessa(commessaId),
    getFornitoriPerOrdine(),
    getProssimoNumeroOrdine(),
    getDocumentiProduzione(commessaId),
  ])
```

```tsx
      documenti={documenti}
```

- [ ] **Step 4: Verificare**

```bash
npx tsc --noEmit
npx eslint "app/(dashboard)/produzione" components/produzione actions/produzione-documenti.ts
```

- [ ] **Step 5: Prova manuale, anche da telefono**

Caricare un PDF e una foto come `disegno`. Verificare che si aprano cliccando il nome e che **non** compaiano nel dialog Documenti di Commesse (che mostra solo i tipi amministrativi). Provare il caricamento da telefono: è il caso che si è già rotto in passato.

- [ ] **Step 6: Commit**

```bash
git add actions/produzione-documenti.ts components/produzione "app/(dashboard)/produzione"
git commit -m "feat: produzione - documenti di produzione per commessa"
```

---

### Task 7: PDF ordine

**Files:**
- Create: `components/produzione/OrdinePDF.tsx`
- Create: `actions/produzione-pdf.ts`
- Modify: `components/produzione/ProduzioneCommessa.tsx` (pulsante PDF)

**Interfaces:**
- Consumes: `@react-pdf/renderer`, `OrdineCompleto` Task 1, `formatEuro`.
- Produces: `<OrdinePDF ordine settings fornitore />`, `salvaPdfOrdine(ordineId, commessaId, base64, nomeFile)`.

- [ ] **Step 1: Documento PDF**

L'intestazione arriva da `getSettings()` in `@/actions/impostazioni`, che ritorna
`Settings | null`. I campi utili sono `denominazione`, `indirizzo`, `piva` — si chiama
`piva`, non `partita_iva`, e sono **tutti `string | null`**: vanno gestiti con fallback,
altrimenti il PDF stampa "null".

Create `components/produzione/OrdinePDF.tsx`:

```tsx
'use client'

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatEuro } from '@/lib/pricing'
import type { OrdineCompleto } from '@/types/produzione'

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  titolo: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  riga: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 4 },
  intestazioneTabella: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  colDesc: { flex: 5 },
  colQta: { flex: 1, textAlign: 'right' },
  colUm: { flex: 1, textAlign: 'center' },
  colPrezzo: { flex: 1.5, textAlign: 'right' },
  colTot: { flex: 1.5, textAlign: 'right' },
  blocco: { marginBottom: 12 },
  grassetto: { fontFamily: 'Helvetica-Bold' },
  totale: { marginTop: 10, textAlign: 'right', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 16, color: '#444' },
})

export type IntestazionePDF = { denominazione: string; indirizzo: string; piva: string }

interface Props {
  ordine: OrdineCompleto
  intestazione: IntestazionePDF
  fornitoreNome: string
  numeroCommessa: string
  clienteNome: string
}

export default function OrdinePDF({
  ordine, intestazione, fornitoreNome, numeroCommessa, clienteNome,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.blocco}>
          <Text style={styles.grassetto}>{intestazione.denominazione}</Text>
          {intestazione.indirizzo ? <Text>{intestazione.indirizzo}</Text> : null}
          {intestazione.piva ? <Text>P.IVA {intestazione.piva}</Text> : null}
        </View>

        <Text style={styles.titolo}>Ordine fornitore {ordine.numero_ordine}</Text>

        <View style={styles.blocco}>
          <Text><Text style={styles.grassetto}>Fornitore: </Text>{fornitoreNome}</Text>
          <Text><Text style={styles.grassetto}>Data ordine: </Text>{ordine.data_ordine}</Text>
          {ordine.data_consegna_prevista ? (
            <Text><Text style={styles.grassetto}>Consegna prevista: </Text>{ordine.data_consegna_prevista}</Text>
          ) : null}
          <Text><Text style={styles.grassetto}>Commessa: </Text>{numeroCommessa} — {clienteNome}</Text>
        </View>

        <View style={styles.intestazioneTabella}>
          <Text style={styles.colDesc}>Descrizione</Text>
          <Text style={styles.colQta}>Q.tà</Text>
          <Text style={styles.colUm}>U.M.</Text>
          <Text style={styles.colPrezzo}>Prezzo</Text>
          <Text style={styles.colTot}>Totale</Text>
        </View>

        {ordine.righe.map((r) => (
          <View key={r.id} style={styles.riga}>
            <Text style={styles.colDesc}>{r.descrizione}</Text>
            <Text style={styles.colQta}>{r.quantita}</Text>
            <Text style={styles.colUm}>{r.unita_misura}</Text>
            <Text style={styles.colPrezzo}>
              {r.prezzo_unitario === null ? '—' : formatEuro(r.prezzo_unitario)}
            </Text>
            <Text style={styles.colTot}>
              {r.prezzo_unitario === null ? '—' : formatEuro(r.quantita * r.prezzo_unitario)}
            </Text>
          </View>
        ))}

        <Text style={styles.totale}>Totale: {formatEuro(ordine.totale)}</Text>

        {ordine.note ? <Text style={styles.note}>{ordine.note}</Text> : null}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Action di salvataggio**

Create `actions/produzione-pdf.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'

/** Carica il PDF generato lato client, lo registra tra i documenti e lo lega all'ordine. */
export async function salvaPdfOrdine(
  ordineId: string,
  commessaId: string,
  pdfBase64: string,
  nomeFile: string
): Promise<{ error?: string }> {
  const orgId = await getOrgId()
  const storagePath = `${orgId}/${commessaId}/${Date.now()}.pdf`
  const buffer = Buffer.from(pdfBase64, 'base64')

  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, buffer, { contentType: 'application/pdf' })
  if (uploadError) return { error: uploadError.message }

  const supabase = await createClient()
  const { error: docError } = await supabase.from('documenti_commessa').insert({
    commessa_id: commessaId,
    organization_id: orgId,
    nome_file: nomeFile,
    storage_path: storagePath,
    tipo_documento: 'ordine_fornitore',
  })
  if (docError) {
    await service.storage.from('commesse-docs').remove([storagePath])
    return { error: docError.message }
  }

  const { error: ordineError } = await supabase
    .from('ordini_fornitore')
    .update({ pdf_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', ordineId)
    .eq('organization_id', orgId)
  if (ordineError) return { error: ordineError.message }

  revalidatePath('/produzione', 'layout')
  return {}
}
```

- [ ] **Step 3: Pulsante PDF nel dettaglio**

Modify `components/produzione/ProduzioneCommessa.tsx`.

Import in cima:

```tsx
import { FileDown } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import OrdinePDF from './OrdinePDF'
import type { IntestazionePDF } from './OrdinePDF'
import { salvaPdfOrdine } from '@/actions/produzione-pdf'
```

Aggiungere a `Props` la riga `intestazione: IntestazionePDF` (importando il tipo da
`./OrdinePDF`), destrutturarla tra i parametri, e aggiungere la funzione dentro il
componente:

```tsx
  const generaPdf = async (o: OrdineCompleto) => {
    try {
      const nomeFile = `Ordine ${o.numero_ordine || o.id.slice(0, 8)}.pdf`
      const blob = await pdf(
        <OrdinePDF
          ordine={o}
          intestazione={intestazione}
          fornitoreNome={o.fornitore_nome ?? 'Fornitore non indicato'}
          numeroCommessa={commessa.numero_commessa}
          clienteNome={commessa.cliente_nome}
        />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomeFile
      a.click()
      URL.revokeObjectURL(url)

      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      const { error } = await salvaPdfOrdine(o.id, commessa.id, base64, nomeFile)
      if (error) toast.error(`PDF scaricato ma non archiviato: ${error}`)
      else {
        toast.success('PDF generato e archiviato')
        router.refresh()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nella generazione del PDF')
    }
  }
```

Aggiungere il pulsante nella colonna azioni, prima di quello Modifica:

```tsx
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => generaPdf(o)} aria-label="PDF">
                        <FileDown className="h-4 w-4" />
                      </Button>
```

Modify `app/(dashboard)/produzione/[commessaId]/page.tsx`. Aggiungere l'import:

```tsx
import { getSettings } from '@/actions/impostazioni'
```

Estendere il `Promise.all` a cinque elementi:

```tsx
  const [ordini, fornitori, numeroProposto, documenti, settings] = await Promise.all([
    getOrdiniCommessa(commessaId),
    getFornitoriPerOrdine(),
    getProssimoNumeroOrdine(),
    getDocumentiProduzione(commessaId),
    getSettings(),
  ])
```

Costruire l'intestazione con i fallback (i campi di `Settings` sono tutti nullable e
`getSettings()` può ritornare `null`):

```tsx
  const intestazione = {
    denominazione: settings?.denominazione ?? 'A.L.M. Infissi',
    indirizzo: settings?.indirizzo ?? '',
    piva: settings?.piva ?? '',
  }
```

e passarla al componente:

```tsx
      intestazione={intestazione}
```

- [ ] **Step 4: Verificare**

```bash
npx tsc --noEmit
npx eslint components/produzione actions/produzione-pdf.ts "app/(dashboard)/produzione"
```

Se `Buffer` non è disponibile nel client component, sostituire la conversione base64 con:

```tsx
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binario = ''
      for (const b of bytes) binario += String.fromCharCode(b)
      const base64 = btoa(binario)
```

- [ ] **Step 5: Prova manuale**

Generare il PDF di un ordine con righe con e senza prezzo. Verificare: il file si scarica, l'intestazione mostra i dati reali dell'azienda, il totale coincide con quello a schermo, e il PDF compare tra i documenti di produzione come "Ordine fornitore".

- [ ] **Step 6: Commit**

```bash
git add components/produzione actions/produzione-pdf.ts "app/(dashboard)/produzione"
git commit -m "feat: produzione - generazione PDF ordine fornitore"
```

---

### Task 8: Invio email al fornitore

**Files:**
- Create: `app/api/produzione/invia-ordine/route.ts`
- Modify: `components/produzione/ProduzioneCommessa.tsx` (pulsante invio)

**Interfaces:**
- Consumes: Resend, `RESEND_API_KEY`, `pdf_path` Task 7.
- Produces: `POST /api/produzione/invia-ordine` con body `{ ordineId: string }`.

- [ ] **Step 1: Verificare il mittente Resend già usato**

```bash
grep -rn "from:" app/api --include=*.ts | head -5
grep -rn "new Resend" app/api actions --include=*.ts | head -3
```

Usare lo **stesso** dominio mittente verificato delle altre mail: un mittente nuovo non verificato fa fallire l'invio.

- [ ] **Step 2: Route di invio**

Create `app/api/produzione/invia-ordine/route.ts`. Sostituire `MITTENTE` con il valore reale trovato allo Step 1:

```typescript
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'

const MITTENTE = 'ordini@<dominio-verificato>'

export async function POST(request: Request) {
  try {
    const { ordineId } = (await request.json()) as { ordineId: string }
    const supabase = await createClient()
    const orgId = await getOrgId()

    const { data: ordine } = await supabase
      .from('ordini_fornitore')
      .select('id, numero_ordine, pdf_path, fornitore_id, commessa_id')
      .eq('id', ordineId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!ordine) return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })
    if (!ordine.pdf_path) {
      return NextResponse.json({ error: 'Genera prima il PDF dell\'ordine' }, { status: 400 })
    }
    if (!ordine.fornitore_id) {
      return NextResponse.json({ error: 'Ordine senza fornitore' }, { status: 400 })
    }

    const { data: fornitore } = await supabase
      .from('fornitori')
      .select('nome, email')
      .eq('id', ordine.fornitore_id)
      .maybeSingle()

    if (!fornitore?.email) {
      return NextResponse.json({ error: 'Il fornitore non ha un indirizzo email' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: file, error: downloadError } = await service.storage
      .from('commesse-docs')
      .download(ordine.pdf_path)
    if (downloadError || !file) {
      return NextResponse.json({ error: 'PDF non recuperabile' }, { status: 500 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: sendError } = await resend.emails.send({
      from: MITTENTE,
      to: fornitore.email,
      subject: `Ordine ${ordine.numero_ordine}`,
      text: `Buongiorno,\n\nin allegato l'ordine ${ordine.numero_ordine}.\n\nCordiali saluti`,
      attachments: [
        {
          filename: `Ordine ${ordine.numero_ordine}.pdf`,
          content: Buffer.from(await file.arrayBuffer()),
        },
      ],
    })
    if (sendError) {
      return NextResponse.json({ error: sendError.message }, { status: 500 })
    }

    await supabase
      .from('ordini_fornitore')
      .update({
        inviato_at: new Date().toISOString(),
        stato: 'ordinato',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ordineId)
      .eq('organization_id', orgId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore invio' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Pulsante invio**

Modify `components/produzione/ProduzioneCommessa.tsx`.

Import: aggiungere `Mail` a quelli da `lucide-react`.

Funzione dentro il componente:

```tsx
  const inviaEmail = async (o: OrdineCompleto) => {
    if (!confirm('Inviare l\'ordine via email al fornitore?')) return
    try {
      const res = await fetch('/api/produzione/invia-ordine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordineId: o.id }),
      })
      const dati = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) toast.error(dati.error ?? 'Errore invio')
      else {
        toast.success('Ordine inviato al fornitore')
        router.refresh()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore invio')
    }
  }
```

Il pulsante compare solo se il fornitore ha l'email e il PDF esiste — aggiungerlo dopo quello PDF. Serve la mappa delle email: aggiungere in cima al componente

```tsx
  const emailFornitore = new Map(fornitori.map((f) => [f.id, f.email]))
```

e poi nella colonna azioni:

```tsx
                      {o.fornitore_id && emailFornitore.get(o.fornitore_id) && o.pdf_path ? (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => inviaEmail(o)} aria-label="Invia email">
                          <Mail className="h-4 w-4" />
                        </Button>
                      ) : null}
```

- [ ] **Step 4: Verificare**

```bash
npx tsc --noEmit
npx eslint components/produzione "app/api/produzione"
npm test
```

- [ ] **Step 5: Prova**

L'invio va provato **in produzione** dopo il deploy: in locale serve `RESEND_API_KEY` valida. Verificare che il pulsante compaia solo sugli ordini con fornitore dotato di email (7 su 16) e PDF già generato, e che dopo l'invio lo stato diventi "Ordinato" con `inviato_at` valorizzato.

- [ ] **Step 6: Commit**

```bash
git add "app/api/produzione" components/produzione
git commit -m "feat: produzione - invio ordine al fornitore via email"
```

---

## Chiusura

- [ ] `npm test` verde, `npx tsc --noEmit` pulito, `npm run lint` pulito
- [ ] `npm run build` completo (con `RESEND_API_KEY` fittizia se serve)
- [ ] Aggiornare `MEMORY.md` e il PRD con la sezione Produzione
- [ ] Usare `superpowers:finishing-a-development-branch` per decidere merge o PR
