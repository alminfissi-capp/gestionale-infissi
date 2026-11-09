# Rilievo unico, parte 2: voce disegnata completa e colore unico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La voce disegnata ha scritte su ogni lato, colore unico/Bicolore, colori accessori e accessori aggiunti, ed entra nel riepilogo stampabile come le voci FP PRO; il colore unico/Bicolore vale anche per le voci FP PRO.

**Architecture:** I dati nuovi della voce disegnata stanno dentro `grafico` (li scrive chi disegna, viaggiano con la voce): `noteLati` (chiave = indice del lato), `coloreInt`, `coloreEst`, `coloriAcc`, `accessoriAggiunti`. Le scritte si scrivono dal menu che si apre toccando un lato e si disegnano sul disegno accanto al loro lato. Il colore si sceglie con un componente unico (campo Colore + tasto Bicolore) usato da entrambi i tipi di voce. Il riepilogo compatto ha una scheda per la voce disegnata con la stessa cornice della scheda FP PRO.

**Tech Stack:** Next.js 16, React 19 (React Compiler), TypeScript, Dexie, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-rilievo-unico-design.md` (parte 2).

## Global Constraints

- Dati salvati: restano `coloreInt`/`coloreEst`; "colore unico" = stesso valore in entrambi. Voce già salvata con due colori diversi = si apre in Bicolore. Il calcolo FP PRO non cambia.
- Scritte dei lati legate all'indice del lato (`T{i}`); lati in più spariti = scritte potate al salvataggio.
- Colori accessori della voce disegnata: elenco completo dei colori con `per_accessori`, scelta ordinata come nel veloce (`coloriAcc`, il primo copiato in nessun altro campo: la voce disegnata non ha `coloreAcc`).
- "Aggiungi accessorio" richiede la rete (come nel veloce); tutto il resto funziona senza.
- Riepilogo: stessa impaginazione (5 per A4, `print:h-[46mm]`, testi `leading-tight`), voci nell'ordine del rilievo, i due tipi mescolati.
- React Compiler: niente letture di `ref.current` in render.
- Testi in italiano.

## Review Focus

1. Voce FP PRO salvata prima con interno ≠ esterno: si apre in Bicolore e risalvata non cambia i colori; con interno = esterno si apre in colore unico.
2. Passando da Bicolore a colore unico l'esterno diventa uguale all'interno (non resta un esterno vecchio nascosto).
3. Forma cambiata da 5 a 4 lati (casetta → rettangolo con Forme): la scritta del quinto lato non resta appesa né compare su un altro lato.
4. Scritta lunga su un lato corto o su un arco: resta leggibile e non copre le quote della forma.
5. Riepilogo stampato con voci miste: 5 schede per foglio, nessuna scheda che sborda nella successiva, mq totali che sommano anche le disegnate.

---

### Task 1: Colore unico con tasto Bicolore

**Files:**
- Create: `lib/colore-unico.ts`, `lib/colore-unico.test.ts`, `components/rilievo-fp/SceltaColore.tsx`
- Modify: `components/rilievo-fp/SchermataVoce.tsx` (i due campi Interno/Esterno diventano `SceltaColore`)

**Interfaces:**
- Produces:
  - `eBicolore(int: RifFp | null | undefined, est: RifFp | null | undefined): boolean` — vero solo se entrambi presenti con `fpId` diversi
  - `colori(unico: RifFp | null): { coloreInt: RifFp | null; coloreEst: RifFp | null }`
  - `toglieBicolore(int, est): { coloreInt; coloreEst }` — l'esterno diventa l'interno (se l'interno manca, vale l'esterno)
  - `<SceltaColore int est voci preferiti? onStella? onCambia={(c: { coloreInt; coloreEst }) => void} />` — un campo "Colore" e un pulsante "Bicolore"; in Bicolore due campi "Colore interno" ed "Esterno" e il pulsante "Colore unico"

- [ ] **Step 1: Test** (`lib/colore-unico.test.ts`): `eBicolore` falso con uno solo, con due uguali, vero con due diversi; `colori(c)` mette c in entrambi; `toglieBicolore(a, b)` → entrambi a; `toglieBicolore(null, b)` → entrambi b.
- [ ] **Step 2: Rosso** — `npx vitest run lib/colore-unico.test.ts` → FAIL.
- [ ] **Step 3: Implementare** le funzioni e `SceltaColore` (usa `SceltaFp` come oggi). Stato "Bicolore" locale, che parte da `eBicolore(int, est)`. In `SchermataVoce` sostituisce il ciclo `[['coloreInt', ...], ['coloreEst', ...]]`.
- [ ] **Step 4: Verde** — `npx vitest run lib/colore-unico.test.ts lib/fppro` → PASS; `npx tsc --noEmit -p .` → 0.
- [ ] **Step 5: Commit** — `feat(rilievo): colore unico con tasto Bicolore`

---

### Task 2: Scritte sui lati della voce disegnata

**Files:**
- Modify: `types/rilievo-fp.ts` (`VoceGraficoDati` con `noteLati?`, `coloreInt?`, `coloreEst?`, `coloriAcc?`, `accessoriAggiunti?`), `components/rilievo-grafico/MenuLato.tsx` (campo "Scritta sul lato"), `components/rilievo-grafico/DisegnoSvg.tsx` (prop `scritteLati`), `components/rilievo-grafico/EditorVoceDisegnata.tsx`
- Create: `lib/rilievo-grafico/scritte-lati.ts`, `lib/rilievo-grafico/scritte-lati.test.ts`

**Interfaces:**
- Produces:
  - `posizioneScritta(l: LatoContorno, distanza: number): { x: number; y: number; angolo: number }` — punto a metà del lato (sull'arco per gli archi) spostato verso l'esterno di `distanza`, in mm con y in alto; `angolo` in gradi per leggere il testo lungo il lato, mai capovolto (tra −90 e 90)
  - `notePulite(note: Record<string, string> | undefined, nLati: number): Record<string, string>` — solo indici `< nLati` con testo non vuoto (trim)
  - `DisegnoSvg` prop `scritteLati?: Record<string, string>` disegnate in arancione (`#c2410c`)

