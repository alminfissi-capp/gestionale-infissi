# Voce FP: costi per colore, minuti, miniature, schermata unica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prezzi degli accessori per colore, manodopera in minuti, miniature DXF dei profili e una schermata unica per la voce del rilievo FP PRO con menu a tendina che si chiudono dopo la scelta.

**Architecture:** Il motore puro `lib/fppro/calcolo/` impara il prezzo accessorio per trattamento e il profilo anta scelto; la UI della pagina calcolo converte minuti↔ore ai bordi. Il ponte sul PC ricava un path SVG dal DXF (`dxfInSvg`, funzione pura senza import) e lo scrive in `fp_profili_sezioni.anteprima`; il catalogo locale (Dexie v7) scarica profili telaio/anta con utilizzi, colori accessori e miniature. `SchermataVoce` sostituisce `WizardVoce` e usa un componente unico `SceltaFp` (Popover + ricerca, si chiude alla scelta).

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, Dexie, Vitest, Radix Popover, Node 24 (ponte, senza build).

**Spec:** `docs/superpowers/specs/2026-10-18-voce-fp-schermata-unica-design.md`

## Global Constraints

- FP PRO resta in **sola lettura**: il ponte legge file e MySQL, non scrive niente (`soloLettura()` resta).
- I file in `lib/fppro/` usati dal ponte (`dxf-sezione.ts`, `dxf-svg.ts`, `sync-tabelle.ts`, `ponte-regole.ts`, `strutture-xml.ts`) **non hanno import** (Node 24 li esegue senza build).
- Dopo modifiche a `ponte/` o a quei file: `powershell -File ponte/installa.ps1`.
- Nella pagina del cantiere niente navigazioni Next (viste con stato + `history.pushState`).
- Al telefono va `alberoLeggero`; il calcolo legge l'albero completo dal DB.
- Correzioni per voce in `rilievo_veloce_voci.correzioni_fp`, mai dentro `fp`.
- Campi nuovi della voce **facoltativi**: le voci esistenti (senza `coloreAcc`, `anta`, `noteTelaio`) devono funzionare identiche.
- Testi UI in italiano; date/importi come il resto dell'app.
- `npm run lint` a zero, `npx tsc --noEmit` pulito, `npx vitest run lib/fppro` verde a ogni task.

## Review Focus

- Accessorio con più trattamenti a prezzi diversi e **nessun colore accessori scelto** → prezzo più alto + avviso "scegli il colore accessori", mai 0.
- **Voci vecchie** senza i campi nuovi aperte nella schermata unica e ricalcolate → stesso risultato di prima.
- DXF con `LWPOLYLINE` con bulge, `ARC` che passa per 0°, entità in blocchi/`INSERT` ignorate → miniatura comunque sensata o assente, mai eccezione che ferma la sync.
- **Senza rete** nella schermata unica: elenchi e miniature dal catalogo locale; miniatura mancante → riquadro vuoto, non errore.
- Telefono già usato con il catalogo vecchio (Dexie v6) → all'aggiornamento riscarica profili e colori con i campi nuovi, nessun dato del rilievo perso.

---

### Task 1: Prezzo accessorio per trattamento (motore puro)

