# Commesse anonime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrare le vendite e-commerce/eBay dentro i blocchi anno delle commesse, con materiale, manodopera e utile per ogni incasso, facendole entrare in tutti i totali contabili e restare fuori da ogni flusso operativo.

**Architecture:** Ogni vendita è una riga di `commesse` marchiata `anonima = true` più il suo unico record in `acconti_commessa`. Le vendite sono raccolte in `sezioni_anonime`, create a richiesta dentro un blocco. Il riuso della tabella `commesse` fa entrare le vendite da sole in fatturato, flusso di cassa e grafico costi/utile; le esclusioni (produzione, calendario, tabella commesse, anticipi, feed dashboard) sono filtri espliciti, elencati nel Task 8.

**Tech Stack:** Next.js 16 App Router (React 19, Server Components + Server Actions), TypeScript, Supabase/PostgreSQL con RLS, shadcn/ui + Tailwind, Vitest per la logica pura.

**Spec:** `docs/superpowers/specs/2026-08-31-commesse-anonime-design.md`

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260831120000_commesse_anonime.sql` | Tabella `sezioni_anonime` + 4 colonne su `commesse` |
| `types/commessa.ts` | `SezioneAnonima`, `VenditaAnonima`, `VenditaAnonimaInput`, `CanaleVendita`, `SezioneConVendite`; 4 campi nuovi su `Commessa` |
| `lib/vendite-anonime.ts` | Scorporo IVA, utile, margine, totali. Nessuna dipendenza React né Supabase |
| `lib/vendite-anonime.test.ts` | Vitest sulla logica pura |
| `actions/vendite-anonime.ts` | CRUD sezioni e vendite; unico punto che scrive i due record |
| `components/commesse/SezioniAnonime.tsx` | Contenitore: pulsante di creazione, elenco sezioni, dialoghi |
| `components/commesse/SezioneAnonimaCard.tsx` | Una sezione: totali in intestazione, fisarmonica mesi, righe |
| `components/commesse/DialogSezioneAnonima.tsx` | Crea/rinomina sezione |
| `components/commesse/DialogVenditaAnonima.tsx` | Crea/modifica vendita, con riepilogo IVA e utile dal vivo |
| `app/(dashboard)/commesse/[id]/page.tsx` | Carica le sezioni e monta `<SezioniAnonime>` sopra `<TabellaCommesse>` |
| `lib/statistiche-commesse.ts` | `StatRow.anonima`; tre funzioni saltano le anonime |
| `actions/{commesse,produzione,banche,calendario,dashboard}.ts` | Filtri di esclusione |

`TabellaCommesse.tsx` (876 righe) **non** viene toccata: la sezione è un componente sorella, non un innesto.

## Convenzioni del progetto da rispettare

- Server Action: `'use server'`, `createClient()` da `@/lib/supabase/server`, `getOrgId()` da `@/lib/auth`, `revalidatePath('/commesse', 'layout')` dopo ogni mutazione, errori come `throw new Error(error.message)`.
- Ogni query filtra `.eq('organization_id', orgId)`.
- Letture che possono superare le 1000 righe: `selectAll()` da `@/lib/supabase/paginate` con `.order('id').range(da, a)` — PostgREST tronca in silenzio.
- Client Component: `'use client'`, `useRouter().refresh()` dopo le mutazioni, `toast` da `sonner` per il riscontro.
- **Dialoghi montati condizionalmente** (`{stato && <Dialog… />}`) invece di `useEffect` che azzera lo stato: è la correzione già applicata altrove in questo modulo per l'anti-pattern setState-in-useEffect.
- Niente letture di `ref.current` in render né scritture su ref-prop (React Compiler).
- Commenti in italiano, che spiegano il *perché*, non il *cosa*.

**Cancello di verifica per-task:** `npx tsc --noEmit` deve essere pulito. **Non**
usare `npm run lint` come cancello di ogni task: impiega minuti e parte gia' da
**1743 problemi (35 errori) pre-esistenti**, in `actions/firma.ts`,
`actions/firma-pubblica.ts`, `app/(dashboard)/preventivi/scorrevoli/FormPreventivo.tsx`
e nei file generati. Misurato il 2026-08-31 con e senza le modifiche: identico. Il
lint si controlla una volta sola nel Task 11, e il criterio e' *nessun problema
nuovo rispetto a quel baseline*, non "zero".

---

### Task 1: Migration del database

**Files:**
- Create: `supabase/migrations/20260831120000_commesse_anonime.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 20260831120000_commesse_anonime.sql
-- Commesse anonime: le vendite e-commerce/eBay sono ricavi a tutti gli effetti
-- ma non sono lavori. Vengono salvate come commesse marchiate `anonima`, cosi'
-- entrano da sole in fatturato, flusso di cassa e costi/utile, e vengono
-- escluse con un filtro esplicito da produzione, calendario e anticipi.

