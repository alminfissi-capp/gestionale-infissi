# Resoconto mensile costi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla pagina `/commesse/statistiche` un blocco che mostra, mese per mese dell'anno selezionato, i costi dell'azienda divisi in costi fissi, costi variabili e tasse, letti per competenza.

**Architecture:** Un modulo di logica pura (`lib/costi-mensili.ts`) aggrega scadenze, buste paga e movimenti degli altri dipendenti in dodici righe mensili; un componente client (`components/commesse/CostiMensili.tsx`) le disegna come barre impilate con sopra la linea tratteggiata dei costi fissi; `StatisticheCommesse.tsx` registra il blocco e calcola l'aggregazione in `useMemo`. Nessuna migrazione, nessuna query nuova.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, recharts 3, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-costi-mensili-design.md`

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `lib/costi-mensili.ts` (nuovo) | Tipi, mappe voce↔famiglia, `aggregaCostiMensili`. Puro: niente React, niente Supabase. |
| `lib/costi-mensili.test.ts` (nuovo) | Vitest sul modulo puro. |
| `components/commesse/CostiMensili.tsx` (nuovo) | Schede, legenda, grafico, avviso, tabella di dettaglio. |
| `types/statistiche.ts` (modifica) | Registra il blocco `costi-mensili`. |
| `components/commesse/StatisticheCommesse.tsx` (modifica) | Prop `datiCosti`, `useMemo`, contenuto e sottotitolo del blocco. |
| `app/(dashboard)/commesse/statistiche/page.tsx` (modifica) | `periodo` nella select dei movimenti, composizione di `datiCosti`. |

Il modulo puro non entra in `lib/statistiche-commesse.ts` (691 righe). `datiCosti` è una prop a sé, come `datiAndamento`: così `costi-mensili.ts` può importare `MESI_LABEL` da `statistiche-commesse.ts` senza creare un ciclo.

**Prima di iniziare — crea il ramo:**

```bash
git checkout master
git pull
git checkout -b feat/costi-mensili
```

Tutti i commit del piano vanno su `feat/costi-mensili`; il Task 8 lo unisce a
`master` e lo cancella.

**Comandi di verifica** (dalla root del progetto):

```bash
npx vitest run lib/costi-mensili.test.ts   # il test di questo piano
npm test                                    # tutta la suite
npm run lint                                # deve restare a zero
npx tsc --noEmit                            # deve restare pulito
```

---

### Task 1: Tipi, etichette e mappe delle voci di spesa

**Files:**
- Create: `lib/costi-mensili.ts`
- Test: `lib/costi-mensili.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/costi-mensili.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  VOCI, FAMIGLIE, FAMIGLIA_DI, VOCE_LABEL, FAMIGLIA_LABEL, MESI_ESTESI,
  voceDiCategoria,
} from '@/lib/costi-mensili'

describe('mappe delle voci di spesa', () => {
  it('ogni categoria di scadenza finisce nella voce giusta', () => {
    expect(voceDiCategoria('utenza')).toBe('utenze')
    expect(voceDiCategoria('finanziamento')).toBe('finanziamenti')
    expect(voceDiCategoria('assegno')).toBe('materiali')
    expect(voceDiCategoria('tassa')).toBe('tasse')
    expect(voceDiCategoria('altro')).toBe('altro')
  })

  it('una categoria sconosciuta finisce fra le altre spese, non si perde', () => {
    expect(voceDiCategoria('leasing_auto')).toBe('altro')
    expect(voceDiCategoria('')).toBe('altro')
  })

  it('utenze, finanziamenti e stipendi sono costi fissi', () => {
    expect(FAMIGLIA_DI.utenze).toBe('fissi')
    expect(FAMIGLIA_DI.finanziamenti).toBe('fissi')
    expect(FAMIGLIA_DI.stipendi).toBe('fissi')
  })

  it('materiali e altre spese sono costi variabili, le tasse stanno a parte', () => {
    expect(FAMIGLIA_DI.materiali).toBe('variabili')
    expect(FAMIGLIA_DI.altro).toBe('variabili')
    expect(FAMIGLIA_DI.tasse).toBe('tasse')
  })

  it('ogni voce ha un etichetta e appartiene a una famiglia nota', () => {
    expect(VOCI).toHaveLength(6)
    for (const v of VOCI) {
      expect(VOCE_LABEL[v]).toBeTruthy()
      expect(FAMIGLIE).toContain(FAMIGLIA_DI[v])
    }
    expect(FAMIGLIE.map((f) => FAMIGLIA_LABEL[f]))
      .toEqual(['Costi fissi', 'Costi variabili', 'Tasse'])
  })

  it('le voci sono ordinate per famiglia: prima i fissi, poi i variabili, poi le tasse', () => {
    expect(VOCI.map((v) => FAMIGLIA_DI[v]))
      .toEqual(['fissi', 'fissi', 'fissi', 'variabili', 'variabili', 'tasse'])
  })

  it('i nomi estesi dei mesi servono agli avvisi', () => {
    expect(MESI_ESTESI).toHaveLength(12)
    expect(MESI_ESTESI[0]).toBe('gennaio')
    expect(MESI_ESTESI[11]).toBe('dicembre')
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/costi-mensili"`

