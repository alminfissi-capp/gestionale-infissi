# Posizione cantiere in commessa — Design

Data: 2026-07-25

## Obiettivo

Permettere di registrare la posizione GPS del cantiere di una commessa, gestita
dalla scheda dove si vedono e registrano gli acconti (`DialogAcconto`). La
posizione può essere acquisita dal GPS del dispositivo ("Usa posizione attuale",
ideale in cantiere su mobile PWA) o incollando un link/coordinate Google Maps.
Una volta salvata, un pulsante apre la posizione in Google Maps.

## Decisioni

- **Una posizione per commessa** (il cantiere), non per acconto.
- **Gestita nel dialog Acconti**, in una sezione dedicata sopra la lista acconti.
- **Nessuna chiave API Google Maps / nessun costo**: si usa `navigator.geolocation`
  per il GPS e URL Google Maps universali per aprire la mappa.
- **Solo coordinate** (lat/lng), nessun campo indirizzo testuale.
- **Salvataggio solo online** per la v1: se offline, avviso e nessun salvataggio.
  Nessuna coda di sync (a differenza degli acconti). Il GPS in sé funziona offline,
  ma la persistenza richiede il server.

## Modello dati

Migrazione Supabase: aggiungere a `commesse` due colonne nullable:

| Colonna        | Tipo               | Note              |
|----------------|--------------------|-------------------|
| `cantiere_lat` | `double precision` | nullable          |
| `cantiere_lng` | `double precision` | nullable          |

Nessuna nuova tabella, nessun bucket. RLS invariata (eredita da `commesse`).

## Tipi TypeScript (`types/commessa.ts`)

- `Commessa`: aggiungere `cantiere_lat: number | null`, `cantiere_lng: number | null`.
- `CommessaInput`: aggiungere `cantiere_lat?: number | null`, `cantiere_lng?: number | null`.

`getCommessaById` fa `select('*')`, quindi i campi arrivano automaticamente; vanno
solo normalizzati a `Number | null` come gli altri numerici nel mapping del ritorno.

## Server action

Riuso di `updateCommessa(id, input: Partial<CommessaInput>)` esistente
(`actions/commesse.ts`), già usato con update parziale e `revalidatePath('/commesse','layout')`.
Nessuna nuova action.

## UI — `components/commesse/DialogAcconto.tsx`

### Props aggiuntive
- `commessaLat: number | null`
- `commessaLng: number | null`

Passate da `TabellaCommesse.tsx`, che ha già l'intera `CommessaCompleta` in
`dialogAcconto` (`dialogAcconto.cantiere_lat`, `dialogAcconto.cantiere_lng`).

### Sezione "Posizione cantiere" (sopra la lista acconti)

Stato locale inizializzato dalle props: `lat`, `lng`, `linkInput`, `savingPos`.

**Se lat/lng impostate:**
- Testo con le coordinate formattate (es. `41.90284, 12.49637`).
- Pulsante `🗺 Apri in Google Maps` → apre in nuova tab
  `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (apre l'app su mobile).
- Icona modifica (mostra il campo link/GPS) e icona rimuovi (salva lat/lng = null).

**Se non impostate:**
- Pulsante `📍 Usa posizione attuale`.
- Campo input per incollare link Google Maps o coordinate `lat, lng`.

### Interazioni

1. **Usa posizione attuale**: `navigator.geolocation.getCurrentPosition`
   → ottiene `coords.latitude/longitude` → salva. Gestire errore permessi negati
   e assenza di `navigator.geolocation` con toast.
2. **Incolla link/coordinate**: al blur/conferma, `parseCoordinate(linkInput)` →
   se valido salva, altrimenti toast di errore con istruzioni.
3. **Rimuovi**: `updateCommessa(id, { cantiere_lat: null, cantiere_lng: null })`.

Ogni salvataggio: se `!isOnline` → toast "Connessione richiesta per salvare la
posizione" e stop; altrimenti `updateCommessa(...)`, poi `router.refresh()` e toast.

### Parsing coordinate (helper, es. `lib/geo.ts` o inline nel componente)

`parseCoordinate(text: string): { lat: number; lng: number } | null`

Riconosce, in ordine:
1. Coordinate nude: `"41.9028, 12.4964"` (separatore virgola o spazio).
2. URL Maps con `@lat,lng` (es. `.../@41.9028,12.4964,15z`).
3. URL con query `?q=lat,lng` o `&query=lat,lng` o `!3dLAT!4dLNG`.

Validazione: lat ∈ [-90, 90], lng ∈ [-180, 180]; altrimenti `null`.

**Limite noto:** i link accorciati `maps.app.goo.gl` / `goo.gl/maps` non contengono
coordinate → `parseCoordinate` ritorna `null` e il toast invita a incollare il link
completo o a usare il GPS. Risoluzione lato server dei redirect fuori scope v1.

## Testing

Unit test (Vitest, già presente nel progetto) per `parseCoordinate`:
- coordinate nude valide (virgola e spazio),
- URL con `@lat,lng`,
- URL con `?q=` / `query=`,
- link accorciato → `null`,
- coordinate fuori range → `null`,
- stringa vuota / spazzatura → `null`.

La UI (geolocation, updateCommessa) non è coperta da test automatici: verifica
manuale in produzione (GPS richiede HTTPS + permessi browser, disponibili su Vercel).

## File toccati

- `supabase/migrations/NNN_posizione_cantiere.sql` (o migrazione via MCP) — nuovo
- `types/commessa.ts` — `Commessa`, `CommessaInput`
- `actions/commesse.ts` — mapping `getCommessaById` (normalizzazione lat/lng)
- `components/commesse/DialogAcconto.tsx` — sezione posizione + logica
- `components/commesse/TabellaCommesse.tsx` — passa le nuove props
- `lib/geo.ts` (+ test) — `parseCoordinate`

## Fuori scope (v1)

- Mappa interattiva con pin trascinabile.
- Coda di sincronizzazione offline per la posizione.
- Campo indirizzo testuale / geocoding.
- Risoluzione server dei link Maps accorciati.
