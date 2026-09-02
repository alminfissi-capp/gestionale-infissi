# Condivisione da Android — area Commesse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere all'imbuto di condivisione Android una seconda area, Commesse, che cerca la commessa per cliente, numero preventivo o numero commessa e vi allega il file col tipo scelto.

**Architecture:** Una nuova area = un componente di passi più una riga in `aree.ts`, come prescrive l'invariante 3 di `project-condivisione-android`. La ricerca è una funzione pura in `lib/`, i dati arrivano da una Server Action nuova, il caricamento riusa `lib/upload-documento.ts` senza duplicarlo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, shadcn/ui, Tailwind, Vitest (`npm test`, include `lib/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-02-condivisione-area-commesse-design.md`

**Branch:** `feat/condivisione-area-commesse` (già creato, spec già committata).

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `types/commessa.ts` *(modifica)* | Nuova costante `TIPI_DOCUMENTO_COMMESSA` e tipo `CommessaCondivisione`. |
| `components/commesse/DialogDocumenti.tsx` *(modifica)* | Importa la costante al posto della sua copia locale. |
| `lib/ricerca-commesse.ts` *(nuovo)* | `filtraCommesse`: funzione pura, nessuna dipendenza React o Supabase. |
| `lib/ricerca-commesse.test.ts` *(nuovo)* | Un caso per regola della ricerca. |
| `actions/commesse.ts` *(modifica)* | `getCommessePerCondivisione()`: commesse non anonime + numeri dei preventivi collegati. |
| `components/condivisione/AreaCommesse.tsx` *(nuovo)* | I due passi dell'area. |
| `components/condivisione/aree.ts` *(modifica)* | Una voce in più nell'array. |

---

### Task 1: La ricerca pura

**Files:**
- Create: `lib/ricerca-commesse.ts`
- Test: `lib/ricerca-commesse.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `lib/ricerca-commesse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filtraCommesse, type CommessaRicercabile } from './ricerca-commesse'

const COMMESSE: CommessaRicercabile[] = [
  { numero_commessa: '33-2026', cliente_nome: 'Guarracino Loredana', numeri_preventivo: ['PRE WIN 251/2026 G'] },
  { numero_commessa: '12-2026', cliente_nome: 'Comparato Niño',      numeri_preventivo: ['PRE WIN 174/2026 G', 'PRE WIN 180/2026 G'] },
  { numero_commessa: null,      cliente_nome: 'Rossi Mario',         numeri_preventivo: [] },
]

const numeri = (r: CommessaRicercabile[]) => r.map((c) => c.numero_commessa)

