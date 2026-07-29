# Tracking invio e lettura ordini fornitore — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sapere e dimostrare se il fornitore ha ricevuto e aperto l'ordine, con un'icona di stato in tabella e un footer di avvenuta consegna sul PDF.

**Architecture:** L'email passa da testo-con-allegato a HTML con pixel di tracking e link a una pagina pubblica; il PDF viene servito da un endpoint nostro invece che allegato, perché un allegato non è osservabile. Ogni evento (invio, apertura email, apertura pagina, download) finisce come riga in `tracking_email_ordine`; lo stato corrente si ricalcola dagli eventi successivi all'ultimo invio, quindi un reinvio azzera l'indicatore senza perdere storia. Tutta la logica di riepilogo sta in un modulo puro testato con Vitest, i componenti si limitano a mostrarla.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS + Storage), Resend, `@react-pdf/renderer`, shadcn/ui, lucide-react, Vitest.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-28-tracking-email-ordini-design.md`

## Global Constraints

- Branch di lavoro: `tracking-email-ordini` (già creato, contiene la spec).
- Ogni tabella ha `organization_id` e RLS con `get_user_organization_id()`. Le scritture sui percorsi pubblici usano `createServiceClient()` da `lib/supabase/service.ts`, mai il client con cookie.
- `params` e `searchParams` sono `Promise` in Next.js 16: sempre `await`.
- I file in `actions/*.ts` con `'use server'` espongono ogni export come endpoint pubblico. Le funzioni che scrivono eventi **non** vanno lì: stanno in `lib/produzione-tracking-db.ts`, un modulo normale importato solo da route handler e Server Component.
- Logica pura in `lib/`, senza React né Supabase. Tipi in `types/`.
- Bucket storage: `commesse-docs`.
- Colore brand per il pulsante nell'email: `#0E8F9C`.
- Formato numero ordine a video e nei PDF: `formattaNumeroOrdine` da `lib/produzione.ts` (`ORD 011-2026`).
- Verifiche: `npx tsc --noEmit`, `npm test`, `npm run lint`. `npm run build` richiede `RESEND_API_KEY` valorizzata anche fittizia.
- Zero warning eslint per variabili non usate: il build fallisce.

## File Structure

**Nuovi**

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260728120000_tracking_email_ordini.sql` | tabella eventi + 2 colonne su `ordini_fornitore` |
| `lib/produzione-tracking.ts` | logica pura: riepilogo eventi, fallback, formattazione righe |
| `lib/produzione-tracking.test.ts` | test Vitest della logica pura |
| `lib/produzione-tracking-db.ts` | accesso DB con service client: scrittura eventi, lettura per token |
| `actions/produzione-tracking.ts` | `getTrackingOrdini` per le pagine dashboard |
| `components/ui/tooltip.tsx` | primitiva shadcn (generata) |
| `components/produzione/StatoInvioOrdine.tsx` | icona + tooltip di stato |
| `app/api/track/ordine/[token]/route.ts` | pixel 1×1, evento `email_aperta` |
| `app/api/track/ordine/[token]/visita/route.ts` | POST dal browser, evento `pagina_aperta` |
| `app/(public)/o/[token]/page.tsx` | pagina pubblica per il fornitore |
| `app/(public)/o/[token]/TracciaVisita.tsx` | client component che manda il beacon |
| `app/(public)/o/[token]/pdf/route.ts` | download tracciato dello snapshot |

**Modificati**

| File | Modifica |
|---|---|
| `types/produzione.ts` | tipi tracking + 2 campi su `OrdineFornitore` |
| `app/api/produzione/invia-ordine/route.ts` | token, snapshot, email HTML, evento |
| `components/produzione/OrdinePDF.tsx` | prop `tracking` e footer |
| `components/produzione/ElencoOrdini.tsx` | colonna icona, prop al PDF |
| `components/produzione/ProduzioneCommessa.tsx` | idem |
| `app/(dashboard)/magazzino/ordini/page.tsx` | carica il tracking |
| `app/(dashboard)/produzione/[commessaId]/page.tsx` | carica il tracking |

---

### Task 1: Migrazione e tipi

Base dati e contratto TypeScript. Non c'è comportamento da testare: la verifica è che la migrazione applichi e che il progetto compili.

**Files:**
- Create: `supabase/migrations/20260728120000_tracking_email_ordini.sql`
- Modify: `types/produzione.ts`

**Interfaces:**
- Consuma: niente.
- Produce: tabella `tracking_email_ordine`; colonne `ordini_fornitore.tracking_token` (uuid, unique, nullable) e `ordini_fornitore.pdf_inviato_path` (text, nullable); tipi `TipoEventoTracking`, `EventoTracking`, `StatoInvio`, `TrackingOrdine`; campi `tracking_token` e `pdf_inviato_path` su `OrdineFornitore`.

- [ ] **Step 1: Scrivi la migrazione**

Crea `supabase/migrations/20260728120000_tracking_email_ordini.sql`:

```sql
-- ============================================================
-- 20260728120000_tracking_email_ordini.sql
-- Tracking invio e lettura degli ordini fornitore
-- ============================================================

ALTER TABLE ordini_fornitore
  ADD COLUMN IF NOT EXISTS tracking_token   UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS pdf_inviato_path TEXT;

COMMENT ON COLUMN ordini_fornitore.tracking_token IS
  'Token del link pubblico /o/[token]. Generato al primo invio, poi stabile.';
COMMENT ON COLUMN ordini_fornitore.pdf_inviato_path IS
  'Copia congelata del PDF al momento dell''invio, servita al fornitore.';

CREATE TABLE IF NOT EXISTS tracking_email_ordine (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine_id       UUID NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL
    CHECK (tipo IN ('inviato', 'email_aperta', 'pagina_aperta', 'pdf_scaricato')),
  avvenuto_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  destinatario    TEXT,
  user_agent      TEXT,
  ip              TEXT
);

CREATE INDEX IF NOT EXISTS idx_tracking_email_ordine_ordine
  ON tracking_email_ordine(ordine_id, avvenuto_at DESC);

ALTER TABLE tracking_email_ordine ENABLE ROW LEVEL SECURITY;

-- Sola lettura per l'organizzazione. Nessuna policy di scrittura: gli eventi
-- vengono inseriti esclusivamente lato server con il service role.
CREATE POLICY "tracking_email_ordine_select" ON tracking_email_ordine
  FOR SELECT USING (organization_id = get_user_organization_id());
```

- [ ] **Step 2: Applica la migrazione al progetto Supabase**

Progetto `xawyrtqclpeylxnhwhwo`. Applica con il tool MCP Supabase `apply_migration`, nome `tracking_email_ordini`, passando il contenuto del file.

- [ ] **Step 3: Verifica che la migrazione sia passata**

Esegui questa query (MCP `execute_sql`):

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tracking_email_ordine'
ORDER BY ordinal_position;
```

Atteso: 8 righe — `id`, `organization_id`, `ordine_id`, `tipo`, `avvenuto_at`, `destinatario`, `user_agent`, `ip`.

