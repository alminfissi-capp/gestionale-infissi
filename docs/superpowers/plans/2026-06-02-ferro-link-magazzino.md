# Ferro ↔ Magazzino Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di collegare le voci del listino ferro (Barre & Profili, Sezioni Colonna, Binari, Accessori) a prodotti in `anagrafica_prodotti`, con sincronizzazione prezzi manuale on-demand.

**Architecture:** Aggiunta colonna FK `magazzino_prodotto_id` alle 4 tabelle ferro. Nessun trigger DB — la sync è un pulsante "Sincronizza prezzi" che aggiorna i prezzi leggendo `prezzo_acquisto` da `anagrafica_prodotti`. Nuovo dialog `DialogSelezioneProdottiMagazzino` per selezione multipla. Tutto client-side via Supabase JS client (pattern esistente).

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS client (`createClient` da `lib/supabase/client`), shadcn/ui, Tailwind CSS.

---

## File Map

| File | Azione |
|------|--------|
| `supabase/migrations/20260602180000_ferro_link_magazzino.sql` | Crea — 4 ALTER TABLE |
| `components/ferro/DialogSelezioneProdottiMagazzino.tsx` | Crea — dialog selezione prodotti |
| `components/ferro/FerroCalcolatore.tsx` | Modifica — tipo, makeCrud, DbTable, sync button |

---

## Task 1: Migrazione DB

**Files:**
- Create: `supabase/migrations/20260602180000_ferro_link_magazzino.sql`

- [ ] **Step 1: Crea il file di migrazione**

```sql
-- Collega voci listino ferro a prodotti in anagrafica_prodotti.
-- ON DELETE SET NULL: se il prodotto magazzino viene eliminato,
-- la voce ferro resta manuale con l'ultimo prezzo copiato.

ALTER TABLE ferro_sezioni_piene
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;

ALTER TABLE ferro_sezioni_colonna
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;

ALTER TABLE ferro_binari
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;

ALTER TABLE ferro_accessori
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Applica la migrazione via Supabase MCP**

Usa il tool `mcp__claude_ai_Supabase__apply_migration` con:
- `project_id`: `xawyrtqclpeylxnhwhwo`
- `name`: `ferro_link_magazzino`
- `query`: contenuto del file sopra

- [ ] **Step 3: Verifica con list_migrations**

Usa `mcp__claude_ai_Supabase__list_migrations` — controlla che `ferro_link_magazzino` sia in lista.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260602180000_ferro_link_magazzino.sql
git commit -m "feat: aggiungi magazzino_prodotto_id alle tabelle ferro"
```

---

## Task 2: Componente DialogSelezioneProdottiMagazzino