**Files:**
- Create: `lib/fppro/calcolo/prezzo-accessorio.ts`
- Test: `lib/fppro/calcolo/prezzo-accessorio.test.ts`
- Modify: `lib/fppro/calcolo/listino.ts` (tipo `RigheListino`, `listinoDaRighe`, metodo `accessorio`)
- Modify: `lib/fppro/calcolo/voce.ts:24-31` (`ListinoCalcolo.accessorio` ritorna anche `avviso`), `voce.ts:197-205` (usa l'avviso)

**Interfaces:**
- Produces: `prezzoAccessorio(righe: RigaAccessorio[], costi: CostoAccessorio[], serie: string, coloreAcc: number | null): { prezzo: number; unitaVendita: number; avviso: string | null } | null`
- Produces: `listinoDaRighe(r: RigheListino, colore: {fpId;tolleranzaPeso}|null, coloreAcc: number | null = null)`; `RigheListino.accessori` ora con `fp_id`; nuovo `RigheListino.costiAccessori: { accessorio_fp_id: number; colore_fp_id: number; prezzo: number | null; unita_vendita: number | null }[]`

- [ ] **Step 1: test che falliscono**

```ts
import { describe, expect, it } from 'vitest'
import { prezzoAccessorio } from './prezzo-accessorio'

const riga = (fp_id: number, serie: string, prezzo = 0, unita_vendita = 1) => ({ fp_id, codice: 'ACP 8020M', serie, prezzo, unita_vendita })
const costo = (accessorio_fp_id: number, colore_fp_id: number, prezzo: number, unita_vendita = 5) => ({ accessorio_fp_id, colore_fp_id, prezzo, unita_vendita })

describe('prezzoAccessorio', () => {
  it('prezzo generale quando non ci sono trattamenti', () => {
    expect(prezzoAccessorio([riga(1, 'S', 10, 2)], [], 'S', null)).toEqual({ prezzo: 10, unitaVendita: 2, avviso: null })
  })
  it('prezzo del colore accessori scelto', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 100), costo(1, 62, 200)], 'S', 62)
    expect(r).toEqual({ prezzo: 200, unitaVendita: 5, avviso: null })
  })
  it('senza colore: tutti i trattamenti costano uguale -> quel prezzo, nessun avviso', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 210.037), costo(1, 62, 210.037)], 'S', null)
    expect(r).toEqual({ prezzo: 210.037, unitaVendita: 5, avviso: null })
  })
  it('senza colore e prezzi diversi -> il piu alto con avviso', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 100), costo(1, 62, 200)], 'S', null)
    expect(r?.prezzo).toBe(200)
    expect(r?.avviso).toMatch(/colore accessori/i)
  })
  it('colore scelto che l accessorio non ha -> come senza colore', () => {
    const r = prezzoAccessorio([riga(1, 'S')], [costo(1, 59, 100), costo(1, 62, 200)], 'S', 999)
    expect(r?.prezzo).toBe(200)
    expect(r?.avviso).toMatch(/colore accessori/i)
  })
  it('preferisce la riga della serie, poi una con trattamenti, poi una con prezzo', () => {
    const righe = [riga(1, 'ALTRA', 5), riga(2, 'S')]
    expect(prezzoAccessorio(righe, [costo(2, 59, 50)], 'S', 59)?.prezzo).toBe(50)
    expect(prezzoAccessorio([riga(1, 'X'), riga(2, 'Y')], [costo(2, 59, 50)], 'S', 59)?.prezzo).toBe(50)
  })
  it('nessuna riga -> null; righe senza prezzo e senza trattamenti -> prezzo 0', () => {
    expect(prezzoAccessorio([], [], 'S', null)).toBeNull()
    expect(prezzoAccessorio([riga(1, 'S')], [], 'S', null)?.prezzo).toBe(0)
  })
})
```

- [ ] **Step 2:** `npx vitest run lib/fppro/calcolo/prezzo-accessorio.test.ts` → FAIL (modulo mancante).

- [ ] **Step 3: implementazione**

```ts
// Prezzo di un accessorio come FP PRO: se ha prezzi per trattamento (fp_accessori_costi)
// vale quello del colore accessori della voce; il prezzo generale (fp_accessori) solo se
// di trattamenti non ce ne sono. Senza colore scelto: prezzo comune se tutti uguali,
// altrimenti il piu' alto con un avviso (meglio un preventivo alto che uno sotto costo).
export interface RigaAccessorio { fp_id: number; codice: string; serie: string | null; prezzo: number | null; unita_vendita: number | null }
export interface CostoAccessorio { accessorio_fp_id: number; colore_fp_id: number; prezzo: number | null; unita_vendita: number | null }

const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v))

export function prezzoAccessorio(
  righe: RigaAccessorio[], costi: CostoAccessorio[], serie: string, coloreAcc: number | null,
): { prezzo: number; unitaVendita: number; avviso: string | null } | null {
  if (righe.length === 0) return null
  const costiDi = (id: number) => costi.filter(c => c.accessorio_fp_id === id && n(c.prezzo) > 0)
  const a = righe.find(x => x.serie === serie)
    ?? righe.find(x => costiDi(x.fp_id).length > 0)
    ?? righe.find(x => n(x.prezzo) > 0)
    ?? righe[0]
  const trattamenti = costiDi(a.fp_id)
  const unita = (u: number | null) => n(u) || n(a.unita_vendita) || 1
  if (trattamenti.length === 0) return { prezzo: n(a.prezzo), unitaVendita: n(a.unita_vendita) || 1, avviso: null }
  const scelto = coloreAcc === null ? undefined : trattamenti.find(c => c.colore_fp_id === coloreAcc)
  if (scelto) return { prezzo: n(scelto.prezzo), unitaVendita: unita(scelto.unita_vendita), avviso: null }
  const unitari = trattamenti.map(c => n(c.prezzo) / unita(c.unita_vendita))
  const max = trattamenti[unitari.indexOf(Math.max(...unitari))]
  const tuttiUguali = unitari.every(u => Math.abs(u - unitari[0]) < 1e-9)
  return {
    prezzo: n(max.prezzo), unitaVendita: unita(max.unita_vendita),
    avviso: tuttiUguali ? null : `Accessorio ${a.codice}: prezzo diverso per colore, scegli il colore accessori (usato il piu' alto)`,
  }
}
```

- [ ] **Step 4:** test verdi.

- [ ] **Step 5: collegare al listino.** In `listino.ts`: `accessori` riceve `fp_id`; aggiungere `costiAccessori` a `RigheListino`; firma `listinoDaRighe(r, colore, coloreAcc: number | null = null)`; il metodo diventa:

```ts
accessorio(codice, serie) {
  const tutti = r.accessori.filter(a => chiave(a.codice) === chiave(codice))
  return prezzoAccessorio(tutti, r.costiAccessori ?? [], serie, coloreAcc)
},
```

In `voce.ts` `ListinoCalcolo.accessorio` ritorna `{ prezzo; unitaVendita; avviso?: string | null } | null` e nel ciclo accessori, dopo i controlli esistenti: `if (prezzo?.avviso) avvisi.push(prezzo.avviso)`. Il listino finto di `voce.test.ts` resta valido (avviso facoltativo).

- [ ] **Step 6:** `npx vitest run lib/fppro` verde (anche le commesse 170/172 invariate), `npx tsc --noEmit`.

- [ ] **Step 7: Commit** `feat(calcolo-fp): prezzo accessorio per colore come FP PRO`

---

### Task 2: Calcolo con colore accessori e costi per trattamento

**Files:**
- Modify: `types/rilievo-fp.ts` (`VoceFpDati`: `coloreAcc?: RifFp | null`)
- Modify: `actions/calcolo-fp.ts:170-215` (carica `fp_accessori_costi`, `listinoPer` per coppia colore/coloreAcc)

**Interfaces:**
- Consumes: `listinoDaRighe(r, colore, coloreAcc)`, `RigheListino.costiAccessori` (Task 1)
- Produces: `VoceFpDati.coloreAcc` (usato da Task 6/8)

- [ ] **Step 1:** in `righeListino` aggiungere `fp_id` alla select di `fp_accessori` e:

```ts
costiAccessori: [] as RigheListino['costiAccessori'],
```
poi, dopo aver letto `accessori`:
```ts
righeListino.costiAccessori = await inLista(supabase, orgId, 'fp_accessori_costi',
  'fp_id, accessorio_fp_id, colore_fp_id, prezzo, unita_vendita', 'accessorio_fp_id', righeListino.accessori.map(a => a.fp_id))
