# Calendario digitale — Fondamenta e Gantt Produzione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire l'archivio unico degli eventi di calendario e la vista Gantt della Produzione, che riproduce in modo interattivo il foglio `Calendario A.L.M. WP` usato oggi in officina.

**Architecture:** Una tabella `eventi_calendario` con due flag di visibilità (`visibile_produzione`, `visibile_amministrazione`); le viste sono filtri su di essa. Orari di lavoro e chiusure vivono nelle impostazioni dell'organizzazione, e la griglia oraria nasce da lì. La logica pura (giorni aperti, posizionamento e impilamento delle barre, catene multi-giorno) sta in `lib/calendario.ts`, senza React né Supabase, coperta da test Vitest. Nessuna libreria calendario: il Gantt giorni × ore non esiste in nessuna, e il resto si scrive con CSS grid e `@dnd-kit`, già in progetto.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Supabase (Postgres + RLS), Tailwind 4, shadcn/ui, `@dnd-kit/core`, Vitest.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-19-calendario-digitale-design.md`

**Fuori ambito (piani successivi):** vista Amministrazione mese/settimana/giorno, riquadro dashboard, scadenze in calendario, notifiche email/WhatsApp al cliente.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260819120000_calendario.sql` | Tabelle `eventi_calendario` e `chiusure`, colonna `settings.orari_lavoro`, colonna `fornitori.categoria_calendario`, RLS |
| `types/calendario.ts` | Tutti i tipi del modulo. Nessuna logica |
| `lib/calendario.ts` | Logica pura: orari, giorni aperti, posizionamento barre, impilamento, catene, etichette |
| `lib/calendario.test.ts` | Test Vitest della logica pura |
| `actions/calendario.ts` | Server Actions: orari, chiusure, CRUD eventi, coda da pianificare |
| `components/impostazioni/FormOrariLavoro.tsx` | Orario per giorno della settimana |
| `components/impostazioni/FormChiusure.tsx` | Elenco date di chiusura |
| `components/calendario/GrigliaGantt.tsx` | Griglia giorni × ore, orchestra drag e drop |
| `components/calendario/BarraEvento.tsx` | Singola barra: colore, etichetta, drag, resize |
| `components/calendario/CodaDaPianificare.tsx` | Colonna laterale delle cose da collocare |
| `components/calendario/DialogEvento.tsx` | Creazione, modifica ed eliminazione evento |
| `components/calendario/ListaGiorniMobile.tsx` | Fallback elenco sotto i 900px |
| `components/calendario/StampaGantt.tsx` | Stampa A4 orizzontale |
| `components/calendario/CalendarioProduzione.tsx` | Client component che tiene lo stato del mese e monta le parti |

---

## Task 1: Migration del database

**Files:**
- Create: `supabase/migrations/20260819120000_calendario.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- Calendario digitale: un unico archivio di eventi con due viste.
-- La visibilita' e' una proprieta' del singolo evento (due flag), non del
-- calendario: nulla si riversa da una vista all'altra in automatico.

CREATE TABLE eventi_calendario (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tipo                     text        NOT NULL,
  titolo                   text,
  data                     date        NOT NULL,
  ora_inizio               time        NOT NULL,
  ora_fine                 time        NOT NULL,
  tutto_il_giorno          boolean     NOT NULL DEFAULT false,
  commessa_id              uuid        REFERENCES commesse(id) ON DELETE SET NULL,
  cliente_id               uuid        REFERENCES clienti(id) ON DELETE SET NULL,
  -- Snapshot testuale: nel gestionale esistono clienti fuori anagrafica, e
  -- l'etichetta ---CLIENTE--- deve funzionare anche senza cliente_id.
  cliente_nome             text,
  fornitore_id             uuid        REFERENCES fornitori(id) ON DELETE SET NULL,
  ordine_id                uuid        REFERENCES ordini_fornitore(id) ON DELETE SET NULL,
  scadenza_id              uuid        REFERENCES scadenze(id) ON DELETE CASCADE,
  -- Lega i giorni di una lavorazione continuativa: e' il connettore verticale
  -- disegnato a sinistra nel Gantt.
  catena_id                uuid,
  confermato_cliente       boolean     NOT NULL DEFAULT false,
  note                     text,
  visibile_produzione      boolean     NOT NULL DEFAULT true,
  visibile_amministrazione boolean     NOT NULL DEFAULT false,
  stato                    text        NOT NULL DEFAULT 'programmato',
  avvisato_email_at        timestamptz,
  avvisato_whatsapp_at     timestamptz,
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventi_calendario_ore_valide CHECK (ora_fine > ora_inizio),
  CONSTRAINT eventi_calendario_stato_valido
    CHECK (stato IN ('programmato', 'completato', 'annullato')),
  CONSTRAINT eventi_calendario_tipo_valido
    CHECK (tipo IN (
      'ricez_alluminio', 'lavorazione', 'ricez_vetri', 'ricez_accessori',
      'carico', 'posa',
      'appuntamento', 'impegno_interno', 'promemoria', 'scadenza'
    ))
);

CREATE INDEX eventi_calendario_org_data
  ON eventi_calendario (organization_id, data);
CREATE INDEX eventi_calendario_produzione
  ON eventi_calendario (organization_id, data) WHERE visibile_produzione;
CREATE INDEX eventi_calendario_amministrazione
  ON eventi_calendario (organization_id, data) WHERE visibile_amministrazione;
CREATE INDEX eventi_calendario_commessa ON eventi_calendario (commessa_id);
CREATE INDEX eventi_calendario_catena   ON eventi_calendario (catena_id);

-- Un ordine genera al massimo una ricezione; una scadenza compare una volta sola.
CREATE UNIQUE INDEX eventi_calendario_ordine_unico
  ON eventi_calendario (ordine_id) WHERE ordine_id IS NOT NULL;
CREATE UNIQUE INDEX eventi_calendario_scadenza_unica
  ON eventi_calendario (scadenza_id) WHERE scadenza_id IS NOT NULL;

ALTER TABLE eventi_calendario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON eventi_calendario
  FOR ALL USING (organization_id = get_user_organization_id());

-- Giorni di chiusura: date singole o intervalli (ferie, ponti, festivita').
CREATE TABLE chiusure (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data_inizio     date        NOT NULL,
  data_fine       date        NOT NULL,
  descrizione     text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chiusure_intervallo_valido CHECK (data_fine >= data_inizio)
);

CREATE INDEX chiusure_org_periodo ON chiusure (organization_id, data_inizio, data_fine);

ALTER TABLE chiusure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON chiusure
  FOR ALL USING (organization_id = get_user_organization_id());

-- Orari settimanali: array di 7 elementi, indice 0 = lunedi'. Le colonne orarie
-- del Gantt nascono da qui, non sono scritte nel codice.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS orari_lavoro jsonb
  NOT NULL DEFAULT '[
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "12:30"},
    {"aperto": false, "apertura": "08:00", "chiusura": "19:00"}
  ]'::jsonb;

-- Decide quale dei tre tipi di ricezione nasce da un ordine di quel fornitore.
ALTER TABLE fornitori ADD COLUMN IF NOT EXISTS categoria_calendario text
  CHECK (categoria_calendario IN ('alluminio', 'vetri', 'accessori'));
```

- [ ] **Step 2: Applicare la migration**

Applicare il file sul progetto Supabase `xawyrtqclpeylxnhwhwo` (MCP Supabase o dashboard SQL editor).
Atteso: nessun errore. Verificare con:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'eventi_calendario' ORDER BY ordinal_position;
```

Atteso: 25 colonne, da `id` a `updated_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819120000_calendario.sql
git commit -m "feat(calendario): tabelle eventi e chiusure, orari di lavoro, categoria fornitore"
```

---

## Task 2: Tipi TypeScript

**Files:**
- Create: `types/calendario.ts`

- [ ] **Step 1: Scrivere i tipi**

```ts
// types/calendario.ts

/** Tipi che nascono nel calendario della Produzione. */
export type TipoEventoProduzione =
  | 'ricez_alluminio'
  | 'lavorazione'
  | 'ricez_vetri'
  | 'ricez_accessori'
  | 'carico'
  | 'posa'

/** Tipi che nascono nel calendario dell'Amministrazione. */
export type TipoEventoAdmin =
  | 'appuntamento'
  | 'impegno_interno'
  | 'promemoria'
  | 'scadenza'

export type TipoEvento = TipoEventoProduzione | TipoEventoAdmin

export const TIPI_PRODUZIONE: TipoEventoProduzione[] = [
  'ricez_alluminio',
  'lavorazione',
  'ricez_vetri',
  'ricez_accessori',
  'carico',
  'posa',
]

/**
 * Aspetto della barra. Il colore deriva dal tipo e non e' scelto a mano:
 * la legenda appesa in officina deve restare vera.
 */
export type AspettoTipo = {
  label: string
  /** Colore di sfondo della barra, in esadecimale. */
  sfondo: string
  /** Colore del testo sopra lo sfondo. */
  testo: string
}

export const ASPETTO_TIPO: Record<TipoEvento, AspettoTipo> = {
  ricez_alluminio: { label: 'Ricez. Alluminio',      sfondo: '#6699CC', testo: '#0B1B2B' },
  lavorazione:     { label: 'Lavorazione',           sfondo: '#FF8C00', testo: '#2B1400' },
  ricez_vetri:     { label: 'Ricez. Vetri',          sfondo: '#00E5EE', testo: '#00252A' },
  ricez_accessori: { label: 'Ricez. Accessori',      sfondo: '#C8C8C8', testo: '#1F1F1F' },
  carico:          { label: 'Carico/Imballo/Trasp.', sfondo: '#FFFF00', testo: '#2B2B00' },
  posa:            { label: 'Posa/Consegna',         sfondo: '#A6D64B', testo: '#152300' },
  appuntamento:    { label: 'Appuntamento',          sfondo: '#7C6BF5', testo: '#FFFFFF' },
  impegno_interno: { label: 'Impegno interno',       sfondo: '#8A8A8A', testo: '#FFFFFF' },
  promemoria:      { label: 'Promemoria',            sfondo: '#E8B4B8', testo: '#2B0F12' },
  scadenza:        { label: 'Scadenza',              sfondo: '#D64545', testo: '#FFFFFF' },
}

export type StatoEvento = 'programmato' | 'completato' | 'annullato'

export type EventoCalendario = {
  id: string
  organization_id: string
  tipo: TipoEvento
  titolo: string | null
  /** 'YYYY-MM-DD' */
  data: string
  /** 'HH:MM' o 'HH:MM:SS' come arriva da Postgres */
  ora_inizio: string
  ora_fine: string
  tutto_il_giorno: boolean
  commessa_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  fornitore_id: string | null
  ordine_id: string | null
  scadenza_id: string | null
  catena_id: string | null
  confermato_cliente: boolean
  note: string | null
  visibile_produzione: boolean
  visibile_amministrazione: boolean
  stato: StatoEvento
  avvisato_email_at: string | null
  avvisato_whatsapp_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Evento arricchito con i nomi che servono all'etichetta della barra. */
export type EventoConContesto = EventoCalendario & {
  numero_commessa: string | null
  fornitore_nome: string | null
}

export type EventoInput = {
  tipo: TipoEvento
  titolo: string | null
  data: string
  ora_inizio: string
  ora_fine: string
  tutto_il_giorno: boolean
  commessa_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  fornitore_id: string | null
  ordine_id: string | null
  catena_id: string | null
  confermato_cliente: boolean
  note: string | null
  visibile_produzione: boolean
  visibile_amministrazione: boolean
}

/** Orario di un giorno della settimana. */
export type OrarioGiorno = {
  aperto: boolean
  /** 'HH:MM' */
  apertura: string
  chiusura: string
}

/** Sette elementi, indice 0 = lunedi'. */
export type OrariLavoro = OrarioGiorno[]

export const ORARI_LAVORO_DEFAULT: OrariLavoro = [
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '19:00' },
  { aperto: true,  apertura: '08:00', chiusura: '12:30' },
  { aperto: false, apertura: '08:00', chiusura: '19:00' },
]

export const GIORNI_SETTIMANA = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
] as const

export type Chiusura = {
  id: string
  organization_id: string
  data_inizio: string
  data_fine: string
  descrizione: string
  created_at: string
}

export type ChiusuraInput = {
  data_inizio: string
  data_fine: string
  descrizione: string
}

export type CategoriaFornitore = 'alluminio' | 'vetri' | 'accessori'

/** Tipo di ricezione generato da un ordine, per categoria del fornitore. */
export const RICEZIONE_PER_CATEGORIA: Record<CategoriaFornitore, TipoEventoProduzione> = {
  alluminio: 'ricez_alluminio',
  vetri:     'ricez_vetri',
  accessori: 'ricez_accessori',
}

/** Riga della coda "da pianificare": commessa senza attivita' o ordine senza ricezione. */
export type VoceDaPianificare =
  | {
      genere: 'commessa'
      id: string
      numero_commessa: string
      cliente_nome: string
      /** Quali fra lavorazione, posa e carico non sono ancora stati collocati. */
      tipi_mancanti: TipoEventoProduzione[]
    }
  | {
      genere: 'ordine'
      id: string
      numero_ordine: string
      fornitore_id: string | null
      fornitore_nome: string | null
      data_consegna_prevista: string
      /** Deriva da fornitori.categoria_calendario; 'ricez_accessori' se non impostata. */
      tipo_ricezione: TipoEventoProduzione
      categoria_mancante: boolean
    }
```

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore riferito a `types/calendario.ts`.