**Files:**
- Create: `components/ferro/DialogSelezioneProdottiMagazzino.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Link } from 'lucide-react'

export type ProdottoMagazzino = {
  id: string
  codice: string | null
  nome: string
  prezzo_acquisto: number | null
  categoria_nome: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  linkedIds: string[]           // magazzino_prodotto_id già collegati in questa sezione
  onConfirm: (prodotti: ProdottoMagazzino[]) => void
}

export default function DialogSelezioneProdottiMagazzino({ open, onClose, linkedIds, onConfirm }: Props) {
  const [prodotti, setProdotti] = useState<ProdottoMagazzino[]>([])
  const [loading, setLoading] = useState(false)
  const [cerca, setCerca] = useState('')
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setSelezionati(new Set())
    setCerca('')
    const load = async () => {
      setLoading(true)
      const db = createClient()
      const { data } = await db
        .from('anagrafica_prodotti')
        .select('id, codice, nome, prezzo_acquisto, categorie_magazzino(nome)')
        .order('nome')
      if (data) {
        setProdotti(data.map(p => ({
          id: p.id,
          codice: p.codice,
          nome: p.nome,
          prezzo_acquisto: p.prezzo_acquisto,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoria_nome: (p.categorie_magazzino as any)?.nome ?? null,
        })))
      }
      setLoading(false)
    }
    load()
  }, [open])

  const filtrati = useMemo(() => {
    const q = cerca.toLowerCase()
    if (!q) return prodotti
    return prodotti.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      (p.codice ?? '').toLowerCase().includes(q) ||
      (p.categoria_nome ?? '').toLowerCase().includes(q)
    )
  }, [prodotti, cerca])

  const toggle = (id: string) => {
    if (linkedIds.includes(id)) return
    setSelezionati(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const scelti = prodotti.filter(p => selezionati.has(p.id))
    onConfirm(scelti)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Aggiungi da magazzino
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Cerca per codice, nome o categoria..."
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          className="mt-2"
        />

        <div className="flex-1 overflow-auto mt-2 rounded-md border">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Caricamento...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Codice</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Prezzo acquisto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrati.map(p => {
                  const giàAggiunto = linkedIds.includes(p.id)
                  const checked = selezionati.has(p.id)
                  return (
                    <TableRow
                      key={p.id}
                      className={giàAggiunto ? 'opacity-40' : 'cursor-pointer hover:bg-muted/50'}
                      onClick={() => toggle(p.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          disabled={giàAggiunto}
                          onCheckedChange={() => toggle(p.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.codice ?? '—'}</TableCell>
                      <TableCell className="font-medium">
                        {p.nome}
                        {giàAggiunto && <Badge variant="secondary" className="ml-2 text-xs">Già aggiunto</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.categoria_nome ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.prezzo_acquisto != null ? `€ ${Number(p.prezzo_acquisto).toFixed(2)}` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtrati.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nessun prodotto trovato
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="mt-4">
          <span className="text-sm text-muted-foreground mr-auto">
            {selezionati.size > 0 ? `${selezionati.size} selezionati` : 'Nessuna selezione'}
          </span>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={selezionati.size === 0} onClick={handleConfirm}>
            Aggiungi selezionati
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verifica che `components/ui/checkbox.tsx` esista**

Dal git pull del collega è già presente. Se mancasse, installare con:
```bash
npx shadcn@latest add checkbox
```

- [ ] **Step 3: Commit**

```bash
git add components/ferro/DialogSelezioneProdottiMagazzino.tsx
git commit -m "feat: DialogSelezioneProdottiMagazzino — selezione multipla da magazzino"
```

---

## Task 3: Aggiorna FerroCalcolatore — tipo DbItem e makeCrud

**Files:**
- Modify: `components/ferro/FerroCalcolatore.tsx:20` (tipo DbItem)
- Modify: `components/ferro/FerroCalcolatore.tsx:356-375` (makeCrud)
- Modify: `components/ferro/FerroCalcolatore.tsx:331-354` (useEffect load)

- [ ] **Step 1: Aggiorna il tipo DbItem (riga 20)**

Sostituisci:
```typescript
type DbItem = { id: string; label: string; categoria: string; prezzo: number }
```
Con:
```typescript
type DbItem = { id: string; label: string; categoria: string; prezzo: number; magazzino_prodotto_id?: string | null }
```

- [ ] **Step 2: Aggiorna makeCrud — blocca prezzo su righe collegate (riga 363-366)**

Nella funzione `makeCrud`, sostituisci il body di `onUpdate`:
```typescript
onUpdate: async (item) => {
  const db = createClient()
  const updateData: Record<string, unknown> = { label: item.label, categoria: item.categoria }
  if (!item.magazzino_prodotto_id) updateData.prezzo = item.prezzo
  const { error } = await db.from(table).update(updateData).eq('id', item.id)
  if (error) { toast.error('Errore aggiornamento'); return }
  set(prev => prev.map(i => i.id === item.id ? item : i))
},
```

- [ ] **Step 3: Aggiorna useEffect — includi magazzino_prodotto_id nel select (riga 334-338)**

Sostituisci le 4 query nel `Promise.all`:
```typescript
db.from('ferro_sezioni_piene').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('categoria').order('label'),
db.from('ferro_sezioni_colonna').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('label'),
db.from('ferro_binari').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('label'),
db.from('ferro_accessori').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('categoria').order('label'),
```

- [ ] **Step 4: Commit**

```bash
git add components/ferro/FerroCalcolatore.tsx
git commit -m "feat: ferro DbItem supporta magazzino_prodotto_id, makeCrud blocca prezzo su righe collegate"
```

---

## Task 4: Aggiorna DbTable — icona lock e pulsante "+ Da magazzino"

**Files:**
- Modify: `components/ferro/FerroCalcolatore.tsx:148-248` (componente DbTable)

- [ ] **Step 1: Aggiorna props di DbTable e import icone**

Aggiungi `Link2` e `Lock` agli import lucide (riga 16):
```typescript
import { Pencil, Trash2, Plus, Save, Printer, Link2, Lock, RefreshCw } from 'lucide-react'
```

Aggiorna la firma di DbTable (riga 148):
```typescript
function DbTable({ items, categories, priceLbl = '€/barra (6m)', onAdd, onUpdate, onDelete, onAddFromMagazzino }: {
  items: DbItem[]; categories: string[]; priceLbl?: string
  onAdd: (i: Omit<DbItem, 'id'>) => Promise<void>
  onUpdate: (i: DbItem) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddFromMagazzino: () => void
})
```

- [ ] **Step 2: Aggiorna la riga di visualizzazione (non in edit) — mostra icona 🔗 e blocca prezzo**

Nella sezione `TableRow` per la riga non in edit (riga 215-226), sostituisci:
```tsx
<TableRow key={it.id}>
  <TableCell className="font-medium">{it.label}</TableCell>
  <TableCell><Badge variant="secondary" className="text-xs">{it.categoria}</Badge></TableCell>
  <TableCell className="font-mono text-sm">{fmt(it.prezzo)}</TableCell>
  <TableCell>
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => del(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  </TableCell>
</TableRow>
```
Con:
```tsx
<TableRow key={it.id}>
  <TableCell className="font-medium">
    <span className="flex items-center gap-1.5">
      {it.magazzino_prodotto_id && <Link2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
      {it.label}
    </span>
  </TableCell>
  <TableCell><Badge variant="secondary" className="text-xs">{it.categoria}</Badge></TableCell>
  <TableCell className="font-mono text-sm">
    <span className="flex items-center gap-1">
      {it.magazzino_prodotto_id && <Lock className="h-3 w-3 text-muted-foreground" />}
      {fmt(it.prezzo)}
    </span>
  </TableCell>
  <TableCell>
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => del(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  </TableCell>
</TableRow>
```

- [ ] **Step 3: Aggiorna la riga in edit — disabilita campo prezzo se collegato**

Nella `TableRow` in edit mode (riga 203-206), il campo prezzo:
```tsx
<TableCell>
  <Input type="number" value={draft.prezzo ?? 0} step={0.1}
    onChange={e => setDraft(d => ({ ...d, prezzo: parseFloat(e.target.value) || 0 }))}
    disabled={!!draft.magazzino_prodotto_id}
    className="h-7 text-sm font-mono w-24" />
</TableCell>
```

- [ ] **Step 4: Aggiorna il footer "Aggiungi nuovo" — aggiungi pulsante "+ Da magazzino"**

Dopo il pulsante `Aggiungi` (riga 243), aggiungi nella stessa `div` del bottone (cambia la grid e aggiungi il bottone):

Sostituisci l'intera sezione `rounded-md border p-3` (righe 230-245):
```tsx
<div className="rounded-md border p-3 bg-muted/20 space-y-3">
  <div className="flex items-center justify-between">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aggiungi nuovo</p>
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onAddFromMagazzino}>
      <Link2 className="h-3.5 w-3.5" />
      Da magazzino
    </Button>
  </div>
  <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
    <div><Label className="text-xs mb-1 block">Descrizione</Label>
      <Input value={newItem.label} onChange={e => setNewItem(n => ({ ...n, label: e.target.value }))} placeholder="es. Quadro 16×16" className="h-8 text-sm" /></div>
    <div><Label className="text-xs mb-1 block">Categoria</Label>
      <select value={newItem.categoria} onChange={e => setNewItem(n => ({ ...n, categoria: e.target.value }))}
        className="h-8 text-sm rounded-md border border-input bg-background px-2 w-full">
        {categories.map(c => <option key={c}>{c}</option>)}
      </select></div>
    <div><Label className="text-xs mb-1 block">Prezzo</Label>
      <Input type="number" value={newItem.prezzo} step={0.1} min={0}
        onChange={e => setNewItem(n => ({ ...n, prezzo: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm font-mono" /></div>
    <Button size="sm" onClick={add} className="h-8"><Plus className="h-3.5 w-3.5 mr-1" />Aggiungi</Button>
  </div>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add components/ferro/FerroCalcolatore.tsx
git commit -m "feat: DbTable — icona lock su righe collegate, pulsante Da magazzino"
```

---

## Task 5: Aggiorna FerroCalcolatore — logica sync e dialog

**Files:**
- Modify: `components/ferro/FerroCalcolatore.tsx` (main component, sezione state + dbSection)

- [ ] **Step 1: Aggiungi import del dialog e stato dialog**

In cima al file, dopo gli altri import:
```typescript
import DialogSelezioneProdottiMagazzino, { type ProdottoMagazzino } from '@/components/ferro/DialogSelezioneProdottiMagazzino'
```

Nello state del componente principale (dopo riga 329, dopo `const [margine, setMargine]`):
```typescript
const [dialogMagazzino, setDialogMagazzino] = useState<{ open: boolean; table: string; set: React.Dispatch<React.SetStateAction<DbItem[]>> } | null>(null)
const [syncing, setSyncing] = useState(false)
```

- [ ] **Step 2: Aggiungi funzione handleAddFromMagazzino**

Dopo `salvaPreventivo` (dopo riga 467), aggiungi:
```typescript
const handleAddFromMagazzino = async (prodotti: ProdottoMagazzino[]) => {
  if (!dialogMagazzino || prodotti.length === 0) return
  const db = createClient()
  const righe = prodotti.map(p => ({
    label: p.nome,
    categoria: 'altro',
    prezzo: p.prezzo_acquisto ?? 0,
    attivo: true,
    magazzino_prodotto_id: p.id,
  }))
  const { data, error } = await db.from(dialogMagazzino.table).insert(righe).select()
  if (error) { toast.error('Errore nel collegamento'); return }
  dialogMagazzino.set(prev => [...prev, ...(data as DbItem[])])
  toast.success(`${prodotti.length} articolo/i aggiunto/i`)
}
```

- [ ] **Step 3: Aggiungi funzione handleSincronizza**

Dopo `handleAddFromMagazzino`:
```typescript
const handleSincronizza = async () => {
  setSyncing(true)
  try {
    const db = createClient()
    const [rSP, rSC, rBin, rAC] = await Promise.all([
      db.from('ferro_sezioni_piene').select('id,magazzino_prodotto_id').not('magazzino_prodotto_id', 'is', null),
      db.from('ferro_sezioni_colonna').select('id,magazzino_prodotto_id').not('magazzino_prodotto_id', 'is', null),
      db.from('ferro_binari').select('id,magazzino_prodotto_id').not('magazzino_prodotto_id', 'is', null),
      db.from('ferro_accessori').select('id,magazzino_prodotto_id').not('magazzino_prodotto_id', 'is', null),
    ])
    const allLinked = [
      ...((rSP.data ?? []).map(r => ({ ...r, tbl: 'ferro_sezioni_piene' as string }))),
      ...((rSC.data ?? []).map(r => ({ ...r, tbl: 'ferro_sezioni_colonna' as string }))),
      ...((rBin.data ?? []).map(r => ({ ...r, tbl: 'ferro_binari' as string }))),
      ...((rAC.data ?? []).map(r => ({ ...r, tbl: 'ferro_accessori' as string }))),
    ]
    if (allLinked.length === 0) { toast.info('Nessun articolo collegato al magazzino'); return }
    const uniqueIds = [...new Set(allLinked.map(r => r.magazzino_prodotto_id as string))]
    const { data: prodotti } = await db.from('anagrafica_prodotti').select('id,prezzo_acquisto').in('id', uniqueIds)
    if (!prodotti) return
    const priceMap: Record<string, number> = {}
    prodotti.forEach(p => { if (p.prezzo_acquisto != null) priceMap[p.id] = p.prezzo_acquisto })
    await Promise.all(
      allLinked.map(r => db.from(r.tbl).update({ prezzo: priceMap[r.magazzino_prodotto_id as string] ?? 0 }).eq('id', r.id))
    )
    // Ricarica le 4 liste aggiornate
    const [nSP, nSC, nBin, nAC] = await Promise.all([
      db.from('ferro_sezioni_piene').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('categoria').order('label'),
      db.from('ferro_sezioni_colonna').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('label'),
      db.from('ferro_binari').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('label'),
      db.from('ferro_accessori').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('categoria').order('label'),
    ])
    if (nSP.data) setSPRaw(nSP.data as DbItem[])
    if (nSC.data) setSCRaw(nSC.data as DbItem[])
    if (nBin.data) setBinRaw(nBin.data as DbItem[])
    if (nAC.data) setACRaw(nAC.data as DbItem[])
    toast.success(`${allLinked.length} prezzi aggiornati`)
  } catch { toast.error('Errore durante la sincronizzazione') }
  finally { setSyncing(false) }
}
```

- [ ] **Step 4: Aggiorna dbSection — passa onAddFromMagazzino ai DbTable e aggiungi pulsante Sincronizza**

Sostituisci l'intera variabile `dbSection` (righe 492-505):
```tsx
const linkedIdsSP   = sezioniPiene.filter(i => i.magazzino_prodotto_id).map(i => i.magazzino_prodotto_id as string)
const linkedIdsSC   = sezioniColonna.filter(i => i.magazzino_prodotto_id).map(i => i.magazzino_prodotto_id as string)
const linkedIdsBin  = binari.filter(i => i.magazzino_prodotto_id).map(i => i.magazzino_prodotto_id as string)
const linkedIdsAC   = accessori.filter(i => i.magazzino_prodotto_id).map(i => i.magazzino_prodotto_id as string)

const dbSection = (
  <>
    <div className="flex items-center justify-between mb-4">
      <Tabs defaultValue="piene" className="flex-1">
        <div className="flex items-center gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="piene">Barre & Profili ({spCrud.items.length})</TabsTrigger>
            <TabsTrigger value="colonna">Sezioni Colonna ({scCrud.items.length})</TabsTrigger>
            <TabsTrigger value="binari">Binari ({binCrud.items.length})</TabsTrigger>
            <TabsTrigger value="acc">Accessori ({acCrud.items.length})</TabsTrigger>
          </TabsList>
          <Button
            size="sm" variant="outline"
            className="ml-auto gap-1.5"
            onClick={handleSincronizza}
            disabled={syncing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            Sincronizza prezzi
          </Button>
        </div>
        <TabsContent value="piene">
          <DbTable items={spCrud.items} categories={CAT_PIENE}
            onAdd={spCrud.onAdd} onUpdate={spCrud.onUpdate} onDelete={spCrud.onDelete}
            onAddFromMagazzino={() => setDialogMagazzino({ open: true, table: 'ferro_sezioni_piene', set: setSPRaw })} />
        </TabsContent>
        <TabsContent value="colonna">
          <DbTable items={scCrud.items} categories={CAT_COLONNA}
            onAdd={scCrud.onAdd} onUpdate={scCrud.onUpdate} onDelete={scCrud.onDelete}
            onAddFromMagazzino={() => setDialogMagazzino({ open: true, table: 'ferro_sezioni_colonna', set: setSCRaw })} />
        </TabsContent>
        <TabsContent value="binari">
          <DbTable items={binCrud.items} categories={CAT_BINARIO}
            onAdd={binCrud.onAdd} onUpdate={binCrud.onUpdate} onDelete={binCrud.onDelete}
            onAddFromMagazzino={() => setDialogMagazzino({ open: true, table: 'ferro_binari', set: setBinRaw })} />
        </TabsContent>
        <TabsContent value="acc">
          <DbTable items={acCrud.items} categories={CAT_ACC} priceLbl="€/pezzo"
            onAdd={acCrud.onAdd} onUpdate={acCrud.onUpdate} onDelete={acCrud.onDelete}
            onAddFromMagazzino={() => setDialogMagazzino({ open: true, table: 'ferro_accessori', set: setACRaw })} />
        </TabsContent>
      </Tabs>
    </div>

    {dialogMagazzino && (
      <DialogSelezioneProdottiMagazzino
        open={dialogMagazzino.open}
        onClose={() => setDialogMagazzino(null)}
        linkedIds={
          dialogMagazzino.table === 'ferro_sezioni_piene'   ? linkedIdsSP  :
          dialogMagazzino.table === 'ferro_sezioni_colonna' ? linkedIdsSC  :
          dialogMagazzino.table === 'ferro_binari'          ? linkedIdsBin :
          linkedIdsAC
        }
        onConfirm={handleAddFromMagazzino}
      />
    )}
  </>
)
```

- [ ] **Step 5: Verifica build TypeScript**

```bash
npm run build
```

Atteso: zero errori TypeScript. Se ci sono errori di tipo, correggerli prima di procedere.

- [ ] **Step 6: Commit finale**

```bash
git add components/ferro/FerroCalcolatore.tsx
git commit -m "feat: ferro — sync prezzi magazzino, dialog selezione prodotti, lock su righe collegate"
```
