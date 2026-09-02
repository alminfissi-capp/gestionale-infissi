# Allineamento commessa ↔ preventivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segnalare le commesse il cui totale non corrisponde più ai preventivi collegati e offrire un pulsante che ricopia i totali correnti, su richiesta esplicita.

**Architecture:** Il verdetto è una funzione pura in `lib/`, alimentata dai dati già in pagina (`getPreventiviPerCommessa()` restituisce già i totali live dei preventivi accettati e `/commesse/[id]` li passa già a `TabellaCommesse`): zero query in più. La scrittura è una Server Action che rilegge i preventivi dal DB, perché i numeri arrivati dal client possono essere vecchi. Nessun allineamento automatico: `imponibile` e `iva_totale` sulla commessa restano campi che l'utente decide.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, shadcn/ui, Tailwind, Vitest (`npm test`, include `lib/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-02-allineamento-commessa-preventivo-design.md`

**Branch:** `feat/allineamento-commessa-preventivo` (già creato, spec già committata).

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `lib/allineamento-commessa.ts` *(nuovo)* | Funzione pura: dato una commessa e la mappa dei preventivi, dice se è allineata, disallineata o non confrontabile. Nessuna dipendenza React o Supabase. |
| `lib/allineamento-commessa.test.ts` *(nuovo)* | Un caso per ramo della funzione pura. |
| `actions/commesse.ts` *(modifica)* | Nuova Server Action `allineaCommessaAlPreventivo`: rilegge dal DB e scrive i totali. |
| `components/commesse/TabellaCommesse.tsx` *(modifica)* | Costruisce la mappa dei preventivi, mostra il triangolo ambra sulla riga disallineata, passa la mappa alla scheda. |
| `components/commesse/DialogSchedaCommessa.tsx` *(modifica)* | Striscia d'avviso e pulsante Allinea sotto il blocco Importi. |

---

### Task 1: La funzione pura che dà il verdetto

**Files:**
- Create: `lib/allineamento-commessa.ts`
- Test: `lib/allineamento-commessa.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `lib/allineamento-commessa.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { statoAllineamento } from './allineamento-commessa'
import type {
  CommessaCompleta,
  PreventivoCommessa,
  PreventivoPerCommessa,
} from '@/types/commessa'

// I tipi veri hanno decine di campi che alla funzione non servono: le fabbriche
// tengono i test leggibili e il cast confinato qui dentro.
function commessa(over: Partial<CommessaCompleta> = {}): CommessaCompleta {
  return {
    id: 'c1',
    totale: 2400,
    anonima: false,
    preventivo_id: null,
    preventivi_collegati: [],
    ...over,
  } as CommessaCompleta
}

function link(preventivoId: string | null): PreventivoCommessa {
  return { id: `pc-${preventivoId ?? 'manuale'}`, preventivo_id: preventivoId } as PreventivoCommessa
}

function prev(id: string, totale: number, iva = 0): PreventivoPerCommessa {
  return { id, numero: id, cliente_nome: '', imponibile: totale - iva, iva_totale: iva, totale }
}

function mappa(...ps: PreventivoPerCommessa[]): Map<string, PreventivoPerCommessa> {
  return new Map(ps.map((p) => [p.id, p]))
}

