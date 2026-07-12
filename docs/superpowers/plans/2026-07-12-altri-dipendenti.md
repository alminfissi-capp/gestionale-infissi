# Altri Dipendenti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una sezione "Altri Dipendenti" per lavoratori senza buste/PDF, con stipendi e pagamenti inseriti a mano (cadenza settimanale o mensile per dipendente) e residuo abbinato per periodo.

**Architecture:** Nuove tabelle Supabase (`altri_dipendenti`, `movimenti_altro_dipendente`) con RLS per `organization_id`. Logica di calcolo pura in `lib/altri-dipendenti.ts`. Server Actions in `actions/altri-dipendenti.ts` (permesso modulo `dipendenti`). UI: pulsante nero nella pagina Dipendenti → pagina lista `/dipendenti/altri` → dettaglio `/dipendenti/altri/[id]`. Segue gli stessi pattern del modulo Dipendenti esistente.

**Tech Stack:** Next.js 16 (App Router, webpack), React 19, TypeScript, Supabase (Postgres + RLS), shadcn/ui, Tailwind, sonner.

## Global Constraints

- Ogni tabella ha `organization_id`; RLS via `get_user_organization_id()`. Mai bypassare RLS.
- Ogni action importa `assertAccessoDipendenti` da `@/lib/permessi-dipendenti` (modulo `dipendenti`): `assertAccessoDipendenti(true)` per le scritture, `assertAccessoDipendenti()` per le letture. Restituisce `{ supabase, orgId }`.
- Le pagine dettaglio in Next.js 16 ricevono `params: Promise<{ id }>` → `await params`.
- Business logic pura in `lib/` senza dipendenze React/Supabase.
- Dopo ogni mutazione: `revalidatePath('/dipendenti', 'layout')`.
- Nessun test runner nel progetto: la verifica è `npx tsc --noEmit` (exit 0), `npm run lint` (nessun errore sui file nuovi), `npx tsx` per la logica pura, e smoke test in `npm run dev`. `npm run build` richiede `RESEND_API_KEY` (usare una chiave fittizia: `RESEND_API_KEY=re_test npm run build`).
- Migration remota: progetto Supabase ref `xawyrtqclpeylxnhwhwo`. Applicare via Supabase MCP `apply_migration` e salvare comunque il file `.sql` in `supabase/migrations/`.
- `formatEuro` sta in `@/lib/pricing`. `cn` in `@/lib/utils`.

---

### Task 1: Migration tabelle + RLS

**Files:**
- Create: `supabase/migrations/20260712200000_altri_dipendenti.sql`

**Interfaces:**
- Produces: tabelle `altri_dipendenti(id, organization_id, nome, cognome, cadenza, attivo, note, created_at)` e `movimenti_altro_dipendente(id, organization_id, altro_dipendente_id, tipo, periodo, importo, data_pagamento, metodo, note, created_at)`.

- [ ] **Step 1: Scrivi il file di migration**

```sql
-- ============================================================
-- 20260712200000_altri_dipendenti.sql
-- Altri Dipendenti: stipendi e pagamenti manuali (settimanale/mensile)
-- ============================================================

CREATE TABLE altri_dipendenti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  cadenza TEXT NOT NULL CHECK (cadenza IN ('settimanale', 'mensile')),
  attivo BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE movimenti_altro_dipendente (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  altro_dipendente_id UUID NOT NULL REFERENCES altri_dipendenti(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('stipendio', 'pagamento')),
  periodo DATE NOT NULL,
  importo NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  data_pagamento DATE,
  metodo TEXT CHECK (metodo IN ('bonifico', 'contanti', 'altro')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movimenti_altro ON movimenti_altro_dipendente(altro_dipendente_id, periodo);

ALTER TABLE altri_dipendenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_altro_dipendente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "altri_dipendenti_select" ON altri_dipendenti FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "altri_dipendenti_insert" ON altri_dipendenti FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "altri_dipendenti_update" ON altri_dipendenti FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "altri_dipendenti_delete" ON altri_dipendenti FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "movimenti_altro_select" ON movimenti_altro_dipendente FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_altro_insert" ON movimenti_altro_dipendente FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_altro_update" ON movimenti_altro_dipendente FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_altro_delete" ON movimenti_altro_dipendente FOR DELETE USING (organization_id = get_user_organization_id());
```

- [ ] **Step 2: Applica la migration al progetto remoto**

Usa Supabase MCP `apply_migration` con `project_id: "xawyrtqclpeylxnhwhwo"`, `name: "altri_dipendenti"`, e il contenuto SQL dello Step 1.

- [ ] **Step 3: Verifica che le tabelle esistano**

