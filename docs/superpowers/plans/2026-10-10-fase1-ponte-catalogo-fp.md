# Fase 1 — Ponte sul PC e Catalogo FP PRO: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un programma sul PC di FP PRO copia serie, profili, colori, accessori, vetri e kit (con i prezzi) dal MySQL di FP PRO in Supabase; in WinStudio una pagina "Catalogo FP PRO" mostra lo stato del ponte, il pulsante Sincronizza e i dati.

**Architecture:** WinStudio e il ponte non si parlano direttamente: WinStudio scrive una riga in `fp_ponte_richieste`, il ponte (Node.js sul PC, avvio automatico con Windows) la prende, legge il MySQL in sola lettura e riscrive le tabelle `fp_*` con il service role. Tutta la logica pura (mappatura delle righe, controlli, regole) sta in `lib/fppro/` ed è testata con Vitest; il ponte la importa direttamente perché Node 24 esegue i file `.ts` senza build.

**Tech Stack:** Next.js 16 / React 19 / Supabase (app); Node.js 24 con type stripping, `mysql2`, `@supabase/supabase-js` (ponte); Vitest; PowerShell + cartella Esecuzione automatica di Windows (installazione).

**Spec:** `docs/superpowers/specs/2026-10-10-rilievo-preventivo-fppro-design.md` (questo piano copre la **Fase 1** del §12).

## Global Constraints

- Sorgente: MySQL `localhost:3306`, database `fp_pro32_edilsider`, credenziali lette da `C:\FP_PRO\CONFIGS\EDILSIDER\CONF_FPP.INI`. **Solo `SELECT`**: il ponte non scrive mai nel MySQL.
- Si sincronizza **solo** l'archivio EDILSIDER.
- Organizzazione unica: `00000000-0000-0000-0000-000000000001` (A.L.M. Infissi).
- Tutte le tabelle nuove hanno `organization_id` e RLS con `get_user_organization_id()`; gli utenti **leggono** le `fp_*`, solo il service role (ponte) le scrive.
- Importi e quantità in colonne `numeric` **senza precisione** (vedi gotcha NUMERIC(4,2) in memoria).
- I file in `lib/fppro/` usati dal ponte (`sync-tabelle.ts`, `ponte-regole.ts`) **non importano nulla** (né alias `@/` né altri file): Node li esegue così come sono.
- Il codice del ponte importa i tipi con `import type` e i file locali con estensione `.ts`; niente `enum`, `namespace`, parametri-proprietà (sintassi non cancellabile da Node).
- Segreti (service role key, password MySQL) solo in file `.env` locali, mai nel repository.
- Ponte installato in `C:\WinStudioPonte`, avvio da cartella Esecuzione automatica dell'utente (niente privilegi di amministratore).
- Segnale di vita ogni 30 s; "non raggiungibile" dopo 2 minuti di silenzio; una sincronizzazione automatica al giorno (fuso Europe/Rome).
- Testi dell'interfaccia in italiano. `npm run lint` deve restare a zero problemi.

## Review Focus