Poi:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ordini_fornitore'
  AND column_name IN ('tracking_token', 'pdf_inviato_path');
```

Atteso: 2 righe.

- [ ] **Step 4: Aggiungi i tipi**

In `types/produzione.ts`, aggiungi due campi a `OrdineFornitore` (subito dopo `inviato_at`):

```ts
  inviato_at: string | null
  tracking_token: string | null
  pdf_inviato_path: string | null
```

E in fondo al file:

```ts
export type TipoEventoTracking =
  | 'inviato'
  | 'email_aperta'
  | 'pagina_aperta'
  | 'pdf_scaricato'

/** Riga di `tracking_email_ordine`, nella forma che serve al riepilogo. */
export type EventoTracking = {
  tipo: TipoEventoTracking
  avvenuto_at: string
  destinatario: string | null
}

export type StatoInvio = 'non_inviato' | 'inviato' | 'letto'

/** Stato corrente derivato dagli eventi successivi all'ultimo invio. */
export type TrackingOrdine = {
  stato: StatoInvio
  inviatoAt: string | null
  destinatario: string | null
  emailApertaAt: string | null
  paginaApertaAt: string | null
  pdfScaricatoAt: string | null
  /** Aperture pagina + download dopo l'ultimo invio. */
  aperture: number
  /** Quante volte l'ordine è stato inviato in tutto. */
  invii: number
}
```

- [ ] **Step 5: Verifica la compilazione**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260728120000_tracking_email_ordini.sql types/produzione.ts
git commit -m "feat: tabella eventi tracking ordini fornitore e tipi"
```

---

### Task 2: Logica pura di riepilogo (TDD)

Il cuore della funzione. Tutto ciò che decide "inviato" o "letto", cosa scrivere nel tooltip e cosa nel footer, sta qui e viene testato senza database.

**Files:**
- Create: `lib/produzione-tracking.ts`
- Test: `lib/produzione-tracking.test.ts`

**Interfaces:**
- Consuma: `EventoTracking`, `TrackingOrdine`, `TipoEventoTracking` da `@/types/produzione` (Task 1).
- Produce:
  - `TRACKING_VUOTO: TrackingOrdine`
  - `riassumiEventi(eventi: EventoTracking[]): TrackingOrdine`
  - `conFallbackInvio(t: TrackingOrdine, inviatoAt: string | null): TrackingOrdine`
  - `formattaDataOra(iso: string | null): string`
  - `righeTooltip(t: TrackingOrdine): string[]`
  - `righeFooterPdf(t: TrackingOrdine): string[]`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `lib/produzione-tracking.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  riassumiEventi,
  conFallbackInvio,
  formattaDataOra,
  righeTooltip,
  righeFooterPdf,
  TRACKING_VUOTO,
} from '@/lib/produzione-tracking'
import type { EventoTracking } from '@/types/produzione'

const ev = (
  tipo: EventoTracking['tipo'],
  avvenuto_at: string,
  destinatario: string | null = null
): EventoTracking => ({ tipo, avvenuto_at, destinatario })

const INVIO = '2026-07-28T09:42:00.000Z'
const APERTURA_MAIL = '2026-07-28T11:10:00.000Z'
const APERTURA_PAGINA = '2026-07-28T12:00:00.000Z'
const DOWNLOAD = '2026-07-28T12:03:00.000Z'

describe('riassumiEventi', () => {
  it('senza eventi risulta non inviato', () => {
    expect(riassumiEventi([])).toEqual(TRACKING_VUOTO)
  })

  it('con il solo invio risulta inviato, senza date di lettura', () => {
    const t = riassumiEventi([ev('inviato', INVIO, 'rossi@esempio.it')])
    expect(t.stato).toBe('inviato')
    expect(t.inviatoAt).toBe(INVIO)
    expect(t.destinatario).toBe('rossi@esempio.it')
    expect(t.emailApertaAt).toBeNull()
    expect(t.aperture).toBe(0)
    expect(t.invii).toBe(1)
  })

  it('con il pixel aperto risulta letto', () => {
    const t = riassumiEventi([ev('inviato', INVIO), ev('email_aperta', APERTURA_MAIL)])
    expect(t.stato).toBe('letto')
    expect(t.emailApertaAt).toBe(APERTURA_MAIL)
  })

  it('risulta letto anche col solo download, se il pixel è stato bloccato', () => {
    const t = riassumiEventi([ev('inviato', INVIO), ev('pdf_scaricato', DOWNLOAD)])
    expect(t.stato).toBe('letto')
    expect(t.emailApertaAt).toBeNull()
    expect(t.pdfScaricatoAt).toBe(DOWNLOAD)
  })

  it('il reinvio riporta lo stato a inviato e azzera le letture', () => {
    const reinvio = '2026-07-29T08:00:00.000Z'
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
      ev('pdf_scaricato', DOWNLOAD),
      ev('inviato', reinvio, 'nuovo@esempio.it'),
    ])
    expect(t.stato).toBe('inviato')
    expect(t.inviatoAt).toBe(reinvio)
    expect(t.destinatario).toBe('nuovo@esempio.it')
    expect(t.emailApertaAt).toBeNull()
    expect(t.pdfScaricatoAt).toBeNull()
    expect(t.aperture).toBe(0)
    expect(t.invii).toBe(2)
  })

  it('conta le aperture di pagina e i download, non il pixel', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO),
      ev('email_aperta', APERTURA_MAIL),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pdf_scaricato', DOWNLOAD),
    ])
    expect(t.aperture).toBe(2)
  })

  it('tiene la prima lettura di ciascun tipo dopo l ultimo invio', () => {
    const secondaApertura = '2026-07-28T15:00:00.000Z'
    const t = riassumiEventi([
      ev('inviato', INVIO),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pagina_aperta', secondaApertura),
    ])
    expect(t.paginaApertaAt).toBe(APERTURA_PAGINA)
    expect(t.aperture).toBe(2)
  })

  it('non dipende dall ordine in cui arrivano gli eventi', () => {
    const disordinati = [
      ev('pdf_scaricato', DOWNLOAD),
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
    ]
    expect(riassumiEventi(disordinati)).toEqual(
      riassumiEventi([...disordinati].reverse())
    )
  })

  it('non modifica l array ricevuto', () => {
    const eventi = [ev('pdf_scaricato', DOWNLOAD), ev('inviato', INVIO)]
    riassumiEventi(eventi)
    expect(eventi[0].tipo).toBe('pdf_scaricato')
  })
})

describe('conFallbackInvio', () => {
  it('mostra inviato per gli ordini spediti prima del tracking', () => {
    const t = conFallbackInvio(TRACKING_VUOTO, INVIO)
    expect(t.stato).toBe('inviato')
    expect(t.inviatoAt).toBe(INVIO)
    expect(t.invii).toBe(1)
  })

  it('lascia intatto un tracking che ha già eventi', () => {
    const reale = riassumiEventi([ev('inviato', INVIO), ev('pdf_scaricato', DOWNLOAD)])
    expect(conFallbackInvio(reale, '2020-01-01T00:00:00.000Z')).toEqual(reale)
  })

  it('resta non inviato se non c è nemmeno inviato_at', () => {
    expect(conFallbackInvio(TRACKING_VUOTO, null)).toEqual(TRACKING_VUOTO)
  })
})

describe('formattaDataOra', () => {
  it('formatta in ora italiana', () => {
    // 09:42 UTC in luglio = 11:42 a Roma
    expect(formattaDataOra(INVIO)).toBe('28/07/2026 11:42')
  })

  it('restituisce stringa vuota su null o data non valida', () => {
    expect(formattaDataOra(null)).toBe('')
    expect(formattaDataOra('non-una-data')).toBe('')
  })
})

describe('righeTooltip', () => {
  it('dice non inviato quando non c è nulla', () => {
    expect(righeTooltip(TRACKING_VUOTO)).toEqual(['Non inviato'])
  })

  it('mostra destinatario e data di invio', () => {
    const t = riassumiEventi([ev('inviato', INVIO, 'rossi@esempio.it')])
    expect(righeTooltip(t)).toEqual(['Inviato a rossi@esempio.it il 28/07/2026 11:42'])
  })

  it('omette il destinatario se non registrato', () => {
    const t = riassumiEventi([ev('inviato', INVIO)])
    expect(righeTooltip(t)).toEqual(['Inviato il 28/07/2026 11:42'])
  })

  it('elenca ogni evento di lettura registrato', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pdf_scaricato', DOWNLOAD),
    ])
    expect(righeTooltip(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
      'Email aperta il 28/07/2026 13:10',
      'Pagina aperta il 28/07/2026 14:00',
      'PDF scaricato il 28/07/2026 14:03',
      'Aperto 2 volte',
    ])
  })

  it('segnala i reinvii', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO),
      ev('inviato', '2026-07-29T08:00:00.000Z', 'rossi@esempio.it'),
    ])
    expect(righeTooltip(t)).toContain('Inviato 2 volte in tutto')
  })
})

describe('righeFooterPdf', () => {
  it('non scrive nulla se l ordine non è mai partito', () => {
    expect(righeFooterPdf(TRACKING_VUOTO)).toEqual([])
  })

  it('scrive la sola riga di invio se non risulta letto', () => {
    const t = riassumiEventi([ev('inviato', INVIO, 'rossi@esempio.it')])
    expect(righeFooterPdf(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
    ])
  })

  it('aggiunge l apertura del documento usando la prima fra pagina e download', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pdf_scaricato', DOWNLOAD),
    ])
    expect(righeFooterPdf(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
      'Documento aperto dal destinatario il 28/07/2026 14:00',
    ])
  })

  it('con il solo pixel parla di email, non di documento', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
    ])
    expect(righeFooterPdf(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
      'Email aperta dal destinatario il 28/07/2026 13:10',
    ])
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run lib/produzione-tracking.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/produzione-tracking"`.

