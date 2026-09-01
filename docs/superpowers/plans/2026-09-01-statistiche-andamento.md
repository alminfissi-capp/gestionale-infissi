# Statistiche — blocchi riordinabili e grafico andamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere i blocchi della pagina statistiche spostabili su e giù con l'ordine salvato sull'account, e aggiungere un grafico a tre linee — crediti, debiti, posizione netta — ricostruito nel tempo dai movimenti datati.

**Architecture:** L'ordine dei blocchi è una lista di identificativi in `profiles.preferenze_statistiche`, e un involucro `BloccoStatistica` porta le frecce senza far crescere `StatisticheCommesse.tsx`. La serie temporale è una funzione pura in un file nuovo che, per ogni data del periodo, ricalcola crediti e debiti dai record datati; la pagina le passa i dati già caricati più tre insiemi nuovi.

**Tech Stack:** Next.js 16 App Router (React 19, TypeScript), Supabase, Recharts 3, shadcn/ui + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-statistiche-andamento-design.md`

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260901120000_preferenze_statistiche.sql` | Colonna `preferenze_statistiche` su `profiles` |
| `types/statistiche.ts` | `IdBlocco`, `BLOCCHI_STATISTICHE`, `PreferenzeStatistiche` |
| `actions/preferenze.ts` | Lettura e scrittura dell'ordine per l'utente corrente |
| `lib/ordine-blocchi.ts` | Logica pura: applica l'ordine salvato, accoda gli sconosciuti, sposta di una posizione |
| `lib/ordine-blocchi.test.ts` | Vitest |
| `components/commesse/BloccoStatistica.tsx` | Involucro con titolo e frecce |
| `lib/andamento-crediti-debiti.ts` | Logica pura della serie temporale |
| `lib/andamento-crediti-debiti.test.ts` | Vitest |
| `components/commesse/GraficoAndamento.tsx` | Il grafico a tre linee |
| `components/commesse/StatisticheCommesse.tsx` | Avvolge i blocchi, monta il grafico nuovo |
| `app/(dashboard)/commesse/statistiche/page.tsx` | Carica i tre insiemi nuovi e l'ordine salvato |
| `lib/statistiche-commesse.ts` | `ScadenzaRow.created_at`, `AltroCreditoRow.created_at` |

**Perché la serie sta in un file nuovo:** `lib/statistiche-commesse.ts` è oltre le 700 righe e ha già una sua responsabilità; la ricostruzione storica è un calcolo diverso, con dati d'ingresso diversi.

## Convenzioni del progetto

- Server Action: `'use server'`, `createClient()` da `@/lib/supabase/server`, `getOrgId()` da `@/lib/auth`, errori come `throw new Error(error.message)`, ogni query filtrata per `organization_id`.
- Letture che possono superare le 1000 righe: `selectAll()` da `@/lib/supabase/paginate` con `.order('id').range(da, a)` — PostgREST tronca in silenzio.
- Client Component: `'use client'`, `toast` da `sonner`.
- Mai un `useEffect` che azzera lo stato; mai letture di `ref.current` in render (React Compiler).
- `lib/` ospita solo logica senza React.
- Commenti in italiano, che spiegano il *perché*.

**Cancelli di verifica:** `npx tsc --noEmit` pulito e `npx vitest run <file>` per i test. **Il lint del progetto è a zero problemi**: si controlla nel task finale e deve restare a zero. Non lanciare `npm run lint` a ogni task, impiega minuti.

## La palette del grafico è già validata — non cambiarla

| Serie | Colore |
|---|---|
| Crediti | `#0d9488` (teal-600, lo stesso degli incassi nel grafico accanto) |
| Debiti | `#e11d48` (rose-600, lo stesso dei pagamenti) |
| Posizione netta | `#7c3aed` (violet-600) |

Verificata con lo strumento della skill `dataviz` in modalità chiara **e** scura: banda di luminosità, soglia di croma, separazione per daltonismo (peggior coppia ΔE 10,2 in deuteranopia, sopra la soglia di 8), soglia a vista normale e contrasto sul fondo — tutti superati. **Se qualcuno propone altri colori, vanno rivalidati con quello strumento, non scelti a occhio.**

Un solo asse verticale: le tre serie sono tutte in euro. Un grafico a due scale è l'errore più comune e più grave in una visualizzazione, e qui non serve.

---

### Task 1: Preferenze utente — migration, tipi, action

**Files:**
- Create: `supabase/migrations/20260901120000_preferenze_statistiche.sql`
- Create: `types/statistiche.ts`
- Create: `actions/preferenze.ts`

- [ ] **Step 1: Migration**

```sql
-- 20260901120000_preferenze_statistiche.sql
-- Preferenze personali della pagina statistiche, a partire dall'ordine dei
-- blocchi. Su `profiles` e non su `settings` perche' e' una scelta di chi
-- guarda, non dell'organizzazione: due persone possono volere ordini diversi.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferenze_statistiche jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Applicare la migration**

Il server MCP Supabase non è connesso. Applicare dal SQL Editor del progetto
`xawyrtqclpeylxnhwhwo` incollando il file, oppure con `npx supabase db push`.

Verificare poi nel SQL Editor:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'preferenze_statistiche';
```

Atteso: una riga, `jsonb`, default `'{}'::jsonb`.

- [ ] **Step 3: Creare `types/statistiche.ts`**

```ts
/** I blocchi della pagina statistiche, nell'ordine di partenza. */
export const BLOCCHI_STATISTICHE = [
  { id: 'andamento-commesse', titolo: 'Andamento commesse' },
  { id: 'incassi-pagamenti',  titolo: 'Incassi e pagamenti' },
  { id: 'uscite-categoria',   titolo: 'Uscite per categoria' },
  { id: 'crediti-debiti',     titolo: 'Crediti e debiti' },
  { id: 'andamento-storico',  titolo: 'Andamento crediti e debiti' },
  { id: 'costi-utili',        titolo: 'Costi e utili stimati' },
  { id: 'resoconto-cliente',  titolo: 'Resoconto per cliente' },
] as const

export type IdBlocco = (typeof BLOCCHI_STATISTICHE)[number]['id']

/**
 * Preferenze personali della pagina statistiche.
 *
 * `ordineBlocchi` e' una lista di identificativi, non di indici: un blocco
 * aggiunto in futuro, che un ordine salvato non conosce, si accoda invece di
 * sparire. Con gli indici il primo blocco nuovo romperebbe ogni ordine salvato.
 */
export type PreferenzeStatistiche = {
  ordineBlocchi?: string[]
}
```