describe('statoAllineamento', () => {
  it('dice allineata quando i totali coincidono', () => {
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 2400)))).toEqual({ tipo: 'allineata' })
  })

  it('segnala la differenza quando il preventivo è stato ritoccato', () => {
    // Il caso Guarracino: preventivo portato da 2400 a 2450, commessa ferma.
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 2450)))).toEqual({
      tipo: 'disallineata',
      totaleCommessa: 2400,
      totalePreventivi: 2450,
      ivaPreventivi: 0,
      differenza: 50,
    })
  })

  it('tratta come allineata una differenza da arrotondamento', () => {
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 2400.004)))).toEqual({ tipo: 'allineata' })
  })

  it('somma totale e IVA di più preventivi collegati', () => {
    const c = commessa({ totale: 1000, preventivi_collegati: [link('p1'), link('p2')] })
    expect(statoAllineamento(c, mappa(prev('p1', 1220, 220), prev('p2', 610, 110)))).toEqual({
      tipo: 'disallineata',
      totaleCommessa: 1000,
      totalePreventivi: 1830,
      ivaPreventivi: 330,
      differenza: 830,
    })
  })

  it('tace quando c’è anche un solo preventivo allegato a mano', () => {
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1'), link(null)] })
    expect(statoAllineamento(c, mappa(prev('p1', 2450)))).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'preventivi_manuali',
    })
  })

  it('tace quando un preventivo collegato non è più leggibile', () => {
    // Succede se il preventivo è stato cancellato o non è più in stato 'accettato':
    // getPreventiviPerCommessa filtra .eq('stato', 'accettato').
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa())).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'preventivo_mancante',
    })
  })

  it('tace quando non c’è nessun preventivo collegato', () => {
    expect(statoAllineamento(commessa(), mappa())).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'nessun_preventivo',
    })
  })

  it('usa la vecchia colonna preventivo_id quando la junction è vuota', () => {
    const c = commessa({ totale: 2400, preventivo_id: 'p1', preventivi_collegati: [] })
    expect(statoAllineamento(c, mappa(prev('p1', 2450)))).toMatchObject({
      tipo: 'disallineata',
      differenza: 50,
    })
  })

  it('non confronta le vendite anonime', () => {
    const c = commessa({ totale: 100, anonima: true, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 200)))).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'nessun_preventivo',
    })
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test -- lib/allineamento-commessa.test.ts`
Expected: FAIL — `Failed to resolve import "./allineamento-commessa"`

- [ ] **Step 3: Scrivere l'implementazione**

Crea `lib/allineamento-commessa.ts`:

```ts
import type { CommessaCompleta, PreventivoPerCommessa } from '@/types/commessa'

/** Sotto questa soglia in euro la differenza è arrotondamento, non disallineamento. */
export const TOLLERANZA_ALLINEAMENTO = 0.01

export type MotivoNonConfrontabile =
  | 'nessun_preventivo'
  | 'preventivi_manuali'
  | 'preventivo_mancante'

export type StatoAllineamento =
  | { tipo: 'allineata' }
  | { tipo: 'non_confrontabile'; motivo: MotivoNonConfrontabile }
  | {
      tipo: 'disallineata'
      totaleCommessa: number
      totalePreventivi: number
      ivaPreventivi: number
      differenza: number // totalePreventivi − totaleCommessa
    }

/**
 * I preventivi collegati a una commessa. La junction `preventivi_commessa` è la
 * sorgente di verità; la vecchia colonna `commessa.preventivo_id` vale solo per le
 * commesse create prima che la junction esistesse.
 */
export function preventiviCollegati(
  commessa: Pick<CommessaCompleta, 'preventivo_id' | 'preventivi_collegati'>
): { interni: string[]; manuali: number } {
  const collegati = commessa.preventivi_collegati ?? []
  if (collegati.length === 0) {
    return { interni: commessa.preventivo_id ? [commessa.preventivo_id] : [], manuali: 0 }
  }
  return {
    interni: collegati
      .map((pc) => pc.preventivo_id)
      .filter((id): id is string => !!id),
    manuali: collegati.filter((pc) => !pc.preventivo_id).length,
  }
}

/**
 * Il totale di una commessa è una fotografia scattata alla conversione: modificare
 * il preventivo non la aggiorna, di proposito (imponibile e IVA sulla commessa sono
 * campi che l'utente compila a mano). Questa funzione dice se la fotografia è ancora
 * fedele. Quando il valore di anche un solo preventivo collegato non è conoscibile,
 * risponde `non_confrontabile`: meglio nessun avviso che un avviso falso.
 */
