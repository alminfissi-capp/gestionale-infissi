# Rilievo unico, parte 1: voci disegnate nel rilievo e cliente vero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un rilievo del cantiere contiene voci di due tipi, da struttura FP PRO o disegnate, il cliente si sceglie con il modulo dei preventivi e la sezione "Rilievo grafico" separata sparisce.

**Architecture:** La voce disegnata è una riga di `rilievo_veloce_voci` con `fp` nullo e `grafico` (forma, radice, serie) valorizzato. Le assegnazioni dell'ufficio (profili, riempimenti) stanno in una colonna separata, `assegnazioni_grafico`, con il suo istante `assegnazioni_grafico_at`: le scrive solo l'ufficio con una server action e il telefono le riceve. L'editor del disegno di oggi diventa una vista della pagina del cantiere (niente navigazioni Next), quindi funziona senza rete. Calcolo e trasferimento leggono già solo le voci con `fp`: le voci disegnate finiscono tra le "saltate", con il loro motivo.

**Tech Stack:** Next.js 16 (App Router, React 19 con React Compiler), TypeScript, Supabase (Postgres, RLS), Dexie, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-rilievo-unico-design.md` (parte 1; le parti 2 e 3 hanno piani propri).

## Global Constraints

- Pagina del cantiere: niente navigazioni Next (viste con stato + `history.pushState(history.state)`); non leggere `history.state`.
- Ricezione per `segno_server`, mai per l'orario del telefono; eliminazioni in `fp_rilievi_eliminati`.
- Il telefono riscrive `fp` e `grafico` interi; `assegnazioni_grafico` e `correzioni_fp` non li manda mai, tranne `assegnazioni_grafico` quando la riga è nuova sul server (voce copiata).
- La scrittura delle assegnazioni NON tocca `updated_at`: un telefono con modifiche al disegno fatte prima, ma inviate dopo, non deve venire scartato.
- React Compiler: niente letture di `ref.current` in render, niente scritture in ref passati come prop.
- Le voci veloci esistenti, il loro calcolo e i preventivi non cambiano: stessi risultati di prima.
- Nessun upgrade Dexie che svuota tabelle usate senza rete.
- Testi dell'interfaccia in italiano.
- I rilievi grafici di prova si cancellano dal database di produzione **solo dopo la conferma esplicita dell'utente** (Task 7).

## Review Focus

1. Ufficio che assegna un profilo mentre il telefono ha una modifica al disegno ancora da inviare: dopo l'invio del telefono il disegno è quello del telefono e l'assegnazione resta.
2. Voce disegnata creata senza rete, poi rete: la voce arriva al server, e solo allora si possono assegnare i profili (prima l'editor lo dice, non fallisce in silenzio).
3. Rilievo con voci miste: riepilogo, Calcolo e trasferimento non si rompono, le voci FP PRO danno gli stessi numeri di prima, le disegnate sono elencate come escluse.
4. Copia di una voce disegnata: nuova voce con disegno e assegnazioni, che dopo l'invio ha le assegnazioni anche sul server.
5. Cliente scelto dall'anagrafica e poi modificato a mano (telefono cambiato): resta legato alla scheda (`clienteId`) come nei preventivi (`deveScollegareCliente`); cliente nuovo senza rete: niente errori, lo registra il trasferimento.

---

### Task 1: Dati della voce disegnata, database e sincronizzazione

**Files:**
- Create: `supabase/migrations/20261108120000_voci_disegnate.sql`
- Modify: `types/rilievo-fp.ts`, `actions/rilievo-fp.ts` (invio, ricezione, nuova action), `lib/fppro/sync-rilievi.ts`, `hooks/useInvioRilievi.ts`
- Test: `lib/fppro/sync-rilievi.test.ts`, `lib/rilievo-unico.test.ts` (nuovo)

**Interfaces:**
- Produces (in `types/rilievo-fp.ts`):
  - `type VoceGraficoDati = Pick<DisegnoGrafico, 'forma' | 'radice' | 'serie'>`
  - `type AssegnazioniGrafico = Pick<DisegnoGrafico, 'profili' | 'riempimenti'>`
  - `VoceFp` diventa: `fp: VoceFpDati | null`, `grafico?: VoceGraficoDati | null`, `assegnazioni?: AssegnazioniGrafico | null`, `assegnazioniAt?: string | null`
  - `type VoceFpVera = VoceFp & { fp: VoceFpDati }`, `type VoceDisegnata = VoceFp & { fp: null; grafico: VoceGraficoDati }`
- Produces (in `lib/rilievo-unico.ts`, nuovo, senza import di React): `eVoceDisegnata(v: VoceFp): v is VoceDisegnata`, `eVoceFp(v: VoceFp): v is VoceFpVera`, `disegnoDellaVoce(v: VoceDisegnata): DisegnoGrafico` (unisce grafico + assegnazioni; assegnazioni assenti = `{}`)
- Produces (in `lib/fppro/sync-rilievi.ts`): `assegnazioniDaApplicare(locali: Map<string, { assegnazioniAt?: string | null }>, remoti: { id: string; assegnazioni?: AssegnazioniGrafico | null; assegnazioniAt?: string | null }[]): { id: string; assegnazioni: AssegnazioniGrafico | null; assegnazioniAt: string }[]`
- Produces (in `actions/rilievo-fp.ts`): `salvaAssegnazioniGrafico(voceId: string, a: AssegnazioniGrafico): Promise<{ assegnazioniAt: string } | { errore: string }>`

- [ ] **Step 1: Test che falliscono**

`lib/rilievo-unico.test.ts`:
- `eVoceDisegnata` vero con `fp: null, grafico: {...}`, falso con `fp` valorizzato.
- `disegnoDellaVoce` di una voce senza assegnazioni → `profili: {}`, `riempimenti: {}`; con assegnazioni → le stesse, e forma/radice/serie da `grafico`.

`lib/fppro/sync-rilievi.test.ts`, describe `assegnazioniDaApplicare`:
- remota più recente della locale → applicata;
- remota uguale o più vecchia → non applicata;
- locale senza `assegnazioniAt`, remota con → applicata;
- remota senza `assegnazioniAt` → mai applicata (niente da portare).

- [ ] **Step 2: Verifica rosso** — Run: `npx vitest run lib/rilievo-unico.test.ts lib/fppro/sync-rilievi.test.ts` — Expected: FAIL (funzioni non definite).

- [ ] **Step 3: Migrazione**

```sql
alter table rilievo_veloce_voci
  add column grafico jsonb,
  add column assegnazioni_grafico jsonb,
  add column assegnazioni_grafico_at timestamptz;