- [ ] **Step 3: Commit**

```bash
git add types/calendario.ts
git commit -m "feat(calendario): tipi del modulo"
```

---

## Task 3: Logica pura — orari e giorni aperti

**Files:**
- Create: `lib/calendario.ts`
- Create: `lib/calendario.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
// lib/calendario.test.ts
import { describe, it, expect } from 'vitest'
import {
  minutiDaOra,
  oraDaMinuti,
  indiceGiornoSettimana,
  statoGiorno,
  fasciaGriglia,
} from '@/lib/calendario'
import { ORARI_LAVORO_DEFAULT } from '@/types/calendario'
import type { Chiusura, OrariLavoro } from '@/types/calendario'

const chiusura = (
  data_inizio: string,
  data_fine: string,
  descrizione: string
): Chiusura => ({
  id: 'x', organization_id: 'o', data_inizio, data_fine, descrizione, created_at: '',
})

describe('minutiDaOra', () => {
  it('converte HH:MM in minuti dalla mezzanotte', () => {
    expect(minutiDaOra('08:00')).toBe(480)
    expect(minutiDaOra('12:30')).toBe(750)
  })

  it('accetta il formato HH:MM:SS che arriva da Postgres', () => {
    expect(minutiDaOra('08:00:00')).toBe(480)
  })
})

describe('oraDaMinuti', () => {
  it('converte i minuti in HH:MM con lo zero davanti', () => {
    expect(oraDaMinuti(480)).toBe('08:00')
    expect(oraDaMinuti(750)).toBe('12:30')
  })
})

describe('indiceGiornoSettimana', () => {
  it('usa 0 per lunedi e 6 per domenica', () => {
    // 2026-08-17 e' un lunedi
    expect(indiceGiornoSettimana('2026-08-17')).toBe(0)
    expect(indiceGiornoSettimana('2026-08-22')).toBe(5) // sabato
    expect(indiceGiornoSettimana('2026-08-23')).toBe(6) // domenica
  })
})

describe('statoGiorno', () => {
  it('e aperto in un giorno feriale', () => {
    const s = statoGiorno('2026-08-17', ORARI_LAVORO_DEFAULT, [])
    expect(s).toEqual({
      aperto: true, apertura: '08:00', chiusura: '19:00', motivoChiusura: null,
    })
  })

  it('il sabato chiude a mezzogiorno e mezzo', () => {
    const s = statoGiorno('2026-08-22', ORARI_LAVORO_DEFAULT, [])
    expect(s.aperto).toBe(true)
    expect(s.chiusura).toBe('12:30')
  })

  it('la domenica e chiusa e lo dice', () => {
    const s = statoGiorno('2026-08-23', ORARI_LAVORO_DEFAULT, [])
    expect(s.aperto).toBe(false)
    expect(s.motivoChiusura).toBe('Domenica')
  })

  it('una chiusura chiude anche un giorno feriale, con la sua descrizione', () => {
    const s = statoGiorno('2026-08-18', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-08-10', '2026-08-24', 'Ferie estive'),
    ])
    expect(s.aperto).toBe(false)
    expect(s.motivoChiusura).toBe('Ferie estive')
  })

  it('una chiusura fuori intervallo non tocca il giorno', () => {
    const s = statoGiorno('2026-08-18', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-12-25', '2026-12-25', 'Natale'),
    ])
    expect(s.aperto).toBe(true)
  })
})

describe('fasciaGriglia', () => {
  it('va dalla apertura piu presto alla chiusura piu tardi dei giorni aperti', () => {
    expect(fasciaGriglia(ORARI_LAVORO_DEFAULT)).toEqual({ inizio: '08:00', fine: '19:00' })
  })

  it('ignora i giorni chiusi nel calcolo', () => {
    const orari: OrariLavoro = ORARI_LAVORO_DEFAULT.map((g, i) =>
      i === 6 ? { aperto: false, apertura: '05:00', chiusura: '23:00' } : g
    )
    expect(fasciaGriglia(orari)).toEqual({ inizio: '08:00', fine: '19:00' })
  })

  it('si allarga se un giorno apre prima', () => {
    const orari: OrariLavoro = ORARI_LAVORO_DEFAULT.map((g, i) =>
      i === 0 ? { ...g, apertura: '07:30' } : g
    )
    expect(fasciaGriglia(orari).inizio).toBe('07:30')
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run lib/calendario.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/calendario"`.

- [ ] **Step 3: Scrivere l'implementazione minima**

```ts
// lib/calendario.ts
import type { Chiusura, OrariLavoro } from '@/types/calendario'

/** 'HH:MM' o 'HH:MM:SS' → minuti dalla mezzanotte. */
export function minutiDaOra(ora: string): number {
  const [h, m] = ora.split(':')
  return Number(h) * 60 + Number(m)
}

/** Minuti dalla mezzanotte → 'HH:MM'. */
export function oraDaMinuti(minuti: number): string {
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Indice del giorno della settimana con 0 = lunedi', per indicizzare OrariLavoro.
 * getDay() di JavaScript usa 0 = domenica, quindi va ruotato.
 */
export function indiceGiornoSettimana(data: string): number {
  const d = new Date(`${data}T00:00:00`)
  return (d.getDay() + 6) % 7
}

export type StatoGiorno = {
  aperto: boolean
  apertura: string
  chiusura: string
  /** Perche' e' chiuso: il nome del giorno o la descrizione della chiusura. */
  motivoChiusura: string | null
}

const NOMI_GIORNI = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
]

/**
 * Stato di un giorno: aperto o chiuso, con quali orari e per quale motivo.
 * Le chiusure hanno la precedenza sull'orario settimanale.
 */
export function statoGiorno(
  data: string,
  orari: OrariLavoro,
  chiusure: Chiusura[]
): StatoGiorno {
  const indice = indiceGiornoSettimana(data)
  const orario = orari[indice]

  const chiusuraAttiva = chiusure.find(
    (c) => data >= c.data_inizio && data <= c.data_fine
  )
  if (chiusuraAttiva) {
    return {
      aperto: false,
      apertura: orario.apertura,
      chiusura: orario.chiusura,
      motivoChiusura: chiusuraAttiva.descrizione,
    }
  }

  return {
    aperto: orario.aperto,
    apertura: orario.apertura,
    chiusura: orario.chiusura,
    motivoChiusura: orario.aperto ? null : NOMI_GIORNI[indice],
  }
}

/**
 * Estremi della griglia oraria: dall'apertura piu' presto alla chiusura piu'
 * tardi fra i giorni aperti. Le colonne del Gantt nascono da qui.
 */
export function fasciaGriglia(orari: OrariLavoro): { inizio: string; fine: string } {
  const aperti = orari.filter((g) => g.aperto)
  if (aperti.length === 0) return { inizio: '08:00', fine: '19:00' }
  const inizio = Math.min(...aperti.map((g) => minutiDaOra(g.apertura)))
  const fine = Math.max(...aperti.map((g) => minutiDaOra(g.chiusura)))
  return { inizio: oraDaMinuti(inizio), fine: oraDaMinuti(fine) }
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx vitest run lib/calendario.test.ts`
Expected: PASS, 12 test.

- [ ] **Step 5: Commit**

```bash
git add lib/calendario.ts lib/calendario.test.ts
git commit -m "feat(calendario): logica di orari, giorni aperti e fascia della griglia"
```

---

## Task 4: Logica pura — posizionamento e impilamento delle barre

**Files:**
- Modify: `lib/calendario.ts`
- Modify: `lib/calendario.test.ts`

- [ ] **Step 1: Aggiungere i test che falliscono**

Estendere l'import esistente **in testa** a `lib/calendario.test.ts` (`import/first` fa fallire il lint se un import finisce in fondo al file):

```ts
import {
  minutiDaOra,
  oraDaMinuti,
  indiceGiornoSettimana,
  statoGiorno,
  fasciaGriglia,
  posizioneBarra,
  impilaEventi,
  snapMinuti,
} from '@/lib/calendario'
```

e aggiungere in fondo al file:

```ts
const fascia = { inizio: '08:00', fine: '19:00' } // 660 minuti

describe('posizioneBarra', () => {
  it('un evento che parte all apertura inizia a sinistra', () => {
    const p = posizioneBarra('08:00', '09:00', fascia)
    expect(p.sinistraPct).toBeCloseTo(0)
    expect(p.larghezzaPct).toBeCloseTo((60 / 660) * 100)
  })

  it('un evento a meta giornata e posizionato in proporzione', () => {
    const p = posizioneBarra('13:00', '14:00', fascia)
    expect(p.sinistraPct).toBeCloseTo((300 / 660) * 100)
  })

  it('taglia un evento che sborda oltre la fine della griglia', () => {
    const p = posizioneBarra('18:00', '21:00', fascia)
    expect(p.sinistraPct + p.larghezzaPct).toBeCloseTo(100)
  })

  it('taglia un evento che inizia prima della griglia', () => {
    const p = posizioneBarra('06:00', '09:00', fascia)
    expect(p.sinistraPct).toBe(0)
    expect(p.larghezzaPct).toBeCloseTo((60 / 660) * 100)
  })
})

describe('impilaEventi', () => {
  const ev = (id: string, ora_inizio: string, ora_fine: string) =>
    ({ id, ora_inizio, ora_fine })

  it('mette su una sola riga eventi che non si sovrappongono', () => {
    const righe = impilaEventi([ev('a', '08:00', '10:00'), ev('b', '10:00', '12:00')])
    expect(righe.map((r) => r.riga)).toEqual([0, 0])
  })

  it('impila gli eventi sovrapposti su righe diverse', () => {
    const righe = impilaEventi([ev('a', '08:00', '12:00'), ev('b', '09:00', '10:00')])
    expect(righe.find((r) => r.id === 'a')!.riga).toBe(0)
    expect(righe.find((r) => r.id === 'b')!.riga).toBe(1)
  })

  it('riusa la prima riga libera invece di aprirne sempre una nuova', () => {
    const righe = impilaEventi([
      ev('a', '08:00', '12:00'),
      ev('b', '09:00', '10:00'),
      ev('c', '10:30', '11:00'),
    ])
    expect(righe.find((r) => r.id === 'c')!.riga).toBe(1)
  })

  it('ordina per ora di inizio anche se arrivano in disordine', () => {
    const righe = impilaEventi([ev('b', '10:00', '11:00'), ev('a', '08:00', '09:00')])
    expect(righe[0].id).toBe('a')
  })
})

describe('snapMinuti', () => {
  it('arrotonda al passo di 30 minuti piu vicino', () => {
    expect(snapMinuti(497)).toBe(510)
    expect(snapMinuti(492)).toBe(480)
  })

  it('accetta un passo diverso', () => {
    expect(snapMinuti(497, 15)).toBe(495)
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run lib/calendario.test.ts`
Expected: FAIL — `posizioneBarra is not a function` (e le altre due).

- [ ] **Step 3: Implementare**

Aggiungere in fondo a `lib/calendario.ts`:

```ts
export type Fascia = { inizio: string; fine: string }

export type PosizioneBarra = {
  /** Percentuale della larghezza della griglia. */
  sinistraPct: number
  larghezzaPct: number
}

/**
 * Posizione orizzontale di una barra dentro la griglia oraria, in percentuale.
 * Gli eventi che sbordano dalla fascia vengono tagliati ai bordi invece di
 * uscire dalla griglia.
 */
export function posizioneBarra(
  oraInizio: string,
  oraFine: string,
  fascia: Fascia
): PosizioneBarra {
  const gInizio = minutiDaOra(fascia.inizio)
  const gFine = minutiDaOra(fascia.fine)
  const durataGriglia = Math.max(1, gFine - gInizio)

  const inizio = Math.max(gInizio, Math.min(gFine, minutiDaOra(oraInizio)))
  const fine = Math.max(inizio, Math.min(gFine, minutiDaOra(oraFine)))

  return {
    sinistraPct: ((inizio - gInizio) / durataGriglia) * 100,
    larghezzaPct: ((fine - inizio) / durataGriglia) * 100,
  }
}

type Impilabile = { id: string; ora_inizio: string; ora_fine: string }

export type EventoImpilato<T extends Impilabile> = T & { riga: number }

/**
 * Assegna a ogni evento la riga verticale in cui disegnarlo dentro la giornata:
 * la prima riga in cui non si sovrappone a nulla. E' l'impilamento che nel
 * foglio in officina si vede quando piu' attivita' occupano la stessa fascia.
 */
export function impilaEventi<T extends Impilabile>(eventi: T[]): EventoImpilato<T>[] {
  const ordinati = [...eventi].sort((a, b) => {
    const d = minutiDaOra(a.ora_inizio) - minutiDaOra(b.ora_inizio)
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })

  // Per ogni riga, il minuto in cui si libera.
  const fineRiga: number[] = []
  return ordinati.map((evento) => {
    const inizio = minutiDaOra(evento.ora_inizio)
    const fine = minutiDaOra(evento.ora_fine)
    let riga = fineRiga.findIndex((f) => f <= inizio)
    if (riga === -1) riga = fineRiga.length
    fineRiga[riga] = fine
    return { ...evento, riga }
  })
}

/** Arrotonda i minuti al passo della griglia, per lo snap del trascinamento. */
export function snapMinuti(minuti: number, passo = 30): number {
  return Math.round(minuti / passo) * passo
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx vitest run lib/calendario.test.ts`
Expected: PASS, 22 test.

- [ ] **Step 5: Commit**

```bash
git add lib/calendario.ts lib/calendario.test.ts
git commit -m "feat(calendario): posizionamento e impilamento delle barre"
```

---

## Task 5: Logica pura — etichette e catene multi-giorno

**Files:**
- Modify: `lib/calendario.ts`
- Modify: `lib/calendario.test.ts`

- [ ] **Step 1: Aggiungere i test che falliscono**

Aggiungere `etichettaEvento` ed `espandiCatena` all'import **in testa** al file, poi aggiungere in fondo:

```ts
describe('etichettaEvento', () => {
  it('compone tipo e cliente come sul foglio in officina', () => {
    expect(
      etichettaEvento({
        tipo: 'lavorazione',
        titolo: null,
        cliente_nome: 'MARCELLO ZAMUELI',
        fornitore_nome: null,
      })
    ).toBe('Lavorazione ---MARCELLO ZAMUELI---')
  })

  it('infila il fornitore fra tipo e cliente nelle ricezioni', () => {
    expect(
      etichettaEvento({
        tipo: 'ricez_vetri',
        titolo: null,
        cliente_nome: 'SPAGNA',
        fornitore_nome: 'METALVETRO',
      })
    ).toBe('Ricez. Vetri METALVETRO ---SPAGNA---')
  })

  it('usa il titolo quando non c e un cliente', () => {
    expect(
      etichettaEvento({
        tipo: 'promemoria',
        titolo: 'Chiamare il commercialista',
        cliente_nome: null,
        fornitore_nome: null,
      })
    ).toBe('Chiamare il commercialista')
  })

  it('ripiega sull etichetta del tipo se non c e altro', () => {
    expect(
      etichettaEvento({ tipo: 'carico', titolo: null, cliente_nome: null, fornitore_nome: null })
    ).toBe('Carico/Imballo/Trasp.')
  })
})

describe('espandiCatena', () => {
  it('genera un giorno per volta a partire dalla data di inizio', () => {
    const giorni = espandiCatena('2026-08-17', 3, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [])
    expect(giorni.map((g) => g.data)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
    expect(giorni[0]).toEqual({ data: '2026-08-17', ora_inizio: '08:00', ora_fine: '17:30' })
  })

  it('salta i giorni chiusi senza consumarli dal conteggio', () => {
    // 2026-08-21 e' venerdi, 22 sabato, 23 domenica, 24 lunedi
    const giorni = espandiCatena('2026-08-21', 3, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [])
    expect(giorni.map((g) => g.data)).toEqual(['2026-08-21', '2026-08-22', '2026-08-24'])
  })

  it('accorcia l orario di fine se il giorno chiude prima', () => {
    const giorni = espandiCatena('2026-08-22', 1, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [])
    expect(giorni[0].ora_fine).toBe('12:30')
  })

  it('salta anche le chiusure straordinarie', () => {
    const giorni = espandiCatena('2026-08-17', 2, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-08-18', '2026-08-18', 'Ponte'),
    ])
    expect(giorni.map((g) => g.data)).toEqual(['2026-08-17', '2026-08-19'])
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run lib/calendario.test.ts`
Expected: FAIL — `etichettaEvento is not a function`.

- [ ] **Step 3: Implementare**