export function statoAllineamento(
  commessa: CommessaCompleta,
  preventiviById: Map<string, PreventivoPerCommessa>
): StatoAllineamento {
  // Le vendite e-commerce/eBay non nascono da un preventivo. Non arrivano nemmeno
  // a TabellaCommesse, che filtra anonima = false: il controllo è difensivo.
  if (commessa.anonima) return { tipo: 'non_confrontabile', motivo: 'nessun_preventivo' }

  const { interni, manuali } = preventiviCollegati(commessa)
  if (interni.length === 0 && manuali === 0) {
    return { tipo: 'non_confrontabile', motivo: 'nessun_preventivo' }
  }
  // Un PDF caricato a mano non ha un importo che il sistema possa leggere.
  if (manuali > 0) return { tipo: 'non_confrontabile', motivo: 'preventivi_manuali' }
  if (interni.some((id) => !preventiviById.has(id))) {
    return { tipo: 'non_confrontabile', motivo: 'preventivo_mancante' }
  }

  let totalePreventivi = 0
  let ivaPreventivi = 0
  for (const id of interni) {
    const p = preventiviById.get(id)!
    totalePreventivi += p.totale
    ivaPreventivi += p.iva_totale
  }

  const differenza = totalePreventivi - commessa.totale
  if (Math.abs(differenza) <= TOLLERANZA_ALLINEAMENTO) return { tipo: 'allineata' }

  return {
    tipo: 'disallineata',
    totaleCommessa: commessa.totale,
    totalePreventivi,
    ivaPreventivi,
    differenza,
  }
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test -- lib/allineamento-commessa.test.ts`
Expected: PASS, 9 test

- [ ] **Step 5: Commit**

```bash
git add lib/allineamento-commessa.ts lib/allineamento-commessa.test.ts
git commit -m "feat(commesse): verdetto di allineamento fra commessa e preventivi"
```

---

### Task 2: La Server Action che ricopia i totali

**Files:**
- Modify: `actions/commesse.ts` (in fondo al file, dopo `getPreventiviPerCommessa`)

- [ ] **Step 1: Aggiungere l'helper di arrotondamento**

In cima a `actions/commesse.ts`, subito sotto la costante `FILTRO_TIPI_PRODUZIONE` (riga ~24), aggiungi:

```ts
const round2 = (n: number) => Math.round(n * 100) / 100
```

- [ ] **Step 2: Aggiungere la Server Action**

In fondo a `actions/commesse.ts`, dopo la chiusura di `getPreventiviPerCommessa`, aggiungi:

```ts
/**
 * Ricopia sulla commessa i totali correnti dei suoi preventivi interni.
 *
 * È sempre un gesto esplicito dell'utente: `updatePreventivo` non tocca le commesse
 * di proposito, perché `imponibile` e `iva_totale` sulla commessa sono campi manuali
 * che a volte divergono dal preventivo apposta.
 *
 * Rilegge i preventivi dal database invece di fidarsi dei numeri arrivati dal client:
 * la pagina può essere aperta da un'ora.
 */
export async function allineaCommessaAlPreventivo(
  commessaId: string
): Promise<{ totale: number; iva_totale: number; imponibile: number }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: commessa, error: cErr }, { data: collegati, error: lErr }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, preventivo_id')
      .eq('id', commessaId)
      .eq('organization_id', orgId)
      .maybeSingle(),
    supabase
      .from('preventivi_commessa')
      .select('preventivo_id')
      .eq('commessa_id', commessaId)
      .eq('organization_id', orgId),
  ])
  if (cErr) throw new Error(cErr.message)
  if (lErr) throw new Error(lErr.message)
  if (!commessa) throw new Error('Commessa non trovata')

  // Stesse regole di lib/allineamento-commessa.ts: la junction è la sorgente di
  // verità, la vecchia colonna vale solo se la junction è vuota.
  const righe = collegati ?? []
  const ids =
    righe.length > 0
      ? righe.map((r) => r.preventivo_id).filter((id): id is string => !!id)
      : commessa.preventivo_id
        ? [commessa.preventivo_id]
        : []

  if (ids.length === 0) {
    throw new Error('Nessun preventivo interno collegato: non c’è da dove copiare i totali.')
  }

  // Niente filtro sullo stato: se l'utente ha chiesto l'allineamento, il preventivo
  // va letto anche se nel frattempo non è più 'accettato'.
  const { data: preventivi, error: pErr } = await supabase
    .from('preventivi')
    .select('id, iva_totale, totale_finale')
    .in('id', ids)
    .eq('organization_id', orgId)
  if (pErr) throw new Error(pErr.message)
  if (!preventivi || preventivi.length === 0) {
    throw new Error('I preventivi collegati non esistono più.')
  }

  const iva = round2(preventivi.reduce((s, p) => s + Number(p.iva_totale ?? 0), 0))
  const totale = round2(preventivi.reduce((s, p) => s + Number(p.totale_finale ?? 0), 0))
  const imponibile = round2(totale - iva)

  const { error: uErr } = await supabase
    .from('commesse')
    .update({ imponibile, iva_totale: iva, totale, updated_at: new Date().toISOString() })
    .eq('id', commessaId)
    .eq('organization_id', orgId)
  if (uErr) throw new Error(uErr.message)

  revalidatePath('/commesse', 'layout')
  return { totale, iva_totale: iva, imponibile }
}
```

- [ ] **Step 3: Verificare che TypeScript compili**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add actions/commesse.ts
git commit -m "feat(commesse): server action per allineare i totali al preventivo"
```

