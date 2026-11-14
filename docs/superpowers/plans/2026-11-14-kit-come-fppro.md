# Kit e accessori come FP PRO — piano di lavoro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** il prezzo di una voce del rilievo FP deve uscire uguale a FP PRO (mai più di 50 € di scarto per serramento), e la voce non deve permettere due scelte con la stessa funzione.

**Architecture:**
- Il motore puro `lib/fppro/calcolo/accessori.ts` applica tutte le condizioni di riga di FP PRO: mano, condizioni 1–4, parametri, numero massimo. Le misure di riferimento arrivano da una tabella di codici unica.
- Un banco di prova del ponte ricalcola, in sola lettura, tutte le commesse salvate in FP PRO e confronta accessori e costi.
- L'interfaccia della voce mostra una domanda per gruppo di FP PRO con nomi brevi, e il salvataggio e il calcolo rifiutano le scelte doppie.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Supabase, Dexie, ponte Node 24 (TypeScript senza build).

**Spec:** `docs/superpowers/specs/2026-11-14-kit-come-fppro-design.md`

## Global Constraints

- FP PRO solo in lettura: ogni accesso MySQL passa da `apriDbSolaLettura` (`ponte/src/mysql-sola-lettura.ts`); niente file scritti sotto `C:\FP_PRO`.
- Soglia: nessuna voce del banco di prova oltre 50 € di scarto per serramento.
- Un codice di misura sconosciuto non diventa mai "altezza": la riga non si applica e la voce riceve l'avviso `Regola FP PRO non gestita: misura <codice> su <accessorio>`.
- Senza mano nella voce vale destra (`'dx'`); mai destra e sinistra insieme.
- Le voci già salvate non vengono corrette d'ufficio.
- Dexie: una versione nuova azzera solo i cursori, non svuota gli elenchi.
- Dopo modifiche a `ponte/`, `lib/fppro/sync-tabelle.ts` o `lib/fppro/ponte-regole.ts`: `powershell -File ponte/installa.ps1`. Se cambia la lettura delle .STR, alzare `VERSIONE_LETTURA`.
- Nessun dato di clienti nelle fixture del repository.

## Review Focus

- **Voce senza mano con kit a lato (Apertura 1/2):** deve prendere solo le righe destre, mai entrambe → test in Task 2.
- **Anta oltre 100 kg:** deve prendere la variante 150 kg e non quella da 100 → test in Task 2 (peso dalla geometria).
- **Riga con `RefDim2` nello STR:** i limiti vanno divisi per 100, altrimenti nessuna riga passa → test in Task 1.
- **Voce vecchia con due kit alternativi accesi** (dato arrivato dal telefono): il calcolo deve dare l'errore bloccante, non un prezzo → test in Task 5.
- **Due ante con anta passiva (codici 202/302/402/902):** le righe della passiva usano le misure dell'anta 2 → test in Task 2.

---

### Task 1: Lettura completa delle regole di riga

**Files:**
- Modify: `lib/fppro/strutture-xml.ts` (`AccessorioStruttura`, `accessorio()`)
- Modify: `lib/fppro/calcolo/accessori.ts` (`accessoriDaCatalogo`)
- Test: `lib/fppro/strutture-xml.test.ts`, `lib/fppro/calcolo/accessori.test.ts`

**Interfaces:**
- Produces, in `AccessorioStruttura`:
  - `apertura: 0 | 1 | 2`
  - `condizioni: { dim: number; min: number | null; max: number | null }[]`, con prima, seconda, terza e quarta condizione già normalizzate
  - `numMax: number | null`
  - `parametro: { codice: string; valore: string } | null`
  - `formulaL: string | null`
  - `corrMl: number`

  `dimRif`/`min`/`max` restano come alias della prima condizione (chi li legge oggi continua a funzionare).
- Lettura dallo STR:
  - `Apertura`
  - `RefDim` + `RMin`/`RMax`
  - `RefDim2` + `RMin2x100`/`RMax2x100` divisi per 100
  - `RefDim3` (+ `RMin3x100`/`RMax3x100` se presenti), `RefDim4`
  - `NMax`, `LFormula`
