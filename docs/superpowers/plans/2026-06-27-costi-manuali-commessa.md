# Costi manuali su commesse — Implementation Plan

> Segui lo spec `docs/superpowers/specs/2026-06-27-costi-manuali-commessa-design.md`. Verifica con `npm run build` (no test runner).

**Goal:** 3 campi manuali (materiale, m.opera, utile) su commesse con preventivo manuale, che confluiscono sommati nel grafico costi/utili.

**Architecture:** 3 colonne nullable su `commesse`. DialogCommessa mostra la sezione quando c'è un preventivo manuale. Le statistiche sommano i valori manuali ai costi calcolati dai preventivi interni.

**Tech Stack:** Next.js 16, Supabase, shadcn/ui.

## Global Constraints

- Colonne nullable, 0 se null nel calcolo. Sommare manuale + sistema (additivo).
- Campi nel dialog visibili solo se c'è ≥1 preventivo manuale; valori salvati contano comunque nel grafico.
- Zero warning eslint.

---

### Task 1: Migration colonne + apply DB

**Files:**
- Create: `supabase/migrations/20260627130000_commesse_costi_manuali.sql`

- [ ] SQL: `ALTER TABLE commesse ADD COLUMN IF NOT EXISTS costo_materiali_manuale numeric, ADD COLUMN IF NOT EXISTS costo_manodopera_manuale numeric, ADD COLUMN IF NOT EXISTS utile_manuale numeric;`
- [ ] Applicare al DB (Supabase MCP `apply_migration`, fallback: SQL editor).

### Task 2: Tipi

**Files:**
- Modify: `types/commessa.ts` (Commessa, CommessaInput)

- [ ] Aggiungere a `Commessa` e `CommessaInput`: `costo_materiali_manuale: number | null`, `costo_manodopera_manuale: number | null`, `utile_manuale: number | null`. (CommessaCompleta estende Commessa → eredita.)

### Task 3: Actions — coercizione lettura

**Files:**
- Modify: `actions/commesse.ts` (getCommesse, getAllCommesse, getCommessaById)

- [ ] Nei 3 return map aggiungere coercizione: `costo_materiali_manuale: c.costo_materiali_manuale != null ? Number(c.costo_materiali_manuale) : null` (e analoghi per manodopera/utile). create/update non cambiano (spread `...input`).

### Task 4: DialogCommessa — sezione campi manuali

**Files:**
- Modify: `components/commesse/DialogCommessa.tsx`

- [ ] `emptyForm()` include i 3 campi a null.
- [ ] Reset in modifica: popolare i 3 campi da `commessa`.
- [ ] Helper `setNumberManuale(k)` che parsa float|null.
- [ ] Render: se `prevItems.some(i => i.tipo === 'manuale')`, mostra sezione "Costi preventivo manuale (per statistiche)" con 3 Input numerici (Materiale, M. opera, Utile), valore `form.X ?? ''`.

### Task 5: Statistiche — somma valori manuali

**Files:**
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`
- Modify: `components/commesse/StatisticheCommesse.tsx` (etichetta contatore)

- [ ] Query commesse: aggiungere `costo_materiali_manuale, costo_manodopera_manuale, utile_manuale`.
- [ ] Costruire `costiCommesse` da TUTTE le commesse con almeno un contributo: materiali = sysMat + (manuale||0), posa = sysPosa + (manuale||0), utile = sysUtile + (manuale||0). Includere righe anche per commesse con soli valori manuali.
- [ ] Etichetta: "senza preventivo interno né costi manuali — escluse".

### Task 6: Verifica + commit + push

- [ ] `npm run build` ok.
- [ ] Commit + push.
