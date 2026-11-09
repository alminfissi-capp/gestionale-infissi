# Rilievo unico, parte 3: Dettagli costruttivi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagina "Dettagli costruttivi" del rilievo: 4 serramenti per A4, per ognuno il disegno (posizione, mq per pezzo, quantità, scritte dei lati) e una riga per ogni cosa con i codici (TELAIO, ANTA, RIPORTO, MONTANTI, TRAVERSI, FERMAVETRO, VETRI, ACCESSORI, COLORI), più il riquadro NOTE scrivibile anche da lì.

**Architecture:** Una funzione pura per tipo di voce produce la stessa forma di dati. Le voci FP PRO prendono i codici dai pezzi della struttura (tipi 8050 / 8090-8100 / 8150-8160 / 8060 / 8070 / 8180) con le scelte della voce (telai per lato, anta). Le voci disegnate li prendono dai pezzi calcolati per ruolo con le assegnazioni dell'ufficio. La pagina è una vista del cantiere, come il riepilogo: funziona senza rete e si stampa con `window.print()`.

**Tech Stack:** Next.js 16, React 19 (React Compiler), TypeScript, Dexie, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-rilievo-unico-design.md` (parte 3, bozza approvata `scheda-costruzione-5.html`).

## Global Constraints

- 4 voci per A4, ordine del rilievo, i due tipi mescolati; intestazione con cliente, data, cantiere, "uso interno"; piè di pagina "Pagina N di M".
- Le righe sono sempre le stesse 9, in quest'ordine. Una riga vuota mostra "—". Un profilo non assegnato mostra "da assegnare".
- mq per pezzo = L × H (ingombro per le disegnate), in alto nel riquadro del disegno insieme a POS. e Q.tà.
- Note: stesso campo `note` della voce; scrivibili sulla pagina (salvate nel dispositivo, da inviare), in stampa come testo.
- Stampa: testi `leading-tight`, nessuna scheda che sborda; il CSS di stampa globale forza `overflow: visible`.
- React Compiler: niente letture di ref in render. Testi in italiano.

## Review Focus

1. Voce FP con telai diversi per lato o anta cambiata nella voce: la scheda mostra i codici della voce, non quelli della struttura.
2. Voce disegnata con profili non ancora assegnati o assegnazioni di pezzi spariti: "da assegnare" e nessun codice orfano.
3. Struttura non presente nel dispositivo (catalogo non scaricato): la scheda c'è lo stesso, con TELAIO/ANTA dalla voce e il resto "—".
4. Nota lunga scritta nella pagina: in stampa resta nel riquadro, non sborda nella scheda dopo.
5. Rilievo con 5 o 9 voci: le pagine si dividono a 4 e il numero di pagina è giusto.

---

### Task 1: Dati dei Dettagli costruttivi

**Files:**
- Create: `lib/dettagli-costruttivi.ts`, `lib/dettagli-costruttivi.test.ts`

**Interfaces:**
- Produces:
  - `type EtichettaRiga = 'Telaio' | 'Anta' | 'Riporto' | 'Montanti' | 'Traversi' | 'Fermavetro' | 'Vetri' | 'Accessori' | 'Colori'`
  - `const RIGHE: EtichettaRiga[]` (in quest'ordine)
  - `interface DettagliVoce { titolo: string; larghezza: number | null; altezza: number | null; mqPezzo: number | null; righe: Record<EtichettaRiga, string | null> }`
  - `dettagliVoceFp(v: VoceFpVera, s: Pick<StrutturaLocale, 'albero' | 'nome' | 'descrizione'> | null): DettagliVoce`
  - `dettagliVoceDisegnata(v: VoceDisegnata, nomiSerie: Map<number, string>): DettagliVoce`
- Regole:
  - Codici raggruppati senza ripetere. Più pezzi con lo stesso codice = "CODICE (n)" solo per montanti e traversi.
  - Telaio: codice unico se i 4 lati sono uguali, altrimenti "sx A · alto B · dx C · basso D".
  - Colori: "RAL 9010" se unico, "int. X · est. Y" se bicolore, più " · acc. AV / NO".
  - FP: Vetri e Accessori come `datiRiepilogo`. Disegnata: vetri e pannelli dalle assegnazioni dei riempimenti, accessori aggiunti.

- [ ] **Step 1: Test** con la struttura `ekos-2-ante.str.xml` dei fixture: telaio dalla struttura; telaio con un lato cambiato nella voce; anta cambiata; righe senza contenuto = null; struttura null = solo telai/anta della voce. Voce disegnata: pezzi non assegnati = "da assegnare", assegnati con codice; mq = ingombro.
- [ ] **Step 2: Rosso** — `npx vitest run lib/dettagli-costruttivi.test.ts` → FAIL.
- [ ] **Step 3: Implementare.**
- [ ] **Step 4: Verde** — stesso comando → PASS.
- [ ] **Step 5: Commit** — `feat(rilievo): dati dei dettagli costruttivi`

### Task 2: Pagina Dettagli costruttivi

**Files:**
- Create: `components/rilievo-fp/DettagliCostruttivi.tsx`, `components/rilievo-fp/SchedaDettagli.tsx`
- Modify: `lib/fppro/cantiere-elenco.ts` (+ test: vista `{ tipo: 'dettagli'; id }`, indietro → rilievo), `components/rilievo-fp/AppCantiere.tsx`, `components/rilievo-fp/SchedaRilievo.tsx` (pulsante "Dettagli costruttivi" accanto a "Stampa / PDF")

- [ ] **Step 1: Test** — `vistaPrecedente({ tipo: 'dettagli', id: 'r' })` → `{ tipo: 'rilievo', id: 'r' }`.
- [ ] **Step 2: Rosso** — `npx vitest run lib/fppro/cantiere-elenco.test.ts` → FAIL.
- [ ] **Step 3: Implementare** la scheda come la bozza approvata:
  - disegno a sinistra (FP: `DisegnoVoceSvg` con le note del telaio sui 4 lati; disegnata: `DisegnoSvg` in miniatura con le scritte);
  - righe al centro;
  - NOTE a destra, con una `Textarea` a righe che salva al blur con `salvaVoceLocale` e in stampa diventa testo.

  La pagina divide in fogli da 4 (`print:break-after-page`, altezza scheda fissa in stampa).
- [ ] **Step 4: Verde** — test + `npx tsc --noEmit -p .` → 0, lint pulito.
- [ ] **Step 5: Commit** — `feat(rilievo): pagina dettagli costruttivi, 4 serramenti per foglio`

### Task 3: Prova nel browser, stampa e documenti

- [ ] **Step 1:** Suite completa, lint, build.
- [ ] **Step 2:** Pagina temporanea `app/(public)/p/zz-...` con 5 voci miste. Pilota CDP a 1280 e 390 px. `--print-to-pdf` per controllare 4 schede per foglio e 2 pagine. Note scritte dalla pagina e ritrovate nella voce.
- [ ] **Step 3:** PRD e memoria. Commit `docs: dettagli costruttivi`.