-- Una voce e' di un tipo solo: da struttura FP PRO (fp) o disegnata (grafico).
alter table rilievo_veloce_voci
  add constraint rilievo_veloce_voci_un_tipo check ((fp is null) <> (grafico is null));
```
Applicarla con `mcp__supabase__apply_migration` (nome `voci_disegnate`). Oggi tutte le 52 voci hanno `fp`: il vincolo passa.

- [ ] **Step 4: Implementare tipi, `lib/rilievo-unico.ts`, `assegnazioniDaApplicare`**

- [ ] **Step 5: Azioni**
- `inviaRilieviFp`: l'upsert delle voci scrive `fp: v.fp ?? null, grafico: v.grafico ?? null`. Per le voci che sul server non esistono ancora (`piuRecenti` ha già la mappa degli id presenti: farla restituire) scrive anche `assegnazioni_grafico` e `assegnazioni_grafico_at` (voce copiata). Per quelle esistenti non le tocca.
- `getRilieviFp`: filtro `.or('fp.not.is.null,grafico.not.is.null')`, selezione e mappatura di `grafico`, `assegnazioni_grafico`, `assegnazioni_grafico_at`.
- `salvaAssegnazioniGrafico`: controllo del permesso come le altre scritture del rilievo; `update({ assegnazioni_grafico, assegnazioni_grafico_at: now })` per id e `organization_id`, con `.not('grafico','is',null)` e `.select('id')`. Zero righe → `{ errore: 'Voce non ancora inviata al server: invia il rilievo e riprova' }`. Il `segno_server` lo aggiorna il trigger esistente (BEFORE INSERT OR UPDATE).

- [ ] **Step 6: `useInvioRilievi.riceviTutto`** — dopo il `bulkPut` delle voci, `bulkUpdate` con `assegnazioniDaApplicare(localiV, remoti.voci)` (escluse le voci eliminate).

- [ ] **Step 7: Verifica verde** — Run: `npx vitest run lib/rilievo-unico.test.ts lib/fppro/sync-rilievi.test.ts` — Expected: PASS. `npx tsc --noEmit` può fallire SOLO nei file del Task 2 (consumatori di `v.fp`): annotarli e procedere.

- [ ] **Step 8: Commit** — `feat(rilievo): voce disegnata nei dati del rilievo, assegnazioni separate`

---

### Task 2: Chi legge `v.fp` regge le voci disegnate

**Files:**
- Modify: `components/rilievo-fp/SchedaRilievo.tsx`, `RiepilogoRilievo.tsx`, `SchedaVoceRiepilogo.tsx`, `SchermataVoce.tsx`, `SceltaTipologia.tsx`, `lib/fppro/riepilogo.ts`, e qualunque altro file segnalato da `tsc` dopo il Task 1
- Test: `lib/rilievo-unico.test.ts`

**Interfaces:**
- Consumes: `eVoceFp`, `eVoceDisegnata` (Task 1)
- Produces: `vociDelRiepilogo(voci: VoceFp[]): { fp: VoceFpVera[]; disegnate: number }` in `lib/rilievo-unico.ts`

- [ ] **Step 1: Test** — `vociDelRiepilogo` con voci miste: le FP nell'ordine originale, il numero delle disegnate.
- [ ] **Step 2: Rosso** — `npx vitest run lib/rilievo-unico.test.ts` → FAIL.
- [ ] **Step 3: Implementare**
  - Le funzioni e i componenti che lavorano su una voce FP PRO prendono `VoceFpVera`.
  - `RiepilogoRilievo` stampa solo le voci FP. Se ce ne sono di disegnate scrive "N voci disegnate: nel riepilogo arrivano con il prossimo aggiornamento" (fuori stampa, `print:hidden`).
  - `SchermataVoce` (copia e modifica) accetta solo voci FP.
- [ ] **Step 4: Verde** — `npx vitest run lib/rilievo-unico.test.ts` → PASS; `npx tsc --noEmit` → 0 errori.
- [ ] **Step 5: Commit** — `refactor(rilievo): le viste delle voci FP PRO distinguono le voci disegnate`

---

### Task 3: L'editor del disegno lavora su una voce del rilievo

**Files:**
- Create: `components/rilievo-grafico/EditorVoceDisegnata.tsx` (da `EditorRilievoGrafico.tsx`, che viene eliminato)
- Modify: `components/rilievo-grafico/PannelloProfili.tsx` (salva con `salvaAssegnazioniGrafico`), `lib/rilievo-unico.ts`
- Test: `lib/rilievo-unico.test.ts`

**Interfaces:**
- Consumes: `disegnoDellaVoce`, `salvaVoceLocale(v: VoceFp)`, `salvaAssegnazioniGrafico` (Task 1)
- Produces:
  - `nuovaVoceDisegnata(rilievoId: string, ordine: number, ora: string): VoceDisegnata` — forma = `formaInPunti(formaIniziale())` a punti, `radice` vuota, `serie: []`, quantità 1, posizione '', note ''
  - `copiaVoceDisegnata(v: VoceDisegnata, ordine: number, ora: string, id: string): VoceDisegnata` — disegno e assegnazioni uguali, id e ordine nuovi
  - `<EditorVoceDisegnata voceId={string} onIndietro={() => void} />`

- [ ] **Step 1: Test** — `nuovaVoceDisegnata`: `fp === null`, forma a punti 1200×1400, `radice.contenuto.tipo === 'vuoto'`. `copiaVoceDisegnata`: id nuovo, stesso `grafico` (uguale per valore, non lo stesso oggetto), stesse assegnazioni, `assegnazioniAt` copiato.
- [ ] **Step 2: Rosso** — `npx vitest run lib/rilievo-unico.test.ts` → FAIL.
- [ ] **Step 3: Implementare**
  - L'editor legge la voce da Dexie (`db.vociFp`, `useLiveQuery`). I campi in testa sono **Posizione**, **Q.tà** e **Note** (via Riferimento e Cliente: il cliente è del rilievo). Il pulsante Indietro chiama `onIndietro` (niente `PulsanteIndietro`/link).
  - Il salvataggio automatico (stessi 600 ms) scrive `grafico` + campi della voce con `salvaVoceLocale`: `daInviare` 1 e `aggiornatoAt` nuovo.
  - Le assegnazioni non passano dal salvataggio automatico. Le modifica la scheda Profili: chiama `salvaAssegnazioniGrafico` e poi scrive in Dexie `assegnazioni` + `assegnazioniAt` restituito, senza toccare `daInviare` e `aggiornatoAt`.
  - Senza rete, o con la voce ancora da inviare, la scheda Profili mostra "Per assegnare i profili serve la rete e la voce inviata" e non permette modifiche.
  - Le assegnazioni orfane si potano quando si salvano le assegnazioni (`potaAssegnazioni`). Nel disegno quelle di pezzi inesistenti si ignorano.
- [ ] **Step 4: Verde** — `npx vitest run lib/rilievo-unico.test.ts lib/rilievo-grafico` → PASS; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(rilievo): editor del disegno come voce del rilievo`