Usa Supabase MCP `list_tables` (schema `public`) e conferma la presenza di `altri_dipendenti` e `movimenti_altro_dipendente` con le colonne attese.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260712200000_altri_dipendenti.sql
git commit -m "feat: altri dipendenti - migration tabelle + RLS"
```

---

### Task 2: Tipi TypeScript

**Files:**
- Modify: `types/dipendente.ts` (append in fondo al file)

**Interfaces:**
- Consumes: `MetodoPagamentoDipendente` (già definito in `types/dipendente.ts`).
- Produces: `CadenzaAltro`, `TipoMovimentoAltro`, `AltroDipendente`, `AltroDipendenteInput`, `MovimentoAltroDipendente`, `MovimentoAltroInput`, `AltroDipendenteCompleto`.

- [ ] **Step 1: Aggiungi i tipi in coda a `types/dipendente.ts`**

```typescript
// ---- Altri Dipendenti (stipendi/pagamenti manuali) ----

export type CadenzaAltro = 'settimanale' | 'mensile'
export type TipoMovimentoAltro = 'stipendio' | 'pagamento'

export interface AltroDipendente {
  id: string
  organization_id: string
  nome: string
  cognome: string
  cadenza: CadenzaAltro
  attivo: boolean
  note: string | null
  created_at: string
}

export interface AltroDipendenteInput {
  nome: string
  cognome: string
  cadenza: CadenzaAltro
  attivo: boolean
  note: string | null
}

export interface MovimentoAltroDipendente {
  id: string
  organization_id: string
  altro_dipendente_id: string
  tipo: TipoMovimentoAltro
  periodo: string // 'YYYY-MM-DD' canonico (lunedì della settimana o primo del mese)
  importo: number
  data_pagamento: string | null // 'YYYY-MM-DD', solo per i pagamenti
  metodo: MetodoPagamentoDipendente | null // solo per i pagamenti
  note: string | null
  created_at: string
}

export interface MovimentoAltroInput {
  altro_dipendente_id: string
  tipo: TipoMovimentoAltro
  data_periodo: string // 'YYYY-MM-DD' scelta dall'utente; il server la normalizza in `periodo`
  importo: number
  data_pagamento: string | null // solo pagamenti
  metodo: MetodoPagamentoDipendente | null // solo pagamenti
  note: string | null
}

export interface AltroDipendenteCompleto {
  dipendente: AltroDipendente
  movimenti: MovimentoAltroDipendente[]
}
```

- [ ] **Step 2: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: exit 0 (nessun errore).

- [ ] **Step 3: Commit**

```bash
git add types/dipendente.ts
git commit -m "feat: altri dipendenti - tipi"
```

---

### Task 3: Logica di calcolo pura

**Files:**
- Create: `lib/altri-dipendenti.ts`
- Test (temporaneo): `scripts/_verify_altri.ts`

**Interfaces:**
- Consumes: `AltroDipendente`, `CadenzaAltro`, `MovimentoAltroDipendente` da `@/types/dipendente`.
- Produces: `CADENZA_LABELS`, `normalizzaPeriodo(data, cadenza) → string`, `RigaAltro`, `calcolaRigheAltro(movimenti) → RigaAltro[]`, `SaldoAltro`, `AltroDipendenteConSaldo`, `calcolaSaldoAltro(movimenti) → SaldoAltro`, `formatPeriodoAltro(periodo, cadenza) → string`.

- [ ] **Step 1: Scrivi `lib/altri-dipendenti.ts`**

```typescript
import type {
  AltroDipendente,
  CadenzaAltro,
  MovimentoAltroDipendente,
} from '@/types/dipendente'

