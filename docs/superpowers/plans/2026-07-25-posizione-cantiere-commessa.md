# Posizione cantiere in commessa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrare/aprire la posizione GPS del cantiere di una commessa dal dialog Acconti, via GPS del dispositivo o link/coordinate Google Maps.

**Architecture:** Due colonne nullable `cantiere_lat`/`cantiere_lng` su `commesse`. Un helper puro `parseCoordinate` in `lib/geo.ts` (con test Vitest) estrae le coordinate da testo/URL. Il dialog Acconti (`DialogAcconto`) ottiene una sezione "Posizione cantiere" che salva via la server action esistente `updateCommessa`. Salvataggio solo online.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, shadcn/ui, Vitest, `navigator.geolocation`.

## Global Constraints

- `params`/`searchParams` sono `Promise` in Next.js 16 → `await` (non rilevante qui, nessuna nuova pagina).
- Business logic pura in `lib/` senza dipendenze React.
- Test con Vitest: import via alias `@/`; eseguire con `npm test` (= `vitest run`).
- `updateCommessa` esistente accetta `Partial<CommessaInput>` e fa `revalidatePath('/commesse','layout')` — riusarla, non crearne una nuova.
- Nessuna chiave API Google Maps, nessun costo: URL universale `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`.
- Salvataggio solo online: se `!isOnline`, toast e stop (nessuna coda di sync).
- Solo coordinate lat/lng: nessun campo indirizzo testuale.
- Zero warning eslint (unused vars) — `npm run build` deve passare pulito.

---

### Task 1: Helper `parseCoordinate` + test

**Files:**
- Create: `lib/geo.ts`
- Test: `lib/geo.test.ts`

**Interfaces:**
- Consumes: nulla.
- Produces: `parseCoordinate(text: string): { lat: number; lng: number } | null` e `mapsUrl(lat: number, lng: number): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/geo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseCoordinate, mapsUrl } from '@/lib/geo'

describe('parseCoordinate', () => {
  it('coordinate nude con virgola', () => {
    expect(parseCoordinate('41.9028, 12.4964')).toEqual({ lat: 41.9028, lng: 12.4964 })
  })

  it('coordinate nude con solo spazio', () => {
    expect(parseCoordinate('41.9028 12.4964')).toEqual({ lat: 41.9028, lng: 12.4964 })
  })

  it('coordinate negative', () => {
    expect(parseCoordinate('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 })
  })

  it('URL Maps con @lat,lng', () => {
    expect(parseCoordinate('https://www.google.com/maps/@41.9028,12.4964,15z')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL Maps con ?q=lat,lng', () => {
    expect(parseCoordinate('https://maps.google.com/?q=41.9028,12.4964')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL Maps con &query=lat,lng', () => {
    expect(parseCoordinate('https://www.google.com/maps/search/?api=1&query=41.9028,12.4964')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('URL Maps con !3dLAT!4dLNG', () => {
    expect(parseCoordinate('https://www.google.com/maps/place/X/data=!3d41.9028!4d12.4964')).toEqual({
      lat: 41.9028, lng: 12.4964,
    })
  })

  it('link accorciato non risolvibile → null', () => {
    expect(parseCoordinate('https://maps.app.goo.gl/abc123')).toBeNull()
  })

  it('coordinate fuori range → null', () => {
    expect(parseCoordinate('120, 200')).toBeNull()
  })

  it('stringa vuota → null', () => {
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
  })

  it('spazzatura → null', () => {
    expect(parseCoordinate('via roma 10')).toBeNull()
  })
})

describe('mapsUrl', () => {
  it('costruisce URL universale', () => {
    expect(mapsUrl(41.9028, 12.4964)).toBe(
      'https://www.google.com/maps/search/?api=1&query=41.9028,12.4964',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- geo`
Expected: FAIL — impossibile risolvere `@/lib/geo`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/geo.ts`:

```typescript
export type LatLng = { lat: number; lng: number }