- Lettura dal catalogo (`dati`):
  - `apertura`, `dimrif2`, `liminfrange2`, `limsuprange2`
  - `dim_rif3`, `lim_inf_range3`, `lim_sup_range3`
  - `dimrif4`, `liminfrange4`, `limsuprange4`
  - `num_max`, `formulal`, `corr_ml`
  - `parametrica` + `codice_param` + `valore_param`

- [ ] Step 1: test `strutture-xml.test.ts` › "seconda condizione dallo STR in centesimi": un FP_FITTING con `RefDim2="201" RMin2x100="100" RMax2x100="10000" Apertura="1"` produce `condizioni[1] = { dim: 201, min: 1, max: 100 }` e `apertura = 1`.
- [ ] Step 2: test `accessori.test.ts` › "catalogo: righe 5151/D con mano e peso": la riga ACP 5151/D del caso Vazzana (`dim_rif 5`, 600.1–1500, `dimrif2 201`, 1–100, `apertura 1`) produce `condizioni` con 2 voci e `apertura 1`.
- [ ] Step 3: run `npx vitest run lib/fppro/strutture-xml.test.ts lib/fppro/calcolo/accessori.test.ts` → FAIL.
- [ ] Step 4: implementare.
- [ ] Step 5: run → PASS; `npx tsc --noEmit` pulito.
- [ ] Step 6: commit `feat(fppro): lettura completa delle regole di riga dei kit`.

### Task 2: Motore — tutte le condizioni, mano, misure per anta

**Files:**
- Create: `lib/fppro/calcolo/misure-riferimento.ts` (tabella codici → misura)
- Modify: `lib/fppro/calcolo/accessori.ts` (`quantitaDi`, `accessoriVoce`, `Misure`)
- Modify: `lib/fppro/calcolo/voce.ts` (passa mano, ante e pesi)
- Test: `lib/fppro/calcolo/misure-riferimento.test.ts`, `lib/fppro/calcolo/accessori.test.ts`

**Interfaces:**
- Produces:
  - `interface MisureRif { L; H; peso; ante: { l: number; h: number; peso: number }[]; formula?: (f: string) => number | null }`
  - `misuraRif(codice: number, m: MisureRif): number | null` → `null` se il codice è sconosciuto
  - `CODICI_NOTI: ReadonlySet<number>`

  Mappa iniziale, da confermare col banco di prova (Task 3):
  - 1 = H, 2 = L, 3 = 2(L+H), 4 = 2H+L, 6 = larghezza anta 1
  - 101/102/103 = larghezza anta n
  - 201/202 = peso anta n
  - 301/302/303 = altezza anta n
  - 401/402/403 = larghezza anta n
  - 22 = larghezza anta scorrevole, 23 = peso anta scorrevole, 24 = altezza anta scorrevole
  - 200 = peso del vano
- `accessoriVoce(..., opzioni: { mano: 'sx' | 'dx' | null })`:
  - una riga vale se `apertura === 0` oppure se corrisponde alla mano (null → dx);
  - tutte le condizioni con `dim > 0` e `max > 0` devono stare nella fascia;
  - un codice sconosciuto esclude la riga e aggiunge un avviso;
  - `numMax` limita la quantità.
- `QuantitaAccessorio` gains `avviso?: string`.