export const CADENZA_LABELS: Record<CadenzaAltro, string> = {
  settimanale: 'Settimanale',
  mensile: 'Mensile',
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

/**
 * Normalizza una data ('YYYY-MM-DD') nella chiave-periodo canonica secondo la cadenza:
 * - mensile → primo giorno del mese ('YYYY-MM-01')
 * - settimanale → lunedì della settimana (lun–dom) che contiene la data
 * Usa UTC per evitare slittamenti di fuso orario.
 */
export function normalizzaPeriodo(data: string, cadenza: CadenzaAltro): string {
  const [y, m, d] = data.split('-').map(Number)
  if (cadenza === 'mensile') {
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=domenica … 6=sabato
  const diff = dow === 0 ? -6 : 1 - dow // porta al lunedì
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
}

export interface RigaAltro {
  periodo: string // chiave canonica
  stipendi: MovimentoAltroDipendente[]
  pagamenti: MovimentoAltroDipendente[]
  dovuto: number
  pagato: number
  residuo: number
}

/**
 * Raggruppa i movimenti per periodo canonico e calcola i residui.
 * Righe ordinate dal periodo più recente; include periodi con soli pagamenti
 * (dovuto 0 → residuo negativo).
 */
export function calcolaRigheAltro(movimenti: MovimentoAltroDipendente[]): RigaAltro[] {
  const mappa = new Map<string, RigaAltro>()
  const getRiga = (periodo: string): RigaAltro => {
    let r = mappa.get(periodo)
    if (!r) {
      r = { periodo, stipendi: [], pagamenti: [], dovuto: 0, pagato: 0, residuo: 0 }
      mappa.set(periodo, r)
    }
    return r
  }

  for (const m of movimenti) {
    const r = getRiga(m.periodo)
    if (m.tipo === 'stipendio') {
      r.stipendi.push(m)
      r.dovuto += Number(m.importo)
    } else {
      r.pagamenti.push(m)
      r.pagato += Number(m.importo)
    }
  }

  const righe = [...mappa.values()]
  for (const r of righe) {
    r.dovuto = arrotonda(r.dovuto)
    r.pagato = arrotonda(r.pagato)
    r.residuo = arrotonda(r.dovuto - r.pagato)
    r.stipendi.sort((a, b) => a.created_at.localeCompare(b.created_at))
    r.pagamenti.sort((a, b) => (a.data_pagamento ?? '').localeCompare(b.data_pagamento ?? ''))
  }
  righe.sort((a, b) => b.periodo.localeCompare(a.periodo))
  return righe
}

export interface SaldoAltro {
  dovuto: number
  pagato: number
  residuo: number
  periodi_aperti: number
}

export type AltroDipendenteConSaldo = AltroDipendente & SaldoAltro

export function calcolaSaldoAltro(movimenti: MovimentoAltroDipendente[]): SaldoAltro {
  const righe = calcolaRigheAltro(movimenti)
  const dovuto = arrotonda(righe.reduce((s, r) => s + r.dovuto, 0))
  const pagato = arrotonda(righe.reduce((s, r) => s + r.pagato, 0))
  return {
    dovuto,
    pagato,
    residuo: arrotonda(dovuto - pagato),
    periodi_aperti: righe.filter((r) => r.residuo > 0).length,
  }
}

/** Etichetta leggibile del periodo secondo la cadenza. */
export function formatPeriodoAltro(periodo: string, cadenza: CadenzaAltro): string {
  const [y, m, d] = periodo.split('-').map(Number)
  if (cadenza === 'mensile') {
    return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  }
  const lun = new Date(y, m - 1, d)
  const dom = new Date(y, m - 1, d + 6)
  const f = (x: Date) => x.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
  return `Settimana dal ${f(lun)} al ${f(dom)}`
}
```

- [ ] **Step 2: Scrivi lo script di verifica temporaneo `scripts/_verify_altri.ts`**

```typescript
import assert from 'node:assert'
import {
  normalizzaPeriodo,
  calcolaRigheAltro,
  calcolaSaldoAltro,
  formatPeriodoAltro,
} from '../lib/altri-dipendenti'
import type { MovimentoAltroDipendente } from '../types/dipendente'

// normalizzaPeriodo
assert.equal(normalizzaPeriodo('2026-07-12', 'mensile'), '2026-07-01')
assert.equal(normalizzaPeriodo('2026-07-12', 'settimanale'), '2026-07-06') // domenica → lunedì 06
assert.equal(normalizzaPeriodo('2026-07-08', 'settimanale'), '2026-07-06') // mercoledì → lunedì 06
assert.equal(normalizzaPeriodo('2026-07-06', 'settimanale'), '2026-07-06') // lunedì → resta
assert.equal(normalizzaPeriodo('2026-07-13', 'settimanale'), '2026-07-13') // lunedì successivo

const mk = (o: Partial<MovimentoAltroDipendente>): MovimentoAltroDipendente => ({
  id: o.id ?? 'x', organization_id: 'o', altro_dipendente_id: 'a',
  tipo: o.tipo ?? 'stipendio', periodo: o.periodo ?? '2026-07-06',
  importo: o.importo ?? 0, data_pagamento: o.data_pagamento ?? null,
  metodo: o.metodo ?? null, note: null, created_at: o.created_at ?? '2026-07-06T00:00:00Z',
})

const movimenti = [
  mk({ tipo: 'stipendio', periodo: '2026-07-06', importo: 400 }),
  mk({ tipo: 'pagamento', periodo: '2026-07-06', importo: 150, data_pagamento: '2026-07-07' }),
  mk({ tipo: 'stipendio', periodo: '2026-07-13', importo: 400 }),
]
const righe = calcolaRigheAltro(movimenti)
assert.equal(righe.length, 2)
assert.equal(righe[0].periodo, '2026-07-13') // più recente prima
assert.equal(righe[1].dovuto, 400)
assert.equal(righe[1].pagato, 150)
assert.equal(righe[1].residuo, 250)

const saldo = calcolaSaldoAltro(movimenti)
assert.equal(saldo.dovuto, 800)
assert.equal(saldo.pagato, 150)
assert.equal(saldo.residuo, 650)
assert.equal(saldo.periodi_aperti, 2)

assert.equal(formatPeriodoAltro('2026-07-01', 'mensile'), 'luglio 2026')
assert.equal(formatPeriodoAltro('2026-07-06', 'settimanale'), 'Settimana dal 06/07 al 12/07')

console.log('OK — tutte le asserzioni passate')
```

- [ ] **Step 3: Esegui lo script di verifica**

Run: `npx tsx scripts/_verify_altri.ts`
Expected: stampa `OK — tutte le asserzioni passate` senza `AssertionError`.
(Se `tsx` non è disponibile, `npx tsx` lo scarica al volo; in mancanza di rete usare `npx ts-node --esm`.)

- [ ] **Step 4: Verifica tipi e lint**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Rimuovi lo script temporaneo e committa**

```bash
rm scripts/_verify_altri.ts
git add lib/altri-dipendenti.ts
git commit -m "feat: altri dipendenti - logica calcolo saldo per periodo"
```

---

### Task 4: Server Actions

**Files:**
- Create: `actions/altri-dipendenti.ts`

**Interfaces:**
- Consumes: `assertAccessoDipendenti` da `@/lib/permessi-dipendenti`; `calcolaSaldoAltro`, `normalizzaPeriodo`, `AltroDipendenteConSaldo` da `@/lib/altri-dipendenti`; tipi da `@/types/dipendente`.
- Produces: `getAltriDipendentiConSaldi()`, `getAltroDipendenteCompleto(id)`, `createAltroDipendente(input)`, `updateAltroDipendente(id, input)`, `deleteAltroDipendente(id)`, `addMovimentoAltro(input)`, `deleteMovimentoAltro(id)`.

- [ ] **Step 1: Scrivi `actions/altri-dipendenti.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { assertAccessoDipendenti } from '@/lib/permessi-dipendenti'
import {
  calcolaSaldoAltro,
  normalizzaPeriodo,
  type AltroDipendenteConSaldo,
} from '@/lib/altri-dipendenti'
import type {
  AltroDipendente,
  AltroDipendenteCompleto,
  AltroDipendenteInput,
  CadenzaAltro,
  MovimentoAltroDipendente,
  MovimentoAltroInput,
} from '@/types/dipendente'

export async function getAltriDipendentiConSaldi(): Promise<AltroDipendenteConSaldo[]> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const [dipRes, movRes] = await Promise.all([
    supabase.from('altri_dipendenti').select('*').eq('organization_id', orgId).order('cognome'),
    supabase.from('movimenti_altro_dipendente').select('*').eq('organization_id', orgId),
  ])
  if (dipRes.error) throw new Error(dipRes.error.message)
  if (movRes.error) throw new Error(movRes.error.message)
  const dip = dipRes.data as AltroDipendente[]
  const mov = movRes.data as MovimentoAltroDipendente[]
  return dip.map((d) => ({
    ...d,
    ...calcolaSaldoAltro(mov.filter((m) => m.altro_dipendente_id === d.id)),
  }))
}

export async function getAltroDipendenteCompleto(id: string): Promise<AltroDipendenteCompleto | null> {
  const { supabase, orgId } = await assertAccessoDipendenti()
  const { data: dip, error } = await supabase
    .from('altri_dipendenti')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!dip) return null
  const { data: mov, error: e2 } = await supabase
    .from('movimenti_altro_dipendente')
    .select('*')
    .eq('organization_id', orgId)
    .eq('altro_dipendente_id', id)
  if (e2) throw new Error(e2.message)
  return {
    dipendente: dip as AltroDipendente,
    movimenti: (mov ?? []) as MovimentoAltroDipendente[],
  }
}