- [ ] **Step 3: Scrivi l'implementazione**

Crea `lib/produzione-tracking.ts`:

```ts
import type { EventoTracking, TipoEventoTracking, TrackingOrdine } from '@/types/produzione'

export const TRACKING_VUOTO: TrackingOrdine = {
  stato: 'non_inviato',
  inviatoAt: null,
  destinatario: null,
  emailApertaAt: null,
  paginaApertaAt: null,
  pdfScaricatoAt: null,
  aperture: 0,
  invii: 0,
}

/**
 * Stato corrente a partire dallo storico completo. Contano solo gli eventi
 * successivi all'ultimo invio: un reinvio riporta l'indicatore a "inviato"
 * senza cancellare ciò che era successo prima.
 */
export function riassumiEventi(eventi: EventoTracking[]): TrackingOrdine {
  const ordinati = [...eventi].sort(
    (a, b) => Date.parse(a.avvenuto_at) - Date.parse(b.avvenuto_at)
  )
  const invii = ordinati.filter((e) => e.tipo === 'inviato')
  const ultimoInvio = invii[invii.length - 1]
  if (!ultimoInvio) return { ...TRACKING_VUOTO }

  const soglia = Date.parse(ultimoInvio.avvenuto_at)
  const letture = ordinati.filter(
    (e) => e.tipo !== 'inviato' && Date.parse(e.avvenuto_at) >= soglia
  )

  const primo = (tipo: TipoEventoTracking): string | null =>
    letture.find((e) => e.tipo === tipo)?.avvenuto_at ?? null

  return {
    stato: letture.length > 0 ? 'letto' : 'inviato',
    inviatoAt: ultimoInvio.avvenuto_at,
    destinatario: ultimoInvio.destinatario,
    emailApertaAt: primo('email_aperta'),
    paginaApertaAt: primo('pagina_aperta'),
    pdfScaricatoAt: primo('pdf_scaricato'),
    aperture: letture.filter(
      (e) => e.tipo === 'pagina_aperta' || e.tipo === 'pdf_scaricato'
    ).length,
    invii: invii.length,
  }
}

/**
 * Gli ordini spediti prima di questa funzione hanno `inviato_at` ma nessun
 * evento: vanno comunque mostrati come inviati, senza dati di lettura.
 */
export function conFallbackInvio(
  t: TrackingOrdine,
  inviatoAt: string | null
): TrackingOrdine {
  if (t.stato !== 'non_inviato' || !inviatoAt) return t
  return { ...t, stato: 'inviato', inviatoAt, invii: 1 }
}

/**
 * Data e ora in ora italiana. Fuso esplicito perché il server gira in UTC e
 * il documento è una prova di consegna: deve leggere l'ora di casa.
 */
export function formattaDataOra(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const p = (tipo: string): string => parti.find((x) => x.type === tipo)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`
}

const rigaInvio = (t: TrackingOrdine): string =>
  t.destinatario
    ? `Inviato a ${t.destinatario} il ${formattaDataOra(t.inviatoAt)}`
    : `Inviato il ${formattaDataOra(t.inviatoAt)}`

/** Righe del tooltip sull'icona di stato: il dettaglio completo. */
export function righeTooltip(t: TrackingOrdine): string[] {
  if (t.stato === 'non_inviato') return ['Non inviato']

  const righe = [rigaInvio(t)]
  if (t.emailApertaAt) righe.push(`Email aperta il ${formattaDataOra(t.emailApertaAt)}`)
  if (t.paginaApertaAt) righe.push(`Pagina aperta il ${formattaDataOra(t.paginaApertaAt)}`)
  if (t.pdfScaricatoAt) righe.push(`PDF scaricato il ${formattaDataOra(t.pdfScaricatoAt)}`)
  if (t.aperture > 1) righe.push(`Aperto ${t.aperture} volte`)
  if (t.invii > 1) righe.push(`Inviato ${t.invii} volte in tutto`)
  return righe
}