---

### Task 4: Voce disegnata nel rilievo del cantiere

**Files:**
- Modify: `lib/fppro/cantiere-elenco.ts`, `components/rilievo-fp/AppCantiere.tsx`, `components/rilievo-fp/SchedaRilievo.tsx`
- Create: `components/rilievo-fp/RigaVoceDisegnata.tsx` (miniatura `DisegnoSvg` in sola lettura + posizione, misure d'ingombro, quantità, note)
- Test: `lib/fppro/cantiere-elenco.test.ts`

**Interfaces:**
- Consumes: `nuovaVoceDisegnata`, `copiaVoceDisegnata`, `EditorVoceDisegnata` (Task 3)
- Produces: `VistaCantiere` aggiunge `{ tipo: 'disegno'; rilievoId: string; voceId: string }`; `vistaPrecedente` lo riporta a `{ tipo: 'rilievo', id: rilievoId }`

- [ ] **Step 1: Test** — `vistaPrecedente({ tipo:'disegno', rilievoId:'r', voceId:'v' })` → `{ tipo:'rilievo', id:'r' }`.
- [ ] **Step 2: Rosso** — `npx vitest run lib/fppro/cantiere-elenco.test.ts` → FAIL.
- [ ] **Step 3: Implementare**
  - **Aggiungi voce** apre una scelta fra due pulsanti grandi, adatti al dito: **Da struttura FP PRO** (vista `voce` di oggi) e **Disegnata**. Disegnata crea la voce con `nuovaVoceDisegnata` in fondo, la salva e apre la vista `disegno`.
  - Nell'elenco le voci disegnate usano `RigaVoceDisegnata`, con gli stessi pulsanti di elimina, copia e trascina e lo stesso "da inviare". Gli allegati compaiono come per le voci FP.
  - Copia di una voce disegnata: `copiaVoceDisegnata` in fondo, salvata subito (`daInviare` 1), poi si apre.
- [ ] **Step 4: Verde** — `npx vitest run lib/fppro/cantiere-elenco.test.ts` → PASS; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(rilievo): aggiungi voce da struttura o disegnata`

---

### Task 5: Cliente del rilievo con il modulo dei preventivi

**Files:**
- Modify: `types/rilievo-veloce.ts` (`ClienteSnapshotRilievo` con i campi opzionali di `ClienteSnapshot`: via, civico, cap, citta, provincia, nazione, codice_sdi, cf_piva), `lib/rilievo-cliente.ts`, `components/rilievo-fp/ElencoRilievi.tsx`, `components/rilievo-fp/SchedaRilievo.tsx`, e il punto del trasferimento che passa il cliente al preventivo (`actions/calcolo-fp.ts` vicino a `rilievo.cliente_snapshot`)
- Create: `components/rilievo-fp/ClienteRilievo.tsx` (`StepCliente` con `showNumero={false}` in un Dialog con Conferma)
- Test: `lib/rilievo-cliente.test.ts`

**Interfaces:**
- Produces (`lib/rilievo-cliente.ts`):
  - `snapshotPerModulo(c: ClienteSnapshotRilievo): ClienteSnapshot`
  - `snapshotDalModulo(s: ClienteSnapshot, clienteId: string | null): ClienteSnapshotRilievo` — `indirizzo` composto da via, civico, cap e città se `indirizzo` è vuoto
  - `clienteDaRegistrare(s: ClienteSnapshotRilievo, online: boolean): boolean` — vero se online, senza `clienteId` e con un nome (nome/cognome o ragione sociale)

- [ ] **Step 1: Test** — andata e ritorno di uno snapshot privato e di uno azienda senza perdite; `indirizzo` composto; `clienteDaRegistrare` falso offline, falso con `clienteId`, falso senza nome.
- [ ] **Step 2: Rosso** — `npx vitest run lib/rilievo-cliente.test.ts` → FAIL.
- [ ] **Step 3: Implementare**
  - Nuovo rilievo: `ClienteRilievo` al posto di ricerca e scheda nome/cognome/telefono. L'elenco clienti viene da `db.clienti` (`useLiveQuery`). I campi data rilievo e cantiere restano.
  - Alla conferma, se `clienteDaRegistrare`, si chiama `createCliente` e poi `db.clienti.put`, come oggi: due schede omonime non devono generare un terzo cliente al trasferimento.
  - `SchedaRilievo`: un pulsante **Cliente** apre lo stesso dialog e salva con `salvaRilievoLocale`.
  - Il trasferimento copia nel preventivo anche i campi nuovi dell'indirizzo.
- [ ] **Step 4: Verde** — `npx vitest run lib/rilievo-cliente.test.ts lib/fppro` → PASS; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(rilievo): cliente scelto con il modulo dei preventivi`

---

### Task 6: Calcolo e trasferimento con voci disegnate

**Files:**
- Modify: `actions/calcolo-fp.ts` (`calcolaRilievoFp`), `components/rilievo-fp/CalcoloRilievo.tsx`, `lib/fppro/calcolo/trasferimento.ts`
- Test: `lib/fppro/calcolo/trasferimento.test.ts`

**Interfaces:**
- Produces: `MOTIVO_VOCE_DISEGNATA = 'voce disegnata: esclusa dal calcolo'`; `avvisoTrasferimento(saltate: { posizione: string; motivo: string }[]): string | null` — testo di conferma con l'elenco delle voci disegnate lasciate fuori, null se non ce ne sono

- [ ] **Step 1: Test** — `avvisoTrasferimento([])` → null; con 2 disegnate e 1 senza misure → il testo nomina solo le 2 disegnate (posizione o "voce N").
- [ ] **Step 2: Rosso** — `npx vitest run lib/fppro/calcolo/trasferimento.test.ts` → FAIL.
- [ ] **Step 3: Implementare**
  - `calcolaRilievoFp` legge anche le voci con `grafico` non nullo (id, ordine, voce) e le aggiunge a `saltate` con `MOTIVO_VOCE_DISEGNATA`. La query delle voci FP resta identica, quindi i numeri non cambiano.
  - Il pulsante di trasferimento chiede `confirm(avviso)` quando `avvisoTrasferimento` non è null.
- [ ] **Step 4: Verde** — `npx vitest run lib/fppro` → PASS.
- [ ] **Step 5: Commit** — `feat(calcolo): le voci disegnate sono escluse e il trasferimento lo dice`

---

### Task 7: Via la sezione "Rilievo grafico" separata

**Files:**
- Modify: `components/rilievo/MenuRilievo.tsx` (tolta la voce), `app/(dashboard)/rilievo/grafico/page.tsx` e `.../grafico/[id]/page.tsx` e `app/(dashboard)/rilievo/nuovo/page.tsx` (redirect a `/rilievo/cantiere`), `lib/db.ts` (versione nuova con `rilieviGrafici: null, eliminatiGrafici: null`, le altre tabelle invariate), `actions/rilievo-grafico.ts` (restano solo `catalogoUfficio`, `profiliDelleSerie` e quello che usa `PannelloProfili`)
- Delete: `components/rilievo-grafico/ElencoRilieviGrafici.tsx`, `components/rilievo-grafico/archivio.ts`
- Create: `supabase/migrations/20261108130000_via_rilievi_grafici.sql` (`drop table rilievi_grafici`)

- [ ] **Step 1:** Modifiche al codice. `npx tsc --noEmit` → 0; `npm run lint` → pulito.
- [ ] **Step 2: STOP, conferma utente.** Mostrare il conteggio (`select count(*) from rilievi_grafici`, oggi 5) e chiedere: "Cancello i 5 rilievi grafici di prova dal database?". Solo con un sì: `apply_migration`. Senza risposta: la migrazione resta come file, e il codice non usa più la tabella.
- [ ] **Step 3: Commit** — `chore(rilievo): tolta la sezione rilievo grafico separata`

---

### Task 8: Prova nel browser, memoria e PRD

- [ ] **Step 1:** Suite completa `npx vitest run` → tutto verde; `npm run lint` → pulito; `npm run build` → riuscita.
- [ ] **Step 2:** Prova nel browser (pilota CDP su pagina temporanea `app/(public)/p/zz-...`, cancellata alla fine), a misura di computer e di telefono (390 px):
  - rilievo con 1 voce FP e 1 disegnata;
  - disegno, quote e copia della voce disegnata;
  - riepilogo senza errori;
  - indietro con il tasto del browser;
  - cliente scelto dal modulo.
- [ ] **Step 3:** Aggiornare `PRD.md` e `project_rilievo_grafico.md` / `project_catalogo_fp.md` (memoria) con le scelte che non vanno ribaltate: assegnazioni in colonna separata senza `updated_at`, vincolo un-tipo, editor come vista del cantiere.
- [ ] **Step 4: Commit** — `docs: rilievo unico parte 1`