Aggiungere in fondo a `lib/calendario.ts` (e completare l'import in testa al file con `ASPETTO_TIPO` e `TipoEvento`):

```ts
// In testa al file, sostituire la riga di import con:
// import { ASPETTO_TIPO } from '@/types/calendario'
// import type { Chiusura, OrariLavoro, TipoEvento } from '@/types/calendario'

type Etichettabile = {
  tipo: TipoEvento
  titolo: string | null
  cliente_nome: string | null
  fornitore_nome: string | null
}

/**
 * Testo della barra, nella forma usata sul foglio appeso in officina:
 * "Ricez. Vetri METALVETRO ---SPAGNA---".
 */
export function etichettaEvento(evento: Etichettabile): string {
  const cliente = evento.cliente_nome?.trim()
  if (cliente) {
    const parti = [ASPETTO_TIPO[evento.tipo].label]
    const fornitore = evento.fornitore_nome?.trim()
    if (fornitore) parti.push(fornitore)
    return `${parti.join(' ')} ---${cliente}---`
  }

  const titolo = evento.titolo?.trim()
  if (titolo) return titolo

  return ASPETTO_TIPO[evento.tipo].label
}

/** Somma giorni a una data 'YYYY-MM-DD' restando in fuso locale. */
function aggiungiGiorni(data: string, giorni: number): string {
  const d = new Date(`${data}T00:00:00`)
  d.setDate(d.getDate() + giorni)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export type GiornoCatena = { data: string; ora_inizio: string; ora_fine: string }

/**
 * Espande una lavorazione continuativa in una riga per giorno lavorativo.
 * I giorni chiusi vengono saltati e non consumano il conteggio; se un giorno
 * chiude prima dell'orario richiesto, la giornata si accorcia.
 * Il limite di 200 iterazioni evita di girare a vuoto se tutto e' chiuso.
 */
export function espandiCatena(
  dataInizio: string,
  numeroGiorni: number,
  oraInizio: string,
  oraFine: string,
  orari: OrariLavoro,
  chiusure: Chiusura[]
): GiornoCatena[] {
  const giorni: GiornoCatena[] = []
  let data = dataInizio
  let tentativi = 0

  while (giorni.length < numeroGiorni && tentativi < 200) {
    tentativi++
    const stato = statoGiorno(data, orari, chiusure)
    if (stato.aperto) {
      const fine = Math.min(minutiDaOra(oraFine), minutiDaOra(stato.chiusura))
      const inizio = Math.max(minutiDaOra(oraInizio), minutiDaOra(stato.apertura))
      if (fine > inizio) {
        giorni.push({
          data,
          ora_inizio: oraDaMinuti(inizio),
          ora_fine: oraDaMinuti(fine),
        })
      }
    }
    data = aggiungiGiorni(data, 1)
  }

  return giorni
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx vitest run lib/calendario.test.ts`
Expected: PASS, 30 test.

- [ ] **Step 5: Commit**

```bash
git add lib/calendario.ts lib/calendario.test.ts
git commit -m "feat(calendario): etichette delle barre e catene multi-giorno"
```

---

## Task 6: Modulo permessi "calendario"

Il modulo va aggiunto in **cinque punti**: dimenticare `MODULO_HOME` ripete l'inciampo già visto con la dashboard, dove `primoModuloAccessibile` non sapeva dove mandare l'utente.

**Files:**
- Modify: `types/permessi.ts`
- Modify: `lib/permessi.ts:44-56` (`MODULO_HOME`)
- Modify: `components/layout/Sidebar.tsx:43-57`

- [ ] **Step 1: Aggiungere il modulo ai tipi**

In `types/permessi.ts`, inserire `'calendario'` in `MODULI_APP` subito dopo `'dashboard'`, e la riga corrispondente nei tre Record:

```ts
export const MODULI_APP = [
  'dashboard',
  'calendario',
  'preventivi',
  // …invariato
] as const

export const MODULO_LABELS: Record<ModuloApp, string> = {
  dashboard:    'Dashboard',
  calendario:   'Calendario',
  // …invariato
}

export const PERMESSI_ADMIN: PermessiUtente = {
  dashboard:    'scrittura',
  calendario:   'scrittura',
  // …invariato
}

export const PERMESSI_VUOTI: PermessiUtente = {
  dashboard:    'nessuno',
  calendario:   'nessuno',
  // …invariato
}
```

- [ ] **Step 2: Aggiungere la rotta home**

In `lib/permessi.ts`, dentro `MODULO_HOME`:

```ts
const MODULO_HOME: Record<ModuloApp, string> = {
  dashboard:    '/',
  calendario:   '/calendario',
  preventivi:   '/preventivi',
  // …invariato
}
```

- [ ] **Step 3: Aggiungere la voce in barra laterale**

In `components/layout/Sidebar.tsx`, aggiungere `CalendarDays` agli import da `lucide-react` e la voce subito dopo la dashboard:

```tsx
  { href: '/',           label: 'Dashboard',  icon: LayoutDashboard, modulo: 'dashboard' },
  { href: '/calendario', label: 'Calendario', icon: CalendarDays,    modulo: 'calendario' },
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore. TypeScript segnala da solo se un `Record<ModuloApp, …>` è rimasto incompleto: se compila, i cinque punti sono coperti.

- [ ] **Step 5: Commit**

```bash
git add types/permessi.ts lib/permessi.ts components/layout/Sidebar.tsx
git commit -m "feat(calendario): modulo permessi e voce in barra laterale"
```

---

## Task 7: Server Actions — orari di lavoro e chiusure

**Files:**
- Create: `actions/calendario.ts`

- [ ] **Step 1: Scrivere le action**

```ts
// actions/calendario.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { requireAccesso } from '@/lib/permessi'
import { getSettings } from '@/actions/impostazioni'
import { ORARI_LAVORO_DEFAULT } from '@/types/calendario'
import type {
  Chiusura,
  ChiusuraInput,
  OrariLavoro,
  OrarioGiorno,
} from '@/types/calendario'

const RE_ORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Normalizza quello che arriva dal database o dal form in sette giorni validi.
 * Un JSON malformato non deve mai far esplodere il calendario: si ripiega
 * sui valori di partenza.
 */
function normalizzaOrari(grezzo: unknown): OrariLavoro {
  if (!Array.isArray(grezzo) || grezzo.length !== 7) return ORARI_LAVORO_DEFAULT
  return grezzo.map((g, i): OrarioGiorno => {
    const base = ORARI_LAVORO_DEFAULT[i]
    if (typeof g !== 'object' || g === null) return base
    const o = g as Record<string, unknown>
    const apertura = typeof o.apertura === 'string' && RE_ORA.test(o.apertura)
      ? o.apertura : base.apertura
    const chiusura = typeof o.chiusura === 'string' && RE_ORA.test(o.chiusura)
      ? o.chiusura : base.chiusura
    return {
      aperto: typeof o.aperto === 'boolean' ? o.aperto : base.aperto,
      apertura,
      chiusura: chiusura > apertura ? chiusura : base.chiusura,
    }
  })
}

export async function getOrariLavoro(): Promise<OrariLavoro> {
  const settings = await getSettings()
  return normalizzaOrari(settings?.orari_lavoro)
}

export async function setOrariLavoro(orari: OrariLavoro): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('settings')
    .upsert(
      { organization_id: orgId, orari_lavoro: normalizzaOrari(orari) },
      { onConflict: 'organization_id' }
    )
  if (error) throw new Error(error.message)

  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

export async function getChiusure(): Promise<Chiusura[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('chiusure')
    .select('*')
    .eq('organization_id', orgId)
    .order('data_inizio', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createChiusura(input: ChiusuraInput): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  if (input.data_fine < input.data_inizio) {
    throw new Error('La data di fine non può precedere quella di inizio')
  }
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('chiusure')
    .insert({ organization_id: orgId, ...input })
  if (error) throw new Error(error.message)

  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

export async function deleteChiusura(id: string): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('chiusure')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
}
```

- [ ] **Step 2: Aggiungere `orari_lavoro` al tipo Settings**

In `types/impostazioni.ts`, dentro `export type Settings`, prima di `created_at`. Il tipo è `unknown` di proposito: è JSON grezzo dal database, e l'unico modo lecito di leggerlo è passare da `normalizzaOrari`.

```ts
  /** Sette elementi, indice 0 = lunedì. Vedi types/calendario.ts */
  orari_lavoro: unknown
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add actions/calendario.ts types/impostazioni.ts
git commit -m "feat(calendario): action per orari di lavoro e chiusure"
```

---

## Task 8: Impostazioni — orari di lavoro

**Files:**
- Create: `components/impostazioni/FormOrariLavoro.tsx`
- Modify: `app/(dashboard)/impostazioni/page.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
// components/impostazioni/FormOrariLavoro.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { setOrariLavoro } from '@/actions/calendario'
import { GIORNI_SETTIMANA } from '@/types/calendario'
import type { OrariLavoro, OrarioGiorno } from '@/types/calendario'

export default function FormOrariLavoro({ iniziali }: { iniziali: OrariLavoro }) {
  const router = useRouter()
  const [orari, setOrari] = useState<OrariLavoro>(iniziali)
  const [loading, setLoading] = useState(false)

  const aggiorna = (indice: number, patch: Partial<OrarioGiorno>) => {
    setOrari((prec) => prec.map((g, i) => (i === indice ? { ...g, ...patch } : g)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const invalido = orari.find((g) => g.aperto && g.chiusura <= g.apertura)
    if (invalido) {
      toast.error('La chiusura deve venire dopo l’apertura')
      return
    }
    setLoading(true)
    try {
      await setOrariLavoro(orari)
      toast.success('Orari salvati')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {orari.map((giorno, i) => (
        <div key={GIORNI_SETTIMANA[i]} className="flex items-center gap-3">
          <div className="w-28 text-sm text-gray-700 dark:text-gray-300">
            {GIORNI_SETTIMANA[i]}
          </div>
          <Switch
            checked={giorno.aperto}
            onCheckedChange={(aperto) => aggiorna(i, { aperto })}
            aria-label={`${GIORNI_SETTIMANA[i]} aperto`}
          />
          {giorno.aperto ? (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={giorno.apertura}
                onChange={(e) => aggiorna(i, { apertura: e.target.value })}
                className="w-32"
              />
              <span className="text-gray-400">→</span>
              <Input
                type="time"
                value={giorno.chiusura}
                onChange={(e) => aggiorna(i, { chiusura: e.target.value })}
                className="w-32"
              />
            </div>
          ) : (
            <span className="text-sm text-gray-400">chiuso</span>
          )}
        </div>
      ))}

      <Button type="submit" disabled={loading}>
        {loading ? 'Salvataggio…' : 'Salva orari'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Montarlo nella pagina impostazioni**

In `app/(dashboard)/impostazioni/page.tsx`: aggiungere gli import

```tsx
import { getOrariLavoro, getChiusure } from '@/actions/calendario'
import FormOrariLavoro from '@/components/impostazioni/FormOrariLavoro'
```

aggiungere `getOrariLavoro()` e `getChiusure()` al `Promise.all` esistente

```tsx
  const [settings, templates, conti, orariLavoro, chiusure] = await Promise.all([
    getSettings(),
    getNoteTemplates(),
    getConti(),
    getOrariLavoro(),
    getChiusure(),
  ])
```

e inserire la Card, seguendo la forma delle altre già presenti nella pagina:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Orari di lavoro</CardTitle>
          <CardDescription>
            Determinano le colonne del calendario di produzione, il sabato a mezza
            giornata e i giorni chiusi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormOrariLavoro iniziali={orariLavoro} />
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verificare a mano**

Run: `npm run dev`, aprire `/impostazioni`.
Expected: la card "Orari di lavoro" mostra i sette giorni con sabato `08:00 → 12:30` e domenica chiusa. Cambiare il sabato in `13:00`, salvare, ricaricare: il valore resta.

- [ ] **Step 4: Commit**

```bash
git add components/impostazioni/FormOrariLavoro.tsx "app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(calendario): impostazione degli orari di lavoro settimanali"
```

---

## Task 9: Impostazioni — giorni di chiusura

**Files:**
- Create: `components/impostazioni/FormChiusure.tsx`
- Modify: `app/(dashboard)/impostazioni/page.tsx`

- [ ] **Step 1: Scrivere il componente**

```tsx
// components/impostazioni/FormChiusure.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createChiusura, deleteChiusura } from '@/actions/calendario'
import type { Chiusura } from '@/types/calendario'

const formatta = (data: string) => data.split('-').reverse().join('/')

export default function FormChiusure({ chiusure }: { chiusure: Chiusura[] }) {
  const router = useRouter()
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dataInizio || !descrizione.trim()) {
      toast.error('Servono almeno la data e una descrizione')
      return
    }
    setLoading(true)
    try {
      await createChiusura({
        data_inizio: dataInizio,
        data_fine: dataFine || dataInizio,
        descrizione: descrizione.trim(),
      })
      setDataInizio('')
      setDataFine('')
      setDescrizione('')
      toast.success('Chiusura aggiunta')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteChiusura(id)
      toast.success('Chiusura rimossa')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    }
  }

  return (
    <div className="space-y-4">
      {chiusure.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nessuna chiusura impostata.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {chiusure.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span className="text-sm">
                <span className="font-medium">
                  {formatta(c.data_inizio)}
                  {c.data_fine !== c.data_inizio && ` – ${formatta(c.data_fine)}`}
                </span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">
                  {c.descrizione}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(c.id)}
                aria-label={`Rimuovi ${c.descrizione}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="chiusura-inizio">Dal</Label>
          <Input
            id="chiusura-inizio"
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="chiusura-fine">Al (facoltativo)</Label>
          <Input
            id="chiusura-fine"
            type="date"
            value={dataFine}
            onChange={(e) => setDataFine(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1 min-w-48">
          <Label htmlFor="chiusura-descrizione">Descrizione</Label>
          <Input
            id="chiusura-descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="Ferie estive"
          />
        </div>
        <Button type="submit" disabled={loading}>
          <Plus className="mr-1 h-4 w-4" />
          Aggiungi
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Montarlo nella pagina**

In `app/(dashboard)/impostazioni/page.tsx`, aggiungere l'import e la Card sotto quella degli orari:

```tsx
import FormChiusure from '@/components/impostazioni/FormChiusure'
```

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Giorni di chiusura</CardTitle>
          <CardDescription>
            Festività, ponti e ferie. Nel calendario diventano righe rosse su cui
            non si possono collocare attività.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormChiusure chiusure={chiusure} />
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verificare a mano**

Run: `npm run dev`, aprire `/impostazioni`.
Expected: aggiungendo `25/12/2026 – Natale` compare in elenco; il cestino la rimuove.

- [ ] **Step 4: Commit**

```bash
git add components/impostazioni/FormChiusure.tsx "app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(calendario): gestione dei giorni di chiusura"
```

---

## Task 10: Categoria calendario sul fornitore

Senza questo campo un ordine non sa se generare una ricezione blu, ciano o grigia.

**Files:**
- Modify: `types/magazzino.ts:15-35`
- Modify: `components/magazzino/DialogFornitore.tsx`

`actions/magazzino.ts` **non va toccato**: `createFornitore` e `updateFornitore` scrivono `{ ...input }`, quindi il campo nuovo passa da solo.

- [ ] **Step 1: Aggiungere il campo ai tipi**

In `types/magazzino.ts`, dentro `Fornitore` e `FornitoreInput`:

```ts
export type Fornitore = {
  // …invariato
  note: string | null
  /** Decide il colore della ricezione generata dagli ordini di questo fornitore. */
  categoria_calendario: 'alluminio' | 'vetri' | 'accessori' | null
  created_at: string
  updated_at: string
}

export type FornitoreInput = {
  // …invariato
  note?: string
  categoria_calendario?: 'alluminio' | 'vetri' | 'accessori' | null
}
```

- [ ] **Step 2: Aggiungere il selettore al form fornitore**

In `components/magazzino/DialogFornitore.tsx` il form tiene tutto in un unico stato `form: FornitoreInput` con l'helper `set(k)`, che però legge da un `ChangeEvent<HTMLInputElement>` e non serve per un `Select`.

Aggiungere `categoria_calendario: null` all'oggetto `empty` e alla precompilazione da `fornitore`:

```tsx
const empty: FornitoreInput = {
  nome: '',
  partita_iva: '',
  telefono: '',
  email: '',
  indirizzo: '',
  note: '',
  categoria_calendario: null,
}

// e nel ramo che precompila da `fornitore`, dopo `note: fornitore.note ?? '',`:
          categoria_calendario: fornitore.categoria_calendario,
```

Aggiungere l'import del Select e il campo dentro il `<form>`, sotto quello delle note. `Select` non accetta `null` come valore, quindi il "non impostata" viaggia come sentinella `'nessuna'`:

```tsx
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

          <div>
            <Label htmlFor="categoria-calendario">Categoria per il calendario</Label>
            <Select
              value={form.categoria_calendario ?? 'nessuna'}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  categoria_calendario:
                    v === 'nessuna' ? null : (v as 'alluminio' | 'vetri' | 'accessori'),
                }))
              }
            >
              <SelectTrigger id="categoria-calendario">
                <SelectValue placeholder="Non impostata" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nessuna">Non impostata</SelectItem>
                <SelectItem value="alluminio">Alluminio</SelectItem>
                <SelectItem value="vetri">Vetri</SelectItem>
                <SelectItem value="accessori">Accessori</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-gray-500">
              Determina il colore della ricezione creata dagli ordini di questo fornitore.
            </p>
          </div>
```

- [ ] **Step 3: Verificare a mano**

Run: `npm run dev`, aprire `/magazzino/fornitori`, modificare un fornitore impostando "Vetri", salvare, riaprire.
Expected: il valore è rimasto.

- [ ] **Step 4: Commit**

```bash
git add types/magazzino.ts components/magazzino/DialogFornitore.tsx
git commit -m "feat(calendario): categoria calendario sull'anagrafica fornitori"
```

---

# Fase 2 — Gantt Produzione

## Task 11: Server Actions — CRUD degli eventi

**Files:**
- Modify: `actions/calendario.ts`

- [ ] **Step 1: Aggiungere le action degli eventi**

Completare gli import in testa a `actions/calendario.ts` con:

```ts
import { randomUUID } from 'node:crypto'
import { espandiCatena } from '@/lib/calendario'
import type { EventoConContesto, EventoInput } from '@/types/calendario'
```

e aggiungere in fondo al file:

```ts
/** Colonne da leggere con i join che servono all'etichetta della barra. */
const SELECT_EVENTO = `
  *,
  commesse ( numero_commessa ),
  fornitori ( nome )
`

type RigaGrezza = Record<string, unknown> & {
  commesse: { numero_commessa: string } | null
  fornitori: { nome: string } | null
}

function appiattisci(riga: RigaGrezza): EventoConContesto {
  const { commesse, fornitori, ...evento } = riga
  return {
    ...(evento as unknown as EventoConContesto),
    numero_commessa: commesse?.numero_commessa ?? null,
    fornitore_nome: fornitori?.nome ?? null,
  }
}

/**
 * Eventi visibili alla Produzione in un intervallo di date.
 * Gli annullati restano nel database ma non si disegnano.
 */
export async function getEventiProduzione(
  dataInizio: string,
  dataFine: string
): Promise<EventoConContesto[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('eventi_calendario')
    .select(SELECT_EVENTO)
    .eq('organization_id', orgId)
    .eq('visibile_produzione', true)
    .neq('stato', 'annullato')
    .gte('data', dataInizio)
    .lte('data', dataFine)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => appiattisci(r as unknown as RigaGrezza))
}

/**
 * Crea un evento. Con `giorni > 1` crea una catena: una riga per giorno
 * lavorativo, tutte con lo stesso catena_id, saltando i giorni chiusi.
 */
export async function createEvento(input: EventoInput, giorni = 1): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: { user } } = await supabase.auth.getUser()

  let righe: Record<string, unknown>[]

  if (giorni > 1) {
    const [orari, chiusure] = await Promise.all([getOrariLavoro(), getChiusure()])
    const catenaId = randomUUID()
    righe = espandiCatena(
      input.data, giorni, input.ora_inizio, input.ora_fine, orari, chiusure
    ).map((g) => ({
      ...input,
      organization_id: orgId,
      created_by: user?.id ?? null,
      catena_id: catenaId,
      data: g.data,
      ora_inizio: g.ora_inizio,
      ora_fine: g.ora_fine,
    }))
  } else {
    righe = [{ ...input, organization_id: orgId, created_by: user?.id ?? null }]
  }

  if (righe.length === 0) {
    throw new Error('Nessun giorno lavorativo disponibile nel periodo scelto')
  }

  const { error } = await supabase.from('eventi_calendario').insert(righe)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

export async function updateEvento(
  id: string,
  patch: Partial<EventoInput>
): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('eventi_calendario')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/** Spostamento da trascinamento o ridimensionamento: tocca solo data e ore. */
export async function spostaEvento(
  id: string,
  data: string,
  oraInizio: string,
  oraFine: string
): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  if (oraFine <= oraInizio) throw new Error('La fine deve venire dopo l’inizio')

  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('eventi_calendario')
    .update({
      data,
      ora_inizio: oraInizio,
      ora_fine: oraFine,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/**
 * Elimina un evento. Con `tuttaLaCatena` elimina tutti i giorni della
 * lavorazione continuativa a cui appartiene.
 */
export async function deleteEvento(id: string, tuttaLaCatena = false): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  if (tuttaLaCatena) {
    const { data: evento } = await supabase
      .from('eventi_calendario')
      .select('catena_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (evento?.catena_id) {
      const { error } = await supabase
        .from('eventi_calendario')
        .delete()
        .eq('catena_id', evento.catena_id)
        .eq('organization_id', orgId)
      if (error) throw new Error(error.message)
      revalidatePath('/produzione')
      revalidatePath('/calendario')
      return
    }
  }

  const { error } = await supabase
    .from('eventi_calendario')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}
```

- [ ] **Step 2: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add actions/calendario.ts
git commit -m "feat(calendario): action CRUD degli eventi con catene multi-giorno"
```

---

## Task 12: Server Action — coda "da pianificare"

La coda è **calcolata**, non memorizzata: è l'assenza di eventi collegati. Nessuna colonna di stato da tenere allineata.

**Files:**
- Modify: `actions/calendario.ts`

- [ ] **Step 1: Aggiungere l'action**

Completare gli import in testa con:

```ts
import { STATI_COMMESSA_APERTI } from '@/types/produzione'
import { RICEZIONE_PER_CATEGORIA } from '@/types/calendario'
import type {
  CategoriaFornitore,
  TipoEventoProduzione,
  VoceDaPianificare,
} from '@/types/calendario'
```

e aggiungere in fondo al file:

```ts
/** I tre tipi che una commessa deve avere collocati per uscire dalla coda. */
const TIPI_ATTESI_COMMESSA: TipoEventoProduzione[] = ['lavorazione', 'posa', 'carico']

/**
 * Cosa aspetta di essere collocato sul calendario: commesse aperte senza
 * lavorazione, posa o carico, e ordini in arrivo senza ricezione.
 * Non crea nulla: propone soltanto.
 */
export async function getVociDaPianificare(): Promise<VoceDaPianificare[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [commesseRes, eventiRes, ordiniRes] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, numero_commessa, cliente_nome')
      .eq('organization_id', orgId)
      .in('stato', STATI_COMMESSA_APERTI)
      .order('numero_commessa', { ascending: true }),
    supabase
      .from('eventi_calendario')
      .select('commessa_id, tipo, ordine_id')
      .eq('organization_id', orgId)
      .neq('stato', 'annullato'),
    supabase
      .from('ordini_fornitore')
      .select(
        'id, numero_ordine, fornitore_id, data_consegna_prevista, fornitori ( nome, categoria_calendario )'
      )
      .eq('organization_id', orgId)
      .eq('stato', 'ordinato')
      .not('data_consegna_prevista', 'is', null)
      .order('data_consegna_prevista', { ascending: true }),
  ])

  if (commesseRes.error) throw new Error(commesseRes.error.message)
  if (eventiRes.error) throw new Error(eventiRes.error.message)
  if (ordiniRes.error) throw new Error(ordiniRes.error.message)

  // Quali tipi sono già collocati, per commessa; e quali ordini hanno una ricezione.
  const tipiPerCommessa = new Map<string, Set<string>>()
  const ordiniCollocati = new Set<string>()
  for (const e of eventiRes.data ?? []) {
    if (e.ordine_id) ordiniCollocati.add(e.ordine_id as string)
    if (!e.commessa_id) continue
    const chiave = e.commessa_id as string
    if (!tipiPerCommessa.has(chiave)) tipiPerCommessa.set(chiave, new Set())
    tipiPerCommessa.get(chiave)!.add(e.tipo as string)
  }

  const voci: VoceDaPianificare[] = []

  for (const c of commesseRes.data ?? []) {
    const presenti = tipiPerCommessa.get(c.id) ?? new Set<string>()
    const mancanti = TIPI_ATTESI_COMMESSA.filter((t) => !presenti.has(t))
    if (mancanti.length === 0) continue
    voci.push({
      genere: 'commessa',
      id: c.id,
      numero_commessa: c.numero_commessa,
      cliente_nome: c.cliente_nome,
      tipi_mancanti: mancanti,
    })
  }

  for (const o of ordiniRes.data ?? []) {
    if (ordiniCollocati.has(o.id)) continue
    const fornitore = o.fornitori as unknown as
      { nome: string; categoria_calendario: CategoriaFornitore | null } | null
    const categoria = fornitore?.categoria_calendario ?? null
    voci.push({
      genere: 'ordine',
      id: o.id,
      numero_ordine: o.numero_ordine,
      fornitore_id: o.fornitore_id,
      fornitore_nome: fornitore?.nome ?? null,
      data_consegna_prevista: o.data_consegna_prevista as string,
      tipo_ricezione: categoria ? RICEZIONE_PER_CATEGORIA[categoria] : 'ricez_accessori',
      categoria_mancante: categoria === null,
    })
  }

  return voci
}
```

- [ ] **Step 2: Verificare i dati reali con uno script**

Creare nella root del progetto `_verifica_coda.mjs` (deve stare in root perché serve `node_modules`; sono dati di produzione, quindi sola lettura):

```js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const { data, error } = await sb
  .from('ordini_fornitore')
  .select('numero_ordine, data_consegna_prevista, fornitori ( nome, categoria_calendario )')
  .eq('stato', 'ordinato')
  .not('data_consegna_prevista', 'is', null)
  .limit(10)
console.log(error ?? data)
```

Run: `node _verifica_coda.mjs`
Expected: un elenco di ordini col nome fornitore e la categoria (`null` finché non viene impostata in anagrafica). Poi rimuovere lo script: `rm _verifica_coda.mjs`

- [ ] **Step 3: Commit**

```bash
git add actions/calendario.ts
git commit -m "feat(calendario): coda delle commesse e degli ordini da pianificare"
```

---

## Task 13: Griglia Gantt statica

Prima si disegna, poi si rende interattiva. Questo task porta a schermo il foglio dell'officina in sola lettura.

**Files:**
- Create: `components/calendario/BarraEvento.tsx`
- Create: `components/calendario/GrigliaGantt.tsx`

- [ ] **Step 1: Scrivere la barra**

```tsx
// components/calendario/BarraEvento.tsx
'use client'

import { ASPETTO_TIPO } from '@/types/calendario'
import { etichettaEvento } from '@/lib/calendario'
import type { EventoConContesto } from '@/types/calendario'

export const ALTEZZA_BARRA = 22

export default function BarraEvento({
  evento,
  sinistraPct,
  larghezzaPct,
  riga,
  onClick,
}: {
  evento: EventoConContesto
  sinistraPct: number
  larghezzaPct: number
  riga: number
  onClick?: () => void
}) {
  const aspetto = ASPETTO_TIPO[evento.tipo]

  return (
    <div
      className="absolute flex items-center overflow-hidden whitespace-nowrap rounded-sm px-1 text-[11px] leading-none shadow-sm"
      style={{
        left: `${sinistraPct}%`,
        width: `${larghezzaPct}%`,
        top: riga * ALTEZZA_BARRA,
        height: ALTEZZA_BARRA - 3,
        backgroundColor: aspetto.sfondo,
        color: aspetto.testo,
      }}
      onClick={onClick}
      title={etichettaEvento(evento)}
    >
      <span className="truncate font-medium">{etichettaEvento(evento)}</span>
      {evento.confermato_cliente && (
        <span className="ml-2 shrink-0 italic text-red-700">
          CONFERMATO CON IL CLIENTE
        </span>
      )}
      {evento.note && <span className="ml-2 shrink-0 opacity-80">{evento.note}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Scrivere la griglia**

```tsx
// components/calendario/GrigliaGantt.tsx
'use client'

import { useMemo } from 'react'
import {
  fasciaGriglia,
  impilaEventi,
  minutiDaOra,
  oraDaMinuti,
  posizioneBarra,
  statoGiorno,
} from '@/lib/calendario'
import BarraEvento, { ALTEZZA_BARRA } from './BarraEvento'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

const ALTEZZA_MINIMA_RIGA = 34

/** Etichette a ora piena da mostrare in testata. */
function oreDellaFascia(inizio: string, fine: string): string[] {
  const ore: string[] = []
  const primaOra = Math.ceil(minutiDaOra(inizio) / 60) * 60
  for (let m = primaOra; m <= minutiDaOra(fine); m += 60) ore.push(oraDaMinuti(m))
  return ore
}

/** Tutti i giorni del mese in forma 'YYYY-MM-DD'. */
export function giorniDelMese(anno: number, mese: number): string[] {
  const ultimo = new Date(anno, mese, 0).getDate()
  const mm = String(mese).padStart(2, '0')
  return Array.from(
    { length: ultimo },
    (_, i) => `${anno}-${mm}-${String(i + 1).padStart(2, '0')}`
  )
}

export default function GrigliaGantt({
  anno,
  mese,
  eventi,
  orari,
  chiusure,
  onApriEvento,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento?: (evento: EventoConContesto) => void
}) {
  const fascia = useMemo(() => fasciaGriglia(orari), [orari])
  const ore = useMemo(() => oreDellaFascia(fascia.inizio, fascia.fine), [fascia])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])

  const eventiPerGiorno = useMemo(() => {
    const mappa = new Map<string, EventoConContesto[]>()
    for (const e of eventi) {
      if (!mappa.has(e.data)) mappa.set(e.data, [])
      mappa.get(e.data)!.push(e)
    }
    return mappa
  }, [eventi])

  return (
    <div className="gantt-scroll overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="min-w-[900px]">
        {/* Testata delle ore */}
        <div className="flex border-b border-gray-300 bg-gray-50 text-xs font-medium dark:border-gray-600 dark:bg-gray-800">
          <div className="w-14 shrink-0 border-r border-gray-300 px-2 py-1 dark:border-gray-600">
            Giorno
          </div>
          <div className="relative flex-1 py-1">
            {ore.map((ora) => (
              <span
                key={ora}
                className="absolute -translate-x-1/2 text-gray-600 dark:text-gray-300"
                style={{ left: `${posizioneBarra(ora, ora, fascia).sinistraPct}%` }}
              >
                {ora}
              </span>
            ))}
          </div>
        </div>

        {/* Una riga per giorno */}
        {giorni.map((data) => {
          const stato = statoGiorno(data, orari, chiusure)
          const delGiorno = eventiPerGiorno.get(data) ?? []
          const impilati = impilaEventi(delGiorno)
          const numeroRighe = impilati.reduce((max, e) => Math.max(max, e.riga + 1), 0)
          const altezza = Math.max(ALTEZZA_MINIMA_RIGA, numeroRighe * ALTEZZA_BARRA + 6)
          const oltreChiusura = posizioneBarra(stato.chiusura, fascia.fine, fascia)

          return (
            <div
              key={data}
              className="gantt-giorno flex border-b border-gray-200 dark:border-gray-700"
              style={{ height: altezza }}
            >
              <div
                className={`flex w-14 shrink-0 items-center justify-center border-r border-gray-300 text-sm font-semibold dark:border-gray-600 ${
                  stato.aperto
                    ? 'bg-[#A6D64B] text-[#152300]'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {Number(data.slice(8, 10))}
              </div>

              <div className="relative flex-1">
                {/* Righe verticali a ora piena */}
                {ore.map((ora) => (
                  <div
                    key={ora}
                    className="absolute inset-y-0 w-px bg-gray-100 dark:bg-gray-800"
                    style={{ left: `${posizioneBarra(ora, ora, fascia).sinistraPct}%` }}
                  />
                ))}

                {stato.aperto ? (
                  <>
                    {/* Mezza giornata: la fascia oltre la chiusura e' grigia */}
                    {oltreChiusura.larghezzaPct > 0 && (
                      <div
                        className="absolute inset-y-0 bg-gray-200/70 dark:bg-gray-700/50"
                        style={{
                          left: `${oltreChiusura.sinistraPct}%`,
                          width: `${oltreChiusura.larghezzaPct}%`,
                        }}
                      />
                    )}
                    {impilati.map((e) => {
                      const p = posizioneBarra(e.ora_inizio, e.ora_fine, fascia)
                      return (
                        <BarraEvento
                          key={e.id}
                          evento={e}
                          sinistraPct={p.sinistraPct}
                          larghezzaPct={p.larghezzaPct}
                          riga={e.riga}
                          onClick={onApriEvento ? () => onApriEvento(e) : undefined}
                        />
                      )
                    })}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center bg-red-600 px-3 text-xs font-semibold text-white">
                    CHIUSO — {stato.motivoChiusura}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/calendario/BarraEvento.tsx components/calendario/GrigliaGantt.tsx
git commit -m "feat(calendario): griglia Gantt giorni per ore con chiusure e mezze giornate"
```

---

## Task 14: Pagina del calendario di produzione

**Files:**
- Create: `components/calendario/CalendarioProduzione.tsx`
- Create: `app/(dashboard)/produzione/calendario/page.tsx`
- Modify: `components/produzione/CruscottoProduzione.tsx`

- [ ] **Step 1: Scrivere il contenitore client**

```tsx
// components/calendario/CalendarioProduzione.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ASPETTO_TIPO, TIPI_PRODUZIONE } from '@/types/calendario'
import GrigliaGantt from './GrigliaGantt'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

export const NOMI_MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export default function CalendarioProduzione({
  anno,
  mese,
  eventi,
  orari,
  chiusure,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
}) {
  const router = useRouter()
  const [inCorso, startTransition] = useTransition()
  const [eventoAperto, setEventoAperto] = useState<EventoConContesto | null>(null)

  const vaiA = (deltaMesi: number) => {
    const d = new Date(anno, mese - 1 + deltaMesi, 1)
    startTransition(() => {
      router.push(
        `/produzione/calendario?anno=${d.getFullYear()}&mese=${d.getMonth() + 1}`
      )
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="no-stampa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => vaiA(-1)} disabled={inCorso}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-48 text-center text-lg font-semibold">
            {NOMI_MESI[mese - 1]} {anno}
          </h1>
          <Button variant="outline" size="sm" onClick={() => vaiA(1)} disabled={inCorso}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {TIPI_PRODUZIONE.map((tipo) => (
              <span key={tipo} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: ASPETTO_TIPO[tipo].sfondo }}
                />
                {ASPETTO_TIPO[tipo].label}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            Stampa
          </Button>
        </div>
      </div>

      <GrigliaGantt
        anno={anno}
        mese={mese}
        eventi={eventi}
        orari={orari}
        chiusure={chiusure}
        onApriEvento={setEventoAperto}
      />

      {/* Il dialog arriva al Task 15. Per ora il clic seleziona e basta. */}
      {eventoAperto !== null && null}
    </div>
  )
}
```

- [ ] **Step 2: Scrivere la pagina**

```tsx
// app/(dashboard)/produzione/calendario/page.tsx
import { requireAccesso } from '@/lib/permessi'
import { getEventiProduzione, getOrariLavoro, getChiusure } from '@/actions/calendario'
import CalendarioProduzione from '@/components/calendario/CalendarioProduzione'

export const dynamic = 'force-dynamic'

export default async function CalendarioProduzionePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string }>
}) {
  await requireAccesso('produzione')
  const { anno: annoParam, mese: meseParam } = await searchParams

  const oggi = new Date()
  const anno = Number(annoParam) || oggi.getFullYear()
  const mese = Number(meseParam) || oggi.getMonth() + 1

  const mm = String(mese).padStart(2, '0')
  const ultimoGiorno = new Date(anno, mese, 0).getDate()
  const dataInizio = `${anno}-${mm}-01`
  const dataFine = `${anno}-${mm}-${ultimoGiorno}`

  const [eventi, orari, chiusure] = await Promise.all([
    getEventiProduzione(dataInizio, dataFine),
    getOrariLavoro(),
    getChiusure(),
  ])

  return (
    <CalendarioProduzione
      anno={anno}
      mese={mese}
      eventi={eventi}
      orari={orari}
      chiusure={chiusure}
    />
  )
}
```

- [ ] **Step 3: Collegare dal cruscotto**

In `components/produzione/CruscottoProduzione.tsx`, accanto ai comandi dell'intestazione già presenti, aggiungere il collegamento (importando `Link` da `next/link` e `CalendarDays` da `lucide-react`):

```tsx
<Button asChild variant="outline" size="sm">
  <Link href="/produzione/calendario">
    <CalendarDays className="mr-1 h-4 w-4" />
    Calendario
  </Link>
</Button>
```

- [ ] **Step 4: Verificare a mano**

Inserire due eventi di prova sul progetto Supabase, sostituendo `<ORG>` con l'`organization_id` reale (leggibile con `SELECT id FROM organizations LIMIT 1`):

```sql
INSERT INTO eventi_calendario
  (organization_id, tipo, data, ora_inizio, ora_fine, cliente_nome, confermato_cliente)
VALUES
  ('<ORG>', 'lavorazione', CURRENT_DATE, '08:00', '17:30', 'PAREDES',  false),
  ('<ORG>', 'posa',        CURRENT_DATE, '09:00', '13:00', 'V.TERESI', true);
```

Run: `npm run dev`, aprire `/produzione/calendario`.
Expected: il mese corrente con una barra arancione e una verde nel giorno di oggi, impilate su due righe; le domeniche rosse con "CHIUSO — Domenica"; il sabato grigio dopo le 12:30; le frecce cambiano mese.

- [ ] **Step 5: Commit**

```bash
git add components/calendario/CalendarioProduzione.tsx "app/(dashboard)/produzione/calendario/page.tsx" components/produzione/CruscottoProduzione.tsx
git commit -m "feat(calendario): pagina del calendario di produzione con navigazione fra i mesi"
```

---

## Task 15: Dialog dell'evento

**Files:**
- Create: `components/calendario/DialogEvento.tsx`
- Modify: `components/calendario/CalendarioProduzione.tsx`
- Modify: `app/(dashboard)/produzione/calendario/page.tsx`

- [ ] **Step 1: Scrivere il dialog**

```tsx
// components/calendario/DialogEvento.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createEvento, updateEvento, deleteEvento } from '@/actions/calendario'
import { ASPETTO_TIPO, TIPI_PRODUZIONE } from '@/types/calendario'
import type { EventoConContesto, EventoInput, TipoEvento } from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

/** Valori di partenza quando il dialog si apre su uno slot vuoto o da un rilascio. */
export type NuovoEvento = {
  data: string
  ora_inizio: string
  ora_fine: string
  tipo: TipoEvento
  commessa_id?: string | null
  cliente_nome?: string | null
  fornitore_id?: string | null
  ordine_id?: string | null
}

const soloOreMinuti = (ora: string) => ora.slice(0, 5)

export default function DialogEvento({
  evento,
  nuovo,
  commesse,
  onClose,
}: {
  evento: EventoConContesto | null
  nuovo: NuovoEvento | null
  commesse: CommessaOpzione[]
  onClose: () => void
}) {
  const router = useRouter()
  const inModifica = evento !== null

  const [tipo, setTipo] = useState<TipoEvento>(evento?.tipo ?? nuovo?.tipo ?? 'lavorazione')
  const [data, setData] = useState(evento?.data ?? nuovo?.data ?? '')
  const [oraInizio, setOraInizio] = useState(
    soloOreMinuti(evento?.ora_inizio ?? nuovo?.ora_inizio ?? '08:00')
  )
  const [oraFine, setOraFine] = useState(
    soloOreMinuti(evento?.ora_fine ?? nuovo?.ora_fine ?? '17:30')
  )
  const [commessaId, setCommessaId] = useState(
    evento?.commessa_id ?? nuovo?.commessa_id ?? ''
  )
  const [clienteNome, setClienteNome] = useState(
    evento?.cliente_nome ?? nuovo?.cliente_nome ?? ''
  )
  const [note, setNote] = useState(evento?.note ?? '')
  const [confermato, setConfermato] = useState(evento?.confermato_cliente ?? false)
  const [inAmministrazione, setInAmministrazione] = useState(
    evento?.visibile_amministrazione ?? false
  )
  const [giorni, setGiorni] = useState('1')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (oraFine <= oraInizio) {
      toast.error('L’orario di fine deve venire dopo quello di inizio')
      return
    }

    const input: EventoInput = {
      tipo,
      titolo: null,
      data,
      ora_inizio: oraInizio,
      ora_fine: oraFine,
      tutto_il_giorno: false,
      commessa_id: commessaId || null,
      cliente_id: null,
      cliente_nome: clienteNome.trim() || null,
      fornitore_id: evento?.fornitore_id ?? nuovo?.fornitore_id ?? null,
      ordine_id: evento?.ordine_id ?? nuovo?.ordine_id ?? null,
      catena_id: evento?.catena_id ?? null,
      confermato_cliente: confermato,
      note: note.trim() || null,
      visibile_produzione: true,
      visibile_amministrazione: inAmministrazione,
    }

    setLoading(true)
    try {
      if (inModifica) {
        await updateEvento(evento.id, input)
        toast.success('Evento aggiornato')
      } else {
        await createEvento(input, Math.max(1, Math.min(60, Number(giorni) || 1)))
        toast.success('Evento creato')
      }
      router.refresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (tuttaLaCatena: boolean) => {
    if (!evento) return
    setLoading(true)
    try {
      await deleteEvento(evento.id, tuttaLaCatena)
      toast.success(tuttaLaCatena ? 'Catena eliminata' : 'Evento eliminato')
      router.refresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(aperto) => !aperto && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inModifica ? 'Modifica attività' : 'Nuova attività'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="evento-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoEvento)}>
              <SelectTrigger id="evento-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_PRODUZIONE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ASPETTO_TIPO[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="evento-data">Data</Label>
              <Input
                id="evento-data" type="date" value={data} required
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="evento-inizio">Dalle</Label>
              <Input
                id="evento-inizio" type="time" value={oraInizio} required
                onChange={(e) => setOraInizio(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="evento-fine">Alle</Label>
              <Input
                id="evento-fine" type="time" value={oraFine} required
                onChange={(e) => setOraFine(e.target.value)}
              />
            </div>
          </div>

          {!inModifica && (
            <div>
              <Label htmlFor="evento-giorni">Giorni consecutivi</Label>
              <Input
                id="evento-giorni" type="number" min="1" max="60" value={giorni}
                className="w-28"
                onChange={(e) => setGiorni(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Oltre 1 crea una lavorazione continuativa, saltando i giorni chiusi.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="evento-commessa">Commessa</Label>
            <Select
              value={commessaId || 'nessuna'}
              onValueChange={(v) => {
                if (v === 'nessuna') {
                  setCommessaId('')
                  return
                }
                setCommessaId(v)
                const c = commesse.find((x) => x.id === v)
                if (c) setClienteNome(c.cliente_nome)
              }}
            >
              <SelectTrigger id="evento-commessa">
                <SelectValue placeholder="Nessuna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nessuna">Nessuna</SelectItem>
                {commesse.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero_commessa} — {c.cliente_nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="evento-cliente">Cliente sull’etichetta</Label>
            <Input
              id="evento-cliente" value={clienteNome} placeholder="V.TERESI"
              onChange={(e) => setClienteNome(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="evento-note">Note</Label>
            <Textarea
              id="evento-note" value={note} rows={2} placeholder="trasferta"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={confermato}
              onCheckedChange={(v) => setConfermato(v === true)}
            />
            Confermato con il cliente
          </label>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={inAmministrazione}
              onCheckedChange={(v) => setInAmministrazione(v === true)}
            />
            Mostra anche nel calendario dell’Amministrazione
          </label>

          <DialogFooter className="gap-2 sm:justify-between">
            {inModifica ? (
              <div className="flex gap-2">
                <Button
                  type="button" variant="destructive" size="sm" disabled={loading}
                  onClick={() => handleDelete(false)}
                >
                  Elimina
                </Button>
                {evento.catena_id && (
                  <Button
                    type="button" variant="outline" size="sm" disabled={loading}
                    onClick={() => handleDelete(true)}
                  >
                    Elimina tutta la catena
                  </Button>
                )}
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Passare le commesse dalla pagina**

In `app/(dashboard)/produzione/calendario/page.tsx`:

```tsx
import { getCommessePerOrdine } from '@/actions/produzione'

  const [eventi, orari, chiusure, commesse] = await Promise.all([
    getEventiProduzione(dataInizio, dataFine),
    getOrariLavoro(),
    getChiusure(),
    getCommessePerOrdine(),
  ])

  return (
    <CalendarioProduzione
      anno={anno}
      mese={mese}
      eventi={eventi}
      orari={orari}
      chiusure={chiusure}
      commesse={commesse}
    />
  )
```

- [ ] **Step 3: Montare il dialog**

In `components/calendario/CalendarioProduzione.tsx`: aggiungere `commesse: CommessaOpzione[]` alle props, lo stato `nuovo`, il pulsante "Nuova attività" accanto a "Stampa", e sostituire il segnaposto:

```tsx
import { Plus } from 'lucide-react'
import DialogEvento, { type NuovoEvento } from './DialogEvento'
import type { CommessaOpzione } from '@/types/produzione'

  const [nuovo, setNuovo] = useState<NuovoEvento | null>(null)

// accanto al pulsante Stampa:
          <Button
            size="sm"
            onClick={() =>
              setNuovo({
                data: new Date().toISOString().slice(0, 10),
                ora_inizio: '08:00',
                ora_fine: '17:30',
                tipo: 'lavorazione',
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuova attività
          </Button>

// al posto di `{eventoAperto !== null && null}`:
      {(eventoAperto || nuovo) && (
        <DialogEvento
          evento={eventoAperto}
          nuovo={nuovo}
          commesse={commesse}
          onClose={() => {
            setEventoAperto(null)
            setNuovo(null)
          }}
        />
      )}
```

- [ ] **Step 4: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario`.
Expected: "Nuova attività" apre il dialog. Creando una lavorazione di 3 giorni a partire da un venerdì nascono tre barre su venerdì, sabato e lunedì — la domenica saltata — col sabato accorciato alle 12:30. Cliccando una barra si riapre in modifica; "Elimina tutta la catena" toglie tutte e tre.

- [ ] **Step 5: Commit**

```bash
git add components/calendario/DialogEvento.tsx components/calendario/CalendarioProduzione.tsx "app/(dashboard)/produzione/calendario/page.tsx"
git commit -m "feat(calendario): dialog di creazione, modifica ed eliminazione delle attivita'"
```

---

## Task 16: Trascinamento delle barre

Un droppable per **giorno**, non per slot: 31 zone invece di 700. L'ora nuova si ricava dallo spostamento orizzontale, non dalla posizione del puntatore.

Il `DndContext` sta in `CalendarioProduzione` fin da subito, perché al Task 18 dovrà contenere anche la coda laterale.

**Files:**
- Modify: `components/calendario/BarraEvento.tsx`
- Modify: `components/calendario/GrigliaGantt.tsx`
- Modify: `components/calendario/CalendarioProduzione.tsx`
- Modify: `app/(dashboard)/produzione/calendario/page.tsx`

- [ ] **Step 1: Rendere la barra trascinabile**

In `components/calendario/BarraEvento.tsx`, aggiungere la prop `trascinabile?: boolean` e:

```tsx
import { useDraggable } from '@dnd-kit/core'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: evento.id,
    disabled: !trascinabile,
  })
```

Sull'elemento radice della barra aggiungere `ref={setNodeRef}`, gli handler e le proprietà di stile:

```tsx
      ref={setNodeRef}
      {...(trascinabile ? { ...listeners, ...attributes } : {})}
      style={{
        // …le proprietà già presenti…
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.6 : 1,
        cursor: trascinabile ? 'grab' : 'pointer',
        zIndex: isDragging ? 20 : undefined,
      }}
```

- [ ] **Step 2: Rendere le righe zone di rilascio**

In `components/calendario/GrigliaGantt.tsx` aggiungere:

```tsx
import { useDroppable } from '@dnd-kit/core'

/** Pista di un giorno che accetta il rilascio di una barra. */
function PistaGiorno({
  data, altezza, innerRef, children,
}: {
  data: string
  altezza: number
  innerRef?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: data })
  return (
    <div
      ref={(nodo) => {
        setNodeRef(nodo)
        if (typeof innerRef === 'function') innerRef(nodo)
        else if (innerRef && 'current' in innerRef) {
          ;(innerRef as React.MutableRefObject<HTMLDivElement | null>).current = nodo
        }
      }}
      className={`relative flex-1 ${isOver ? 'bg-sky-50 dark:bg-sky-950/30' : ''}`}
      style={{ height: altezza }}
    >
      {children}
    </div>
  )
}
```

Aggiungere alle props di `GrigliaGantt`: `pistaRef?: React.Ref<HTMLDivElement>` e `modificabile?: boolean`. Nel corpo, sostituire il `<div className="relative flex-1">` dei **giorni aperti** con `<PistaGiorno data={data} altezza={altezza} innerRef={indice === 0 ? pistaRef : undefined}>` (serve l'indice: usare `giorni.map((data, indice) => …)`). I giorni chiusi restano un `<div>` semplice: non devono accettare rilasci. Passare `trascinabile={modificabile}` a ogni `BarraEvento`.

- [ ] **Step 3: Gestire il rilascio nel contenitore**

In `components/calendario/CalendarioProduzione.tsx`:

```tsx
import { useRef } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import { fasciaGriglia, minutiDaOra, oraDaMinuti, snapMinuti } from '@/lib/calendario'
import { spostaEvento } from '@/actions/calendario'

  const pistaRef = useRef<HTMLDivElement | null>(null)
  const sensori = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const applicaSpostamento = async (
    id: string, data: string, oraInizio: string, oraFine: string
  ) => {
    try {
      await spostaEvento(id, data, oraInizio, oraFine)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nello spostamento')
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    if (!modificabile || !e.over) return

    const evento = eventi.find((x) => x.id === e.active.id)
    if (!evento) return

    const fascia = fasciaGriglia(orari)
    const larghezza = pistaRef.current?.offsetWidth ?? 0
    const durataGriglia = minutiDaOra(fascia.fine) - minutiDaOra(fascia.inizio)
    const minutiPerPixel = larghezza > 0 ? durataGriglia / larghezza : 0

    const durata = minutiDaOra(evento.ora_fine) - minutiDaOra(evento.ora_inizio)
    const inizioAttuale = minutiDaOra(evento.ora_inizio)
    const limiteMax = minutiDaOra(fascia.fine) - durata
    const nuovoInizio = Math.max(
      minutiDaOra(fascia.inizio),
      Math.min(limiteMax, snapMinuti(inizioAttuale + e.delta.x * minutiPerPixel))
    )

    const nuovaData = String(e.over.id)
    if (nuovaData === evento.data && nuovoInizio === inizioAttuale) return

    void applicaSpostamento(
      evento.id,
      nuovaData,
      oraDaMinuti(nuovoInizio),
      oraDaMinuti(nuovoInizio + durata)
    )
  }
```

Avvolgere la griglia: `<DndContext sensors={sensori} onDragEnd={handleDragEnd}> <GrigliaGantt … pistaRef={pistaRef} modificabile={modificabile} /> </DndContext>`, e aggiungere `modificabile: boolean` alle props del componente.

- [ ] **Step 4: Ricavare il permesso nella pagina**

In `app/(dashboard)/produzione/calendario/page.tsx`:

```tsx
import { getMyPermissions } from '@/lib/permessi'

  const { isAdmin, permessi } = await getMyPermissions()
  const modificabile = isAdmin || permessi.produzione === 'scrittura'
// …e passare modificabile={modificabile} a CalendarioProduzione
```

- [ ] **Step 5: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario`.
Expected: trascinando una barra verso destra di circa mezz'ora l'orario si sposta di 30 minuti e la durata resta uguale; trascinandola su un altro giorno cambia riga; il rilascio su una domenica non produce alcuna modifica. Con un utente che ha `produzione = 'lettura'` le barre non si trascinano.

- [ ] **Step 6: Commit**

```bash
git add components/calendario/BarraEvento.tsx components/calendario/GrigliaGantt.tsx components/calendario/CalendarioProduzione.tsx "app/(dashboard)/produzione/calendario/page.tsx"
git commit -m "feat(calendario): trascinamento delle barre fra giorni e orari"
```

---

## Task 17: Ridimensionamento delle barre

Il ridimensionamento non passa da `@dnd-kit`: due maniglie con handler puntatore sono più semplici e non litigano col trascinamento.

**Files:**
- Modify: `components/calendario/BarraEvento.tsx`
- Modify: `components/calendario/GrigliaGantt.tsx`
- Modify: `components/calendario/CalendarioProduzione.tsx`

- [ ] **Step 1: Aggiungere le maniglie alla barra**

In `components/calendario/BarraEvento.tsx` aggiungere le prop
`onRidimensiona?: (id: string, oraInizio: string, oraFine: string) => void` e
`minutiPerPixel?: number`, più:

```tsx
import { minutiDaOra, oraDaMinuti, snapMinuti, etichettaEvento } from '@/lib/calendario'

  const avviaResize = (lato: 'inizio' | 'fine') => (e: React.PointerEvent) => {
    if (!onRidimensiona || !minutiPerPixel) return
    e.preventDefault()
    e.stopPropagation()

    const xPartenza = e.clientX
    const inizioPartenza = minutiDaOra(evento.ora_inizio)
    const finePartenza = minutiDaOra(evento.ora_fine)
    let ultimoInizio = inizioPartenza
    let ultimaFine = finePartenza

    const muovi = (ev: PointerEvent) => {
      const delta = snapMinuti((ev.clientX - xPartenza) * minutiPerPixel)
      ultimoInizio = lato === 'inizio'
        ? Math.min(finePartenza - 30, inizioPartenza + delta)
        : inizioPartenza
      ultimaFine = lato === 'fine'
        ? Math.max(inizioPartenza + 30, finePartenza + delta)
        : finePartenza
    }

    const rilascia = () => {
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', rilascia)
      if (ultimoInizio !== inizioPartenza || ultimaFine !== finePartenza) {
        onRidimensiona(evento.id, oraDaMinuti(ultimoInizio), oraDaMinuti(ultimaFine))
      }
    }

    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', rilascia)
  }
```

Il salvataggio avviene **al rilascio**, non a ogni movimento: altrimenti una singola trascinata scriverebbe decine di volte sul database.

Come ultimi figli del `<div>` della barra:

```tsx
      {onRidimensiona && (
        <>
          <span
            onPointerDown={avviaResize('inizio')}
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
            aria-label="Sposta l’inizio"
          />
          <span
            onPointerDown={avviaResize('fine')}
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
            aria-label="Sposta la fine"
          />
        </>
      )}
```

- [ ] **Step 2: Propagare l'handler**

`GrigliaGantt` riceve `onRidimensiona?: (id: string, data: string, oraInizio: string, oraFine: string) => void` e `minutiPerPixel?: number`, e li gira alle barre legando il giorno:

```tsx
                          onRidimensiona={
                            onRidimensiona
                              ? (id, oraInizio, oraFine) =>
                                  onRidimensiona(id, e.data, oraInizio, oraFine)
                              : undefined
                          }
                          minutiPerPixel={minutiPerPixel}
```

In `CalendarioProduzione`, calcolare `minutiPerPixel` con lo stesso conto già usato in `handleDragEnd` — estrarlo in una funzione locale `calcolaMinutiPerPixel()` per non ripeterlo — e passare `onRidimensiona={modificabile ? applicaSpostamento : undefined}`: la firma coincide già.

- [ ] **Step 3: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario`.
Expected: trascinando il bordo destro di una barra la durata cresce a scatti di 30 minuti e resta dopo il ricaricamento; una barra non scende sotto i 30 minuti; il bordo sinistro sposta l'inizio senza toccare la fine.

- [ ] **Step 4: Commit**

```bash
git add components/calendario/BarraEvento.tsx components/calendario/GrigliaGantt.tsx components/calendario/CalendarioProduzione.tsx
git commit -m "feat(calendario): ridimensionamento delle barre dai bordi"
```

---

## Task 18: Coda "da pianificare"

**Files:**
- Create: `components/calendario/CodaDaPianificare.tsx`
- Modify: `components/calendario/CalendarioProduzione.tsx`
- Modify: `app/(dashboard)/produzione/calendario/page.tsx`

- [ ] **Step 1: Scrivere la colonna**

```tsx
// components/calendario/CodaDaPianificare.tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { AlertTriangle } from 'lucide-react'
import { ASPETTO_TIPO } from '@/types/calendario'
import type { VoceDaPianificare } from '@/types/calendario'

/** Prefisso dell'id trascinabile: distingue le voci della coda dalle barre. */
export const PREFISSO_VOCE = 'coda:'

function VoceTrascinabile({
  idDraggable,
  children,
}: {
  idDraggable: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: idDraggable })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-md border border-gray-200 bg-white p-2 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {children}
    </div>
  )
}

export default function CodaDaPianificare({ voci }: { voci: VoceDaPianificare[] }) {
  if (voci.length === 0) {
    return (
      <aside className="w-64 shrink-0 rounded-lg border border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Niente da pianificare.
      </aside>
    )
  }

  return (
    <aside className="w-64 shrink-0 space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Da pianificare
      </h2>

      {voci.map((voce) =>
        voce.genere === 'commessa' ? (
          voce.tipi_mancanti.map((tipo) => (
            <VoceTrascinabile
              key={`${voce.id}-${tipo}`}
              idDraggable={`${PREFISSO_VOCE}commessa:${voce.id}:${tipo}`}
            >
              <div className="flex items-center gap-1 font-medium">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: ASPETTO_TIPO[tipo].sfondo }}
                />
                {ASPETTO_TIPO[tipo].label}
              </div>
              <div className="text-gray-600 dark:text-gray-300">
                {voce.numero_commessa} — {voce.cliente_nome}
              </div>
            </VoceTrascinabile>
          ))
        ) : (
          <VoceTrascinabile
            key={voce.id}
            idDraggable={`${PREFISSO_VOCE}ordine:${voce.id}:${voce.tipo_ricezione}`}
          >
            <div className="flex items-center gap-1 font-medium">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: ASPETTO_TIPO[voce.tipo_ricezione].sfondo }}
              />
              {ASPETTO_TIPO[voce.tipo_ricezione].label}
            </div>
            <div className="text-gray-600 dark:text-gray-300">
              {voce.fornitore_nome ?? 'Fornitore ignoto'} · {voce.numero_ordine}
            </div>
            <div className="text-gray-400">
              cons. {voce.data_consegna_prevista.split('-').reverse().join('/')}
            </div>
            {voce.categoria_mancante && (
              <div className="mt-1 flex items-start gap-1 text-amber-600">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span>Categoria fornitore non impostata</span>
              </div>
            )}
          </VoceTrascinabile>
        )
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Gestire il rilascio dalla coda**

In `components/calendario/CalendarioProduzione.tsx`, in cima a `handleDragEnd` — prima della ricerca dell'evento — distinguere l'origine dal prefisso dell'id:

```tsx
import CodaDaPianificare, { PREFISSO_VOCE } from './CodaDaPianificare'
import type { TipoEvento, VoceDaPianificare } from '@/types/calendario'

    const idAttivo = String(e.active.id)
    if (idAttivo.startsWith(PREFISSO_VOCE)) {
      // 'coda:commessa:<id>:<tipo>' oppure 'coda:ordine:<id>:<tipo>'
      const [, genere, idOggetto, tipo] = idAttivo.split(':')
      const data = String(e.over.id)

      if (genere === 'commessa') {
        const voce = voci.find((v) => v.genere === 'commessa' && v.id === idOggetto)
        setNuovo({
          data,
          ora_inizio: '08:00',
          ora_fine: '17:30',
          tipo: tipo as TipoEvento,
          commessa_id: idOggetto,
          cliente_nome: voce?.genere === 'commessa' ? voce.cliente_nome : null,
        })
      } else {
        const voce = voci.find((v) => v.genere === 'ordine' && v.id === idOggetto)
        setNuovo({
          data,
          ora_inizio: '08:00',
          ora_fine: '13:30',
          tipo: tipo as TipoEvento,
          ordine_id: idOggetto,
          fornitore_id: voce?.genere === 'ordine' ? voce.fornitore_id : null,
        })
      }
      return
    }
```

Il rilascio **apre il dialog già compilato** invece di salvare subito: gli orari vanno quasi sempre corretti, e un salvataggio silenzioso costringerebbe a riaprire l'evento ogni volta.

Aggiungere `voci: VoceDaPianificare[]` alle props e mettere la coda accanto alla griglia, **dentro lo stesso `DndContext`**:

```tsx
      <DndContext sensors={sensori} onDragEnd={handleDragEnd}>
        <div className="flex gap-4">
          {modificabile && <CodaDaPianificare voci={voci} />}
          <div className="min-w-0 flex-1">
            <GrigliaGantt … />
          </div>
        </div>
      </DndContext>
```

- [ ] **Step 3: Caricare le voci nella pagina**

In `app/(dashboard)/produzione/calendario/page.tsx`, aggiungere `getVociDaPianificare()` al `Promise.all` e passare `voci={voci}` a `CalendarioProduzione`.

- [ ] **Step 4: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario`.
Expected: la colonna elenca le commesse aperte coi tipi mancanti e gli ordini in arrivo. Trascinando "Posa/Consegna — C.26/118 VALLONE" sul giorno 20 si apre il dialog con data 20, tipo posa, commessa e cliente già compilati. Salvando, la barra compare e la voce sparisce dalla coda.

- [ ] **Step 5: Commit**

```bash
git add components/calendario/CodaDaPianificare.tsx components/calendario/CalendarioProduzione.tsx "app/(dashboard)/produzione/calendario/page.tsx"
git commit -m "feat(calendario): coda da pianificare con rilascio sul calendario"
```

---

## Task 19: Connettore verticale delle catene

**Files:**
- Modify: `components/calendario/GrigliaGantt.tsx`

- [ ] **Step 1: Disegnare il connettore**

Le barre della stessa catena stanno su righe diverse in giorni diversi. Il connettore è una striscia verticale che attraversa la riga-giorno all'altezza dell'ora di inizio della barra, come sul foglio in officina.

Dentro la pista di ogni giorno aperto, **prima** delle barre (così resta sotto):

```tsx
                    {/* Connettore delle lavorazioni continuative: lega
                        visivamente i giorni della stessa catena. */}
                    {impilati
                      .filter((ev) => ev.catena_id)
                      .map((ev) => (
                        <div
                          key={`catena-${ev.id}`}
                          className="absolute inset-y-0 w-1"
                          style={{
                            left: `${posizioneBarra(ev.ora_inizio, ev.ora_fine, fascia).sinistraPct}%`,
                            backgroundColor: ASPETTO_TIPO[ev.tipo].sfondo,
                            opacity: 0.55,
                          }}
                        />
                      ))}
```

aggiungendo `ASPETTO_TIPO` agli import da `@/types/calendario`.

- [ ] **Step 2: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario`.
Expected: creando una lavorazione su 3 giorni, una striscia arancione verticale attraversa le tre righe-giorno all'altezza dell'ora di inizio.

- [ ] **Step 3: Commit**

```bash
git add components/calendario/GrigliaGantt.tsx
git commit -m "feat(calendario): connettore verticale delle lavorazioni continuative"
```

---

## Task 20: Elenco per giorno su mobile

**Files:**
- Create: `components/calendario/ListaGiorniMobile.tsx`
- Modify: `components/calendario/CalendarioProduzione.tsx`

- [ ] **Step 1: Scrivere l'elenco**

```tsx
// components/calendario/ListaGiorniMobile.tsx
'use client'

import { ASPETTO_TIPO } from '@/types/calendario'
import { etichettaEvento, statoGiorno } from '@/lib/calendario'
import { giorniDelMese } from './GrigliaGantt'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

const soloOreMinuti = (ora: string) => ora.slice(0, 5)

export default function ListaGiorniMobile({
  anno,
  mese,
  eventi,
  orari,
  chiusure,
  onApriEvento,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento?: (evento: EventoConContesto) => void
}) {
  const giorni = giorniDelMese(anno, mese)

  return (
    <div className="space-y-3">
      {giorni.map((data) => {
        const stato = statoGiorno(data, orari, chiusure)
        const delGiorno = eventi
          .filter((e) => e.data === data)
          .sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio))

        // Un giorno aperto e vuoto non merita spazio su uno schermo stretto.
        if (stato.aperto && delGiorno.length === 0) return null

        return (
          <div key={data}>
            <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              {Number(data.slice(8, 10))} —{' '}
              {stato.aperto
                ? `${stato.apertura}–${stato.chiusura}`
                : `CHIUSO (${stato.motivoChiusura})`}
            </div>

            {stato.aperto && (
              <ul className="space-y-1">
                {delGiorno.map((e) => (
                  <li
                    key={e.id}
                    onClick={onApriEvento ? () => onApriEvento(e) : undefined}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                    style={{
                      backgroundColor: ASPETTO_TIPO[e.tipo].sfondo,
                      color: ASPETTO_TIPO[e.tipo].testo,
                    }}
                  >
                    <span className="shrink-0 font-mono">
                      {soloOreMinuti(e.ora_inizio)}–{soloOreMinuti(e.ora_fine)}
                    </span>
                    <span className="truncate font-medium">{etichettaEvento(e)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Mostrarlo sotto i 900px**

In `CalendarioProduzione.tsx`, senza JavaScript per il breakpoint: avvolgere il blocco `DndContext` esistente in `<div className="hidden min-[900px]:block">…</div>` e aggiungere sotto:

```tsx
      <div className="min-[900px]:hidden">
        <ListaGiorniMobile
          anno={anno}
          mese={mese}
          eventi={eventi}
          orari={orari}
          chiusure={chiusure}
          onApriEvento={setEventoAperto}
        />
      </div>
```

- [ ] **Step 3: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario` e restringere la finestra sotto i 900px.
Expected: la griglia sparisce e resta l'elenco per giorno, coi soli giorni che hanno attività più i giorni chiusi; toccando una riga si apre il dialog.

- [ ] **Step 4: Commit**

```bash
git add components/calendario/ListaGiorniMobile.tsx components/calendario/CalendarioProduzione.tsx
git commit -m "feat(calendario): elenco per giorno sotto i 900px"
```

---

## Task 21: Stampa A4 orizzontale

Il progetto stampa già con un blocco `<style>` inline nel componente (vedi `components/commesse/StampaCommessa.tsx`). Si segue lo stesso pattern: `app/globals.css` dichiara `@page { size: A4 }`, e qui serve `landscape`, quindi la regola più specifica va dichiarata dopo, nel componente.

**Files:**
- Create: `components/calendario/StampaGantt.tsx`
- Modify: `components/calendario/CalendarioProduzione.tsx`
- Modify: `components/calendario/GrigliaGantt.tsx`

- [ ] **Step 1: Scrivere le regole di stampa**

```tsx
// components/calendario/StampaGantt.tsx
'use client'

/**
 * Regole di stampa del calendario di produzione: A4 orizzontale, senza
 * comandi ne' coda laterale, coi colori delle barre conservati.
 * Non disegna nulla: inietta soltanto il foglio di stile.
 */
export default function StampaGantt() {
  return (
    <style>{`
      @page { size: A4 landscape; margin: 8mm; }
      @media print {
        .no-stampa { display: none !important; }
        /* La griglia non deve scorrere: in stampa sta tutta in larghezza */
        .gantt-scroll { overflow: visible !important; }
        .gantt-scroll > div { min-width: 0 !important; }
        /* Una riga-giorno non si spezza fra due pagine */
        .gantt-giorno { break-inside: avoid; }
      }
    `}</style>
  )
}
```

I colori restano perché `app/globals.css` imposta già `print-color-adjust: exact` su tutto in stampa.

- [ ] **Step 2: Applicare le classi**

In `GrigliaGantt.tsx`, verificare che il contenitore con `overflow-x-auto` abbia già la classe `gantt-scroll` e la riga di ogni giorno `gantt-giorno` (entrambe introdotte al Task 13).

In `CalendarioProduzione.tsx`: la barra dei comandi ha già `no-stampa` (Task 14); aggiungere la stessa classe al contenitore della coda laterale, montare `<StampaGantt />` e lasciare in stampa un'intestazione col mese:

```tsx
import StampaGantt from './StampaGantt'

      <StampaGantt />
      <h1 className="hidden text-center text-base font-semibold print:block">
        Calendario A.L.M. WP — {NOMI_MESI[mese - 1]} {anno}
      </h1>
```

- [ ] **Step 3: Verificare a mano**

Run: `npm run dev`, aprire `/produzione/calendario` e premere "Stampa".
Expected: l'anteprima mostra un A4 orizzontale senza barra laterale né coda, con le barre colorate e l'intestazione del mese; nessuna riga-giorno tagliata a metà fra due pagine.

- [ ] **Step 4: Verificare l'intera build**

Run: `npm run lint`
Expected: nessun errore e nessun warning su variabili non usate.

Run: `npx vitest run`
Expected: tutti i test verdi, compresi i 30 di `lib/calendario.test.ts`.

Run: `npm run build`
Expected: build completata. Se fallisce lamentando `RESEND_API_KEY`, è un problema preesistente del progetto: impostare una chiave fittizia in `.env.local` e ripetere.

- [ ] **Step 5: Commit**

```bash
git add components/calendario/StampaGantt.tsx components/calendario/CalendarioProduzione.tsx components/calendario/GrigliaGantt.tsx
git commit -m "feat(calendario): stampa A4 orizzontale del calendario di produzione"
```

---

## Verifica finale del piano

Al termine dei 21 task devono valere tutte queste:

- [ ] `/impostazioni` permette di impostare orari settimanali e giorni di chiusura, e i valori sopravvivono al ricaricamento.
- [ ] `/produzione/calendario` mostra il mese corrente con le domeniche rosse, il sabato grigio dopo le 12:30 e le chiusure impostate.
- [ ] Le barre si creano, si trascinano fra giorni e orari, si ridimensionano e si eliminano.
- [ ] Una lavorazione su più giorni salta i giorni chiusi ed è legata dal connettore verticale.
- [ ] La coda elenca commesse aperte e ordini in arrivo, e il rilascio apre il dialog già compilato.
- [ ] Sotto i 900px compare l'elenco per giorno.
- [ ] La stampa produce un A4 orizzontale leggibile.
- [ ] Un utente con `produzione = 'lettura'` vede tutto e non modifica nulla.
- [ ] `npm run lint`, `npx vitest run` e `npm run build` passano.