```
- [ ] **Step 2:** `listinoPer(colore, coloreAcc)` con chiave `${colore}|${coloreAcc}`; nel ciclo voci `listinoPer(colore, v.fp.coloreAcc?.fpId ?? null)`.
- [ ] **Step 3: indagine dei due casi "non trovato"** con SQL (sola lettura): `select codice, serie from fp_accessori where codice ilike '%scarico%'` e la struttura `09B-UNI_PFIN1A_AG+SERR+DOGHE` (`select albero from fp_strutture where nome = ...`, cercare pezzi con `dxf` vuoto). Se il pezzo ha `dxf` vuoto, in `voce.ts` saltarlo senza avviso "Profilo  non trovato" (codice vuoto = niente da prezzare) e aggiungere un test in `voce.test.ts`:

```ts
it('pezzo senza DXF: ignorato senza avviso di profilo vuoto', () => {
  const albero = structuredClone(commessaFp('commessa-170-26G').struttura.albero)
  albero[0].pezzi.push({ tipo: 8180, dxf: '', serie: '', indice: 99 })
  const r = calcolaVoce({ ...base, albero }, listino, regole)
  expect(r.avvisi.some(a => a.startsWith('Profilo  '))).toBe(false)
})
```
(`base`, `listino`, `regole` = quelli già costruiti nel describe della commessa 170). "SCARICO ACQUA" senza riga in `fp_accessori` resta un avviso vero (manca in FP PRO): annotarlo nel riepilogo all'utente.
- [ ] **Step 4: verifica su dati reali.** Dalla pagina `/rilievo/calcolo/349547e5-230f-42a9-bd5c-f61ab7b2a367` (in produzione dopo il deploy) ricalcolare; poi SQL: gli avvisi "senza prezzo" per ACP 50400 / A9133NEOPA.3 / 00259376U spariscono o diventano "scegli il colore accessori".
- [ ] **Step 5: Commit** `fix(calcolo-fp): accessori con prezzo per colore non piu' a zero`

