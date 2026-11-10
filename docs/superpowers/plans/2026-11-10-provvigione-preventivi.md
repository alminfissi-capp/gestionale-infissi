# Provvigione nei preventivi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nello step finale del wizard preventivo si può aggiungere una provvigione (in % o in €) che viene spalmata su tutte le voci e sul trasporto; il cliente vede solo i prezzi già maggiorati, i calcoli interni mostrano la provvigione come costo a parte.

**Architecture:** La provvigione è un unico fattore `k = 1 + pct/100` applicato in modo uniforme a ogni riga e al trasporto (una cifra in € diventa la percentuale equivalente sul "mio prezzo" = voci + trasporto, come già fa lo sconto in €). I prezzi delle righe in DB sono salvati **già maggiorati** (così PDF, stampa, link pubblico, email, firma restano invariati); il prezzo "mio" si ricava dividendo per `k`. La logica pura vive in `lib/provvigione.ts`; il server applica `k` al salvataggio, il wizard la toglie al caricamento.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Vitest.

**Spec:** decisioni prese in chat il 2026-11-10 (riassunte qui sotto).

## Global Constraints

- Base della provvigione = mio prezzo: subtotale voci + trasporto, **prima** dello sconto. 5% su 10.000 → 10.500.
- Anche il trasporto viene maggiorato della stessa percentuale.
- Lo sconto globale si applica DOPO, sui prezzi maggiorati: pesa anche sull'agente (10.000, provv. 5%, sconto 10% → cliente 9.450, agente 450).
- Provvigione in €: si converte in percentuale equivalente sul mio prezzo (l'importo esatto in € resta salvato, come `sconto_importo_fisso`).
- Il cliente non vede mai la parola "provvigione" (PDF, stampa, link pubblico, email, firma).
- Report interno + stampa Calcoli: riga "Provvigione", sottratta dall'utile. Statistiche commesse e contabilità di commessa usano la stessa formula → la scalano anche loro.
- Righe FP PRO: la provvigione del preventivo si applica anche a loro, senza blocchi.
- Cambiando la provvigione (o togliendola) su un preventivo riaperto, i prezzi si ricalcolano dal mio prezzo, senza accumulare maggiorazioni.
- Nuove colonne `numeric` senza scala (no NUMERIC(4,2): vedi gotcha vincoli sconti).
- UI e testi in italiano.

## Review Focus

- Riapro un preventivo con provvigione 5% e salvo senza toccare nulla → prezzi e totali identici (nessuna doppia maggiorazione).
- Provvigione in € con sconto in €: lo sconto in € resta l'importo esatto scritto, calcolato sul lordo maggiorato.
- Copia voce da un preventivo con provvigione a uno senza (e viceversa): la riga arriva col prezzo giusto per il preventivo di destinazione.
- Preventivi vecchi (colonne a 0/null): nessuna differenza in report, statistiche, stampe.
- Trasporto nel report interno: costo trasporto = trasporto senza provvigione (la parte di provvigione sul trasporto sta già nella riga Provvigione, non va contata due volte).

---

### Task 1: Logica pura + colonne DB

**Files:**
- Create: `lib/provvigione.ts`, `lib/provvigione.test.ts`
- Create: `supabase/migrations/20261110120000_provvigione_preventivi.sql`
- Modify: `types/preventivo.ts` (Preventivo, PreventivoInput)

**Interfaces — Produces:**
```ts
// pct effettiva: se importoFisso != null → importoFisso / lordoBase * 100 (0 se lordoBase <= 0); altrimenti pct (min 0)
export function percentualeProvvigione(lordoBase: number, pct: number, importoFisso: number | null): number
export function fattoreProvvigione(pct: number): number            // 1 + pct/100
// moltiplica prezzo_unitario e prezzo_totale_riga per k (nient'altro); restituisce nuove righe
export function applicaProvvigione<T extends { prezzo_unitario: number; prezzo_totale_riga: number }>(righe: T[], pct: number): T[]
export function togliProvvigione<T extends { prezzo_unitario: number; prezzo_totale_riga: number }>(righe: T[], pct: number): T[]
export function senzaProvvigione(valore: number, pct: number): number  // valore / k
// quota agente dopo lo sconto: (lordoCliente - lordoCliente/k) * (totaleArticoli / lordoCliente), arrotondata ai centesimi; 0 se lordoCliente <= 0
export function importoProvvigione(lordoCliente: number, totaleArticoli: number, pct: number): number
```
`types/preventivo.ts`: `Preventivo` + `provvigione_percentuale: number`, `provvigione_importo_fisso: number | null`, `provvigione_importo: number`. `PreventivoInput` + `provvigionePercentuale?: number`, `provvigioneImportoFisso?: number | null` (opzionali: `trasferisciInPreventivi` di FP non li passa).

- [ ] **Step 1: test** in `lib/provvigione.test.ts`:
  - `percentualeProvvigione(10000, 5, null)` → 5; `(10000, 0, 500)` → 5; `(0, 0, 500)` → 0; `(10000, -3, null)` → 0
  - `applicaProvvigione([{prezzo_unitario:100, prezzo_totale_riga:200}], 5)` → `{105, 210}`; `togliProvvigione(applica(x,5),5)` ≈ x (toBeCloseTo, 8)
  - `importoProvvigione(10500, 9450, 5)` → 450; `(10500, 10500, 5)` → 500; `(0,0,5)` → 0
- [ ] **Step 2:** `npx vitest run lib/provvigione.test.ts` → FAIL (modulo mancante)
- [ ] **Step 3:** implementa `lib/provvigione.ts`; migrazione:
  ```sql
  ALTER TABLE preventivi
    ADD COLUMN IF NOT EXISTS provvigione_percentuale numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provvigione_importo_fisso numeric,
    ADD COLUMN IF NOT EXISTS provvigione_importo numeric NOT NULL DEFAULT 0;
  ```
  Applicala con Supabase MCP `apply_migration` (progetto `xawyrtqclpeylxnhwhwo`). Aggiorna i tipi.
- [ ] **Step 4:** test → PASS; `npx tsc --noEmit` pulito
- [ ] **Step 5:** commit `feat(preventivi): logica e colonne provvigione`

### Task 2: Salvataggio e letture lato server

**Files:** Modify `actions/preventivi.ts`

**Interfaces — Consumes:** Task 1.

Regole:
- `createPreventivo` / `updatePreventivo`: `input.articoli` arrivano col **mio prezzo**. Calcola `subtotaleBase`, `trasportoBase` (come oggi), `pct = percentualeProvvigione(subtotaleBase + trasportoBase, input.provvigionePercentuale ?? 0, input.provvigioneImportoFisso ?? null)`. Poi `articoli = applicaProvvigione(input.articoli, pct)` e trasporto = `trasportoBase * k`, e da lì tutto il calcolo esistente (subtotale, quote trasporto, IVA, sconto, totali) gira sui valori maggiorati. Le quote trasporto per l'IVA: calcolate sulle righe maggiorate e moltiplicate per k (regole a pezzi → base). Salva le 3 colonne; `provvigione_importo = importoProvvigione(subtotale + speseTrasporto, totaleArticoli, pct)`.
- Estrai questa sequenza in una funzione locale riusata da create/update/ricalcola (evita 3 copie).
- `getPreventivo`: `quota_trasporto` × k (le righe in DB sono già maggiorate, le regole no).
- `ricalcolaTotaliPreventivo`: legge anche `provvigione_percentuale`; righe già maggiorate, trasporto × k, aggiorna `provvigione_importo`. La percentuale salvata resta quella; se c'era un importo fisso in €, diventa `null` (dopo la copia di una voce il lordo è cambiato e vale la percentuale).
- `copiaArticoloInPreventivo`: riga sorgente → `togliProvvigione` con la pct del preventivo sorgente → `applicaProvvigione` con la pct del target.
- `duplicaPreventivo`: copia le 3 colonne.

- [ ] **Step 1:** implementa
- [ ] **Step 2:** `npx tsc --noEmit` + `npx vitest run` → verdi
- [ ] **Step 3:** commit `feat(preventivi): provvigione applicata al salvataggio`

### Task 3: Wizard — campo Provvigione

**Files:** Modify `components/preventivi/WizardPreventivo.tsx`, `lib/db.ts` (BozzaWizard)

- Stato `provvigionePct`, `provvigioneImportoFisso`, stringhe `provvigionePctStr` / `provvigioneEuroStr`, sincronizzate su blur come lo sconto (base = mio prezzo: `subtotaleBase + trasportoBase`).
- Caricamento preventivo esistente: `articoli = togliProvvigione(preventivo.articoli, preventivo.provvigione_percentuale)`; stato iniziale dai campi salvati.
- `totali` (useMemo): calcola base, pct effettiva, poi righe/trasporto maggiorati e il calcolo esistente su quelli. Esponi `provvigioneImporto` e il riepilogo mostra i totali **cliente**. Lo sconto in € / % si converte sul lordo maggiorato (come al server).
- UI: nello step finale, sotto/accanto allo sconto, riga "Provvigione" con input % e € (stesso stile dello sconto) e una riga di testo piccola "Agente: € X (non visibile al cliente)".
- Bozza Dexie: aggiungi `provvigionePct?: number`, `provvigioneImportoFisso?: number | null` (opzionali, nessun bump versione: non sono indici).
- Payload: `provvigionePercentuale`, `provvigioneImportoFisso`; articoli inviati col mio prezzo.
- Salvataggio offline (pendingPreventivi): verifica che il payload passi i nuovi campi.

- [ ] **Step 1:** implementa
- [ ] **Step 2:** `npx tsc --noEmit`, `npm run lint` → zero problemi
- [ ] **Step 3:** prova in dev: nuovo preventivo 1 voce, provv. 5% → totale +5%; sconto 10% → coerente con l'esempio; salva, riapri, salva → totali identici; metti 0 → prezzi originali
- [ ] **Step 4:** commit `feat(preventivi): campo provvigione nel wizard`

### Task 4: Calcoli interni

**Files:** Modify `lib/preventivo-costi.ts` (+ test), `components/preventivi/DettaglioPreventivo.tsx`, `components/preventivi/StampaCalcoli.tsx`, `app/(dashboard)/commesse/statistiche/page.tsx`, `actions/contabilita-commessa.ts`

**Interfaces — Produces:**
```ts
calcolaCostiPreventivo(articoli, totaleArticoli, speseTrasporto, provvigione?: { percentuale: number; importo: number })
// CostiPreventivo + provvigione: number
// trasporto come costo = senzaProvvigione(speseTrasporto, percentuale); costoTotale += importo
```
- [ ] **Step 1: test** in `lib/preventivo-costi.test.ts`: righe con costi 0, totaleArticoli 9450, trasporto 0, `{percentuale:5, importo:450}` → `provvigione` 450, `utile` 9000; con trasporto 105 e pct 5 → costo trasporto contato 100. Senza 4° argomento → comportamento invariato (test esistenti verdi).
- [ ] **Step 2:** FAIL → implementa → PASS
- [ ] **Step 3:** callers: passa `{ percentuale: p.provvigione_percentuale, importo: p.provvigione_importo }` (aggiungi le colonne alle select di statistiche e contabilità). Report interno e stampa Calcoli: riga "Provvigione" (solo se > 0) tra i costi; riga "Spese trasporto" mostra il trasporto senza provvigione; margine per riga calcolato su `senzaProvvigione(prezzo_totale_riga)` (e quota trasporto senza provvigione nella stampa Calcoli); colonna prezzo unitario della stampa Calcoli mostra il prezzo cliente (resta com'è).
- [ ] **Step 4:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint` → verdi
- [ ] **Step 5:** commit `feat(preventivi): provvigione nei calcoli interni`

### Task 5: Verifica finale e documentazione

- [ ] `npm run build` (con `RESEND_API_KEY` fittizia se serve) → ok
- [ ] Prova completa in dev: dettaglio preventivo (report con riga Provvigione), stampa preventivo e link pubblico senza la parola provvigione, stampa Calcoli.
- [ ] Aggiorna PRD.md e memoria (`project_provvigione_preventivi.md` + riga in MEMORY.md) con le scelte "da non ribaltare": prezzi righe salvati maggiorati; k uniforme; trasporto × k; sconto dopo.
- [ ] Commit, merge su master, push, cancella branch.