- [ ] **Step 1: Test**:
  - rettangolo antiorario 1000 × 500 (lati 0 basso, 1 destra, 2 alto, 3 sinistra): lato 0 → x 500, y −d, angolo 0; lato 1 → x 1000+d, y 250, angolo ±90; lato 2 → y 500+d, angolo 0 (non 180).
  - arco con freccia 200 sul lato alto → y = 500 + 200 + d.
  - `notePulite({0:'L MAG', 4:'falda', 1:'  '}, 4)` → `{ '0': 'L MAG' }`.
- [ ] **Step 2: Rosso** — `npx vitest run lib/rilievo-grafico/scritte-lati.test.ts` → FAIL.
- [ ] **Step 3: Implementare**
  - `MenuLato` riceve `scritta` e `onScritta(testo)`, con un campo di testo che si conferma con Invio o uscendo, come la casellina delle quote.
  - L'editor salva `grafico.noteLati`. A ogni cambio di forma, `cambiaDisegno` pota con `notePulite(note, contorno.length)`.
  - `DisegnoSvg` disegna le scritte a distanza `fs * 1.1` dal lato, carattere `fs * 0.9`. Le quote della forma sono più fuori, quindi le due cose non si toccano.
- [ ] **Step 4: Verde** — `npx vitest run lib/rilievo-grafico` → PASS; tsc 0.
- [ ] **Step 5: Commit** — `feat(rilievo): scritte su ogni lato della voce disegnata`

---

### Task 3: Colori e accessori nella voce disegnata

**Files:**
- Create: `components/rilievo-fp/AccessoriAggiunti.tsx` (estratto da `SchermataVoce`: elenco con quantità, togli, "Aggiungi accessorio" con `DialogAccessorioFp`), `components/rilievo-fp/ColoriAccessori.tsx` (elenco ordinato con su/giù/togli + scelta), `components/rilievo-grafico/PannelloFinitura.tsx`
- Modify: `components/rilievo-fp/SchermataVoce.tsx` (usa `AccessoriAggiunti`), `components/rilievo-grafico/EditorVoceDisegnata.tsx` (terza scheda "3 · Colori e accessori")
- Modify: `lib/rilievo-unico.ts` + test

**Interfaces:**
- Produces: `aggiungiAccessorio(lista: AccessorioAggiunto[], a: { codice: string; descrizione: string | null; serie: string | null }): AccessorioAggiunto[]` — stesso codice e serie = quantità +1, altrimenti in fondo con quantità 1 (oggi la logica è scritta dentro `SchermataVoce`)

