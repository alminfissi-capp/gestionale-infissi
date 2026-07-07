# Modulo Dipendenti (buste paga e pagamenti) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nuovo modulo sidebar "Dipendenti": anagrafica dipendenti, upload buste paga e contabili bonifico con estrazione automatica AI, conti mese per mese (dovuto/pagato/residuo) per dipendente.

**Architecture:** Spec approvata in `docs/superpowers/specs/2026-07-07-modulo-dipendenti-buste-paga-design.md`. Tre tabelle Supabase con RLS (`dipendenti`, `buste_paga`, `pagamenti_dipendente`) + bucket privato `dipendenti-docs`. Logica conti pura in `lib/dipendenti.ts`. Estrazione: testo PDF lato client via pdfjs-dist (pattern `lib/parsers/parsePDFListino.ts`) → route API che chiama Gemini via OpenRouter con `generateObject` → schermata di revisione → conferma manuale → server actions salvano record + file.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + Storage), `ai` v4 `generateObject` + `@ai-sdk/openai` (OpenRouter, env `WINSTUDIO`), pdfjs-dist, shadcn/ui, zod v4.

## Global Constraints

- Next.js 16: `params`/`searchParams` sono `Promise` → sempre `await params`.
- Nessun test runner nel repo: i gate di verifica sono `npm run lint` (zero warning unused vars) e `npm run build` (build locale richiede `RESEND_API_KEY` anche fittizia in `.env.local` — è già così, non toccare).
- Ogni tabella ha `organization_id`; RLS con `get_user_organization_id()`; le server actions usano `createClient()` da `@/lib/supabase/server` + `getOrgId()` da `@/lib/auth`.
- Dati sensibili: OGNI server action del modulo verifica il permesso `'dipendenti'` lato server (helper `assertAccessoDipendenti` in Task 4) — non basta nascondere la voce sidebar.
- UI in italiano; valute con `formatEuro` da `@/lib/pricing`; toast con `sonner`; `useRouter().refresh()` dopo mutazioni.
- shadcn/ui: usare solo componenti già presenti (`Button`, `Input`, `Label`, `Dialog`, `Select`, `Checkbox` se esiste — altrimenti input type="checkbox"). NON usare `Textarea` (non installata).
- Modello AI: `google/gemini-2.5-flash-preview-05-20` via OpenRouter (`baseURL: 'https://openrouter.ai/api/v1'`, `apiKey: process.env.WINSTUDIO`) — stesso di `app/api/assistant/route.ts`.
- Migration: file in `supabase/migrations/` E applicata al progetto remoto `xawyrtqclpeylxnhwhwo` via MCP Supabase `apply_migration`.
- Commit frequenti, messaggi in italiano stile repo (`feat: dipendenti - ...`), footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migration DB + bucket

**Files:**
- Create: `supabase/migrations/20260707220000_dipendenti.sql`

**Interfaces:**
- Produces: tabelle `dipendenti`, `buste_paga`, `pagamenti_dipendente`; bucket `dipendenti-docs`; constraint `user_permissions_modulo_check` aggiornato con `'dipendenti'`.

- [ ] **Step 1: Scrivi la migration**

```sql
-- ============================================================
-- 20260707220000_dipendenti.sql
-- Modulo Dipendenti: anagrafica, buste paga, pagamenti + bucket
-- ============================================================

CREATE TABLE dipendenti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  codice_fiscale TEXT,
  iban TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE buste_paga (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  dipendente_id UUID NOT NULL REFERENCES dipendenti(id) ON DELETE CASCADE,
  periodo DATE NOT NULL,
  mensilita TEXT NOT NULL DEFAULT 'mensile'
    CHECK (mensilita IN ('mensile', 'tredicesima', 'quattordicesima', 'altro')),
  netto NUMERIC(10,2) NOT NULL,
  lordo NUMERIC(10,2),
  file_path TEXT,
  pagina INT,
  dati_estratti JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pagamenti_dipendente (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  dipendente_id UUID NOT NULL REFERENCES dipendenti(id) ON DELETE CASCADE,
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  importo NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  metodo TEXT NOT NULL DEFAULT 'bonifico'
    CHECK (metodo IN ('bonifico', 'contanti', 'altro')),
  periodo_competenza DATE NOT NULL,
  mensilita TEXT NOT NULL DEFAULT 'mensile'
    CHECK (mensilita IN ('mensile', 'tredicesima', 'quattordicesima', 'altro')),
  file_path TEXT,
  dati_estratti JSONB,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_buste_paga_dipendente ON buste_paga(dipendente_id, periodo);
CREATE INDEX idx_pagamenti_dipendente ON pagamenti_dipendente(dipendente_id, periodo_competenza);

ALTER TABLE dipendenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE buste_paga ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamenti_dipendente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dipendenti_select" ON dipendenti FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "dipendenti_insert" ON dipendenti FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "dipendenti_update" ON dipendenti FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "dipendenti_delete" ON dipendenti FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "buste_paga_select" ON buste_paga FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "buste_paga_insert" ON buste_paga FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "buste_paga_update" ON buste_paga FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "buste_paga_delete" ON buste_paga FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "pagamenti_dipendente_select" ON pagamenti_dipendente FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "pagamenti_dipendente_insert" ON pagamenti_dipendente FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "pagamenti_dipendente_update" ON pagamenti_dipendente FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "pagamenti_dipendente_delete" ON pagamenti_dipendente FOR DELETE USING (organization_id = get_user_organization_id());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dipendenti-docs',
  'dipendenti-docs',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dipendenti_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'dipendenti-docs' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "dipendenti_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dipendenti-docs' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "dipendenti_docs_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'dipendenti-docs' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

-- Aggiunge 'dipendenti' al check constraint di user_permissions
ALTER TABLE user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;

ALTER TABLE user_permissions
  ADD CONSTRAINT user_permissions_modulo_check
    CHECK (modulo IN (
      'preventivi','clienti','listini','cataloghi','rilievo','winconfig','magazzino','commesse','dipendenti','impostazioni'
    ));
```

- [ ] **Step 2: Applica al progetto remoto**

Usa MCP `mcp__claude_ai_Supabase__apply_migration` (project `xawyrtqclpeylxnhwhwo`, name `dipendenti`, query = contenuto del file). Se il tool MCP non è disponibile, fermati e chiedi all'utente di applicarla dal dashboard Supabase.

- [ ] **Step 3: Verifica**

Con `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('dipendenti','buste_paga','pagamenti_dipendente');
SELECT id, allowed_mime_types FROM storage.buckets WHERE id = 'dipendenti-docs';
```
Atteso: 3 righe tabelle + 1 riga bucket con `{application/pdf}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260707220000_dipendenti.sql
git commit -m "feat: dipendenti - migration tabelle, RLS, bucket dipendenti-docs"
```

---

### Task 2: Permessi + voce sidebar

**Files:**
- Modify: `types/permessi.ts`
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: modulo `'dipendenti'` in `MODULI_APP` (tipo `ModuloApp` lo include automaticamente); voce nav `/dipendenti`.

- [ ] **Step 1: Aggiungi il modulo in `types/permessi.ts`**

In `MODULI_APP` aggiungi `'dipendenti',` dopo `'commesse',`. In `MODULO_LABELS` aggiungi `dipendenti: 'Dipendenti',` dopo `commesse`. In `PERMESSI_ADMIN` aggiungi `dipendenti: 'scrittura',`. In `PERMESSI_VUOTI` aggiungi `dipendenti: 'nessuno',`. (Quattro edit, stesso posizionamento: tra `commesse` e `impostazioni`.)

- [ ] **Step 2: Aggiungi la voce sidebar**

In `components/layout/Sidebar.tsx`: aggiungi `IdCard,` all'import da `lucide-react` (dopo `Briefcase,`), e in `NAV_ITEMS` dopo la riga Commesse:

```typescript
  { href: '/dipendenti',          label: 'Dipendenti',          icon: IdCard,          modulo: 'dipendenti' },
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Atteso: zero errori/warning. (La voce punta a una pagina che esiste da Task 6 — accettabile in sviluppo.)

- [ ] **Step 4: Commit**

```bash
git add types/permessi.ts components/layout/Sidebar.tsx
git commit -m "feat: dipendenti - modulo permessi e voce sidebar"
```

---

### Task 3: Tipi + logica conti pura

**Files:**
- Create: `types/dipendente.ts`
- Create: `lib/dipendenti.ts`

**Interfaces:**
- Consumes: niente (tipi e funzioni pure, zero Supabase/React).
- Produces (usati da Task 4-8): tutti i tipi di `types/dipendente.ts`; da `lib/dipendenti.ts`: `MENSILITA_LABELS: Record<Mensilita, string>`, `RigaMensilita`, `calcolaRigheMensilita(buste: BustaPaga[], pagamenti: PagamentoDipendente[]): RigaMensilita[]`, `SaldoDipendente`, `calcolaSaldoDipendente(buste, pagamenti): SaldoDipendente`, `DipendenteConSaldo`, `formatPeriodo(periodo: string): string`, `matchDipendente(...)`, `matchBeneficiario(...)`.

- [ ] **Step 1: Crea `types/dipendente.ts`**

```typescript
export type Mensilita = 'mensile' | 'tredicesima' | 'quattordicesima' | 'altro'
export type MetodoPagamentoDipendente = 'bonifico' | 'contanti' | 'altro'

export interface Dipendente {
  id: string
  organization_id: string
  nome: string
  cognome: string
  codice_fiscale: string | null
  iban: string | null
  attivo: boolean
  note: string | null
  created_at: string
}

export interface DipendenteInput {
  nome: string
  cognome: string
  codice_fiscale: string | null
  iban: string | null
  attivo: boolean
  note: string | null
}

export interface BustaPaga {
  id: string
  organization_id: string
  dipendente_id: string
  periodo: string // 'YYYY-MM-01'
  mensilita: Mensilita
  netto: number
  lordo: number | null
  file_path: string | null
  pagina: number | null
  dati_estratti: Record<string, unknown> | null
  created_at: string
}

export interface BustaPagaInput {
  dipendente_id: string
  periodo: string // 'YYYY-MM-01'
  mensilita: Mensilita
  netto: number
  lordo: number | null
  pagina: number | null
  dati_estratti?: Record<string, unknown> | null
}

export interface PagamentoDipendente {
  id: string
  organization_id: string
  dipendente_id: string
  data_pagamento: string // 'YYYY-MM-DD'
  importo: number
  metodo: MetodoPagamentoDipendente
  periodo_competenza: string // 'YYYY-MM-01'
  mensilita: Mensilita
  file_path: string | null
  dati_estratti: Record<string, unknown> | null
  note: string | null
  created_at: string
}

export interface PagamentoInput {
  dipendente_id: string
  data_pagamento: string
  importo: number
  metodo: MetodoPagamentoDipendente
  periodo_competenza: string // 'YYYY-MM-01'
  mensilita: Mensilita
  note: string | null
  dati_estratti?: Record<string, unknown> | null
}

export interface DipendenteCompleto {
  dipendente: Dipendente
  buste: BustaPaga[]
  pagamenti: PagamentoDipendente[]
}

/** Risultato estrazione AI di una busta paga (route /api/estrai-documenti) */
export interface BustaEstratta {
  nome: string
  cognome: string
  codice_fiscale: string | null
  periodo: string // 'YYYY-MM'
  mensilita: Mensilita
  netto: number
  lordo: number | null
  pagina: number
}

/** Risultato estrazione AI di una contabile bonifico */
export interface BonificoEstratto {
  beneficiario: string | null
  iban_beneficiario: string | null
  data_pagamento: string | null // 'YYYY-MM-DD'
  importo: number | null
  causale: string | null
  periodo_competenza: string | null // 'YYYY-MM'
  mensilita: Mensilita
}
```

- [ ] **Step 2: Crea `lib/dipendenti.ts`**

```typescript
import type {
  BustaPaga,
  Dipendente,
  Mensilita,
  PagamentoDipendente,
} from '@/types/dipendente'

export const MENSILITA_LABELS: Record<Mensilita, string> = {
  mensile: 'Mensile',
  tredicesima: 'Tredicesima',
  quattordicesima: 'Quattordicesima',
  altro: 'Altro',
}

const ORDINE_MENSILITA: Record<Mensilita, number> = {
  mensile: 0,
  tredicesima: 1,
  quattordicesima: 2,
  altro: 3,
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

export interface RigaMensilita {
  periodo: string // 'YYYY-MM-01'
  mensilita: Mensilita
  busta: BustaPaga | null
  pagamenti: PagamentoDipendente[]
  dovuto: number
  pagato: number
  residuo: number
}

/**
 * Raggruppa buste e pagamenti per (mese, mensilità) e calcola i residui.
 * Righe ordinate dal mese più recente; include anche mesi con soli
 * pagamenti (busta non ancora caricata → dovuto 0, residuo negativo).
 */
export function calcolaRigheMensilita(
  buste: BustaPaga[],
  pagamenti: PagamentoDipendente[],
): RigaMensilita[] {
  const mappa = new Map<string, RigaMensilita>()
  const getRiga = (periodo: string, mensilita: Mensilita): RigaMensilita => {
    const mese = periodo.slice(0, 7)
    const key = `${mese}|${mensilita}`
    let riga = mappa.get(key)
    if (!riga) {
      riga = { periodo: `${mese}-01`, mensilita, busta: null, pagamenti: [], dovuto: 0, pagato: 0, residuo: 0 }
      mappa.set(key, riga)
    }
    return riga
  }

  for (const b of buste) {
    const riga = getRiga(b.periodo, b.mensilita)
    riga.busta = b
    riga.dovuto += Number(b.netto)
  }
  for (const p of pagamenti) {
    const riga = getRiga(p.periodo_competenza, p.mensilita)
    riga.pagamenti.push(p)
    riga.pagato += Number(p.importo)
  }

  const righe = [...mappa.values()]
  for (const r of righe) {
    r.dovuto = arrotonda(r.dovuto)
    r.pagato = arrotonda(r.pagato)
    r.residuo = arrotonda(r.dovuto - r.pagato)
    r.pagamenti.sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento))
  }
  righe.sort(
    (a, b) =>
      b.periodo.localeCompare(a.periodo) ||
      ORDINE_MENSILITA[a.mensilita] - ORDINE_MENSILITA[b.mensilita],
  )
  return righe
}

export interface SaldoDipendente {
  dovuto: number
  pagato: number
  residuo: number
  mesi_aperti: number
}

export type DipendenteConSaldo = Dipendente & SaldoDipendente

export function calcolaSaldoDipendente(
  buste: BustaPaga[],
  pagamenti: PagamentoDipendente[],
): SaldoDipendente {
  const righe = calcolaRigheMensilita(buste, pagamenti)
  const dovuto = arrotonda(righe.reduce((s, r) => s + r.dovuto, 0))
  const pagato = arrotonda(righe.reduce((s, r) => s + r.pagato, 0))
  return {
    dovuto,
    pagato,
    residuo: arrotonda(dovuto - pagato),
    mesi_aperti: righe.filter((r) => r.residuo > 0).length,
  }
}

/** '2026-06-01' → 'giugno 2026' (capitalizzato dal chiamante se serve) */
export function formatPeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

const norm = (s: string) => s.replace(/\s/g, '').toUpperCase()