- [ ] **Step 4: Creare `actions/preferenze.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { PreferenzeStatistiche } from '@/types/statistiche'

/** Preferenze statistiche dell'utente collegato. Oggetto vuoto se non ne ha. */
export async function getPreferenzeStatistiche(): Promise<PreferenzeStatistiche> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('preferenze_statistiche')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.preferenze_statistiche ?? {}) as PreferenzeStatistiche
}

/**
 * Salva l'ordine dei blocchi.
 *
 * Legge e riscrive l'intero oggetto invece di aggiornare una chiave: `jsonb`
 * non ha un merge parziale in PostgREST, e cosi' altre preferenze future non
 * verrebbero cancellate da un salvataggio dell'ordine.
 */
export async function setOrdineBlocchi(ordine: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sessione scaduta')

  const { data: attuali } = await supabase
    .from('profiles')
    .select('preferenze_statistiche')
    .eq('id', user.id)
    .maybeSingle()

  const preferenze: PreferenzeStatistiche = {
    ...((attuali?.preferenze_statistiche ?? {}) as PreferenzeStatistiche),
    ordineBlocchi: ordine,
  }

  const { error } = await supabase
    .from('profiles')
    .update({ preferenze_statistiche: preferenze })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
}
```

Nessun `revalidatePath`: la pagina si riordina già da sola nel client, e ricaricarla sposterebbe la vista sotto gli occhi di chi guarda.

- [ ] **Step 5: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901120000_preferenze_statistiche.sql types/statistiche.ts actions/preferenze.ts
git commit -m "feat(statistiche): preferenze per utente e ordine dei blocchi"
```

---

### Task 2: Logica dell'ordine (TDD)

**Files:**
- Create: `lib/ordine-blocchi.ts`
- Test: `lib/ordine-blocchi.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest'
import { applicaOrdine, spostaBlocco } from './ordine-blocchi'

const TUTTI = ['a', 'b', 'c', 'd']