export async function createAltroDipendente(input: AltroDipendenteInput): Promise<AltroDipendente> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { data, error } = await supabase
    .from('altri_dipendenti')
    .insert({ organization_id: orgId, ...input })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
  return data as AltroDipendente
}

export async function updateAltroDipendente(id: string, input: AltroDipendenteInput): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('altri_dipendenti')
    .update(input)
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteAltroDipendente(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('altri_dipendenti')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function addMovimentoAltro(input: MovimentoAltroInput): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  // Recupera la cadenza per normalizzare il periodo e verifica l'appartenenza all'org.
  const { data: dip, error: eDip } = await supabase
    .from('altri_dipendenti')
    .select('cadenza')
    .eq('organization_id', orgId)
    .eq('id', input.altro_dipendente_id)
    .maybeSingle()
  if (eDip) throw new Error(eDip.message)
  if (!dip) throw new Error('Dipendente non trovato')
  const periodo = normalizzaPeriodo(input.data_periodo, (dip as { cadenza: CadenzaAltro }).cadenza)
  const { error } = await supabase.from('movimenti_altro_dipendente').insert({
    organization_id: orgId,
    altro_dipendente_id: input.altro_dipendente_id,
    tipo: input.tipo,
    periodo,
    importo: input.importo,
    data_pagamento: input.tipo === 'pagamento' ? input.data_pagamento : null,
    metodo: input.tipo === 'pagamento' ? input.metodo : null,
    note: input.note,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}

export async function deleteMovimentoAltro(id: string): Promise<void> {
  const { supabase, orgId } = await assertAccessoDipendenti(true)
  const { error } = await supabase
    .from('movimenti_altro_dipendente')
    .delete()
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dipendenti', 'layout')
}
```

- [ ] **Step 2: Verifica tipi e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: `tsc` exit 0; `lint` senza errori su `actions/altri-dipendenti.ts`.

- [ ] **Step 3: Commit**

```bash
git add actions/altri-dipendenti.ts
git commit -m "feat: altri dipendenti - server actions CRUD + movimenti"
```

---

### Task 5: Lista + dialog + pulsante nero

**Files:**
- Create: `components/dipendenti/DialogAltroDipendente.tsx`
- Create: `components/dipendenti/PaginaAltriDipendenti.tsx`
- Create: `app/(dashboard)/dipendenti/altri/page.tsx`
- Modify: `components/dipendenti/PaginaDipendenti.tsx` (aggiungi pulsante nero accanto a "+ Nuovo dipendente")

**Interfaces:**
- Consumes: `createAltroDipendente`, `updateAltroDipendente`, `getAltriDipendentiConSaldi` da `@/actions/altri-dipendenti`; `CADENZA_LABELS`, `AltroDipendenteConSaldo` da `@/lib/altri-dipendenti`; `AltroDipendente`, `AltroDipendenteInput`, `CadenzaAltro` da `@/types/dipendente`; `formatEuro` da `@/lib/pricing`; `cn` da `@/lib/utils`.
- Produces: componente `PaginaAltriDipendenti({ dipendenti })`, `DialogAltroDipendente({ open, onOpenChange, dipendente, onSaved? })`, rotta `/dipendenti/altri`.

- [ ] **Step 1: Scrivi `components/dipendenti/DialogAltroDipendente.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createAltroDipendente, updateAltroDipendente } from '@/actions/altri-dipendenti'
import { CADENZA_LABELS } from '@/lib/altri-dipendenti'
import type { AltroDipendente, AltroDipendenteInput, CadenzaAltro } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendente: AltroDipendente | null
  onSaved?: (d: AltroDipendente) => void
}