---

### Task 3: Minuti al posto delle ore

**Files:**
- Modify: `lib/fppro/calcolo/correzioni.ts` (`campiOre` → minuti, `oreDaSalvare` legge minuti)
- Modify: `lib/fppro/calcolo/correzioni.test.ts`
- Modify: `components/rilievo-fp/CalcoloRilievo.tsx:20-26,74-80,129,221,241`

**Interfaces:**
- Produces: `campiMinuti(attuali: OreVoce): Record<keyof OreVoce, string>`; `oreDaMinuti(campi, attuali, giaCorrette): Partial<OreVoce>` (stessa semantica di `oreDaSalvare`, input in minuti, output in ore)

- [ ] **Step 1: test**

```ts
import { campiMinuti, oreDaMinuti } from './correzioni'
const attuali = { taglio: 0.5, lavorazione: 1.25, montaggio: 0, assemblaggio: 0, posa: 2 }
it('mostra minuti interi', () => expect(campiMinuti(attuali)).toEqual({ taglio: '30', lavorazione: '75', montaggio: '0', assemblaggio: '0', posa: '120' }))
it('salva in ore solo cio che cambia', () => expect(oreDaMinuti({ ...campiMinuti(attuali), lavorazione: '90' }, attuali, {})).toEqual({ lavorazione: 1.5 }))
it('campo non numerico tiene il valore attuale', () => expect(oreDaMinuti({ ...campiMinuti(attuali), posa: 'abc' }, attuali, {})).toEqual({}))
it('arrotondamento: 1 minuto = 1/60 ora senza scarti visibili', () => expect(campiMinuti({ ...attuali, taglio: 1 / 60 }).taglio).toBe('1'))
```
- [ ] **Step 2:** FAIL. **Step 3:** implementare (minuti = `Math.round(ore * 60)`; ore = minuti / 60; confronto con `Math.round(attuali[k]*60)` per decidere se è cambiato); rimuovere `campiOre`/`oreDaSalvare` se non più usati.
- [ ] **Step 4:** UI: titolo "Minuti per pezzo", etichette `Taglio`, `Lavorazione (manodopera)`, `Montaggio`, `Assemblaggio`, `Posa in opera`; testo "Sono i minuti usati ora nel calcolo… sostituisce, non si somma"; riga lavoro `Lavoro: {Math.round(oreTotali(c.ore)*60)} min`; colonna tabella "Minuti" con lo stesso arrotondamento.
- [ ] **Step 5:** vitest, tsc, lint. **Commit** `feat(calcolo-fp): manodopera in minuti come FP PRO`

---

### Task 4: Miniatura DXF dei profili (ponte)

**Files:**
- Create: `lib/fppro/dxf-svg.ts` (senza import), `lib/fppro/dxf-svg.test.ts`
- Create: `supabase/migrations/20261018100000_fp_sezioni_anteprima.sql`
- Modify: `ponte/src/sezioni-profili.ts` (aggiunge `anteprima`)

**Interfaces:**
- Produces: `dxfInSvg(testo: string): { viewBox: string; d: string } | null` (path in coordinate DXF con y ribaltata; `null` se nessuna geometria)
- Produces: colonna `fp_profili_sezioni.anteprima jsonb` = `{ viewBox, d }`

- [ ] **Step 1: fixture reale (sola lettura)**: copiare un DXF di FP PRO con ARC e LINE in `lib/fppro/__fixtures__/profilo-64723.dxf` (`cp "C:/FP_PRO/ARCHIVI_EDILSIDER_NEW/DXF/ALPH70/64723.DXF" lib/fppro/__fixtures__/profilo-64723.dxf` — se la cartella non è quella, usare il primo `.DXF` di una serie usata, es. `UP62`).
- [ ] **Step 2: test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dxfInSvg } from './dxf-svg'

