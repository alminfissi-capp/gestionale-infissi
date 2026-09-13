# Commessa inesigibile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una spunta `inesigibile` sulla commessa che toglie dai conti il credito residuo e l'utile stimato, lasciando contati i costi sostenuti e il fatturato.

**Architecture:** Una colonna booleana su `commesse` viaggia come campo opzionale dentro i tipi riga già esistenti (`StatRow`, `CostoCommessaRow`, `CommessaAndamento`); quattro funzioni pure di `lib/` la leggono per escludere credito e utile; la tabella commesse la mostra come spunta nella colonna Stato e colora la riga di viola.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + RLS), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-commessa-inesigibile-design.md`

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260913100000_commesse_inesigibile.sql` (nuovo) | La colonna. |
| `types/commessa.ts` (modifica) | `inesigibile: boolean` su `Commessa`. |
| `actions/commesse.ts` (modifica) | `toggleInesigibile`. |
| `lib/statistiche-commesse.ts` (modifica) | Campo sui tipi riga; esclusione in crediti, costi/utili, resoconto cliente. |
| `lib/andamento-crediti-debiti.ts` (modifica) | Campo su `CommessaAndamento`; esclusione dalla linea crediti. |
| `app/(dashboard)/commesse/statistiche/page.tsx` (modifica) | Porta la colonna dentro le tre strutture. |
| `components/commesse/TabellaCommesse.tsx` (modifica) | Spunta nella colonna Stato, colore riga viola. |
| `lib/statistiche-commesse.test.ts`, `lib/andamento-crediti-debiti.test.ts` (modifica) | I casi nuovi. |

**Prima di iniziare — crea il ramo:**

```bash
git checkout master
git pull
git checkout -b feat/commessa-inesigibile
```

Tutti i commit vanno su `feat/commessa-inesigibile`; il Task 9 lo unisce a `master` e lo cancella.

**Comandi di verifica** (dalla root del progetto):

```bash
npx vitest run lib/statistiche-commesse.test.ts lib/andamento-crediti-debiti.test.ts
npm test          # tutta la suite
npm run lint      # deve restare a zero
npx tsc --noEmit  # deve restare pulito
```

---

### Task 1: La colonna sul database

**Files:**
- Create: `supabase/migrations/20260913100000_commesse_inesigibile.sql`
- Modify: `types/commessa.ts`

- [ ] **Step 1: Scrivi la migrazione**

Crea `supabase/migrations/20260913100000_commesse_inesigibile.sql`:

```sql
-- Commessa inesigibile: consegnata, ma il saldo non verra' mai incassato.
-- I costi sostenuti restano contati; il credito residuo e l'utile stimato no.
--
-- E' una colonna a se' e NON un decimo valore di `stato`: lo stato di lavorazione
-- ("Consegnato") e l'esigibilita' del credito sono due fatti indipendenti, e cosi'
-- il CHECK su commesse.stato resta intatto.
ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS inesigibile BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN commesse.inesigibile IS
  'Credito che non verra' incassato: esclude il residuo dai crediti e l''utile dai costi stimati.';
```

- [ ] **Step 2: Applica la migrazione al progetto Supabase**

Applicala con lo strumento di migrazione Supabase (MCP `apply_migration`, nome
`commesse_inesigibile`) oppure incollandone il contenuto nell'SQL editor del
progetto `xawyrtqclpeylxnhwhwo`.

- [ ] **Step 3: Verifica che la colonna esista**