function valida(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Estrae coordinate lat/lng da testo libero o da un URL Google Maps.
 * Riconosce: coordinate nude ("lat, lng" o "lat lng"), @lat,lng,
 * q=/query=lat,lng, !3dLAT!4dLNG. Ritorna null se non trova coordinate valide
 * (inclusi i link accorciati maps.app.goo.gl, che non contengono coordinate).
 */
export function parseCoordinate(text: string): LatLng | null {
  const s = (text ?? '').trim()
  if (!s) return null

  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'

  // @lat,lng
  const at = s.match(new RegExp(`@${num},${num}`))
  if (at) return valida(parseFloat(at[1]), parseFloat(at[2]))

  // q=lat,lng oppure query=lat,lng
  const q = s.match(new RegExp(`[?&](?:q|query)=${num},${num}`))
  if (q) return valida(parseFloat(q[1]), parseFloat(q[2]))

  // !3dLAT!4dLNG
  const bang = s.match(new RegExp(`!3d${num}!4d${num}`))
  if (bang) return valida(parseFloat(bang[1]), parseFloat(bang[2]))

  // coordinate nude: separatore virgola (con spazi opzionali) o solo spazi.
  // Escludo URL residui: se contiene 'http' e nessuno dei pattern sopra ha
  // fatto match, non è un formato di coordinate riconosciuto.
  if (!s.includes('http')) {
    const bare = s.match(new RegExp(`^${num}\\s*[, ]\\s*${num}$`))
    if (bare) return valida(parseFloat(bare[1]), parseFloat(bare[2]))
  }

  return null
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- geo`
Expected: PASS — tutti i casi verdi.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts
git commit -m "feat: helper parseCoordinate/mapsUrl per posizione cantiere"
```

---

### Task 2: Migrazione DB + tipi TypeScript

**Files:**
- Create: `supabase/migrations/20260725_posizione_cantiere.sql`
- Modify: `types/commessa.ts` (type `Commessa`, type `CommessaInput`)
- Modify: `actions/commesse.ts` (mapping ritorno di `getCommessaById`, righe ~153-164)

**Interfaces:**
- Consumes: nulla.
- Produces: campi `cantiere_lat: number | null` e `cantiere_lng: number | null` su `Commessa`; `cantiere_lat?: number | null` e `cantiere_lng?: number | null` su `CommessaInput`.

- [ ] **Step 1: Creare la migrazione SQL**

Create `supabase/migrations/20260725_posizione_cantiere.sql`:

```sql
-- Posizione GPS del cantiere (una per commessa)
alter table public.commesse
  add column if not exists cantiere_lat double precision,
  add column if not exists cantiere_lng double precision;
```

- [ ] **Step 2: Applicare la migrazione al progetto Supabase**

Applicare la migrazione al progetto remoto `xawyrtqclpeylxnhwhwo` (via Supabase MCP `apply_migration` con name `posizione_cantiere`, o via dashboard SQL editor con il contenuto del file). Nessuna RLS da modificare: le colonne ereditano le policy di `commesse`.

Verifica: la tabella `commesse` mostra le due nuove colonne nullable.

- [ ] **Step 3: Aggiungere i campi ai tipi**

In `types/commessa.ts`, dentro `export type Commessa = { ... }`, dopo `utile_manuale: number | null` (riga ~105):

```typescript
  cantiere_lat: number | null
  cantiere_lng: number | null
```

In `export type CommessaInput = { ... }`, dopo `utile_manuale?: number | null` (riga ~168):

```typescript
  cantiere_lat?: number | null
  cantiere_lng?: number | null
```

- [ ] **Step 4: Normalizzare i campi nel ritorno di `getCommessaById`**

In `actions/commesse.ts`, nell'oggetto restituito da `getCommessaById` (righe ~153-164), aggiungere accanto a `incasso_previsto`:

```typescript
    cantiere_lat: c.cantiere_lat != null ? Number(c.cantiere_lat) : null,
    cantiere_lng: c.cantiere_lng != null ? Number(c.cantiere_lng) : null,
```

- [ ] **Step 5: Verifica type-check/build**

Run: `npm run build`
Expected: build OK. Se fallisce solo per `RESEND_API_KEY` mancante (pre-esistente), è accettabile; nessun errore TypeScript su `commessa`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260725_posizione_cantiere.sql types/commessa.ts actions/commesse.ts
git commit -m "feat: colonne cantiere_lat/lng su commesse + tipi"
```

---

### Task 3: Sezione "Posizione cantiere" nel dialog Acconti

**Files:**
- Modify: `components/commesse/DialogAcconto.tsx`
- Modify: `components/commesse/TabellaCommesse.tsx` (dove viene renderizzato `<DialogAcconto .../>`, righe ~816-822)

**Interfaces:**
- Consumes: `parseCoordinate`, `mapsUrl` da `@/lib/geo`; `updateCommessa` da `@/actions/commesse`; `useOnlineStatus` (già importato nel file); campi `cantiere_lat`/`cantiere_lng` da `Commessa` (Task 2).
- Produces: props `commessaLat: number | null`, `commessaLng: number | null` su `DialogAcconto`.

- [ ] **Step 1: Passare le props dal chiamante**

In `components/commesse/TabellaCommesse.tsx`, nel blocco `<DialogAcconto ... />` (righe ~816-822), aggiungere dopo `acconti={dialogAcconto.acconti}`:

```tsx
          commessaLat={dialogAcconto.cantiere_lat}
          commessaLng={dialogAcconto.cantiere_lng}
```

- [ ] **Step 2: Estendere le props e gli import di `DialogAcconto`**

In `components/commesse/DialogAcconto.tsx`:

Aggiornare l'interfaccia `Props` (righe ~29-35) aggiungendo:

```typescript
  commessaLat: number | null
  commessaLng: number | null
```

Aggiornare la firma di funzione (riga ~53) per destrutturare le nuove props:

```typescript
export default function DialogAcconto({ open, onOpenChange, commessaId, clienteNome, acconti, commessaLat, commessaLng }: Props) {
```

Aggiornare gli import: alla riga di import di `@/actions/commesse` (riga ~23) aggiungere `updateCommessa`; aggiungere l'import icone e geo:

```typescript
import { addAcconto, deleteAcconto, updateCommessa } from '@/actions/commesse'
import { MapPin, Navigation, ExternalLink, X } from 'lucide-react'
import { parseCoordinate, mapsUrl } from '@/lib/geo'
```

(La riga import `lucide-react` esistente importa `Trash2, Plus`: unificarla in `import { Trash2, Plus, MapPin, Navigation, ExternalLink, X } from 'lucide-react'` per evitare import duplicati / warning eslint.)

- [ ] **Step 3: Aggiungere stato e handler della posizione**

In `DialogAcconto`, dopo gli `useState` esistenti (dopo riga ~58), aggiungere:

```typescript
  const [lat, setLat] = useState<number | null>(commessaLat)
  const [lng, setLng] = useState<number | null>(commessaLng)
  const [linkInput, setLinkInput] = useState('')
  const [editingPos, setEditingPos] = useState(false)
  const [savingPos, setSavingPos] = useState(false)

  const salvaPosizione = async (nLat: number | null, nLng: number | null) => {
    if (!isOnline) {
      toast.error('Connessione richiesta per salvare la posizione')
      return
    }
    setSavingPos(true)
    try {
      await updateCommessa(commessaId, { cantiere_lat: nLat, cantiere_lng: nLng })
      setLat(nLat)
      setLng(nLng)
      setLinkInput('')
      setEditingPos(false)
      toast.success(nLat === null ? 'Posizione rimossa' : 'Posizione salvata')
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio della posizione')
    } finally {
      setSavingPos(false)
    }
  }

  const usaPosizioneAttuale = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocalizzazione non disponibile su questo dispositivo')
      return
    }
    setSavingPos(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void salvaPosizione(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setSavingPos(false)
        toast.error('Impossibile ottenere la posizione (permesso negato o GPS assente)')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const salvaDaLink = () => {
    const parsed = parseCoordinate(linkInput)
    if (!parsed) {
      toast.error('Coordinate non riconosciute. Incolla il link Google Maps completo o coordinate "lat, lng".')
      return
    }
    void salvaPosizione(parsed.lat, parsed.lng)
  }
```

- [ ] **Step 4: Aggiungere la UI della sezione posizione**

In `DialogAcconto.tsx`, subito dopo `<DialogHeader>...</DialogHeader>` (dopo riga ~114) e prima del commento `{/* Lista acconti esistenti */}`, inserire:

```tsx
        {/* Posizione cantiere */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> Posizione cantiere
          </p>

          {lat !== null && lng !== null && !editingPos ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-mono">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={mapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
                  <Button type="button" size="sm" variant="outline" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> Apri in Google Maps
                  </Button>
                </a>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingPos(true)}>
                  Modifica
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-600 gap-1"
                  disabled={savingPos}
                  onClick={() => salvaPosizione(null, null)}
                >
                  <X className="h-3.5 w-3.5" /> Rimuovi
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                disabled={savingPos}
                onClick={usaPosizioneAttuale}
              >
                <Navigation className="h-3.5 w-3.5" />
                {savingPos ? 'Attendere...' : 'Usa posizione attuale'}
              </Button>
              <div className="flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Incolla link Maps o lat, lng"
                  className="text-sm"
                />
                <Button type="button" size="sm" variant="secondary" disabled={savingPos || !linkInput.trim()} onClick={salvaDaLink}>
                  Salva
                </Button>
              </div>
              {editingPos && (
                <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => setEditingPos(false)}>
                  Annulla
                </Button>
              )}
            </div>
          )}
        </div>

```

- [ ] **Step 5: Verifica build e lint**

Run: `npm run build`
Expected: build OK, nessun warning eslint su import inutilizzati o variabili non usate. (Se fallisce solo per `RESEND_API_KEY` mancante, accettabile.)

Run: `npm test`
Expected: tutti i test verdi (inclusi quelli di `geo`).

- [ ] **Step 6: Commit**

```bash
git add components/commesse/DialogAcconto.tsx components/commesse/TabellaCommesse.tsx
git commit -m "feat: sezione posizione cantiere nel dialog Acconti (GPS + link Maps)"
```

---

## Self-Review

**Spec coverage:**
- Colonne `cantiere_lat`/`cantiere_lng` → Task 2. ✓
- Tipi `Commessa`/`CommessaInput` + normalizzazione `getCommessaById` → Task 2. ✓
- Sezione posizione in `DialogAcconto` (GPS, incolla link, apri Maps, modifica, rimuovi) → Task 3. ✓
- Riuso `updateCommessa` → Task 3 (`salvaPosizione`). ✓
- Parsing coordinate + limite link accorciati + test → Task 1. ✓
- Salvataggio solo online (toast se offline) → Task 3 (`salvaPosizione`). ✓
- Solo coordinate, nessun indirizzo → rispettato ovunque. ✓
- URL universale `mapsUrl` → Task 1, usato in Task 3. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando concreto.

**Type consistency:** `parseCoordinate`/`mapsUrl` (Task 1) usati con le stesse firme in Task 3; props `commessaLat`/`commessaLng` coerenti tra TabellaCommesse (Task 3 Step 1) e DialogAcconto (Task 3 Step 2); campi `cantiere_lat`/`cantiere_lng` coerenti tra tipi (Task 2), action (Task 2) e componente (Task 3).