/** Matching busta → dipendente: prima per CF, poi per nome+cognome esatti. */
export function matchDipendente(
  dipendenti: Dipendente[],
  dati: { codice_fiscale: string | null; nome: string; cognome: string },
): Dipendente | null {
  if (dati.codice_fiscale) {
    const cf = norm(dati.codice_fiscale)
    const m = dipendenti.find((d) => d.codice_fiscale && norm(d.codice_fiscale) === cf)
    if (m) return m
  }
  const nome = dati.nome.trim().toLowerCase()
  const cognome = dati.cognome.trim().toLowerCase()
  return (
    dipendenti.find(
      (d) => d.nome.trim().toLowerCase() === nome && d.cognome.trim().toLowerCase() === cognome,
    ) ?? null
  )
}

/** Matching bonifico → dipendente: prima per IBAN, poi nome+cognome contenuti nel beneficiario. */
export function matchBeneficiario(
  dipendenti: Dipendente[],
  dati: { beneficiario: string | null; iban_beneficiario: string | null },
): Dipendente | null {
  if (dati.iban_beneficiario) {
    const iban = norm(dati.iban_beneficiario)
    const m = dipendenti.find((d) => d.iban && norm(d.iban) === iban)
    if (m) return m
  }
  if (!dati.beneficiario) return null
  const b = dati.beneficiario.toLowerCase()
  return (
    dipendenti.find(
      (d) => b.includes(d.nome.trim().toLowerCase()) && b.includes(d.cognome.trim().toLowerCase()),
    ) ?? null
  )
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Atteso: zero errori/warning.

- [ ] **Step 4: Commit**

```bash
git add types/dipendente.ts lib/dipendenti.ts
git commit -m "feat: dipendenti - tipi e logica conti mensilita (pura)"
```

---

### Task 4: Server actions

**Files:**
- Create: `actions/dipendenti.ts`

**Interfaces:**
- Consumes: tipi Task 3; `getOrgId` da `@/lib/auth`; `createClient` da `@/lib/supabase/server`; `calcolaSaldoDipendente`, `DipendenteConSaldo` da `@/lib/dipendenti`.
- Produces (usati da Task 6-8):
  - `getDipendenti(): Promise<Dipendente[]>`
  - `getDipendentiConSaldi(): Promise<DipendenteConSaldo[]>`
  - `getDipendenteCompleto(id: string): Promise<DipendenteCompleto | null>`
  - `createDipendente(input: DipendenteInput): Promise<Dipendente>`
  - `updateDipendente(id: string, input: DipendenteInput): Promise<void>`
  - `deleteDipendente(id: string): Promise<void>`
  - `addBustaPaga(input: BustaPagaInput, formData?: FormData): Promise<void>`
  - `deleteBustaPaga(id: string): Promise<void>`
  - `addPagamento(input: PagamentoInput, formData?: FormData): Promise<void>`
  - `deletePagamento(id: string): Promise<void>`
  - `getDipendenteFileUrl(path: string): Promise<string>`
  - `esisteBusta(dipendenteId: string, periodo: string, mensilita: Mensilita): Promise<boolean>`

- [ ] **Step 1: Crea `actions/dipendenti.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { calcolaSaldoDipendente, type DipendenteConSaldo } from '@/lib/dipendenti'
import type {
  BustaPaga,
  BustaPagaInput,
  Dipendente,
  DipendenteCompleto,
  DipendenteInput,
  Mensilita,
  PagamentoDipendente,
  PagamentoInput,
} from '@/types/dipendente'

const BUCKET = 'dipendenti-docs'

/**
 * Dati sensibili (stipendi): verifica il permesso 'dipendenti' lato server.
 * Gli admin passano sempre; gli operatori devono avere lettura/scrittura.
 */
async function assertAccessoDipendenti(scrittura = false) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('accesso')
      .eq('user_id', user.id)
      .eq('modulo', 'dipendenti')
      .maybeSingle()
    const accesso = perm?.accesso ?? 'nessuno'
    if (accesso === 'nessuno' || (scrittura && accesso !== 'scrittura')) {
      throw new Error('Accesso non consentito al modulo Dipendenti')
    }
  }
  return { supabase, orgId }
}

// ---- Anagrafica ----

export async function getDipendenti(): Promise<Dipendente[]> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { data, error } = await supabase
    .from('dipendenti')
    .select('*')
    .eq('organization_id', orgId)
    .order('cognome', { ascending: true })
  if (error) throw new Error(error.message)
  return data as Dipendente[]
}

export async function getDipendentiConSaldi(): Promise<DipendenteConSaldo[]> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const [dipRes, busteRes, pagRes] = await Promise.all([
    supabase.from('dipendenti').select('*').eq('organization_id', orgId).order('cognome'),
    supabase.from('buste_paga').select('*').eq('organization_id', orgId),
    supabase.from('pagamenti_dipendente').select('*').eq('organization_id', orgId),
  ])
  if (dipRes.error) throw new Error(dipRes.error.message)
  const buste = (busteRes.data ?? []) as BustaPaga[]
  const pagamenti = (pagRes.data ?? []) as PagamentoDipendente[]
  return (dipRes.data as Dipendente[]).map((d) => ({
    ...d,
    ...calcolaSaldoDipendente(
      buste.filter((b) => b.dipendente_id === d.id),
      pagamenti.filter((p) => p.dipendente_id === d.id),
    ),
  }))
}

export async function getDipendenteCompleto(id: string): Promise<DipendenteCompleto | null> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { data: dipendente } = await supabase
    .from('dipendenti')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!dipendente) return null
  const [busteRes, pagRes] = await Promise.all([
    supabase.from('buste_paga').select('*').eq('dipendente_id', id).order('periodo', { ascending: false }),
    supabase.from('pagamenti_dipendente').select('*').eq('dipendente_id', id).order('data_pagamento', { ascending: false }),
  ])
  return {
    dipendente: dipendente as Dipendente,
    buste: (busteRes.data ?? []) as BustaPaga[],
    pagamenti: (pagRes.data ?? []) as PagamentoDipendente[],
  }
}

export async function createDipendente(input: DipendenteInput): Promise<Dipendente> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data, error } = await supabase
    .from('dipendenti')
    .insert({ ...input, organization_id: orgId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
  return data as Dipendente
}

export async function updateDipendente(id: string, input: DipendenteInput): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('dipendenti')
    .update(input)
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteDipendente(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const [busteRes, pagRes] = await Promise.all([
    supabase.from('buste_paga').select('file_path').eq('dipendente_id', id),
    supabase.from('pagamenti_dipendente').select('file_path').eq('dipendente_id', id),
  ])
  const paths = [...(busteRes.data ?? []), ...(pagRes.data ?? [])]
    .map((r) => r.file_path)
    .filter((p): p is string => Boolean(p))
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
  const { error } = await supabase
    .from('dipendenti')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

// ---- Buste paga ----

async function uploadPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  cartella: 'buste' | 'bonifici',
  dipendenteId: string,
  formData?: FormData,
): Promise<string | null> {
  const file = formData?.get('file')
  if (!(file instanceof File) || file.size === 0) return null
  const path = `${orgId}/${cartella}/${dipendenteId}/${crypto.randomUUID()}.pdf`
  const buffer = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf' })
  if (error) throw new Error(error.message)
  return path
}

export async function addBustaPaga(input: BustaPagaInput, formData?: FormData): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const file_path = await uploadPdf(supabase, orgId, 'buste', input.dipendente_id, formData)
  const { error } = await supabase.from('buste_paga').insert({
    organization_id: orgId,
    dipendente_id: input.dipendente_id,
    periodo: input.periodo,
    mensilita: input.mensilita,
    netto: input.netto,
    lordo: input.lordo,
    pagina: input.pagina,
    dati_estratti: input.dati_estratti ?? null,
    file_path,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteBustaPaga(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data } = await supabase
    .from('buste_paga')
    .select('file_path')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (data?.file_path) await supabase.storage.from(BUCKET).remove([data.file_path])
  const { error } = await supabase
    .from('buste_paga')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function esisteBusta(
  dipendenteId: string,
  periodo: string,
  mensilita: Mensilita,
): Promise<boolean> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { count, error } = await supabase
    .from('buste_paga')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('dipendente_id', dipendenteId)
    .eq('periodo', periodo)
    .eq('mensilita', mensilita)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

// ---- Pagamenti ----

export async function addPagamento(input: PagamentoInput, formData?: FormData): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const file_path = await uploadPdf(supabase, orgId, 'bonifici', input.dipendente_id, formData)
  const { error } = await supabase.from('pagamenti_dipendente').insert({
    organization_id: orgId,
    dipendente_id: input.dipendente_id,
    data_pagamento: input.data_pagamento,
    importo: input.importo,
    metodo: input.metodo,
    periodo_competenza: input.periodo_competenza,
    mensilita: input.mensilita,
    note: input.note,
    dati_estratti: input.dati_estratti ?? null,
    file_path,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deletePagamento(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data } = await supabase
    .from('pagamenti_dipendente')
    .select('file_path')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (data?.file_path) await supabase.storage.from(BUCKET).remove([data.file_path])
  const { error } = await supabase
    .from('pagamenti_dipendente')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

// ---- File ----

export async function getDipendenteFileUrl(path: string): Promise<string> {
  const { supabase } = await assertAccessoDipendenti()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) throw new Error(error?.message ?? 'URL non disponibile')
  return data.signedUrl
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Atteso: zero errori/warning.

- [ ] **Step 3: Commit**

```bash
git add actions/dipendenti.ts
git commit -m "feat: dipendenti - server actions con controllo permessi lato server"
```

---

### Task 5: Estrazione AI (testo PDF client + route generateObject)

**Files:**
- Create: `lib/pdf-testo.ts`
- Create: `app/api/estrai-documenti/route.ts`

**Interfaces:**
- Consumes: tipi `BustaEstratta`, `BonificoEstratto` (Task 3); pattern pdfjs da `lib/parsers/parsePDFListino.ts` (worker `/pdf.worker.min.mjs` già in `public/`); OpenRouter config da `app/api/assistant/route.ts`.
- Produces: `estraiTestoPagine(file: File): Promise<string[]>` (client-only, una stringa per pagina); route `POST /api/estrai-documenti` con body `{ tipo: 'busta' | 'bonifico', pagine: string[] }` → risposta JSON: per `'busta'` `{ buste: BustaEstratta[] }`, per `'bonifico'` `BonificoEstratto`. Errori: 401 non autenticato, 400 input vuoto, 502 estrazione fallita.

- [ ] **Step 1: Crea `lib/pdf-testo.ts`**

```typescript
/**
 * Estrae il testo di ogni pagina di un PDF lato client (pdfjs-dist).
 * Solo browser: usa il worker copiato in public/ all'avvio.
 */
export async function estraiTestoPagine(file: File): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pagine: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pagine.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim(),
    )
  }
  return pagine
}
```

- [ ] **Step 2: Crea `app/api/estrai-documenti/route.ts`**

```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getOrgId } from '@/lib/auth'

