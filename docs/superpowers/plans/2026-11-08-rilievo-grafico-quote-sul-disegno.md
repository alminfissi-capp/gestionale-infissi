# Rilievo grafico — misure scritte sul disegno · Piano di lavoro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `/rilievo/grafico/[id]` ogni lato, scarto, angolo e arco della forma ha una quota sul disegno che si tocca e si riscrive in una casellina lì sopra; i modelli diventano solo un punto di partenza; il pannello laterale si apre e si chiude.

**Architecture:** La forma diventa sempre "a punti" (vertici + freccia per lato). Un nuovo modulo puro `lib/rilievo-grafico/quote-forma.ts` calcola le quote della forma e applica una misura scritta restituendo i punti nuovi (o `null` se la forma non torna). I componenti disegnano quelle quote, aprono una casellina HTML posizionata sopra il disegno e chiamano il modulo.

**Tech Stack:** Next.js 16 (App Router, React 19, React Compiler), TypeScript, Tailwind + shadcn/ui, Dexie, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-rilievo-grafico-quote-sul-disegno-design.md` — leggerla prima di ogni task.

## Global Constraints

- Logica geometrica pura in `lib/rilievo-grafico/` (niente React, niente Supabase), test in `lib/rilievo-grafico/rilievo-grafico.test.ts` o in un file `*.test.ts` accanto.
- Coordinate in mm, y verso l'alto, contorno antiorario con minimo in 0,0 (come `normalizzaContorno`).
- Pezzi telaio `T{i}` = indice del lato dopo `normalizzaContorno`: la conversione modello → punti tiene lo stesso ordine.
- React Compiler: niente letture di `ref.current` né misure DOM in render; le posizioni sullo schermo si leggono nei gestori di evento e si mettono in `useState` (memoria gotcha_react_compiler_refs).
- localStorage sempre dentro try/catch.
- Testi dell'interfaccia in italiano semplice; misure in mm, virgola accettata come separatore decimale.
- `npm test`, `npm run lint` a zero, `npm run build` puliti alla fine.
- Lavoro sul ramo `feat/rilievo-grafico-quote`.

## Review Focus

1. **Scrivere cifra per cifra** — digitando "1000" la forma non deve passare da 1, 10, 100: la misura si applica solo alla conferma (Invio / tocco fuori). Test UI nel Task 6.
2. **Misura che rompe la forma** (testa spostata oltre la base fino a incrociare i lati, quota 0 o negativa) → `applicaQuota` restituisce `null`, la casellina resta rossa e il disegno non cambia. Test nel Task 2.
3. **Corda di un arco cambiata dopo l'arco** → la freccia salvata resta uguale e l'altezza totale si aggiorna. Test nel Task 4.
4. **Rilievo già salvato col tipo `modello` e profili assegnati sul telaio** → per il rettangolo e il trapezio gli id `T0..T3` restano identici dopo la conversione. Test nel Task 1.
5. **Virgola e spazi nella casellina** ("1200,5", " 1200 ") → accettati; testo vuoto o lettere → non valido. Test nel Task 6 (`leggiMisura`).

---

### Task 1: Conversione modello → punti

**Files:**
- Modify: `lib/rilievo-grafico/forma.ts`
- Test: `lib/rilievo-grafico/rilievo-grafico.test.ts`

**Interfaces:**
- Produces:
  - `frecciaArco(l: Extract<LatoContorno, { tipo: 'arco' }>): number` — freccia firmata del lato in un contorno antiorario: `r·(1 − cos(s/2))` con `s = ampiezzaArco(l)`; positiva se l'arco esce (in contorno antiorario: `orario === false`).
  - `formaInPunti(forma: Forma): PuntoForma[]` — esegue `contornoForma`, unisce gli archi consecutivi con stesso centro (±0,5 mm), stesso raggio e stesso verso **salvo che l'unione chiuda il cerchio** (oblò resta 2 lati), poi un punto per lato `{ x: da.x, h: da.y, freccia? }` arrotondato a 0,1 mm. Per `tipo: 'punti'` restituisce i punti normalizzati (stesso giro di `contornoForma`).
  - `normalizzaPunti(punti: PuntoForma[]): PuntoForma[]` = `formaInPunti({ tipo: 'punti', punti })`.

- [ ] **Step 1: Test che falliscono** — `describe('forma a punti dai modelli')`:
  - per tutti i 29 `MODELLI`: `contornoForma({ tipo:'punti', punti: formaInPunti(modello) })` ha ingombro uguale (±1 mm) e area uguale (±0,5%) al modello;
  - `formaInPunti(rett(1200,1400))` → `[{x:0,h:0},{x:1200,h:0},{x:1200,h:1400},{x:0,h:1400}]` senza freccia; stessa cosa per MODEL-01 (`L:1770,H1:1940,H2:2215`) con 4 punti; gli id dei pezzi telaio di `calcolaDisegno` sono `T0..T3` con gli stessi tratti prima e dopo;
  - MODEL-54 (`L:2500,H1:2300,H2:500`) → 4 punti, uno con `freccia` ≈ 500 (±1);
  - MODEL-52 (`D:900`) → 2 punti, entrambi con freccia ≈ 450;
  - MODEL-53 mezzaluna → l'arco è un lato solo.
- [ ] **Step 2:** `npm test` → falliscono (funzioni mancanti).
- [ ] **Step 3:** Implementare le tre funzioni in `forma.ts`. Se l'ordine dei punti dopo `latiDaPunti → normalizzaContorno` non coincide con quello dei lati di partenza, ruotarli prima di restituirli.
- [ ] **Step 4:** `npm test` → passano (inclusi i test esistenti).
- [ ] **Step 5:** Commit `feat(rilievo-grafico): modelli convertiti in forma a punti con archi uniti`.

### Task 2: Quote del quadrilatero (lati e scarti)

**Files:**
- Create: `lib/rilievo-grafico/quote-forma.ts`
- Test: `lib/rilievo-grafico/quote-forma.test.ts`

**Interfaces:**
- Consumes: `normalizzaPunti`, `latiDaPunti`, `poligonoContorno` (Task 1 / esistenti).
- Produces:
  ```ts
  export type TipoQuotaForma = 'lato' | 'scarto' | 'angolo' | 'totale' | 'freccia' | 'altezza_arco' | 'raggio'
  export interface QuotaForma {
    /** 'L{i}' lato · 'S{i}a' / 'S{i}b' scarti (a = verso il minimo di x o y) · 'A{y}' angolo · 'TL' / 'TH' totali · 'F{i}' freccia · 'AT{i}' altezza totale arco · 'R{i}' raggio */
    id: string
    tipo: TipoQuotaForma
    lato: number | null
    direzione: 'x' | 'y'
    valore: number          // arrotondato a 1 mm
    modificabile: boolean   // false solo per 'raggio'
    posizione: Pt           // dove disegnarla, mm, fuori dal contorno
  }
  export function quoteForma(punti: PuntoForma[]): QuotaForma[]
  export function applicaQuota(punti: PuntoForma[], id: string, valore: number): PuntoForma[] | null
  ```
  Regole (spec, "Comportamento delle quote" e scelte 3-4): lato `i` va da `punti[i]` a `punti[i+1]`; orizzontale se `|dx| ≥ |dy|`; valore = proiezione. Su 4 lati: cambiare `L{i}` sposta i due estremi in modo simmetrico lungo la direzione, i vicini si inclinano. Scarti = distanza degli estremi dall'ingombro **dei vertici** (archi esclusi); presenti solo se almeno uno > 0,5 mm, e allora entrambi. Cambiare uno scarto trasla il lato lungo la direzione tenendo la quota. Risultato passato per `normalizzaPunti`; `null` se valore ≤ 0, se l'area è ≤ 0 o se due lati (corde) non adiacenti si incrociano.

- [ ] **Step 1: Test che falliscono** (rettangolo `R = [{x:0,h:0},{x:1200,h:0},{x:1200,h:1400},{x:0,h:1400}]`):
  - `quoteForma(R)` ha `L0=1200, L1=1400, L2=1200, L3=1400`, nessuno scarto, nessun `TL/TH/A*`;
  - `applicaQuota(R,'L2',1000)` → testa da x 100 a 1100; quote `S2a=100, S2b=100`;
  - poi `applicaQuota(.., 'S2a', 0)` → testa da 0 a 1000, `S2b=200`, `L0` resta 1200;
  - `applicaQuota(R,'L1',1200)` → lato destro da h 100 a 1300, `S1a=100, S1b=100`; poi `S1a`→0 → da 0 a 1200, `S1b=200`;
  - `applicaQuota(R,'L2',0)` → `null`; `applicaQuota(R,'L2',1000)` poi `S2a`→ 5000 (testa che esce e incrocia) → `null`.
- [ ] **Step 2:** `npm test` → falliscono.
- [ ] **Step 3:** Implementare `quoteForma` e `applicaQuota` per i casi lato/scarto (4 lati).
- [ ] **Step 4:** `npm test` → passano.
- [ ] **Step 5:** Commit `feat(rilievo-grafico): quote di lati e scarti sul quadrilatero`.

### Task 3: Forme con più di 4 lati (angoli, totali, lati a squadra)

**Files:**
- Modify: `lib/rilievo-grafico/quote-forma.ts`
- Test: `lib/rilievo-grafico/quote-forma.test.ts`

**Interfaces:**
- Produces: stesse funzioni del Task 2, che ora gestiscono `n > 4`.
  Regole (spec, "Forme con più di 4 lati" e scelta 3): un lato è "a squadra" se esattamente orizzontale o verticale (±0,5 mm). Con `n > 4`:
  - spostare un vertice in x trascina con sé l'altro estremo dei lati verticali che lo toccano (a catena); in y, dei lati orizzontali;
  - `L{i}` di un lato con almeno un vicino a squadra: resta fermo l'estremo più a sinistra (orizzontale) / più in basso (verticale), si sposta l'altro, con il trascinamento; se nessun vicino è a squadra: centrato come sul quadrilatero, con gli scarti;
  - scarti solo sui lati col comportamento centrato;
  - `A{y}`: una quota per ogni altezza distinta dei vertici strettamente tra 0 e l'altezza massima; cambiarla sposta in y tutti i vertici a quell'altezza (con trascinamento);
  - `TL` / `TH`: larghezza e altezza totali dei vertici; cambiarle sposta in x i vertici con x massima / in y quelli con y massima (con trascinamento).

- [ ] **Step 1: Test che falliscono:**
  - casetta MODEL-02 (`L:1500,H1:1200,H2:1800`) da `formaInPunti`: ci sono `TL=1500`, `TH=1800`, `A1200`; `applicaQuota(..,'TH',2000)` → colmo a 2000, muri ancora verticali e alti 1200; `applicaQuota(..,'A1200',1000)` → gronde a 1000, colmo fermo a 1800;
  - "L" MODEL-06 (`L`, `L1`, `H1`, `H` coi valori di esempio di `misureModello`): `A{H1}` presente; cambiandola tutti i lati restano orizzontali o verticali;
  - casetta: `L` del lato del tetto sinistro a 900 → colmo a x 900, muro sinistro verticale.
- [ ] **Step 2:** `npm test` → falliscono.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** `npm test` → passano (anche i test del Task 2: il quadrilatero non cambia).
- [ ] **Step 5:** Commit `feat(rilievo-grafico): quote di angoli e totali, i lati a squadra restano a squadra`.

### Task 4: Archi (freccia, altezza totale, raggio, Arco/Dritto)

**Files:**
- Modify: `lib/rilievo-grafico/quote-forma.ts`
- Test: `lib/rilievo-grafico/quote-forma.test.ts`

**Interfaces:**
- Produces:
  - `impostaArco(punti: PuntoForma[], lato: number, freccia: number): PuntoForma[] | null` — `freccia = 0` = **Dritto** (toglie `freccia`).
  - in `quoteForma`, per un lato con freccia: `F{i}` (freccia), `AT{i}` (da 0 al punto più alto dell'arco per un lato orizzontale; per un lato verticale la larghezza fino al punto più esterno), `R{i}` (raggio `(c²/4 + f²) / (2|f|)`, `modificabile: false`). La quota `L{i}` della corda resta.
  - `applicaQuota(.., 'AT{i}', v)` cambia solo la freccia: `f + (v − attuale)`; `F{i}` imposta la freccia (negativa = rientra).

- [ ] **Step 1: Test che falliscono** (rettangolo 1200 × 1400 `R`):
  - `impostaArco(R, 2, 150)` → `F2=150`, `AT2=1550`, `R2=1275`, `L2=1200`;
  - poi `applicaQuota(..,'AT2',1600)` → `F2=200`;
  - poi `applicaQuota(..,'L1',1300)` (muro destro centrato) → `F2` resta 200 (Review Focus 3);
  - `impostaArco(.., 2, 0)` → nessuna freccia, nessuna `F/AT/R`;
  - `applicaQuota(..,'R2',500)` → `null`.
- [ ] **Step 2:** `npm test` → falliscono.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** `npm test` → passano.
- [ ] **Step 5:** Commit `feat(rilievo-grafico): archi con freccia, altezza totale e raggio`.

### Task 5: Quota di montanti e traversi in una funzione pura

**Files:**
- Modify: `lib/rilievo-grafico/modifiche.ts`, `components/rilievo-grafico/PannelloStruttura.tsx`
- Test: `lib/rilievo-grafico/rilievo-grafico.test.ts`

**Interfaces:**
- Produces: `scriviQuotaTaglio(radice: Zona, calc: DisegnoCalcolato, idTaglio: string, valore: number): Zona | null` — la logica oggi dentro `scriviQuota` di `PannelloStruttura.tsx` (passa da "uguali" a quote tenendo il verso attuale); `null` se `valore ≤ 0` o `≥` ingombro della zona.

- [ ] **Step 1: Test che fallisce:** rettangolo 1200 × 1400 con un montante a metà (`dividi(..,'montante',{modo:'uguali'},2)`): `scriviQuotaTaglio(.., '<div>#0', 400)` → `calcolaDisegno` dà la quota 400 da sinistra; `valore 1300` → `null`.
- [ ] **Step 2:** `npm test` → fallisce.
- [ ] **Step 3:** Implementare in `modifiche.ts`; in `PannelloStruttura.tsx` togliere il campo "Quota" del montante/traverso (restano i pulsanti a metà / da sinistra / da destra e Togli) e il testo del telaio selezionato diventa "tocca le quote sul disegno per cambiare le misure; tocca il lato per farne un arco".
- [ ] **Step 4:** `npm test` e `npm run lint` → puliti.
- [ ] **Step 5:** Commit `refactor(rilievo-grafico): quota di montanti e traversi in una funzione pura`.

### Task 6: Casellina e menù del lato sul disegno

**Files:**
- Create: `components/rilievo-grafico/CasellaQuota.tsx`, `components/rilievo-grafico/MenuLato.tsx`, `lib/rilievo-grafico/misura.ts`
- Modify: `components/rilievo-grafico/DisegnoSvg.tsx`, `components/rilievo-grafico/EditorRilievoGrafico.tsx`
- Test: `lib/rilievo-grafico/quote-forma.test.ts`

**Interfaces:**
- Consumes: `quoteForma`, `applicaQuota`, `impostaArco` (Task 2-4), `scriviQuotaTaglio` (Task 5), `formaInPunti` (Task 1).
- Produces:
  - `leggiMisura(s: string): number | null` in `misura.ts` (trim, virgola → punto, numero finito; altrimenti `null`).
  - `DisegnoSvg`: nuove prop `quoteForma?: QuotaForma[]`, `onQuotaForma?: (id: string, ancora: Ancora) => void`, `onLato?: (lato: number, ancora: Ancora) => void`; `onQuota` diventa `(id: string, ancora: Ancora) => void`. `export interface Ancora { x: number; y: number }` = centro del rettangolo della quota/lato in px relativi al contenitore del disegno, letto con `getBoundingClientRect` **nel gestore del clic**. Le quote della forma si disegnano fuori dal contorno come quelle di oggi (rettangolino bianco bordo arancio); il raggio senza bordo (solo lettura). Le vecchie quote fisse larghezza/altezza in basso e a destra spariscono.
  - `CasellaQuota({ ancora, valore, onConferma, onAnnulla })`: `<input inputMode="decimal">` assoluto sopra `ancora`, testo iniziale = valore, selezionato; Invio o blur → `onConferma(n)` se `leggiMisura` non è `null`; Esc → `onAnnulla`. `onConferma` restituisce `boolean`: `false` = bordo rosso + "Misura non possibile", la casellina resta aperta.
  - `MenuLato({ ancora, arco, onArco, onDritto, onChiudi })`: due pulsanti; **Arco** apre la casellina della freccia (valore iniziale 0 → conferma con `impostaArco`).
  - Editor: stato `aperta: { tipo: 'forma' | 'taglio' | 'lato'; id: string; ancora: Ancora } | null`; il disegno sta in un `div relative`; si chiude al cambio scheda, ad Annulla/Ripeti e al resize. Ogni modifica della forma: `formaInPunti(r.disegno.forma)` → funzione del modulo → `cambiaDisegno({ ...r.disegno, forma: { tipo: 'punti', punti } })` senza `unisci` (una conferma = un passo di Annulla). Toccare un pezzo `T{i}` apre `MenuLato` per il lato `i` (oltre a selezionarlo).

- [ ] **Step 1: Test che fallisce:** `leggiMisura('1200,5') === 1200.5`, `leggiMisura(' 1200 ') === 1200`, `leggiMisura('') === null`, `leggiMisura('abc') === null`.
- [ ] **Step 2:** `npm test` → fallisce; implementare `misura.ts`; `npm test` → passa.
- [ ] **Step 3:** Implementare `CasellaQuota`, `MenuLato`, le modifiche a `DisegnoSvg` ed `EditorRilievoGrafico`.
- [ ] **Step 4: Prova nel browser** (pagina temporanea senza login sotto `app/(public)/p/zz-...` + pilota CDP nello scratchpad, come da memoria project_rilievo_grafico; la pagina temporanea si cancella prima del commit): rettangolo → tocco testa, scrivo 1000 → compaiono 100 | 1000 | 100; scrivo 0 a sinistra → 0 | 1000 | 200; digitando "1000" la forma non cambia prima dell'Invio (Review Focus 1); tocco testa → Arco → 150 → compaiono freccia, altezza totale 1550, raggio 1275; tocco quota di un montante → casellina → 400 → montante spostato; misura impossibile → bordo rosso, disegno invariato. Screenshot al telefono (390 px) e al desktop.
- [ ] **Step 5:** `npm run lint` pulito; commit `feat(rilievo-grafico): misure scritte direttamente sul disegno`.

### Task 7: Pannello richiudibile e pulsante Forme

**Files:**
- Create: `components/rilievo-grafico/SceltaForme.tsx`
- Delete: `components/rilievo-grafico/PannelloForma.tsx`
- Modify: `components/rilievo-grafico/EditorRilievoGrafico.tsx`

**Interfaces:**
- Consumes: `formaInPunti`, `misureModello`, `MODELLI` (esistenti/Task 1).
- Produces: `SceltaForme({ aperta, onChiudi, onScegli: (punti: PuntoForma[]) => void, larghezza, altezza })` — Dialog con la griglia di miniature (spostare `Miniatura` da `PannelloForma.tsx`). Scelto un modello: `misureModello(id, { L: larghezza, H: altezza })` (solo le chiavi che il modello ha) → `formaInPunti` → `onScegli`.

- [ ] **Step 1:** Barra sopra il disegno: pulsante **Forme** (apre `SceltaForme`) e pulsante per aprire/chiudere il pannello (`PanelRightClose` / `PanelRightOpen`). Stato `pannelloAperto` letto con `useState(() => { try { return localStorage.getItem('rilievo-grafico:pannello') !== 'chiuso' } catch { return true } })` e scritto con try/catch. Chiuso: la griglia `lg:grid-cols-[minmax(0,1fr)_24rem]` diventa una colonna e il disegno prende tutta la larghezza; sul telefono il pannello sotto il disegno sparisce. Vale per entrambe le schede.
- [ ] **Step 2:** Togliere `PannelloForma` dall'editor e cancellare il file; il pannello della struttura mostra solo `PannelloStruttura`.
- [ ] **Step 3: Prova nel browser** (stesso pilota del Task 6): Forme → Casetta → forma 1200 × 1400 con colmo; pannello chiuso → ricaricata la pagina resta chiuso; un rilievo salvato col tipo `modello` si apre e la prima misura toccata lo converte senza perdere i profili del telaio (rettangolo).
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build` (con `RESEND_API_KEY` fittizia se manca) → puliti.
- [ ] **Step 5:** Commit `feat(rilievo-grafico): pannello richiudibile e scelta forme dalla barra`.

### Task 8: Chiusura

- [ ] Aggiornare il PRD (`PRD.md` nella memoria del progetto, vedi feedback_prd_workflow) e la memoria `project_rilievo_grafico.md` con: forma sempre a punti, quote sul disegno, regole del centrato e dei lati a squadra.
- [ ] Push del ramo `feat/rilievo-grafico-quote`.