---

### Task 3: Il triangolo ambra nell'elenco commesse

**Files:**
- Modify: `components/commesse/TabellaCommesse.tsx`

Nota: la tabella è una sola, responsive (`table-fixed`, riga 721 e 773). Non c'è una card mobile separata: il badge va aggiunto in un solo punto, dentro `SortableRow`.

- [ ] **Step 1: Aggiungere gli import**

Nell'import da `lucide-react` (righe 7-10) aggiungi `TriangleAlert` alla lista:

```ts
import {
  Plus, Search, Trash2, LayoutList, Paperclip, FileText, Link2,
  GripVertical, MoreVertical, Copy, WifiOff, MoveRight, Star, TriangleAlert,
} from 'lucide-react'
```

Sotto l'import di `formatEuro` (riga ~58) aggiungi:

```ts
import { statoAllineamento } from '@/lib/allineamento-commessa'
```

- [ ] **Step 2: Aggiungere la prop a `RowProps`**

In `interface RowProps` (riga ~180), dopo `c: CommessaCompleta`, aggiungi:

```ts
  preventiviById: Map<string, PreventivoPerCommessa>
```

E aggiungi `preventiviById` alla destrutturazione di `SortableRow` (riga 195):

```ts
function SortableRow({ c, preventiviById, onScheda, onDelete, onDuplica, onAcconto, onDocumenti, onPrevManuale, onStatoChange, altriGruppi, onSposta, highlighted, onToggleCalcoli }: RowProps) {
```

- [ ] **Step 3: Calcolare il verdetto nella riga**

Dentro `SortableRow`, subito dopo le due righe del saldo (riga ~213):

```ts
  const saldoPositivo = c.saldo > 0.005
  const saldoZero = !saldoPositivo && c.saldo >= -0.005

  const allineamento = statoAllineamento(c, preventiviById)
```

- [ ] **Step 4: Mostrare il triangolo accanto al totale**

Sostituisci la cella del totale (riga ~280):

```tsx
      <TableCell className="text-right text-sm font-semibold">
        {formatEuro(c.totale)}
      </TableCell>
```

con:

```tsx
      <TableCell className="text-right text-sm font-semibold">
        <span className="inline-flex items-center justify-end gap-1">
          {allineamento.tipo === 'disallineata' && (
            <button
              type="button"
              onClick={onScheda}
              className="text-amber-500 hover:text-amber-600 shrink-0"
              title={`I preventivi collegati valgono ora € ${formatEuro(allineamento.totalePreventivi)} (${allineamento.differenza > 0 ? '+' : '-'}€ ${formatEuro(Math.abs(allineamento.differenza))}). Apri la scheda per allineare.`}
            >
              <TriangleAlert className="h-3.5 w-3.5" />
            </button>
          )}
          {formatEuro(c.totale)}
        </span>
      </TableCell>
```

- [ ] **Step 5: Costruire la mappa nel componente principale**

In `TabellaCommesse`, subito dopo la costante `altriGruppi` (riga ~519):

```ts
  // Il confronto commessa/preventivi non costa query: getPreventiviPerCommessa()
  // porta già in pagina i totali live di ogni preventivo accettato.
  const preventiviById = useMemo(
    () => new Map(preventivi.map((p) => [p.id, p])),
    [preventivi]
  )
```

- [ ] **Step 6: Passare la mappa alla riga**

In `<SortableRow` (riga ~745), subito dopo `c={c}`:

```tsx
                      c={c}
                      preventiviById={preventiviById}
```

- [ ] **Step 7: Verificare compilazione e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning

- [ ] **Step 8: Commit**

```bash
git add components/commesse/TabellaCommesse.tsx
git commit -m "feat(commesse): triangolo d'avviso sulle commesse disallineate"
```

---

### Task 4: Avviso e pulsante Allinea nella scheda