describe('applicaOrdine', () => {
  it('senza ordine salvato lascia quello di partenza', () => {
    expect(applicaOrdine(TUTTI, undefined)).toEqual(['a', 'b', 'c', 'd'])
    expect(applicaOrdine(TUTTI, [])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('rispetta l’ordine salvato', () => {
    expect(applicaOrdine(TUTTI, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'd', 'b'])
  })

  it('accoda i blocchi che l’ordine salvato non conosce, nel loro ordine originale', () => {
    expect(applicaOrdine(TUTTI, ['d', 'b'])).toEqual(['d', 'b', 'a', 'c'])
  })

  it('scarta gli identificativi che non esistono più', () => {
    expect(applicaOrdine(TUTTI, ['c', 'sparito', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('spostaBlocco', () => {
  it('sposta in su di una posizione', () => {
    expect(spostaBlocco(TUTTI, 'c', 'su')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('sposta in giù di una posizione', () => {
    expect(spostaBlocco(TUTTI, 'b', 'giu')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('in cima non si sale, in fondo non si scende', () => {
    expect(spostaBlocco(TUTTI, 'a', 'su')).toEqual(TUTTI)
    expect(spostaBlocco(TUTTI, 'd', 'giu')).toEqual(TUTTI)
  })

  it('un identificativo sconosciuto non cambia niente', () => {
    expect(spostaBlocco(TUTTI, 'zzz', 'su')).toEqual(TUTTI)
  })

  it('non modifica l’array ricevuto', () => {
    const originale = [...TUTTI]
    spostaBlocco(originale, 'c', 'su')
    expect(originale).toEqual(TUTTI)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `npx vitest run lib/ordine-blocchi.test.ts`
Expected: FAIL — `Failed to resolve import "./ordine-blocchi"`.

- [ ] **Step 3: Scrivere l'implementazione**

```ts
/**
 * Ordinamento dei blocchi della pagina statistiche.
 *
 * L'ordine salvato e' una lista di identificativi. Tenerla separata dall'elenco
 * dei blocchi esistenti fa si' che le due cose possano cambiare indipendentemente:
 * si aggiunge un blocco senza invalidare gli ordini gia' salvati, e si toglie un
 * blocco senza lasciare buchi.
 */

/**
 * Applica l'ordine salvato all'elenco dei blocchi esistenti.
 *
 * Chi non compare nell'ordine salvato si accoda (e' un blocco aggiunto dopo);
 * chi compare nell'ordine ma non esiste piu' viene scartato.
 */
export function applicaOrdine(tutti: readonly string[], salvato: string[] | undefined): string[] {
  if (!salvato || salvato.length === 0) return [...tutti]
  const esistenti = new Set(tutti)
  const noti = salvato.filter((id) => esistenti.has(id))
  const gia = new Set(noti)
  return [...noti, ...tutti.filter((id) => !gia.has(id))]
}

/** Sposta un blocco di una posizione. Restituisce un array nuovo. */
export function spostaBlocco(ordine: readonly string[], id: string, verso: 'su' | 'giu'): string[] {
  const i = ordine.indexOf(id)
  if (i === -1) return [...ordine]
  const j = verso === 'su' ? i - 1 : i + 1
  if (j < 0 || j >= ordine.length) return [...ordine]
  const out = [...ordine]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
```

- [ ] **Step 4: Eseguire il test per vederlo passare**

Run: `npx vitest run lib/ordine-blocchi.test.ts`
Expected: PASS — 9 test passati.

- [ ] **Step 5: Commit**

```bash
git add lib/ordine-blocchi.ts lib/ordine-blocchi.test.ts
git commit -m "feat(statistiche): logica dell'ordine dei blocchi"
```

---

### Task 3: L'involucro con le frecce

**Files:**
- Create: `components/commesse/BloccoStatistica.tsx`

- [ ] **Step 1: Creare il componente**

```tsx
'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  titolo: string
  /** Testo sotto al titolo, quando il blocco ha bisogno di una precisazione. */
  sottotitolo?: React.ReactNode
  primo: boolean
  ultimo: boolean
  onSu: () => void
  onGiu: () => void
  children: React.ReactNode
}

/**
 * Un blocco della pagina statistiche, con le frecce per spostarlo.
 *
 * Frecce e non trascinamento: un riquadro alto 400px trascinato lungo una pagina
 * lunga e' scomodo, soprattutto da tablet, mentre una freccia e' precisa anche
 * col dito.
 */
export default function BloccoStatistica({
  titolo, sottotitolo, primo, ultimo, onSu, onGiu, children,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">{titolo}</CardTitle>
            {sottotitolo}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={primo}
              aria-label={`Sposta "${titolo}" in su`}
              onClick={onSu}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={ultimo}
              aria-label={`Sposta "${titolo}" in giù`}
              onClick={onGiu}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npx eslint components/commesse/BloccoStatistica.tsx`
Expected: nessun problema.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/BloccoStatistica.tsx
git commit -m "feat(statistiche): involucro dei blocchi con le frecce"
```

---

### Task 4: Riordino dei blocchi esistenti

**Files:**
- Modify: `components/commesse/StatisticheCommesse.tsx`
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

**Contesto:** `StatisticheCommesse.tsx` (~708 righe) contiene sei blocchi, ognuno un `<Card>` con un commento che lo apre: `{/* A) Andamento commesse per mese */}` (riga ~182), `{/* B) Incassi e pagamenti per mese */}` (~222), `{/* B1) Uscite per categoria … */}` (~266), `{/* B2) Crediti e debiti … */}` (~353), `{/* B2) Costi e utili stimati … */}` (~604), `{/* C) Resoconto per cliente … */}` (~701). I due commenti "B2)" sono un refuso già presente: gli identificativi nuovi tolgono l'ambiguità.

- [ ] **Step 1: La pagina carica l'ordine salvato e lo passa giù**

In `app/(dashboard)/commesse/statistiche/page.tsx`, aggiungere l'import:

```ts
import { getPreferenzeStatistiche } from '@/actions/preferenze'
```

Caricare le preferenze insieme al resto (aggiungere `getPreferenzeStatistiche()` al `Promise.all` esistente se ce n'è uno adatto, altrimenti una riga a sé prima del `return`):

```ts
  const preferenze = await getPreferenzeStatistiche()
```

E passarle al componente:

```tsx
  <StatisticheCommesse … ordineIniziale={preferenze.ordineBlocchi} />
```

- [ ] **Step 2: `StatisticheCommesse` avvolge i blocchi**

Aggiungere gli import in testa:

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import BloccoStatistica from './BloccoStatistica'
import { applicaOrdine, spostaBlocco } from '@/lib/ordine-blocchi'
import { setOrdineBlocchi } from '@/actions/preferenze'
import { BLOCCHI_STATISTICHE } from '@/types/statistiche'
```

(`useState` è già importato: non duplicarlo)

Aggiungere `ordineIniziale?: string[]` alle props del componente.

Dentro il componente, sopra il `return`:

```tsx
  const [ordine, setOrdine] = useState<string[]>(
    () => applicaOrdine(BLOCCHI_STATISTICHE.map((b) => b.id), ordineIniziale),
  )

  // Riordino ottimistico: la pagina si muove subito e il salvataggio parte in
  // sottofondo. Se fallisce si avvisa e basta, senza rimettere i blocchi a posto
  // sotto gli occhi di chi sta guardando.
  const sposta = (id: string, verso: 'su' | 'giu') => {
    const nuovo = spostaBlocco(ordine, id, verso)
    setOrdine(nuovo)
    setOrdineBlocchi(nuovo).catch(() => toast.error('Ordine non salvato'))
  }
```

Sostituire il contenitore dei sei blocchi con una resa guidata dall'ordine. Ogni blocco diventa una voce di una mappa da identificativo a contenuto:

```tsx
  const contenuti: Record<string, React.ReactNode> = {
    'andamento-commesse': ( /* il contenuto di CardContent del blocco A */ ),
    'incassi-pagamenti':  ( /* … blocco B … */ ),
    'uscite-categoria':   ( /* … blocco B1 … */ ),
    'crediti-debiti':     ( /* … blocco B2 crediti … */ ),
    'costi-utili':        ( /* … blocco costi e utili … */ ),
    'resoconto-cliente':  ( /* … blocco C … */ ),
  }
```

e il `return` rende:

```tsx
  {ordine.map((id, i) => {
    const meta = BLOCCHI_STATISTICHE.find((b) => b.id === id)
    if (!meta || !contenuti[id]) return null
    return (
      <BloccoStatistica
        key={id}
        titolo={meta.titolo}
        primo={i === 0}
        ultimo={i === ordine.length - 1}
        onSu={() => sposta(id, 'su')}
        onGiu={() => sposta(id, 'giu')}
      >
        {contenuti[id]}
      </BloccoStatistica>
    )
  })}
```

**Le righe esatte da spostare** (numeri di riga di partenza, da riverificare
leggendo il file perche' ogni spostamento sposta i successivi):

| Identificativo | Commento che apre il blocco | Riga |
|---|---|---|
| `andamento-commesse` | `{/* A) Andamento commesse per mese */}` | ~182 |
| `incassi-pagamenti` | `{/* B) Incassi e pagamenti per mese */}` | ~222 |
| `uscite-categoria` | `{/* B1) Uscite per categoria — ... */}` | ~266 |
| `crediti-debiti` | `{/* B2) Crediti e debiti — fotografia a oggi ... */}` | ~353 |
| `costi-utili` | `{/* B2) Costi e utili stimati ... */}` | ~604 |
| `resoconto-cliente` | `{/* C) Resoconto per cliente ... */}` | ~701 |

Conviene procedere **un blocco per volta**, verificando con `npm run dev` dopo
ognuno: sei spostamenti in una volta sola in un file di 708 righe sono difficili
da rileggere se qualcosa non torna.

**Sposta il contenuto, non riscriverlo.** Ogni voce di `contenuti` è il corpo del `<CardContent>` che esiste già, tagliato e incollato: il `<Card>`, il `<CardHeader>` e il `<CardTitle>` di ciascun blocco spariscono perché li fornisce ora `BloccoStatistica`. I titoli contengono l'anno (`Andamento commesse — {anno}`): quel pezzo va spostato nel `sottotitolo` del blocco, oppure il titolo passato a `BloccoStatistica` va composto come `` `${meta.titolo} — ${anno}` ``. Scegli la seconda, più semplice, e usa `titolo={`${meta.titolo} — ${anno}`}` per i quattro blocchi che oggi mostrano l'anno; per `crediti-debiti`, che di proposito **non segue il selettore anno**, usa `meta.titolo` da solo e conserva nel `sottotitolo` la precisazione già presente nel codice.

Se un blocco ha righe di testo sotto al titolo (per esempio la nota sotto "Incassi e pagamenti"), passale come `sottotitolo`.

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run dev`, aprire `/commesse/statistiche`.
Expected: i sei blocchi ci sono tutti col loro contenuto, ognuno con due frecce; la prima freccia in su e l'ultima in giù sono spente. Spostare un blocco, ricaricare la pagina, ritrovarlo dove era.

- [ ] **Step 4: Commit**

```bash
git add components/commesse/StatisticheCommesse.tsx "app/(dashboard)/commesse/statistiche/page.tsx"
git commit -m "feat(statistiche): blocchi spostabili con l'ordine salvato sull'account"
```

---

### Task 5: I dati della serie storica

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

- [ ] **Step 1: Due campi nuovi sulle righe esistenti**

In `lib/statistiche-commesse.ts`, in `ScadenzaRow` aggiungere:

```ts
  // Quando la scadenza e' entrata nei conti. Serve alla serie storica: senza,
  // una rata inserita ieri risulterebbe un debito di due anni fa.
  created_at?: string
```

e in `AltroCreditoRow`:

```ts
  // Come sopra: da quando questo credito esiste.
  created_at?: string
```

Opzionali di proposito, come `StatRow.anonima`: le fixture di test esistenti restano valide.

- [ ] **Step 2: La pagina carica i campi e i tre insiemi nuovi**

In `app/(dashboard)/commesse/statistiche/page.tsx`:

Aggiungere `created_at` alla `select` delle scadenze e a quella degli altri crediti (`calcoli_incassi`), e riportarlo nelle rispettive `map`.

Aggiungere al `Promise.all` tre letture, tutte con `selectAll`:

```ts
      selectAll((da, a) => supabase
        .from('buste_paga')
        .select('dipendente_id, periodo, netto')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('pagamenti_dipendente')
        .select('dipendente_id, data_pagamento, importo')
        .eq('organization_id', orgId)
        .order('id').range(da, a)),
      selectAll((da, a) => supabase
        .from('anticipi_acconti')
        .select('acconto_id, anticipo_id')
        .eq('organization_id', orgId)
        .order('acconto_id').range(da, a)),
```

`anticipi_acconti` ha `acconto_id` come chiave primaria e nessuna colonna `id`: ordinare per `acconto_id`, altrimenti la paginazione salta righe.

Gli anticipi (`anticipi_fattura`) sono già caricati dalla pagina: servono `id, importo, data_erogazione, rimborsato, rimborsato_at`. Verificare che la `select` esistente li comprenda e aggiungere i mancanti.

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add lib/statistiche-commesse.ts "app/(dashboard)/commesse/statistiche/page.tsx"
git commit -m "feat(statistiche): dati datati per la ricostruzione storica"
```

---

### Task 6: La serie temporale (TDD)

**Files:**
- Create: `lib/andamento-crediti-debiti.ts`
- Test: `lib/andamento-crediti-debiti.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest'
import {
  creditiAllaData,
  debitiAllaData,
  dateDelPeriodo,
  andamentoCreditiDebiti,
  type DatiAndamento,
} from './andamento-crediti-debiti'

const VUOTI: DatiAndamento = {
  commesse: [], acconti: [], scadenze: [], altriCrediti: [],
  buste: [], pagamentiDipendenti: [], anticipi: [],
}

describe('creditiAllaData', () => {
  const dati: DatiAndamento = {
    ...VUOTI,
    commesse: [{ id: 'c1', totale: 1000, data_conferma: '2026-03-10', stato: 'in_lavorazione' }],
    acconti: [{ commessa_id: 'c1', importo: 400, data_pagamento: '2026-04-05' }],
  }

  it('prima della conferma la commessa non è ancora un credito', () => {
    expect(creditiAllaData(dati, '2026-03-09')).toBe(0)
  })

  it('dalla conferma vale tutta, finché non arriva un acconto', () => {
    expect(creditiAllaData(dati, '2026-03-10')).toBe(1000)
    expect(creditiAllaData(dati, '2026-04-04')).toBe(1000)
  })

  it('l’acconto scala il credito dal giorno in cui è stato versato', () => {
    expect(creditiAllaData(dati, '2026-04-05')).toBe(600)
  })

  it('una commessa incassata in eccesso non maschera il credito di un’altra', () => {
    const due: DatiAndamento = {
      ...VUOTI,
      commesse: [
        { id: 'c1', totale: 100, data_conferma: '2026-01-01', stato: 'concluso' },
        { id: 'c2', totale: 500, data_conferma: '2026-01-01', stato: 'concluso' },
      ],
      acconti: [{ commessa_id: 'c1', importo: 300, data_pagamento: '2026-01-02' }],
    }
    expect(creditiAllaData(due, '2026-01-02')).toBe(500)
  })

  it('lo stato in_attesa non conta come credito', () => {
    const limbo: DatiAndamento = {
      ...VUOTI,
      commesse: [{ id: 'x', totale: 900, data_conferma: '2026-01-01', stato: 'in_attesa' }],
    }
    expect(creditiAllaData(limbo, '2026-06-01')).toBe(0)
  })

  it('gli incassi in attesa non ancora incassati contano dal loro inserimento', () => {
    const altri: DatiAndamento = {
      ...VUOTI,
      altriCrediti: [
        { importo: 200, incassato: false, created_at: '2026-02-01' },
        { importo: 999, incassato: true, created_at: '2026-02-01' },
      ],
    }
    expect(altri.altriCrediti.length).toBe(2)
    expect(creditiAllaData(altri, '2026-01-31')).toBe(0)
    expect(creditiAllaData(altri, '2026-02-01')).toBe(200)
  })
})

describe('debitiAllaData — scadenze', () => {
  it('una scadenza pagata pesa dall’inserimento fino alla sua data', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 300, data_scadenza: '2026-05-20', pagato: true, annullata: false, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-03-31')).toBe(0)
    expect(debitiAllaData(d, '2026-04-01')).toBe(300)
    expect(debitiAllaData(d, '2026-05-19')).toBe(300)
    expect(debitiAllaData(d, '2026-05-20')).toBe(0)
  })

  it('una scadenza NON pagata resta aperta anche se la data è passata', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 300, data_scadenza: '2026-05-20', pagato: false, annullata: false, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-12-31')).toBe(300)
  })

  it('una scadenza senza data è aperta dall’inserimento in poi', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 150, data_scadenza: null, pagato: false, annullata: false, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-03-31')).toBe(0)
    expect(debitiAllaData(d, '2026-09-01')).toBe(150)
  })

  it('una scadenza annullata non pesa mai', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      scadenze: [{ importo: 500, data_scadenza: '2026-05-20', pagato: false, annullata: true, created_at: '2026-04-01' }],
    }
    expect(debitiAllaData(d, '2026-05-01')).toBe(0)
  })
})

describe('debitiAllaData — dipendenti', () => {
  const d: DatiAndamento = {
    ...VUOTI,
    buste: [{ dipendente_id: 'd1', periodo: '2026-03-01', netto: 1500 }],
    pagamentiDipendenti: [{ dipendente_id: 'd1', data_pagamento: '2026-04-10', importo: 1500 }],
  }

  it('il debito nasce al periodo di competenza', () => {
    expect(debitiAllaData(d, '2026-02-28')).toBe(0)
    expect(debitiAllaData(d, '2026-03-01')).toBe(1500)
  })

  it('e si chiude col pagamento', () => {
    expect(debitiAllaData(d, '2026-04-09')).toBe(1500)
    expect(debitiAllaData(d, '2026-04-10')).toBe(0)
  })

  it('un dipendente pagato in anticipo non azzera il debito verso un altro', () => {
    const due: DatiAndamento = {
      ...VUOTI,
      buste: [{ dipendente_id: 'd2', periodo: '2026-03-01', netto: 1000 }],
      pagamentiDipendenti: [{ dipendente_id: 'd1', data_pagamento: '2026-03-05', importo: 5000 }],
    }
    expect(debitiAllaData(due, '2026-03-05')).toBe(1000)
  })
})

describe('debitiAllaData — anticipi fattura', () => {
  it('nasce all’erogazione e cala con gli acconti collegati', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      anticipi: [{
        id: 'a1', importo: 5000, data_erogazione: '2026-01-15',
        rimborsato: false, rimborsato_at: null,
        acconti: [{ importo: 2000, data_pagamento: '2026-02-10' }],
      }],
    }
    expect(debitiAllaData(d, '2026-01-14')).toBe(0)
    expect(debitiAllaData(d, '2026-01-15')).toBe(5000)
    expect(debitiAllaData(d, '2026-02-10')).toBe(3000)
  })

  it('un anticipo rimborsato si azzera alla sua data di rimborso', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      anticipi: [{
        id: 'a1', importo: 5000, data_erogazione: '2026-01-15',
        rimborsato: true, rimborsato_at: '2026-03-01', acconti: [],
      }],
    }
    expect(debitiAllaData(d, '2026-02-28')).toBe(5000)
    expect(debitiAllaData(d, '2026-03-01')).toBe(0)
  })

  it('un anticipo senza data di erogazione non entra nella storia', () => {
    const d: DatiAndamento = {
      ...VUOTI,
      anticipi: [{
        id: 'a1', importo: 5000, data_erogazione: null,
        rimborsato: false, rimborsato_at: null, acconti: [],
      }],
    }
    expect(debitiAllaData(d, '2026-06-01')).toBe(0)
  })
})

describe('dateDelPeriodo', () => {
  it('30 giorni dà 31 punti giornalieri, l’ultimo è oggi', () => {
    const p = dateDelPeriodo('30g', '2026-03-31', '2020-01-01')
    expect(p.length).toBe(31)
    expect(p[0]).toBe('2026-03-01')
    expect(p[p.length - 1]).toBe('2026-03-31')
  })

  it('6 mesi dà punti settimanali', () => {
    const p = dateDelPeriodo('6m', '2026-06-30', '2020-01-01')
    expect(p.length).toBeGreaterThan(20)
    expect(p.length).toBeLessThan(32)
    expect(p[p.length - 1]).toBe('2026-06-30')
  })

  it('24 mesi dà punti mensili', () => {
    const p = dateDelPeriodo('24m', '2026-06-30', '2020-01-01')
    expect(p.length).toBeGreaterThan(20)
    expect(p.length).toBeLessThan(28)
    expect(p[p.length - 1]).toBe('2026-06-30')
  })

  it('"tutto" parte dal primo movimento, non dall’inizio dei tempi', () => {
    const p = dateDelPeriodo('tutto', '2026-06-30', '2026-01-15')
    expect(p[0] <= '2026-01-15').toBe(true)
    expect(p[0] >= '2025-12-01').toBe(true)
  })

  it('senza alcun movimento non esplode', () => {
    expect(dateDelPeriodo('tutto', '2026-06-30', null)).toEqual(['2026-06-30'])
  })
})

describe('andamentoCreditiDebiti', () => {
  it('la posizione netta è crediti meno debiti, punto per punto', () => {
    const dati: DatiAndamento = {
      ...VUOTI,
      commesse: [{ id: 'c1', totale: 1000, data_conferma: '2026-03-01', stato: 'concluso' }],
      scadenze: [{ importo: 400, data_scadenza: null, pagato: false, annullata: false, created_at: '2026-03-01' }],
    }
    const serie = andamentoCreditiDebiti(dati, '30g', '2026-03-31')
    const ultimo = serie[serie.length - 1]
    expect(ultimo.crediti).toBe(1000)
    expect(ultimo.debiti).toBe(400)
    expect(ultimo.netta).toBe(600)
  })

  it('su dati vuoti restituisce zeri, non NaN', () => {
    const serie = andamentoCreditiDebiti(VUOTI, '30g', '2026-03-31')
    expect(serie.length).toBe(31)
    expect(serie.every((p) => p.crediti === 0 && p.debiti === 0 && p.netta === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `npx vitest run lib/andamento-crediti-debiti.test.ts`
Expected: FAIL — `Failed to resolve import "./andamento-crediti-debiti"`.

- [ ] **Step 3: Scrivere l'implementazione**

```ts
import { STATI_CREDITO } from '@/lib/statistiche-commesse'

/**
 * Ricostruzione nel tempo di crediti e debiti.
 *
 * Il gestionale non conserva fotografie del passato: la serie si ricava dai
 * movimenti, che sono datati. Le date ISO si confrontano come stringhe, quindi
 * tutto qui dentro resta puro e verificabile con date fisse.
 *
 * I crediti sono esatti. I debiti dipendono da una regola che l'utente
 * governa: la data di una scadenza non chiude il debito da sola, lo chiude la
 * spunta "pagato". Chi paga in ritardo sposta la data e la curva scende nel
 * punto giusto.
 *
 * Una imprecisione dichiarata: lo stato di una commessa e' quello di adesso,
 * non quello che aveva allora, perche' la storia degli stati non viene
 * conservata. Pesa poco — otto stati su nove contano come credito — ma esiste.
 */

export type PeriodoAndamento = '30g' | '3m' | '6m' | '12m' | '24m' | 'tutto'

export type PuntoAndamento = {
  data: string // 'YYYY-MM-DD'
  crediti: number
  debiti: number
  netta: number
}

export type CommessaAndamento = {
  id: string
  totale: number
  data_conferma: string | null
  stato: string
}
export type AccontoAndamento = {
  commessa_id: string
  importo: number
  data_pagamento: string | null
}
export type ScadenzaAndamento = {
  importo: number
  data_scadenza: string | null
  pagato: boolean
  annullata: boolean
  created_at: string
}
export type AltroCreditoAndamento = {
  importo: number
  incassato: boolean
  created_at: string
}
export type BustaAndamento = {
  dipendente_id: string
  periodo: string
  netto: number
}
export type PagamentoAndamento = {
  dipendente_id: string
  data_pagamento: string
  importo: number
}
export type AnticipoAndamento = {
  id: string
  importo: number
  data_erogazione: string | null
  rimborsato: boolean
  rimborsato_at: string | null
  acconti: { importo: number; data_pagamento: string | null }[]
}

export type DatiAndamento = {
  commesse: CommessaAndamento[]
  acconti: AccontoAndamento[]
  scadenze: ScadenzaAndamento[]
  altriCrediti: AltroCreditoAndamento[]
  buste: BustaAndamento[]
  pagamentiDipendenti: PagamentoAndamento[]
  anticipi: AnticipoAndamento[]
}

const SET_STATI_CREDITO: ReadonlySet<string> = new Set(STATI_CREDITO)

/** Solo la parte data di un timestamp: 'YYYY-MM-DDTHH:MM:SSZ' → 'YYYY-MM-DD'. */
function soloData(iso: string): string {
  return iso.slice(0, 10)
}

function euro(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Quanto restava da incassare alla data indicata. */
export function creditiAllaData(dati: DatiAndamento, data: string): number {
  const incassatoPerCommessa = new Map<string, number>()
  for (const a of dati.acconti) {
    if (!a.data_pagamento || soloData(a.data_pagamento) > data) continue
    const attuale = incassatoPerCommessa.get(a.commessa_id) ?? 0
    incassatoPerCommessa.set(a.commessa_id, attuale + (Number(a.importo) || 0))
  }

  let totale = 0
  for (const c of dati.commesse) {
    if (!SET_STATI_CREDITO.has(c.stato)) continue
    if (!c.data_conferma || soloData(c.data_conferma) > data) continue
    // Floor a zero per commessa: una incassata in eccesso non deve mascherare
    // il credito di un'altra.
    const residuo = (Number(c.totale) || 0) - (incassatoPerCommessa.get(c.id) ?? 0)
    if (residuo > 0) totale += residuo
  }

  // Incassi in attesa: entrano solo se non ancora incassati. Di quelli gia'
  // incassati non si conosce la data, quindi restano fuori dalla storia; cosi'
  // l'ultimo punto della serie coincide col riquadro "Crediti e debiti", che
  // applica lo stesso filtro.
  for (const a of dati.altriCrediti) {
    if (a.incassato) continue
    if (soloData(a.created_at) > data) continue
    totale += Number(a.importo) || 0
  }

  return euro(totale)
}

/** Quanto restava da pagare alla data indicata. Il fido di cassa resta fuori. */
export function debitiAllaData(dati: DatiAndamento, data: string): number {
  let totale = 0

  // ── Scadenze fornitori ────────────────────────────────────────────────────
  for (const s of dati.scadenze) {
    if (s.annullata) continue
    if (soloData(s.created_at) > data) continue
    // La data chiude il debito solo se la spunta "pagato" c'e'. Senza spunta
    // resta aperto anche se la data e' passata.
    if (s.pagato && s.data_scadenza && s.data_scadenza <= data) continue
    totale += Number(s.importo) || 0
  }

  // ── Dipendenti ────────────────────────────────────────────────────────────
  // Il debito matura al periodo di competenza della busta, non a quando la si
  // registra: chi inserisce le buste di marzo ad aprile vede comunque il
  // gradino a marzo. Floor per persona, come nel riquadro esistente.
  const dovutoPer = new Map<string, number>()
  for (const b of dati.buste) {
    if (soloData(b.periodo) > data) continue
    dovutoPer.set(b.dipendente_id, (dovutoPer.get(b.dipendente_id) ?? 0) + (Number(b.netto) || 0))
  }
  const pagatoPer = new Map<string, number>()
  for (const p of dati.pagamentiDipendenti) {
    if (soloData(p.data_pagamento) > data) continue
    pagatoPer.set(p.dipendente_id, (pagatoPer.get(p.dipendente_id) ?? 0) + (Number(p.importo) || 0))
  }
  for (const [id, dovuto] of dovutoPer) {
    const residuo = dovuto - (pagatoPer.get(id) ?? 0)
    if (residuo > 0) totale += residuo
  }

  // ── Anticipi fattura ──────────────────────────────────────────────────────
  // Nascono all'erogazione e calano con gli acconti del cliente che la banca
  // trattiene. Senza data di erogazione non si sa da quando esistono: restano
  // fuori dalla storia invece di comparire dall'inizio dei tempi.
  for (const a of dati.anticipi) {
    if (!a.data_erogazione || a.data_erogazione > data) continue
    if (a.rimborsato && a.rimborsato_at && a.rimborsato_at <= data) continue
    let residuo = Number(a.importo) || 0
    for (const ac of a.acconti) {
      if (!ac.data_pagamento || soloData(ac.data_pagamento) > data) continue
      residuo -= Number(ac.importo) || 0
    }
    if (residuo > 0) totale += residuo
  }

  return euro(totale)
}

function aggiungiGiorni(data: string, giorni: number): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + giorni)
  return d.toISOString().slice(0, 10)
}

function aggiungiMesi(data: string, mesi: number): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + mesi)
  return d.toISOString().slice(0, 10)
}

/**
 * Le date dei punti del grafico, dalla piu' vecchia a oggi.
 *
 * La fittezza segue il periodo: oltre i tre mesi una linea giornaliera diventa
 * un pettine illeggibile.
 */
export function dateDelPeriodo(
  periodo: PeriodoAndamento,
  oggi: string,
  primaData: string | null,
): string[] {
  let inizio: string
  let passo: number
  let unita: 'giorno' | 'mese'

  if (periodo === '30g')      { inizio = aggiungiGiorni(oggi, -30);  passo = 1; unita = 'giorno' }
  else if (periodo === '3m')  { inizio = aggiungiMesi(oggi, -3);     passo = 1; unita = 'giorno' }
  else if (periodo === '6m')  { inizio = aggiungiMesi(oggi, -6);     passo = 7; unita = 'giorno' }
  else if (periodo === '12m') { inizio = aggiungiMesi(oggi, -12);    passo = 7; unita = 'giorno' }
  else if (periodo === '24m') { inizio = aggiungiMesi(oggi, -24);    passo = 1; unita = 'mese' }
  else {
    // "tutto": dal primo movimento. Senza movimenti c'e' solo l'oggi.
    if (!primaData) return [oggi]
    inizio = primaData
    unita = 'mese'
    passo = 1
  }

  const date: string[] = []
  let corrente = inizio
  // Rete di sicurezza: oltre questo numero di punti c'e' un ciclo impazzito,
  // non un periodo lungo.
  for (let i = 0; corrente < oggi && i < 2000; i++) {
    date.push(corrente)
    corrente = unita === 'giorno' ? aggiungiGiorni(corrente, passo) : aggiungiMesi(corrente, passo)
  }
  // L'ultimo punto e' sempre oggi: e' il numero che si confronta col riquadro.
  date.push(oggi)
  return date
}

/** La data del movimento piu' vecchio, per il periodo "tutto". */
export function primoMovimento(dati: DatiAndamento): string | null {
  const candidate: string[] = []
  for (const c of dati.commesse) if (c.data_conferma) candidate.push(soloData(c.data_conferma))
  for (const s of dati.scadenze) candidate.push(soloData(s.created_at))
  for (const b of dati.buste) candidate.push(soloData(b.periodo))
  for (const a of dati.anticipi) if (a.data_erogazione) candidate.push(a.data_erogazione)
  for (const a of dati.altriCrediti) candidate.push(soloData(a.created_at))
  if (candidate.length === 0) return null
  return candidate.reduce((min, d) => (d < min ? d : min))
}

/** La serie completa per il grafico. */
export function andamentoCreditiDebiti(
  dati: DatiAndamento,
  periodo: PeriodoAndamento,
  oggi: string,
): PuntoAndamento[] {
  const date = dateDelPeriodo(periodo, oggi, primoMovimento(dati))
  return date.map((data) => {
    const crediti = creditiAllaData(dati, data)
    const debiti = debitiAllaData(dati, data)
    return { data, crediti, debiti, netta: euro(crediti - debiti) }
  })
}
```

- [ ] **Step 4: Eseguire il test per vederlo passare**

Run: `npx vitest run lib/andamento-crediti-debiti.test.ts`
Expected: PASS — 23 test passati.

Se un'asserzione fallisce, l'implementazione è sbagliata: riporta quale, con atteso e ottenuto. **Non modificare le attese dei test**: sono la specifica, calcolate a mano.

- [ ] **Step 5: Verificare i tipi e la suite intera**

Run: `npx tsc --noEmit && npm test`
Expected: nessun errore, tutti i test passano.

- [ ] **Step 6: Commit**

```bash
git add lib/andamento-crediti-debiti.ts lib/andamento-crediti-debiti.test.ts
git commit -m "feat(statistiche): ricostruzione nel tempo di crediti e debiti"
```

---

### Task 7: Il grafico

**Files:**
- Create: `components/commesse/GraficoAndamento.tsx`

**Prima di scrivere:** la palette è già validata (vedi la tabella in cima al piano). Non cambiarla e non aggiungere una seconda scala verticale.

- [ ] **Step 1: Creare il componente**

```tsx
'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/pricing'
import { andamentoCreditiDebiti } from '@/lib/andamento-crediti-debiti'
import type { DatiAndamento, PeriodoAndamento } from '@/lib/andamento-crediti-debiti'

// Palette validata con lo strumento della skill dataviz in chiaro e in scuro:
// banda di luminosita', croma, separazione per daltonismo, contrasto sul fondo.
// Teal e rose sono gli stessi del grafico "Incassi e pagamenti" qui sopra, per
// non dare due significati allo stesso colore nella stessa pagina.
const COLORE = {
  crediti: '#0d9488',
  debiti: '#e11d48',
  netta: '#7c3aed',
} as const

const PERIODI: { value: PeriodoAndamento; label: string }[] = [
  { value: '30g',   label: '30 giorni' },
  { value: '3m',    label: '3 mesi' },
  { value: '6m',    label: '6 mesi' },
  { value: '12m',   label: '12 mesi' },
  { value: '24m',   label: '24 mesi' },
  { value: 'tutto', label: 'Tutto' },
]

/** Etichetta corta per l'asse: 'YYYY-MM-DD' → '12 mar' o 'mar 26'. */
function etichettaData(data: string, mensile: boolean): string {
  const [a, m, g] = data.split('-')
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  const nomeMese = mesi[Number(m) - 1] ?? m
  return mensile ? `${nomeMese} ${a.slice(2)}` : `${Number(g)} ${nomeMese}`
}

/** Migliaia compatte per l'asse verticale: 12500 → '12,5k'. */
function etichettaEuro(v: number): string {
  const segno = v < 0 ? '−' : ''
  const n = Math.abs(v)
  if (n >= 1000) return `${segno}${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k`
  return `${segno}${n.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`
}

interface Props {
  dati: DatiAndamento
  oggi: string
  /** Esposizione bancaria di oggi: non entra nelle linee, si dichiara sotto. */
  fidoUtilizzato: number
}

export default function GraficoAndamento({ dati, oggi, fidoUtilizzato }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoAndamento>('12m')

  const serie = useMemo(
    () => andamentoCreditiDebiti(dati, periodo, oggi),
    [dati, periodo, oggi],
  )
  const mensile = periodo === '24m' || periodo === 'tutto'

  return (
    <div className="space-y-3">
      {/* I filtri stanno in una riga sola sopra al grafico */}
      <div className="flex flex-wrap gap-1">
        {PERIODI.map((p) => (
          <Button
            key={p.value}
            variant={periodo === p.value ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setPeriodo(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={serie} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="data"
            tickFormatter={(d: string) => etichettaData(d, mensile)}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={etichettaEuro}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            width={56}
          />
          {/* Lo zero va visto: la posizione netta puo' scendere sotto */}
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          <Tooltip
            formatter={(v: number, nome: string) => [formatEuro(v), nome]}
            labelFormatter={(d: string) => etichettaData(String(d), false)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone" dataKey="crediti" name="Crediti"
            stroke={COLORE.crediti} strokeWidth={2} dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
          <Line
            type="monotone" dataKey="debiti" name="Debiti"
            stroke={COLORE.debiti} strokeWidth={2} dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
          <Line
            type="monotone" dataKey="netta" name="Posizione netta"
            stroke={COLORE.netta} strokeWidth={2} dot={false}
            strokeDasharray="5 3"
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Cosa il grafico non dice: va scritto, non lasciato indovinare */}
      <div className="rounded-md border bg-gray-50/70 p-3 text-xs text-gray-600 space-y-1">
        <p>
          <span className="font-medium text-gray-800">Fido di cassa utilizzato oggi:</span>{' '}
          {formatEuro(fidoUtilizzato)} — fuori dalle linee, perché del saldo di un
          conto corrente non esiste storia: è un valore aggiornato a mano che vale
          solo per oggi.
        </p>
        <p>
          Per lo stesso motivo la <span className="font-medium text-gray-800">posizione netta</span> qui
          non coincide con quella del riquadro «Crediti e debiti», che il fido lo conta.
        </p>
        <p>
          Un debito si chiude quando la scadenza viene spuntata come pagata, alla sua
          data. Una scadenza non spuntata resta aperta anche se la data è passata.
        </p>
      </div>
    </div>
  )
}
```

Il tratteggio sulla posizione netta è una seconda codifica oltre al colore: chi
non distingue bene teal da rose riconosce comunque la terza linea, e la legenda
riporta i tre nomi.

- [ ] **Step 2: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npx eslint components/commesse/GraficoAndamento.tsx`
Expected: nessun problema.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/GraficoAndamento.tsx
git commit -m "feat(statistiche): grafico dell'andamento di crediti, debiti e posizione netta"
```

---

### Task 8: Montare il grafico come settimo blocco

**Files:**
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`
- Modify: `components/commesse/StatisticheCommesse.tsx`

- [ ] **Step 1: La pagina compone `DatiAndamento`**

In `app/(dashboard)/commesse/statistiche/page.tsx`, dopo che i dati sono caricati, comporre l'oggetto e passarlo giù. Gli acconti collegati a ciascun anticipo si ricavano incrociando `anticipi_acconti` con gli acconti già caricati:

```ts
  const accontoPerId = new Map(accontiRaw.map((a) => [a.id, a]))
  const accontiPerAnticipo = new Map<string, { importo: number; data_pagamento: string | null }[]>()
  for (const l of legamiAccontiRaw) {
    const acc = accontoPerId.get(l.acconto_id)
    if (!acc) continue
    const lista = accontiPerAnticipo.get(l.anticipo_id) ?? []
    lista.push({ importo: Number(acc.importo) || 0, data_pagamento: acc.data_pagamento })
    accontiPerAnticipo.set(l.anticipo_id, lista)
  }

  const datiAndamento: DatiAndamento = {
    commesse: commesseValide.map((c) => ({
      id: c.id,
      totale: Number(c.totale) || 0,
      data_conferma: c.data_conferma,
      stato: c.stato ?? '',
    })),
    acconti: accontiRaw.map((a) => ({
      commessa_id: a.commessa_id,
      importo: Number(a.importo) || 0,
      data_pagamento: a.data_pagamento,
    })),
    scadenze: scadenze.map((s) => ({
      importo: s.importo,
      data_scadenza: s.data_scadenza,
      pagato: s.pagato,
      annullata: s.annullata,
      created_at: s.created_at ?? oggi,
    })),
    altriCrediti: altriCrediti.map((a) => ({
      importo: a.importo,
      incassato: a.incassato,
      created_at: a.created_at ?? oggi,
    })),
    buste: busteRaw.map((b) => ({
      dipendente_id: b.dipendente_id,
      periodo: b.periodo,
      netto: Number(b.netto) || 0,
    })),
    pagamentiDipendenti: pagDipRaw.map((p) => ({
      dipendente_id: p.dipendente_id,
      data_pagamento: p.data_pagamento,
      importo: Number(p.importo) || 0,
    })),
    anticipi: anticipiRaw.map((a) => ({
      id: a.id,
      importo: Number(a.importo) || 0,
      data_erogazione: a.data_erogazione,
      rimborsato: a.rimborsato,
      rimborsato_at: a.rimborsato_at,
      acconti: accontiPerAnticipo.get(a.id) ?? [],
    })),
  }
```

I nomi delle variabili sorgente (`commesseValide`, `accontiRaw`, `scadenze`, `altriCrediti`, `busteRaw`, `pagDipRaw`, `anticipiRaw`, `legamiAccontiRaw`, `oggi`) sono quelli già presenti nella pagina: **verificali leggendo il file** e adegua se differiscono, invece di introdurne di nuovi.

Il `?? oggi` su `created_at` copre le righe scritte prima che la colonna venisse letta: senza data di nascita nota, la scelta prudente è farle comparire oggi invece che all'inizio dei tempi.

Passare al componente `datiAndamento`, `oggi` e il fido utilizzato — quest'ultimo è `banche.conti.reduce((s, c) => s + c.utilizzato, 0)` o l'equivalente già calcolato nella pagina: **verifica come il riquadro esistente ottiene l'esposizione dei soli conti** e riusa quel valore invece di ricalcolarlo.

- [ ] **Step 2: Montare il blocco**

In `components/commesse/StatisticheCommesse.tsx`, aggiungere le props `datiAndamento`, `oggi`, `fidoUtilizzato` e l'import:

```tsx
import GraficoAndamento from './GraficoAndamento'
```

e nella mappa `contenuti` costruita al Task 4, la voce:

```tsx
    'andamento-storico': (
      <GraficoAndamento dati={datiAndamento} oggi={oggi} fidoUtilizzato={fidoUtilizzato} />
    ),
```

L'identificativo `andamento-storico` è già in `BLOCCHI_STATISTICHE` dal Task 1, quindi il blocco compare da solo nella posizione prevista, e chi ha già un ordine salvato se lo ritrova in fondo.

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run dev`, aprire `/commesse/statistiche`.
Expected: il grafico compare con tre linee, i sei pulsanti del periodo funzionano, e le frecce lo spostano come gli altri blocchi.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/commesse/statistiche/page.tsx" components/commesse/StatisticheCommesse.tsx
git commit -m "feat(statistiche): il grafico andamento come blocco riordinabile"
```

---

### Task 9: Verifica

**Files:** nessuno da modificare — è il collaudo.

- [ ] **Step 1: Suite, tipi, lint, build**

Run: `npm test`
Expected: tutti i test passano, compresi i 9 di `ordine-blocchi` e i 23 di `andamento-crediti-debiti`.

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run lint`
Expected: **nessun output**. Il progetto è a zero problemi di lint: qualunque riga in più viene da questa modifica.

Run: `npm run build`
Expected: build completata.

- [ ] **Step 2: Il controllo che smaschera un errore di ricostruzione**

Con `npm run dev`, aprire `/commesse/statistiche` e confrontare **l'ultimo punto delle linee** con il riquadro «Crediti e debiti» della stessa pagina:

- **Crediti**: devono coincidere esattamente.
- **Debiti**: devono coincidere a meno del fido di cassa utilizzato, che il riquadro conta e la linea no. Il numero del fido è scritto sotto al grafico: sommandolo all'ultimo punto della linea si deve ottenere il totale debiti del riquadro.

Se non tornano, c'è un errore nella ricostruzione: riportalo invece di aggiustare i numeri.

- [ ] **Step 3: Prova del riordino**

- Spostare un blocco in su, ricaricare la pagina: deve restare dove l'hai messo.
- Le frecce del primo blocco (su) e dell'ultimo (giù) devono essere spente.
- Entrare da un altro browser con lo stesso account: stesso ordine.

- [ ] **Step 4: Prova dei periodi**

Passare fra i sei periodi: la linea non deve mai diventare un pettine illeggibile, le etichette dell'asse orizzontale non devono sovrapporsi, e il passaggio del dito sul grafico deve mostrare i tre valori del punto.

- [ ] **Step 5: Chiusura**

```bash
git checkout master
git merge --ff-only feat/statistiche-andamento
git push origin master
git branch -d feat/statistiche-andamento
```

---

## Cosa resta fuori

Il fido di cassa nel tempo, finché non si registra una storia dei saldi. Lo zoom e la selezione di un intervallo a mano sul grafico. L'esportazione della serie. Il riordino per organizzazione invece che per utente. Le previsioni sull'andamento futuro.

## Note per chi implementa

**Il task più rischioso è il 4**, non i pezzi nuovi: sposta sei blocchi di contenuto dentro una mappa in un file di 708 righe. È taglia-e-incolla, non riscrittura — se ti accorgi di star cambiando il contenuto di un grafico esistente, fermati. Conviene farlo un blocco per volta, verificando con `npm run dev` dopo ognuno.

**La palette del grafico non si sceglie a occhio.** È stata validata con lo strumento della skill `dataviz` in chiaro e in scuro. Se serve cambiarla, va rivalidata con quello strumento.

**Un solo asse verticale.** Le tre serie sono tutte in euro. Un grafico a due scale verticali è l'errore più comune e più grave in una visualizzazione, e qui non serve a niente.