/** Righe del footer sul PDF: la ricevuta di consegna, sintetica. */
export function righeFooterPdf(t: TrackingOrdine): string[] {
  if (t.stato === 'non_inviato' || !t.inviatoAt) return []

  const righe = [rigaInvio(t)]

  const apertureDocumento = [t.paginaApertaAt, t.pdfScaricatoAt].filter(
    (v): v is string => v !== null
  )
  if (apertureDocumento.length > 0) {
    const prima = apertureDocumento.sort((a, b) => Date.parse(a) - Date.parse(b))[0]
    righe.push(`Documento aperto dal destinatario il ${formattaDataOra(prima)}`)
  } else if (t.emailApertaAt) {
    righe.push(`Email aperta dal destinatario il ${formattaDataOra(t.emailApertaAt)}`)
  }

  return righe
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run lib/produzione-tracking.test.ts`
Expected: PASS, tutti i test verdi.

Poi la suite intera, per assicurarsi di non aver rotto nulla:

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/produzione-tracking.ts lib/produzione-tracking.test.ts
git commit -m "feat: logica di riepilogo eventi tracking ordini"
```

---

### Task 3: Accesso ai dati

Due moduli separati per un motivo di sicurezza: la scrittura di eventi non deve diventare un endpoint pubblico chiamabile da chiunque, quindi non sta in un file `'use server'`.

**Files:**
- Create: `lib/produzione-tracking-db.ts`
- Create: `actions/produzione-tracking.ts`

**Interfaces:**
- Consuma: `riassumiEventi` da `@/lib/produzione-tracking` (Task 2); tipi da `@/types/produzione` (Task 1).
- Produce:
  - `getTrackingOrdini(ordineIds: string[]): Promise<Record<string, TrackingOrdine>>` — server action per le pagine dashboard
  - `registraEvento(ordineId, organizationId, tipo, dati?): Promise<void>`
  - `getOrdinePerToken(token: string): Promise<OrdinePerToken | null>` dove
    `OrdinePerToken = { id, organizationId, numeroOrdine, pdfInviatoPath }`
  - `getDatiPaginaOrdine(token: string): Promise<DatiPaginaOrdine | null>` dove
    `DatiPaginaOrdine = { ordineId, organizationId, numeroOrdine, dataOrdine, fornitoreNome, denominazione, logoUrl, pdfDisponibile }`

- [ ] **Step 1: Scrivi il modulo di accesso DB**

Crea `lib/produzione-tracking-db.ts`:

```ts
/**
 * Accesso al tracking con il service role. NON è un file 'use server':
 * `registraEvento` scrive eventi e non deve essere esposta come endpoint
 * pubblico. Importare solo da route handler e Server Component.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { formattaNumeroOrdine } from '@/lib/produzione'
import type { TipoEventoTracking } from '@/types/produzione'

export type OrdinePerToken = {
  id: string
  organizationId: string
  numeroOrdine: string
  pdfInviatoPath: string | null
}

export type DatiPaginaOrdine = {
  ordineId: string
  organizationId: string
  numeroOrdine: string
  dataOrdine: string
  fornitoreNome: string
  denominazione: string
  logoUrl: string | null
  pdfDisponibile: boolean
}

type DatiEvento = {
  destinatario?: string | null
  userAgent?: string | null
  ip?: string | null
  /** Se valorizzato, non scrive se esiste già lo stesso evento entro N secondi. */
  dedupSecondi?: number
}

/**
 * Scrive un evento. Non solleva mai: un errore qui non deve impedire al
 * fornitore di vedere il documento.
 */
export async function registraEvento(
  ordineId: string,
  organizationId: string,
  tipo: TipoEventoTracking,
  dati: DatiEvento = {}
): Promise<void> {
  const service = createServiceClient()

  try {
    if (dati.dedupSecondi && dati.dedupSecondi > 0) {
      const soglia = new Date(Date.now() - dati.dedupSecondi * 1000).toISOString()
      const { data: recenti } = await service
        .from('tracking_email_ordine')
        .select('id')
        .eq('ordine_id', ordineId)
        .eq('tipo', tipo)
        .gte('avvenuto_at', soglia)
        .limit(1)
      if (recenti && recenti.length > 0) return
    }

    const { error } = await service.from('tracking_email_ordine').insert({
      ordine_id: ordineId,
      organization_id: organizationId,
      tipo,
      destinatario: dati.destinatario ?? null,
      user_agent: dati.userAgent ?? null,
      ip: dati.ip ?? null,
    })
    if (error) console.error('[tracking ordine] insert:', error.message)
  } catch (e) {
    console.error('[tracking ordine] eccezione:', e instanceof Error ? e.message : e)
  }
}

export async function getOrdinePerToken(token: string): Promise<OrdinePerToken | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('ordini_fornitore')
    .select('id, organization_id, numero_ordine, pdf_inviato_path')
    .eq('tracking_token', token)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    organizationId: data.organization_id,
    numeroOrdine: data.numero_ordine,
    pdfInviatoPath: data.pdf_inviato_path,
  }
}

/** Tutto ciò che serve alla pagina pubblica, senza sessione utente. */
export async function getDatiPaginaOrdine(token: string): Promise<DatiPaginaOrdine | null> {
  const service = createServiceClient()

  const { data: ordine } = await service
    .from('ordini_fornitore')
    .select('id, organization_id, numero_ordine, data_ordine, pdf_inviato_path, fornitore_id')
    .eq('tracking_token', token)
    .maybeSingle()
  if (!ordine) return null

  const [{ data: fornitore }, { data: settings }] = await Promise.all([
    ordine.fornitore_id
      ? service.from('fornitori').select('nome').eq('id', ordine.fornitore_id).maybeSingle()
      : Promise.resolve({ data: null }),
    service
      .from('settings')
      .select('denominazione, logo_url')
      .eq('organization_id', ordine.organization_id)
      .maybeSingle(),
  ])

  let logoUrl: string | null = null
  if (settings?.logo_url) {
    const { data: firmato } = await service.storage
      .from('logos')
      .createSignedUrl(settings.logo_url, 3600)
    logoUrl = firmato?.signedUrl ?? null
  }

  return {
    ordineId: ordine.id,
    organizationId: ordine.organization_id,
    numeroOrdine: formattaNumeroOrdine(ordine.numero_ordine),
    dataOrdine: ordine.data_ordine,
    fornitoreNome: fornitore?.nome ?? '',
    denominazione: settings?.denominazione ?? 'A.L.M. Infissi',
    logoUrl,
    pdfDisponibile: Boolean(ordine.pdf_inviato_path),
  }
}
```

- [ ] **Step 2: Scrivi la server action per la dashboard**

Crea `actions/produzione-tracking.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { riassumiEventi } from '@/lib/produzione-tracking'
import type { EventoTracking, TipoEventoTracking, TrackingOrdine } from '@/types/produzione'

/**
 * Riepilogo di tracking per un gruppo di ordini, in una sola query.
 * La chiave della mappa è l'id ordine; ogni id richiesto è sempre presente.
 */
export async function getTrackingOrdini(
  ordineIds: string[]
): Promise<Record<string, TrackingOrdine>> {
  if (ordineIds.length === 0) return {}

  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data } = await supabase
    .from('tracking_email_ordine')
    .select('ordine_id, tipo, avvenuto_at, destinatario')
    .eq('organization_id', orgId)
    .in('ordine_id', ordineIds)

  const perOrdine = new Map<string, EventoTracking[]>()
  for (const riga of data ?? []) {
    const lista = perOrdine.get(riga.ordine_id) ?? []
    lista.push({
      tipo: riga.tipo as TipoEventoTracking,
      avvenuto_at: riga.avvenuto_at,
      destinatario: riga.destinatario,
    })
    perOrdine.set(riga.ordine_id, lista)
  }

  const risultato: Record<string, TrackingOrdine> = {}
  for (const id of ordineIds) {
    risultato[id] = riassumiEventi(perOrdine.get(id) ?? [])
  }
  return risultato
}
```

- [ ] **Step 3: Verifica compilazione e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning.

- [ ] **Step 4: Commit**

```bash
git add lib/produzione-tracking-db.ts actions/produzione-tracking.ts
git commit -m "feat: accesso dati tracking ordini (lettura dashboard, scrittura eventi)"
```

---

### Task 4: Icona di stato in tabella

Da qui l'utente vede qualcosa: l'indicatore compare, alimentato per ora dal solo `inviato_at` degli ordini già spediti.

**Files:**
- Create: `components/ui/tooltip.tsx` (generato da shadcn)
- Create: `components/produzione/StatoInvioOrdine.tsx`
- Modify: `components/produzione/ElencoOrdini.tsx`
- Modify: `components/produzione/ProduzioneCommessa.tsx`
- Modify: `app/(dashboard)/magazzino/ordini/page.tsx`
- Modify: `app/(dashboard)/produzione/[commessaId]/page.tsx`

**Interfaces:**
- Consuma: `getTrackingOrdini` (Task 3); `conFallbackInvio`, `righeTooltip`, `TRACKING_VUOTO` (Task 2).
- Produce: componente `StatoInvioOrdine` con props `{ tracking?: TrackingOrdine; inviatoAt: string | null }`; prop `tracking: Record<string, TrackingOrdine>` su `ElencoOrdini` e `ProduzioneCommessa`.

- [ ] **Step 1: Genera la primitiva tooltip**

Run: `npx shadcn@latest add tooltip`
Expected: crea `components/ui/tooltip.tsx`.

Apri il file generato e verifica se `Tooltip` include già `TooltipProvider` al suo interno (nelle versioni recenti sì). Se **non** lo include, il componente del passo successivo va avvolto in `<TooltipProvider>`.

- [ ] **Step 2: Scrivi il componente icona**

Crea `components/produzione/StatoInvioOrdine.tsx`:

```tsx
'use client'

import { Circle, Mail, CheckCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { conFallbackInvio, righeTooltip, TRACKING_VUOTO } from '@/lib/produzione-tracking'
import type { TrackingOrdine } from '@/types/produzione'

interface Props {
  tracking?: TrackingOrdine
  /** Colonna `inviato_at` dell'ordine: copre gli invii precedenti al tracking. */
  inviatoAt: string | null
}

export default function StatoInvioOrdine({ tracking, inviatoAt }: Props) {
  const t = conFallbackInvio(tracking ?? TRACKING_VUOTO, inviatoAt)
  const righe = righeTooltip(t)
  const descrizione = righe.join(' · ')

  const icona =
    t.stato === 'letto' ? (
      <CheckCheck className="h-4 w-4 text-green-600" />
    ) : t.stato === 'inviato' ? (
      <Mail className="h-4 w-4 text-gray-400" />
    ) : (
      <Circle className="h-4 w-4 text-gray-300" />
    )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Niente attributo title: raddoppierebbe il tooltip di shadcn.
            L'aria-label porta lo stesso testo agli screen reader. */}
        <span className="inline-flex" role="img" aria-label={descrizione}>
          {icona}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {righe.map((r) => (
          <div key={r}>{r}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
```

- [ ] **Step 3: Aggiungi la colonna in `ElencoOrdini.tsx`**

Aggiungi l'import del componente in cima e allarga l'`import type` già presente alla riga 24, senza crearne uno nuovo:

```tsx
import StatoInvioOrdine from '@/components/produzione/StatoInvioOrdine'
```

```tsx
import type { OrdineConContesto, OrdineCompleto, StatoOrdine, CommessaOpzione, TrackingOrdine } from '@/types/produzione'
```

Aggiungi la prop all'interfaccia `Props` e alla firma del componente:

```tsx
interface Props {
  ordini: OrdineConContesto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  commesse: CommessaOpzione[]
  numeroProposto: string
  intestazione: IntestazionePDF
  tracking: Record<string, TrackingOrdine>
}

export default function ElencoOrdini({
  ordini, fornitori, commesse, numeroProposto, intestazione, tracking,
}: Props) {
```

Nell'header della tabella, subito dopo `<th className="p-2 font-medium">Stato</th>`:

```tsx
                <th className="p-2 font-medium text-center">Invio</th>
```

Nel corpo, subito dopo la `<td>` che contiene la `<Select>` dello stato:

```tsx
                  <td className="p-2 text-center">
                    <StatoInvioOrdine tracking={tracking[o.id]} inviatoAt={o.inviato_at} />
                  </td>
```

- [ ] **Step 4: Aggiungi la colonna in `ProduzioneCommessa.tsx`**

Stesso import del componente; alla riga 26 allarga l'`import type` esistente:

```tsx
import type { OrdineCompleto, StatoOrdine, TrackingOrdine } from '@/types/produzione'
```

Aggiungi `tracking: Record<string, TrackingOrdine>` all'interfaccia `Props` e alla destrutturazione. Nella tabella degli ordini aggiungi la stessa `<th>` dopo la colonna Stato e la stessa `<td>` dopo la cella della `<Select>`:

```tsx
                        <th className="p-2 font-medium text-center">Invio</th>
```

```tsx
                        <td className="p-2 text-center">
                          <StatoInvioOrdine tracking={tracking[o.id]} inviatoAt={o.inviato_at} />
                        </td>
```

Allinea l'indentazione a quella delle celle vicine nel file.

- [ ] **Step 5: Passa i dati dalla pagina magazzino**

In `app/(dashboard)/magazzino/ordini/page.tsx`, aggiungi l'import:

```tsx
import { getTrackingOrdini } from '@/actions/produzione-tracking'
```

Dopo il blocco `Promise.all` esistente e prima di `logoUrl`:

```tsx
  const tracking = await getTrackingOrdini(ordini.map((o) => o.id))
```

E aggiungi la prop al componente:

```tsx
      <ElencoOrdini
        ordini={ordini}
        fornitori={fornitori}
        commesse={commesse}
        numeroProposto={numeroProposto}
        intestazione={intestazione}
        tracking={tracking}
      />
```

- [ ] **Step 6: Passa i dati dalla pagina commessa**

In `app/(dashboard)/produzione/[commessaId]/page.tsx`, stesso import. Dopo il `Promise.all`:

```tsx
  const tracking = await getTrackingOrdini(ordini.map((o) => o.id))
```

E aggiungi `tracking={tracking}` alle props di `<ProduzioneCommessa ... />`.

- [ ] **Step 7: Verifica**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Poi avvia `npm run dev`, apri `/magazzino/ordini` e controlla:
- ogni ordine ha un'icona nella colonna Invio;
- gli ordini con `inviato_at` valorizzato mostrano la busta grigia e, in hover, «Inviato il ...»;
- gli altri mostrano il cerchio grigio chiaro e «Non inviato».

- [ ] **Step 8: Commit**

```bash
git add components/ui/tooltip.tsx components/produzione/StatoInvioOrdine.tsx components/produzione/ElencoOrdini.tsx components/produzione/ProduzioneCommessa.tsx "app/(dashboard)/magazzino/ordini/page.tsx" "app/(dashboard)/produzione/[commessaId]/page.tsx"
git commit -m "feat: icona stato invio ordine in tabella"
```

---

### Task 5: Invio con snapshot, link tracciato e pixel

La route di invio cambia forma: crea la copia congelata, manda HTML con link e pixel invece dell'allegato, registra l'evento.

**Files:**
- Modify: `app/api/produzione/invia-ordine/route.ts`

**Interfaces:**
- Consuma: `registraEvento` da `@/lib/produzione-tracking-db` (Task 3).
- Produce: `ordini_fornitore.tracking_token` valorizzato, `pdf_inviato_path` valorizzato, evento `inviato` scritto. I percorsi pubblici del Task 6 dipendono da entrambi.

- [ ] **Step 1: Riscrivi la route**

Sostituisci l'intero contenuto di `app/api/produzione/invia-ordine/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getSettings } from '@/actions/impostazioni'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { registraEvento } from '@/lib/produzione-tracking-db'

const resend = new Resend(process.env.RESEND_API_KEY)

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function POST(request: Request) {
  try {
    const { ordineId } = (await request.json()) as { ordineId: string }
    const supabase = await createClient()
    const orgId = await getOrgId()

    const { data: ordine } = await supabase
      .from('ordini_fornitore')
      .select('id, numero_ordine, pdf_path, pdf_inviato_path, tracking_token, fornitore_id, commessa_id')
      .eq('id', ordineId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!ordine) return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })
    if (!ordine.pdf_path) {
      return NextResponse.json({ error: 'Genera prima il PDF dell\'ordine' }, { status: 400 })
    }
    if (!ordine.fornitore_id) {
      return NextResponse.json({ error: 'Ordine senza fornitore' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL non configurato: il link per il fornitore non sarebbe raggiungibile' },
        { status: 500 }
      )
    }

    const { data: fornitore } = await supabase
      .from('fornitori')
      .select('nome, email')
      .eq('id', ordine.fornitore_id)
      .maybeSingle()

    if (!fornitore?.email) {
      return NextResponse.json({ error: 'Il fornitore non ha un indirizzo email' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: file, error: downloadError } = await service.storage
      .from('commesse-docs')
      .download(ordine.pdf_path)
    if (downloadError || !file) {
      return NextResponse.json({ error: 'PDF non recuperabile' }, { status: 500 })
    }

    // Copia congelata servita al fornitore: path distinto da quello gestito da
    // salvaPdfOrdine, che alla prossima Anteprima rimuoverebbe il file.
    const snapshotPath = `${orgId}/ordini/${ordineId}/inviato-${Date.now()}.pdf`
    const { error: snapshotError } = await service.storage
      .from('commesse-docs')
      .upload(snapshotPath, Buffer.from(await file.arrayBuffer()), {
        contentType: 'application/pdf',
      })
    if (snapshotError) {
      return NextResponse.json(
        { error: `Copia per il fornitore non creata: ${snapshotError.message}` },
        { status: 500 }
      )
    }

    const token = ordine.tracking_token ?? randomUUID()
    const linkOrdine = `${appUrl}/o/${token}`
    const pixel = `${appUrl}/api/track/ordine/${token}`

    const settings = await getSettings()
    const azienda = settings?.denominazione || 'Azienda'
    const fromEmail = settings?.email || 'onboarding@resend.dev'
    const numeroOrdine = formattaNumeroOrdine(ordine.numero_ordine)

    const aziendaHtml = escapeHtml(azienda)
    const numeroHtml = escapeHtml(numeroOrdine)

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5">
  <p>Buongiorno,</p>
  <p>di seguito l'ordine <strong>${numeroHtml}</strong>.</p>
  <p style="margin:24px 0">
    <a href="${linkOrdine}" style="background:#0E8F9C;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">Visualizza l'ordine</a>
  </p>
  <p style="font-size:12px;color:#6b7280">Se il pulsante non funziona, copiate questo indirizzo nel browser:<br>${linkOrdine}</p>
  <p>Cordiali saluti<br>${aziendaHtml}</p>
  <img src="${pixel}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">
</div>`

    const text = `Buongiorno,\n\ndi seguito l'ordine ${numeroOrdine}:\n${linkOrdine}\n\nCordiali saluti\n${azienda}`

    const { error: sendError } = await resend.emails.send({
      from: `${azienda} <${fromEmail}>`,
      to: fornitore.email,
      subject: `Ordine ${numeroOrdine}`,
      html,
      text,
    })
    if (sendError) {
      // L'email non è partita: lo snapshot appena caricato non serve.
      await service.storage.from('commesse-docs').remove([snapshotPath])
      return NextResponse.json({ error: sendError.message }, { status: 500 })
    }

    await supabase
      .from('ordini_fornitore')
      .update({
        inviato_at: new Date().toISOString(),
        tracking_token: token,
        pdf_inviato_path: snapshotPath,
        stato: 'ordinato',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ordineId)
      .eq('organization_id', orgId)

    await registraEvento(ordineId, orgId, 'inviato', { destinatario: fornitore.email })

    // Rimuove lo snapshot precedente (best effort, non blocca l'esito).
    const vecchioSnapshot = ordine.pdf_inviato_path as string | null
    if (vecchioSnapshot && vecchioSnapshot !== snapshotPath) {
      await service.storage.from('commesse-docs').remove([vecchioSnapshot])
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore invio' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verifica compilazione e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add "app/api/produzione/invia-ordine/route.ts"
git commit -m "feat: invio ordine con link tracciato, snapshot PDF e pixel"
```

---

### Task 6: Percorsi pubblici per il fornitore

Pixel, pagina e download. Nessuna autenticazione: tutto si risolve dal token.

**Files:**
- Create: `app/api/track/ordine/[token]/route.ts`
- Create: `app/api/track/ordine/[token]/visita/route.ts`
- Create: `app/(public)/o/[token]/page.tsx`
- Create: `app/(public)/o/[token]/TracciaVisita.tsx`
- Create: `app/(public)/o/[token]/pdf/route.ts`

**Interfaces:**
- Consuma: `registraEvento`, `getOrdinePerToken`, `getDatiPaginaOrdine` (Task 3); `tracking_token` e `pdf_inviato_path` valorizzati dal Task 5.
- Produce: eventi `email_aperta`, `pagina_aperta`, `pdf_scaricato`.

- [ ] **Step 1: Crea il pixel**

Crea `app/api/track/ordine/[token]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrdinePerToken, registraEvento } from '@/lib/produzione-tracking-db'

// GIF 1×1 trasparente
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

const rispostaPixel = () =>
  new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  })

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ordine = await getOrdinePerToken(token)

  // Token sconosciuto: rispondiamo comunque con l'immagine, senza rivelare nulla.
  if (ordine) {
    await registraEvento(ordine.id, ordine.organizationId, 'email_aperta', {
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for'),
      // I client di posta richiedono l'immagine più volte per una sola apertura.
      dedupSecondi: 60,
    })
  }

  return rispostaPixel()
}
```

- [ ] **Step 2: Crea l'endpoint della visita**

Crea `app/api/track/ordine/[token]/visita/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrdinePerToken, registraEvento } from '@/lib/produzione-tracking-db'

/**
 * Chiamato dal browser del fornitore dopo il mount della pagina. Volutamente
 * non registrato lato server: i filtri antispam aziendali visitano i link
 * contenuti nelle email ma non eseguono JavaScript, e produrrebbero letture
 * che non sono mai avvenute.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ordine = await getOrdinePerToken(token)

  if (ordine) {
    await registraEvento(ordine.id, ordine.organizationId, 'pagina_aperta', {
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for'),
      dedupSecondi: 60,
    })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Crea il client component del beacon**

Crea `app/(public)/o/[token]/TracciaVisita.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'

export default function TracciaVisita({ token }: { token: string }) {
  const inviato = useRef(false)

  useEffect(() => {
    if (inviato.current) return
    inviato.current = true
    fetch(`/api/track/ordine/${token}/visita`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {
      // Il tracking non deve mai disturbare il fornitore.
    })
  }, [token])

  return null
}
```

- [ ] **Step 4: Crea la pagina pubblica**

Crea `app/(public)/o/[token]/page.tsx`. Il layout `(public)` fornisce già `<html>` e `<body>`:

```tsx
import { notFound } from 'next/navigation'
import { getDatiPaginaOrdine } from '@/lib/produzione-tracking-db'
import TracciaVisita from './TracciaVisita'

export const dynamic = 'force-dynamic'

export default async function PaginaOrdineFornitore({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const dati = await getDatiPaginaOrdine(token)
  if (!dati) notFound()

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <TracciaVisita token={token} />

      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        {dati.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dati.logoUrl} alt={dati.denominazione} className="h-12 mb-6 object-contain" />
        ) : (
          <p className="text-lg font-semibold text-gray-900 mb-6">{dati.denominazione}</p>
        )}

        <h1 className="text-xl font-bold text-gray-900">Ordine {dati.numeroOrdine}</h1>

        <dl className="mt-4 space-y-1 text-sm text-gray-600">
          {dati.fornitoreNome ? (
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Fornitore:</dt>
              <dd>{dati.fornitoreNome}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Data ordine:</dt>
            <dd>{dati.dataOrdine}</dd>
          </div>
        </dl>

        {dati.pdfDisponibile ? (
          <a
            href={`/o/${token}/pdf`}
            download
            className="mt-8 block w-full rounded-lg bg-[#0E8F9C] px-4 py-3 text-center font-medium text-white hover:opacity-90"
          >
            Scarica l&apos;ordine PDF
          </a>
        ) : (
          <p className="mt-8 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Il documento non è al momento disponibile. Contattate {dati.denominazione} per
            riceverne una copia.
          </p>
        )}

        <p className="mt-6 text-xs text-gray-400">Inviato da {dati.denominazione}</p>
      </div>
    </main>
  )
}
```

Un normale `<a>`, non `next/link`: evita il prefetch, che registrerebbe un download mai avvenuto.

- [ ] **Step 5: Crea il download tracciato**

Crea `app/(public)/o/[token]/pdf/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { getOrdinePerToken, registraEvento } from '@/lib/produzione-tracking-db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ordine = await getOrdinePerToken(token)
  if (!ordine || !ordine.pdfInviatoPath) {
    return new NextResponse('Documento non disponibile', { status: 404 })
  }

  await registraEvento(ordine.id, ordine.organizationId, 'pdf_scaricato', {
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for'),
  })

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from('commesse-docs')
    .download(ordine.pdfInviatoPath)
  if (error || !data) {
    return new NextResponse('Documento non disponibile', { status: 404 })
  }

  const nomeFile = `${formattaNumeroOrdine(ordine.numeroOrdine) || 'Ordine'}.pdf`

  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'no-store',
    },
  })
}
```

- [ ] **Step 6: Verifica compilazione, lint e build**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Run: `npm run build`
Expected: build completata. Se fallisce per `RESEND_API_KEY` mancante, valorizzala con un valore fittizio in `.env.local` e riprova.

- [ ] **Step 7: Prova locale della pagina**

Con `npm run dev`, prendi da Supabase un `tracking_token` qualsiasi (o inseriscine uno a mano su un ordine di prova con `execute_sql`) e apri `http://localhost:3000/o/<token>`. Verifica:
- la card compare con numero ordine e fornitore;
- in `tracking_email_ordine` compare una riga `pagina_aperta` per quell'ordine;
- ricaricando entro un minuto **non** compare una seconda riga (dedup);
- il pulsante scarica il PDF e scrive una riga `pdf_scaricato`.

Query di controllo:

```sql
SELECT tipo, avvenuto_at, destinatario
FROM tracking_email_ordine
WHERE ordine_id = '<id ordine>'
ORDER BY avvenuto_at;
```

- [ ] **Step 8: Commit**

```bash
git add "app/api/track/ordine" "app/(public)/o"
git commit -m "feat: pagina pubblica ordine, pixel e download tracciato"
```

---

### Task 7: Footer di avvenuta consegna sul PDF

L'ultimo pezzo: la prova stampabile.

**Files:**
- Modify: `components/produzione/OrdinePDF.tsx`
- Modify: `components/produzione/ElencoOrdini.tsx`
- Modify: `components/produzione/ProduzioneCommessa.tsx`

**Interfaces:**
- Consuma: `righeFooterPdf`, `conFallbackInvio`, `TRACKING_VUOTO` (Task 2); la prop `tracking` sulle due tabelle (Task 4).
- Produce: prop opzionale `tracking?: TrackingOrdine` su `OrdinePDF`.

- [ ] **Step 1: Aggiungi il footer a `OrdinePDF.tsx`**

Import in cima:

```tsx
import { righeFooterPdf } from '@/lib/produzione-tracking'
import type { OrdineCompleto, TrackingOrdine } from '@/types/produzione'
```

(la riga `import type { OrdineCompleto } from '@/types/produzione'` esistente va sostituita da questa)

Nello `StyleSheet.create`, modifica `page` e aggiungi `piePagina`:

```tsx
  page: { padding: 36, paddingBottom: 64, fontSize: 10, fontFamily: 'Helvetica' },
```

```tsx
  piePagina: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 6,
    fontSize: 8,
    color: '#666',
  },
```

Aggiungi la prop all'interfaccia:

```tsx
interface Props {
  ordine: OrdineCompleto
  intestazione: IntestazionePDF
  fornitoreNome: string
  numeroCommessa: string
  clienteNome: string
  /** Ricevuta di consegna: assente finché l'ordine non è stato inviato. */
  tracking?: TrackingOrdine
}

