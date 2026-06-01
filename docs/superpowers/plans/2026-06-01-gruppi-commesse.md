# Gruppi Commesse (Blocchi per Anno) — Piano di Implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere la gestione a due livelli delle commesse — pagina indice con "blocchi" rinominabili (es. "2025", "2026"), ognuno contenente la lista commesse filtrata.

**Architecture:** Nuova tabella `gruppi_commesse` con FK su `commesse.gruppo_id`. La pagina `/commesse` diventa l'indice dei blocchi; `/commesse/[gruppoId]` contiene la lista filtrata. Migrazione dati non-distruttiva: le commesse esistenti vengono assegnate a un gruppo "2026" creato automaticamente.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), TypeScript, shadcn/ui, Tailwind

---

## Mappa file

| File | Azione | Descrizione |
|------|--------|-------------|
| `supabase/migrations/20260601000000_gruppi_commesse.sql` | Crea | Tabella + FK + migrazione dati |
| `types/commessa.ts` | Modifica | Aggiunge `GruppoCommesse`, `gruppo_id` su `Commessa` e `CommessaInput` |
| `actions/commesse.ts` | Modifica | Nuove actions gruppi + update `getCommesse`/`createCommessa`/`duplicaCommessa` |
| `components/commesse/DialogGruppo.tsx` | Crea | Dialog create/rename blocco |
| `components/commesse/GruppiCommesse.tsx` | Crea | Griglia card blocchi |
| `app/(dashboard)/commesse/[gruppoId]/page.tsx` | Crea | Lista commesse del blocco (ex page.tsx) |
| `app/(dashboard)/commesse/page.tsx` | Modifica | Diventa pagina indice blocchi |
| `components/commesse/TabellaCommesse.tsx` | Modifica | Aggiunge props `gruppi`/`gruppoCorrenteId` e menu "Sposta in..." |
| `components/commesse/DialogCommessa.tsx` | Modifica | Aggiunge prop `gruppoId`, lo passa a `createCommessa` |

---

## Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/20260601000000_gruppi_commesse.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- Tabella blocchi commesse
CREATE TABLE gruppi_commesse (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE gruppi_commesse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON gruppi_commesse
  FOR ALL USING (organization_id = get_org_id());

-- FK su commesse (nullable: nessuna commessa esistente viene rifiutata)
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS gruppo_id uuid REFERENCES gruppi_commesse(id);

-- Seed: crea gruppo "2026" per ogni org che ha commesse (idempotente)
INSERT INTO gruppi_commesse (organization_id, nome, ordine)
SELECT DISTINCT c.organization_id, '2026', 0
FROM commesse c
WHERE c.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gruppi_commesse g
    WHERE g.organization_id = c.organization_id AND g.nome = '2026'
  );

-- Assegna le commesse esistenti al gruppo "2026" della loro org
UPDATE commesse c
SET gruppo_id = g.id
FROM gruppi_commesse g
WHERE g.organization_id = c.organization_id
  AND g.nome = '2026'
  AND c.gruppo_id IS NULL;
```

---

## Task 2: Applica migration a Supabase

**Files:** nessuno (operazione DB)

- [ ] **Step 1: Applica via Supabase MCP**

Usa il tool `mcp__claude_ai_Supabase__apply_migration` con:
- `project_id`: `xawyrtqclpeylxnhwhwo`
- `name`: `20260601000000_gruppi_commesse`
- `query`: il contenuto SQL del Task 1

- [ ] **Step 2: Verifica**

Usa `mcp__claude_ai_Supabase__execute_sql` con query:
```sql
SELECT COUNT(*) as gruppi FROM gruppi_commesse;
SELECT COUNT(*) as commesse_senza_gruppo FROM commesse WHERE gruppo_id IS NULL;
```
Atteso: `commesse_senza_gruppo = 0` (tutte assegnate).

---

## Task 3: Aggiorna `types/commessa.ts`

**Files:**
- Modify: `types/commessa.ts`

- [ ] **Step 1: Aggiungi tipo `GruppoCommesse` dopo le import (in cima al file)**

```typescript
export type GruppoCommesse = {
  id: string
  organization_id: string
  nome: string
  ordine: number
  created_at: string
}
```

- [ ] **Step 2: Aggiungi `gruppo_id` al tipo `Commessa`**

Nel tipo `Commessa` (dopo `reparti: Reparto[]`), aggiungi:
```typescript
  gruppo_id: string | null