- [ ] **Step 3: Scrivi il modulo con tipi e mappe**

Crea `lib/costi-mensili.ts`:

```ts
// Resoconto mensile dei costi: costi fissi, costi variabili e tasse, mese per mese.
// Logica pura: nessuna dipendenza React o Supabase.
//
// Definizione di "anno": l'anno di CALENDARIO in cui il costo matura — la data di
// scadenza per le scadenze, il periodo di competenza per gli stipendi. Non è il
// nome del blocco commesse.
//
// COMPETENZA, NON CASSA: un costo conta nel mese in cui matura anche se non è
// ancora stato pagato. È la differenza con `aggregaUscitePerCategoria`, che somma
// solo il pagato: i due blocchi rispondono a domande diverse e i loro totali NON
// devono tornare uguali. Non "correggere" l'uno per farlo somigliare all'altro.

export type FamigliaCosto = 'fissi' | 'variabili' | 'tasse'

export type VoceCosto =
  | 'utenze' | 'finanziamenti' | 'stipendi'   // fissi
  | 'materiali' | 'altro'                      // variabili
  | 'tasse'                                    // a parte

export const FAMIGLIE: FamigliaCosto[] = ['fissi', 'variabili', 'tasse']

export const FAMIGLIA_LABEL: Record<FamigliaCosto, string> = {
  fissi: 'Costi fissi',
  variabili: 'Costi variabili',
  tasse: 'Tasse',
}

// Ordine di stampa nella tabella: le voci raggruppate per famiglia.
export const VOCI: VoceCosto[] = [
  'utenze', 'finanziamenti', 'stipendi', 'materiali', 'altro', 'tasse',
]

export const VOCE_LABEL: Record<VoceCosto, string> = {
  utenze: 'Utenze',
  finanziamenti: 'Finanziamenti',
  stipendi: 'Stipendi',
  materiali: 'Materiali e servizi',
  altro: 'Altre spese',
  tasse: 'Tasse e contributi',
}

export const FAMIGLIA_DI: Record<VoceCosto, FamigliaCosto> = {
  utenze: 'fissi',
  finanziamenti: 'fissi',
  stipendi: 'fissi',
  materiali: 'variabili',
  altro: 'variabili',
  tasse: 'tasse',
}

// Nomi estesi: servono all'avviso sui mesi senza stipendi, dove "luglio" si legge
// meglio di "Lug".
export const MESI_ESTESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

// `CategoriaScadenza` (types/commessa.ts) → voce di spesa. Gli assegni sono i
// pagamenti ai fornitori di materiali e servizi, come in `CATEGORIA_USCITA`.
const VOCE_DI_CATEGORIA: Record<string, VoceCosto> = {
  utenza: 'utenze',
  finanziamento: 'finanziamenti',
  assegno: 'materiali',
  tassa: 'tasse',
  altro: 'altro',
}

/**
 * La voce di spesa di una scadenza. Una categoria non prevista non va persa:
 * finisce fra le altre spese, quindi fra i variabili.
 */
export function voceDiCategoria(categoria: string): VoceCosto {
  return VOCE_DI_CATEGORIA[categoria] ?? 'altro'
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: PASS — 7 test

- [ ] **Step 5: Commit**

```bash
git add lib/costi-mensili.ts lib/costi-mensili.test.ts
git commit -m "feat(statistiche): voci e famiglie del resoconto costi"
```

---

### Task 2: Aggregazione delle scadenze sui dodici mesi

**Files:**
- Modify: `lib/costi-mensili.ts`
- Test: `lib/costi-mensili.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in fondo a `lib/costi-mensili.test.ts`:

