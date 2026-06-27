# Analisi costi/utili stimati — Implementation Plan

> Segui lo spec `docs/superpowers/specs/2026-06-27-analisi-costi-utili-design.md`. Verifica con `npm run build` (no test runner).

**Goal:** Card nella pagina `/commesse/statistiche` con grafico mensile costi/utili stimati dai preventivi interni collegati alle commesse (3 viste selezionabili), per blocco/anno.

**Architecture:** Funzione pura condivisa per i costi del preventivo (estratta da DettaglioPreventivo). Il Server Component carica i preventivi interni collegati alle commesse, calcola materiali/posa/utile per commessa, e passa al client righe per-commessa che vengono aggregate per mese (data_conferma) del blocco selezionato.

**Tech Stack:** Next.js 16, recharts ^3.8, shadcn/ui, lib pure functions.

## Global Constraints

- Filtro `organization_id` su ogni query (via `getOrgId()`).
- Solo preventivi interni: `preventivo_id` non null (link diretto `commesse.preventivo_id` + junction `preventivi_commessa.preventivo_id`). Esterni ignorati.
- utile = totale_articoli − (materiali + posa + spese_trasporto). Stessa formula di DettaglioPreventivo (Report interno).
- mese = `data_conferma` della commessa; anno = blocco.
- Zero warning eslint; tutto dentro la pagina statistiche (nessun tasto/pagina di navigazione extra).

---

### Task 1: Funzione pura costi preventivo + refactor DettaglioPreventivo

**Files:**
- Create: `lib/preventivo-costi.ts`
- Modify: `components/preventivi/DettaglioPreventivo.tsx` (sostituisce `getCosti` inline)

**Produces:**
- `costiArticolo(a: ArticoloPreventivoRow): { acq: number; posa: number }`
- `calcolaCostiPreventivo(articoli: ArticoloPreventivoRow[], totaleArticoli: number, speseTrasporto: number): { materiali: number; posa: number; costoTotale: number; utile: number }`

- [ ] Creare `lib/preventivo-costi.ts` con la logica `getCosti` (su_misura/scorrevole/winconfig/default) e l'aggregazione (materiali=Σacq×qtà, posa=Σposa×qtà, costoTotale=mat+posa+trasporto, utile=totaleArticoli−costoTotale).
- [ ] In `DettaglioPreventivo.tsx` importare e usare `costiArticolo`/`calcolaCostiPreventivo` al posto della logica inline (preservando la tabella per-articolo che usa `costiArticolo`).
- [ ] `npm run build` (con `RESEND_API_KEY` fittizia) → ok.

### Task 2: Tipi + aggregatore mensile costi/utili

**Files:**
- Modify: `lib/statistiche-commesse.ts`

**Produces:**
- `type CostoCommessaRow = { commessa_id: string; blocco: string | null; data_conferma: string | null; materiali: number; posa: number; utile: number }`
- `DatiStatistiche` aggiunge `costiCommesse: CostoCommessaRow[]`
- `type PuntoCostiUtili = { mese: string; materiali: number; posa: number; utile: number }`
- `aggregaCostiUtiliMese(costi: CostoCommessaRow[], anno: string): PuntoCostiUtili[]` (12 righe, filtra blocco===anno, bucket per mese di data_conferma)
- `contaCommesseSenzaPreventivo(commesse: StatRow[], costi: CostoCommessaRow[], anno: string): number`

- [ ] Aggiungere i tipi e le due funzioni pure a `lib/statistiche-commesse.ts` (riusando il `meseDi` interno già presente — esportarlo o duplicare la slice).

### Task 3: Server Component — query preventivi interni e calcolo per commessa

**Files:**
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

**Consumes:** `calcolaCostiPreventivo` (Task 1), `CostoCommessaRow` (Task 2).

- [ ] Query aggiuntive: `preventivi_commessa` (commessa_id, preventivo_id) per org; usare anche `commesse.preventivo_id`. Costruire map commessa_id → Set(preventivo_id interni, non null).
- [ ] Caricare `preventivi` (id, totale_articoli, spese_trasporto) e `articoli_preventivo` (preventivo_id, tipo, quantita, costo_acquisto_unitario, costo_posa, prezzo_totale_riga, config_su_misura, config_scorrevole, config_winconfig) per gli id interni.
- [ ] Per ogni preventivo interno: `calcolaCostiPreventivo`. Per ogni commessa con ≥1 preventivo interno: sommare → `CostoCommessaRow` con blocco (nome) + data_conferma.
- [ ] Passare `costiCommesse` dentro `dati`.

### Task 4: Client — Card con selettore vista + grafici

**Files:**
- Modify: `components/commesse/StatisticheCommesse.tsx`

**Consumes:** `aggregaCostiUtiliMese`, `contaCommesseSenzaPreventivo`, `CostoCommessaRow`.

- [ ] Stato `vistaCosti: 'impilato' | 'costi_utile' | 'solo_utile'` (default 'impilato').
- [ ] `useMemo` per `datiCostiUtili = aggregaCostiUtiliMese(costiCommesse, anno)` e `senzaPreventivo`.
- [ ] Nuova Card sotto le esistenti: titolo "Costi e utili stimati — {anno}", gruppo 3 pulsanti vista.
- [ ] Vista impilato: `BarChart` con 3 `Bar` stackId="x" (materiali, posa, utile). Vista costi_utile: `ComposedChart` Bar costi(materiali+posa) + Line utile. Vista solo_utile: `BarChart` Bar utile.
- [ ] Riepilogo: totale materiali/posa/utile + % margine; contatore "{senzaPreventivo} commesse senza preventivo interno — escluse".
- [ ] Stato vuoto se nessun dato.

### Task 5: Verifica + commit + push

- [ ] `npm run build` ok, route `/commesse/statistiche` generata.
- [ ] Commit + push su master.
