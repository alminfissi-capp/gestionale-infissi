# Grafici e statistiche Commesse — Implementation Plan

> **For agentic workers:** segui lo spec `docs/superpowers/specs/2026-06-26-statistiche-commesse-design.md`.

**Goal:** Pagina `/commesse/statistiche` con grafico andamento commesse/mese, incassi/mese e resoconto per cliente per anno con saldo.

**Architecture:** Server Component fa due query (commesse + acconti) filtrate per org, aggrega per anno/mese in JS e passa tutto a un Client Component che gestisce selettore anno, ricerca cliente e rendering recharts.

**Tech Stack:** Next.js 16 App Router, recharts ^3.8, shadcn/ui (Card, Input, Select), lucide-react, `formatEuro` da `lib/pricing.ts`.

## Global Constraints

- `params`/`searchParams` sono `Promise` in Next.js 16 (qui non servono).
- Zero warning eslint su unused vars (verifica con `npm run build`).
- Filtro `organization_id` su ogni query (via `getOrgId()` da `@/lib/auth`).
- Riuso `formatEuro` esistente, niente nuove dipendenze.

---

### Task 1: Tipi + utilità aggregazione

**Files:**
- Create: `lib/statistiche-commesse.ts`

**Produces:**
- `type StatRow = { id: string; cliente_nome: string; totale: number; data_conferma: string | null }`
- `type AccontoRow = { commessa_id: string; importo: number; data_pagamento: string | null }`
- `type DatiStatistiche = { commesse: StatRow[]; acconti: AccontoRow[]; anni: number[] }`
- `MESI_LABEL: string[]` (gen..dic)
- `aggregaMese(commesse, anno)` → `{ mese: string; valore: number; numero: number }[]` (12 righe)
- `aggregaIncassiMese(acconti, anno)` → `{ mese: string; incasso: number }[]` (12 righe)
- `resocontoCliente(commesse, acconti, cliente)` → `{ anno: number; numero: number; fatturato: number; incassato: number; saldo: number }[]` + totale
- `clientiUnici(commesse)` → `string[]` ordinati

- [ ] Scrivere il file con le funzioni pure di aggregazione (no React, no Supabase).

### Task 2: Server Component pagina

**Files:**
- Create: `app/(dashboard)/commesse/statistiche/page.tsx`

**Consumes:** tipi/funzioni da Task 1; `createClient`, `getOrgId`.
**Produces:** rende `<StatisticheCommesse dati={...} />`.

- [ ] Query `commesse` (`id, cliente_nome, totale, data_conferma`) + `acconti_commessa` (`commessa_id, importo, data_pagamento`), entrambe `.eq('organization_id', orgId)`, in `Promise.all`.
- [ ] Calcolare `anni` unici (da data_conferma commesse + data_pagamento acconti), ordinati desc.
- [ ] Passare `{ commesse, acconti, anni }` al client component.

### Task 3: Client Component grafici

**Files:**
- Create: `components/commesse/StatisticheCommesse.tsx`

**Consumes:** `DatiStatistiche` + funzioni Task 1; recharts; `formatEuro`.

- [ ] Header con pulsante "← Indietro" (`router.push('/commesse')`) e titolo.
- [ ] Select anno (default: primo di `anni`, o anno corrente).
- [ ] Card A: `ComposedChart` — Bar `valore` (€) + Line `numero`; riga riepilogo numero+valore anno.
- [ ] Card B: `BarChart` — Bar `incasso`; riga riepilogo incassato anno.
- [ ] Card C: `Input` ricerca cliente con suggerimenti da `clientiUnici`; tabella resoconto per anno + riga totale; saldo verde se 0 altrimenti arancione.
- [ ] Stati vuoti: "Nessun dato" / "Nessun cliente trovato".

### Task 4: Pulsante nell'header commesse

**Files:**
- Modify: `app/(dashboard)/commesse/page.tsx`

- [ ] Aggiungere nell'intestazione un `Link`/pulsante "Grafici e statistiche" (icona `BarChart3`) → `/commesse/statistiche`.

### Task 5: Verifica e commit

- [ ] `npm run build` → zero errori/warning.
- [ ] Commit + push.