1. **FP PRO chiuso, MySQL irraggiungibile o tabella vuota**: la sincronizzazione deve fallire con un messaggio chiaro **prima di scrivere**, senza segnare tutto il catalogo "non più presente" → test in Task 2 (`verificaSorgente` con 0 righe).
2. **Aggiornamento di FP PRO che rinomina o toglie una colonna**: errore che nomina tabella e colonna, nessun dato toccato → test in Task 2 (`verificaSorgente` con colonna mancante).
3. **Sincronizzazione automatica che fallisce sempre** (es. MySQL spento): non deve riprovare ogni 30 secondi per tutto il giorno, al massimo una volta al giorno → test in Task 3 (`devoAccodareSyncGiornaliera` con giorno già usato).
4. **Pulsante Sincronizza premuto due volte, o mentre gira quella automatica**: una sola richiesta aperta, il secondo clic mostra quella in corso → indice univoco parziale (Task 1) + gestione `23505` (Task 6), verificato a mano nel Task 7.
5. **Ponte chiuso a metà sincronizzazione** (PC spento, crash): la richiesta non deve restare "in corso" per sempre → al riavvio il ponte la chiude come "interrotta" (Task 4), verificato a mano nel Task 7.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261010120000_catalogo_fp.sql` | tabelle `fp_*`, `fp_ponte_richieste`, `fp_ponte_stato`, RLS |
| `types/fppro.ts` | tipi condivisi dall'app (stato, richieste, righe catalogo) |
| `lib/fppro/sync-tabelle.ts` | elenco tabelle da copiare, query MySQL, mappatura riga MySQL → riga Supabase, controlli sorgente, blocchi |
| `lib/fppro/ponte-regole.ts` | regole pure: stato del ponte, giorno Europe/Rome, quando accodare la sync giornaliera |
| `lib/fppro/catalogo.ts` | regole pure per la pagina: pulizia testo di ricerca, prezzo unitario accessorio, testi delle righe |
| `ponte/package.json`, `ponte/tsconfig.json` | progetto Node del ponte |
| `ponte/src/config.ts` | lettura e controllo delle variabili d'ambiente |
| `ponte/src/log.ts` | log giornaliero su file + console |
| `ponte/src/sincronizza.ts` | legge tutto dal MySQL, controlla, poi scrive su Supabase |
| `ponte/src/ponte.ts` | avvio, segnale di vita, coda richieste, sync giornaliera, modalità `--una-volta` |
| `ponte/crea-env.ps1` | crea il file `.env` del ponte da `CONF_FPP.INI` e `.env.local` |
| `ponte/installa.ps1` | copia in `C:\WinStudioPonte`, installa le dipendenze, avvio automatico |
| `actions/catalogo-fp.ts` | server action: stato, richiesta sincronizzazione, serie, ricerca |
| `app/(dashboard)/catalogo-fp/page.tsx` | pagina |
| `components/catalogo-fp/CatalogoFpClient.tsx` | interfaccia: stato ponte, pulsante, schede con ricerca |
| `components/layout/Sidebar.tsx` | voce di menu |
| `tsconfig.json`, `.gitignore` | escludere `ponte/` dal typecheck dell'app, ignorare `node_modules` e `.env` del ponte |

---

### Task 1: Tabelle in Supabase e tipi

**Files:**
- Create: `supabase/migrations/20261010120000_catalogo_fp.sql`
- Create: `types/fppro.ts`

**Interfaces:**
- Produces: tabelle `fp_serie`, `fp_profili`, `fp_profili_costi`, `fp_colori`, `fp_accessori`, `fp_accessori_costi`, `fp_vetri`, `fp_kit`, `fp_kit_righe` (tutte con `organization_id, fp_id, presente, sincronizzato_at, dati` + `UNIQUE (organization_id, fp_id)`), `fp_ponte_richieste`, `fp_ponte_stato`; tipi `StatoRichiesta`, `RichiestaPonte`, `TabellaConteggio`, `TABELLE_CONTEGGIO`, `CatalogoFpStato`, `SerieFp`, `TipoCatalogo`, `RigaCatalogo`.

- [ ] **Step 1: Creare il branch di lavoro**

```bash
git checkout -b feat/catalogo-fp
```

(Parte da `docs/progetto-fppro`, che contiene già spec e piano.)

- [ ] **Step 2: Scrivere la migration**

`supabase/migrations/20261010120000_catalogo_fp.sql`:

```sql
-- ============================================================
-- 20261010120000_catalogo_fp.sql
-- Catalogo FP PRO (fase 1 del progetto rilievo -> preventivo -> FP PRO).
-- Le tabelle fp_* sono una COPIA del MySQL di FP PRO (archivio EDILSIDER):
-- le scrive solo il ponte sul PC col service role, gli utenti le leggono.
-- fp_id = chiave della riga in FP PRO; presente = false quando la riga
-- non c'e' piu' in FP PRO (non si cancella: rilievi e preventivi futuri
-- potrebbero puntarci); dati = riga originale senza i campi vuoti.
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_serie (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  nome             text NOT NULL,
  descrizione      text,
  visibile         boolean NOT NULL DEFAULT true,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

CREATE TABLE IF NOT EXISTS fp_profili (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id                 integer NOT NULL,
  serie_fp_id           integer,
  codice                text NOT NULL,
  descrizione           text,
  kg_ml                 numeric,
  larghezza             numeric,
  costo_kg              numeric,
  costo_ml              numeric,
  var_listino           numeric,
  tolleranza_estrusione numeric,
  file_dxf              text,
  presente              boolean NOT NULL DEFAULT true,
  sincronizzato_at      timestamptz NOT NULL DEFAULT now(),
  dati                  jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

-- Prezzo del profilo per finitura (colore): e' qui che sta il prezzo vero.
CREATE TABLE IF NOT EXISTS fp_profili_costi (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  profilo_fp_id    integer NOT NULL,
  colore_fp_id     integer,
  codice_trattato  text,
  costo_kg         numeric,
  costo_ml         numeric,
  var_listino      numeric,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_profili_costi_profilo ON fp_profili_costi(organization_id, profilo_fp_id);

-- Finiture: in FP PRO sono i "trattamenti superficiali".
CREATE TABLE IF NOT EXISTS fp_colori (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  descrizione      text NOT NULL,
  tipo             integer,
  costo_kg         numeric,
  costo_ml         numeric,
  costo_mq         numeric,
  per_profili      boolean NOT NULL DEFAULT false,
  per_accessori    boolean NOT NULL DEFAULT false,
  per_vetri        boolean NOT NULL DEFAULT false,
  rgb              text,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

-- prezzo = prezzo per "unita_vendita" pezzi (es. 432 EUR ogni 400 pezzi).
CREATE TABLE IF NOT EXISTS fp_accessori (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  serie            text,
  codice           text NOT NULL,
  descrizione      text,
  prezzo           numeric,
  unita_vendita    numeric,
  confezione       numeric,
  min_fatt         numeric,
  var_listino      numeric,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_accessori_codice ON fp_accessori(organization_id, codice);

CREATE TABLE IF NOT EXISTS fp_accessori_costi (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id             integer NOT NULL,
  accessorio_fp_id  integer NOT NULL,
  colore_fp_id      integer,
  codice_trattato   text,
  prezzo            numeric,
  costo_unitario    numeric,
  unita_vendita     numeric,
  var_listino       numeric,
  presente          boolean NOT NULL DEFAULT true,
  sincronizzato_at  timestamptz NOT NULL DEFAULT now(),
  dati              jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_accessori_costi_acc ON fp_accessori_costi(organization_id, accessorio_fp_id);

CREATE TABLE IF NOT EXISTS fp_vetri (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  codice           text NOT NULL,
  descrizione      text,
  prezzo_mq        numeric,
  min_fatt         numeric,
  spessore         numeric,
  kg_mq            numeric,
  var_listino      numeric,
  isolante         boolean NOT NULL DEFAULT false,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

CREATE TABLE IF NOT EXISTS fp_kit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  nome             text NOT NULL,
  descrizione      text,
  gruppo_fp_id     integer,
  opzionale        boolean NOT NULL DEFAULT false,
  predefinito      boolean NOT NULL DEFAULT false,
  numero_ante      integer,
  l_min            numeric,
  l_max            numeric,
  h_min            numeric,
  h_max            numeric,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

-- Righe dei kit con le regole di quantita' (fisse, a fasce, a passo, a formula).
CREATE TABLE IF NOT EXISTS fp_kit_righe (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  kit_fp_id        integer NOT NULL,
  tipo             integer,
  codice           text,
  descrizione      text,
  quantita         numeric,
  opzionale        boolean NOT NULL DEFAULT false,
  dim_rif          integer,
  lim_inf          numeric,
  lim_sup          numeric,
  passo            numeric,
  formula_l        text,
  formula_h        text,
  formula_r        text,
  formula_dist     text,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_kit_righe_kit ON fp_kit_righe(organization_id, kit_fp_id);

-- Richieste da WinStudio al ponte.
CREATE TABLE IF NOT EXISTS fp_ponte_richieste (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('sincronizza')),
  stato           text NOT NULL DEFAULT 'in_attesa'
                  CHECK (stato IN ('in_attesa', 'in_corso', 'completata', 'errore')),
  automatica      boolean NOT NULL DEFAULT false,
  richiesta_da    uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  iniziata_at     timestamptz,
  finita_at       timestamptz,
  esito           jsonb,
  errore          text
);
-- Al massimo UNA richiesta aperta per organizzazione: due clic = una richiesta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_ponte_richieste_aperta
  ON fp_ponte_richieste(organization_id) WHERE stato IN ('in_attesa', 'in_corso');
CREATE INDEX IF NOT EXISTS idx_fp_ponte_richieste_recenti
  ON fp_ponte_richieste(organization_id, created_at DESC);

-- Una riga per organizzazione: segnale di vita e ultima sincronizzazione.
CREATE TABLE IF NOT EXISTS fp_ponte_stato (
  organization_id    uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ultimo_segnale_at  timestamptz,
  versione           text,
  ultima_sync_at     timestamptz,
  ultima_sync_esito  jsonb,
  -- Giorno (Europe/Rome, 'YYYY-MM-DD') in cui e' stata accodata l'ultima
  -- sync automatica: evita di riprovare ogni 30 s se fallisce.
  ultimo_giorno_auto text
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fp_serie','fp_profili','fp_profili_costi','fp_colori','fp_accessori',
                           'fp_accessori_costi','fp_vetri','fp_kit','fp_kit_righe','fp_ponte_stato']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (organization_id = get_user_organization_id())',
                   t || '_select', t);
  END LOOP;
END $$;

ALTER TABLE fp_ponte_richieste ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_ponte_richieste_select" ON fp_ponte_richieste
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fp_ponte_richieste_insert" ON fp_ponte_richieste
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND tipo = 'sincronizza');
```

- [ ] **Step 3: Applicare la migration**

Con lo strumento Supabase MCP `apply_migration` (nome `catalogo_fp`, contenuto del file).
Poi verificare con `execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and (table_name like 'fp\_%')
order by 1;
```

Expected: 11 righe (`fp_accessori`, `fp_accessori_costi`, `fp_colori`, `fp_kit`, `fp_kit_righe`, `fp_ponte_richieste`, `fp_ponte_stato`, `fp_profili`, `fp_profili_costi`, `fp_serie`, `fp_vetri`).

- [ ] **Step 4: Scrivere i tipi**

`types/fppro.ts`:

```ts
// Tipi del Catalogo FP PRO (copia del MySQL di FP PRO, archivio EDILSIDER)
// e del ponte sul PC che la tiene aggiornata.

export type StatoRichiesta = 'in_attesa' | 'in_corso' | 'completata' | 'errore'

export interface RichiestaPonte {
  id: string
  tipo: 'sincronizza'
  stato: StatoRichiesta
  automatica: boolean
  created_at: string
  iniziata_at: string | null
  finita_at: string | null
  errore: string | null
  /** Righe copiate per tabella, es. { fp_profili: 2601 } */
  esito: Record<string, number> | null
}

export const TABELLE_CONTEGGIO = [
  'fp_serie',
  'fp_profili',
  'fp_colori',
  'fp_accessori',
  'fp_vetri',
  'fp_kit',
] as const

export type TabellaConteggio = (typeof TABELLE_CONTEGGIO)[number]

export interface CatalogoFpStato {
  ultimoSegnaleAt: string | null
  ultimaSyncAt: string | null
  versionePonte: string | null
  ultimaRichiesta: RichiestaPonte | null
  conteggi: Record<TabellaConteggio, number>
}

export interface SerieFp {
  fp_id: number
  nome: string
  descrizione: string | null
}

export type TipoCatalogo = 'profili' | 'accessori' | 'vetri' | 'colori'

/** Riga gia' pronta da mostrare nella tabella del catalogo. */
export interface RigaCatalogo {
  id: string
  codice: string
  descrizione: string
  serie: string
  dettaglio: string
  prezzo: string
  /** true quando il prezzo manca in FP PRO */
  senzaPrezzo: boolean
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261010120000_catalogo_fp.sql types/fppro.ts
git commit -m "feat(catalogo-fp): tabelle del catalogo FP PRO e della coda del ponte"
```

---

### Task 2: Mappatura delle tabelle di FP PRO (`lib/fppro/sync-tabelle.ts`)

**Files:**
- Create: `lib/fppro/sync-tabelle.ts`
- Test: `lib/fppro/sync-tabelle.test.ts`

**Interfaces:**
- Consumes: niente (il file non importa nulla).
- Produces:
  - `type Riga = Record<string, unknown>`
  - `interface RigaFp { fp_id: number; dati: Record<string, unknown>; [colonna: string]: unknown }`
  - `interface TabellaSync { mysql: string; supabase: string; sql: string; colonne: string[]; mappa: (r: Riga) => RigaFp }`
  - `numero(v: unknown): number | null`, `testo(v: unknown): string | null`, `flag(v: unknown): boolean`, `compatta(r: Riga): Record<string, unknown>`
  - `TABELLE_SYNC: TabellaSync[]` (9 tabelle, in quest'ordine: fp_serie, fp_profili, fp_profili_costi, fp_colori, fp_accessori, fp_accessori_costi, fp_vetri, fp_kit, fp_kit_righe)
  - `verificaSorgente(t: TabellaSync, righe: Riga[], colonnePresenti: string[]): string | null`
  - `aBlocchi<T>(righe: T[], dimensione: number): T[][]`

- [ ] **Step 1: Scrivere i test (falliscono)**

`lib/fppro/sync-tabelle.test.ts` — le righe d'esempio sono copiate dal MySQL vero di FP PRO (i decimali arrivano da `mysql2` come stringhe):

```ts
import { describe, expect, it } from 'vitest'
import {
  TABELLE_SYNC, aBlocchi, compatta, flag, numero, testo, verificaSorgente,
  type TabellaSync,
} from './sync-tabelle'

const tabella = (nome: string): TabellaSync => {
  const t = TABELLE_SYNC.find(x => x.supabase === nome)
  if (!t) throw new Error(`tabella ${nome} non trovata`)
  return t
}

describe('conversioni', () => {
  it('numero legge i decimali di mysql2 (stringhe) e scarta il vuoto', () => {
    expect(numero('374.4250')).toBe(374.425)
    expect(numero(2.148)).toBe(2.148)
    expect(numero('0.0000')).toBe(0)
    expect(numero(null)).toBeNull()
    expect(numero('')).toBeNull()
    expect(numero('abc')).toBeNull()
  })
  it('testo toglie gli spazi e trasforma il vuoto in null', () => {
    expect(testo('  TT8002 ')).toBe('TT8002')
    expect(testo('')).toBeNull()
    expect(testo(null)).toBeNull()
  })
  it('flag: in FP PRO "vero" puo\' essere 1 o -1', () => {
    expect(flag(1)).toBe(true)
    expect(flag(-1)).toBe(true)
    expect(flag(0)).toBe(false)
    expect(flag(null)).toBe(false)
  })
  it('compatta toglie null e stringhe vuote, converte le date, scarta i binari', () => {
    const d = new Date('2025-08-06T17:43:08.000Z')
    expect(compatta({ a: 1, b: null, c: '', d, e: Buffer.from('x'), f: 0 }))
      .toEqual({ a: 1, d: '2025-08-06T17:43:08.000Z', f: 0 })
  })
})

describe('mappature', () => {
  it('ci sono le 9 tabelle, nell\'ordine giusto', () => {
    expect(TABELLE_SYNC.map(t => t.supabase)).toEqual([
      'fp_serie', 'fp_profili', 'fp_profili_costi', 'fp_colori', 'fp_accessori',
      'fp_accessori_costi', 'fp_vetri', 'fp_kit', 'fp_kit_righe',
    ])
  })

  it('profilo TT8002', () => {
    const r = tabella('fp_profili').mappa({
      pkid: 1201, serieid: 12, codice: 'TT8002', descr: 'Telaio 2 binari', kg_ml: 2.148,
      larghezza: 46.7, costo_kg: '0.0000', costo_ml: '0.0000', varlistino: '0.0000',
      tolleranza_estrusione: '0.0000', nome_file_dxf: 'AL_SLIDE\\TT8002B.DXF', perimetro: null,
    })
    expect(r).toMatchObject({
      fp_id: 1201, serie_fp_id: 12, codice: 'TT8002', descrizione: 'Telaio 2 binari',
      kg_ml: 2.148, larghezza: 46.7, costo_kg: 0, file_dxf: 'AL_SLIDE\\TT8002B.DXF',
    })
    expect(r.dati).not.toHaveProperty('perimetro')
  })

  it('costo profilo per colore', () => {
    expect(tabella('fp_profili_costi').mappa({
      pkid: 9, profiloid: 1201, trattsupid: 41, codiceproftrattato: '',
      costo_kg: '9.4400', costo_ml: '0.0000', varlistino: '0.0000',
    })).toMatchObject({ fp_id: 9, profilo_fp_id: 1201, colore_fp_id: 41, codice_trattato: null, costo_kg: 9.44, costo_ml: 0 })
  })

  it('colore: trattamento superficiale', () => {
    expect(tabella('fp_colori').mappa({
      pkid: 56, descr: '19 - RAL 9010C2 CLAS', tipo: 1, costo_kg: '1.2200', costo_ml: '0.0000',
      costomq: '0.0000', isforprof: 1, isforfit: 0, isforglass: 0, rgbortexture: null,
    })).toMatchObject({
      fp_id: 56, descrizione: '19 - RAL 9010C2 CLAS', costo_kg: 1.22,
      per_profili: true, per_accessori: false, per_vetri: false, rgb: null,
    })
  })

  it('accessorio ACP 8012 con il nome della sua serie', () => {
    expect(tabella('fp_accessori').mappa({
      pkid: 79, serieid: 5, codice: 'ACP 8012', descr: 'KIT CHIUSURA UNIVERSALE',
      costo_grezzo: '374.4250', un_vend: 50, confezione: 1, min_fatt: 0, varlistino: '0.0000',
      serie_nome: 'ALSISTEM SLIDE 80/106',
    })).toMatchObject({
      fp_id: 79, serie: 'ALSISTEM SLIDE 80/106', codice: 'ACP 8012',
      prezzo: 374.425, unita_vendita: 50, confezione: 1,
    })
  })

  it('vetro senza prezzo resta con prezzo 0 (la pagina lo segnala)', () => {
    expect(tabella('fp_vetri').mappa({
      pkid: 345, codice: '33.1SAT_15_4', descr: null, costo_grezzo: '0.0000', min_fatt: 0.5,
      spessore: 26, kg_mq: 27.5, varlistino: '0.0000', vetroisolante: 1,
    })).toMatchObject({ fp_id: 345, codice: '33.1SAT_15_4', descrizione: null, prezzo_mq: 0, min_fatt: 0.5, isolante: true })
  })

  it('riga di kit con regola a fasce', () => {
    expect(tabella('fp_kit_righe').mappa({
      iditem: 49550, kitid: 1, tipo: 1, codice: 'MA5605', descr: 'Cerniera a pettine',
      num_base: 2, opzionale: 0, dim_rif: 1, lim_inf_range: 1501, lim_sup_range: 4000,
      step: 0, formulal: '', formulah: '', formular: 'w/2', formuladist: null,
    })).toMatchObject({
      fp_id: 49550, kit_fp_id: 1, codice: 'MA5605', quantita: 2, opzionale: false,
      dim_rif: 1, lim_inf: 1501, lim_sup: 4000, passo: 0, formula_l: null, formula_r: 'w/2',
    })
  })

  it('una riga senza chiave fa fallire (non si inventano id)', () => {
    expect(() => tabella('fp_serie').mappa({ pkid: null, serie: 'X' })).toThrow(/id non valido/)
  })
})

describe('verificaSorgente', () => {
  const t = tabella('fp_vetri')
  const tutte = t.colonne
  it('tutto a posto', () => {
    expect(verificaSorgente(t, [{ pkid: 1 }], tutte)).toBeNull()
  })
  it('tabella vuota: FP PRO chiuso o archivio sbagliato, non si scrive nulla', () => {
    expect(verificaSorgente(t, [], tutte)).toMatch(/vetri.*vuota/)
  })
  it('colonna sparita dopo un aggiornamento di FP PRO', () => {
    const msg = verificaSorgente(t, [{ pkid: 1 }], tutte.filter(c => c !== 'costo_grezzo'))
    expect(msg).toMatch(/vetri/)
    expect(msg).toMatch(/costo_grezzo/)
  })
  it('i nomi di colonna di MySQL possono arrivare in maiuscolo', () => {
    expect(verificaSorgente(t, [{ pkid: 1 }], tutte.map(c => c.toUpperCase()))).toBeNull()
  })
})

describe('aBlocchi', () => {
  it('spezza in blocchi della dimensione data', () => {
    expect(aBlocchi([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(aBlocchi([], 500)).toEqual([])
  })
})
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `npx vitest run lib/fppro/sync-tabelle.test.ts`
Expected: FAIL — `Failed to resolve import "./sync-tabelle"`.

- [ ] **Step 3: Scrivere l'implementazione**

`lib/fppro/sync-tabelle.ts`:

```ts
/**
 * Tabelle di FP PRO (MySQL fp_pro32_edilsider) copiate nelle tabelle fp_* di Supabase.
 *
 * Lo usa il ponte sul PC (ponte/src/sincronizza.ts), che lo esegue con Node SENZA
 * build: questo file non deve importare nulla (niente alias '@/', niente altri file).
 *
 * I decimali arrivano da mysql2 come stringhe ('374.4250'): passano sempre da numero().
 */

export type Riga = Record<string, unknown>

export interface RigaFp {
  fp_id: number
  dati: Record<string, unknown>
  [colonna: string]: unknown
}

export interface TabellaSync {
  /** Tabella MySQL di cui si controllano le colonne */
  mysql: string
  /** Tabella Supabase di destinazione */
  supabase: string
  sql: string
  /** Colonne MySQL usate da mappa(): se ne manca una, la sync si ferma */
  colonne: string[]
  mappa: (r: Riga) => RigaFp
}

export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function testo(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** In FP PRO "vero" e' 1 oppure -1 */
export function flag(v: unknown): boolean {
  return v !== null && v !== undefined && Number(v) !== 0
}

/** Riga originale senza i campi vuoti: va in `dati` per usi futuri. */
export function compatta(r: Riga): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined || v === '') continue
    if (v instanceof Date) {
      out[k] = v.toISOString()
      continue
    }
    if (typeof v === 'object') continue // blob/binari: non servono
    out[k] = v
  }
  return out
}

function id(v: unknown): number {
  const n = numero(v)
  if (n === null) throw new Error(`id non valido: ${String(v)}`)
  return n
}

export const TABELLE_SYNC: TabellaSync[] = [
  {
    mysql: 'serie_profili',
    supabase: 'fp_serie',
    sql: 'select * from serie_profili order by pkid',
    colonne: ['pkid', 'serie', 'nomeestesoserie', 'visibile'],
    mappa: r => ({
      fp_id: id(r.pkid),
      nome: testo(r.serie) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.nomeestesoserie),
      visibile: r.visibile === null || r.visibile === undefined ? true : flag(r.visibile),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'profili',
    supabase: 'fp_profili',
    sql: 'select * from profili order by pkid',
    colonne: ['pkid', 'serieid', 'codice', 'descr', 'kg_ml', 'larghezza', 'costo_kg', 'costo_ml',
      'varlistino', 'tolleranza_estrusione', 'nome_file_dxf'],
    mappa: r => ({
      fp_id: id(r.pkid),
      serie_fp_id: numero(r.serieid),
      codice: testo(r.codice) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      kg_ml: numero(r.kg_ml),
      larghezza: numero(r.larghezza),
      costo_kg: numero(r.costo_kg),
      costo_ml: numero(r.costo_ml),
      var_listino: numero(r.varlistino),
      tolleranza_estrusione: numero(r.tolleranza_estrusione),
      file_dxf: testo(r.nome_file_dxf),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'costo_profili',
    supabase: 'fp_profili_costi',
    sql: 'select * from costo_profili order by pkid',
    colonne: ['pkid', 'profiloid', 'trattsupid', 'codiceproftrattato', 'costo_kg', 'costo_ml', 'varlistino'],
    mappa: r => ({
      fp_id: id(r.pkid),
      profilo_fp_id: id(r.profiloid),
      colore_fp_id: numero(r.trattsupid),
      codice_trattato: testo(r.codiceproftrattato),
      costo_kg: numero(r.costo_kg),
      costo_ml: numero(r.costo_ml),
      var_listino: numero(r.varlistino),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'trattamenti_superficiali',
    supabase: 'fp_colori',
    sql: 'select * from trattamenti_superficiali order by pkid',
    colonne: ['pkid', 'descr', 'tipo', 'costo_kg', 'costo_ml', 'costomq', 'isforprof', 'isforfit',
      'isforglass', 'rgbortexture'],
    mappa: r => ({
      fp_id: id(r.pkid),
      descrizione: testo(r.descr) ?? `#${String(r.pkid)}`,
      tipo: numero(r.tipo),
      costo_kg: numero(r.costo_kg),
      costo_ml: numero(r.costo_ml),
      costo_mq: numero(r.costomq),
      per_profili: flag(r.isforprof),
      per_accessori: flag(r.isforfit),
      per_vetri: flag(r.isforglass),
      rgb: testo(r.rgbortexture),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'accessori',
    supabase: 'fp_accessori',
    sql: 'select a.*, sa.serie as serie_nome from accessori a ' +
      'left join serie_accessori sa on sa.pkid = a.serieid order by a.pkid',
    colonne: ['pkid', 'serieid', 'codice', 'descr', 'costo_grezzo', 'un_vend', 'confezione',
      'min_fatt', 'varlistino'],
    mappa: r => ({
      fp_id: id(r.pkid),
      serie: testo(r.serie_nome),
      codice: testo(r.codice) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      prezzo: numero(r.costo_grezzo),
      unita_vendita: numero(r.un_vend),
      confezione: numero(r.confezione),
      min_fatt: numero(r.min_fatt),
      var_listino: numero(r.varlistino),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'costo_accessori',
    supabase: 'fp_accessori_costi',
    sql: 'select * from costo_accessori order by pkid',
    colonne: ['pkid', 'accessorioid', 'trattsupid', 'codiceacctrattato', 'ppu_vend', 'costounitario',
      'un_vend', 'varlistino'],
    mappa: r => ({
      fp_id: id(r.pkid),
      accessorio_fp_id: id(r.accessorioid),
      colore_fp_id: numero(r.trattsupid),
      codice_trattato: testo(r.codiceacctrattato),
      prezzo: numero(r.ppu_vend),
      costo_unitario: numero(r.costounitario),
      unita_vendita: numero(r.un_vend),
      var_listino: numero(r.varlistino),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'vetri',
    supabase: 'fp_vetri',
    sql: 'select * from vetri order by pkid',
    colonne: ['pkid', 'codice', 'descr', 'costo_grezzo', 'min_fatt', 'spessore', 'kg_mq', 'varlistino',
      'vetroisolante'],
    mappa: r => ({
      fp_id: id(r.pkid),
      codice: testo(r.codice) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      prezzo_mq: numero(r.costo_grezzo),
      min_fatt: numero(r.min_fatt),
      spessore: numero(r.spessore),
      kg_mq: numero(r.kg_mq),
      var_listino: numero(r.varlistino),
      isolante: flag(r.vetroisolante),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'kit',
    supabase: 'fp_kit',
    sql: 'select * from kit order by pkid',
    colonne: ['pkid', 'gruppoid', 'nomekit', 'descr', 'opzionale', 'predefinito', 'numeroante',
      'l_vano_min', 'l_vano_max', 'h_vano_min', 'h_vano_max'],
    mappa: r => ({
      fp_id: id(r.pkid),
      nome: testo(r.nomekit) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      gruppo_fp_id: numero(r.gruppoid),
      opzionale: flag(r.opzionale),
      predefinito: flag(r.predefinito),
      numero_ante: numero(r.numeroante),
      l_min: numero(r.l_vano_min),
      l_max: numero(r.l_vano_max),
      h_min: numero(r.h_vano_min),
      h_max: numero(r.h_vano_max),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'dettagliokit',
    supabase: 'fp_kit_righe',
    sql: 'select * from dettagliokit order by iditem',
    colonne: ['iditem', 'kitid', 'tipo', 'codice', 'descr', 'num_base', 'opzionale', 'dim_rif',
      'lim_inf_range', 'lim_sup_range', 'step', 'formulal', 'formulah', 'formular', 'formuladist'],
    mappa: r => ({
      fp_id: id(r.iditem),
      kit_fp_id: id(r.kitid),
      tipo: numero(r.tipo),
      codice: testo(r.codice),
      descrizione: testo(r.descr),
      quantita: numero(r.num_base),
      opzionale: flag(r.opzionale),
      dim_rif: numero(r.dim_rif),
      lim_inf: numero(r.lim_inf_range),
      lim_sup: numero(r.lim_sup_range),
      passo: numero(r.step),
      formula_l: testo(r.formulal),
      formula_h: testo(r.formulah),
      formula_r: testo(r.formular),
      formula_dist: testo(r.formuladist),
      dati: compatta(r),
    }),
  },
]

/**
 * Controlla la sorgente PRIMA di scrivere: se manca una colonna (aggiornamento di
 * FP PRO) o la tabella e' vuota (FP PRO chiuso, archivio sbagliato) restituisce il
 * messaggio d'errore e la sincronizzazione non tocca niente.
 */
export function verificaSorgente(t: TabellaSync, righe: Riga[], colonnePresenti: string[]): string | null {
  const presenti = new Set(colonnePresenti.map(c => c.toLowerCase()))
  const mancanti = t.colonne.filter(c => !presenti.has(c))
  if (mancanti.length > 0) {
    return `FP PRO: nella tabella ${t.mysql} mancano le colonne ${mancanti.join(', ')}. ` +
      'Forse FP PRO e\' stato aggiornato. Sincronizzazione annullata, nessun dato modificato.'
  }
  if (righe.length === 0) {
    return `FP PRO: la tabella ${t.mysql} e' vuota. Sincronizzazione annullata, nessun dato modificato.`
  }
  return null
}

export function aBlocchi<T>(righe: T[], dimensione: number): T[][] {
  const blocchi: T[][] = []
  for (let i = 0; i < righe.length; i += dimensione) blocchi.push(righe.slice(i, i + dimensione))
  return blocchi
}
```

- [ ] **Step 4: Lanciare i test e vederli passare**

Run: `npx vitest run lib/fppro/sync-tabelle.test.ts`
Expected: PASS, tutti i test.

- [ ] **Step 5: Commit**

```bash
git add lib/fppro/sync-tabelle.ts lib/fppro/sync-tabelle.test.ts
git commit -m "feat(catalogo-fp): mappatura delle tabelle di FP PRO con controlli sulla sorgente"
```

---

### Task 3: Regole del ponte e del catalogo (`ponte-regole.ts`, `catalogo.ts`)

**Files:**
- Create: `lib/fppro/ponte-regole.ts`, `lib/fppro/catalogo.ts`
- Test: `lib/fppro/ponte-regole.test.ts`, `lib/fppro/catalogo.test.ts`

**Interfaces:**
- Consumes: `RigaCatalogo` da `types/fppro.ts` (solo `catalogo.ts`, che usa l'app e non il ponte).
- Produces:
  - `ponte-regole.ts` (nessun import): `type StatoPonte = 'collegato' | 'non_raggiungibile' | 'mai_collegato'`, `SOGLIA_SILENZIO_MS = 120000`, `statoPonte(ultimoSegnale: string | null, ora: Date): StatoPonte`, `giornoRoma(d: Date): string` (`'YYYY-MM-DD'`), `devoAccodareSyncGiornaliera(ultimoGiornoAuto: string | null, ora: Date, richiestaAperta: boolean): boolean`
  - `catalogo.ts`: `pulisciRicerca(s: string): string`, `prezzoUnitarioAccessorio(prezzo: number | null, unitaVendita: number | null): number | null`, `formatoEuro(n: number): string`, `rigaProfilo(...)`, `rigaAccessorio(...)`, `rigaVetro(...)`, `rigaColore(...)` (firme sotto)

- [ ] **Step 1: Scrivere i test (falliscono)**

`lib/fppro/ponte-regole.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { devoAccodareSyncGiornaliera, giornoRoma, statoPonte } from './ponte-regole'

describe('statoPonte', () => {
  const ora = new Date('2026-10-10T10:00:00Z')
  it('mai collegato', () => expect(statoPonte(null, ora)).toBe('mai_collegato'))
  it('segnale di 30 secondi fa: collegato', () =>
    expect(statoPonte('2026-10-10T09:59:30Z', ora)).toBe('collegato'))
  it('segnale di 3 minuti fa: PC spento o non raggiungibile', () =>
    expect(statoPonte('2026-10-10T09:57:00Z', ora)).toBe('non_raggiungibile'))
})

describe('giornoRoma', () => {
  it('le 23:30 UTC del 10 sono gia\' l\'11 a Roma (ora legale)', () =>
    expect(giornoRoma(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11'))
  it('d\'inverno (ora solare) 23:30 UTC e\' gia\' il giorno dopo', () =>
    expect(giornoRoma(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'))
})

describe('devoAccodareSyncGiornaliera', () => {
  const ora = new Date('2026-10-10T07:00:00Z')
  it('mai fatta: si accoda', () => expect(devoAccodareSyncGiornaliera(null, ora, false)).toBe(true))
  it('fatta ieri: si accoda', () => expect(devoAccodareSyncGiornaliera('2026-10-09', ora, false)).toBe(true))
  it('gia\' accodata oggi, anche se e\' fallita: non si riprova ogni 30 secondi', () =>
    expect(devoAccodareSyncGiornaliera('2026-10-10', ora, false)).toBe(false))
  it('c\'e\' gia\' una richiesta aperta: non se ne aggiunge un\'altra', () =>
    expect(devoAccodareSyncGiornaliera('2026-10-09', ora, true)).toBe(false))
})
```

`lib/fppro/catalogo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  prezzoUnitarioAccessorio, pulisciRicerca, rigaAccessorio, rigaColore, rigaProfilo, rigaVetro,
} from './catalogo'

describe('pulisciRicerca', () => {
  it('toglie i caratteri che romperebbero il filtro or() di PostgREST', () => {
    expect(pulisciRicerca('  ACP, 8012 (nero) ')).toBe('ACP 8012 nero')
    expect(pulisciRicerca('50%_x*')).toBe('50 x')
  })
})

describe('prezzoUnitarioAccessorio', () => {
  it('prezzo di confezione diviso unita\' di vendita (verificato su FP PRO: 432/400 = 1,08)', () =>
    expect(prezzoUnitarioAccessorio(432, 400)).toBeCloseTo(1.08))
  it('senza unita\' di vendita il prezzo e\' gia\' al pezzo', () =>
    expect(prezzoUnitarioAccessorio(7.5, 0)).toBe(7.5))
  it('prezzo zero o assente = manca', () => {
    expect(prezzoUnitarioAccessorio(0, 50)).toBeNull()
    expect(prezzoUnitarioAccessorio(null, 50)).toBeNull()
  })
})

describe('righe del catalogo', () => {
  it('profilo con prezzi per colore', () => {
    const r = rigaProfilo(
      { id: 'p1', codice: 'TT8002', descrizione: 'Telaio', kg_ml: 2.148, serie_fp_id: 12 },
      'AL_SLIDE',
      [{ costo_kg: 9.44, costo_ml: 0 }, { costo_kg: 9.95, costo_ml: 0 }, { costo_kg: 0, costo_ml: 0 }],
    )
    expect(r).toEqual({
      id: 'p1', codice: 'TT8002', descrizione: 'Telaio', serie: 'AL_SLIDE',
      dettaglio: '2,148 kg/m', prezzo: '9,44 – 9,95 €/kg (2 colori)', senzaPrezzo: false,
    })
  })
  it('profilo senza nessun prezzo', () => {
    const r = rigaProfilo({ id: 'p2', codice: 'X', descrizione: null, kg_ml: null, serie_fp_id: null }, null, [])
    expect(r.prezzo).toBe('manca')
    expect(r.senzaPrezzo).toBe(true)
    expect(r.serie).toBe('—')
  })
  it('accessorio', () => {
    const r = rigaAccessorio({ id: 'a1', codice: 'AGP 4085', descrizione: 'Angolo', serie: 'AL_SISTEM', prezzo: 432, unita_vendita: 400 })
    expect(r.prezzo).toBe('1,08 € al pezzo')
    expect(r.dettaglio).toBe('432,00 € ogni 400 pz')
  })
  it('vetro senza prezzo', () => {
    const r = rigaVetro({ id: 'v1', codice: '33.1SAT_15_4', descrizione: null, prezzo_mq: 0, min_fatt: 0.5, spessore: 26 })
    expect(r).toMatchObject({ prezzo: 'manca', senzaPrezzo: true, dettaglio: 'sp. 26 mm · min. 0,5 m²' })
  })
  it('colore', () => {
    const r = rigaColore({ id: 'c1', descrizione: '19 - RAL 9010C2 CLAS', costo_kg: 1.22, per_profili: true, per_accessori: false, per_vetri: false })
    expect(r).toMatchObject({ codice: '', descrizione: '19 - RAL 9010C2 CLAS', dettaglio: 'profili', prezzo: '+1,22 €/kg' })
  })
})
```

- [ ] **Step 2: Lanciare i test e vederli fallire**

Run: `npx vitest run lib/fppro/ponte-regole.test.ts lib/fppro/catalogo.test.ts`
Expected: FAIL — moduli `./ponte-regole` e `./catalogo` non trovati.

- [ ] **Step 3: Scrivere `lib/fppro/ponte-regole.ts`**

```ts
/**
 * Regole del ponte sul PC. Usato sia dall'app sia dal ponte (eseguito con Node
 * senza build): questo file non deve importare nulla.
 */

export type StatoPonte = 'collegato' | 'non_raggiungibile' | 'mai_collegato'

/** Il ponte manda un segnale ogni 30 s: dopo 2 minuti di silenzio e' spento. */
export const SOGLIA_SILENZIO_MS = 2 * 60 * 1000

export function statoPonte(ultimoSegnale: string | null, ora: Date): StatoPonte {
  if (!ultimoSegnale) return 'mai_collegato'
  const silenzio = ora.getTime() - new Date(ultimoSegnale).getTime()
  return silenzio <= SOGLIA_SILENZIO_MS ? 'collegato' : 'non_raggiungibile'
}

/** Giorno di calendario a Roma, 'YYYY-MM-DD' (il formato svedese e' gia' ISO). */
export function giornoRoma(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d)
}

/**
 * Una sync automatica al giorno. Conta il giorno in cui e' stata ACCODATA, non
 * quello in cui e' riuscita: se fallisce (MySQL spento) non si riprova ogni 30 s.
 */
export function devoAccodareSyncGiornaliera(
  ultimoGiornoAuto: string | null,
  ora: Date,
  richiestaAperta: boolean,
): boolean {
  if (richiestaAperta) return false
  return ultimoGiornoAuto !== giornoRoma(ora)
}
```

- [ ] **Step 4: Scrivere `lib/fppro/catalogo.ts`**

```ts
// Regole della pagina Catalogo FP PRO (solo app: il ponte non lo usa).
import type { RigaCatalogo } from '@/types/fppro'

const euro = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const decimali = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 })

export function formatoEuro(n: number): string {
  return euro.format(n)
}

/** Toglie i caratteri speciali di PostgREST (`, ( )`) e i jolly di ILIKE (`% _ *`). */
export function pulisciRicerca(s: string): string {
  return s.replace(/[,()%_*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** In FP PRO il prezzo dell'accessorio vale per `unita_vendita` pezzi (432 EUR ogni 400). */
export function prezzoUnitarioAccessorio(prezzo: number | null, unitaVendita: number | null): number | null {
  if (prezzo === null || prezzo <= 0) return null
  return unitaVendita && unitaVendita > 0 ? prezzo / unitaVendita : prezzo
}

export function rigaProfilo(
  p: { id: string; codice: string; descrizione: string | null; kg_ml: number | null; serie_fp_id: number | null },
  serie: string | null,
  costi: { costo_kg: number | null; costo_ml: number | null }[],
): RigaCatalogo {
  const kg = costi.map(c => c.costo_kg ?? 0).filter(v => v > 0)
  const ml = costi.map(c => c.costo_ml ?? 0).filter(v => v > 0)
  const intervallo = (valori: number[], unita: string) => {
    const min = Math.min(...valori)
    const max = Math.max(...valori)
    const testo = min === max ? formatoEuro(min) : `${formatoEuro(min)} – ${formatoEuro(max)}`
    return `${testo} €/${unita} (${valori.length} ${valori.length === 1 ? 'colore' : 'colori'})`
  }
  const prezzo = kg.length > 0 ? intervallo(kg, 'kg') : ml.length > 0 ? intervallo(ml, 'm') : 'manca'
  return {
    id: p.id,
    codice: p.codice,
    descrizione: p.descrizione ?? '',
    serie: serie ?? '—',
    dettaglio: p.kg_ml ? `${decimali.format(p.kg_ml)} kg/m` : '',
    prezzo,
    senzaPrezzo: prezzo === 'manca',
  }
}

export function rigaAccessorio(
  a: { id: string; codice: string; descrizione: string | null; serie: string | null; prezzo: number | null; unita_vendita: number | null },
): RigaCatalogo {
  const unitario = prezzoUnitarioAccessorio(a.prezzo, a.unita_vendita)
  const confezione = a.prezzo && a.prezzo > 0 && a.unita_vendita && a.unita_vendita > 1
    ? `${formatoEuro(a.prezzo)} € ogni ${decimali.format(a.unita_vendita)} pz`
    : ''
  return {
    id: a.id,
    codice: a.codice,
    descrizione: a.descrizione ?? '',
    serie: a.serie ?? '—',
    dettaglio: confezione,
    prezzo: unitario === null ? 'manca' : `${formatoEuro(unitario)} € al pezzo`,
    senzaPrezzo: unitario === null,
  }
}

export function rigaVetro(
  v: { id: string; codice: string; descrizione: string | null; prezzo_mq: number | null; min_fatt: number | null; spessore: number | null },
): RigaCatalogo {
  const parti = [
    v.spessore ? `sp. ${decimali.format(v.spessore)} mm` : null,
    v.min_fatt ? `min. ${decimali.format(v.min_fatt)} m²` : null,
  ].filter(Boolean)
  const ha = v.prezzo_mq !== null && v.prezzo_mq > 0
  return {
    id: v.id,
    codice: v.codice,
    descrizione: v.descrizione ?? '',
    serie: '',
    dettaglio: parti.join(' · '),
    prezzo: ha ? `${formatoEuro(v.prezzo_mq as number)} €/m²` : 'manca',
    senzaPrezzo: !ha,
  }
}

export function rigaColore(
  c: { id: string; descrizione: string; costo_kg: number | null; per_profili: boolean; per_accessori: boolean; per_vetri: boolean },
): RigaCatalogo {
  const usi = [c.per_profili && 'profili', c.per_accessori && 'accessori', c.per_vetri && 'vetri'].filter(Boolean)
  return {
    id: c.id,
    codice: '',
    descrizione: c.descrizione,
    serie: '',
    dettaglio: usi.join(', '),
    prezzo: c.costo_kg && c.costo_kg > 0 ? `+${formatoEuro(c.costo_kg)} €/kg` : '',
    senzaPrezzo: false,
  }
}
```

- [ ] **Step 5: Lanciare i test e vederli passare**

Run: `npx vitest run lib/fppro`
Expected: PASS, tutti i test di `sync-tabelle`, `ponte-regole`, `catalogo`.

- [ ] **Step 6: Commit**

```bash
git add lib/fppro/ponte-regole.ts lib/fppro/ponte-regole.test.ts lib/fppro/catalogo.ts lib/fppro/catalogo.test.ts
git commit -m "feat(catalogo-fp): regole del ponte (stato, sync giornaliera) e righe del catalogo"
```

---

### Task 4: Il programma ponte

**Files:**
- Create: `ponte/package.json`, `ponte/tsconfig.json`, `ponte/crea-env.ps1`, `ponte/src/config.ts`, `ponte/src/log.ts`, `ponte/src/sincronizza.ts`, `ponte/src/ponte.ts`
- Modify: `tsconfig.json:33` (exclude), `.gitignore`

**Interfaces:**
- Consumes: `TABELLE_SYNC`, `verificaSorgente`, `aBlocchi`, `Riga`, `RigaFp` (Task 2); `devoAccodareSyncGiornaliera`, `giornoRoma` (Task 3); tabelle del Task 1.
- Produces: comando `node --env-file=<file .env> ponte/src/ponte.ts [--una-volta]`; variabili d'ambiente `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORGANIZATION_ID`, `FP_MYSQL_HOST`, `FP_MYSQL_PORT`, `FP_MYSQL_USER`, `FP_MYSQL_PASSWORD`, `FP_MYSQL_DATABASE`, `PONTE_LOG_DIR`; script `ponte/crea-env.ps1 -Uscita <percorso>`.

- [ ] **Step 1: Progetto Node del ponte**

`ponte/package.json`:

```json
{
  "name": "winstudio-ponte",
  "private": true,
  "type": "module",
  "description": "Ponte tra FP PRO (MySQL locale) e WinStudio (Supabase)",
  "engines": { "node": ">=22.18" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.97.0",
    "mysql2": "^3.11.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0"
  }
}
```

`ponte/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "../lib/fppro/sync-tabelle.ts", "../lib/fppro/ponte-regole.ts"]
}
```

In `tsconfig.json` (app) cambiare la riga 33:

```json
  "exclude": ["node_modules", "app/sw.ts", "ponte"]
```

In `.gitignore` aggiungere in fondo:

```
# Ponte FP PRO: dipendenze e segreti locali
ponte/node_modules/
ponte/.env
```

Run: `cd ponte && npm install && cd ..`
Expected: crea `ponte/package-lock.json` e `ponte/node_modules`, nessun errore.

- [ ] **Step 2: `ponte/src/config.ts`**

```ts
// Configurazione del ponte: arriva dal file .env passato con --env-file.

export interface ConfigPonte {
  supabaseUrl: string
  serviceKey: string
  orgId: string
  mysql: { host: string; port: number; user: string; password: string; database: string }
  logDir: string
}

export function leggiConfig(): ConfigPonte {
  const mancanti: string[] = []
  const v = (k: string): string => {
    const x = process.env[k]
    if (!x) mancanti.push(k)
    return x ?? ''
  }
  const cfg: ConfigPonte = {
    supabaseUrl: v('SUPABASE_URL'),
    serviceKey: v('SUPABASE_SERVICE_ROLE_KEY'),
    orgId: v('ORGANIZATION_ID'),
    mysql: {
      host: v('FP_MYSQL_HOST'),
      port: Number(v('FP_MYSQL_PORT')),
      user: v('FP_MYSQL_USER'),
      password: v('FP_MYSQL_PASSWORD'),
      database: v('FP_MYSQL_DATABASE'),
    },
    logDir: v('PONTE_LOG_DIR'),
  }
  if (mancanti.length > 0) throw new Error(`Mancano nel file .env del ponte: ${mancanti.join(', ')}`)
  return cfg
}
```

- [ ] **Step 3: `ponte/src/log.ts`**

```ts
// Log giornaliero: <logDir>/ponte-YYYY-MM-DD.log, tenuti 30 giorni.
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

let cartella = ''

export function impostaLog(dir: string): void {
  cartella = dir
  mkdirSync(dir, { recursive: true })
  const limite = Date.now() - 30 * 24 * 60 * 60 * 1000
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (f.startsWith('ponte-') && statSync(p).mtimeMs < limite) unlinkSync(p)
  }
}

export function log(messaggio: string): void {
  const ora = new Date()
  const riga = `${ora.toISOString()} ${messaggio}`
  console.log(riga)
  if (!cartella) return
  try {
    appendFileSync(join(cartella, `ponte-${ora.toISOString().slice(0, 10)}.log`), riga + '\n')
  } catch {
    // il log non deve mai fermare il ponte
  }
}
```

- [ ] **Step 4: `ponte/src/sincronizza.ts`**

```ts
// Copia FP PRO -> Supabase. Prima legge e controlla TUTTE le tabelle, poi scrive:
// se una tabella e' vuota o ha cambiato colonne non si tocca niente.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { TABELLE_SYNC, aBlocchi, verificaSorgente } from '../../lib/fppro/sync-tabelle.ts'
import type { Riga, RigaFp, TabellaSync } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

const BLOCCO = 500

export async function sincronizza(
  db: Pool,
  supabase: SupabaseClient,
  orgId: string,
): Promise<Record<string, number>> {
  const inizio = new Date().toISOString()

  const lette: { t: TabellaSync; righe: RigaFp[] }[] = []
  for (const t of TABELLE_SYNC) {
    const [colonne] = await db.query<RowDataPacket[]>(
      'select column_name as c from information_schema.columns where table_schema = database() and table_name = ?',
      [t.mysql],
    )
    const [righe] = await db.query<RowDataPacket[]>(t.sql)
    const errore = verificaSorgente(t, righe as Riga[], colonne.map(r => String(r.c)))
    if (errore) throw new Error(errore)
    lette.push({ t, righe: (righe as Riga[]).map(t.mappa) })
    log(`Letta ${t.mysql}: ${righe.length} righe`)
  }

  const esito: Record<string, number> = {}
  for (const { t, righe } of lette) {
    for (const blocco of aBlocchi(righe, BLOCCO)) {
      const { error } = await supabase.from(t.supabase).upsert(
        blocco.map(r => ({ ...r, organization_id: orgId, presente: true, sincronizzato_at: inizio })),
        { onConflict: 'organization_id,fp_id' },
      )
      if (error) throw new Error(`${t.supabase}: ${error.message}`)
    }
    // Quello che non e' arrivato in questo giro non c'e' piu' in FP PRO.
    const { error } = await supabase
      .from(t.supabase)
      .update({ presente: false })
      .eq('organization_id', orgId)
      .eq('presente', true)
      .lt('sincronizzato_at', inizio)
    if (error) throw new Error(`${t.supabase}: ${error.message}`)
    esito[t.supabase] = righe.length
    log(`Scritta ${t.supabase}: ${righe.length} righe`)
  }
  return esito
}
```

- [ ] **Step 5: `ponte/src/ponte.ts`**

```ts
// Ponte FP PRO <-> WinStudio. Avvio:
//   node --env-file=<.env> ponte/src/ponte.ts             (servizio: segnale + coda)
//   node --env-file=<.env> ponte/src/ponte.ts --una-volta (una sincronizzazione e basta)
import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'
import { devoAccodareSyncGiornaliera, giornoRoma } from '../../lib/fppro/ponte-regole.ts'
import { leggiConfig } from './config.ts'
import { impostaLog, log } from './log.ts'
import { sincronizza } from './sincronizza.ts'

const VERSIONE = '1.0.0'
const GIRO_MS = 30_000

const cfg = leggiConfig()
impostaLog(cfg.logDir)
const supabase = createClient(cfg.supabaseUrl, cfg.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const db = mysql.createPool({ ...cfg.mysql, connectionLimit: 2 })

const messaggio = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function segnale(): Promise<void> {
  const { error } = await supabase
    .from('fp_ponte_stato')
    .upsert(
      { organization_id: cfg.orgId, ultimo_segnale_at: new Date().toISOString(), versione: VERSIONE },
      { onConflict: 'organization_id' },
    )
  if (error) throw new Error(error.message)
}

/** Una richiesta rimasta "in corso" vuol dire che il ponte si e' fermato a meta'. */
async function chiudiInterrotte(): Promise<void> {
  const { error } = await supabase
    .from('fp_ponte_richieste')
    .update({ stato: 'errore', finita_at: new Date().toISOString(), errore: 'Interrotta: il ponte si e\' riavviato a meta\' lavoro. Riprova.' })
    .eq('organization_id', cfg.orgId)
    .eq('stato', 'in_corso')
  if (error) throw new Error(error.message)
}

async function accodaGiornaliera(ora: Date): Promise<void> {
  const { data: stato, error: e1 } = await supabase
    .from('fp_ponte_stato').select('ultimo_giorno_auto').eq('organization_id', cfg.orgId).maybeSingle()
  if (e1) throw new Error(e1.message)
  const { count, error: e2 } = await supabase
    .from('fp_ponte_richieste').select('id', { count: 'exact', head: true })
    .eq('organization_id', cfg.orgId).in('stato', ['in_attesa', 'in_corso'])
  if (e2) throw new Error(e2.message)
  if (!devoAccodareSyncGiornaliera(stato?.ultimo_giorno_auto ?? null, ora, (count ?? 0) > 0)) return

  const { error: e3 } = await supabase
    .from('fp_ponte_stato').update({ ultimo_giorno_auto: giornoRoma(ora) }).eq('organization_id', cfg.orgId)
  if (e3) throw new Error(e3.message)
  const { error: e4 } = await supabase
    .from('fp_ponte_richieste').insert({ organization_id: cfg.orgId, tipo: 'sincronizza', automatica: true })
  // 23505 = nel frattempo qualcuno ha premuto Sincronizza: va bene cosi'.
  if (e4 && e4.code !== '23505') throw new Error(e4.message)
  log('Accodata la sincronizzazione giornaliera')
}

async function eseguiProssima(): Promise<void> {
  const { data: prossima, error } = await supabase
    .from('fp_ponte_richieste').select('id, tipo')
    .eq('organization_id', cfg.orgId).eq('stato', 'in_attesa')
    .order('created_at').limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!prossima) return

  const { data: presa, error: e2 } = await supabase
    .from('fp_ponte_richieste')
    .update({ stato: 'in_corso', iniziata_at: new Date().toISOString() })
    .eq('id', prossima.id).eq('stato', 'in_attesa')
    .select('id').maybeSingle()
  if (e2) throw new Error(e2.message)
  if (!presa) return

  log(`Richiesta ${prossima.id} (${prossima.tipo}) iniziata`)
  try {
    if (prossima.tipo !== 'sincronizza') throw new Error(`Tipo di richiesta sconosciuto: ${prossima.tipo}`)
    const esito = await sincronizza(db, supabase, cfg.orgId)
    const fine = new Date().toISOString()
    await supabase.from('fp_ponte_richieste')
      .update({ stato: 'completata', finita_at: fine, esito }).eq('id', prossima.id)
    await supabase.from('fp_ponte_stato')
      .update({ ultima_sync_at: fine, ultima_sync_esito: esito }).eq('organization_id', cfg.orgId)
    log(`Richiesta ${prossima.id} completata`)
  } catch (e) {
    log(`Richiesta ${prossima.id} fallita: ${messaggio(e)}`)
    await supabase.from('fp_ponte_richieste')
      .update({ stato: 'errore', finita_at: new Date().toISOString(), errore: messaggio(e) })
      .eq('id', prossima.id)
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--una-volta')) {
    const esito = await sincronizza(db, supabase, cfg.orgId)
    console.log(JSON.stringify(esito, null, 2))
    await db.end()
    return
  }

  log(`Ponte avviato (versione ${VERSIONE})`)
  await chiudiInterrotte()
  // Il segnale di vita gira per conto suo: una sync lunga non deve far
  // sembrare il PC spento.
  const battito = () => segnale().catch(e => log(`Segnale non inviato: ${messaggio(e)}`))
  await battito()
  setInterval(battito, GIRO_MS)

  for (;;) {
    try {
      await accodaGiornaliera(new Date())
      await eseguiProssima()
    } catch (e) {
      log(`Errore nel giro: ${messaggio(e)}`)
    }
    await new Promise(r => setTimeout(r, GIRO_MS))
  }
}

main().catch(e => {
  log(`Ponte fermato: ${messaggio(e)}`)
  process.exit(1)
})
```

- [ ] **Step 6: `ponte/crea-env.ps1`**

```powershell
# Crea il file .env del ponte leggendo:
#  - MySQL di FP PRO da C:\FP_PRO\CONFIGS\EDILSIDER\CONF_FPP.INI
#  - Supabase da .env.local del repository
# Il file contiene segreti: non va mai nel repository.
param(
  [Parameter(Mandatory = $true)][string]$Uscita,
  [string]$Ini = 'C:\FP_PRO\CONFIGS\EDILSIDER\CONF_FPP.INI',
  [string]$LogDir = 'C:\WinStudioPonte\log'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

function Valore($righe, $chiave) {
  $r = $righe | Where-Object { $_ -match "^\s*$chiave\s*=" } | Select-Object -First 1
  if (-not $r) { throw "Chiave $chiave non trovata" }
  # Toglie eventuali virgolette gia' presenti in .env.local
  return ($r -replace "^\s*$chiave\s*=\s*", '').Trim().Trim('"')
}

$ini = Get-Content $Ini
$envLocal = Get-Content (Join-Path $repo '.env.local')

$righe = @(
  "SUPABASE_URL=`"$(Valore $envLocal 'NEXT_PUBLIC_SUPABASE_URL')`"",
  "SUPABASE_SERVICE_ROLE_KEY=`"$(Valore $envLocal 'SUPABASE_SERVICE_ROLE_KEY')`"",
  'ORGANIZATION_ID="00000000-0000-0000-0000-000000000001"',
  "FP_MYSQL_HOST=`"$(Valore $ini 'SERVER')`"",
  "FP_MYSQL_PORT=`"$(Valore $ini 'PORT')`"",
  "FP_MYSQL_USER=`"$(Valore $ini 'USER')`"",
  "FP_MYSQL_PASSWORD=`"$(Valore $ini 'PASSWORD')`"",
  "FP_MYSQL_DATABASE=`"$(Valore $ini 'DATABASE')`"",
  "PONTE_LOG_DIR=`"$LogDir`""
)
Set-Content -Path $Uscita -Value $righe -Encoding ascii
Write-Output "Creato $Uscita"
```

- [ ] **Step 7: Controllo dei tipi del ponte**

Run: `cd ponte && npm run typecheck && cd ..`
Expected: nessun errore.

Run: `npx tsc --noEmit` (app)
Expected: nessun errore (la cartella `ponte` è esclusa).

- [ ] **Step 8: Prima sincronizzazione vera, a mano**

Run:
```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ponte/crea-env.ps1 -Uscita ponte/.env -LogDir ponte/log
node --env-file=ponte/.env ponte/src/ponte.ts --una-volta
```
Expected: log "Letta …" e "Scritta …" per le 9 tabelle, poi un JSON con i conteggi. Con i dati del 2026-10-10 circa: `fp_serie` 40, `fp_profili` 2601, `fp_profili_costi` 26436, `fp_colori` 426, `fp_accessori` 20942, `fp_accessori_costi` 9729, `fp_vetri` 198, `fp_kit` 991, `fp_kit_righe` 34819 (i numeri possono cambiare se nel frattempo FP PRO è stato modificato).

Aggiungere anche `ponte/log/` a `.gitignore`.

Verificare con `execute_sql`:

```sql
select 'fp_serie' t, count(*) from fp_serie union all
select 'fp_profili', count(*) from fp_profili union all
select 'fp_accessori', count(*) from fp_accessori union all
select 'fp_kit_righe', count(*) from fp_kit_righe;
select codice, kg_ml from fp_profili where codice = 'TT8002';
```
Expected: conteggi uguali al JSON; `TT8002` con `kg_ml` 2.148.

- [ ] **Step 9: Seconda sincronizzazione (idempotenza)**

Run: `node --env-file=ponte/.env ponte/src/ponte.ts --una-volta`
Expected: stessi conteggi; in Supabase il numero di righe **non** raddoppia e `select count(*) from fp_profili where presente = false` = 0.

- [ ] **Step 10: Commit**

```bash
git add ponte/package.json ponte/package-lock.json ponte/tsconfig.json ponte/crea-env.ps1 ponte/src tsconfig.json .gitignore
git commit -m "feat(ponte): programma ponte FP PRO -> WinStudio con sincronizzazione del catalogo"
```

---

### Task 5: Installazione sul PC con avvio automatico

**Files:**
- Create: `ponte/installa.ps1`

**Interfaces:**
- Consumes: `ponte/crea-env.ps1`, file del ponte (Task 4), `lib/fppro/sync-tabelle.ts`, `lib/fppro/ponte-regole.ts`.
- Produces: `C:\WinStudioPonte\{ponte\, lib\fppro\, lib\package.json, .env, avvia.vbs, log\}`; collegamento di avvio `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WinStudioPonte.vbs`; ponte in esecuzione.

- [ ] **Step 1: Scrivere `ponte/installa.ps1`**

```powershell
# Installa (o aggiorna) il ponte FP PRO -> WinStudio su questo PC.
# Rilanciarlo dopo ogni modifica al codice del ponte: ferma, copia, riavvia.
param([string]$Destinazione = 'C:\WinStudioPonte')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$avvioAutomatico = Join-Path ([Environment]::GetFolderPath('Startup')) 'WinStudioPonte.vbs'

# 1. Ferma il ponte se sta girando (prima il ciclo di riavvio, poi node)
foreach ($nome in 'wscript.exe', 'node.exe') {
  Get-CimInstance Win32_Process -Filter "Name='$nome'" |
    Where-Object { $_.CommandLine -like '*WinStudioPonte*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

# 2. Copia il codice (solo i file che servono al ponte)
New-Item -ItemType Directory -Force "$Destinazione\ponte\src", "$Destinazione\lib\fppro", "$Destinazione\log" | Out-Null
Copy-Item "$repo\ponte\package.json", "$repo\ponte\package-lock.json" "$Destinazione\ponte\" -Force
Copy-Item "$repo\ponte\src\*.ts" "$Destinazione\ponte\src\" -Force
Copy-Item "$repo\lib\fppro\sync-tabelle.ts", "$repo\lib\fppro\ponte-regole.ts" "$Destinazione\lib\fppro\" -Force
# Fuori dal repository non c'e' un package.json sopra lib/: lo dichiariamo ESM.
Set-Content "$Destinazione\lib\package.json" '{ "type": "module" }' -Encoding ascii

# 3. Dipendenze
Push-Location "$Destinazione\ponte"
try { npm ci --omit=dev --no-audit --no-fund | Out-Null } finally { Pop-Location }

# 4. Segreti
& "$PSScriptRoot\crea-env.ps1" -Uscita "$Destinazione\.env" -LogDir "$Destinazione\log"

# 5. Avvio nascosto con riavvio automatico se il ponte si ferma
$node = (Get-Command node).Source
$vbs = @"
' Avvia il ponte WinStudio nascosto e lo riavvia se si ferma.
Set sh = CreateObject("WScript.Shell")
Do
  sh.Run """$node"" --env-file=""$Destinazione\.env"" ""$Destinazione\ponte\src\ponte.ts""", 0, True
  WScript.Sleep 30000
Loop
"@
Set-Content "$Destinazione\avvia.vbs" $vbs -Encoding ascii
Set-Content $avvioAutomatico "CreateObject(""WScript.Shell"").Run ""wscript.exe """"$Destinazione\avvia.vbs"""""", 0, False" -Encoding ascii

# 6. Avvio subito
Start-Process wscript.exe -ArgumentList "`"$Destinazione\avvia.vbs`""
Write-Output "Ponte installato in $Destinazione e avviato. Avvio automatico: $avvioAutomatico"
```

- [ ] **Step 2: Installare**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File ponte/installa.ps1`
Expected: "Ponte installato in C:\WinStudioPonte e avviato…".

- [ ] **Step 3: Verificare che giri**

Attendere ~40 secondi, poi con `execute_sql`:

```sql
select ultimo_segnale_at, versione, ultimo_giorno_auto, ultima_sync_at
from fp_ponte_stato;
select stato, automatica, created_at, finita_at, errore
from fp_ponte_richieste order by created_at desc limit 3;
```
Expected: `ultimo_segnale_at` di meno di un minuto fa, `versione` 1.0.0; una richiesta `automatica = true` (la sync giornaliera) passata a `completata` entro qualche minuto, `ultimo_giorno_auto` = data di oggi.

Controllare anche il log: `Get-Content C:\WinStudioPonte\log\ponte-*.log -Tail 20` → "Ponte avviato", "Accodata la sincronizzazione giornaliera", "completata".

- [ ] **Step 4: Verificare il riavvio automatico**

Run (PowerShell): `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*WinStudioPonte*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
Attendere ~40 secondi e rileggere `fp_ponte_stato`.
Expected: `ultimo_segnale_at` di nuovo recente (il ciclo in `avvia.vbs` ha riavviato node); nel log un nuovo "Ponte avviato".

- [ ] **Step 5: Commit**

```bash
git add ponte/installa.ps1
git commit -m "feat(ponte): installazione con avvio automatico e riavvio se si ferma"
```

---

### Task 6: Pagina "Catalogo FP PRO" in WinStudio

**Files:**
- Create: `actions/catalogo-fp.ts`, `app/(dashboard)/catalogo-fp/page.tsx`, `components/catalogo-fp/CatalogoFpClient.tsx`
- Modify: `components/layout/Sidebar.tsx` (import icona + voce dopo "Rilievo Misure", riga 52)

**Interfaces:**
- Consumes: tipi del Task 1; `statoPonte` (Task 3); `pulisciRicerca`, `rigaProfilo`, `rigaAccessorio`, `rigaVetro`, `rigaColore` (Task 3); `createClient` da `@/lib/supabase/server`; `getOrgId` da `@/lib/auth`; `getMyPermissions`, `requireAccesso` da `@/lib/permessi`.
- Produces: `getCatalogoFpStato(): Promise<CatalogoFpStato>`, `getSerieFp(): Promise<SerieFp[]>`, `richiediSincronizzazione(): Promise<{ richiesta: RichiestaPonte } | { errore: string }>`, `cercaCatalogo(tipo: TipoCatalogo, testo: string): Promise<RigaCatalogo[]>`; rotta `/catalogo-fp`.

- [ ] **Step 1: Server action `actions/catalogo-fp.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { pulisciRicerca, rigaAccessorio, rigaColore, rigaProfilo, rigaVetro } from '@/lib/fppro/catalogo'
import {
  TABELLE_CONTEGGIO,
  type CatalogoFpStato, type RichiestaPonte, type RigaCatalogo, type SerieFp, type TabellaConteggio, type TipoCatalogo,
} from '@/types/fppro'

const CAMPI_RICHIESTA = 'id, tipo, stato, automatica, created_at, iniziata_at, finita_at, errore, esito'
const LIMITE_RISULTATI = 50

export async function getCatalogoFpStato(): Promise<CatalogoFpStato> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [stato, richieste, conteggi] = await Promise.all([
    supabase.from('fp_ponte_stato')
      .select('ultimo_segnale_at, ultima_sync_at, versione')
      .eq('organization_id', orgId).maybeSingle(),
    supabase.from('fp_ponte_richieste')
      .select(CAMPI_RICHIESTA)
      .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1),
    Promise.all(TABELLE_CONTEGGIO.map(t =>
      supabase.from(t).select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('presente', true),
    )),
  ])
  if (stato.error) throw new Error(stato.error.message)
  if (richieste.error) throw new Error(richieste.error.message)

  const perTabella = {} as Record<TabellaConteggio, number>
  TABELLE_CONTEGGIO.forEach((t, i) => { perTabella[t] = conteggi[i].count ?? 0 })

  return {
    ultimoSegnaleAt: stato.data?.ultimo_segnale_at ?? null,
    ultimaSyncAt: stato.data?.ultima_sync_at ?? null,
    versionePonte: stato.data?.versione ?? null,
    ultimaRichiesta: (richieste.data?.[0] as RichiestaPonte | undefined) ?? null,
    conteggi: perTabella,
  }
}

export async function getSerieFp(): Promise<SerieFp[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('fp_serie').select('fp_id, nome, descrizione')
    .eq('organization_id', orgId).eq('presente', true).order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Una sola richiesta aperta alla volta (indice univoco): il secondo clic riceve quella gia' aperta. */
export async function richiediSincronizzazione(): Promise<{ richiesta: RichiestaPonte } | { errore: string }> {
  const { permessi } = await getMyPermissions()
  if (permessi.rilievo !== 'scrittura') return { errore: 'Non hai i permessi per sincronizzare il catalogo.' }

  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('fp_ponte_richieste').insert({ organization_id: orgId, tipo: 'sincronizza' })
    .select(CAMPI_RICHIESTA).single()
  if (!error) return { richiesta: data as RichiestaPonte }
  if (error.code !== '23505') return { errore: error.message }

  const { data: aperta, error: e2 } = await supabase
    .from('fp_ponte_richieste').select(CAMPI_RICHIESTA)
    .eq('organization_id', orgId).in('stato', ['in_attesa', 'in_corso']).maybeSingle()
  if (e2 || !aperta) return { errore: e2?.message ?? 'Richiesta gia\' in corso.' }
  return { richiesta: aperta as RichiestaPonte }
}

export async function cercaCatalogo(tipo: TipoCatalogo, testo: string): Promise<RigaCatalogo[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const q = pulisciRicerca(testo)
  const filtro = (campi: string[]) => campi.map(c => `${c}.ilike.%${q}%`).join(',')

  if (tipo === 'profili') {
    let query = supabase.from('fp_profili')
      .select('id, fp_id, codice, descrizione, kg_ml, serie_fp_id')
      .eq('organization_id', orgId).eq('presente', true).order('codice').limit(LIMITE_RISULTATI)
    if (q) query = query.or(filtro(['codice', 'descrizione']))
    const { data: profili, error } = await query
    if (error) throw new Error(error.message)
    if (!profili?.length) return []

    const [{ data: costi, error: e2 }, { data: serie, error: e3 }] = await Promise.all([
      supabase.from('fp_profili_costi').select('profilo_fp_id, costo_kg, costo_ml')
        .eq('organization_id', orgId).eq('presente', true)
        .in('profilo_fp_id', profili.map(p => p.fp_id)),
      supabase.from('fp_serie').select('fp_id, nome').eq('organization_id', orgId),
    ])
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)
    const nomeSerie = new Map((serie ?? []).map(s => [s.fp_id, s.nome]))
    return profili.map(p => rigaProfilo(
      p,
      p.serie_fp_id === null ? null : nomeSerie.get(p.serie_fp_id) ?? null,
      (costi ?? []).filter(c => c.profilo_fp_id === p.fp_id),
    ))
  }

  if (tipo === 'accessori') {
    let query = supabase.from('fp_accessori')
      .select('id, codice, descrizione, serie, prezzo, unita_vendita')
      .eq('organization_id', orgId).eq('presente', true).order('codice').limit(LIMITE_RISULTATI)
    if (q) query = query.or(filtro(['codice', 'descrizione', 'serie']))
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map(rigaAccessorio)
  }

  if (tipo === 'vetri') {
    let query = supabase.from('fp_vetri')
      .select('id, codice, descrizione, prezzo_mq, min_fatt, spessore')
      .eq('organization_id', orgId).eq('presente', true).order('codice').limit(LIMITE_RISULTATI)
    if (q) query = query.or(filtro(['codice', 'descrizione']))
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map(rigaVetro)
  }

  let query = supabase.from('fp_colori')
    .select('id, descrizione, costo_kg, per_profili, per_accessori, per_vetri')
    .eq('organization_id', orgId).eq('presente', true).order('descrizione').limit(LIMITE_RISULTATI)
  if (q) query = query.ilike('descrizione', `%${q}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rigaColore)
}
```

- [ ] **Step 2: Pagina `app/(dashboard)/catalogo-fp/page.tsx`**

```tsx
import { requireAccesso } from '@/lib/permessi'
import { getCatalogoFpStato, getSerieFp } from '@/actions/catalogo-fp'
import CatalogoFpClient from '@/components/catalogo-fp/CatalogoFpClient'

export const dynamic = 'force-dynamic'

export default async function CatalogoFpPage() {
  await requireAccesso('rilievo')
  const [stato, serie] = await Promise.all([getCatalogoFpStato(), getSerieFp()])
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <CatalogoFpClient statoIniziale={stato} serie={serie} />
    </div>
  )
}
```

- [ ] **Step 3: Componente `components/catalogo-fp/CatalogoFpClient.tsx`**

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cercaCatalogo, getCatalogoFpStato, richiediSincronizzazione } from '@/actions/catalogo-fp'
import { statoPonte } from '@/lib/fppro/ponte-regole'
import type { CatalogoFpStato, RigaCatalogo, SerieFp, TipoCatalogo } from '@/types/fppro'

const dataOra = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' })
const quando = (iso: string | null) => (iso ? dataOra.format(new Date(iso)) : 'mai')

const ETICHETTE_STATO = {
  collegato: { testo: 'Collegato', colore: 'bg-emerald-500' },
  non_raggiungibile: { testo: 'PC spento o non raggiungibile', colore: 'bg-amber-500' },
  mai_collegato: { testo: 'Ponte mai collegato', colore: 'bg-gray-400' },
} as const

const SCHEDE: { valore: TipoCatalogo; etichetta: string }[] = [
  { valore: 'profili', etichetta: 'Profili' },
  { valore: 'accessori', etichetta: 'Accessori' },
  { valore: 'vetri', etichetta: 'Vetri' },
  { valore: 'colori', etichetta: 'Finiture' },
]

interface Props {
  statoIniziale: CatalogoFpStato
  serie: SerieFp[]
}

export default function CatalogoFpClient({ statoIniziale, serie }: Props) {
  const router = useRouter()
  const [stato, setStato] = useState(statoIniziale)
  const [ora, setOra] = useState(() => new Date())
  const [inviando, startInvio] = useTransition()
  const [tipo, setTipo] = useState<TipoCatalogo>('profili')
  const [testo, setTesto] = useState('')
  const [righe, setRighe] = useState<RigaCatalogo[]>([])
  const [cercando, setCercando] = useState(false)

  const richiesta = stato.ultimaRichiesta
  const aperta = richiesta !== null && (richiesta.stato === 'in_attesa' || richiesta.stato === 'in_corso')
  const ponte = ETICHETTE_STATO[statoPonte(stato.ultimoSegnaleAt, ora)]

  // Aggiorna lo stato ogni 5 s mentre una richiesta e' aperta, ogni 30 s altrimenti.
  // L'effetto si ricrea quando `aperta` cambia, quindi qui `aperta` e' sempre
  // quello del giro corrente: niente effetti collaterali dentro setStato.
  useEffect(() => {
    const id = setInterval(async () => {
      const nuovo = await getCatalogoFpStato()
      setOra(new Date())
      setStato(nuovo)
      if (aperta && nuovo.ultimaRichiesta?.stato === 'completata') {
        toast.success('Catalogo sincronizzato con FP PRO')
        router.refresh()
      }
      if (aperta && nuovo.ultimaRichiesta?.stato === 'errore') {
        toast.error(nuovo.ultimaRichiesta.errore ?? 'Sincronizzazione non riuscita')
      }
    }, aperta ? 5000 : 30000)
    return () => clearInterval(id)
  }, [aperta, router])

  // Ricerca con attesa di 300 ms dopo l'ultima lettera.
  useEffect(() => {
    let annullata = false
    const id = setTimeout(async () => {
      setCercando(true)
      try {
        const risultato = await cercaCatalogo(tipo, testo)
        if (!annullata) setRighe(risultato)
      } catch (e) {
        if (!annullata) toast.error(e instanceof Error ? e.message : 'Ricerca non riuscita')
      } finally {
        if (!annullata) setCercando(false)
      }
    }, 300)
    return () => {
      annullata = true
      clearTimeout(id)
    }
  }, [tipo, testo, stato.ultimaSyncAt])

  const sincronizza = () =>
    startInvio(async () => {
      const r = await richiediSincronizzazione()
      if ('errore' in r) {
        toast.error(r.errore)
        return
      }
      setStato(s => ({ ...s, ultimaRichiesta: r.richiesta }))
      toast.info(statoPonte(stato.ultimoSegnaleAt, new Date()) === 'collegato'
        ? 'Sincronizzazione avviata'
        : 'Richiesta in coda: partira\' quando il PC di FP PRO sara\' acceso')
    })

  const c = stato.conteggi

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Catalogo FP PRO</h1>
        <p className="text-sm text-muted-foreground">
          Copia di serie, profili, accessori, vetri e finiture dell&apos;archivio EDILSIDER di FP PRO.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className={`inline-block size-2.5 rounded-full ${ponte.colore}`} />
            Ponte sul PC: {ponte.testo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-muted-foreground">
            <span>Ultima sincronizzazione: <strong className="text-foreground">{quando(stato.ultimaSyncAt)}</strong></span>
            <span>Ultimo segnale: {quando(stato.ultimoSegnaleAt)}</span>
          </div>
          {richiesta && aperta && (
            <p className="text-sm">
              {richiesta.stato === 'in_corso' ? 'Sincronizzazione in corso…' : 'Sincronizzazione in coda…'}
            </p>
          )}
          {richiesta?.stato === 'errore' && (
            <p className="text-sm text-destructive">Ultimo tentativo non riuscito: {richiesta.errore}</p>
          )}
          <Button onClick={sincronizza} disabled={inviando || aperta} size="sm">
            <RefreshCw className={`size-4 mr-2 ${aperta ? 'animate-spin' : ''}`} />
            {aperta ? 'Sincronizzazione in corso' : 'Sincronizza'}
          </Button>
          <p className="text-xs text-muted-foreground">
            {c.fp_serie} serie · {c.fp_profili} profili · {c.fp_accessori} accessori · {c.fp_vetri} vetri ·{' '}
            {c.fp_colori} finiture · {c.fp_kit} kit
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tipo} onValueChange={v => setTipo(v as TipoCatalogo)}>
          <TabsList>
            {SCHEDE.map(s => <TabsTrigger key={s.valore} value={s.valore}>{s.etichetta}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Input
          className="sm:max-w-xs"
          placeholder="Cerca codice o descrizione"
          value={testo}
          onChange={e => setTesto(e.target.value)}
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {tipo !== 'colori' && <TableHead>Codice</TableHead>}
              <TableHead>Descrizione</TableHead>
              {(tipo === 'profili' || tipo === 'accessori') && <TableHead>Serie</TableHead>}
              <TableHead>Dettagli</TableHead>
              <TableHead className="text-right">Prezzo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {righe.map(r => (
              <TableRow key={r.id}>
                {tipo !== 'colori' && <TableCell className="font-mono text-xs whitespace-nowrap">{r.codice}</TableCell>}
                <TableCell>{r.descrizione}</TableCell>
                {(tipo === 'profili' || tipo === 'accessori') && <TableCell className="whitespace-nowrap">{r.serie}</TableCell>}
                <TableCell className="text-muted-foreground whitespace-nowrap">{r.dettaglio}</TableCell>
                <TableCell className={`text-right whitespace-nowrap ${r.senzaPrezzo ? 'text-amber-600' : ''}`}>
                  {r.prezzo}
                </TableCell>
              </TableRow>
            ))}
            {righe.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {cercando ? 'Ricerca…' : 'Nessun risultato'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Al massimo 50 risultati: scrivi qualcosa per restringere la ricerca. Serie disponibili: {serie.map(s => s.nome).join(', ') || 'nessuna'}.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Voce nel menu**

In `components/layout/Sidebar.tsx` aggiungere `Library` all'import da `lucide-react` e, subito dopo la riga di "Rilievo Misure" (riga 52):

```tsx
  { href: '/catalogo-fp',         label: 'Catalogo FP PRO',     icon: Library,         modulo: 'rilievo' },
```

- [ ] **Step 5: Lint, tipi, test**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: lint senza problemi, nessun errore di tipi, tutti i test verdi.

Se il lint segnala `react-hooks/set-state-in-effect` sul `setCercando(true)` dentro il timeout: è dentro un callback asincrono, non nel corpo dell'effetto; se la regola lo segnala comunque, spostare `setCercando(true)` nell'`onChange` dell'input e nel cambio scheda (vedi memoria "nove setState dentro useEffect").

- [ ] **Step 6: Commit**

```bash
git add actions/catalogo-fp.ts "app/(dashboard)/catalogo-fp/page.tsx" components/catalogo-fp/CatalogoFpClient.tsx components/layout/Sidebar.tsx
git commit -m "feat(catalogo-fp): pagina Catalogo FP PRO con stato del ponte, Sincronizza e ricerca"
```

---

### Task 7: Verifica completa, rilascio, documentazione

**Files:**
- Modify: memoria `reference_fp_pro.md` + nuovo `project_catalogo_fp.md` + `MEMORY.md`; `PRD.md` in memoria (sezione progetto FP PRO, fase 1 fatta).

- [ ] **Step 1: Build di produzione**

Run: `npm run build`
Expected: build riuscita, la rotta `/catalogo-fp` compare nell'elenco.

- [ ] **Step 2: Prova del pulsante (doppio clic) e della coda**

Con il ponte installato e acceso, simulare due clic da SQL (`execute_sql`):

```sql
insert into fp_ponte_richieste (organization_id, tipo) values ('00000000-0000-0000-0000-000000000001', 'sincronizza');
insert into fp_ponte_richieste (organization_id, tipo) values ('00000000-0000-0000-0000-000000000001', 'sincronizza');
```
Expected: il secondo `insert` fallisce con `duplicate key value violates unique constraint "uq_fp_ponte_richieste_aperta"`; entro ~1 minuto la prima passa a `in_corso` e poi `completata`.

- [ ] **Step 3: Prova dell'interruzione**

Inserire una richiesta come sopra; quando è `in_corso`, fermare node (comando del Task 5 Step 4). Dopo il riavvio automatico:
Expected: la richiesta è `errore` con "Interrotta: il ponte si e' riavviato a meta' lavoro. Riprova." e nessuna richiesta resta `in_corso`.

- [ ] **Step 4: Merge e pubblicazione**

```bash
git checkout master
git merge --no-ff feat/catalogo-fp -m "merge: catalogo FP PRO e ponte sul PC (fase 1)"
git push origin master
git branch -d feat/catalogo-fp docs/progetto-fppro
git push origin --delete feat/catalogo-fp docs/progetto-fppro 2>/dev/null || true
```

- [ ] **Step 5: Controllo in produzione**

Dopo il deploy Vercel, chiedere all'utente di aprire `https://gestionale-infissi.vercel.app/catalogo-fp` e verificare: pallino verde "Collegato", conteggi corretti, ricerca "TT8002" nei profili con prezzo €/kg per colore, ricerca "33.1" nei vetri con "manca" in arancione dove non c'è prezzo, pulsante Sincronizza che gira e poi mostra la nuova data.

- [ ] **Step 6: Memoria e PRD**

Creare `project_catalogo_fp.md` in memoria con: dove sta il ponte (`C:\WinStudioPonte`, avvio da cartella Esecuzione automatica, `avvia.vbs` che lo riavvia), come aggiornarlo (`powershell -File ponte/installa.ps1` dopo ogni modifica a `ponte/` o a `lib/fppro/sync-tabelle.ts`/`ponte-regole.ts`), le 3 invarianti (una sola richiesta aperta per indice univoco; la sync controlla tutto prima di scrivere; `presente=false` invece di cancellare), e il fatto che il prezzo accessorio vale per `unita_vendita` pezzi. Aggiungere la riga in `MEMORY.md` e segnare la fase 1 fatta nel PRD.