CREATE TABLE IF NOT EXISTS sezioni_anonime (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gruppo_id        uuid        NOT NULL REFERENCES gruppi_commesse(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sezioni_anonime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON sezioni_anonime
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX IF NOT EXISTS idx_sezioni_anonime_gruppo
  ON sezioni_anonime(organization_id, gruppo_id, ordine);

-- `anonima` e' una colonna a se' e non un valore di `stato` o di `reparti`:
-- deve poter essere filtrata senza dipendere da campi che l'utente modifica.
-- `aliquota_iva` e' memorizzata invece di essere ricavata da iva/imponibile:
-- il rapporto fra due importi gia' arrotondati non ridarebbe sempre l'aliquota
-- digitata, e riaprire una vendita mostrerebbe 22,01 al posto di 22.
ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS anonima            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sezione_anonima_id uuid REFERENCES sezioni_anonime(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS canale             text,
  ADD COLUMN IF NOT EXISTS aliquota_iva       numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_commesse_anonima
  ON commesse(organization_id, anonima);
CREATE INDEX IF NOT EXISTS idx_commesse_sezione_anonima
  ON commesse(sezione_anonima_id);
```

- [ ] **Step 2: Applicare la migration**

Il server MCP Supabase non è connesso in questa sessione. Applicare in uno dei due modi:
- Dashboard Supabase (progetto `xawyrtqclpeylxnhwhwo`) → SQL Editor → incollare il file → Run
- oppure `npx supabase db push` se la CLI è collegata al progetto

- [ ] **Step 3: Verificare che le colonne esistano**

Nel SQL Editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'commesse'
  AND column_name IN ('anonima', 'sezione_anonima_id', 'canale', 'aliquota_iva')
ORDER BY column_name;
```

Atteso: 4 righe. `anonima` → `boolean`, `NO`, `false`.

```sql
SELECT COUNT(*) FROM sezioni_anonime;
```

Atteso: `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260831120000_commesse_anonime.sql
git commit -m "feat(commesse): tabella sezioni_anonime e colonne per le vendite online"
```

---

### Task 2: Tipi

**Files:**
- Modify: `types/commessa.ts` (in fondo al file, dopo `OpzioneCommessa`)
- Modify: `types/commessa.ts` — il tipo `Commessa`

- [ ] **Step 1: Aggiungere i 4 campi al tipo `Commessa`**

In `types/commessa.ts`, dentro `export type Commessa = { … }`, subito dopo la riga `in_calcoli: boolean`, inserire:

```ts
  // Vendite online (e-commerce, eBay): commessa contabile senza lavorazione.
  // Vedi types SezioneAnonima / VenditaAnonima piu' sotto.
  anonima: boolean
  sezione_anonima_id: string | null
  canale: string | null
  aliquota_iva: number | null
```

- [ ] **Step 2: Aggiungere i tipi delle vendite anonime**

In fondo a `types/commessa.ts`:

```ts
// ── Commesse anonime: vendite e-commerce ed eBay ─────────────────────────────
// Sono ricavi a tutti gli effetti ma non sono lavori: nessuna scheda in
// produzione, nessun appuntamento, nessun saldo residuo. Tecnicamente ognuna e'
// una riga di `commesse` con `anonima = true` piu' il suo unico acconto.

export type CanaleVendita = 'ebay' | 'ecommerce' | 'altro'

export const CANALI_VENDITA: { value: CanaleVendita; label: string }[] = [
  { value: 'ebay', label: 'eBay' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'altro', label: 'Altro' },
]

/** Raccoglitore di vendite dentro un blocco anno. Creato a richiesta. */
export type SezioneAnonima = {
  id: string
  organization_id: string
  gruppo_id: string
  nome: string
  ordine: number
  created_at: string
  updated_at: string
}

/** Una vendita come la legge l'interfaccia: i due record gia' ricomposti. */
export type VenditaAnonima = {
  id: string // id della commessa sottostante
  sezione_id: string
  data: string // 'YYYY-MM-DD'
  descrizione: string
  canale: CanaleVendita
  metodo_pagamento: MetodoPagamento
  lordo: number
  aliquota_iva: number
  imponibile: number
  iva: number
  materiale: number
  manodopera: number
  utile: number
}

export type SezioneConVendite = SezioneAnonima & { vendite: VenditaAnonima[] }

export type VenditaAnonimaInput = {
  sezione_id: string
  data: string
  descrizione: string
  canale: CanaleVendita
  metodo_pagamento: MetodoPagamento
  lordo: number
  aliquota_iva: number
  materiale: number
  manodopera: number
}
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore nuovo su `types/commessa.ts`. Possono comparire errori altrove se altri file costruiscono oggetti `Commessa` completi — il Task 3 e i successivi li sistemano; se `npx tsc --noEmit` segnala `Commessa` incompleta in `components/commesse/TabellaCommesse.tsx` (funzione `pendingToCommessa`), aggiungere lì i quattro campi:

```ts
    anonima: false,
    sezione_anonima_id: null,
    canale: null,
    aliquota_iva: null,
```

- [ ] **Step 4: Commit**

```bash
git add types/commessa.ts components/commesse/TabellaCommesse.tsx
git commit -m "feat(commesse): tipi delle vendite anonime"
```

---

### Task 3: Logica pura dei calcoli (TDD)

**Files:**
- Create: `lib/vendite-anonime.ts`
- Test: `lib/vendite-anonime.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

Creare `lib/vendite-anonime.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  ALIQUOTA_IVA_DEFAULT,
  scorporaIva,
  calcolaUtile,
  margine,
  totaliVendite,
} from './vendite-anonime'

describe('scorporaIva', () => {
  it('scorpora il 22% da un lordo tondo', () => {
    expect(scorporaIva(244, 22)).toEqual({ imponibile: 200, iva: 44 })
  })

  it('la somma di imponibile e IVA ridà sempre il lordo esatto', () => {
    for (const lordo of [100, 33.33, 1, 0.01, 9999.99]) {
      const { imponibile, iva } = scorporaIva(lordo, 22)
      expect(imponibile + iva).toBeCloseTo(lordo, 2)
    }
  })

  it('con aliquota 0 il lordo e l’imponibile coincidono', () => {
    expect(scorporaIva(150, 0)).toEqual({ imponibile: 150, iva: 0 })
  })

  it('con importo 0 non divide per zero', () => {
    expect(scorporaIva(0, 22)).toEqual({ imponibile: 0, iva: 0 })
  })

  it('l’aliquota di default è 22', () => {
    expect(ALIQUOTA_IVA_DEFAULT).toBe(22)
  })
})

describe('calcolaUtile', () => {
  it('sottrae i costi dall’imponibile', () => {
    expect(calcolaUtile(200, 80, 30)).toBe(90)
  })

  it('può essere negativo: una vendita in perdita resta in perdita', () => {
    expect(calcolaUtile(100, 80, 40)).toBe(-20)
  })

  it('arrotonda a due decimali', () => {
    expect(calcolaUtile(81.97, 20.005, 0)).toBe(61.97)
  })
})

describe('margine', () => {
  it('è la percentuale dell’utile sull’imponibile', () => {
    expect(margine(200, 90)).toBe(45)
  })

  it('è 0 quando non c’è imponibile, senza dividere per zero', () => {
    expect(margine(0, 50)).toBe(0)
  })

  it('segue l’utile in negativo', () => {
    expect(margine(100, -20)).toBe(-20)
  })
})

describe('totaliVendite', () => {
  const vendite = [
    { lordo: 244, imponibile: 200, materiale: 80, manodopera: 30, utile: 90 },
    { lordo: 122, imponibile: 100, materiale: 40, manodopera: 10, utile: 50 },
  ]

  it('somma riga per riga', () => {
    expect(totaliVendite(vendite)).toEqual({
      numero: 2,
      lordo: 366,
      imponibile: 300,
      materiale: 120,
      manodopera: 40,
      utile: 140,
      margine: 46.67,
    })
  })

  it('su un elenco vuoto restituisce zeri, non NaN', () => {
    expect(totaliVendite([])).toEqual({
      numero: 0, lordo: 0, imponibile: 0,
      materiale: 0, manodopera: 0, utile: 0, margine: 0,
    })
  })

  it('calcola il margine sui totali, non come media dei margini di riga', () => {
    const t = totaliVendite([
      { lordo: 1220, imponibile: 1000, materiale: 900, manodopera: 0, utile: 100 },
      { lordo: 12.2, imponibile: 10, materiale: 1, manodopera: 0, utile: 9 },
    ])
    expect(t.margine).toBe(10.79)
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run lib/vendite-anonime.test.ts`
Expected: FAIL — `Failed to resolve import "./vendite-anonime"`.

- [ ] **Step 3: Scrivere l'implementazione**

Creare `lib/vendite-anonime.ts`:

```ts
/**
 * Calcoli delle vendite anonime (e-commerce, eBay).
 *
 * Unica fonte di verita' dei numeri: la usano il dialog di inserimento per il
 * riepilogo dal vivo e la server action per decidere cosa scrivere in `commesse`.
 * Nessuna dipendenza React ne' Supabase, cosi' resta verificabile da sola.
 */

/** Aliquota IVA precompilata nel dialog, in punti percentuali. */
export const ALIQUOTA_IVA_DEFAULT = 22

/** Arrotondamento a due decimali, come tutti gli importi del gestionale. */
function euro(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type ScorporoIva = { imponibile: number; iva: number }

/**
 * Scorpora l'IVA da un importo lordo.
 *
 * L'IVA e' la differenza fra lordo e imponibile, non un secondo arrotondamento
 * calcolato a parte: cosi' `imponibile + iva` ridà sempre il lordo esatto, che
 * e' il numero che finisce in `commesse.totale` e nell'acconto. Se i due fossero
 * arrotondati separatamente, la somma potrebbe scostarsi di un centesimo e il
 * saldo della commessa non sarebbe piu' zero.
 */
export function scorporaIva(lordo: number, aliquota: number): ScorporoIva {
  if (!Number.isFinite(lordo) || !Number.isFinite(aliquota) || aliquota <= 0) {
    return { imponibile: euro(lordo || 0), iva: 0 }
  }
  const imponibile = euro(lordo / (1 + aliquota / 100))
  return { imponibile, iva: euro(lordo - imponibile) }
}

/** Utile della vendita: imponibile meno i costi. Puo' essere negativo. */
export function calcolaUtile(
  imponibile: number,
  materiale: number,
  manodopera: number,
): number {
  return euro(imponibile - (materiale || 0) - (manodopera || 0))
}

/** Margine percentuale sull'imponibile. Zero quando non c'e' imponibile. */
export function margine(imponibile: number, utile: number): number {
  if (!imponibile) return 0
  return euro((utile / imponibile) * 100)
}

/**
 * Forma minima di una riga sommabile. Non e' `VenditaAnonima` di proposito:
 * qui servono solo gli importi, e tenerla strutturale lascia questo file senza
 * dipendenze dai tipi del dominio.
 */
export type RigaTotalizzabile = {
  lordo: number
  imponibile: number
  materiale: number
  manodopera: number
  utile: number
}

export type TotaliVendite = {
  numero: number
  lordo: number
  imponibile: number
  materiale: number
  manodopera: number
  utile: number
  margine: number
}

/**
 * Somma un elenco di vendite.
 *
 * Il margine si calcola sui totali e non come media dei margini di riga:
 * altrimenti una vendita da 10 euro peserebbe quanto una da 1000.
 */
export function totaliVendite(vendite: readonly RigaTotalizzabile[]): TotaliVendite {
  const t = vendite.reduce(
    (acc, v) => ({
      numero: acc.numero + 1,
      lordo: acc.lordo + (v.lordo || 0),
      imponibile: acc.imponibile + (v.imponibile || 0),
      materiale: acc.materiale + (v.materiale || 0),
      manodopera: acc.manodopera + (v.manodopera || 0),
      utile: acc.utile + (v.utile || 0),
    }),
    { numero: 0, lordo: 0, imponibile: 0, materiale: 0, manodopera: 0, utile: 0 },
  )
  const imponibile = euro(t.imponibile)
  const utile = euro(t.utile)
  return {
    numero: t.numero,
    lordo: euro(t.lordo),
    imponibile,
    materiale: euro(t.materiale),
    manodopera: euro(t.manodopera),
    utile,
    margine: margine(imponibile, utile),
  }
}
```

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run lib/vendite-anonime.test.ts`
Expected: PASS — 14 test passati, 0 falliti.

- [ ] **Step 5: Commit**

```bash
git add lib/vendite-anonime.ts lib/vendite-anonime.test.ts
git commit -m "feat(commesse): scorporo IVA, utile e totali delle vendite anonime"
```

---

### Task 4: Server actions

**Files:**
- Create: `actions/vendite-anonime.ts`

- [ ] **Step 1: Scrivere il file completo**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import { scorporaIva, calcolaUtile } from '@/lib/vendite-anonime'
import type {
  CanaleVendita,
  MetodoPagamento,
  SezioneAnonima,
  SezioneConVendite,
  VenditaAnonima,
  VenditaAnonimaInput,
} from '@/types/commessa'

/** Colonne di `commesse` che compongono una vendita anonima. */
const COLONNE_VENDITA =
  'id, sezione_anonima_id, data_conferma, note, canale, totale, imponibile, ' +
  'iva_totale, aliquota_iva, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale'

/**
 * Sezione dell'organizzazione corrente, o errore.
 *
 * Serve anche il `gruppo_id` e il `nome`: la vendita eredita il blocco della
 * sezione e ci scrive dentro il nome come `cliente_nome`, cosi' una riga che
 * sfuggisse a un filtro si riconosce a colpo d'occhio invece di apparire senza
 * intestatario.
 */
async function sezionePropria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sezioneId: string,
  orgId: string,
): Promise<SezioneAnonima> {
  const { data, error } = await supabase
    .from('sezioni_anonime')
    .select('*')
    .eq('id', sezioneId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Sezione non trovata')
  return data as SezioneAnonima
}

/** Sezioni di un blocco con dentro le loro vendite, dalla piu' recente. */
export async function getSezioniAnonime(gruppoId: string): Promise<SezioneConVendite[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: sezioni, error } = await supabase
    .from('sezioni_anonime')
    .select('*')
    .eq('organization_id', orgId)
    .eq('gruppo_id', gruppoId)
    .order('ordine', { ascending: true })
  if (error) throw new Error(error.message)
  if (!sezioni || sezioni.length === 0) return []

  const idsSezioni = sezioni.map((s) => s.id)

  // selectAll: le vendite online sono tante per definizione e PostgREST
  // troncherebbe la lettura a 1000 righe senza dire nulla.
  const righe = await selectAll((da, a) =>
    supabase
      .from('commesse')
      .select(COLONNE_VENDITA)
      .eq('organization_id', orgId)
      .eq('anonima', true)
      .in('sezione_anonima_id', idsSezioni)
      .order('id')
      .range(da, a),
  )

  // Il metodo di pagamento sta sull'acconto, non sulla commessa.
  const idsCommesse = righe.map((r) => r.id)
  const acconti =
    idsCommesse.length === 0
      ? []
      : await selectAll((da, a) =>
          supabase
            .from('acconti_commessa')
            .select('commessa_id, metodo_pagamento')
            .eq('organization_id', orgId)
            .in('commessa_id', idsCommesse)
            .order('id')
            .range(da, a),
        )
  const metodoDi = new Map<string, MetodoPagamento>()
  for (const a of acconti) metodoDi.set(a.commessa_id, a.metodo_pagamento as MetodoPagamento)

  const perSezione = new Map<string, VenditaAnonima[]>()
  for (const r of righe) {
    if (!r.sezione_anonima_id) continue
    const lista = perSezione.get(r.sezione_anonima_id) ?? []
    lista.push({
      id: r.id,
      sezione_id: r.sezione_anonima_id,
      data: r.data_conferma,
      descrizione: r.note ?? '',
      canale: (r.canale ?? 'altro') as CanaleVendita,
      metodo_pagamento: metodoDi.get(r.id) ?? 'altro',
      lordo: Number(r.totale) || 0,
      aliquota_iva: Number(r.aliquota_iva) || 0,
      imponibile: Number(r.imponibile) || 0,
      iva: Number(r.iva_totale) || 0,
      materiale: Number(r.costo_materiali_manuale) || 0,
      manodopera: Number(r.costo_manodopera_manuale) || 0,
      utile: Number(r.utile_manuale) || 0,
    })
    perSezione.set(r.sezione_anonima_id, lista)
  }

  return sezioni.map((s) => ({
    ...(s as SezioneAnonima),
    vendite: (perSezione.get(s.id) ?? []).sort((a, b) => b.data.localeCompare(a.data)),
  }))
}

export async function createSezioneAnonima(gruppoId: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { count } = await supabase
    .from('sezioni_anonime')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('gruppo_id', gruppoId)

  const { error } = await supabase.from('sezioni_anonime').insert({
    organization_id: orgId,
    gruppo_id: gruppoId,
    nome,
    ordine: count ?? 0,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/**
 * Rinomina la sezione e riallinea il `cliente_nome` delle sue vendite: quel
 * campo e' una copia del nome, e lasciarlo indietro renderebbe irriconoscibili
 * le righe gia' registrate.
 */
export async function renameSezioneAnonima(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('sezioni_anonime')
    .update({ nome, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  const { error: errCommesse } = await supabase
    .from('commesse')
    .update({ cliente_nome: nome })
    .eq('organization_id', orgId)
    .eq('sezione_anonima_id', id)
  if (errCommesse) throw new Error(errCommesse.message)

  revalidatePath('/commesse', 'layout')
}

export async function deleteSezioneAnonima(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // La FK e' ON DELETE CASCADE: senza questo controllo un clic distratto
  // porterebbe via mesi di incassi senza chiedere niente.
  const { count } = await supabase
    .from('commesse')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('sezione_anonima_id', id)
  if ((count ?? 0) > 0)
    throw new Error('La sezione contiene vendite. Eliminale prima di eliminare la sezione.')

  const { error } = await supabase
    .from('sezioni_anonime')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function createVenditaAnonima(input: VenditaAnonimaInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const sezione = await sezionePropria(supabase, input.sezione_id, orgId)

  const { imponibile, iva } = scorporaIva(input.lordo, input.aliquota_iva)
  const utile = calcolaUtile(imponibile, input.materiale, input.manodopera)

  const { data: commessa, error } = await supabase
    .from('commesse')
    .insert({
      organization_id: orgId,
      gruppo_id: sezione.gruppo_id,
      anonima: true,
      sezione_anonima_id: sezione.id,
      canale: input.canale,
      cliente_nome: sezione.nome,
      note: input.descrizione,
      data_conferma: input.data,
      totale: input.lordo,
      imponibile,
      iva_totale: iva,
      aliquota_iva: input.aliquota_iva,
      costo_materiali_manuale: input.materiale,
      costo_manodopera_manuale: input.manodopera,
      // Scritto in colonna perche' e' da li' che il grafico costi/utile lo legge.
      // Ricalcolato a ogni salvataggio: non e' un campo che l'utente puo' forzare.
      utile_manuale: utile,
      stato: 'concluso',
      numero_commessa: '',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const { error: errAcconto } = await supabase.from('acconti_commessa').insert({
    commessa_id: commessa.id,
    organization_id: orgId,
    importo: input.lordo,
    data_pagamento: input.data,
    metodo_pagamento: input.metodo_pagamento,
  })
  if (errAcconto) {
    // PostgREST non da' transazioni: se l'incasso non entra, la vendita non puo'
    // restare a meta'. Senza acconto risulterebbe un credito aperto per l'intero
    // importo, e sporcherebbe il riepilogo crediti/debiti.
    await supabase.from('commesse').delete().eq('id', commessa.id).eq('organization_id', orgId)
    throw new Error(errAcconto.message)
  }

  revalidatePath('/commesse', 'layout')
}

export async function updateVenditaAnonima(
  id: string,
  input: VenditaAnonimaInput,
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const sezione = await sezionePropria(supabase, input.sezione_id, orgId)

  const { imponibile, iva } = scorporaIva(input.lordo, input.aliquota_iva)
  const utile = calcolaUtile(imponibile, input.materiale, input.manodopera)

  const { error } = await supabase
    .from('commesse')
    .update({
      canale: input.canale,
      cliente_nome: sezione.nome,
      note: input.descrizione,
      data_conferma: input.data,
      totale: input.lordo,
      imponibile,
      iva_totale: iva,
      aliquota_iva: input.aliquota_iva,
      costo_materiali_manuale: input.materiale,
      costo_manodopera_manuale: input.manodopera,
      utile_manuale: utile,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('anonima', true)
  if (error) throw new Error(error.message)

  // La vendita ha un solo acconto: si aggiorna, non si ricrea, altrimenti
  // cambierebbe id e gli anticipi che lo avessero agganciato lo perderebbero.
  const { error: errAcconto } = await supabase
    .from('acconti_commessa')
    .update({
      importo: input.lordo,
      data_pagamento: input.data,
      metodo_pagamento: input.metodo_pagamento,
    })
    .eq('commessa_id', id)
    .eq('organization_id', orgId)
  if (errAcconto) throw new Error(errAcconto.message)

  revalidatePath('/commesse', 'layout')
}

export async function deleteVenditaAnonima(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // `anonima = true` nel filtro: questa action non deve poter cancellare
  // una commessa vera nemmeno ricevendo un id sbagliato.
  const { error } = await supabase
    .from('commesse')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('anonima', true)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}
```

- [ ] **Step 2: Verificare tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add actions/vendite-anonime.ts
git commit -m "feat(commesse): server action per sezioni e vendite anonime"
```

---

### Task 5: Dialog della sezione

**Files:**
- Create: `components/commesse/DialogSezioneAnonima.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createSezioneAnonima, renameSezioneAnonima } from '@/actions/vendite-anonime'
import type { SezioneAnonima } from '@/types/commessa'

interface Props {
  gruppoId: string
  /** null = creazione di una sezione nuova */
  sezione: SezioneAnonima | null
  onClose: () => void
}

/**
 * Il componente si monta e si smonta a ogni apertura (il genitore lo rende solo
 * quando serve): lo stato del form parte pulito senza un useEffect che lo azzeri.
 */
export default function DialogSezioneAnonima({ gruppoId, sezione, onClose }: Props) {
  const router = useRouter()
  const [nome, setNome] = useState(sezione?.nome ?? '')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const pulito = nome.trim()
    if (!pulito) {
      toast.error('Scrivi un nome per la sezione')
      return
    }
    setLoading(true)
    try {
      if (sezione) await renameSezioneAnonima(sezione.id, pulito)
      else await createSezioneAnonima(gruppoId, pulito)
      toast.success(sezione ? 'Sezione rinominata' : 'Sezione creata')
      onClose()
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {sezione ? 'Rinomina sezione' : 'Nuova sezione commesse anonime'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sez-nome">Nome</Label>
            <Input
              id="sez-nome"
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              placeholder="eBay, Sito, Fiere..."
            />
            <p className="text-xs text-gray-500">
              Le vendite di questa sezione risulteranno intestate a questo nome.
            </p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : sezione ? 'Rinomina' : 'Crea sezione'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificare tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/DialogSezioneAnonima.tsx
git commit -m "feat(commesse): dialog per creare e rinominare una sezione anonima"
```

---

### Task 6: Dialog della vendita

**Files:**
- Create: `components/commesse/DialogVenditaAnonima.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createVenditaAnonima, updateVenditaAnonima } from '@/actions/vendite-anonime'
import {
  ALIQUOTA_IVA_DEFAULT,
  calcolaUtile,
  margine,
  scorporaIva,
} from '@/lib/vendite-anonime'
import { formatEuro } from '@/lib/pricing'
import { CANALI_VENDITA } from '@/types/commessa'
import type {
  CanaleVendita,
  MetodoPagamento,
  VenditaAnonima,
  VenditaAnonimaInput,
} from '@/types/commessa'

const METODI: { value: MetodoPagamento; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti' },
  { value: 'riba', label: 'Ri.Ba.' },
  { value: 'altro', label: 'Altro' },
]

const oggi = () => new Date().toISOString().split('T')[0]

interface Props {
  sezioneId: string
  /** null = nuova vendita */
  vendita: VenditaAnonima | null
  onClose: () => void
}

/** Montato solo quando serve: lo stato parte dai valori giusti senza useEffect. */
export default function DialogVenditaAnonima({ sezioneId, vendita, onClose }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<VenditaAnonimaInput>(() =>
    vendita
      ? {
          sezione_id: vendita.sezione_id,
          data: vendita.data,
          descrizione: vendita.descrizione,
          canale: vendita.canale,
          metodo_pagamento: vendita.metodo_pagamento,
          lordo: vendita.lordo,
          aliquota_iva: vendita.aliquota_iva,
          materiale: vendita.materiale,
          manodopera: vendita.manodopera,
        }
      : {
          sezione_id: sezioneId,
          data: oggi(),
          descrizione: '',
          canale: 'ebay',
          metodo_pagamento: 'bonifico',
          lordo: 0,
          aliquota_iva: ALIQUOTA_IVA_DEFAULT,
          materiale: 0,
          manodopera: 0,
        },
  )
  const [loading, setLoading] = useState(false)

  // Calcolati in render: sono funzioni pure sugli stessi valori del form,
  // tenerli in stato vorrebbe dire doverli risincronizzare a ogni tasto.
  const { imponibile, iva } = scorporaIva(form.lordo, form.aliquota_iva)
  const utile = calcolaUtile(imponibile, form.materiale, form.manodopera)
  const perc = margine(imponibile, utile)

  const numero = (k: 'lordo' | 'aliquota_iva' | 'materiale' | 'manodopera') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.data) {
      toast.error('Inserisci la data della vendita')
      return
    }
    if (form.lordo <= 0) {
      toast.error('Inserisci un importo incassato valido')
      return
    }
    if (form.materiale < 0 || form.manodopera < 0 || form.aliquota_iva < 0) {
      toast.error('Costi e aliquota non possono essere negativi')
      return
    }
    setLoading(true)
    try {
      if (vendita) await updateVenditaAnonima(vendita.id, form)
      else await createVenditaAnonima(form)
      toast.success(vendita ? 'Vendita aggiornata' : 'Vendita registrata')
      onClose()
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md xl:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendita ? 'Modifica vendita' : 'Nuova vendita'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ven-data">Data *</Label>
              <Input
                id="ven-data"
                type="date"
                value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ven-lordo">Incassato (€) *</Label>
              <Input
                id="ven-lordo"
                type="number"
                step="0.01"
                min="0.01"
                value={form.lordo || ''}
                onChange={numero('lordo')}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ven-descrizione">Descrizione</Label>
            <Input
              id="ven-descrizione"
              value={form.descrizione}
              onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
              placeholder="Maniglione + serratura, ordine #1042..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Canale</Label>
              <Select
                value={form.canale}
                onValueChange={(v) => setForm((f) => ({ ...f, canale: v as CanaleVendita }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANALI_VENDITA.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Metodo di pagamento</Label>
              <Select
                value={form.metodo_pagamento}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, metodo_pagamento: v as MetodoPagamento }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODI.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ven-iva">IVA (%)</Label>
              <Input
                id="ven-iva"
                type="number"
                step="0.01"
                min="0"
                value={form.aliquota_iva || ''}
                onChange={numero('aliquota_iva')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ven-materiale">Materiale (€)</Label>
              <Input
                id="ven-materiale"
                type="number"
                step="0.01"
                min="0"
                value={form.materiale || ''}
                onChange={numero('materiale')}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ven-manodopera">Manodopera (€)</Label>
              <Input
                id="ven-manodopera"
                type="number"
                step="0.01"
                min="0"
                value={form.manodopera || ''}
                onChange={numero('manodopera')}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Riepilogo dal vivo: l'utile si vede prima di salvare, mai si digita */}
          <div className="rounded-md border bg-gray-50 p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Imponibile</span>
              <span className="font-medium text-gray-800">{formatEuro(imponibile)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IVA</span>
              <span className="font-medium text-gray-800">{formatEuro(iva)}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="font-semibold text-gray-700">Utile</span>
              <span className={`font-bold ${utile < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {formatEuro(utile)}
                <span className="ml-1 text-xs font-medium text-gray-500">
                  ({perc.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)
                </span>
              </span>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : vendita ? 'Salva modifiche' : 'Registra vendita'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificare tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/DialogVenditaAnonima.tsx
git commit -m "feat(commesse): dialog vendita anonima con scorporo IVA e utile dal vivo"
```

---

### Task 7: Riquadro della sezione e contenitore

**Files:**
- Create: `components/commesse/SezioneAnonimaCard.tsx`
- Create: `components/commesse/SezioniAnonime.tsx`

- [ ] **Step 1: Scrivere `SezioneAnonimaCard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { totaliVendite } from '@/lib/vendite-anonime'
import { formatEuro } from '@/lib/pricing'
import { CANALI_VENDITA } from '@/types/commessa'
import type { SezioneConVendite, VenditaAnonima } from '@/types/commessa'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const LABEL_CANALE = new Map(CANALI_VENDITA.map((c) => [c.value, c.label]))

const formatData = (d: string) => {
  const [y, m, g] = d.split('-').map(Number)
  return new Date(y, m - 1, g).toLocaleDateString('it-IT')
}

/**
 * Raggruppa per anno-mese e ordina dal piu' recente. La chiave porta l'anno
 * perche' il nome del blocco non garantisce che le date stiano tutte li' dentro.
 */
function raggruppaPerMese(vendite: VenditaAnonima[]) {
  const gruppi = new Map<string, VenditaAnonima[]>()
  for (const v of vendite) {
    const chiave = v.data.slice(0, 7) // 'YYYY-MM'
    const lista = gruppi.get(chiave) ?? []
    lista.push(v)
    gruppi.set(chiave, lista)
  }
  return [...gruppi.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([chiave, righe]) => ({
      chiave,
      etichetta: `${MESI[Number(chiave.slice(5, 7)) - 1]} ${chiave.slice(0, 4)}`,
      righe,
    }))
}

interface Props {
  sezione: SezioneConVendite
  onRinomina: () => void
  onElimina: () => void
  onNuovaVendita: () => void
  onModificaVendita: (v: VenditaAnonima) => void
  onEliminaVendita: (v: VenditaAnonima) => void
}

export default function SezioneAnonimaCard({
  sezione, onRinomina, onElimina, onNuovaVendita, onModificaVendita, onEliminaVendita,
}: Props) {
  // Di default tutti i mesi chiusi: con centinaia di vendite la sezione deve
  // restare leggibile a colpo d'occhio.
  const [aperti, setAperti] = useState<Set<string>>(() => new Set())
  const toggle = (k: string) =>
    setAperti((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })

  const tot = totaliVendite(sezione.vendite)
  const mesi = raggruppaPerMese(sezione.vendite)

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">{sezione.nome}</h3>
            <p className="text-xs text-gray-500">
              {tot.numero} {tot.numero === 1 ? 'vendita' : 'vendite'} · commesse anonime
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 text-indigo-700" onClick={onNuovaVendita}>
              <Plus className="h-4 w-4 mr-1" />
              Nuova vendita
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onRinomina}>Rinomina</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={tot.numero > 0}
                  className="text-red-600 focus:text-red-600 disabled:opacity-40"
                  onClick={onElimina}
                >
                  Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Totali della sezione */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <Totale etichetta="Incassato" valore={formatEuro(tot.lordo)} />
          <Totale etichetta="Imponibile" valore={formatEuro(tot.imponibile)} />
          <Totale etichetta="Materiale" valore={formatEuro(tot.materiale)} />
          <Totale etichetta="Manodopera" valore={formatEuro(tot.manodopera)} />
          <Totale
            etichetta={`Utile (${tot.margine.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)`}
            valore={formatEuro(tot.utile)}
            classe={tot.utile < 0 ? 'text-rose-600' : 'text-emerald-700'}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {mesi.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Nessuna vendita registrata in questa sezione.
          </p>
        ) : (
          mesi.map((m) => {
            const totMese = totaliVendite(m.righe)
            const aperto = aperti.has(m.chiave)
            return (
              <div key={m.chiave} className="rounded-md border bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(m.chiave)}
                  className="w-full flex items-center gap-2 px-2 sm:px-3 py-2 bg-gray-50/70 border-b text-left"
                >
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform ${aperto ? '' : '-rotate-90'}`}
                  />
                  <h4 className="text-sm font-semibold text-gray-700">{m.etichetta}</h4>
                  <Badge variant="secondary" className="text-[10px]">{totMese.numero}</Badge>
                  <span className="text-xs truncate ml-auto">
                    <span className="text-gray-600 font-medium">{formatEuro(totMese.lordo)}</span>
                    <span className={`font-medium ${totMese.utile < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {' · '}{formatEuro(totMese.utile)} di utile
                    </span>
                  </span>
                </button>

                {aperto && (
                  <div className="divide-y">
                    {m.righe.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 px-2 sm:px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {v.descrizione || '(senza descrizione)'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatData(v.data)} · {LABEL_CANALE.get(v.canale) ?? v.canale}
                            {' · '}
                            {v.metodo_pagamento}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-gray-900">{formatEuro(v.lordo)}</p>
                          <p className="text-xs text-gray-500">
                            mat. {formatEuro(v.materiale)} · mano. {formatEuro(v.manodopera)}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-bold w-24 text-right shrink-0 ${
                            v.utile < 0 ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {formatEuro(v.utile)}
                        </p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onModificaVendita(v)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifica
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => onEliminaVendita(v)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function Totale({
  etichetta, valore, classe = 'text-gray-900',
}: { etichetta: string; valore: string; classe?: string }) {
  return (
    <div className="rounded-md bg-white border px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{etichetta}</p>
      <p className={`text-sm font-bold ${classe}`}>{valore}</p>
    </div>
  )
}
```

- [ ] **Step 2: Scrivere `SezioniAnonime.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteSezioneAnonima, deleteVenditaAnonima } from '@/actions/vendite-anonime'
import { formatEuro } from '@/lib/pricing'
import SezioneAnonimaCard from './SezioneAnonimaCard'
import DialogSezioneAnonima from './DialogSezioneAnonima'
import DialogVenditaAnonima from './DialogVenditaAnonima'
import type { SezioneAnonima, SezioneConVendite, VenditaAnonima } from '@/types/commessa'

interface Props {
  gruppoId: string
  sezioni: SezioneConVendite[]
}

/**
 * Le vendite online (e-commerce, eBay) di un blocco anno.
 *
 * Il riquadro esiste solo se l'utente ha creato almeno una sezione: negli anni
 * senza vendite online la pagina resta identica a prima, senza contenitori vuoti.
 */
export default function SezioniAnonime({ gruppoId, sezioni }: Props) {
  const router = useRouter()
  // I dialoghi sono montati solo quando servono: si aprono con lo stato giusto
  // senza un useEffect che lo reimposti a ogni apertura.
  const [dialogSezione, setDialogSezione] = useState<{ sezione: SezioneAnonima | null } | null>(null)
  const [dialogVendita, setDialogVendita] =
    useState<{ sezioneId: string; vendita: VenditaAnonima | null } | null>(null)
  const [sezioneDaEliminare, setSezioneDaEliminare] = useState<SezioneConVendite | null>(null)
  const [venditaDaEliminare, setVenditaDaEliminare] = useState<VenditaAnonima | null>(null)

  const confermaEliminaSezione = async () => {
    if (!sezioneDaEliminare) return
    try {
      await deleteSezioneAnonima(sezioneDaEliminare.id)
      toast.success('Sezione eliminata')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSezioneDaEliminare(null)
    }
  }

  const confermaEliminaVendita = async () => {
    if (!venditaDaEliminare) return
    try {
      await deleteVenditaAnonima(venditaDaEliminare.id)
      toast.success('Vendita eliminata')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setVenditaDaEliminare(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-indigo-700 flex items-center gap-2 uppercase tracking-wide">
          <ShoppingCart className="h-4 w-4" />
          Commesse anonime
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-indigo-700"
          onClick={() => setDialogSezione({ sezione: null })}
        >
          <Plus className="h-4 w-4 mr-1" />
          Commesse anonime
        </Button>
      </div>

      {sezioni.map((s) => (
        <SezioneAnonimaCard
          key={s.id}
          sezione={s}
          onRinomina={() => setDialogSezione({ sezione: s })}
          onElimina={() => setSezioneDaEliminare(s)}
          onNuovaVendita={() => setDialogVendita({ sezioneId: s.id, vendita: null })}
          onModificaVendita={(v) => setDialogVendita({ sezioneId: s.id, vendita: v })}
          onEliminaVendita={(v) => setVenditaDaEliminare(v)}
        />
      ))}

      {dialogSezione && (
        <DialogSezioneAnonima
          gruppoId={gruppoId}
          sezione={dialogSezione.sezione}
          onClose={() => setDialogSezione(null)}
        />
      )}

      {dialogVendita && (
        <DialogVenditaAnonima
          sezioneId={dialogVendita.sezioneId}
          vendita={dialogVendita.vendita}
          onClose={() => setDialogVendita(null)}
        />
      )}

      <AlertDialog
        open={sezioneDaEliminare !== null}
        onOpenChange={(v) => { if (!v) setSezioneDaEliminare(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la sezione?</AlertDialogTitle>
            <AlertDialogDescription>
              «{sezioneDaEliminare?.nome}» verrà eliminata. L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confermaEliminaSezione}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={venditaDaEliminare !== null}
        onOpenChange={(v) => { if (!v) setVenditaDaEliminare(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la vendita?</AlertDialogTitle>
            <AlertDialogDescription>
              {venditaDaEliminare
                ? `${venditaDaEliminare.descrizione || 'Vendita'} da ${formatEuro(venditaDaEliminare.lordo)}: l'incasso uscirà da fatturato e flusso di cassa.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confermaEliminaVendita}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Verificare tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/commesse/SezioneAnonimaCard.tsx components/commesse/SezioniAnonime.tsx
git commit -m "feat(commesse): riquadro delle sezioni anonime con totali e mesi"
```

---

### Task 8: Montaggio nella pagina del blocco

**Files:**
- Modify: `app/(dashboard)/commesse/[id]/page.tsx`

- [ ] **Step 1: Aggiungere gli import**

Dopo `import TabellaCommesse from '@/components/commesse/TabellaCommesse'`:

```ts
import SezioniAnonime from '@/components/commesse/SezioniAnonime'
import { getSezioniAnonime } from '@/actions/vendite-anonime'
```

- [ ] **Step 2: Caricare le sezioni e montare il componente**

Nella funzione `CommesseTable`, sostituire il blocco `const [commesse, …] = await Promise.all([…])` e il `return` con:

```tsx
  const [commesse, preventivi, utenti, clienti, gruppi, sezioniAnonime] = await Promise.all([
    getCommesse(gruppoId),
    getPreventiviPerCommessa(),
    getUtentiPerCommessa(),
    getClienti(),
    getGruppiCommesse(),
    getSezioniAnonime(gruppoId),
  ])

  let preventivoDaConvertire: PreventivoPerCommessa | null = null
  if (from) {
    preventivoDaConvertire = preventivi.find((p) => p.id === from) ?? null
  }

  return (
    <div className="space-y-5">
      {/* Vendite online: in cima, sopra le commesse vere */}
      <SezioniAnonime gruppoId={gruppoId} sezioni={sezioniAnonime} />
      <TabellaCommesse
        commesse={commesse}
        preventivi={preventivi}
        utenti={utenti}
        clienti={clienti}
        preventivoDaConvertire={preventivoDaConvertire}
        gruppi={gruppi}
        gruppoCorrenteId={gruppoId}
        highlightId={highlight ?? null}
      />
    </div>
  )
```

- [ ] **Step 3: Verificare tipi, lint e avvio**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run dev`, aprire un blocco anno da `/commesse`.
Expected: sopra la tabella compare l'intestazione "COMMESSE ANONIME" con il pulsante `+ Commesse anonime`; nessun riquadro finché non se ne crea una.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/commesse/[id]/page.tsx"
git commit -m "feat(commesse): sezioni anonime in cima al blocco anno"
```

---

### Task 9: Filtri di esclusione

Le vendite anonime devono restare fuori da produzione, calendario, tabella commesse, anticipi bancari e feed della dashboard. **Non** vanno toccate le letture per `id` (`produzione.ts` righe ~169 e ~308, `banche.ts` riga ~455): risolvono etichette per record già selezionati.

**Files:**
- Modify: `actions/commesse.ts`
- Modify: `actions/produzione.ts`
- Modify: `actions/banche.ts`
- Modify: `actions/calendario.ts`
- Modify: `actions/dashboard.ts`

- [ ] **Step 1: `actions/commesse.ts` — le due letture di elenco**

In `getCommesse(gruppoId)`, sulla query `.from('commesse')`, aggiungere il filtro dopo `.eq('gruppo_id', gruppoId)`:

```ts
    supabase
      .from('commesse')
      .select('*')
      .eq('organization_id', orgId)
      .eq('gruppo_id', gruppoId)
      // Le vendite anonime hanno il loro riquadro in cima alla pagina: qui
      // sotto ci vanno solo le commesse vere.
      .eq('anonima', false)
      .order('ordine', { ascending: true }),
```

In `getAllCommesse()`, sulla query `.from('commesse')`, aggiungere dopo `.eq('organization_id', orgId)`:

```ts
      // Alimenta la cache offline e lo slot Calcoli: le vendite anonime sono
      // gia' saldate e non servono a nessuna delle due.
      .eq('anonima', false)
```

- [ ] **Step 2: `actions/produzione.ts` — le due letture di elenco**

In `getCommessePerOrdine()` (~riga 129), dopo `.eq('organization_id', orgId)`:

```ts
    // Una vendita online non si ordina a un fornitore: non ha lavorazione.
    .eq('anonima', false)
```

Nella query dell'elenco produzione (~riga 199, quella con `.eq('archiviata', archiviate)`), dopo `.eq('organization_id', orgId)`:

```ts
    // Commesse solo contabili: nessuna scheda in produzione.
    .eq('anonima', false)
```

- [ ] **Step 3: `actions/banche.ts` — anticipi fattura**

In `getCommessePerAnticipo()` (~riga 296), sulla query `.from('commesse')`, dopo `.eq('organization_id', orgId)`:

```ts
      // Saldo zero per costruzione: non c'e' niente da anticipare.
      .eq('anonima', false)
```

Nella funzione che elenca gli acconti selezionabili (~riga 344), la query `.from('acconti_commessa')` va limitata agli acconti di commesse non anonime. La query `.from('commesse')` accanto già filtra per `.in('id', ids)`: aggiungerle `.eq('anonima', false)` e poi scartare gli acconti rimasti orfani. Concretamente, sulla query `.from('commesse')`:

```ts
    supabase
      .from('commesse')
      .select('id, numero_commessa, cliente_nome')
      .eq('organization_id', orgId)
      // La banca non anticipa una vendita eBay gia' incassata.
      .eq('anonima', false)
      .in('id', ids),
```

Con quel filtro la mappa `etichetta` non contiene piu' le commesse anonime, quindi
in fondo alla stessa funzione (`getAccontiPerCommesse`) il `return` va cambiato per
scartare gli acconti rimasti senza etichetta:

```ts
  return (acconti ?? [])
    // Un acconto senza etichetta appartiene a una vendita anonima, tolta sopra:
    // la banca non rientra su un incasso che non ha mai anticipato.
    .filter((a) => etichetta.has(a.commessa_id))
    .map((a) => ({
      id: a.id,
      commessa_id: a.commessa_id,
      etichettaCommessa: etichetta.get(a.commessa_id) ?? '',
      importo: Number(a.importo) || 0,
      data_pagamento: a.data_pagamento,
      metodo_pagamento: a.metodo_pagamento ?? '',
      anticipo_id: assegnati.get(a.id) ?? null,
    }))
```

- [ ] **Step 4: `actions/calendario.ts` — commesse aperte**

In `getCommesseAperte()` (~riga 441), dopo `.eq('organization_id', orgId)`:

```ts
    // Cintura di sicurezza: le anonime nascono 'concluso' e sono gia' fuori da
    // STATI_COMMESSA_PRODUZIONE, ma lo stato e' un campo che si puo' cambiare.
    .eq('anonima', false)
```

- [ ] **Step 5: `actions/dashboard.ts` — i due feed di attività recente**

Nella query `.from('commesse')` del feed (~riga 101), dopo `.eq('organization_id', orgId)`:

```ts
      // Solo il feed: i totali della dashboard devono continuare a comprendere
      // le vendite online. Qui sommergerebbero le dieci righe disponibili.
      .eq('anonima', false)
```

Nella query `.from('acconti_commessa')` subito sotto, cambiare la select in join interno e filtrare sulla commessa:

```ts
    supabase
      .from('acconti_commessa')
      .select('id, importo, created_at, commesse!inner(id, cliente_nome, anonima)')
      .eq('organization_id', orgId)
      .eq('commesse.anonima', false)
      .order('created_at', { ascending: false })
      .limit(10),
```

- [ ] **Step 6: Verificare tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Il join `commesse!inner(...)` puo' far dedurre a Supabase un array al posto di un
oggetto singolo nel punto in cui il feed legge la commessa dell'acconto. Se `tsc`
segnala l'accesso a `a.commesse.cliente_nome`, normalizzare la lettura senza
cambiare la logica del feed:

```ts
    const commessa = Array.isArray(a.commesse) ? a.commesse[0] : a.commesse
```

e usare `commessa?.cliente_nome` e `commessa?.id` dove prima si leggeva `a.commesse`.

- [ ] **Step 7: Commit**

```bash
git add actions/commesse.ts actions/produzione.ts actions/banche.ts actions/calendario.ts actions/dashboard.ts
git commit -m "feat(commesse): escludere le vendite anonime da produzione, calendario, anticipi e feed"
```

---

### Task 10: Correzioni nelle statistiche (TDD)

Tre funzioni pure ragionano "per commessa vera" e vanno insegnate a saltare le anonime, altrimenti gonfiano un indicatore e riempiono il selettore clienti.

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Test: `lib/statistiche-commesse.test.ts`
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

- [ ] **Step 1: Scrivere i test che falliscono**

Il file importa già `resocontoCliente`, `clientiUnici` e `type StatRow`; aggiungere
`contaCommesseSenzaPreventivo` all'import in testa:

```ts
import {
  aggregaFlussoMese,
  aggregaUscitePerCategoria,
  contaCommesseSenzaPreventivo,
  riepilogoCreditiDebiti,
  resocontoCliente,
  clientiUnici,
```

Poi, in fondo al file, aggiungere:

```ts
describe('vendite anonime fuori dalle statistiche per commessa', () => {
  const commessaVera = {
    id: 'c1', cliente_nome: 'Rossi Mario', totale: 1000,
    data_conferma: '2026-03-10', blocco: '2026', stato: 'concluso', anonima: false,
  }
  const venditaAnonima = {
    id: 'a1', cliente_nome: 'eBay', totale: 244,
    data_conferma: '2026-03-11', blocco: '2026', stato: 'concluso', anonima: true,
  }

  it('non conta le anonime fra le commesse senza preventivo', () => {
    expect(contaCommesseSenzaPreventivo([commessaVera, venditaAnonima], [], '2026')).toBe(1)
  })

  it('non mette le sezioni anonime fra i clienti', () => {
    expect(clientiUnici([commessaVera, venditaAnonima])).toEqual(['Rossi Mario'])
  })

  it('non attribuisce a un cliente il fatturato delle anonime omonime', () => {
    const { totale } = resocontoCliente(
      [commessaVera, { ...venditaAnonima, cliente_nome: 'Rossi Mario' }],
      [],
      'Rossi Mario',
    )
    expect(totale.numero).toBe(1)
    expect(totale.fatturato).toBe(1000)
  })
})
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — tutti e tre i test nuovi falliscono sulle asserzioni: `2` invece di
`1` commesse senza preventivo, `['Rossi Mario', 'eBay']` invece di `['Rossi Mario']`,
fatturato `1244` invece di `1000`. Gli altri test del file continuano a passare.

- [ ] **Step 3: Aggiornare `lib/statistiche-commesse.ts`**

In `StatRow`, aggiungere il campo. È **opzionale**: la pagina Statistiche, unico
punto che costruisce `StatRow` dai dati veri, lo valorizza sempre, mentre le sette
fixture di test esistenti restano valide senza doverle riscrivere tutte per un
campo che per loro è sempre `false`.

```ts
export type StatRow = {
  id: string
  cliente_nome: string
  totale: number
  data_conferma: string | null
  blocco: string | null // nome del blocco/gruppo commesse di appartenenza
  stato: string         // stato commessa: decide se il residuo è un credito (STATI_CREDITO)
  // Vendita e-commerce/eBay: entra nei totali economici ma non nelle letture
  // "per commessa vera" (preventivi mancanti, clienti, resoconto). Assente = commessa vera.
  anonima?: boolean
}
```

In `contaCommesseSenzaPreventivo`, cambiare il conteggio del blocco:

```ts
  // Le anonime non hanno preventivo per definizione: contarle qui direbbe che
  // mancano decine di preventivi che nessuno ha mai dovuto fare.
  const totBlocco = commesse.filter((c) => c.blocco === anno && !c.anonima).length
```

In `clientiUnici`, saltarle in cima al ciclo:

```ts
  for (const c of commesse) {
    // Il nome di una vendita anonima e' quello della sezione ("eBay"), non un cliente
    if (c.anonima) continue
    const nome = (c.cliente_nome ?? '').trim()
```

In `resocontoCliente`, la selezione delle commesse del cliente diventa:

```ts
  const target = chiaveCliente(cliente)
  // Le anonime portano il nome della sezione ("eBay"): se coincidesse con quello
  // di un cliente vero, gli attribuirebbero fatturato che non e' suo.
  const commesseCliente = commesse.filter(
    (c) => !c.anonima && chiaveCliente(c.cliente_nome ?? '') === target,
  )
```

- [ ] **Step 4: Eseguire i test per vederli passare**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: PASS, compresi i tre test nuovi.

- [ ] **Step 5: Alimentare il campo dalla pagina**

In `app/(dashboard)/commesse/statistiche/page.tsx`, nella `select` della prima query (riga ~29), aggiungere `anonima` all'elenco delle colonne:

```ts
        .select('id, numero_commessa, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id, stato, anonima, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale')
```

e nella costruzione di `commesse: StatRow[]` (riga ~119), aggiungere il campo dopo `stato`:

```ts
    stato: c.stato ?? '',
    anonima: Boolean(c.anonima),
  }))
```

- [ ] **Step 6: Verificare tutta la suite, tipi e lint**

Run: `npm test && npx tsc --noEmit`
Expected: tutti i test passano (i 357 esistenti più i nuovi), nessun errore di tipo.

- [ ] **Step 7: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts "app/(dashboard)/commesse/statistiche/page.tsx"
git commit -m "fix(statistiche): le vendite anonime fuori da preventivi mancanti, clienti e resoconto"
```

---

### Task 11: Verifica end-to-end

**Files:** nessuno da modificare — è il collaudo.

- [ ] **Step 1: Suite completa e build**

Run: `npm test`
Expected: tutti i file di test passano.

Run: `npm run lint`
Expected: **1743 problemi (35 errori, 1708 warning)** — lo stesso baseline pre-esistente.
Un numero piu' alto significa che questa funzione ne ha aggiunti: cercare i problemi
sui file nuovi (`lib/vendite-anonime.ts`, `actions/vendite-anonime.ts`, i tre
componenti) e sui file modificati, e correggere solo quelli.

Run: `npm run build`
Expected: build completata. Se fallisce per `RESEND_API_KEY` mancante, è un problema pre-esistente: impostare una chiave fittizia in `.env.local` e ripetere.

- [ ] **Step 2: Prova manuale — registrazione**

Run: `npm run dev`

1. `/commesse` → aprire il blocco dell'anno corrente
2. `+ Commesse anonime` → creare la sezione "eBay"
3. `Nuova vendita` → data di oggi, descrizione "Maniglione", canale eBay, bonifico, incassato `244`, IVA `22`, materiale `80`, manodopera `30`
4. Nel riepilogo del dialog devono comparire imponibile `€ 200,00`, IVA `€ 44,00`, utile `€ 90,00 (45%)`
5. Salvare: la riga compare nel mese corrente; i totali della sezione dicono incassato `€ 244,00`, utile `€ 90,00`

- [ ] **Step 3: Prova manuale — inclusioni**

- `/commesse` → il totale della card del blocco è aumentato di `€ 244,00`
- `/commesse/statistiche` → fatturato del mese aumentato di `€ 244,00`; flusso di cassa del mese con `€ 244,00` in entrata; grafico costi/utile con `+80` materiali, `+30` posa, `+90` utile
- `/commesse/statistiche` → il selettore clienti **non** contiene "eBay"; il conteggio "commesse senza preventivo" **non** è cresciuto

- [ ] **Step 4: Prova manuale — esclusioni**

- La tabella commesse sotto la sezione **non** contiene la vendita
- `/produzione` → la vendita non compare, né fra le card né nella scelta commessa di un ordine fornitore
- Calendario → la vendita non compare fra le commesse aperte
- Fidi bancari → creando un anticipo, la vendita non è fra le commesse né il suo incasso fra gli acconti selezionabili
- Dashboard → i feed "ultime commesse" e "ultimi acconti" non la mostrano

- [ ] **Step 5: Prova manuale — modifica ed eliminazione**

- Modificare la vendita portando l'incassato a `366`: i totali della sezione e il fatturato si aggiornano di conseguenza
- Provare a eliminare la sezione con la vendita dentro: deve comparire l'errore "La sezione contiene vendite…"
- Eliminare la vendita, poi la sezione: entrambe spariscono e i totali tornano ai valori di partenza

- [ ] **Step 6: Commit finale e chiusura del branch**

```bash
git add -A
git commit -m "test(commesse): verifica end-to-end delle vendite anonime"
git checkout master
git merge --ff-only feat/commesse-anonime
git push origin master
git branch -d feat/commesse-anonime
git push origin --delete feat/commesse-anonime 2>/dev/null || true
```

---

## Scostamenti dallo spec

Uno solo, già riportato nello spec: alle tre colonne previste su `commesse` se ne aggiunge una quarta, `aliquota_iva numeric(5,2)`. Ricavare l'aliquota da `iva_totale / imponibile` non ridà sempre il numero digitato — i due importi sono già arrotondati — e riaprire una vendita mostrerebbe `22,01` al posto di `22`.

## Cosa resta fuori

Import CSV da eBay o dall'e-commerce, riconciliazione col conto corrente, inserimento inline stile foglio di calcolo, allegati per riga, riordino delle sezioni via drag-and-drop. Nessuno di questi serve al primo rilascio.

Non ci sono test di componente: la suite del progetto (`vitest.config.ts`, `include: ['lib/**/*.test.ts']`, `environment: 'node'`) copre solo la logica pura, ed è lì che stanno i calcoli. Introdurre jsdom e testing-library per questa funzione sarebbe un cambio di infrastruttura fuori perimetro.