const dxf = (...righe: (string | number)[]) => righe.join('\n')
describe('dxfInSvg', () => {
  it('LINE -> segmento, y ribaltata', () => {
    const r = dxfInSvg(dxf(0, 'SECTION', 2, 'ENTITIES', 0, 'LINE', 10, 0, 20, 0, 11, 10, 21, 5, 0, 'ENDSEC', 0, 'EOF'))
    expect(r?.d).toBe('M0 0L10 -5')
    expect(r?.viewBox).toBe('0 -5 10 5')
  })
  it('ARC -> arco SVG', () => {
    const r = dxfInSvg(dxf(0, 'SECTION', 2, 'ENTITIES', 0, 'ARC', 10, 0, 20, 0, 40, 10, 50, 0, 51, 90, 0, 'ENDSEC', 0, 'EOF'))
    expect(r?.d).toMatch(/^M10 0A10 10 0 0 0 0 -10$/)
  })
  it('LWPOLYLINE chiusa', () => {
    const r = dxfInSvg(dxf(0, 'SECTION', 2, 'ENTITIES', 0, 'LWPOLYLINE', 90, 3, 70, 1, 10, 0, 20, 0, 10, 4, 20, 0, 10, 4, 20, 3, 0, 'ENDSEC', 0, 'EOF'))
    expect(r?.d).toBe('M0 0L4 0L4 -3Z')
  })
  it('ignora ATTDEF e testo, null senza geometria', () => {
    expect(dxfInSvg(dxf(0, 'SECTION', 2, 'ENTITIES', 0, 'ATTDEF', 10, 1, 20, 1, 2, 'VC_START', 0, 'ENDSEC', 0, 'EOF'))).toBeNull()
  })
  it('DXF reale di FP PRO: path non vuoto e viewBox finito', () => {
    const r = dxfInSvg(readFileSync(new URL('./__fixtures__/profilo-64723.dxf', import.meta.url), 'latin1'))
    expect(r && r.d.length > 100).toBe(true)
    expect(r!.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true)
  })
})
```
- [ ] **Step 3:** FAIL. **Step 4: implementazione** (coppie codice/valore come `sezioneDaDxf`; entità LINE (10/20/11/21), ARC (10/20/40/50/51, `large = sweep > 180`, sweep 0→360 normalizzato, flag sweep `0` perché la y è ribaltata), CIRCLE (due archi), LWPOLYLINE (10/20 ripetuti, 70&1 chiusa; bulge 42 ignorato = segmento dritto). Arrotondare a 2 decimali; bounding box su tutti i punti, inclusi i punti estremi degli archi; `viewBox = minX minY larghezza altezza`. Max 20.000 caratteri: oltre, `null` (miniatura troppo pesante).
- [ ] **Step 5:** test verdi.
- [ ] **Step 6: migrazione** `alter table public.fp_profili_sezioni add column if not exists anteprima jsonb;` (applicarla con Supabase MCP `apply_migration`).
- [ ] **Step 7: ponte**: in `sezioni-profili.ts`, letto il testo una volta, `const anteprima = dxfInSvg(testo)` e `righe.push({ ..., anteprima })`. Import relativo come `sezioneDaDxf` (`../../lib/fppro/dxf-svg.ts`). Verificare che `sync-tabelle` scriva la colonna (la mappa del blocco `(DXF)` è identità: `r => r as RigaFp`) e che l'`impronta` includa il campo nuovo (altrimenti le righe esistenti non verrebbero riscritte: controllare `impronta` in `lib/fppro/sync-tabelle.ts`).
- [ ] **Step 8:** `powershell -File ponte/installa.ps1`; chiedere una sync da /catalogo-fp; SQL: `select count(*) filter (where anteprima is not null), count(*) from fp_profili_sezioni` → quasi tutte con anteprima.
- [ ] **Step 9: Commit** `feat(ponte): miniatura SVG della sezione dei profili dai DXF`

---

### Task 5: Catalogo locale con profili, colori accessori e miniature

**Files:**
- Modify: `types/rilievo-fp.ts` (`TelaioLocale` → aggiunge `utilizzi: number[]`; `ColoreLocale` aggiunge `per_profili`, `per_accessori`; nuovo `SezioneLocale { fp_id; codice; anteprima: {viewBox; d} | null; presente; segno_server }`; `TabellaCatalogoLocale` + `'fp_sezioni'`)
- Modify: `actions/rilievo-fp.ts:18,46-56` (profili telaio **e anta**, colori profili **o accessori**, nuova tabella `fp_sezioni`)
- Modify: `lib/db.ts` (version 7: tabella `fpSezioni: 'fp_id, codice'`; upgrade che svuota `fpTelai`, `fpColori` e cancella i cursori `cursore:fp_telai`, `cursore:fp_colori`)
- Modify: `hooks/useCatalogoLocale.ts` (TABELLE + `salvaPagina`)
- Create: `lib/fppro/profili-voce.ts` + test (scelta per serie/utilizzo)

**Interfaces:**
- Produces: `profiliPer(profili: TelaioLocale[], serieFpId: number, utilizzi: number[]): TelaioLocale[]` ordinati per codice
- Produces: tabella Dexie `db.fpSezioni` (chiave `fp_id`, indice `codice`)

- [ ] **Step 1: test di `profiliPer`**

```ts
import { profiliPer } from './profili-voce'
const p = (fp_id: number, serie: number, codice: string, utilizzi: number[]) => ({ fp_id, serie_fp_id: serie, codice, descrizione: null, utilizzi, presente: true, segno_server: '' })
it('filtra per serie e utilizzo, esclude i non presenti, ordina per codice', () => {
  const lista = [p(1, 12, 'B', [8050]), p(2, 12, 'A', [8090]), p(3, 13, 'C', [8050]), { ...p(4, 12, 'D', [8050]), presente: false }]
  expect(profiliPer(lista, 12, [8050]).map(x => x.codice)).toEqual(['B'])
  expect(profiliPer(lista, 12, [8090, 8100]).map(x => x.codice)).toEqual(['A'])
})
it('righe vecchie senza utilizzi: considerate telai (erano scaricate solo con 8050)', () => {
  const vecchia = { ...p(5, 12, 'E', []), utilizzi: undefined as unknown as number[] }
  expect(profiliPer([vecchia], 12, [8050]).map(x => x.codice)).toEqual(['E'])
})
```
- [ ] **Step 2:** FAIL → implementare → verdi.
- [ ] **Step 3: server.** `UTILIZZO_PROFILI` = utilizzo1..10 in (8050, 8090, 8100); per `fp_telai` selezionare `fp_id, serie_fp_id, codice, descrizione, presente, dati` e mappare a `{ ...senza dati, utilizzi: [utilizzo1..10].filter(x => x > 0) }`; colori: `.or('per_profili.eq.true,per_accessori.eq.true')` con i due flag nella select; `fp_sezioni`: `base('fp_profili_sezioni', 'fp_id, codice, anteprima, presente').not('anteprima', 'is', null)`.
- [ ] **Step 4: Dexie v7** (copia di v6 + `fpSezioni`), con
```ts
.upgrade(async tx => {
  await tx.table('fpTelai').clear()
  await tx.table('fpColori').clear()
  await tx.table('fpMeta').bulkDelete(['cursore:fp_telai', 'cursore:fp_colori'])
})
```
Controllare il nome esatto della chiave cursore in `useCatalogoLocale.ts` (`cursore:${tabella}`). Rilievi e voci locali non si toccano.
- [ ] **Step 5:** `WizardVoce` (finché esiste) filtra i colori profilo con `per_profili`: `db.fpColori.filter(c => c.presente && c.per_profili !== false)`.
- [ ] **Step 6:** tsc, lint, vitest. **Commit** `feat(rilievo-fp): catalogo locale con profili anta, colori accessori e miniature`

---

### Task 6: Anta scelta, note telaio e colore accessori nella voce

**Files:**
- Modify: `types/rilievo-fp.ts` (`VoceFpDati`: `anta?: string | null`, `noteTelaio?: Partial<Record<Lato, string>>`)
- Modify: `lib/fppro/calcolo/voce.ts` (`InputVoce.anta?: string`, funzione `conAntaScelta` accanto a `conTelaiScelti`)
- Modify: `lib/fppro/calcolo/voce.test.ts`
- Modify: `actions/calcolo-fp.ts` (passa `anta`, codice anta in `codiciProfili`, note nel preventivo)

**Interfaces:**
- Consumes: `VoceFpDati.coloreAcc` (Task 2)
- Produces: `InputVoce.anta`; righe note preventivo `Note telaio: sx …; alto …` e `Anta: <codice>`, `Col. accessori: <descr>`

- [ ] **Step 1: test**

```ts
it('anta scelta: i pezzi 8090 delle ante prendono il codice scelto (stessa cartella)', () => {
  const r = calcolaVoce({ ...base, anta: 'XX9999' }, listinoConXX, regole)
  expect(r.righe.some(x => x.codice === 'XX9999')).toBe(true)
})
it('senza anta: identico a prima', () => {
  expect(calcolaVoce({ ...base }, listino, regole).materiali).toBeCloseTo(calcolaVoce(base, listino, regole).materiali, 6)
})
```
(`listinoConXX` = `listino` con `profilo('XX9999')` che restituisce il profilo dell'anta originale con codice diverso.)
- [ ] **Step 2:** FAIL → implementare `conAntaScelta(albero, anta)`: nei nodi `8610`/`8620` sostituisce il `dxf` dei pezzi `8090`/`8100` con `${cartella}${anta}.DXF`, ricorsivo come `conTelaiScelti`; in `calcolaVoce` `const albero = conAntaScelta(conTelaiScelti(input.albero, input.telai), input.anta)` → verdi.
- [ ] **Step 3:** `calcolo-fp.ts`: `anta: v.fp.anta ?? undefined` nell'input; `if (v.fp.anta) codiciProfili.add(v.fp.anta)`; nelle note del preventivo aggiungere:
```ts
fp?.coloreAcc ? `Col. accessori: ${fp.coloreAcc.descrizione}` : null,
fp?.anta ? `Anta: ${fp.anta}` : null,
fp?.noteTelaio && Object.values(fp.noteTelaio).some(Boolean)
  ? `Note telaio: ${(['sinistra', 'alto', 'destra', 'basso'] as const).filter(l => fp.noteTelaio?.[l]).map(l => `${l} ${fp.noteTelaio![l]}`).join('; ')}` : null,