export default function OrdinePDF({
  ordine, intestazione, fornitoreNome, numeroCommessa, clienteNome, tracking,
}: Props) {
  const righeFooter = tracking ? righeFooterPdf(tracking) : []
```

E, come ultimo figlio di `<Page>`, subito prima di `</Page>`:

```tsx
        {righeFooter.length > 0 ? (
          <View style={styles.piePagina} fixed>
            {righeFooter.map((riga) => (
              <Text key={riga}>{riga}</Text>
            ))}
          </View>
        ) : null}
```

- [ ] **Step 2: Passa il tracking da `ElencoOrdini.tsx`**

Aggiungi l'import:

```tsx
import { conFallbackInvio, TRACKING_VUOTO } from '@/lib/produzione-tracking'
```

Dentro `generaPdf`, prima della chiamata a `pdf(...)`:

```tsx
      const trackingOrdine = conFallbackInvio(tracking[o.id] ?? TRACKING_VUOTO, o.inviato_at)
```

E aggiungi la prop al componente:

```tsx
        <OrdinePDF
          ordine={o}
          intestazione={intestazione}
          fornitoreNome={o.fornitore_nome ?? 'Fornitore non indicato'}
          numeroCommessa={numeroCommessa}
          clienteNome={clienteNome}
          tracking={trackingOrdine}
        />
```

- [ ] **Step 3: Passa il tracking da `ProduzioneCommessa.tsx`**

Stesso import. Dentro la sua `generaPdf` (che riceve anch'essa il parametro `o: OrdineCompleto`), prima della chiamata a `pdf(...)`:

```tsx
      const trackingOrdine = conFallbackInvio(tracking[o.id] ?? TRACKING_VUOTO, o.inviato_at)
```

e `tracking={trackingOrdine}` fra le props di `<OrdinePDF ... />`.

Sistema anche il commento diventato falso poco più sotto nella stessa funzione:

```tsx
      // Archivia e lega il PDF all'ordine (è quello che riceve il fornitore).
```

diventa:

```tsx
      // Archivia e lega il PDF all'ordine: è la copia interna, quella del
      // fornitore viene congelata al momento dell'invio in pdf_inviato_path.
```

- [ ] **Step 4: Verifica compilazione e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore.

- [ ] **Step 5: Verifica visiva**

Con `npm run dev`, apri `/magazzino/ordini`:
- su un ordine **mai inviato**, il pulsante Anteprima deve produrre un PDF identico a prima, senza footer;
- inserisci a mano un evento di invio su un ordine di prova e rigenera:

```sql
INSERT INTO tracking_email_ordine (organization_id, ordine_id, tipo, destinatario, avvenuto_at)
VALUES ('<org id>', '<id ordine>', 'inviato', 'prova@esempio.it', now() - interval '2 hours');
```

Ricarica la pagina e rigenera il PDF: in fondo deve comparire «Inviato a prova@esempio.it il ...». Verifica che il footer non si sovrapponga alle righe della tabella quando l'ordine ha molte righe (il `paddingBottom: 64` deve bastare).

- [ ] **Step 6: Commit**

```bash
git add components/produzione/OrdinePDF.tsx components/produzione/ElencoOrdini.tsx components/produzione/ProduzioneCommessa.tsx
git commit -m "feat: footer di avvenuta consegna sul PDF ordine"
```

---

### Task 8: Verifica completa e prova in produzione

Il pixel dipende dal client di posta reale e Resend non è simulabile in locale: la verifica finale si fa su Vercel.

**Files:** nessuno (solo verifica; eventuali correzioni nei file dei task precedenti).

- [ ] **Step 1: Suite completa in locale**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tutto verde, zero warning.

- [ ] **Step 2: Push e deploy**

```bash
git push -u origin tracking-email-ordini
```

Attendi il deploy preview di Vercel. Verifica che `NEXT_PUBLIC_APP_URL` sia impostata nell'ambiente usato: se punta al dominio di produzione mentre stai provando su un preview, il link e il pixel finiranno sull'ambiente sbagliato.

- [ ] **Step 3: Prova end-to-end**

Su un ordine di prova con un fornitore che ha come email un indirizzo tuo:
1. genera il PDF con Anteprima;
2. invia l'ordine — l'icona deve passare a busta grigia con «Inviato a ... il ...»;
3. apri l'email: se il client carica le immagini, ricaricando la pagina degli ordini l'icona diventa doppia spunta verde;
4. clicca «Visualizza l'ordine» — si apre la pagina pubblica, e l'icona diventa verde anche se il pixel era bloccato;
5. scarica il PDF dal pulsante — il tooltip deve elencare «PDF scaricato il ...»;
6. rigenera il PDF dal gestionale: il footer riporta invio e apertura;
7. reinvia lo stesso ordine: l'icona torna a busta grigia e il tooltip mostra «Inviato 2 volte in tutto».

Controlla lo storico:

```sql
SELECT tipo, avvenuto_at, destinatario, ip
FROM tracking_email_ordine
WHERE ordine_id = '<id ordine di prova>'
ORDER BY avvenuto_at;
```

- [ ] **Step 4: Pulisci i dati di prova**

```sql
DELETE FROM tracking_email_ordine WHERE ordine_id = '<id ordine di prova>';
```

- [ ] **Step 5: Aggiorna la documentazione**

In `docs/PRD-Laravel.md`, la sezione che elenca `GET /api/track/email/{id}` fra le rotte va estesa con le nuove:

```
GET    /o/{token}                        → pagina pubblica ordine fornitore
GET    /o/{token}/pdf                    → download tracciato dell'ordine
GET    /api/track/ordine/{token}         → pixel apertura email ordine
POST   /api/track/ordine/{token}/visita  → beacon apertura pagina
```

- [ ] **Step 6: Commit finale e merge**

```bash
git add docs/PRD-Laravel.md
git commit -m "docs: rotte tracking ordini fornitore"
git push
```

Poi usa la skill `superpowers:finishing-a-development-branch` per decidere come integrare il branch.

---

## Note per chi implementa

**Perché niente allegato.** È la domanda che verrà. Un PDF allegato non passa più dai nostri server una volta spedito: nessun evento è osservabile. Se qualcuno chiede di rimettere l'allegato "per comodità", il tracking del documento smette di funzionare nella maggior parte dei casi, perché il fornitore aprirà l'allegato e non il link.

**Perché il pixel non basta.** Gmail e Outlook bloccano le immagini remote per impostazione predefinita. Il pixel dà un dato in più quando c'è, ma il segnale su cui contare è il click sul link.

**Perché lo snapshot.** `salvaPdfOrdine` sostituisce `pdf_path` e cancella il file precedente a ogni Anteprima. Senza una copia su un path separato, il link del fornitore punterebbe a un file rimosso o modificato dopo l'invio.

**Cosa non fa questa implementazione.** Non manda notifiche all'admin: il segnale richiesto è l'icona. Non numera le pagine del PDF, perché gli allegati vengono uniti dopo la generazione e il conteggio risulterebbe sbagliato. Non fa scadere i link.