const emptyForm = (): AltroDipendenteInput => ({
  nome: '',
  cognome: '',
  cadenza: 'mensile',
  attivo: true,
  note: null,
})

export default function DialogAltroDipendente({ open, onOpenChange, dipendente, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<AltroDipendenteInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        dipendente
          ? {
              nome: dipendente.nome,
              cognome: dipendente.cognome,
              cadenza: dipendente.cadenza,
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
        await updateAltroDipendente(dipendente.id, form)
        toast.success('Dipendente aggiornato')
        onSaved?.({ ...dipendente, ...form })
      } else {
        const nuovo = await createAltroDipendente(form)
        toast.success('Dipendente creato')
        onSaved?.(nuovo)
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dipendente ? 'Modifica dipendente' : 'Nuovo altro dipendente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="alt-nome">Nome *</Label>
              <Input id="alt-nome" value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="alt-cognome">Cognome *</Label>
              <Input id="alt-cognome" value={form.cognome}
                onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cadenza *</Label>
            <Select value={form.cadenza}
              onValueChange={(v) => setForm((f) => ({ ...f, cadenza: v as CadenzaAltro }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CADENZA_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alt-note">Note</Label>
            <Input id="alt-note" value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value || null }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.attivo}
              onChange={(e) => setForm((f) => ({ ...f, attivo: e.target.checked }))} />
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

- [ ] **Step 2: Scrivi `components/dipendenti/PaginaAltriDipendenti.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import { CADENZA_LABELS, type AltroDipendenteConSaldo } from '@/lib/altri-dipendenti'
import DialogAltroDipendente from './DialogAltroDipendente'

interface Props {
  dipendenti: AltroDipendenteConSaldo[]
}

export default function PaginaAltriDipendenti({ dipendenti }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Altri dipendenti</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo altro dipendente
        </Button>
      </div>

      {dipendenti.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessun altro dipendente. Creane uno per registrare stipendi e pagamenti a mano.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">Dipendente</th>
                <th className="px-3 py-2">Cadenza</th>
                <th className="px-3 py-2 text-right">Dovuto</th>
                <th className="px-3 py-2 text-right">Pagato</th>
                <th className="px-3 py-2 text-right">Da pagare</th>
              </tr>
            </thead>
            <tbody>
              {dipendenti.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/dipendenti/altri/${d.id}`)}
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
                  <td className="px-3 py-2.5">{CADENZA_LABELS[d.cadenza]}</td>
                  <td className="px-3 py-2.5 text-right">{formatEuro(d.dovuto)}</td>
                  <td className="px-3 py-2.5 text-right">{formatEuro(d.pagato)}</td>
                  <td className={cn(
                    'px-3 py-2.5 text-right font-semibold',
                    d.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400',
                  )}>
                    {formatEuro(d.residuo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogAltroDipendente open={dialogOpen} onOpenChange={setDialogOpen} dipendente={null} />
    </div>
  )
}
```

- [ ] **Step 3: Scrivi `app/(dashboard)/dipendenti/altri/page.tsx`**

```tsx
import { getAltriDipendentiConSaldi } from '@/actions/altri-dipendenti'
import PaginaAltriDipendenti from '@/components/dipendenti/PaginaAltriDipendenti'

export const dynamic = 'force-dynamic'

export default async function AltriDipendentiPage() {
  const dipendenti = await getAltriDipendentiConSaldi()
  return <PaginaAltriDipendenti dipendenti={dipendenti} />
}
```

- [ ] **Step 4: Aggiungi il pulsante nero in `components/dipendenti/PaginaDipendenti.tsx`**

Modifica l'import di `lucide-react` per aggiungere `Users`:

```tsx
import { Plus, Upload, Users } from 'lucide-react'
```

Sostituisci il blocco dei pulsanti azione (`<div className="flex gap-2"> … </div>`) con:

```tsx
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dipendenti/carica">
              <Upload className="h-4 w-4 mr-2" /> Carica documenti
            </Link>
          </Button>
          <Button asChild className="bg-black text-white hover:bg-black/90">
            <Link href="/dipendenti/altri">
              <Users className="h-4 w-4 mr-2" /> Altri Dipendenti
            </Link>
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo dipendente
          </Button>
        </div>
```

- [ ] **Step 5: Verifica tipi e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: `tsc` exit 0; `lint` senza errori sui file toccati.

- [ ] **Step 6: Smoke test in dev**

Run: `npm run dev` → apri `/dipendenti`. Verifica: pulsante nero "Altri Dipendenti" accanto a "+ Nuovo dipendente"; il click porta a `/dipendenti/altri`; "Nuovo altro dipendente" apre il dialog; creando un dipendente (es. cadenza settimanale) appare nella tabella con saldo a 0.

- [ ] **Step 7: Commit**

```bash
git add components/dipendenti/DialogAltroDipendente.tsx components/dipendenti/PaginaAltriDipendenti.tsx "app/(dashboard)/dipendenti/altri/page.tsx" components/dipendenti/PaginaDipendenti.tsx
git commit -m "feat: altri dipendenti - lista, dialog anagrafica e pulsante nero"
```

---

### Task 6: Dettaglio + movimenti (stipendi/pagamenti)

**Files:**
- Create: `components/dipendenti/DialogMovimento.tsx`
- Create: `components/dipendenti/DettaglioAltroDipendente.tsx`
- Create: `app/(dashboard)/dipendenti/altri/[id]/page.tsx`

**Interfaces:**
- Consumes: `addMovimentoAltro`, `deleteMovimentoAltro`, `deleteAltroDipendente`, `getAltroDipendenteCompleto` da `@/actions/altri-dipendenti`; `calcolaRigheAltro`, `calcolaSaldoAltro`, `formatPeriodoAltro`, `normalizzaPeriodo`, `CADENZA_LABELS` da `@/lib/altri-dipendenti`; tipi da `@/types/dipendente`; `formatEuro` da `@/lib/pricing`; `cn` da `@/lib/utils`.
- Produces: componente `DettaglioAltroDipendente({ dipendente, movimenti })`, `DialogMovimento({ open, onOpenChange, dipendente, tipo })`, rotta `/dipendenti/altri/[id]`.

- [ ] **Step 1: Scrivi `components/dipendenti/DialogMovimento.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { addMovimentoAltro } from '@/actions/altri-dipendenti'
import { formatPeriodoAltro, normalizzaPeriodo } from '@/lib/altri-dipendenti'
import type {
  AltroDipendente, MetodoPagamentoDipendente, TipoMovimentoAltro,
} from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendente: AltroDipendente
  tipo: TipoMovimentoAltro
}

const oggi = () => new Date().toISOString().slice(0, 10)

const METODI: { value: MetodoPagamentoDipendente; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti' },
  { value: 'altro', label: 'Altro' },
]

export default function DialogMovimento({ open, onOpenChange, dipendente, tipo }: Props) {
  const router = useRouter()
  const [dataPeriodo, setDataPeriodo] = useState(oggi())
  const [importo, setImporto] = useState('')
  const [dataPagamento, setDataPagamento] = useState(oggi())
  const [metodo, setMetodo] = useState<MetodoPagamentoDipendente>('bonifico')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setDataPeriodo(oggi())
      setImporto('')
      setDataPagamento(oggi())
      setMetodo('bonifico')
      setNote('')
    }
  }, [open])

  const etichettaPeriodo = formatPeriodoAltro(
    normalizzaPeriodo(dataPeriodo, dipendente.cadenza),
    dipendente.cadenza,
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const imp = parseFloat(importo.replace(',', '.'))
    if (!imp || imp <= 0) {
      toast.error('Importo non valido')
      return
    }
    setLoading(true)
    try {
      await addMovimentoAltro({
        altro_dipendente_id: dipendente.id,
        tipo,
        data_periodo: dataPeriodo,
        importo: imp,
        data_pagamento: tipo === 'pagamento' ? dataPagamento : null,
        metodo: tipo === 'pagamento' ? metodo : null,
        note: note || null,
      })
      toast.success(tipo === 'stipendio' ? 'Stipendio aggiunto' : 'Pagamento aggiunto')
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo === 'stipendio' ? 'Aggiungi stipendio' : 'Aggiungi pagamento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mov-periodo">
              {tipo === 'stipendio' ? 'Periodo' : 'Periodo di competenza'} *
            </Label>
            <Input id="mov-periodo" type="date" value={dataPeriodo}
              onChange={(e) => setDataPeriodo(e.target.value)} />
            <p className="text-xs text-muted-foreground">{etichettaPeriodo}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mov-importo">Importo (€) *</Label>
            <Input id="mov-importo" inputMode="decimal" value={importo}
              onChange={(e) => setImporto(e.target.value)} />
          </div>
          {tipo === 'pagamento' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="mov-datapag">Data pagamento *</Label>
                <Input id="mov-datapag" type="date" value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)} />
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
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="mov-note">Note</Label>
            <Input id="mov-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : 'Salva'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Scrivi `components/dipendenti/DettaglioAltroDipendente.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Banknote, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import {
  calcolaRigheAltro, calcolaSaldoAltro, formatPeriodoAltro, CADENZA_LABELS,
} from '@/lib/altri-dipendenti'
import { deleteAltroDipendente, deleteMovimentoAltro } from '@/actions/altri-dipendenti'
import type { AltroDipendente, MovimentoAltroDipendente } from '@/types/dipendente'
import DialogAltroDipendente from './DialogAltroDipendente'
import DialogMovimento from './DialogMovimento'