describe('filtraCommesse', () => {
  it('trova per numero commessa', () => {
    expect(numeri(filtraCommesse(COMMESSE, '33-2026'))).toEqual(['33-2026'])
  })

  it('trova per nome cliente, ignorando accenti e maiuscole', () => {
    expect(numeri(filtraCommesse(COMMESSE, 'NINO'))).toEqual(['12-2026'])
  })

  it('trova per il numero di un preventivo secondario, non solo il principale', () => {
    expect(numeri(filtraCommesse(COMMESSE, '180/2026'))).toEqual(['12-2026'])
  })

  // La regola ereditata da lib/ricerca-clienti.ts: ogni parola deve trovare
  // riscontro in almeno un campo, non tutte nello stesso.
  it('accetta parole sparse su campi diversi, in qualunque ordine', () => {
    expect(numeri(filtraCommesse(COMMESSE, 'guarracino 251'))).toEqual(['33-2026'])
    expect(numeri(filtraCommesse(COMMESSE, '251 guarracino'))).toEqual(['33-2026'])
  })

  it('con query vuota o di soli spazi restituisce tutto', () => {
    expect(filtraCommesse(COMMESSE, '')).toHaveLength(3)
    expect(filtraCommesse(COMMESSE, '   ')).toHaveLength(3)
  })

  it('senza riscontro restituisce elenco vuoto', () => {
    expect(filtraCommesse(COMMESSE, 'inesistente')).toEqual([])
  })

  it('regge una commessa senza numero', () => {
    expect(numeri(filtraCommesse(COMMESSE, 'rossi'))).toEqual([null])
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test -- lib/ricerca-commesse.test.ts`
Expected: FAIL — `Failed to resolve import "./ricerca-commesse"`

- [ ] **Step 3: Scrivere l'implementazione**

Crea `lib/ricerca-commesse.ts`:

```ts
import { normalizzaTesto } from '@/lib/ricerca-clienti'

/**
 * Quel poco che serve per cercare una commessa. Volutamente più stretto di
 * `Commessa`: la funzione è pura e va chiamabile anche da un test con tre righe
 * scritte a mano.
 */
export type CommessaRicercabile = {
  numero_commessa: string | null
  cliente_nome: string
  numeri_preventivo: string[]
}

/**
 * Filtra le commesse su numero commessa, nome cliente e numeri dei preventivi
 * collegati.
 *
 * Stessa regola di `lib/ricerca-clienti.ts`, e per lo stesso motivo: la query si
 * spezza in parole e **ogni parola** deve trovare riscontro in almeno un campo,
 * in qualunque ordine. Confrontare la query intera contro un singolo campo
 * fallirebbe su "guarracino 251", che è esattamente come si cerca a mente:
 * un pezzo di cliente e un pezzo di numero.
 */
export function filtraCommesse<T extends CommessaRicercabile>(
  commesse: T[],
  query: string,
): T[] {
  const parole = normalizzaTesto(query).split(' ').filter(Boolean)
  if (parole.length === 0) return commesse

  return commesse.filter((c) => {
    const campi = [
      normalizzaTesto(c.numero_commessa),
      normalizzaTesto(c.cliente_nome),
      ...c.numeri_preventivo.map(normalizzaTesto),
    ].filter(Boolean)
    return parole.every((p) => campi.some((campo) => campo.includes(p)))
  })
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test -- lib/ricerca-commesse.test.ts`
Expected: PASS, 7 test

- [ ] **Step 5: Commit**

```bash
git add lib/ricerca-commesse.ts lib/ricerca-commesse.test.ts
git commit -m "feat(condivisione): ricerca commesse per cliente, numero e preventivi"
```

---

### Task 2: I tipi di documento diventano condivisi

**Files:**
- Modify: `types/commessa.ts`
- Modify: `components/commesse/DialogDocumenti.tsx:29`

- [ ] **Step 1: Aggiungere la costante e il tipo**

In `types/commessa.ts`, subito dopo la costante `REPARTI` (riga ~78), aggiungi:

```ts
/**
 * I tipi di documento del lato Commesse — quelli che NON sono di produzione.
 * I valori sono le stringhe già scritte in `documenti_commessa.tipo_documento`,
 * spazi compresi: cambiarli scollegherebbe i documenti già caricati.
 */
export const TIPI_DOCUMENTO_COMMESSA: { value: string; label: string }[] = [
  { value: 'fattura',         label: 'Fattura' },
  { value: 'nota di credito', label: 'Nota di credito' },
  { value: 'bolla',           label: 'Bolla' },
  { value: 'contratto',       label: 'Contratto' },
  { value: 'altro',           label: 'Altro' },
]

/** Una commessa come la vede l'imbuto di condivisione: giusto quel che serve a cercarla. */
export type CommessaCondivisione = {
  id: string
  numero_commessa: string | null
  numero_preventivo: string | null // il principale, quello mostrato in elenco
  cliente_nome: string
  numeri_preventivo: string[]      // tutti i collegati, solo per la ricerca
}
```

- [ ] **Step 2: Far usare la costante a DialogDocumenti**

In `components/commesse/DialogDocumenti.tsx`, cancella la riga 29:

```ts
const TIPI = ['fattura', 'nota di credito', 'bolla', 'contratto', 'altro']
```

e aggiungi l'import subito sopra quello dei tipi (riga 27):

```ts
import { TIPI_DOCUMENTO_COMMESSA } from '@/types/commessa'
import type { DocumentoCommessa } from '@/types/commessa'
```

Poi l'unico punto d'uso, righe 201-205, che oggi è:

```tsx
                {TIPI.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
```

diventa:

```tsx
                {TIPI_DOCUMENTO_COMMESSA.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
```

- [ ] **Step 3: Verificare che nulla sia cambiato a schermo**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning

A schermo non cambia niente: il codice attuale già maiuscolizza la prima lettera a mano, e le etichette della costante sono le stesse stringhe che ne uscivano. I valori salvati sono identici.

- [ ] **Step 4: Commit**

```bash
git add types/commessa.ts components/commesse/DialogDocumenti.tsx
git commit -m "refactor(commesse): i tipi documento in una costante condivisa"
```

---

### Task 3: La Server Action che alimenta la ricerca

**Files:**
- Modify: `actions/commesse.ts` (in fondo al file)

- [ ] **Step 1: Verificare gli import**

In cima a `actions/commesse.ts` devono esserci `selectAll` e il tipo nuovo. Aggiungi quel che manca:

```ts
import { selectAll } from '@/lib/supabase/paginate'
```

e `CommessaCondivisione` alla lista dei tipi importati da `@/types/commessa`.

- [ ] **Step 2: Aggiungere la Server Action**

In fondo a `actions/commesse.ts`:

```ts
/**
 * Le commesse come le cerca l'imbuto di condivisione da Android.
 *
 * `numeri_preventivo` porta TUTTI i preventivi collegati, non solo il principale:
 * cercando il numero di un preventivo secondario la commessa deve uscire lo stesso.
 * Vale la regola di sempre — la junction `preventivi_commessa` è la sorgente di
 * verità, la vecchia colonna `commesse.preventivo_id` è il ripiego per le commesse
 * create prima che la junction esistesse.
 */
export async function getCommessePerCondivisione(): Promise<CommessaCondivisione[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [commesse, collegati] = await Promise.all([
    // selectAll e non una select secca: oltre le mille righe PostgREST tronca in
    // silenzio e certe commesse diventerebbero introvabili senza un errore.
    selectAll((da, a) => supabase
      .from('commesse')
      .select('id, numero_commessa, numero_preventivo, cliente_nome, data_conferma')
      .eq('organization_id', orgId)
      // Una vendita online non ha preventivo né lavorazione: non si cerca qui.
      .eq('anonima', false)
      .order('id').range(da, a)),
    selectAll((da, a) => supabase
      .from('preventivi_commessa')
      .select('commessa_id, numero_preventivo')
      .eq('organization_id', orgId)
      .order('id').range(da, a)),
  ])

  const perCommessa = new Map<string, Set<string>>()
  for (const r of collegati) {
    if (!r.commessa_id || !r.numero_preventivo) continue
    const set = perCommessa.get(r.commessa_id) ?? new Set<string>()
    set.add(r.numero_preventivo)
    perCommessa.set(r.commessa_id, set)
  }

  // Le più recenti in cima: è quasi sempre lì che si sta lavorando. Si ordina
  // prima di mappare, così `data_conferma` non deve entrare nel tipo esposto per
  // poi esserne tolta.
  const ordinate = [...commesse].sort(
    (a, b) => String(b.data_conferma ?? '').localeCompare(String(a.data_conferma ?? '')),
  )

  return ordinate.map((c) => {
    const dallaJunction = perCommessa.get(c.id)
    // Ripiego sulla vecchia colonna solo se la junction non sa niente di questa commessa.
    const numeri = dallaJunction && dallaJunction.size > 0
      ? [...dallaJunction]
      : c.numero_preventivo ? [c.numero_preventivo] : []
    return {
      id: c.id,
      numero_commessa: c.numero_commessa,
      numero_preventivo: c.numero_preventivo,
      cliente_nome: c.cliente_nome,
      numeri_preventivo: numeri,
    }
  })
}
```

- [ ] **Step 3: Verificare compilazione**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add actions/commesse.ts
git commit -m "feat(condivisione): server action con le commesse cercabili"
```

---

### Task 4: L'area Commesse

**Files:**
- Create: `components/condivisione/AreaCommesse.tsx`
- Modify: `components/condivisione/aree.ts`

- [ ] **Step 1: Scrivere il componente**

Crea `components/condivisione/AreaCommesse.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCommessePerCondivisione } from '@/actions/commesse'
import { caricaDocumentoCommessa } from '@/lib/upload-documento'
import { filtraCommesse } from '@/lib/ricerca-commesse'
import { TIPI_DOCUMENTO_COMMESSA } from '@/types/commessa'
import type { CommessaCondivisione } from '@/types/commessa'
import type { PassiProps } from '@/types/condivisione'

export default function AreaCommesse({ file, onFatto, onIndietro }: PassiProps) {
  const [commesse, setCommesse] = useState<CommessaCondivisione[] | null>(null)
  const [cerca, setCerca] = useState('')
  const [scelta, setScelta] = useState<CommessaCondivisione | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getCommessePerCondivisione()
      .then((c) => { if (vivo) setCommesse(c) })
      .catch(() => { if (vivo) setCommesse([]) })
    return () => { vivo = false }
  }, [])

  const filtrate = filtraCommesse(commesse ?? [], cerca)

  const salva = async (tipo: string) => {
    if (!scelta) return
    setSalvando(tipo)
    const errore = await caricaDocumentoCommessa(file.blob, file.nome, scelta.id, tipo)
    setSalvando(null)
    if (errore) {
      toast.error(errore)
      return
    }
    toast.success(`Salvato su ${scelta.numero_commessa ?? scelta.cliente_nome}`)
    onFatto()
  }

  // ── Secondo passo: il tipo di documento ────────────────────────────────────
  if (scelta) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => setScelta(null)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {scelta.numero_commessa ?? '—'} — {scelta.cliente_nome}
        </Button>
        <p className="text-sm font-medium text-gray-700">Che tipo di documento è?</p>
        <div className="grid grid-cols-2 gap-2">
          {TIPI_DOCUMENTO_COMMESSA.map((t) => (
            <Button
              key={t.value}
              variant="outline"
              className="h-12 justify-start"
              disabled={salvando !== null}
              onClick={() => salva(t.value)}
            >
              {salvando === t.value
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Upload className="h-4 w-4 mr-2 text-teal-600" />}
              {t.label}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  // ── Primo passo: la commessa ───────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={onIndietro}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Cambia area
      </Button>
      <p className="text-sm font-medium text-gray-700">Su quale commessa?</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-8"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cliente, numero commessa o preventivo..."
          autoFocus
        />
      </div>

      {commesse === null ? (
        <p className="text-sm text-gray-400 text-center py-6">Caricamento commesse...</p>
      ) : filtrate.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nessuna commessa trovata.</p>
      ) : (
        <div className="divide-y rounded-md border bg-white max-h-[50vh] overflow-y-auto">
          {filtrate.slice(0, 50).map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
              onClick={() => setScelta(c)}
            >
              <p className="text-sm font-medium text-gray-900">
                {c.numero_commessa ?? 'Senza numero'} — {c.cliente_nome}
              </p>
              {c.numero_preventivo && (
                <p className="text-xs text-gray-500 font-mono">{c.numero_preventivo}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Registrare l'area**

In `components/condivisione/aree.ts`, aggiungi `Briefcase` all'import da `lucide-react`, importa il componente e aggiungi la voce **dopo** quella di Produzione:

```ts
import { Briefcase, Factory } from 'lucide-react'
import AreaProduzione from './AreaProduzione'
import AreaCommesse from './AreaCommesse'
import type { AreaCondivisione } from '@/types/condivisione'

export const AREE: AreaCondivisione[] = [
  {
    id: 'produzione',
    label: 'Produzione',
    descrizione: 'Disegni, schede tecniche, DDT e foto di una commessa',
    icona: Factory,
    Passi: AreaProduzione,
  },
  {
    id: 'commesse',
    label: 'Commesse',
    descrizione: 'Fatture, bolle e contratti di una commessa',
    icona: Briefcase,
    Passi: AreaCommesse,
  },
]
```

Lascia intatto il commento in cima al file: resta vero, e la frase sul mostrare solo le aree che funzionano davvero vale ancora.

- [ ] **Step 3: Verificare compilazione e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning

- [ ] **Step 4: Commit**

```bash
git add components/condivisione/AreaCommesse.tsx components/condivisione/aree.ts
git commit -m "feat(condivisione): area Commesse nell'imbuto di condivisione"
```

---

### Task 5: Verifica finale

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS su tutti i file, compresi i 7 nuovi di `lib/ricerca-commesse.test.ts`

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata, nessun errore né warning eslint.

- [ ] **Step 3: Verifica manuale da Android**

Con la PWA installata su Android, condividi un PDF verso WinStudio:

1. compaiono **due** aree, Produzione e Commesse;
2. scelta Commesse, l'elenco si carica e il campo cerca funziona per cliente, per numero commessa e per numero preventivo;
3. scelta una commessa, i cinque tipi compaiono e premendone uno il file si salva;
4. il documento compare nella scheda della commessa sotto Documenti, col tipo giusto;
5. il ramo Produzione continua a funzionare come prima.

- [ ] **Step 4: Aggiornare la memoria**

Aggiorna `project_condivisione_android.md`: le aree accese sono due, non più una sola. L'invariante 3 resta valido e va rafforzato con la nota che con la **terza** area della stessa forma vale la pena unificare.

- [ ] **Step 5: Commit finale e push**

```bash
git add -A
git commit -m "docs(condivisione): due aree accese, non piu' una"
git push -u origin feat/condivisione-area-commesse
```

---

## Cosa questo lavoro NON fa

- `AreaProduzione` non viene toccata, la sua copia locale di `normalizza` compresa.
- Niente permesso di modulo sul singolo ramo: `/condividi` eredita l'autenticazione dal gruppo `(dashboard)`.
- Resta solo Android con PWA installata: su iPhone e iPad il foglio di condivisione non offre le PWA.
- Dipendenti e Magazzino restano spente.