```
- [ ] **Step 4:** tsc, lint, vitest. **Commit** `feat(calcolo-fp): profilo anta scelto, note telaio e colore accessori nel preventivo`

---

### Task 7: `SceltaFp`, il menu a tendina che si chiude

**Files:**
- Create: `components/rilievo-fp/SceltaFp.tsx`
- Create: `components/rilievo-fp/MiniaturaProfilo.tsx`

**Interfaces:**
- Produces:
```ts
export interface VoceScelta { id: string; testo: string; sotto?: string | null; miniatura?: { viewBox: string; d: string } | null }
export default function SceltaFp(props: {
  voci: VoceScelta[]; preferiti?: Set<string>; valore: string | null
  onScegli: (v: VoceScelta | null) => void
  segnaposto: string; etichettaNessuno?: string; conMiniature?: boolean; id?: string
}): JSX.Element
```
- Produces: `MiniaturaProfilo({ anteprima, className })` → `<svg viewBox>` con `<path d fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke"/>`, riquadro vuoto se `null`.

- [ ] **Step 1:** implementare con `Popover` + `Command` (come `components/ui/combobox-field.tsx`): trigger = bottone largo che mostra miniatura + testo + sotto della voce scelta (o `etichettaNessuno`/segnaposto); dentro `CommandInput`, gruppo "Preferiti" (se `preferiti`), elenco filtrato (max 60 risultati, ricerca su testo+sotto, case-insensitive), voce "nessuno" se `etichettaNessuno`. **`onSelect` chiama `onScegli` e `setOpen(false)`**. Con `conMiniature` ogni riga ha `MiniaturaProfilo` 40×40. Popover `align="start"`, larghezza `min(28rem, 100vw-2rem)`.
- [ ] **Step 2:** verifica manuale su `npm run dev` in una pagina di prova temporanea non committata, oppure direttamente nel Task 8: scegliere → si chiude e mostra la scelta; Esc chiude senza cambiare; rotella sull'elenco scorre (il `PopoverContent` ha già `recuperaRotella`).
- [ ] **Step 3:** lint, tsc. **Commit** `feat(rilievo-fp): menu a tendina che si chiude dopo la scelta, con miniature`