interface Props {
  dipendente: AltroDipendente
  movimenti: MovimentoAltroDipendente[]
}

export default function DettaglioAltroDipendente({ dipendente, movimenti }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [movOpen, setMovOpen] = useState(false)
  const [movTipo, setMovTipo] = useState<'stipendio' | 'pagamento'>('stipendio')

  const righe = calcolaRigheAltro(movimenti)
  const saldo = calcolaSaldoAltro(movimenti)

  const apriMovimento = (tipo: 'stipendio' | 'pagamento') => {
    setMovTipo(tipo)
    setMovOpen(true)
  }

  const rimuoviMovimento = async (id: string) => {
    if (!window.confirm('Eliminare questa voce?')) return
    try {
      await deleteMovimentoAltro(id)
      toast.success('Voce eliminata')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    }
  }

  const rimuoviDipendente = async () => {
    if (!window.confirm('Eliminare il dipendente e tutte le sue voci?')) return
    try {
      await deleteAltroDipendente(dipendente.id)
      toast.success('Dipendente eliminato')
      router.push('/dipendenti/altri')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti/altri"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{dipendente.cognome} {dipendente.nome}</h1>
            <p className="text-sm text-gray-500">
              {CADENZA_LABELS[dipendente.cadenza]}
              {!dipendente.attivo ? ' · NON ATTIVO' : ''}
              {dipendente.note ? ` · ${dipendente.note}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => apriMovimento('stipendio')}>
            <Plus className="h-4 w-4 mr-2" /> Aggiungi stipendio
          </Button>
          <Button variant="outline" onClick={() => apriMovimento('pagamento')}>
            <Banknote className="h-4 w-4 mr-2" /> Aggiungi pagamento
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifica
          </Button>
          <Button variant="outline" onClick={rimuoviDipendente}>
            <Trash2 className="h-4 w-4 mr-2" /> Elimina
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500 uppercase">Dovuto</p>
          <p className="text-lg font-semibold">{formatEuro(saldo.dovuto)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500 uppercase">Pagato</p>
          <p className="text-lg font-semibold">{formatEuro(saldo.pagato)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500 uppercase">Da pagare</p>
          <p className={cn('text-lg font-semibold',
            saldo.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
            {formatEuro(saldo.residuo)}
          </p>
        </div>
      </div>

      {righe.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessuna voce. Aggiungi uno stipendio o un pagamento.
        </p>
      ) : (
        <div className="space-y-3">
          {righe.map((r) => (
            <div key={r.periodo} className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-gray-50 dark:bg-gray-900 px-3 py-2">
                <span className="text-sm font-semibold">
                  {formatPeriodoAltro(r.periodo, dipendente.cadenza)}
                </span>
                <span className={cn('text-sm font-semibold',
                  r.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                  Residuo {formatEuro(r.residuo)}
                </span>
              </div>
              <div className="divide-y">
                {r.stipendi.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>Stipendio{m.note ? ` · ${m.note}` : ''}</span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatEuro(Number(m.importo))}</span>
                      <button onClick={() => rimuoviMovimento(m.id)} aria-label="Elimina"
                        className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ))}
                {r.pagamenti.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-green-700 dark:text-green-400">
                      Pagamento{m.data_pagamento ? ` · ${m.data_pagamento}` : ''}
                      {m.metodo ? ` · ${m.metodo}` : ''}{m.note ? ` · ${m.note}` : ''}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums text-green-700 dark:text-green-400">
                        {formatEuro(Number(m.importo))}
                      </span>
                      <button onClick={() => rimuoviMovimento(m.id)} aria-label="Elimina"
                        className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <DialogAltroDipendente open={editOpen} onOpenChange={setEditOpen} dipendente={dipendente} />
      <DialogMovimento open={movOpen} onOpenChange={setMovOpen} dipendente={dipendente} tipo={movTipo} />
    </div>
  )
}
```

- [ ] **Step 3: Scrivi `app/(dashboard)/dipendenti/altri/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { getAltroDipendenteCompleto } from '@/actions/altri-dipendenti'
import DettaglioAltroDipendente from '@/components/dipendenti/DettaglioAltroDipendente'

export const dynamic = 'force-dynamic'

export default async function AltroDipendentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getAltroDipendenteCompleto(id)
  if (!data) notFound()
  return <DettaglioAltroDipendente dipendente={data.dipendente} movimenti={data.movimenti} />
}
```

- [ ] **Step 4: Verifica tipi e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: `tsc` exit 0; `lint` senza errori sui file nuovi.

- [ ] **Step 5: Build di produzione**

Run: `RESEND_API_KEY=re_test npm run build`
Expected: build completata senza errori.

- [ ] **Step 6: Smoke test in dev (flusso completo)**

Run: `npm run dev`. Crea un "altro dipendente" settimanale → apri il dettaglio → "Aggiungi stipendio" (data qualsiasi, importo 400): verifica l'etichetta "Settimana dal lun … al dom …" e che compaia una riga periodo con residuo 400. "Aggiungi pagamento" (stessa settimana, 150): il residuo del periodo diventa 250 e il riquadro "Da pagare" si aggiorna. Elimina una voce e verifica il ricalcolo. Ripeti con un dipendente mensile (etichetta "mese anno").

- [ ] **Step 7: Commit**

```bash
git add components/dipendenti/DialogMovimento.tsx components/dipendenti/DettaglioAltroDipendente.tsx "app/(dashboard)/dipendenti/altri/[id]/page.tsx"
git commit -m "feat: altri dipendenti - dettaglio con stipendi/pagamenti e residuo per periodo"
```

---

## Self-Review

**Spec coverage:**
- Tabelle `altri_dipendenti` + `movimenti_altro_dipendente` con RLS → Task 1 ✓
- Tipi → Task 2 ✓
- Normalizzazione periodo (mensile/settimanale lun–dom), calcolo residuo per periodo, saldo → Task 3 ✓
- CRUD dipendente + movimenti, permesso `dipendenti`, normalizzazione server-side → Task 4 ✓
- Pulsante nero accanto a "+ Nuovo dipendente", lista `/dipendenti/altri`, dialog anagrafica → Task 5 ✓
- Dettaglio con "Aggiungi stipendio"/"Aggiungi pagamento", tabella periodi con dovuto/pagato/residuo, eliminazione voci, competenza≠data pagamento → Task 6 ✓
- Fuori scope (no PDF/anteprime, no cadenza mista, no statistiche ora) → rispettato ✓

**Placeholder scan:** nessun TBD/TODO; codice completo in ogni step. ✓

**Type consistency:** `AltroDipendenteConSaldo` (lib) usata in action e componenti; `MovimentoAltroInput.data_periodo` prodotto da `DialogMovimento` e consumato da `addMovimentoAltro`; `normalizzaPeriodo`/`formatPeriodoAltro`/`calcolaRigheAltro`/`calcolaSaldoAltro` firme coerenti tra Task 3, 4, 6. ✓