**Files:**
- Modify: `components/commesse/DialogSchedaCommessa.tsx`
- Modify: `components/commesse/TabellaCommesse.tsx` (passaggio della prop)

- [ ] **Step 1: Aggiungere gli import nella scheda**

Nell'import da `lucide-react` (righe 7-11) aggiungi `TriangleAlert`:

```ts
import {
  Pencil, X, Plus, Trash2, Upload, FileText,
  Eye, Share2, Check, ExternalLink, Printer,
  MapPin, Navigation, MoreVertical, FileBarChart, TriangleAlert,
} from 'lucide-react'
```

Nell'import da `@/actions/commesse` (righe ~35-46) aggiungi `allineaCommessaAlPreventivo` alla lista:

```ts
import {
  updateCommessa,
  setPreventiviCommessa,
  allineaCommessaAlPreventivo,
  addAcconto,
  deleteAcconto,
  addDocumentoCommessa,
  deleteDocumentoCommessa,
  getDocumentoCommessaUrl,
  getOrgIdPerUpload,
  type PreventivoCommessaItemInput,
} from '@/actions/commesse'
```

Sotto l'import di `formatEuro` (riga ~47) aggiungi:

```ts
import { statoAllineamento } from '@/lib/allineamento-commessa'
```

E nell'import dei tipi da `@/types/commessa` (righe ~50-59) aggiungi `PreventivoPerCommessa`:

```ts
import type {
  CommessaCompleta,
  CommessaInput,
  AccontoInput,
  MetodoPagamento,
  StatoCommessa,
  DocumentoCommessa,
  Reparto,
  UtentePerCommessa,
  PreventivoPerCommessa,
} from '@/types/commessa'
```

- [ ] **Step 2: Aggiungere la prop**

In `interface Props` (riga ~125):

```ts
interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa: CommessaCompleta | null
  utenti: UtentePerCommessa[]
  // La stessa mappa memoizzata usata dalle righe dell'elenco: costruita una volta
  // sola in TabellaCommesse e passata a entrambi i consumatori.
  preventiviById: Map<string, PreventivoPerCommessa>
}
```

E nella firma del componente (riga 134):

```ts
export default function DialogSchedaCommessa({ open, onOpenChange, commessa, utenti, preventiviById }: Props) {
```

- [ ] **Step 3: Aggiungere lo stato del pulsante**

Accanto agli altri `useState` di salvataggio, dopo `const [saving, setSaving] = useState(false)` (riga ~151):

```ts
  const [allineando, setAllineando] = useState(false)
```

- [ ] **Step 4: Calcolare il verdetto**

Subito dopo `haCostiManualiSalvati` (riga ~215-218), aggiungi:

```ts
  const allineamento = statoAllineamento(commessa, preventiviById)
```

- [ ] **Step 5: Scrivere l'handler**

Subito prima del commento `// ── Acconti ─────` (riga ~408), aggiungi:

```ts
  // ── Allineamento ai preventivi ────────────────────────────

  const handleAllinea = async () => {
    const manuali = (commessa.preventivi_collegati ?? []).filter((pc) => !pc.preventivo_id).length
    if (manuali > 0) {
      const ok = window.confirm(
        manuali === 1
          ? 'Un preventivo allegato a mano non verrà conteggiato: il totale sarà preso solo dai preventivi interni. Continuare?'
          : `${manuali} preventivi allegati a mano non verranno conteggiati: il totale sarà preso solo dai preventivi interni. Continuare?`
      )
      if (!ok) return
    }
    setAllineando(true)
    try {
      const res = await allineaCommessaAlPreventivo(commessa.id)
      toast.success(`Totale allineato a € ${formatEuro(res.totale)}`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nell’allineamento')
    } finally {
      setAllineando(false)
    }
  }
```

- [ ] **Step 6: Aggiungere la striscia d'avviso e il pulsante**

Subito dopo la chiusura della `<section>` degli Importi (riga ~875, la riga `</section>` che precede il commento `{/* Costi preventivo manuale (per statistiche) */}`), inserisci:

```tsx
            {/* Allineamento ai preventivi collegati */}
            {allineamento.tipo === 'disallineata' && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3 flex-wrap">
                <TriangleAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-[14rem]">
                  <p className="text-sm font-medium text-amber-800">
                    Totale diverso dai preventivi collegati
                  </p>
                  <p className="text-xs text-amber-700/90 mt-0.5">
                    Questa commessa vale € {formatEuro(allineamento.totaleCommessa)}, i preventivi
                    collegati € {formatEuro(allineamento.totalePreventivi)} (IVA € {formatEuro(allineamento.ivaPreventivi)}):
                    differenza {allineamento.differenza > 0 ? '+' : '-'}€ {formatEuro(Math.abs(allineamento.differenza))}.
                  </p>
                </div>
                <Button size="sm" onClick={handleAllinea} disabled={allineando || !isOnline}>
                  {allineando ? 'Allineo...' : 'Allinea'}
                </Button>
              </section>
            )}

            {/* Preventivi allegati a mano: niente avviso (il confronto sarebbe falso),
                ma l'allineamento ai soli preventivi interni resta a portata di mano. */}
            {allineamento.tipo === 'non_confrontabile' &&
              allineamento.motivo === 'preventivi_manuali' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-gray-700 -mt-2 self-start"
                  onClick={handleAllinea}
                  disabled={allineando || !isOnline}
                >
                  {allineando ? 'Allineo...' : 'Allinea ai preventivi interni'}
                </Button>
              )}
```

- [ ] **Step 7: Passare la mappa alla scheda da `TabellaCommesse`**

In `components/commesse/TabellaCommesse.tsx`, nel blocco `<DialogSchedaCommessa` (riga ~820), dopo `utenti={utenti}`:

```tsx
      <DialogSchedaCommessa
        open={!!schedaCommessaId}
        onOpenChange={(v) => { if (!v) setSchedaCommessaId(null) }}
        commessa={schedaCommessa}
        utenti={utenti}
        preventiviById={preventiviById}
      />
```

- [ ] **Step 8: Verificare compilazione e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning

- [ ] **Step 9: Commit**

```bash
git add components/commesse/DialogSchedaCommessa.tsx components/commesse/TabellaCommesse.tsx
git commit -m "feat(commesse): avviso e pulsante Allinea nella scheda commessa"
```

---

### Task 5: Verifica finale

**Files:** nessuna modifica di codice prevista; se la build segnala qualcosa, si correggono i file interessati.

- [ ] **Step 1: Eseguire tutta la suite di test**

Run: `npm test`
Expected: PASS su tutti i file, compresi i 9 nuovi test di `lib/allineamento-commessa.test.ts`

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori né warning di eslint.

Nota: la build locale fallisce se manca `RESEND_API_KEY` (route email) — è un problema preesistente, non causato da questo lavoro. Se compare, esporta una chiave fittizia e ripeti.

- [ ] **Step 3: Verifica manuale sul caso reale**

Apri `/commesse`, entra nel blocco che contiene la commessa `33-2026` (Guarracino Loredana).

Ci si aspetta:
1. un triangolo ambra accanto al totale `2.400,00`, il cui tooltip dice che i preventivi valgono ora € 2.450,00 (+€ 50,00);
2. cliccandolo si apre la scheda, con la striscia ambra sotto gli Importi;
3. premendo **Allinea**, il toast dice "Totale allineato a € 2.450,00", la scheda mostra Totale 2.450,00 / Imponibile 2.450,00 / IVA 0,00, il triangolo sparisce e il saldo si aggiorna di conseguenza.

- [ ] **Step 4: Aggiornare la memoria di progetto**

Crea `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\project_allineamento_commessa_preventivo.md` con le quattro scelte di fondo della spec (niente allineamento automatico, confronto a costo zero sui dati già in pagina, silenzio su ciò che non è confrontabile, la scrittura rilegge dal DB) e aggiungi la riga corrispondente in `MEMORY.md`.

- [ ] **Step 5: Commit finale e push**

```bash
git add -A
git commit -m "docs(commesse): note di progetto sull'allineamento commessa/preventivo"
git push
```

---

## Cosa questo lavoro NON fa

- Nessun blocco riepilogativo in `/commesse/statistiche`: l'avviso vive dove si lavora.
- Nessun "allinea tutte": ogni commessa è una decisione contabile a sé.
- Nessun trigger, nessun allineamento automatico su `updatePreventivo`.
- `getPreventiviPerCommessa` continua a non usare `selectAll()` (limite preesistente a 1000 righe, oggi i preventivi sono 218 in tutto).