```ts
import { aggregaCostiMensili, type DatiCostiMensili } from '@/lib/costi-mensili'

// Base vuota: ogni test riempie solo quello che gli serve.
function dati(p: Partial<DatiCostiMensili> = {}): DatiCostiMensili {
  return { scadenze: [], buste: [], movimentiAltri: [], ...p }
}

const scadenza = (
  data: string, importo: number, categoria: string,
  extra: { annullata?: boolean } = {},
) => ({ data_scadenza: data, importo, categoria, annullata: false, ...extra })

describe('aggregaCostiMensili — scadenze', () => {
  it('mette ogni scadenza nel mese della sua data e nella voce della sua categoria', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [
        scadenza('2026-01-15', 100, 'utenza'),
        scadenza('2026-01-20', 300, 'finanziamento'),
        scadenza('2026-03-10', 500, 'assegno'),
        scadenza('2026-03-11', 50, 'altro'),
        scadenza('2026-06-30', 900, 'tassa'),
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[0].voci.utenze).toBe(100)
    expect(r.mesi[0].voci.finanziamenti).toBe(300)
    expect(r.mesi[0].fissi).toBe(400)
    expect(r.mesi[2].variabili).toBe(550)
    expect(r.mesi[5].tasse).toBe(900)
    expect(r.totaleAnno).toBe(1850)
  })

  it('conta le scadenze NON pagate: è competenza, non cassa', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-11-30', 1200, 'finanziamento')],
    }), '2026', '2026-09-12')

    expect(r.mesi[10].fissi).toBe(1200)
    expect(r.totaleAnno).toBe(1200)
  })

  it('esclude le scadenze annullate', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [
        scadenza('2026-02-01', 400, 'utenza'),
        scadenza('2026-02-02', 999, 'utenza', { annullata: true }),
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[1].voci.utenze).toBe(400)
  })

  it('ignora le scadenze di un altro anno e le date non valide', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [
        scadenza('2025-04-01', 700, 'assegno'),
        scadenza('2027-04-01', 700, 'assegno'),
        { data_scadenza: null, importo: 700, categoria: 'assegno', annullata: false },
      ],
    }), '2026', '2026-12-31')

    expect(r.totaleAnno).toBe(0)
    expect(r.haCosti).toBe(false)
  })

  it('restituisce sempre dodici mesi, anche quelli senza costi', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-05-05', 10, 'utenza')],
    }), '2026', '2026-12-31')

    expect(r.mesi).toHaveLength(12)
    expect(r.mesi.map((m) => m.mese)[0]).toBe('Gen')
    expect(r.mesi[0].totale).toBe(0)
    expect(r.mesi[4].totale).toBe(10)
  })

  it('una categoria sconosciuta entra fra i costi variabili', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-07-07', 250, 'leasing_auto')],
    }), '2026', '2026-12-31')

    expect(r.mesi[6].voci.altro).toBe(250)
    expect(r.mesi[6].variabili).toBe(250)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: FAIL — `"aggregaCostiMensili" is not exported by "lib/costi-mensili.ts"`

- [ ] **Step 3: Aggiungi tipi, helper e aggregazione delle scadenze**

Aggiungi questo import **in cima** a `lib/costi-mensili.ts`, sopra la prima
`export type` (gli import stanno tutti in testa al file):

```ts
import { MESI_LABEL } from '@/lib/statistiche-commesse'
```

Poi aggiungi il resto **in fondo** allo stesso file:

```ts
/** Una scadenza, ridotta ai campi che servono qui. */
export type ScadenzaCosto = {
  data_scadenza: string | null
  importo: number
  annullata: boolean
  categoria: string
}

/** Busta paga di un dipendente fisso. `periodo` è 'YYYY-MM-01': il mese di competenza. */
export type BustaCosto = { periodo: string; netto: number }

/**
 * Movimento di un "altro dipendente". `periodo` è la chiave canonica di
 * `lib/altri-dipendenti.ts`: primo del mese se la cadenza è mensile, lunedì della
 * settimana se è settimanale. In entrambi i casi il mese si legge alle posizioni
 * 5-6, e per la settimanale è quello che contiene il lunedì.
 */
export type MovimentoAltroCosto = { periodo: string; tipo: string; importo: number }

export type DatiCostiMensili = {
  scadenze: ScadenzaCosto[]
  buste: BustaCosto[]
  movimentiAltri: MovimentoAltroCosto[]
}

export type RigaMeseCosti = {
  mese: string // 'Gen', 'Feb', … — etichetta dell'asse X
  voci: Record<VoceCosto, number>
  fissi: number
  variabili: number
  tasse: number
  totale: number
}

export type TotaleFamiglia = {
  famiglia: FamigliaCosto
  label: string
  totale: number
  media: number       // totale / 12
  percentuale: number // sul totale dell'anno
}

export type ResocontoCosti = {
  mesi: RigaMeseCosti[]          // sempre 12
  famiglie: TotaleFamiglia[]     // sempre 3, nell'ordine di FAMIGLIE
  totaliVoce: Record<VoceCosto, number>
  totaleAnno: number
  mesiSenzaStipendi: number[]    // indici 0-11
  haCosti: boolean
}

/** Al centesimo: sommare decimali in virgola mobile lascia code tipo 90,459999. */
const euro = (n: number) => Math.round(n * 100) / 100

// Helper locali e non importati da `statistiche-commesse`, dove sono privati:
// sono quattro righe, e copiarle costa meno che allargare l'API di quel modulo.
function annoDi(data: string | null | undefined): string {
  if (!data || data.length < 4) return ''
  const y = data.slice(0, 4)
  return /^\d{4}$/.test(y) ? y : ''
}