Esegui questa query sul database:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'commesse' AND column_name = 'inesigibile';
```

Expected: una riga — `inesigibile | boolean | NO | false`

- [ ] **Step 4: Aggiungi il campo al tipo**

In `types/commessa.ts`, dentro `export type Commessa = {`, subito dopo la riga
`in_calcoli: boolean`:

```ts
  /** Credito che non verrà incassato: niente residuo fra i crediti, niente utile fra i costi stimati. */
  inesigibile: boolean
```

- [ ] **Step 5: Verifica i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260913100000_commesse_inesigibile.sql types/commessa.ts
git commit -m "feat(commesse): colonna inesigibile"
```

---

### Task 2: Il residuo esce dai crediti

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Test: `lib/statistiche-commesse.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `lib/statistiche-commesse.test.ts`, dentro il `describe` che contiene il test
`'tiene fuori dai crediti gli stati che non sono in STATI_CREDITO'`, aggiungi
subito dopo quel test:

```ts
  it('una commessa inesigibile non porta credito, nemmeno col residuo pieno', () => {
    const commesse: StatRow[] = [
      { id: 'i1', cliente_nome: 'Rossi', totale: 18400, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato', inesigibile: true },
    ]
    const acconti: AccontoRow[] = [{ commessa_id: 'i1', importo: 5000, data_pagamento: '2026-02-01' }]
    const r = riepilogoCreditiDebiti(commesse, acconti, [], [], [], OGGI, nessunaBanca)
    expect(r.creditiCommesse).toBe(0)
    expect(r.creditiPerStato).toEqual([])
  })

  it('la spunta vale sulla singola commessa, non su tutto il suo stato', () => {
    const commesse: StatRow[] = [
      { id: 'i2', cliente_nome: 'Rossi', totale: 1000, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato', inesigibile: true },
      { id: 'i3', cliente_nome: 'Verdi', totale: 700, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato' },
    ]
    const r = riepilogoCreditiDebiti(commesse, [], [], [], [], OGGI, nessunaBanca)
    expect(r.creditiCommesse).toBe(700)
    expect(r.creditiPerStato).toEqual([
      { stato: 'consegnato', label: 'Consegnato', importo: 700, numero: 1 },
    ])
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — il primo test trova `13400` invece di `0`

- [ ] **Step 3: Aggiungi il campo al tipo riga**

In `lib/statistiche-commesse.ts`, dentro `export type StatRow = {`, subito dopo
il campo `anonima?: boolean` e il suo commento:

```ts
  // Credito che non verrà incassato: il residuo non è più un credito e l'utile
  // stimato non è più un utile. Assente = commessa normale.
  inesigibile?: boolean
```

- [ ] **Step 4: Escludi le inesigibili dai crediti**

Sempre in `lib/statistiche-commesse.ts`, dentro `riepilogoCreditiDebiti`, subito
dopo la riga `if (!SET_STATI_CREDITO.has(c.stato)) continue`:

```ts
    // Marcata inesigibile: il residuo non verrà incassato, quindi non è un credito.
    if (c.inesigibile) continue
```

- [ ] **Step 5: Lancia i test e verifica che passino**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts
git commit -m "feat(statistiche): il residuo inesigibile non conta come credito"
```

---

### Task 3: L'utile stimato va a zero

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Test: `lib/statistiche-commesse.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

In `lib/statistiche-commesse.test.ts`, aggiungi l'import del tipo alla lista
degli import da `@/lib/statistiche-commesse` (accanto a `type StatRow`):

```ts
  aggregaCostiUtiliMese,
  type CostoCommessaRow,
```

Poi aggiungi in fondo al file:

```ts
describe('aggregaCostiUtiliMese — commesse inesigibili', () => {
  it('conta i costi sostenuti ma azzera l utile di una commessa inesigibile', () => {
    const costi: CostoCommessaRow[] = [
      {
        commessa_id: 'i1', blocco: '2026', data_conferma: '2026-04-10',
        materiali: 6000, posa: 2000, spese: 500, utile: 3000, inesigibile: true,
      },
    ]
    const r = aggregaCostiUtiliMese(costi, '2026')
    expect(r[3].materiali).toBe(6000)
    expect(r[3].posa).toBe(2000)
    expect(r[3].spese).toBe(500)
    expect(r[3].costi).toBe(8500)
    expect(r[3].utile).toBe(0)
  })

  it('una commessa normale nello stesso mese tiene il suo utile', () => {
    const costi: CostoCommessaRow[] = [
      {
        commessa_id: 'i1', blocco: '2026', data_conferma: '2026-04-10',
        materiali: 6000, posa: 2000, spese: 500, utile: 3000, inesigibile: true,
      },
      {
        commessa_id: 'n1', blocco: '2026', data_conferma: '2026-04-12',
        materiali: 1000, posa: 300, spese: 0, utile: 700,
      },
    ]
    const r = aggregaCostiUtiliMese(costi, '2026')
    expect(r[3].costi).toBe(9800)
    expect(r[3].utile).toBe(700)
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — `inesigibile` non esiste su `CostoCommessaRow` e l'utile vale `3000`

- [ ] **Step 3: Aggiungi il campo e azzera l'utile**

In `lib/statistiche-commesse.ts`, dentro `export type CostoCommessaRow = {`,
dopo il campo `utile: number`:

```ts
  // Credito che non verrà incassato: i costi restano, l'utile stimato no.
  inesigibile?: boolean
```

Poi, dentro `aggregaCostiUtiliMese`, sostituisci la riga
`out[m].utile += Number(c.utile) || 0` con:

```ts
    // I costi sono stati sostenuti davvero e restano. L'utile invece era il
    // margine su un incasso che non arriverà: sommarlo gonfierebbe il risultato.
    if (!c.inesigibile) out[m].utile += Number(c.utile) || 0
```

- [ ] **Step 4: Lancia i test e verifica che passino**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts
git commit -m "feat(statistiche): l'utile di una commessa inesigibile vale zero"
```

---

### Task 4: Il saldo del resoconto cliente si azzera

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Test: `lib/statistiche-commesse.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `lib/statistiche-commesse.test.ts`, aggiungi in fondo al file:

```ts
describe('resocontoCliente — commesse inesigibili', () => {
  it('tiene fatturato e incassato, azzera il saldo', () => {
    const commesse: StatRow[] = [
      { id: 'r1', cliente_nome: 'Rossi Mario', totale: 18400, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato', inesigibile: true },
    ]
    const acconti: AccontoRow[] = [{ commessa_id: 'r1', importo: 5000, data_pagamento: '2026-02-01' }]
    const r = resocontoCliente(commesse, acconti, 'Rossi Mario')
    expect(r.righe[0].fatturato).toBe(18400)
    expect(r.righe[0].incassato).toBe(5000)
    expect(r.righe[0].saldo).toBe(0)
    expect(r.totale.saldo).toBe(0)
  })

  it('lascia intatto il saldo delle altre commesse dello stesso cliente', () => {
    const commesse: StatRow[] = [
      { id: 'r1', cliente_nome: 'Rossi Mario', totale: 10000, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato', inesigibile: true },
      { id: 'r2', cliente_nome: 'Rossi Mario', totale: 4000, data_conferma: '2026-02-01', blocco: '2026', stato: 'consegnato' },
    ]
    const acconti: AccontoRow[] = [{ commessa_id: 'r2', importo: 1000, data_pagamento: '2026-03-01' }]
    const r = resocontoCliente(commesse, acconti, 'Rossi Mario')
    expect(r.righe[0].fatturato).toBe(14000)
    expect(r.righe[0].incassato).toBe(1000)
    // solo i 3000 residui della commessa normale
    expect(r.righe[0].saldo).toBe(3000)
  })

  it('una inesigibile gia incassata in eccesso non regala saldo negativo', () => {
    const commesse: StatRow[] = [
      { id: 'r3', cliente_nome: 'Verdi', totale: 1000, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato', inesigibile: true },
    ]
    const acconti: AccontoRow[] = [{ commessa_id: 'r3', importo: 1200, data_pagamento: '2026-02-01' }]
    const r = resocontoCliente(commesse, acconti, 'Verdi')
    // residuo negativo: non c'è niente da togliere, il saldo resta quello vero
    expect(r.righe[0].saldo).toBe(-200)
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — il primo test trova `13400` invece di `0`

- [ ] **Step 3: Traccia l'incassato per commessa**

In `lib/statistiche-commesse.ts`, dentro `resocontoCliente`, sostituisci il ciclo
sugli acconti:

```ts
  for (const a of acconti) {
    if (!idsCliente.has(a.commessa_id)) continue
    const blocco = bloccoPerCommessa.get(a.commessa_id)
    if (blocco === undefined) continue
    riga(blocco).incassato += Number(a.importo) || 0
  }
```

con questo, che tiene anche il totale per singola commessa:

```ts
  // Serve anche il dettaglio per commessa, non solo per blocco: il saldo delle
  // inesigibili va tolto una commessa alla volta.
  const incassatoPerCommessa = new Map<string, number>()
  for (const a of acconti) {
    if (!idsCliente.has(a.commessa_id)) continue
    const blocco = bloccoPerCommessa.get(a.commessa_id)
    if (blocco === undefined) continue
    const importo = Number(a.importo) || 0
    riga(blocco).incassato += importo
    incassatoPerCommessa.set(a.commessa_id, (incassatoPerCommessa.get(a.commessa_id) ?? 0) + importo)
  }
```

- [ ] **Step 4: Togli dal saldo il residuo delle inesigibili**

Sempre in `resocontoCliente`, sostituisci la riga
`for (const r of righe) r.saldo = r.fatturato - r.incassato` con:

```ts
  for (const r of righe) r.saldo = r.fatturato - r.incassato

  // Le inesigibili restano nel fatturato e nell'incassato — quei soldi si sono
  // mossi davvero — ma il loro residuo non verrà mai incassato e quindi non è
  // un saldo. Solo il residuo POSITIVO: una commessa incassata in eccesso non
  // ha niente da togliere, e il floor a zero è lo stesso di riepilogoCreditiDebiti.
  for (const c of commesseCliente) {
    if (!c.inesigibile) continue
    const blocco = bloccoPerCommessa.get(c.id)
    if (blocco === undefined) continue
    const r = perBlocco.get(blocco)
    if (!r) continue
    const residuo = (Number(c.totale) || 0) - (incassatoPerCommessa.get(c.id) ?? 0)
    if (residuo > 0) r.saldo -= residuo
  }
```

> Il `totale` sotto si calcola con un `reduce` sulle righe, quindi si aggiorna da
> solo: non va toccato.

- [ ] **Step 5: Lancia i test e verifica che passino**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts
git commit -m "feat(statistiche): il resoconto cliente azzera il saldo inesigibile"
```

---

### Task 5: Fuori dalla linea storica dei crediti

**Files:**
- Modify: `lib/andamento-crediti-debiti.ts`
- Test: `lib/andamento-crediti-debiti.test.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

In `lib/andamento-crediti-debiti.test.ts`, aggiungi in fondo al file:

```ts
describe('creditiAllaData — commesse inesigibili', () => {
  const dati: DatiAndamento = {
    ...VUOTI,
    commesse: [
      { id: 'i1', totale: 18400, data_conferma: '2026-03-10', stato: 'consegnato', inesigibile: true },
      { id: 'n1', totale: 1000, data_conferma: '2026-03-10', stato: 'consegnato' },
    ],
    acconti: [{ commessa_id: 'i1', importo: 5000, data_pagamento: '2026-04-05' }],
  }

  it('la inesigibile non entra nella linea dei crediti in nessun punto', () => {
    // esce da tutta la serie, non dal giorno della spunta: la storia degli
    // stati non viene conservata e vale la stessa imprecisione dichiarata
    expect(creditiAllaData(dati, '2026-03-10')).toBe(1000)
    expect(creditiAllaData(dati, '2026-04-06')).toBe(1000)
    expect(creditiAllaData(dati, '2026-12-31')).toBe(1000)
  })

  it('senza la spunta quella stessa commessa conterebbe', () => {
    const senza: DatiAndamento = {
      ...dati,
      commesse: dati.commesse.map((c) => ({ ...c, inesigibile: false })),
    }
    expect(creditiAllaData(senza, '2026-03-10')).toBe(19400)
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `npx vitest run lib/andamento-crediti-debiti.test.ts`
Expected: FAIL — `inesigibile` non esiste su `CommessaAndamento`

- [ ] **Step 3: Aggiungi il campo e salta le inesigibili**

In `lib/andamento-crediti-debiti.ts`, dentro `export type CommessaAndamento = {`,
dopo `stato: string`:

```ts
  // Credito che non verrà incassato: fuori dalla linea dei crediti, come uno
  // stato fuori da STATI_CREDITO.
  inesigibile?: boolean
```

Poi, dentro `creditiAllaData`, subito dopo
`if (!SET_STATI_CREDITO.has(c.stato)) continue`:

```ts
    if (c.inesigibile) continue
```

- [ ] **Step 4: Lancia i test e verifica che passino**

Run: `npx vitest run lib/andamento-crediti-debiti.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/andamento-crediti-debiti.ts lib/andamento-crediti-debiti.test.ts
git commit -m "feat(statistiche): le inesigibili fuori dalla linea storica dei crediti"
```

---

### Task 6: Il dato arriva alla pagina statistiche

**Files:**
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

- [ ] **Step 1: Aggiungi la colonna alla query**

Nella `select` della tabella `commesse`, aggiungi `inesigibile` in fondo
all'elenco dei campi:

```ts
        .select('id, numero_commessa, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id, stato, anonima, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale, inesigibile')
```

- [ ] **Step 2: Portala dentro `StatRow`**

Nella costruzione di `const commesse: StatRow[] = commesseValide.map(...)`, dopo
la riga `anonima: Boolean(c.anonima),`:

```ts
    inesigibile: Boolean(c.inesigibile),
```

- [ ] **Step 3: Portala dentro `CostoCommessaRow`**

Nel ciclo che costruisce `costiCommesse`, dentro l'oggetto passato a
`costiCommesse.push({ ... })`, dopo la riga `utile: sys.utile + man.utile,`:

```ts
      inesigibile: info.inesigibile,
```

> `info` è la `StatRow` recuperata da `commessaInfo.get(id)` poche righe sopra,
> quindi il campo c'è già grazie allo Step 2.

- [ ] **Step 4: Portala dentro `datiAndamento`**

Dentro `const datiAndamento: DatiAndamento = {`, nella `map` che costruisce
`commesse`, dopo la riga `stato: c.stato ?? '',`:

```ts
      inesigibile: Boolean(c.inesigibile),
```

- [ ] **Step 5: Verifica tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun output

Run: `npm run lint`
Expected: nessun output

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/commesse/statistiche/page.tsx"
git commit -m "feat(statistiche): porta il flag inesigibile nelle tre strutture"
```

---

### Task 7: La spunta nella tabella commesse

**Files:**
- Modify: `actions/commesse.ts`
- Modify: `components/commesse/TabellaCommesse.tsx`

- [ ] **Step 1: Scrivi la Server Action**

In `actions/commesse.ts`, subito dopo la funzione `toggleCalcoli`:

```ts
/**
 * Marca una commessa come inesigibile: consegnata, ma il saldo non verrà incassato.
 * I costi restano contati; il residuo esce dai crediti e l'utile dai costi stimati.
 */
export async function toggleInesigibile(commessaId: string, value: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commesse')
    .update({ inesigibile: value })
    .eq('id', commessaId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}
```

- [ ] **Step 2: Importa l'azione nel componente**

In `components/commesse/TabellaCommesse.tsx`, alla riga dell'import da
`@/actions/commesse`, aggiungi `toggleInesigibile` in fondo alla lista:

```ts
import { deleteCommessa, duplicaCommessa, updateOrdineCommesse, updateStatoCommessa, spostaCommessa, toggleCalcoli, toggleInesigibile } from '@/actions/commesse'
```

- [ ] **Step 3: Fai vincere il viola sul colore dello stato**

Sostituisci la funzione `statoRowClass` con questa, che prende la commessa
intera invece del solo stato:

```ts
// Il viola dell'inesigibile vince sul colore dello stato: la riga deve dire
// prima di tutto che quei soldi non arriveranno.
function rigaClass(c: { stato: StatoCommessa; inesigibile?: boolean }): string {
  if (c.inesigibile)          return 'bg-violet-50'
  if (c.stato === 'concluso') return 'bg-sky-50'
  if (c.stato === 'bloccato') return 'bg-orange-50'
  if (c.stato === 'annullato') return 'bg-red-50'
  if (c.stato === 'in_attesa') return ''
  return 'bg-yellow-50'
}
```

Poi, nel `className` di `<TableRow>`, sostituisci
`` `${statoRowClass(c.stato)} transition-colors duration-1000` `` con:

```tsx
            : `${rigaClass(c)} transition-colors duration-1000`
```

- [ ] **Step 4: Aggiungi la prop alla riga**

In `interface RowProps`, dopo la riga `onToggleCalcoli: () => void`:

```ts
  onToggleInesigibile: () => void
```

E nella firma di `SortableRow`, aggiungi `onToggleInesigibile` fra i parametri
destrutturati, subito dopo `onToggleCalcoli`:

```tsx
function SortableRow({ c, preventiviById, onScheda, onDelete, onDuplica, onAcconto, onDocumenti, onPrevManuale, onStatoChange, altriGruppi, onSposta, highlighted, onToggleCalcoli, onToggleInesigibile, puoAprireProduzione }: RowProps) {
```

- [ ] **Step 5: Disegna la spunta sotto la tendina dello stato**

Nella cella `{/* Stato */}`, subito dopo il `</DropdownMenu>` che chiude la
tendina e prima del `</TableCell>`:

```tsx
        <label
          className="mt-1 flex cursor-pointer items-center gap-1 text-[10px] text-gray-500 hover:text-violet-700"
          title="Il saldo di questa commessa non verrà incassato: esce dai crediti e dall'utile stimato"
        >
          <input
            type="checkbox"
            checked={!!c.inesigibile}
            onChange={onToggleInesigibile}
            className="h-3 w-3 accent-violet-600"
          />
          inesigibile
        </label>
```

- [ ] **Step 6: Scrivi il gestore ottimistico**

Subito dopo `handleToggleCalcoli`, aggiungi:

```tsx
  // Spunta "inesigibile" — aggiornamento ottimistico con revert in caso di errore,
  // come la stellina dei Calcoli.
  const handleToggleInesigibile = async (id: string, value: boolean) => {
    setItems((prev) => prev.map((c) => c.id === id ? { ...c, inesigibile: value } : c))
    try {
      await toggleInesigibile(id, value)
      router.refresh()
    } catch {
      setItems((prev) => prev.map((c) => c.id === id ? { ...c, inesigibile: !value } : c))
      toast.error('Errore nel salvataggio')
    }
  }
```

- [ ] **Step 7: Collega il gestore alla riga**

Dove la riga viene resa, subito dopo
`onToggleCalcoli={() => handleToggleCalcoli(c.id, !c.in_calcoli)}`:

```tsx
                      onToggleInesigibile={() => handleToggleInesigibile(c.id, !c.inesigibile)}
```

- [ ] **Step 8: Dai un valore alle commesse offline**

In `pendingToCommessa`, dopo la riga `in_calcoli: false,`:

```ts
    inesigibile: false,
```

- [ ] **Step 9: Verifica tipi e lint**

Run: `npx tsc --noEmit`
Expected: nessun output

Run: `npm run lint`
Expected: nessun output

- [ ] **Step 10: Commit**

```bash
git add actions/commesse.ts components/commesse/TabellaCommesse.tsx
git commit -m "feat(commesse): spunta inesigibile e riga viola in tabella"
```

---

### Task 8: Verifica finale

**Files:** nessuno da modificare, salvo correzioni emerse qui.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS su tutti i file, con i 9 test nuovi (2 crediti + 2 costi/utili + 3 resoconto cliente + 2 andamento storico)

- [ ] **Step 2: Lint e tipi**

Run: `npm run lint`
Expected: nessun output

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 3: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori.

> Se si ferma per `RESEND_API_KEY` mancante è un problema preesistente, non di
> questo lavoro: rilancia con una chiave fittizia in `.env.local`.

- [ ] **Step 4: Verifica visiva**

Run: `npm run dev`, poi apri `http://localhost:3000/commesse`.

Controlla:
- sotto il badge dello stato di ogni riga c'è la spunta `inesigibile`;
- spuntandola la riga diventa viola chiaro e il colore vince su quello dello
  stato (provala su una commessa "Conclusa", che è azzurra);
- togliendo la spunta la riga torna al colore di prima;
- ricaricando la pagina la spunta è ancora lì (è salvata, non solo a schermo).

Poi apri `http://localhost:3000/commesse/statistiche` con quella commessa
spuntata e verifica che:
- in "Crediti e debiti" il totale "Da commesse" sia calato del suo residuo;
- in "Costi e utili stimati" l'utile sia calato ma i costi no;
- in "Resoconto per cliente", cercando quel cliente, fatturato e incassato siano
  invariati e il saldo sia sceso;
- in "Andamento commesse" il totale dell'anno NON sia cambiato.

- [ ] **Step 5: Rimetti la commessa com'era**

Se hai spuntato una commessa solo per provare, togli la spunta: i dati sono
quelli di produzione.

- [ ] **Step 6: Commit di eventuali correzioni**

```bash
git add -A
git commit -m "fix(commesse): correzioni dalla verifica dell'inesigibile"
```

(Salta questo passo se non c'è niente da correggere.)

---

### Task 9: Memoria, PRD e chiusura del ramo

**Files:**
- Create: `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\project_commessa_inesigibile.md`
- Modify: `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\MEMORY.md`
- Modify: `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\PRD.md`

- [ ] **Step 1: Scrivi la memoria**

Contenuto di `project_commessa_inesigibile.md`:

```markdown
---
name: project-commessa-inesigibile
description: Spunta inesigibile sulla commessa — il credito che non sarà incassato esce da crediti e utile, i costi restano
metadata:
  type: project
---

Colonna `commesse.inesigibile` (2026-09-13): commessa consegnata il cui saldo non
verrà mai incassato. Spunta nella colonna Stato di `TabellaCommesse.tsx`, riga
`bg-violet-50`.

**Why:** una commessa consegnata a un cliente che non pagherà. I costi sono stati
sostenuti davvero, il margine no, e quel residuo non è un credito.

**How to apply:** quattro scelte da non ribaltare.
1. **È una colonna booleana, non un decimo `StatoCommessa`.** Stato di
   lavorazione ed esigibilità sono fatti indipendenti, e così il `CHECK` su
   `commesse.stato` resta intatto. Cercare di trasformarla in uno stato
   romperebbe quel vincolo — vedi [[gotcha-vincoli-db-sconti]].
2. **Cosa esce:** il residuo dai crediti (`riepilogoCreditiDebiti`), dalla linea
   storica (`creditiAllaData`) e dal saldo del resoconto cliente
   (`resocontoCliente`); l'utile da `aggregaCostiUtiliMese`.
3. **Cosa resta:** il fatturato in Andamento commesse, i costi in Costi e utili
   stimati, gli acconti già incassati ovunque. Quello che è entrato è entrato,
   quello che è successo è successo.
4. **Produzione e Calendario non la guardano.** `STATI_COMMESSA_PRODUZIONE` non
   contiene `consegnato`, e una commessa ancora in lavorazione va comunque
   finita: la spunta riguarda i soldi, non la fabbrica.

Nel grafico storico la commessa esce dalla linea crediti **per tutta la serie**,
non dal giorno della spunta: `lib/andamento-crediti-debiti.ts` dichiara già di
usare lo stato attuale e non quello storico. Serviva una `inesigibile_at` e non
vale il prezzo.

Vedi [[project-statistiche-commesse]] e [[project-crediti-debiti-statistiche]].
```

- [ ] **Step 2: Aggiungi il puntatore all'indice**

In `MEMORY.md`, nell'elenco "Documenti chiave", subito dopo la riga del
Resoconto mensile costi:

```markdown
- [Commessa inesigibile](project_commessa_inesigibile.md) — il credito che non incasserai: colonna booleana, non uno stato; 4 scelte da non ribaltare (2026-09-13)
```

- [ ] **Step 3: Aggiungi la voce al PRD**

In `PRD.md`, nella tabella delle funzionalità completate, subito dopo la riga
"Resoconto mensile costi", incolla questa riga:

```markdown
| Commessa inesigibile | — | Il credito che non verrà incassato. Colonna `inesigibile BOOLEAN NOT NULL DEFAULT false` su `commesse` — **una spunta, non un decimo stato**: lo stato di lavorazione e l'esigibilità sono fatti indipendenti, e così il `CHECK` su `commesse.stato` resta intatto. Spunta sotto il badge nella colonna Stato di `TabellaCommesse.tsx`, riga `bg-violet-50` che vince sul colore dello stato, azione `toggleInesigibile` con aggiornamento ottimistico. **Esce**: il residuo dai crediti (`riepilogoCreditiDebiti`), dalla linea storica (`creditiAllaData`) e dal saldo del resoconto cliente (`resocontoCliente`); l'utile da `aggregaCostiUtiliMese`. **Resta**: il fatturato in Andamento commesse, i costi in Costi e utili stimati, gli acconti già incassati ovunque — quello che è entrato è entrato, quello che è successo è successo. Produzione e Calendario non la guardano: la spunta riguarda i soldi, non la fabbrica. Nel grafico storico la commessa esce dalla linea per tutta la serie e non dal giorno della spunta, coerente con l'imprecisione già dichiarata da `lib/andamento-crediti-debiti.ts`. 9 test nuovi. In produzione dal 2026-09-13 |
```

- [ ] **Step 4: Merge, push e pulizia**

```bash
git checkout master
git merge --no-ff feat/commessa-inesigibile -m "merge: commessa inesigibile"
git push origin master
git branch -d feat/commessa-inesigibile
```