```

- [ ] **Step 3: Aggiungi `gruppo_id` al tipo `CommessaInput`**

Nel tipo `CommessaInput` (dopo `reparti: Reparto[]`), aggiungi:
```typescript
  gruppo_id?: string
```

È opzionale per compatibilità con le commesse offline salvate in Dexie prima di questa feature.

- [ ] **Step 4: Commit**

```bash
git add types/commessa.ts
git commit -m "feat: aggiungi tipo GruppoCommesse e campo gruppo_id"
```

---

## Task 4: Nuove actions per i gruppi (`actions/commesse.ts`)

**Files:**
- Modify: `actions/commesse.ts`

- [ ] **Step 1: Aggiorna l'import dei tipi (in cima al file)**

Aggiungi `GruppoCommesse` all'import:
```typescript
import type {
  CommessaCompleta,
  CommessaInput,
  AccontoInput,
  PreventivoPerCommessa,
  UtentePerCommessa,
  PreventivoCommessa,
  GruppoCommesse,
} from '@/types/commessa'
```

- [ ] **Step 2: Aggiungi le nuove funzioni in fondo al file**

```typescript
export async function getGruppiCommesse(): Promise<GruppoCommesse[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('gruppi_commesse')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getGruppoCorrente(): Promise<GruppoCommesse | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('gruppi_commesse')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function createGruppo(nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: maxRow } = await supabase
    .from('gruppi_commesse')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrdine = (maxRow?.ordine ?? -1) + 1
  const { error } = await supabase
    .from('gruppi_commesse')
    .insert({ nome, organization_id: orgId, ordine: nextOrdine })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function renameGruppo(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gruppi_commesse')
    .update({ nome })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteGruppo(id: string): Promise<void> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('commesse')
    .select('*', { count: 'exact', head: true })
    .eq('gruppo_id', id)
  if ((count ?? 0) > 0)
    throw new Error('Il blocco contiene commesse. Spostale prima di eliminarlo.')
  const { error } = await supabase
    .from('gruppi_commesse')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function spostaCommessa(commessaId: string, gruppoId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ gruppo_id: gruppoId })
    .eq('id', commessaId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}
```

- [ ] **Step 3: Commit**

```bash
git add actions/commesse.ts
git commit -m "feat: actions getGruppiCommesse, createGruppo, renameGruppo, deleteGruppo, spostaCommessa"
```

---

## Task 5: Aggiorna funzioni esistenti in `actions/commesse.ts`

**Files:**
- Modify: `actions/commesse.ts`

- [ ] **Step 1: Aggiorna `getCommesse` — aggiungi parametro `gruppoId`**

Sostituisci la firma e la query principale:
```typescript
export async function getCommesse(gruppoId: string): Promise<CommessaCompleta[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [
    { data: commesse, error },
    { data: acconti },
    { data: documenti },
    { data: prevCollegati },
  ] = await Promise.all([
    supabase
      .from('commesse')
      .select('*')
      .eq('organization_id', orgId)
      .eq('gruppo_id', gruppoId)
      .order('ordine', { ascending: true }),
    supabase
      .from('acconti_commessa')
      .select('*')
      .eq('organization_id', orgId)
      .order('data_pagamento', { ascending: true }),
    supabase
      .from('documenti_commessa')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('preventivi_commessa')
      .select('*')
      .eq('organization_id', orgId)
      .order('ordine', { ascending: true }),
  ])
  // resto invariato...
```

Il corpo della funzione dopo le query (il blocco `return (commesse ?? []).map(...)`) resta identico a prima — non toccarlo.

- [ ] **Step 2: Aggiorna `createCommessa` — usa `gruppo_id` se presente, altrimenti gruppo corrente**

Sostituisci il corpo di `createCommessa`:
```typescript
export async function createCommessa(input: CommessaInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  let gruppoId = input.gruppo_id
  if (!gruppoId) {
    const corrente = await getGruppoCorrente()
    gruppoId = corrente?.id
  }

  const { data, error } = await supabase
    .from('commesse')
    .insert({ ...input, organization_id: orgId, gruppo_id: gruppoId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
  return { id: data.id }
}
```

- [ ] **Step 3: Aggiorna `duplicaCommessa` — copia `gruppo_id` dall'originale**

Nel blocco dell'insert di `duplicaCommessa`, aggiungi `gruppo_id: orig.gruppo_id` tra i campi:
```typescript
  const { data: nuova, error: insertError } = await supabase
    .from('commesse')
    .insert({
      organization_id: orgId,
      gruppo_id: orig.gruppo_id,          // ← aggiungi questa riga
      numero_commessa: orig.numero_commessa ? `${orig.numero_commessa} (copia)` : '',
      // ...resto invariato
    })
```

- [ ] **Step 4: Aggiorna le chiamate a `revalidatePath`**

In tutte le funzioni di `actions/commesse.ts`, cambia `revalidatePath('/commesse')` in `revalidatePath('/commesse', 'layout')` per invalidare l'intero albero di route commesse. Usa trova-e-sostituisci nel file.

- [ ] **Step 5: Commit**

```bash
git add actions/commesse.ts
git commit -m "feat: aggiorna getCommesse/createCommessa/duplicaCommessa per gruppi"
```

---

## Task 6: Crea `components/commesse/DialogGruppo.tsx`

**Files:**
- Create: `components/commesse/DialogGruppo.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createGruppo, renameGruppo } from '@/actions/commesse'
import type { GruppoCommesse } from '@/types/commessa'

interface Props {
  open: boolean
  mode: 'create' | 'rename'
  gruppo: GruppoCommesse | null
  onClose: () => void
}

export default function DialogGruppo({ open, mode, gruppo, onClose }: Props) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setNome(mode === 'rename' && gruppo ? gruppo.nome : '')
  }, [open, mode, gruppo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setLoading(true)
    try {
      if (mode === 'create') {
        await createGruppo(nome.trim())
        toast.success('Blocco creato')
      } else if (gruppo) {
        await renameGruppo(gruppo.id, nome.trim())
        toast.success('Blocco rinominato')
      }
      router.refresh()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nuovo blocco' : 'Rinomina blocco'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <Label htmlFor="nome-gruppo">Nome</Label>
            <Input
              id="nome-gruppo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="es. 2025"
              className="mt-1"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={!nome.trim() || loading}>
              {mode === 'create' ? 'Crea' : 'Salva'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/commesse/DialogGruppo.tsx
git commit -m "feat: DialogGruppo — dialog create/rename blocco commesse"
```

---

## Task 7: Crea `components/commesse/GruppiCommesse.tsx`

**Files:**
- Create: `components/commesse/GruppiCommesse.tsx`

- [ ] **Step 1: Crea il componente**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Plus, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteGruppo } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import DialogGruppo from './DialogGruppo'
import type { GruppoCommesse } from '@/types/commessa'

export type GruppoConStats = GruppoCommesse & { count: number; totale: number }

interface Props {
  gruppi: GruppoConStats[]
}

export default function GruppiCommesse({ gruppi }: Props) {
  const router = useRouter()
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null)
  const [gruppoSelezionato, setGruppoSelezionato] = useState<GruppoCommesse | null>(null)

  async function handleDelete(g: GruppoConStats) {
    if (g.count > 0) {
      toast.error('Sposta prima le commesse in un altro blocco')
      return
    }
    try {
      await deleteGruppo(g.id)
      toast.success('Blocco eliminato')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function openRename(e: React.MouseEvent, g: GruppoCommesse) {
    e.stopPropagation()
    setGruppoSelezionato(g)
    setDialogMode('rename')
  }

  function openDelete(e: React.MouseEvent, g: GruppoConStats) {
    e.stopPropagation()
    handleDelete(g)
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => { setGruppoSelezionato(null); setDialogMode('create') }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuovo blocco
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gruppi.map((g) => (
          <Card
            key={g.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/commesse/${g.id}`)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">{g.nome}</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => openRename(e, g)}>
                    Rinomina
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={g.count > 0}
                    className="text-red-600 focus:text-red-600 disabled:opacity-40"
                    onClick={(e) => openDelete(e, g)}
                  >
                    Elimina
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-gray-500">
                <FolderOpen className="h-4 w-4" />
                <span className="text-sm">{g.count} commesse</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-gray-900">
                {formatEuro(g.totale)}
              </p>
            </CardContent>
          </Card>
        ))}

        {gruppi.length === 0 && (
          <p className="text-gray-400 col-span-full text-center py-12">
            Nessun blocco. Creane uno per iniziare.
          </p>
        )}
      </div>

      <DialogGruppo
        open={dialogMode !== null}
        mode={dialogMode ?? 'create'}
        gruppo={gruppoSelezionato}
        onClose={() => setDialogMode(null)}
      />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/commesse/GruppiCommesse.tsx
git commit -m "feat: GruppiCommesse — griglia card blocchi con stats"
```

---

## Task 8: Crea `app/(dashboard)/commesse/[gruppoId]/page.tsx`

**Files:**
- Create: `app/(dashboard)/commesse/[gruppoId]/page.tsx`

Questo file è la lista commesse filtrata per blocco — è quasi identico al vecchio `page.tsx`.

- [ ] **Step 1: Crea la directory e il file**

```typescript
import { redirect } from 'next/navigation'
import {
  getCommesse,
  getPreventiviPerCommessa,
  getUtentiPerCommessa,
  getGruppiCommesse,
} from '@/actions/commesse'
import { getClienti } from '@/actions/clienti'
import TabellaCommesse from '@/components/commesse/TabellaCommesse'
import type { PreventivoPerCommessa, GruppoCommesse } from '@/types/commessa'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function CommesseGruppoPage({
  params,
  searchParams,
}: {
  params: Promise<{ gruppoId: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { gruppoId } = await params
  const sp = await searchParams

  const [commesse, preventivi, utenti, clienti, gruppi] = await Promise.all([
    getCommesse(gruppoId),
    getPreventiviPerCommessa(),
    getUtentiPerCommessa(),
    getClienti(),
    getGruppiCommesse(),
  ])

  const gruppoCorrente = gruppi.find((g) => g.id === gruppoId)
  if (!gruppoCorrente) redirect('/commesse')

  let preventivoDaConvertire: PreventivoPerCommessa | null = null
  if (sp.from) {
    preventivoDaConvertire = preventivi.find((p) => p.id === sp.from) ?? null
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <nav className="flex items-center gap-1 text-sm text-gray-500 mb-1">
          <Link href="/commesse" className="hover:text-gray-700">Commesse</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-gray-900 font-medium">{gruppoCorrente.nome}</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">{gruppoCorrente.nome}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gestione ordini confermati, acconti e documenti
        </p>
      </div>
      <TabellaCommesse
        commesse={commesse}
        preventivi={preventivi}
        utenti={utenti}
        clienti={clienti}
        preventivoDaConvertire={preventivoDaConvertire}
        gruppi={gruppi}
        gruppoCorrenteId={gruppoId}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/commesse/[gruppoId]/page.tsx"
git commit -m "feat: pagina lista commesse per blocco con breadcrumb"
```

---

## Task 9: Aggiorna `app/(dashboard)/commesse/page.tsx` — pagina indice

**Files:**
- Modify: `app/(dashboard)/commesse/page.tsx`

- [ ] **Step 1: Riscrivi il file**

```typescript
import { redirect } from 'next/navigation'
import { getGruppiCommesse, getGruppoCorrente } from '@/actions/commesse'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import GruppiCommesse from '@/components/commesse/GruppiCommesse'
import type { GruppoConStats } from '@/components/commesse/GruppiCommesse'

export default async function CommessePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const sp = await searchParams

  // Redirect da preventivo accettato → apre il blocco corrente
  if (sp.from) {
    const corrente = await getGruppoCorrente()
    if (corrente) redirect(`/commesse/${corrente.id}?from=${sp.from}`)
  }

  const gruppi = await getGruppiCommesse()

  // Statistiche aggregate: una sola query, raggruppamento in JS
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: statsRaw } = await supabase
    .from('commesse')
    .select('gruppo_id, totale')
    .eq('organization_id', orgId)

  const statsMap = new Map<string, { count: number; totale: number }>()
  for (const r of statsRaw ?? []) {
    if (!r.gruppo_id) continue
    const prev = statsMap.get(r.gruppo_id) ?? { count: 0, totale: 0 }
    statsMap.set(r.gruppo_id, {
      count: prev.count + 1,
      totale: prev.totale + Number(r.totale),
    })
  }

  const gruppiConStats: GruppoConStats[] = gruppi.map((g) => ({
    ...g,
    count: statsMap.get(g.id)?.count ?? 0,
    totale: statsMap.get(g.id)?.totale ?? 0,
  }))

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Commesse</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Seleziona un blocco per visualizzare le commesse
        </p>
      </div>
      <GruppiCommesse gruppi={gruppiConStats} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/commesse/page.tsx"
git commit -m "feat: pagina indice commesse con blocchi"
```

---

## Task 10: Aggiorna `TabellaCommesse.tsx` — props gruppi + menu "Sposta in..."

**Files:**
- Modify: `components/commesse/TabellaCommesse.tsx`

- [ ] **Step 1: Aggiungi import**

In cima al file, dopo `import type { CommessaCompleta, ... }` (riga 60), aggiungi `GruppoCommesse` all'import e `spostaCommessa` agli import delle actions:

```typescript
import type { CommessaCompleta, PreventivoPerCommessa, StatoCommessa, UtentePerCommessa, GruppoCommesse } from '@/types/commessa'
```

```typescript
import { deleteCommessa, duplicaCommessa, updateOrdineCommesse, updateStatoCommessa, spostaCommessa } from '@/actions/commesse'
```

Aggiungi anche `MoveRight` ai lucide imports (riga 9):
```typescript
import {
  Plus, Search, Trash2, LayoutList, Paperclip, FileText, Link2,
  GripVertical, MoreVertical, Copy, WifiOff, MoveRight,
} from 'lucide-react'
```

- [ ] **Step 2: Aggiorna l'interfaccia `Props` (riga 124)**

```typescript
interface Props {
  commesse: CommessaCompleta[]
  preventivi: PreventivoPerCommessa[]
  utenti: UtentePerCommessa[]
  clienti: Cliente[]
  preventivoDaConvertire?: PreventivoPerCommessa | null
  gruppi: GruppoCommesse[]
  gruppoCorrenteId: string
}
```

- [ ] **Step 3: Aggiorna `RowProps` (riga 164) — aggiungi `onSposta` e `altriGruppi`**

```typescript
interface RowProps {
  c: CommessaCompleta
  onScheda: () => void
  onDelete: () => void
  onDuplica: () => void
  onAcconto: () => void
  onDocumenti: () => void
  onPrevManuale: (numeroPrev: string | null) => void
  onStatoChange: (s: StatoCommessa) => void
  altriGruppi: GruppoCommesse[]
  onSposta: (gruppoId: string) => void
}
```

- [ ] **Step 4: Aggiorna la firma di `SortableRow` (riga 175)**

```typescript
function SortableRow({ c, onScheda, onDelete, onDuplica, onAcconto, onDocumenti, onPrevManuale, onStatoChange, altriGruppi, onSposta }: RowProps) {
```

- [ ] **Step 5: Aggiungi la voce "Sposta in..." nel `DropdownMenuContent` della riga (dopo riga 376, prima del separator rosso)**

Inserisci prima di `<DropdownMenuSeparator />` (riga 377):

```tsx
            {altriGruppi.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {altriGruppi.map((g) => (
                  <DropdownMenuItem key={g.id} onClick={() => onSposta(g.id)}>
                    <MoveRight className="h-3.5 w-3.5 mr-2" />
                    Sposta in {g.nome}
                  </DropdownMenuItem>
                ))}
              </>
            )}
```

Il blocco completo del DropdownMenuContent diventa:
```tsx
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onScheda}>
              <LayoutList className="h-3.5 w-3.5 mr-2" />
              Scheda
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplica}>
              <Copy className="h-3.5 w-3.5 mr-2" />
              Duplica
            </DropdownMenuItem>
            {altriGruppi.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {altriGruppi.map((g) => (
                  <DropdownMenuItem key={g.id} onClick={() => onSposta(g.id)}>
                    <MoveRight className="h-3.5 w-3.5 mr-2" />
                    Sposta in {g.nome}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
```

- [ ] **Step 6: Aggiorna il componente principale di `TabellaCommesse`**

Nella firma della funzione esportata, aggiungi i nuovi props:
```typescript
export default function TabellaCommesse({
  commesse,
  preventivi,
  utenti,
  clienti,
  preventivoDaConvertire,
  gruppi,
  gruppoCorrenteId,
}: Props) {
```

Aggiungi `altriGruppi` come costante derivata (dopo le dichiarazioni di state esistenti):
```typescript
  const altriGruppi = gruppi.filter((g) => g.id !== gruppoCorrenteId)
```

Aggiungi la funzione `handleSposta` (dopo `handleDuplica`):
```typescript
  async function handleSposta(commessaId: string, gruppoId: string) {
    try {
      await spostaCommessa(commessaId, gruppoId)
      toast.success('Commessa spostata')
      router.refresh()
    } catch {
      toast.error('Errore nello spostamento')
    }
  }
```

Aggiorna il render di `SortableRow` (riga ~640) per passare i nuovi props:
```tsx
                    <SortableRow
                      key={c.id}
                      c={c}
                      onScheda={() => setSchedaCommessaId(c.id)}
                      onDelete={() => setDeletingId(c.id)}
                      onDuplica={() => handleDuplica(c.id)}
                      onAcconto={() => setDialogAcconto(c)}
                      onDocumenti={() => setDialogDocumenti(c)}
                      onPrevManuale={(numeroPrev) => setDialogPrevManuale({ commessaId: c.id, numeroPrev })}
                      onStatoChange={(s) => handleStatoChange(c.id, s)}
                      altriGruppi={altriGruppi}
                      onSposta={(gId) => handleSposta(c.id, gId)}
                    />
```

- [ ] **Step 7: Passa `gruppoCorrenteId` a `DialogCommessa` nel render**

Trova il render di `<DialogCommessa ... />` nel file e aggiungi il prop:
```tsx
      <DialogCommessa
        ...props esistenti...
        gruppoId={gruppoCorrenteId}
      />
```

- [ ] **Step 8: Commit**

```bash
git add components/commesse/TabellaCommesse.tsx
git commit -m "feat: TabellaCommesse — menu Sposta in e prop gruppoCorrenteId"
```

---

## Task 11: Aggiorna `DialogCommessa.tsx` — usa `gruppoId`

**Files:**
- Modify: `components/commesse/DialogCommessa.tsx`

- [ ] **Step 1: Aggiungi `gruppoId` all'interfaccia `Props` (riga 62)**

```typescript
interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa?: CommessaCompleta | null
  preventivi: PreventivoPerCommessa[]
  utenti: UtentePerCommessa[]
  clienti: Cliente[]
  preventivoDaConvertire?: PreventivoPerCommessa | null
  gruppoId: string
}
```

- [ ] **Step 2: Distruggi `gruppoId` nella firma della funzione**

```typescript
export default function DialogCommessa({
  open,
  onOpenChange,
  commessa,
  preventivi,
  utenti,
  clienti,
  preventivoDaConvertire,
  gruppoId,
}: Props) {
```

- [ ] **Step 3: Aggiungi `gruppo_id` alla chiamata `createCommessa` (riga ~376)**

```typescript
        const { id: newId } = await createCommessa({ ...formFinale, gruppo_id: gruppoId })
```

- [ ] **Step 4: Commit**

```bash
git add components/commesse/DialogCommessa.tsx
git commit -m "feat: DialogCommessa — passa gruppo_id alla creazione"
```

---

## Task 12: Build check e commit finale

**Files:** nessuno

- [ ] **Step 1: Esegui la build**

```bash
npm run build
```

Atteso: zero errori TypeScript, zero warning `unused vars`.

Se ci sono errori di tipo relativi a `GruppoCommesse` non importato in qualche file, aggiungere l'import mancante.

- [ ] **Step 2: Verifica manuale rapida**

Apri `/commesse` — deve mostrare la card "2026" con il numero di commesse esistenti.
Clicca la card — deve aprire `/commesse/2026-uuid` con la tabella commesse.
Crea un nuovo blocco "2025" — deve apparire nella griglia.
Sposta una commessa nel blocco 2025 — deve sparire da 2026 e apparire in 2025.

- [ ] **Step 3: Commit finale**

```bash
git add -A
git commit -m "feat: modulo commesse con navigazione a blocchi (gruppi)"
```

- [ ] **Step 4: Push**

```bash
git push
```