- [ ] Step 1: test "Vazzana 1 anta 675×1342, mano dx, anta < 100 kg": kit 1AR-SCOMPARSA-RISTRUTT del catalogo → solo ACP 5151/D, quantità 1.
- [ ] Step 2: test "stessa voce senza mano" → solo ACP 5151/D.
- [ ] Step 3: test "anta 120 kg" → solo ACP 5163/D.
- [ ] Step 4: test "codice 999 sconosciuto": la riga non entra e c'è l'avviso `Regola FP PRO non gestita: misura 999 su X`.
- [ ] Step 5: test "anta passiva (202)": su 2 ante con pesi 40/60 la fascia 50–100 su 202 entra, su 201 no.
- [ ] Step 6: run → FAIL; implementare; run → PASS. I test esistenti di `voce.test.ts` (170-26G, 172-26G) devono restare verdi.
- [ ] Step 7: peso per anta in `voce.ts`: profili d'anta + vetro/pannello della zona dell'anta (kg/m² × m²). Test: la PF2A Vazzana 1512×2260 ha 2 pesi anta > 0 e la loro somma è ≤ il peso voce.
- [ ] Step 8: commit `feat(fppro): condizioni complete, mano e misure per anta nel calcolo accessori`.

### Task 3: Banco di prova su tutte le commesse FP PRO

**Files:**
- Create: `ponte/strumenti/banco-prova.ts`
- Create: `lib/fppro/calcolo/confronto-fp.ts` (puro) + `confronto-fp.test.ts`

**Interfaces:**
- `confrontaVoce(calcolata: QuantitaAccessorio[], fp: { codice: string; quantita: number }[]): { mancanti; inPiu; quantitaDiverse }`
- Lo strumento, per ogni commessa con `imponibile > 0` e cartella JOB, e per ogni `_jobrecord_NN.xml`:
  1. legge struttura e misure (`StyleL`/`StyleH`, `Multiply`);
  2. ricava la mano dalle righe `Apertura` confermate;
  3. carica regole e listino dal MySQL (prezzi `preventivoprezzi*` della commessa);
  4. calcola con `calcolaVoce`;
  5. confronta accessori e totale imponibile della voce.

  Scrive `banco-prova.json` e un riepilogo in `C:\WinStudioPonte\banco` (fuori da FP_PRO e dal repo):
  - righe per fascia di scarto (≤5 €, ≤50 €, >50 €);
  - conteggio dei codici di misura non gestiti;
  - prime 30 voci peggiori con il motivo.
- Uso: `node --env-file=C:\WinStudioPonte\.env ponte/strumenti/banco-prova.ts [filtro]`.

- [ ] Step 1: test di `confrontaVoce` (accessorio in più, mancante, quantità diversa oltre 0,01).
- [ ] Step 2: implementare strumento e funzione; eseguire sul filtro `183-26G` e su tutto.
- [ ] Step 3: con i risultati, correggere la mappa dei codici (Task 2), finché i codici non gestiti sono zero o motivati. Scrivere il significato confermato in `misure-riferimento.ts`.
- [ ] Step 4: obiettivo: nessuna voce oltre 50 €. Le voci che restano fuori vanno annotate con il motivo nel riepilogo finale per l'utente.
- [ ] Step 5: commit `feat(ponte): banco di prova contro le commesse di FP PRO`.

### Task 4: Domande una per gruppo, nomi brevi

**Files:**
- Modify: `lib/fppro/opzioni-voce.ts` (+ test)
- Modify: `components/rilievo-fp/OpzioniVoce.tsx`
- Create: `lib/fppro/nomi-brevi.ts` (+ test)
- Create: migration `supabase/migrations/<n>_fp_nomi_brevi.sql` (tabella `fp_nomi_brevi`: `organization_id`, `chiave text` (`kit:<nome>` / `acc:<codice>` / `par:<kit>:<valore>`), `nome text`, RLS per organizzazione)
- Modify: `actions/catalogo-fp.ts` (lettura/scrittura nomi), pagina `/catalogo-fp` (scheda "Nomi brevi")
- Modify: `lib/db.ts` (Dexie: tabella `fpNomiBrevi`, nuova versione che azzera solo i cursori)

**Interfaces:**
- `nomeBreve(descrizione: string, codice: string, gruppo?: string): string`. Toglie:
  - la serie o il prefisso (`PLANET`, `AL_…`);
  - i lati `-DS`/`-DX`/`-SX` finali;
  - le parole già nel titolo del gruppo.

  Ritorna per esempio "Kit Exens", "Kit Cremonese", "Kit Martellina", "A scomparsa", "A sormonto", "A scomparsa ristrutturazione".