function meseDi(data: string | null | undefined): number | null {
  if (!data || data.length < 7) return null
  const m = Number(data.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null
}

const vociAZero = (): Record<VoceCosto, number> =>
  Object.fromEntries(VOCI.map((v) => [v, 0])) as Record<VoceCosto, number>

/**
 * I costi dell'anno, mese per mese, divisi nelle tre famiglie.
 *
 * `oggi` ('YYYY-MM-DD', calcolata sul server in fuso Europe/Rome) serve solo a
 * sapere quali mesi sono già trascorsi, per l'avviso sugli stipendi mancanti.
 */
export function aggregaCostiMensili(
  dati: DatiCostiMensili,
  anno: string,
  // Diventa `oggi` col Task 4, che è dove serve davvero. Il trattino basso lo
  // tiene fuori da no-unused-vars (argsIgnorePattern in eslint.config.mjs).
  _oggi: string,
): ResocontoCosti {
  const mesi: RigaMeseCosti[] = MESI_LABEL.map((mese) => ({
    mese, voci: vociAZero(), fissi: 0, variabili: 0, tasse: 0, totale: 0,
  }))

  const aggiungi = (m: number, voce: VoceCosto, importo: number) => {
    if (!Number.isFinite(importo)) return
    mesi[m].voci[voce] += importo
  }

  for (const s of dati.scadenze) {
    if (s.annullata) continue
    if (annoDi(s.data_scadenza) !== anno) continue
    const m = meseDi(s.data_scadenza)
    if (m === null) continue
    aggiungi(m, voceDiCategoria(s.categoria), Number(s.importo) || 0)
  }

  const totaliVoce = vociAZero()
  for (const riga of mesi) {
    for (const v of VOCI) {
      riga.voci[v] = euro(riga.voci[v])
      totaliVoce[v] = euro(totaliVoce[v] + riga.voci[v])
      riga[FAMIGLIA_DI[v]] += riga.voci[v]
    }
    riga.fissi = euro(riga.fissi)
    riga.variabili = euro(riga.variabili)
    riga.tasse = euro(riga.tasse)
    riga.totale = euro(riga.fissi + riga.variabili + riga.tasse)
  }

  const totaleAnno = euro(mesi.reduce((s, r) => s + r.totale, 0))

  const famiglie: TotaleFamiglia[] = FAMIGLIE.map((f) => {
    const totale = euro(mesi.reduce((s, r) => s + r[f], 0))
    return {
      famiglia: f,
      label: FAMIGLIA_LABEL[f],
      totale,
      media: euro(totale / 12),
      percentuale: totaleAnno > 0 ? (totale / totaleAnno) * 100 : 0,
    }
  })

  return {
    mesi,
    famiglie,
    totaliVoce,
    totaleAnno,
    mesiSenzaStipendi: [], // il calcolo vero arriva col Task 4
    haCosti: totaleAnno > 0,
  }
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: PASS — 13 test

- [ ] **Step 5: Commit**

```bash
git add lib/costi-mensili.ts lib/costi-mensili.test.ts
git commit -m "feat(statistiche): aggrega le scadenze nei costi mensili"
```

---

### Task 3: Gli stipendi entrano per competenza

**Files:**
- Modify: `lib/costi-mensili.ts`
- Test: `lib/costi-mensili.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in fondo a `lib/costi-mensili.test.ts`:

```ts
describe('aggregaCostiMensili — stipendi', () => {
  it('una busta paga conta nel mese del suo periodo, non in quello del bonifico', () => {
    // Busta di settembre: il costo è di settembre anche se il bonifico parte a ottobre.
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2026-09-01', netto: 1800 }],
    }), '2026', '2026-12-31')

    expect(r.mesi[8].voci.stipendi).toBe(1800)
    expect(r.mesi[9].voci.stipendi).toBe(0)
    expect(r.mesi[8].fissi).toBe(1800)
  })

  it('somma più buste dello stesso mese', () => {
    const r = aggregaCostiMensili(dati({
      buste: [
        { periodo: '2026-04-01', netto: 1500 },
        { periodo: '2026-04-01', netto: 1650.5 },
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[3].voci.stipendi).toBe(3150.5)
  })

  it('ignora le buste di un altro anno', () => {
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2025-09-01', netto: 1800 }],
    }), '2026', '2026-12-31')

    expect(r.totaleAnno).toBe(0)
  })

  it('degli altri dipendenti conta lo stipendio maturato, non il pagamento', () => {
    const r = aggregaCostiMensili(dati({
      movimentiAltri: [
        { periodo: '2026-02-01', tipo: 'stipendio', importo: 900 },
        { periodo: '2026-02-01', tipo: 'pagamento', importo: 900 },
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[1].voci.stipendi).toBe(900)
  })

  it('un movimento settimanale finisce nel mese che contiene il suo lunedì', () => {
    // 2026-03-30 è un lunedì: la settimana sconfina in aprile, il costo resta a marzo.
    const r = aggregaCostiMensili(dati({
      movimentiAltri: [{ periodo: '2026-03-30', tipo: 'stipendio', importo: 400 }],
    }), '2026', '2026-12-31')

    expect(r.mesi[2].voci.stipendi).toBe(400)
    expect(r.mesi[3].voci.stipendi).toBe(0)
  })

  it('buste e altri dipendenti si sommano nella stessa voce', () => {
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2026-05-01', netto: 2000 }],
      movimentiAltri: [{ periodo: '2026-05-01', tipo: 'stipendio', importo: 750 }],
    }), '2026', '2026-12-31')

    expect(r.mesi[4].voci.stipendi).toBe(2750)
    expect(r.famiglie[0].totale).toBe(2750)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: FAIL — i test sugli stipendi trovano `0` dove si aspettano gli importi

- [ ] **Step 3: Aggiungi i due cicli sugli stipendi**

In `lib/costi-mensili.ts`, dentro `aggregaCostiMensili`, subito dopo il ciclo
`for (const s of dati.scadenze) { … }` e prima di `const totaliVoce = vociAZero()`:

```ts
  // Competenza: il costo è la busta del mese, non il bonifico che la salda.
  // Per questo si leggono `buste_paga`, non `pagamenti_dipendente`.
  for (const b of dati.buste) {
    if (annoDi(b.periodo) !== anno) continue
    const m = meseDi(b.periodo)
    if (m === null) continue
    aggiungi(m, 'stipendi', Number(b.netto) || 0)
  }

  // Altri dipendenti: i movimenti di tipo 'stipendio' sono il maturato, quelli
  // di tipo 'pagamento' sono la cassa e qui non entrano.
  for (const mv of dati.movimentiAltri) {
    if (mv.tipo !== 'stipendio') continue
    if (annoDi(mv.periodo) !== anno) continue
    const m = meseDi(mv.periodo)
    if (m === null) continue
    aggiungi(m, 'stipendi', Number(mv.importo) || 0)
  }
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: PASS — 19 test

- [ ] **Step 5: Commit**

```bash
git add lib/costi-mensili.ts lib/costi-mensili.test.ts
git commit -m "feat(statistiche): gli stipendi entrano nei costi per competenza"
```

---

### Task 4: Avviso sui mesi senza stipendi

**Files:**
- Modify: `lib/costi-mensili.ts`
- Test: `lib/costi-mensili.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in fondo a `lib/costi-mensili.test.ts`:

```ts
describe('aggregaCostiMensili — mesi senza stipendi', () => {
  const conStipendi = (mesiPieni: number[]) => dati({
    buste: mesiPieni.map((m) => ({
      periodo: `2026-${String(m + 1).padStart(2, '0')}-01`, netto: 1000,
    })),
  })

  it('elenca solo i mesi già trascorsi, non quelli ancora da venire', () => {
    // Oggi è marzo 2026, buste caricate solo a gennaio: mancano febbraio e marzo.
    const r = aggregaCostiMensili(conStipendi([0]), '2026', '2026-03-15')
    expect(r.mesiSenzaStipendi).toEqual([1, 2])
  })

  it('su un anno passato guarda tutti e dodici i mesi', () => {
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2025-01-01', netto: 1000 }],
    }), '2025', '2026-03-15')
    expect(r.mesiSenzaStipendi).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('su un anno futuro non segnala niente', () => {
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2027-01-01', netto: 1000 }],
    }), '2027', '2026-03-15')
    expect(r.mesiSenzaStipendi).toEqual([])
  })

  it('non segnala niente se nell anno non ci sono stipendi: il modulo non è in uso', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-01-10', 500, 'utenza')],
    }), '2026', '2026-06-30')
    expect(r.mesiSenzaStipendi).toEqual([])
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: FAIL — `expected [] to deeply equal [ 1, 2 ]`

- [ ] **Step 3: Calcola `mesiSenzaStipendi`**

In `lib/costi-mensili.ts`, rinomina il parametro `_oggi` della firma in `oggi`
(ora viene usato) e togli il commento che ne spiegava il trattino basso:

```ts
export function aggregaCostiMensili(
  dati: DatiCostiMensili,
  anno: string,
  oggi: string,
): ResocontoCosti {
```

Poi sostituisci il blocco `return { … }` finale con:

```ts
  // Quali mesi sono già trascorsi. Un anno passato è tutto trascorso, uno futuro
  // per niente, quello in corso fino al mese corrente incluso.
  const annoOggi = annoDi(oggi)
  const ultimoMese =
    anno === annoOggi ? (meseDi(oggi) ?? 11)
    : anno < annoOggi ? 11
    : -1

  // L'avviso serve a chi gli stipendi li registra: se nell'anno non ce n'è
  // nessuno, il modulo dipendenti non è in uso e segnalare dodici mesi vuoti
  // sarebbe solo rumore.
  const mesiSenzaStipendi = totaliVoce.stipendi > 0
    ? mesi.reduce<number[]>((acc, r, i) => {
        if (i <= ultimoMese && r.voci.stipendi === 0) acc.push(i)
        return acc
      }, [])
    : []

  return {
    mesi,
    famiglie,
    totaliVoce,
    totaleAnno,
    mesiSenzaStipendi,
    haCosti: totaleAnno > 0,
  }
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run lib/costi-mensili.test.ts`
Expected: PASS — 23 test

- [ ] **Step 5: Verifica che il lint sia pulito** (il parametro `oggi` ora è usato davvero)

Run: `npm run lint`
Expected: nessun output

- [ ] **Step 6: Commit**

```bash
git add lib/costi-mensili.ts lib/costi-mensili.test.ts
git commit -m "feat(statistiche): segnala i mesi senza stipendi caricati"
```

---

### Task 5: Il componente del blocco

**Files:**
- Create: `components/commesse/CostiMensili.tsx`

Nessun test automatico: è un componente di sola presentazione, la logica è già
coperta dal modulo puro. La verifica è visiva, al Task 7.

- [ ] **Step 1: Scrivi il componente**

Crea `components/commesse/CostiMensili.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { formatEuro } from '@/lib/pricing'
import {
  FAMIGLIE, FAMIGLIA_LABEL, FAMIGLIA_DI, VOCI, VOCE_LABEL, MESI_ESTESI,
  type ResocontoCosti, type RigaMeseCosti, type FamigliaCosto,
} from '@/lib/costi-mensili'

// Gli stessi colori che queste spese hanno già nella torta delle uscite: una
// voce mantiene il suo colore in tutta la pagina.
const COLORI_FAMIGLIA: Record<FamigliaCosto, string> = {
  fissi: '#7c3aed',     // violet-600 — come il badge dei finanziamenti
  variabili: '#0284c7', // sky-600 — come i materiali
  tasse: '#e11d48',     // rose-600 — come il badge delle tasse
}

// Scuro e tratteggiato: deve leggersi sopra tutte e tre le fasce colorate.
const COLORE_SOGLIA = '#1f2937' // gray-800

/**
 * Tooltip scritto a mano invece di quello di recharts: la `Line` condivide la
 * serie `fissi` con la barra in basso, e il tooltip standard mostrerebbe i costi
 * fissi due volte.
 */
function TooltipCosti(
  { active, payload }: { active?: boolean; payload?: { payload: RigaMeseCosti }[] },
) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-900">{r.mese}</p>
      {FAMIGLIE.map((f) => (
        <p key={f} className="mt-0.5 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: COLORI_FAMIGLIA[f] }}
            aria-hidden
          />
          <span className="flex-1 text-gray-600">{FAMIGLIA_LABEL[f]}</span>
          <span className="font-medium tabular-nums text-gray-900">{formatEuro(r[f])}</span>
        </p>
      ))}
      <p className="mt-1 flex gap-2 border-t pt-1 font-semibold text-gray-900">
        <span className="flex-1">Totale</span>
        <span className="tabular-nums">{formatEuro(r.totale)}</span>
      </p>
    </div>
  )
}

interface Props {
  dati: ResocontoCosti
}

export default function CostiMensili({ dati }: Props) {
  // Tendina del dettaglio: chiusa di default, il blocco resta una sintesi.
  const [dettaglio, setDettaglio] = useState(false)

  if (!dati.haCosti) {
    return (
      <p className="py-10 text-center text-sm text-gray-400">
        Nessun costo registrato in questo anno
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Riepilogo dell'anno: una scheda per famiglia */}
      <div className="grid gap-3 sm:grid-cols-3">
        {dati.famiglie.map((f) => (
          <div
            key={f.famiglia}
            className="rounded-lg border bg-white p-3"
            style={{ borderLeftWidth: 4, borderLeftColor: COLORI_FAMIGLIA[f.famiglia] }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {f.label}
            </p>
            <p className="text-xl font-bold tabular-nums text-gray-900">
              {formatEuro(f.totale)}
            </p>
            <p className="text-xs text-gray-500">
              {formatEuro(f.media)} al mese · {f.percentuale.toFixed(1)}% del totale
            </p>
          </div>
        ))}
      </div>

      {/* Legenda scritta a mano: comprende la linea, che recharts non saprebbe
          distinguere dalla barra con cui condivide la serie */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        {FAMIGLIE.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLORI_FAMIGLIA[f] }}
              aria-hidden
            />
            {FAMIGLIA_LABEL[f]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line
              x1="0" y1="4" x2="22" y2="4"
              stroke={COLORE_SOGLIA} strokeWidth="2" strokeDasharray="5 3"
            />
          </svg>
          Soglia dei costi fissi
        </span>
      </div>

      <ResponsiveContainer width="100%" height={330}>
        <ComposedChart data={dati.mesi} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={56}
            tickFormatter={(v) => formatEuro(Number(v))}
          />
          <Tooltip content={<TooltipCosti />} cursor={{ fill: '#f8fafc' }} />
          {/* I fissi in basso: così la linea ne segue il bordo superiore e si
              legge come il pavimento del mese */}
          <Bar dataKey="fissi" stackId="costi" fill={COLORI_FAMIGLIA.fissi} />
          <Bar dataKey="variabili" stackId="costi" fill={COLORI_FAMIGLIA.variabili} />
          {/* Niente radius: nei mesi senza tasse la barra in cima e' alta zero e
              l'arrotondamento finirebbe su un rettangolo che non si vede */}
          <Bar dataKey="tasse" stackId="costi" fill={COLORI_FAMIGLIA.tasse} />
          <Line
            type="monotone"
            dataKey="fissi"
            stroke={COLORE_SOGLIA}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 2.5, fill: COLORE_SOGLIA }}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {dati.mesiSenzaStipendi.length > 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Stipendi non ancora caricati per:{' '}
          {dati.mesiSenzaStipendi.map((i) => MESI_ESTESI[i]).join(', ')}. In quei mesi la
          soglia dei costi fissi è più bassa del reale.
        </p>
      )}

      {/* Dettaglio per voce */}
      <div>
        <button
          type="button"
          onClick={() => setDettaglio((v) => !v)}
          aria-expanded={dettaglio}
          aria-controls="dettaglio-costi-mensili"
          className="flex items-center gap-1 text-sm text-gray-700 transition-colors hover:text-violet-800"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 text-violet-600 transition-transform ${dettaglio ? '' : '-rotate-90'}`}
          />
          Dettaglio per voce di spesa
        </button>

        {dettaglio && (
          <div id="dettaglio-costi-mensili" className="mt-2 overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-[10px] uppercase text-gray-500">
                  <th className="px-2 py-1.5">Voce</th>
                  {dati.mesi.map((m) => (
                    <th key={m.mese} className="px-2 py-1.5 text-right">{m.mese}</th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Totale</th>
                </tr>
              </thead>
              <tbody>
                {VOCI.map((v) => (
                  <tr key={v} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: COLORI_FAMIGLIA[FAMIGLIA_DI[v]] }}
                          aria-hidden
                        />
                        {VOCE_LABEL[v]}
                      </span>
                    </td>
                    {dati.mesi.map((m) => (
                      <td
                        key={m.mese}
                        className={`px-2 py-1.5 text-right tabular-nums ${m.voci[v] > 0 ? 'text-gray-700' : 'text-gray-300'}`}
                      >
                        {m.voci[v] > 0 ? formatEuro(m.voci[v]) : '—'}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {formatEuro(dati.totaliVoce[v])}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-100 font-semibold">
                  <td className="px-2 py-1.5">Totale</td>
                  {dati.mesi.map((m) => (
                    <td key={m.mese} className="px-2 py-1.5 text-right tabular-nums">
                      {m.totale > 0 ? formatEuro(m.totale) : '—'}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatEuro(dati.totaleAnno)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifica che compili e non sporchi il lint**

Run: `npx tsc --noEmit`
Expected: nessun output

Run: `npm run lint`
Expected: nessun output

- [ ] **Step 3: Commit**

```bash
git add components/commesse/CostiMensili.tsx
git commit -m "feat(statistiche): componente del resoconto mensile costi"
```

---

### Task 6: Registra il blocco nella pagina

**Files:**
- Modify: `types/statistiche.ts`
- Modify: `components/commesse/StatisticheCommesse.tsx`
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

- [ ] **Step 1: Aggiungi il blocco all'elenco**

In `types/statistiche.ts`, dentro `BLOCCHI_STATISTICHE`, subito dopo la riga di
`uscite-categoria`:

```ts
  { id: 'costi-mensili',      titolo: 'Resoconto mensile costi' },
```

- [ ] **Step 2: Carica `periodo` nella query dei movimenti**

In `app/(dashboard)/commesse/statistiche/page.tsx`, nella select di
`movimenti_altro_dipendente`, aggiungi `periodo`:

```ts
      selectAll((da, a) => supabase
        .from('movimenti_altro_dipendente')
        .select('altro_dipendente_id, importo, data_pagamento, tipo, periodo')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
```

- [ ] **Step 3: Componi e passa `datiCosti`**

Nello stesso file, aggiungi l'import del tipo accanto agli altri import di tipo:

```ts
import type { DatiCostiMensili } from '@/lib/costi-mensili'
```

Poi, subito prima del `return (` finale, costruisci i dati:

```ts
  // Costi per competenza: le scadenze con la loro data, gli stipendi col loro
  // periodo di maturazione. Prop a sé come datiAndamento, così lib/costi-mensili
  // può importare da lib/statistiche-commesse senza chiudere un ciclo.
  const datiCosti: DatiCostiMensili = {
    scadenze: scadenze.map((s) => ({
      data_scadenza: s.data_scadenza,
      importo: s.importo,
      annullata: s.annullata,
      categoria: s.categoria,
    })),
    buste: busteRaw.map((b) => ({
      periodo: b.periodo,
      netto: Number(b.netto) || 0,
    })),
    movimentiAltri: movAltriRaw.map((m) => ({
      periodo: m.periodo,
      tipo: m.tipo,
      importo: Number(m.importo) || 0,
    })),
  }
```

E aggiungi la prop al componente:

```tsx
    <StatisticheCommesse
      dati={{
        commesse, acconti, anni, costiCommesse, scadenze, oggi,
        altriCrediti, pagamentiDipendenti, contiDipendenti,
        contiBanca, lineeCredito, anticipi, infoCommesse, creditiFiscali,
      }}
      datiAndamento={datiAndamento}
      datiCosti={datiCosti}
      oggi={oggi}
      fidoUtilizzato={fidoUtilizzato}
      ordineIniziale={preferenze.ordineBlocchi}
    />
```

- [ ] **Step 4: Aggancia il blocco nel componente**

In `components/commesse/StatisticheCommesse.tsx`:

a) aggiungi gli import, dopo quello di `DatiAndamento`:

```ts
import CostiMensili from './CostiMensili'
import { aggregaCostiMensili, type DatiCostiMensili } from '@/lib/costi-mensili'
```

b) aggiungi la prop all'interfaccia `Props`:

```ts
interface Props {
  dati: DatiStatistiche
  datiAndamento: DatiAndamento
  datiCosti: DatiCostiMensili
  oggi: string
  fidoUtilizzato: number
  ordineIniziale?: string[]
}
```

c) accettala nella firma del componente:

```tsx
export default function StatisticheCommesse({ dati, datiAndamento, datiCosti, oggi, fidoUtilizzato, ordineIniziale }: Props) {
```

d) calcola l'aggregazione, subito dopo il `useMemo` di `uscite`:

```ts
  const costiMensili = useMemo(
    () => aggregaCostiMensili(datiCosti, anno, oggi),
    [datiCosti, anno, oggi],
  )
```

e) dentro `const contenuti: Record<string, React.ReactNode> = {`, aggiungi la
voce subito dopo quella di `'uscite-categoria'`:

```tsx
    'costi-mensili': <CostiMensili dati={costiMensili} />,
```

f) dentro `const sottotitoli: Record<string, React.ReactNode> = {`, aggiungi la
voce subito dopo quella di `'uscite-categoria'`:

```tsx
    'costi-mensili': (
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-xs font-normal text-white bg-gray-500 rounded px-1.5 py-0.5">
          competenza
        </span>
        <p className="text-xs text-gray-500">
          Quanto è costato ogni mese, pagato o no: le scadenze sulla loro data e gli
          stipendi sul mese della busta
        </p>
      </div>
    ),
```

- [ ] **Step 5: Verifica tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun output

Run: `npm run lint`
Expected: nessun output

- [ ] **Step 6: Commit**

```bash
git add types/statistiche.ts components/commesse/StatisticheCommesse.tsx "app/(dashboard)/commesse/statistiche/page.tsx"
git commit -m "feat(statistiche): blocco del resoconto mensile costi in pagina"
```

---

### Task 7: Verifica finale

**Files:** nessuno da modificare, salvo correzioni emerse qui.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS su tutti i file, compresi i 23 test nuovi di `lib/costi-mensili.test.ts`

- [ ] **Step 2: Lint e tipi**

Run: `npm run lint`
Expected: nessun output

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 3: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori.

> Se la build si ferma per `RESEND_API_KEY` mancante è un problema
> preesistente e non di questo lavoro: rilancia con una chiave fittizia in
> `.env.local` per completare la verifica.

- [ ] **Step 4: Verifica visiva**

Run: `npm run dev`, poi apri `http://localhost:3000/commesse/statistiche`.

Controlla:
- il blocco "Resoconto mensile costi — <anno>" compare in fondo alla pagina, con
  il badge grigio `competenza` accanto al sottotitolo;
- le tre schede mostrano totale, media mensile e percentuale, e le percentuali
  sommano a 100;
- il grafico ha dodici barre e la linea tratteggiata scura corre sul bordo
  superiore della fascia viola;
- il tooltip mostra tre righe più il totale, senza ripetere i costi fissi;
- "Dettaglio per voce di spesa" si apre e si chiude, e la riga Totale della
  tabella coincide con la somma delle tre schede;
- cambiando anno dal selettore in alto il blocco si aggiorna;
- le frecce in alto a destra spostano il blocco e la posizione resta dopo un
  ricaricamento della pagina.

- [ ] **Step 5: Commit di eventuali correzioni**

```bash
git add -A
git commit -m "fix(statistiche): correzioni dalla verifica del resoconto costi"
```

(Salta questo passo se non c'è niente da correggere.)

---

### Task 8: Aggiorna la memoria di progetto

**Files:**
- Create: `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\project_costi_mensili.md`
- Modify: `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\MEMORY.md`

- [ ] **Step 1: Scrivi la memoria**

Contenuto di `project_costi_mensili.md`:

```markdown
---
name: project-costi-mensili
description: Resoconto mensile costi (fissi/variabili/tasse) in /commesse/statistiche, letto per competenza
metadata:
  type: project
---

Blocco `costi-mensili` nella pagina statistiche (2026-09-12): i costi dell'anno
mese per mese, divisi in costi fissi (utenze, finanziamenti, stipendi), costi
variabili (materiali e servizi, altre spese) e tasse. Logica in
`lib/costi-mensili.ts`, componente `components/commesse/CostiMensili.tsx`.

**Why:** serviva sapere quanto costa un mese e quanta parte di quel costo è
dovuta comunque vada — la soglia da coprire prima di guadagnare.

**How to apply:** tre scelte da non ribaltare.
1. **Competenza, non cassa.** Le scadenze contano sulla loro `data_scadenza`
   anche se non pagate (escluse solo le annullate); gli stipendi sul `periodo`
   della busta, non sulla data del bonifico. Il blocco `uscite-categoria`
   ragiona per cassa e dà numeri diversi sullo stesso anno: è corretto così, non
   vanno "fatti tornare".
2. **`datiCosti` è una prop a sé**, non un campo di `DatiStatistiche`: serve a
   evitare un ciclo di import fra `lib/costi-mensili.ts` e
   `lib/statistiche-commesse.ts` (da cui importa `MESI_LABEL`).
3. **L'avviso sui mesi senza stipendi si spegne** se nell'anno non c'è nessuno
   stipendio: chi non usa il modulo dipendenti non deve vederlo su dodici mesi.

Una `CategoriaScadenza` nuova finisce fra le altre spese (variabili) finché non
la si aggiunge a `VOCE_DI_CATEGORIA`. Vedi [[project-statistiche-commesse]] e
[[gotcha-blocchi-commesse-tipo]].
```

- [ ] **Step 2: Aggiungi il puntatore all'indice**

In `MEMORY.md`, nell'elenco "Documenti chiave", aggiungi dopo la riga dei
crediti/debiti:

```markdown
- [Resoconto mensile costi](project_costi_mensili.md) — fissi/variabili/tasse per competenza; 3 scelte da non ribaltare (2026-09-12)
```

- [ ] **Step 3: Merge e push del ramo**

```bash
git checkout master
git merge --no-ff feat/costi-mensili -m "merge: resoconto mensile costi nelle statistiche"
git push origin master
git branch -d feat/costi-mensili
```