- [ ] **Step 1: Test** — `aggiungiAccessorio` su lista vuota → 1 elemento q.tà 1; stesso codice+serie → q.tà 2; stesso codice, serie diversa → 2 elementi.
- [ ] **Step 2: Rosso** — `npx vitest run lib/rilievo-unico.test.ts` → FAIL.
- [ ] **Step 3: Implementare** — `SchermataVoce` usa `aggiungiAccessorio` e `AccessoriAggiunti`, con lo stesso comportamento di prima. `PannelloFinitura` contiene:
  - `SceltaColore` con i colori dei profili (`db.fpColori` con `per_profili`);
  - `ColoriAccessori` con l'elenco completo `per_accessori`;
  - `AccessoriAggiunti`, che senza rete mostra "Serve la rete per sfogliare il catalogo".

  Tutto si salva in `grafico` con il salvataggio automatico dell'editor (passo di Annulla incluso).
- [ ] **Step 4: Verde** — `npx vitest run lib` → PASS; tsc 0.
- [ ] **Step 5: Commit** — `feat(rilievo): colori e accessori nella voce disegnata`

---

### Task 4: Voce disegnata nel riepilogo

**Files:**
- Create: `lib/rilievo-grafico/riepilogo-disegnata.ts` + test, `components/rilievo-fp/SchedaVoceDisegnataRiepilogo.tsx`
- Modify: `components/rilievo-fp/SchedaVoceRiepilogo.tsx` (esporta `Campo`), `components/rilievo-fp/RiepilogoRilievo.tsx` (voci miste nell'ordine, via l'avviso, mq totali con le disegnate), `components/rilievo-fp/RigaVoceDisegnata.tsx` (contenuto = la scheda del riepilogo, come le voci FP), `lib/rilievo-unico.ts` (via `vociDelRiepilogo` se non serve più)

**Interfaces:**
- Produces: `datiRiepilogoDisegnata(v: VoceDisegnata, nomiSerie: Map<number, string>): { mq: number; larghezza: number; altezza: number; tipo: string; serie: string | null; colore: string | null; finituraEst: string | null; finituraInt: string | null; coloreAcc: string | null; accessori: string | null; note: string | null }`
  - mq = ingombro × quantità (m²);
  - `tipo` = "Voce disegnata · N lati" (oppure "· con arco");
  - colore unico → `finituraEst` = `finituraInt` = descrizione; bicolore → le due descrizioni;
  - `coloreAcc` = descrizioni in ordine, separate da " / ";
  - accessori = "2 x DESCR" come nel veloce.

- [ ] **Step 1: Test** — rettangolo 1200 × 1400 q.tà 2 → mq 3,36; casetta 5 lati → tipo con "5 lati"; un colore → int = est; bicolore; accessori con quantità; serie dai nomi.
- [ ] **Step 2: Rosso** — `npx vitest run lib/rilievo-grafico/riepilogo-disegnata.test.ts` → FAIL.
- [ ] **Step 3: Implementare** la scheda con la stessa cornice e gli stessi campi della scheda FP:
  - a sinistra `DisegnoSvg` in miniatura con le scritte dei lati;
  - a destra Serie, Finitura est./int., Colore accessori, Accessori e Note;
  - prezzo: "Non calcolato".
- [ ] **Step 4: Verde** — `npx vitest run lib` → PASS; tsc 0; lint pulito.
- [ ] **Step 5: Commit** — `feat(rilievo): voce disegnata nel riepilogo stampabile`

---

### Task 5: Prova nel browser e documenti

- [ ] **Step 1:** `npx vitest run` → tutto verde; `npm run lint` → pulito; `npm run build` → riuscita.
- [ ] **Step 2:** Pagina temporanea `app/(public)/p/zz-...` (cancellata alla fine), pilota CDP a 1280 e 390 px. Da provare:
  - scritta su un lato e su un arco;
  - Forme da casetta a rettangolo (la scritta del 5º lato sparisce);
  - colore unico → Bicolore → colore unico;
  - riepilogo con voci miste e anteprima di stampa (`--print-to-pdf`, 5 schede per foglio).
- [ ] **Step 3:** PRD + `project_rilievo_grafico.md` aggiornati.
- [ ] **Step 4: Commit** — `docs: rilievo unico parte 2`