- `schemaOpzioni`:
  - ogni gruppo FP diventa una `Domanda` di tipo `'unica'` o `'facoltativa'`;
  - le varianti dello stesso kit che differiscono solo per lato (`latoDi`) diventano **una** risposta, e il kit effettivo si sceglie dalla mano al calcolo;
  - `varianteFamiglia` e la domanda di tipo `'cerniere'` (a vista / a scomparsa) vengono eliminate.

- [ ] Step 1: test di `nomeBreve` sui nomi reali: "PLANET  EXENS A/R-DS" → "Kit Exens"; "PLANET 1AR-SCOMPARSA-DS" con gruppo "1B - SCELTA CERNIERA 1 A/R" → "A scomparsa"; "PLANET 1AR-SCOMPARSA-RISTRUTT" → "A scomparsa ristrutturazione".
- [ ] Step 2: test di `schemaOpzioni` sulla struttura F1A: 3 domande nell'ordine 1A, 1B, 2A; la 1B ha 5 risposte; nessuna risposta duplicata per lato.
- [ ] Step 3: implementare, poi UI: un elenco di risposte a scelta singola per domanda, nome breve grande, nome FP piccolo sotto.
- [ ] Step 4: migration + pagina nomi + Dexie; build verde.
- [ ] Step 5: commit `feat(rilievo-fp): una domanda per gruppo FP PRO con nomi brevi`.

### Task 5: Scelte doppie impossibili

**Files:**
- Modify: `lib/fppro/opzioni-voce.ts` (`domandeDoppie` esiste già)
- Modify: `lib/fppro/calcolo/voce.ts` (errore bloccante)
- Modify: `actions/calcolo-fp.ts` (`trasferisciInPreventivi` rifiuta) e salvataggio voce
- Modify: `components/rilievo-fp/SchermataVoce.tsx` (domanda evidenziata)

**Interfaces:**
- `calcolaVoce(...).errori: string[]` (nuovo): `Scelte doppie: <titolo domanda>`.
- Il trasferimento rifiuta il rilievo se una voce ha `errori.length > 0`.

- [ ] Step 1: test "voce con SORMONTO e SCOMPARSA accesi" → `errori` contiene "Scelte doppie: …" e il prezzo non viene trasferito.
- [ ] Step 2: implementare; la Vista Avanzate usa `scegliKit`, così accendere un'alternativa spegne le altre.
- [ ] Step 3: commit `feat(rilievo-fp): scelte doppie bloccate in voce, calcolo e trasferimento`.

### Task 6: Parametri dei kit

**Files:**
- Modify: `lib/fppro/sync-tabelle.ts` (copia `kit_parametri`, `kit_parametri_valori` → `fp_kit_parametri`)
- Create: migration `fp_kit_parametri`
- Modify: `actions/rilievo-fp.ts` (`alberoLeggero` porta i parametri per kit)
- Modify: `lib/fppro/calcolo/accessori.ts` (la riga parametrica vale solo col valore scelto, o col predefinito)
- Modify: `components/rilievo-fp/OpzioniVoce.tsx` (sezione chiusa "Altre opzioni")
- Voce: `fp.parametri: Record<string, string>` (chiave `nodo:kit:codiceParametro`)

- [ ] Step 1: test motore "riga parametrica `scelta cr. Cilindro = 30`: entra solo con valore 30; senza scelta vale il predefinito".
- [ ] Step 2: implementare; reinstallare il ponte; verificare la sync.
- [ ] Step 3: commit `feat(fppro): parametri dei kit come FP PRO`.

### Task 7: Verifica finale, memoria, merge

- [ ] Ricalcolare il rilievo Vazzana in produzione e confrontarlo con 192-26G (quando l'utente salva il preventivo FP).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- [ ] Aggiornare la memoria (`project_catalogo_fp.md`) con i codici confermati e le invarianti nuove.
- [ ] Merge su master, push, cancellare il branch (locale e remoto).