---

### Task 8: Schermata unica della voce

**Files:**
- Create: `components/rilievo-fp/SchermataVoce.tsx` (sostituisce `WizardVoce.tsx`, stesse props `{ rilievoId; voceId; onFine }`)
- Create: `components/rilievo-fp/DisegnoConNote.tsx` (disegno + 4 campi note sui lati + quote divisioni)
- Modify: `components/rilievo-fp/AppCantiere.tsx:39-41` (usa `SchermataVoce`)
- Delete: `components/rilievo-fp/WizardVoce.tsx`, `components/rilievo-fp/ListaConRicerca.tsx` (se nessun altro li usa: `grep -rn "ListaConRicerca\|WizardVoce" components`)

**Interfaces:**
- Consumes: `SceltaFp`, `MiniaturaProfilo` (Task 7); `profiliPer` + `db.fpSezioni` (Task 5); `VoceFpDati.coloreAcc/anta/noteTelaio` (Task 2, 6); invariati `salvaVoceLocale`, `nuovaVoceFp`, `divisioniStruttura`, `campiRiempimento`, `kitOpzionali`, `haAnteBattenti`, `telaiStruttura`, `problemiVoce`, `SceltaTipologia`, `DisegnoVoceSvg`.

- [ ] **Step 1: stato e salvataggio** — riportare da `WizardVoce` la logica di bozza (`bozza`, `sporca`, `aggiorna`, salvataggio all'uscita con `daSalvare` ref + effetto di smontaggio, `sceltaStruttura`). Voce nuova (`voceId === null`): finché non c'è struttura si mostra solo il pannello "Serie e struttura" aperto (serie con recenti in cima, poi `SceltaTipologia`); scelta la struttura si crea la voce come oggi.
- [ ] **Step 2: testata** (`sticky top-0`): Indietro (salva e chiude) · `Rif. cantiere` (=`posizione`, `w-48`) · L · H · Q.tà (`w-20`, numerici, stessa logica di oggi per quantità vuota) · Salva (`toast` "Voce salvata", `onFine`).
- [ ] **Step 3: `DisegnoConNote`** — griglia 3×3: centro `DisegnoVoceSvg` (`aspect` dal rapporto L/H, max-h `55dvh`), celle alto/basso con `Input` piccolo (`h-7 text-xs`, placeholder "nota telaio alto"), sinistra/destra con `Textarea` stretta verticale (`w-20 text-xs`, `rows=3`). Sotto: quote divisioni come oggi (placeholder `≈ proporzionale`) e `problemiVoce` in ambra.
- [ ] **Step 4: pannelli a destra** (`lg:grid-cols-[minmax(0,1fr)_26rem]`, su telefono una colonna) con `<details open>` stilizzati (titolo + ▲/▼):
  1. Serie e struttura — riga riassunto (serie · nome) + "Cambia" che apre `SceltaTipologia` in linea; cambiando struttura si tengono L/H/quantità/posizione/note/noteTelaio.
  2. Telai — 4 `SceltaFp` (Sinistro, Superiore, Destro, Inferiore; solo i lati presenti in `telaiStruttura`), voci = `profiliPer(telai, serieFp.fp_id, [8050])` con miniatura da `db.fpSezioni.where('codice')`; `etichettaNessuno = "Come la struttura (<codice>)"`.
  3. Anta — se `haAnteBattenti` o ci sono nodi 8620: `SceltaFp` con `profiliPer(..., [8090, 8100])`, nessuno = "Come la struttura".
  4. Colori — 3 `SceltaFp`: interno, esterno (colori con `per_profili`), accessori (`per_accessori`), preferiti colore come oggi.
  5. Vetri — un `SceltaFp` per campo vetro + "Uguale per tutti"; nota pannelli come oggi.
  6. Accessori — checkbox dei `kitOpzionali` come oggi.
  7. Apertura e note — mano (3 bottoni) + `Textarea` note.
  Miniature caricate con `useLiveQuery(() => db.fpSezioni.where('codice').anyOf(codici).toArray())`.
- [ ] **Step 5: struttura sparita/catalogo vuoto** — stesso ramo di oggi (riferimento, quantità, note modificabili).
- [ ] **Step 6:** `AppCantiere` usa `SchermataVoce`; togliere i file vecchi se non referenziati; lint, tsc, vitest.
- [ ] **Step 7: verifica manuale** (`npm run dev`, login, `/rilievo/cantiere`): voce nuova da zero; voce vecchia aperta senza cambi = nessun salvataggio; ogni tendina si chiude alla scelta; note telaio salvate e ricaricate; offline (DevTools → Offline) la schermata funziona; finestra stretta 390px utilizzabile.
- [ ] **Step 8: Commit** `feat(rilievo-fp): schermata unica della voce stile FP PRO`

---

### Task 9: Chiusura

- [ ] Aggiornare `MEMORY.md` + `project_catalogo_fp.md` (prezzo accessori per trattamento, minuti, anteprima DXF, Dexie v7, SchermataVoce) e il PRD.
- [ ] Ricalcolare un rilievo reale in produzione e riportare all'utente avvisi residui (es. SCARICO ACQUA assente in FP PRO).
- [ ] `git push` (il deploy parte da Vercel); ponte reinstallato e versione aggiornata.