export const maxDuration = 60

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.WINSTUDIO,
})

const MODEL = 'google/gemini-2.5-flash-preview-05-20'
const MENSILITA = ['mensile', 'tredicesima', 'quattordicesima', 'altro'] as const

const busteSchema = z.object({
  buste: z.array(
    z.object({
      nome: z.string(),
      cognome: z.string(),
      codice_fiscale: z.string().nullable(),
      periodo: z.string().describe('Mese di competenza in formato YYYY-MM'),
      mensilita: z.enum(MENSILITA),
      netto: z.number().describe('Netto a pagare in euro, formato numerico 1234.56'),
      lordo: z.number().nullable(),
      pagina: z.number().int().describe('Pagina del PDF in cui inizia la busta (da 1)'),
    }),
  ),
})

const bonificoSchema = z.object({
  beneficiario: z.string().nullable(),
  iban_beneficiario: z.string().nullable(),
  data_pagamento: z.string().nullable().describe('Data esecuzione, YYYY-MM-DD'),
  importo: z.number().nullable(),
  causale: z.string().nullable(),
  periodo_competenza: z.string().nullable().describe('Mese coperto dal pagamento dedotto dalla causale, YYYY-MM'),
  mensilita: z.enum(MENSILITA),
})

export async function POST(req: Request) {
  try {
    await getOrgId()
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { tipo, pagine } = (await req.json()) as {
    tipo: 'busta' | 'bonifico'
    pagine: string[]
  }
  if (!Array.isArray(pagine) || pagine.length === 0 || pagine.every((p) => !p)) {
    return Response.json({ error: 'Il PDF non contiene testo leggibile' }, { status: 400 })
  }

  const testo = pagine.map((p, i) => `--- PAGINA ${i + 1} ---\n${p}`).join('\n\n')

  try {
    if (tipo === 'busta') {
      const { object } = await generateObject({
        model: openrouter(MODEL),
        schema: busteSchema,
        mode: 'json',
        prompt: `Questo è il testo estratto da un PDF di buste paga italiane. Il file può contenere UNA sola busta o PIÙ buste di dipendenti diversi (una o più pagine ciascuna). Per OGNI busta paga individua: nome e cognome del dipendente, codice fiscale, mese di competenza (periodo), mensilità (tredicesima o quattordicesima solo se indicato esplicitamente, altrimenti mensile), NETTO A PAGARE in euro (il netto finale che il dipendente riceve, non il lordo né l'imponibile), lordo se presente, pagina di inizio.\n\n${testo}`,
      })
      return Response.json(object)
    }
    const { object } = await generateObject({
      model: openrouter(MODEL),
      schema: bonificoSchema,
      mode: 'json',
      prompt: `Questo è il testo estratto dalla contabile PDF di un bonifico bancario italiano (pagamento di uno stipendio). Estrai: nome del beneficiario, IBAN del beneficiario, data di esecuzione, importo in euro, causale. Dalla causale deduci il mese di competenza dello stipendio (periodo_competenza in formato YYYY-MM, es. "stipendio giugno 2026" → 2026-06) e la mensilità (tredicesima o quattordicesima se citate, altrimenti mensile). Usa null per i campi non deducibili.\n\n${testo}`,
    })
    return Response.json(object)
  } catch {
    return Response.json({ error: 'Estrazione non riuscita, inserisci i dati manualmente' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Atteso: zero errori/warning.

- [ ] **Step 4: Verifica build intermedia**

Run: `npm run build`
Atteso: build OK (la route compila; nessun import client/server incrociato — `lib/pdf-testo.ts` è importato solo da componenti client nei task successivi).

- [ ] **Step 5: Commit**

```bash
git add lib/pdf-testo.ts app/api/estrai-documenti/route.ts
git commit -m "feat: dipendenti - estrazione AI buste paga e contabili via OpenRouter"
```

---

### Task 6: Pagina lista dipendenti + dialog anagrafica

**Files:**
- Create: `app/(dashboard)/dipendenti/page.tsx`
- Create: `components/dipendenti/PaginaDipendenti.tsx`
- Create: `components/dipendenti/DialogDipendente.tsx`

**Interfaces:**
- Consumes: `getDipendentiConSaldi`, `createDipendente`, `updateDipendente`, `deleteDipendente` (Task 4); `DipendenteConSaldo`, `formatEuro`.
- Produces: `DialogDipendente` con props `{ open: boolean; onOpenChange: (v: boolean) => void; dipendente: Dipendente | null; onSaved?: (d: Dipendente) => void }` — riusato in Task 7 e 8 (`onSaved` riceve il dipendente creato; su update riceve il dipendente aggiornato ricostruito dal form).

- [ ] **Step 1: Crea `components/dipendenti/DialogDipendente.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createDipendente, updateDipendente } from '@/actions/dipendenti'
import type { Dipendente, DipendenteInput } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendente: Dipendente | null
  onSaved?: (d: Dipendente) => void
}

const emptyForm = (): DipendenteInput => ({
  nome: '',
  cognome: '',
  codice_fiscale: null,
  iban: null,
  attivo: true,
  note: null,
})

export default function DialogDipendente({ open, onOpenChange, dipendente, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<DipendenteInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        dipendente
          ? {
              nome: dipendente.nome,
              cognome: dipendente.cognome,
              codice_fiscale: dipendente.codice_fiscale,
              iban: dipendente.iban,
              attivo: dipendente.attivo,
              note: dipendente.note,
            }
          : emptyForm(),
      )
    }
  }, [open, dipendente])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.cognome.trim()) {
      toast.error('Nome e cognome sono obbligatori')
      return
    }
    setLoading(true)
    try {
      if (dipendente) {
        await updateDipendente(dipendente.id, form)
        toast.success('Dipendente aggiornato')
        onSaved?.({ ...dipendente, ...form })
      } else {
        const nuovo = await createDipendente(form)
        toast.success('Dipendente creato')
        onSaved?.(nuovo)
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dipendente ? 'Modifica dipendente' : 'Nuovo dipendente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dip-nome">Nome *</Label>
              <Input
                id="dip-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dip-cognome">Cognome *</Label>
              <Input
                id="dip-cognome"
                value={form.cognome}
                onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dip-cf">Codice fiscale</Label>
            <Input
              id="dip-cf"
              value={form.codice_fiscale ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, codice_fiscale: e.target.value.toUpperCase() || null }))
              }
              placeholder="Aiuta il riconoscimento automatico delle buste"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dip-iban">IBAN</Label>
            <Input
              id="dip-iban"
              value={form.iban ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value.toUpperCase() || null }))}
              placeholder="Aiuta il riconoscimento dei bonifici"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dip-note">Note</Label>
            <Input
              id="dip-note"
              value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value || null }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.attivo}
              onChange={(e) => setForm((f) => ({ ...f, attivo: e.target.checked }))}
            />
            Dipendente attivo
          </label>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : 'Salva'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Crea `components/dipendenti/PaginaDipendenti.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import type { DipendenteConSaldo } from '@/lib/dipendenti'
import DialogDipendente from './DialogDipendente'

interface Props {
  dipendenti: DipendenteConSaldo[]
}

export default function PaginaDipendenti({ dipendenti }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Dipendenti</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dipendenti/carica">
              <Upload className="h-4 w-4 mr-2" /> Carica documenti
            </Link>
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo dipendente
          </Button>
        </div>
      </div>

      {dipendenti.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessun dipendente. Creane uno o carica una busta paga.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">Dipendente</th>
                <th className="px-3 py-2 text-right">Dovuto</th>
                <th className="px-3 py-2 text-right">Pagato</th>
                <th className="px-3 py-2 text-right">Da pagare</th>
                <th className="px-3 py-2 text-right">Mesi aperti</th>
              </tr>
            </thead>
            <tbody>
              {dipendenti.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/dipendenti/${d.id}`)}
                  className={cn(
                    'border-b cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950',
                    i % 2 === 1 && 'bg-gray-50/60 dark:bg-gray-900/40',
                  )}
                >
                  <td className="px-3 py-2.5 font-medium">
                    {d.cognome} {d.nome}
                    {!d.attivo && (
                      <span className="ml-2 text-xs rounded bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 text-gray-500">
                        non attivo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatEuro(d.dovuto)}</td>
                  <td className="px-3 py-2.5 text-right">{formatEuro(d.pagato)}</td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-right font-semibold',
                      d.residuo > 0 ? 'text-red-600' : 'text-green-700',
                    )}
                  >
                    {formatEuro(d.residuo)}
                  </td>
                  <td className="px-3 py-2.5 text-right">{d.mesi_aperti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogDipendente open={dialogOpen} onOpenChange={setDialogOpen} dipendente={null} />
    </div>
  )
}
```

- [ ] **Step 3: Crea `app/(dashboard)/dipendenti/page.tsx`**

```tsx
import { getDipendentiConSaldi } from '@/actions/dipendenti'
import PaginaDipendenti from '@/components/dipendenti/PaginaDipendenti'

export const dynamic = 'force-dynamic'

export default async function DipendentiPage() {
  const dipendenti = await getDipendentiConSaldi()
  return <PaginaDipendenti dipendenti={dipendenti} />
}
```

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev` → apri `/dipendenti`: la voce sidebar "Dipendenti" è visibile (admin), la pagina carica vuota, "Nuovo dipendente" crea un record che appare in tabella.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add "app/(dashboard)/dipendenti/page.tsx" components/dipendenti/PaginaDipendenti.tsx components/dipendenti/DialogDipendente.tsx
git commit -m "feat: dipendenti - pagina lista con saldi e dialog anagrafica"
```

---

### Task 7: Pagina dettaglio dipendente (tabella mensilità)

**Files:**
- Create: `app/(dashboard)/dipendenti/[id]/page.tsx`
- Create: `components/dipendenti/DettaglioDipendente.tsx`
- Create: `components/dipendenti/DialogPagamentoManuale.tsx`

**Interfaces:**
- Consumes: `getDipendenteCompleto`, `deleteBustaPaga`, `deletePagamento`, `deleteDipendente`, `addPagamento`, `getDipendenteFileUrl` (Task 4); `calcolaRigheMensilita`, `calcolaSaldoDipendente`, `formatPeriodo`, `MENSILITA_LABELS` (Task 3); `DialogDipendente` (Task 6).
- Produces: `DialogPagamentoManuale` con props `{ open: boolean; onOpenChange: (v: boolean) => void; dipendenteId: string; periodoDefault?: string }` (`periodoDefault` = 'YYYY-MM-01').

- [ ] **Step 1: Crea `components/dipendenti/DialogPagamentoManuale.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { addPagamento } from '@/actions/dipendenti'
import { MENSILITA_LABELS } from '@/lib/dipendenti'
import type { Mensilita, MetodoPagamentoDipendente } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendenteId: string
  periodoDefault?: string // 'YYYY-MM-01'
}

const METODI: { value: MetodoPagamentoDipendente; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti (acconto)' },
  { value: 'altro', label: 'Altro' },
]

const today = () => new Date().toISOString().split('T')[0]

export default function DialogPagamentoManuale({ open, onOpenChange, dipendenteId, periodoDefault }: Props) {
  const router = useRouter()
  const [importo, setImporto] = useState('')
  const [data, setData] = useState(today())
  const [metodo, setMetodo] = useState<MetodoPagamentoDipendente>('contanti')
  const [periodo, setPeriodo] = useState((periodoDefault ?? today()).slice(0, 7)) // 'YYYY-MM'
  const [mensilita, setMensilita] = useState<Mensilita>('mensile')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const imp = parseFloat(importo.replace(',', '.'))
    if (!imp || imp <= 0) {
      toast.error('Inserisci un importo valido')
      return
    }
    if (!periodo) {
      toast.error('Indica il mese di competenza')
      return
    }
    setLoading(true)
    try {
      await addPagamento({
        dipendente_id: dipendenteId,
        data_pagamento: data,
        importo: imp,
        metodo,
        periodo_competenza: `${periodo}-01`,
        mensilita,
        note: note || null,
      })
      toast.success('Pagamento registrato')
      setImporto('')
      setNote('')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registra pagamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pag-importo">Importo (€) *</Label>
              <Input
                id="pag-importo"
                inputMode="decimal"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pag-data">Data pagamento</Label>
              <Input id="pag-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pag-periodo">Mese di competenza *</Label>
              <Input
                id="pag-periodo"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={mensilita} onValueChange={(v) => setMensilita(v as Mensilita)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Metodo</Label>
            <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoPagamentoDipendente)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METODI.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pag-note">Note</Label>
            <Input id="pag-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Registrazione...' : 'Registra pagamento'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Crea `components/dipendenti/DettaglioDipendente.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import {
  deleteBustaPaga,
  deleteDipendente,
  deletePagamento,
  getDipendenteFileUrl,
} from '@/actions/dipendenti'
import {
  calcolaRigheMensilita,
  calcolaSaldoDipendente,
  formatPeriodo,
  MENSILITA_LABELS,
} from '@/lib/dipendenti'
import type { BustaPaga, Dipendente, PagamentoDipendente } from '@/types/dipendente'
import DialogDipendente from './DialogDipendente'
import DialogPagamentoManuale from './DialogPagamentoManuale'

interface Props {
  dipendente: Dipendente
  buste: BustaPaga[]
  pagamenti: PagamentoDipendente[]
}

const METODO_LABELS: Record<string, string> = {
  bonifico: 'Bonifico',
  contanti: 'Contanti',
  altro: 'Altro',
}

const formatData = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT')
}

export default function DettaglioDipendente({ dipendente, buste, pagamenti }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [pagamentoOpen, setPagamentoOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const righe = calcolaRigheMensilita(buste, pagamenti)
  const saldo = calcolaSaldoDipendente(buste, pagamenti)

  const apriFile = async (path: string) => {
    try {
      const url = await getDipendenteFileUrl(path)
      window.open(url, '_blank')
    } catch {
      toast.error('File non disponibile')
    }
  }

  const rimuoviBusta = async (id: string) => {
    if (!window.confirm('Eliminare questa busta paga?')) return
    setBusyId(id)
    try {
      await deleteBustaPaga(id)
      toast.success('Busta eliminata')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setBusyId(null)
    }
  }

  const rimuoviPagamento = async (id: string) => {
    if (!window.confirm('Eliminare questo pagamento?')) return
    setBusyId(id)
    try {
      await deletePagamento(id)
      toast.success('Pagamento eliminato')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setBusyId(null)
    }
  }

  const rimuoviDipendente = async () => {
    if (!window.confirm(`Eliminare ${dipendente.nome} ${dipendente.cognome} con tutte le buste e i pagamenti?`)) return
    try {
      await deleteDipendente(dipendente.id)
      toast.success('Dipendente eliminato')
      router.push('/dipendenti')
    } catch {
      toast.error("Errore nell'eliminazione")
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {dipendente.cognome} {dipendente.nome}
            </h1>
            <p className="text-xs text-gray-500">
              {dipendente.codice_fiscale ?? 'CF non inserito'}
              {dipendente.iban ? ` · ${dipendente.iban}` : ''}
              {!dipendente.attivo ? ' · NON ATTIVO' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dipendenti/carica">
              <Upload className="h-4 w-4 mr-2" /> Carica documenti
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setPagamentoOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Pagamento
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifica
          </Button>
          <Button variant="ghost" className="text-red-500 hover:text-red-700" onClick={rimuoviDipendente}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Card riepilogo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500">Dovuto (buste)</p>
          <p className="text-lg font-bold">{formatEuro(saldo.dovuto)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500">Pagato</p>
          <p className="text-lg font-bold">{formatEuro(saldo.pagato)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500">Da pagare</p>
          <p className={cn('text-lg font-bold', saldo.residuo > 0 ? 'text-red-600' : 'text-green-700')}>
            {formatEuro(saldo.residuo)}
          </p>
        </div>
      </div>

      {/* Tabella mensilità */}
      {righe.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessuna busta o pagamento registrato.
        </p>
      ) : (
        <div className="space-y-2">
          {righe.map((r) => (
            <div
              key={`${r.periodo}|${r.mensilita}`}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold capitalize">
                  {formatPeriodo(r.periodo)}
                  {r.mensilita !== 'mensile' && (
                    <span className="ml-2 text-xs rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.5">
                      {MENSILITA_LABELS[r.mensilita]}
                    </span>
                  )}
                </p>
                <p className="text-sm">
                  Netto: <span className="font-semibold">{r.busta ? formatEuro(r.dovuto) : '—'}</span>
                  {' · '}Pagato: <span className="font-semibold">{formatEuro(r.pagato)}</span>
                  {' · '}Residuo:{' '}
                  <span className={cn('font-bold', r.residuo > 0 ? 'text-red-600' : 'text-green-700')}>
                    {formatEuro(r.residuo)}
                  </span>
                </p>
              </div>

              {!r.busta && (
                <p className="text-xs text-amber-600">
                  Busta paga non ancora caricata per questo mese (pagamenti registrati senza busta).
                </p>
              )}

              {r.busta && (
                <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900 rounded p-2">
                  <span>
                    Busta paga · netto {formatEuro(Number(r.busta.netto))}
                    {r.busta.lordo ? ` · lordo ${formatEuro(Number(r.busta.lordo))}` : ''}
                  </span>
                  <span className="flex gap-1">
                    {r.busta.file_path && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => apriFile(r.busta!.file_path!)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      disabled={busyId === r.busta.id}
                      onClick={() => rimuoviBusta(r.busta!.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              )}

              {r.pagamenti.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm rounded p-2 border border-dashed">
                  <span>
                    {formatData(p.data_pagamento)} · {METODO_LABELS[p.metodo] ?? p.metodo} ·{' '}
                    <span className="font-semibold">{formatEuro(Number(p.importo))}</span>
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                  <span className="flex gap-1">
                    {p.file_path && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => apriFile(p.file_path!)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      disabled={busyId === p.id}
                      onClick={() => rimuoviPagamento(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <DialogDipendente open={editOpen} onOpenChange={setEditOpen} dipendente={dipendente} />
      <DialogPagamentoManuale
        open={pagamentoOpen}
        onOpenChange={setPagamentoOpen}
        dipendenteId={dipendente.id}
        periodoDefault={righe.find((r) => r.residuo > 0)?.periodo}
      />
    </div>
  )
}
```

- [ ] **Step 3: Crea `app/(dashboard)/dipendenti/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { getDipendenteCompleto } from '@/actions/dipendenti'
import DettaglioDipendente from '@/components/dipendenti/DettaglioDipendente'

export const dynamic = 'force-dynamic'

export default async function DipendentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getDipendenteCompleto(id)
  if (!data) notFound()
  return <DettaglioDipendente dipendente={data.dipendente} buste={data.buste} pagamenti={data.pagamenti} />
}
```

- [ ] **Step 4: Verifica manuale**

Con `npm run dev`: apri un dipendente → registra un pagamento manuale (contanti, mese giugno 2026) → la riga "giugno 2026" appare con residuo negativo e warning busta mancante. Elimina il pagamento → riga sparisce.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add "app/(dashboard)/dipendenti/[id]/page.tsx" components/dipendenti/DettaglioDipendente.tsx components/dipendenti/DialogPagamentoManuale.tsx
git commit -m "feat: dipendenti - pagina dettaglio con tabella mensilita e pagamenti"
```

---

### Task 8: Pagina carica documenti (upload + revisione AI)

**Files:**
- Create: `app/(dashboard)/dipendenti/carica/page.tsx`
- Create: `components/dipendenti/PaginaCarica.tsx`

**Interfaces:**
- Consumes: `estraiTestoPagine` (Task 5); route `POST /api/estrai-documenti` (Task 5); `getDipendenti`, `addBustaPaga`, `addPagamento`, `esisteBusta` (Task 4); `matchDipendente`, `matchBeneficiario`, `MENSILITA_LABELS` (Task 3); `DialogDipendente` (Task 6, con `onSaved` per assegnare il dipendente appena creato).
- Produces: flusso completo upload → estrazione → revisione → conferma. Nota: file unico grande (~350 righe) che tiene upload e revisione insieme perché condividono tutto lo stato; non spezzare.

- [ ] **Step 1: Crea `components/dipendenti/PaginaCarica.tsx`**

Upload pattern mobile-safe: `<label htmlFor>` + input file nascosto (vedi memoria `feedback_mobile_file_upload`). I `File` restano client-side fino alla conferma, poi partono in `FormData` verso le server actions.

```tsx
'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { addBustaPaga, addPagamento, esisteBusta } from '@/actions/dipendenti'
import { estraiTestoPagine } from '@/lib/pdf-testo'
import { matchBeneficiario, matchDipendente, MENSILITA_LABELS } from '@/lib/dipendenti'
import type {
  BonificoEstratto,
  BustaEstratta,
  Dipendente,
  Mensilita,
} from '@/types/dipendente'
import DialogDipendente from './DialogDipendente'

type TipoDoc = 'busta' | 'bonifico'

interface PropostaBusta {
  file: File
  dipendenteId: string | null
  periodo: string // 'YYYY-MM'
  mensilita: Mensilita
  netto: string
  lordo: string
  pagina: number | null
  raw: BustaEstratta | null
}

interface PropostaBonifico {
  file: File
  dipendenteId: string | null
  dataPagamento: string // 'YYYY-MM-DD'
  importo: string
  periodo: string // 'YYYY-MM'
  mensilita: Mensilita
  causale: string
  raw: BonificoEstratto | null
}

const meseCorrente = () => new Date().toISOString().slice(0, 7)
const oggi = () => new Date().toISOString().slice(0, 10)

export default function PaginaCarica({ dipendenti: iniziali }: { dipendenti: Dipendente[] }) {
  const router = useRouter()
  const [dipendenti, setDipendenti] = useState(iniziali)
  const [tipo, setTipo] = useState<TipoDoc>('busta')
  const [buste, setBuste] = useState<PropostaBusta[]>([])
  const [bonifici, setBonifici] = useState<PropostaBonifico[]>([])
  const [estraendo, setEstraendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nuovoDipOpen, setNuovoDipOpen] = useState(false)
  const assegnaANuovo = useRef<((id: string) => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setEstraendo(true)
    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          toast.error(`${file.name}: solo file PDF`)
          continue
        }
        let pagine: string[] = []
        try {
          pagine = await estraiTestoPagine(file)
        } catch {
          toast.error(`${file.name}: PDF non leggibile`)
        }
        let estratto: unknown = null
        if (pagine.some((p) => p)) {
          const res = await fetch('/api/estrai-documenti', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, pagine }),
          })
          if (res.ok) estratto = await res.json()
          else toast.warning(`${file.name}: estrazione automatica fallita, compila i campi a mano`)
        } else {
          toast.warning(`${file.name}: nessun testo nel PDF (scansione?), compila i campi a mano`)
        }

        if (tipo === 'busta') {
          const trovate = (estratto as { buste?: BustaEstratta[] } | null)?.buste ?? []
          const proposte: PropostaBusta[] =
            trovate.length > 0
              ? trovate.map((b) => ({
                  file,
                  dipendenteId: matchDipendente(dipendenti, b)?.id ?? null,
                  periodo: b.periodo || meseCorrente(),
                  mensilita: b.mensilita,
                  netto: b.netto ? String(b.netto) : '',
                  lordo: b.lordo ? String(b.lordo) : '',
                  pagina: b.pagina,
                  raw: b,
                }))
              : [{
                  file,
                  dipendenteId: null,
                  periodo: meseCorrente(),
                  mensilita: 'mensile',
                  netto: '',
                  lordo: '',
                  pagina: null,
                  raw: null,
                }]
          setBuste((prev) => [...prev, ...proposte])
        } else {
          const b = estratto as BonificoEstratto | null
          setBonifici((prev) => [
            ...prev,
            {
              file,
              dipendenteId: b ? matchBeneficiario(dipendenti, b)?.id ?? null : null,
              dataPagamento: b?.data_pagamento ?? oggi(),
              importo: b?.importo ? String(b.importo) : '',
              periodo: b?.periodo_competenza ?? meseCorrente(),
              mensilita: b?.mensilita ?? 'mensile',
              causale: b?.causale ?? '',
              raw: b,
            },
          ])
        }
      }
    } finally {
      setEstraendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const apriNuovoDipendente = (assegna: (id: string) => void) => {
    assegnaANuovo.current = assegna
    setNuovoDipOpen(true)
  }

  const onDipendenteCreato = (d: Dipendente) => {
    setDipendenti((prev) => [...prev, d])
    assegnaANuovo.current?.(d.id)
    assegnaANuovo.current = null
  }

  const conferma = async () => {
    for (const [i, p] of buste.entries()) {
      if (!p.dipendenteId) { toast.error(`Busta ${i + 1}: seleziona il dipendente`); return }
      if (!parseFloat(p.netto.replace(',', '.'))) { toast.error(`Busta ${i + 1}: netto mancante`); return }
    }
    for (const [i, p] of bonifici.entries()) {
      if (!p.dipendenteId) { toast.error(`Bonifico ${i + 1}: seleziona il dipendente`); return }
      if (!parseFloat(p.importo.replace(',', '.'))) { toast.error(`Bonifico ${i + 1}: importo mancante`); return }
    }
    setSalvando(true)
    try {
      for (const p of buste) {
        const periodo = `${p.periodo}-01`
        const duplicata = await esisteBusta(p.dipendenteId!, periodo, p.mensilita)
        if (duplicata) {
          const dip = dipendenti.find((d) => d.id === p.dipendenteId)
          const ok = window.confirm(
            `Esiste già una busta ${MENSILITA_LABELS[p.mensilita].toLowerCase()} di ${dip?.cognome ?? ''} per questo mese. Aggiungere comunque?`,
          )
          if (!ok) continue
        }
        const fd = new FormData()
        fd.set('file', p.file)
        await addBustaPaga(
          {
            dipendente_id: p.dipendenteId!,
            periodo,
            mensilita: p.mensilita,
            netto: parseFloat(p.netto.replace(',', '.')),
            lordo: p.lordo ? parseFloat(p.lordo.replace(',', '.')) : null,
            pagina: p.pagina,
            dati_estratti: p.raw ? { ...p.raw } : null,
          },
          fd,
        )
      }
      for (const p of bonifici) {
        const fd = new FormData()
        fd.set('file', p.file)
        await addPagamento(
          {
            dipendente_id: p.dipendenteId!,
            data_pagamento: p.dataPagamento,
            importo: parseFloat(p.importo.replace(',', '.')),
            metodo: 'bonifico',
            periodo_competenza: `${p.periodo}-01`,
            mensilita: p.mensilita,
            note: p.causale || null,
            dati_estratti: p.raw ? { ...p.raw } : null,
          },
          fd,
        )
      }
      toast.success('Documenti registrati')
      router.push('/dipendenti')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSalvando(false)
    }
  }

  const totaleProposte = buste.length + bonifici.length

  const selettoreDipendente = (
    valore: string | null,
    assegna: (id: string) => void,
  ) => (
    <Select
      value={valore ?? ''}
      onValueChange={(v) => (v === '__nuovo__' ? apriNuovoDipendente(assegna) : assegna(v))}
    >
      <SelectTrigger className={valore ? '' : 'border-red-400'}>
        <SelectValue placeholder="Seleziona dipendente *" />
      </SelectTrigger>
      <SelectContent>
        {dipendenti.map((d) => (
          <SelectItem key={d.id} value={d.id}>{d.cognome} {d.nome}</SelectItem>
        ))}
        <SelectItem value="__nuovo__">+ Nuovo dipendente...</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Carica documenti</h1>
      </div>

      {/* Selettore tipo + upload */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="space-y-1">
          <Label>Tipo di documento</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDoc)}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="busta">Buste paga (anche PDF con più dipendenti)</SelectItem>
              <SelectItem value="bonifico">Contabili bonifico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <input
            ref={fileInputRef}
            id="upload-doc"
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button asChild variant="outline" disabled={estraendo}>
            <label htmlFor="upload-doc" className="cursor-pointer">
              {estraendo ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lettura in corso...</>
              ) : (
                <><FileUp className="h-4 w-4 mr-2" /> Scegli PDF dal dispositivo</>
              )}
            </label>
          </Button>
        </div>
      </div>

      {/* Revisione buste */}
      {buste.map((p, i) => (
        <div key={`b-${i}`} className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Busta paga · {p.file.name}{p.pagina ? ` · pag. ${p.pagina}` : ''}
              {p.raw && <span className="ml-2 text-xs text-teal-600">letta automaticamente — verifica i dati</span>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setBuste((prev) => prev.filter((_, j) => j !== i))}>
              Rimuovi
            </Button>
          </div>
          {p.raw && (
            <p className="text-xs text-gray-500">
              Letto: {p.raw.nome} {p.raw.cognome}{p.raw.codice_fiscale ? ` · ${p.raw.codice_fiscale}` : ''}
            </p>
          )}
          {selettoreDipendente(p.dipendenteId, (id) =>
            setBuste((prev) => prev.map((x, j) => (j === i ? { ...x, dipendenteId: id } : x))),
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Mese</Label>
              <Input type="month" value={p.periodo}
                onChange={(e) => setBuste((prev) => prev.map((x, j) => (j === i ? { ...x, periodo: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={p.mensilita}
                onValueChange={(v) => setBuste((prev) => prev.map((x, j) => (j === i ? { ...x, mensilita: v as Mensilita } : x)))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Netto (€) *</Label>
              <Input inputMode="decimal" value={p.netto}
                onChange={(e) => setBuste((prev) => prev.map((x, j) => (j === i ? { ...x, netto: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Lordo (€)</Label>
              <Input inputMode="decimal" value={p.lordo}
                onChange={(e) => setBuste((prev) => prev.map((x, j) => (j === i ? { ...x, lordo: e.target.value } : x)))} />
            </div>
          </div>
        </div>
      ))}

      {/* Revisione bonifici */}
      {bonifici.map((p, i) => (
        <div key={`p-${i}`} className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Bonifico · {p.file.name}
              {p.raw && <span className="ml-2 text-xs text-teal-600">letto automaticamente — verifica i dati</span>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setBonifici((prev) => prev.filter((_, j) => j !== i))}>
              Rimuovi
            </Button>
          </div>
          {p.raw?.beneficiario && (
            <p className="text-xs text-gray-500">Beneficiario letto: {p.raw.beneficiario}</p>
          )}
          {selettoreDipendente(p.dipendenteId, (id) =>
            setBonifici((prev) => prev.map((x, j) => (j === i ? { ...x, dipendenteId: id } : x))),
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Importo (€) *</Label>
              <Input inputMode="decimal" value={p.importo}
                onChange={(e) => setBonifici((prev) => prev.map((x, j) => (j === i ? { ...x, importo: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={p.dataPagamento}
                onChange={(e) => setBonifici((prev) => prev.map((x, j) => (j === i ? { ...x, dataPagamento: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Mese di competenza</Label>
              <Input type="month" value={p.periodo}
                onChange={(e) => setBonifici((prev) => prev.map((x, j) => (j === i ? { ...x, periodo: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={p.mensilita}
                onValueChange={(v) => setBonifici((prev) => prev.map((x, j) => (j === i ? { ...x, mensilita: v as Mensilita } : x)))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Causale / note</Label>
            <Input value={p.causale}
              onChange={(e) => setBonifici((prev) => prev.map((x, j) => (j === i ? { ...x, causale: e.target.value } : x)))} />
          </div>
        </div>
      ))}

      {totaleProposte > 0 && (
        <Button onClick={conferma} disabled={salvando || estraendo} className="w-full">
          {salvando
            ? 'Salvataggio...'
            : `Conferma e registra ${totaleProposte} document${totaleProposte === 1 ? 'o' : 'i'}`}
        </Button>
      )}

      <DialogDipendente
        open={nuovoDipOpen}
        onOpenChange={setNuovoDipOpen}
        dipendente={null}
        onSaved={onDipendenteCreato}
      />
    </div>
  )
}
```

- [ ] **Step 2: Crea `app/(dashboard)/dipendenti/carica/page.tsx`**

```tsx
import { getDipendenti } from '@/actions/dipendenti'
import PaginaCarica from '@/components/dipendenti/PaginaCarica'

export const dynamic = 'force-dynamic'

export default async function CaricaDocumentiPage() {
  const dipendenti = await getDipendenti()
  return <PaginaCarica dipendenti={dipendenti} />
}
```

- [ ] **Step 3: Verifica manuale del flusso completo**

Con `npm run dev` (l'AI via OpenRouter funziona anche in locale):
1. `/dipendenti/carica` → tipo "Buste paga" → carica un PDF di busta reale → appare la proposta con netto/periodo precompilati e dipendente agganciato (o selettore rosso se non riconosciuto).
2. "+ Nuovo dipendente..." dal selettore → crea → viene assegnato alla proposta.
3. Conferma → redirect a `/dipendenti`, saldi aggiornati.
4. Ripeti con tipo "Contabili bonifico" → il mese di competenza viene proposto dalla causale → conferma → nel dettaglio dipendente il residuo del mese scende.
5. Ricarica la stessa busta → alla conferma appare il window.confirm di duplicato.

- [ ] **Step 4: Lint + commit**

```bash
npm run lint
git add "app/(dashboard)/dipendenti/carica/page.tsx" components/dipendenti/PaginaCarica.tsx
git commit -m "feat: dipendenti - upload documenti con estrazione AI e revisione"
```

---

### Task 9: Verifica finale, build, memoria

**Files:**
- Modify: memoria progetto (`MEMORY.md` + nuovo file memoria modulo)

- [ ] **Step 1: Build completa**

Run: `npm run build`
Atteso: build OK, zero warning eslint. Se fallisce per `RESEND_API_KEY`, è il problema pre-esistente noto: verificare che `.env.local` contenga una chiave anche fittizia.

- [ ] **Step 2: Verifica end-to-end**

Ripeti il flusso di Task 8 Step 3 in dev se non già fatto dopo le ultime modifiche. Verifica anche che un utente operatore SENZA permesso 'dipendenti' non veda la voce sidebar e riceva errore chiamando le pagine `/dipendenti` (l'action lancia 'Accesso non consentito').

- [ ] **Step 3: Aggiorna la memoria progetto**

Crea `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\project_dipendenti.md` con: schema tabelle, percorsi file principali, flusso estrazione (testo client pdfjs → /api/estrai-documenti → generateObject), chiusura mensile per (periodo, mensilità), controllo permessi server-side in assertAccessoDipendenti. Aggiungi la riga indice in `MEMORY.md`.

- [ ] **Step 4: Commit finale + push (chiedi conferma all'utente per il deploy)**

```bash
git status   # solo file attesi
git log --oneline master -10
```
Chiedi all'utente se pushare su master (deploy automatico Vercel).

---

## Self-review (fatta in fase di scrittura)

- **Copertura spec:** migration+bucket (T1), permessi/sidebar (T2), tipi+logica mensile (T3), actions+storage+permessi server (T4), estrazione AI misti/multi-busta+bonifici (T5), lista con saldi (T6), dettaglio mese per mese con residui e mesi aperti (T7), upload+revisione+matching+duplicati+fallback manuale (T8), verifica+memoria (T9). Fuori scope confermati: CSV estratto conto, ferie/TFR.
- **Tipi coerenti:** `Mensilita`, `BustaPagaInput.periodo` sempre 'YYYY-MM-01' (conversione da 'YYYY-MM' nei componenti con `` `${periodo}-01` ``); `DipendenteConSaldo` esportato da `lib/dipendenti.ts` (non da types, per evitare import circolari); `onSaved` di DialogDipendente usato in T8.
- **Gotcha repo rispettati:** insert singoli con chiavi esplicite (no bulk disomogeneo), niente Textarea, `await params`, upload via FormData+arrayBuffer, bucket con MIME application/pdf esplicito.
