# Fase 4a — Calcolo come FP PRO e trasferimento in Preventivi: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un rilievo con strutture FP PRO si calcola in ufficio con la formula e l'ottimizzazione delle barre di FP PRO (profilo di calcolo scelto, correzioni per riga) e si trasferisce in Preventivi con righe uguali a quelle di "Importa PDF costi FP-PRO".

**Architecture:** motore puro in `lib/fppro/calcolo/` (geometria dei pezzi, profili composti, ottimizzazione dei tagli, accessori, vetri/pannelli, formula di prezzo), verificato con test sulle commesse vere 170-26G e 172-26G (file commessa + risultati di FP PRO estratti dal MySQL come fixture). Il server carica il listino dalle tabelle `fp_*`, calcola e salva il calcolo nel rilievo; la pagina `/rilievo/calcolo/[id]` mostra e corregge; il trasferimento crea un preventivo con righe `libera` + `config_fppro`.

**Tech Stack:** come fasi 1-3; nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-11-fase4-preventivo-fp-design.md` (questa è la Fase 4a, §7).

## Global Constraints

- Formula di prezzo **esatta** (spec §3); test al centesimo su 170-26G (2.034,97 €) e 172-26G (2.384,48 €).
- Profili pagati **a barre intere ottimizzate** come FP PRO: barra da `barlen` (default 6.500), scarto testa/coda per codice da `serie_profili_scarti` (default 30 + 30), lama 5 mm per taglio, "più lungo per primo" (first-fit decreasing). Un profilo usato anche per pochi cm costa almeno una barra.
- Profili composti (`profilicomponenti`): un pezzo di un profilo composto si scompone nei suoi componenti, ciascuno ottimizzato sulle sue barre.
- Codice profilo = nome del DXF senza estensione; se non esiste in `fp_profili`, si prova togliendo le lettere finali (TT8002B → TT8002) solo per i non composti.
- Criterio di riuscita della stima: **costo materiali entro il 5%** di FP PRO su entrambe le commesse di prova (con i prezzi di FP PRO di quella commessa).
- Il motore è puro: nessun accesso al database, riceve un `ListinoCalcolo`.
- Server action che non lanciano verso il client; letture complete a pagine; RLS per organizzazione; lint a zero; testi in italiano.
- Le righe trasferite sono `tipo: 'libera'` con gli stessi campi di `ImportaPdfCosti.tsx` + `config_fppro`; nel bulk insert dei preventivi tutte le righe devono avere le stesse chiavi (gotcha `omaggio`: aggiungere `config_fppro: a.config_fppro ?? null`).

## Review Focus

1. **Prezzi mancanti** (profilo senza costo per quel colore, vetro senza prezzo, accessorio non trovato): la voce si calcola lo stesso, l'importo mancante vale 0 ed è elencato in `avvisi` → test in Task 6.
2. **Struttura con nodi sconosciuti o senza poligoni**: il calcolo non deve fallire; pezzi dei nodi sconosciuti lunghi quanto la loro zona → test in Task 4.
3. **Pezzo più lungo della barra** (es. telaio 7 m su barra 6,5): una barra "su misura" lunga quanto il pezzo, non un ciclo infinito → test in Task 3.
4. **Correzioni per riga** (ore, percentuali, extra fissi) che devono sovrascrivere il profilo solo per quella voce → test in Task 6.
5. **Trasferimento ripetuto** dello stesso rilievo: crea un preventivo nuovo ogni volta, avvisando se ne esiste già uno da quel rilievo → verificato a mano nel Task 9.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261011160000_calcolo_fp.sql` | `fp_config_prev`, `fp_barre`, `fp_pannelli`, `fp_profili_componenti`, `fp_scarti`, `fp_strutture.tempi`/`versione_lettura`, `rilievi_veloci.config_prev_fp_id`/`calcolo`, `articoli_preventivo.config_fppro` |
| `lib/fppro/sync-tabelle.ts` (+test) | 5 tabelle nuove da copiare |
| `lib/fppro/strutture-xml.ts` (+test) | ore della struttura (`tempi`) |
| `ponte/src/sincronizza-strutture.ts` | rilettura delle strutture con `versione_lettura` vecchia |
| `ponte/strumenti/estrai-commessa.ts` | crea le fixture delle commesse di prova dal MySQL |
| `lib/fppro/calcolo/tipi.ts` | tipi del motore |
| `lib/fppro/calcolo/prezzo.ts` (+test) | formula di FP PRO |
| `lib/fppro/calcolo/barre.ts` (+test) | ottimizzazione dei tagli |
| `lib/fppro/calcolo/geometria.ts` (+test) | pezzi e campi dalla struttura alle misure |
| `lib/fppro/calcolo/accessori.ts` (+test) | quantità degli accessori |
| `lib/fppro/calcolo/voce.ts` (+test) | calcolo completo di una voce, verifica sulle commesse vere |
| `actions/calcolo-fp.ts` | listino dal DB, calcolo del rilievo, trasferimento in Preventivi |
| `app/(dashboard)/rilievo/calcolo/[id]/page.tsx`, `components/rilievo-fp/CalcoloRilievo.tsx` | pagina Calcolo |
| `components/rilievo-fp/SchedaRilievo.tsx` | pulsante "Calcolo e preventivo" (con rete) |
| `actions/preventivi.ts`, `types/preventivo.ts` | colonna `config_fppro` |

---

### Task 1: Dati nuovi dal ponte

**Files:**
- Create: `supabase/migrations/20261011160000_calcolo_fp.sql`
- Modify: `lib/fppro/sync-tabelle.ts` (+test), `lib/fppro/strutture-xml.ts` (+test), `ponte/src/sincronizza-strutture.ts`, `types/fppro.ts` (tipo `TempiStruttura` riesportato)

**Interfaces:**
- Produces: tabelle `fp_config_prev`, `fp_barre`, `fp_pannelli`, `fp_profili_componenti`, `fp_scarti` (stesse colonne comuni delle altre `fp_*`: `fp_id, presente, sincronizzato_at, dati, impronta`, + `segno_server` con trigger); `StrutturaLetta.tempi: TempiStruttura` con `interface TempiStruttura { taglio: number; lavorazione: number; montaggio: number; assemblaggio: number; posa: number }` (ore); colonne `fp_strutture.tempi jsonb`, `fp_strutture.versione_lettura int`; `rilievi_veloci.config_prev_fp_id int`, `rilievi_veloci.calcolo jsonb`; `articoli_preventivo.config_fppro jsonb`.

- [ ] **Step 1: Branch** — si lavora su `feat/preventivo-fp` (già creato con lo spec).

- [ ] **Step 2: Migration** — `supabase/migrations/20261011160000_calcolo_fp.sql`:

```sql
-- ============================================================
-- 20261011160000_calcolo_fp.sql
-- Fase 4a: dati per calcolare come FP PRO (profili di calcolo, barre, scarti,
-- profili composti, pannelli, ore delle strutture) e collegamento al preventivo.
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fp_config_prev', 'fp_barre', 'fp_pannelli', 'fp_profili_componenti', 'fp_scarti']
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        fp_id            integer NOT NULL,
        presente         boolean NOT NULL DEFAULT true,
        sincronizzato_at timestamptz NOT NULL DEFAULT now(),
        dati             jsonb NOT NULL DEFAULT '{}',
        impronta         text,
        segno_server     timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (organization_id, fp_id)
      )$f$, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (organization_id = get_user_organization_id())', t || '_select', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_segno_server', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION imposta_segno_server()', t || '_segno_server', t);
  END LOOP;
END $$;

-- Colonne specifiche (le stesse che scrive lib/fppro/sync-tabelle.ts).
ALTER TABLE fp_config_prev
  ADD COLUMN IF NOT EXISTS nome text, ADD COLUMN IF NOT EXISTS spese_generali numeric, ADD COLUMN IF NOT EXISTS utile numeric,
  ADD COLUMN IF NOT EXISTS provvigione numeric, ADD COLUMN IF NOT EXISTS costo_taglio numeric, ADD COLUMN IF NOT EXISTS costo_lavorazione numeric,
  ADD COLUMN IF NOT EXISTS costo_montaggio numeric, ADD COLUMN IF NOT EXISTS costo_assemblaggio numeric, ADD COLUMN IF NOT EXISTS costo_posa numeric,
  ADD COLUMN IF NOT EXISTS imballo numeric, ADD COLUMN IF NOT EXISTS viaggio numeric, ADD COLUMN IF NOT EXISTS materiali_vari numeric,
  ADD COLUMN IF NOT EXISTS altro numeric;
ALTER TABLE fp_barre ADD COLUMN IF NOT EXISTS profilo_fp_id integer, ADD COLUMN IF NOT EXISTS lunghezza numeric;
ALTER TABLE fp_pannelli
  ADD COLUMN IF NOT EXISTS codice text, ADD COLUMN IF NOT EXISTS descrizione text, ADD COLUMN IF NOT EXISTS prezzo_mq numeric,
  ADD COLUMN IF NOT EXISTS min_fatt numeric;
ALTER TABLE fp_profili_componenti
  ADD COLUMN IF NOT EXISTS composto_fp_id integer, ADD COLUMN IF NOT EXISTS componente_fp_id integer, ADD COLUMN IF NOT EXISTS principale boolean,
  ADD COLUMN IF NOT EXISTS tipo integer, ADD COLUMN IF NOT EXISTS offset_mm numeric;
ALTER TABLE fp_scarti ADD COLUMN IF NOT EXISTS codice text, ADD COLUMN IF NOT EXISTS testa numeric, ADD COLUMN IF NOT EXISTS coda numeric;
CREATE INDEX IF NOT EXISTS idx_fp_barre_profilo ON fp_barre(organization_id, profilo_fp_id);
CREATE INDEX IF NOT EXISTS idx_fp_componenti_composto ON fp_profili_componenti(organization_id, composto_fp_id);
CREATE INDEX IF NOT EXISTS idx_fp_scarti_codice ON fp_scarti(organization_id, codice);

-- Ore della struttura; versione_lettura: il ponte rilegge le strutture lette con una versione vecchia.
ALTER TABLE fp_strutture ADD COLUMN IF NOT EXISTS tempi jsonb;
ALTER TABLE fp_strutture ADD COLUMN IF NOT EXISTS versione_lettura integer NOT NULL DEFAULT 1;

-- Rilievo: profilo di calcolo scelto e ultimo calcolo (fotografia).
ALTER TABLE rilievi_veloci ADD COLUMN IF NOT EXISTS config_prev_fp_id integer;
ALTER TABLE rilievi_veloci ADD COLUMN IF NOT EXISTS calcolo jsonb;

-- Riga di preventivo nata da una struttura FP PRO (resta di tipo 'libera').
ALTER TABLE articoli_preventivo ADD COLUMN IF NOT EXISTS config_fppro jsonb;
```

`fp_scarti`: `fp_id` = progressivo stabile; la tabella MySQL `serie_profili_scarti` non ha chiave: si usa la riga con `idcommessalotto = 0`/minima per `(codice)` e `fp_id` = hash numerico del codice (vedi Step 3).

Applicare con `apply_migration` (nome `calcolo_fp`) **da sola** (non in parallelo ad altre chiamate: lo strumento perde la conferma). Verificare con `execute_sql` che esistano le 5 tabelle e le colonne nuove.

- [ ] **Step 3: Tabelle da copiare (test prima)** — in `lib/fppro/sync-tabelle.test.ts` aggiornare l'elenco atteso delle tabelle (9 + 5, in coda: `fp_config_prev`, `fp_barre`, `fp_pannelli`, `fp_profili_componenti`, `fp_scarti`) e aggiungere:

```ts
describe('tabelle della fase 4', () => {
  it('profilo di calcolo ALM2026', () => {
    expect(tabella('fp_config_prev').mappa({
      pkid: 2, nome: 'ALM2026', spesegen: '0.0500', utile: '0.4000', provvigione: '0.0300', costotaglio: '30.0000',
      costolav: '30.0000', costomont: '30.0000', costoassemblaggio: 30, costoposa: '50.0000', imballo: '0.0100',
      viaggio: '0.0100', matvari: '0.0100', altro: '0.0100',
    })).toMatchObject({ fp_id: 2, nome: 'ALM2026', spese_generali: 0.05, utile: 0.4, provvigione: 0.03, costo_posa: 50, altro: 0.01 })
  })
  it('scarto per codice con chiave numerica stabile', () => {
    const a = tabella('fp_scarti').mappa({ codice: 'TT8002', frontwaste: 30, endwaste: 30 })
    const b = tabella('fp_scarti').mappa({ codice: 'TT8002', frontwaste: 30, endwaste: 30 })
    expect(a.fp_id).toBe(b.fp_id)
    expect(a).toMatchObject({ codice: 'TT8002', testa: 30, coda: 30 })
  })
  it('componente di un profilo composto', () => {
    expect(tabella('fp_profili_componenti').mappa({ pkid: 7, profcompostoid: 1739, profcomponenteid: 1756, master: 0, type: 4, offset: 42 }))
      .toMatchObject({ fp_id: 7, composto_fp_id: 1739, componente_fp_id: 1756, principale: false, tipo: 4, offset_mm: 42 })
  })
})
```

Run → FAIL. Poi aggiungere a `TABELLE_SYNC` (in coda):

```ts
  {
    mysql: 'configprev',
    supabase: 'fp_config_prev',
    sql: 'select * from configprev order by pkid',
    colonne: ['pkid', 'nome', 'spesegen', 'utile', 'provvigione', 'costotaglio', 'costolav', 'costomont',
      'costoassemblaggio', 'costoposa', 'imballo', 'viaggio', 'matvari', 'altro'],
    mappa: r => ({
      fp_id: id(r.pkid), nome: testo(r.nome) ?? `#${String(r.pkid)}`,
      spese_generali: numero(r.spesegen), utile: numero(r.utile), provvigione: numero(r.provvigione),
      costo_taglio: numero(r.costotaglio), costo_lavorazione: numero(r.costolav), costo_montaggio: numero(r.costomont),
      costo_assemblaggio: numero(r.costoassemblaggio), costo_posa: numero(r.costoposa),
      imballo: numero(r.imballo), viaggio: numero(r.viaggio), materiali_vari: numero(r.matvari), altro: numero(r.altro),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'barlen',
    supabase: 'fp_barre',
    sql: 'select * from barlen order by pkid',
    colonne: ['pkid', 'profiloid', 'lung'],
    mappa: r => ({ fp_id: id(r.pkid), profilo_fp_id: numero(r.profiloid), lunghezza: numero(r.lung), dati: compatta(r) }),
  },
  {
    mysql: 'pannelli',
    supabase: 'fp_pannelli',
    sql: 'select * from pannelli order by pkid',
    colonne: ['pkid', 'codice', 'descr', 'costo_grezzo', 'min_fatt'],
    mappa: r => ({
      fp_id: id(r.pkid), codice: testo(r.codice) ?? `#${String(r.pkid)}`, descrizione: testo(r.descr),
      prezzo_mq: numero(r.costo_grezzo), min_fatt: numero(r.min_fatt), dati: compatta(r),
    }),
  },
  {
    mysql: 'profilicomponenti',
    supabase: 'fp_profili_componenti',
    sql: 'select * from profilicomponenti order by pkid',
    colonne: ['pkid', 'profcompostoid', 'profcomponenteid', 'master', 'type', 'offset'],
    mappa: r => ({
      fp_id: id(r.pkid), composto_fp_id: numero(r.profcompostoid), componente_fp_id: numero(r.profcomponenteid),
      principale: flag(r.master), tipo: numero(r.type), offset_mm: numero(r.offset), dati: compatta(r),
    }),
  },
  {
    // Nessuna chiave in MySQL: una riga per codice (lo scarto piu' frequente), fp_id = hash del codice.
    mysql: 'serie_profili_scarti',
    supabase: 'fp_scarti',
    sql: 'select codice, frontwaste, endwaste from serie_profili_scarti group by codice, frontwaste, endwaste ' +
      'order by codice, count(*) desc',
    colonne: ['codice', 'frontwaste', 'endwaste'],
    mappa: r => ({
      fp_id: hashCodice(testo(r.codice) ?? ''), codice: testo(r.codice) ?? '', testa: numero(r.frontwaste), coda: numero(r.endwaste),
      dati: compatta(r),
    }),
  },
```

con, sopra `TABELLE_SYNC`:

```ts
/** Intero positivo stabile da un codice (per tabelle MySQL senza chiave). */
function hashCodice(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}
```

Le righe duplicate per lo stesso codice (stesso `fp_id`) vanno tolte prima dell'upsert: in `ponte/src/sincronizza.ts`, dopo `.map(t.mappa)`, tenere la prima riga per `fp_id` (`new Map(righe.map(r => [r.fp_id, r]))` invertito in modo da tenere la prima). Run → PASS.

- [ ] **Step 4: Ore della struttura (test prima)** — in `lib/fppro/strutture-xml.test.ts`:

```ts
describe('tempi della struttura', () => {
  it('le ore di FP_TIMES', () => {
    const s = strutturaDaXml(leggi('al50plus-monoblocco.str.xml'))
    expect(s.tempi).toEqual({ taglio: 0, lavorazione: 9, montaggio: 0, assemblaggio: 0, posa: 2 })
  })
  it('senza FP_TIMES: tutto zero', () => {
    const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse('<FP_TREE />'))
    expect(s.tempi).toEqual({ taglio: 0, lavorazione: 0, montaggio: 0, assemblaggio: 0, posa: 0 })
  })
})
```

Run → FAIL. In `strutture-xml.ts`: aggiungere `export interface TempiStruttura { taglio: number; lavorazione: number; montaggio: number; assemblaggio: number; posa: number }`, il campo `tempi: TempiStruttura` in `StrutturaLetta`, e in `strutturaDaXml`:

```ts
  const t0 = ogg(anteprima.FP_TIMES)
  const tempi = {
    taglio: num(t0.CuttingTime) ?? 0,
    lavorazione: num(t0.MachiningTime) ?? 0,
    montaggio: num(t0.MountingTime) ?? 0,
    assemblaggio: num(t0.CompositionTime) ?? 0,
    posa: num(t0.PlacingTime) ?? 0,
  }
```

(attenzione: `FP_TIMES` sta dentro `FP_PREVIEW`; se `FP_PREVIEW` manca `ogg(undefined)` dà `{}`). Run → PASS. Aggiungere `'FP_TIMES'` NON a `RIPETUTI` (è unico).

- [ ] **Step 5: Il ponte rilegge le strutture** — in `ponte/src/sincronizza-strutture.ts`: `const VERSIONE_LETTURA = 2`; leggere anche `versione_lettura` in `leggiEsistenti`; la condizione per saltare un file diventa "presente, senza errore, stessa data e dimensione **e** `versione_lettura >= VERSIONE_LETTURA`"; scrivere `tempi: s.tempi, versione_lettura: VERSIONE_LETTURA` nelle righe (e `tempi: null, versione_lettura: VERSIONE_LETTURA` nelle righe con errore). Portare `VERSIONE` del ponte a `'1.3.0'`.

- [ ] **Step 6: Prova vera** — fermare il ponte installato, `crea-env`, `node --env-file=ponte/.env ponte/src/ponte.ts --una-volta`. Expected: le 5 tabelle nuove riempite (`fp_config_prev` 4 righe, `fp_barre` ~2.560, `fp_pannelli` 88, `fp_profili_componenti` ~2.143, `fp_scarti` ~245), strutture rilette (4.661, alcuni minuti). Verificare con `execute_sql`:

```sql
select (select count(*) from fp_config_prev) profili_calcolo, (select count(*) from fp_barre) barre,
       (select count(*) from fp_profili_componenti) componenti, (select count(*) from fp_scarti) scarti,
       (select count(*) from fp_strutture where tempi is not null) con_tempi;
select tempi from fp_strutture where percorso = 'ALM/AL50PLUS/01-SLIDE65-F2A+AL50PLUS.STR';
```
Expected: tempi `{"posa": 2, "lavorazione": 9, ...}`. Reinstallare il ponte (`ponte/installa.ps1`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261011160000_calcolo_fp.sql lib/fppro ponte types/fppro.ts
git commit -m "feat(calcolo-fp): profili di calcolo, barre, scarti, composti, pannelli e ore dalle strutture"
```

---

### Task 2: Commesse di prova (fixture)

**Files:**
- Create: `ponte/strumenti/estrai-commessa.ts`, `lib/fppro/__fixtures__/commessa-170-26G.json`, `lib/fppro/__fixtures__/commessa-170-26G.xml`, `lib/fppro/__fixtures__/commessa-172-26G.json`, `lib/fppro/__fixtures__/commessa-172-26G.xml`

**Interfaces:**
- Produces: fixture JSON `{ nome, voce, l, h, config: {spese_generali, utile, provvigione, …}, lavoro: [{ descrizione, ore, euroOra }], speseVarie: [{ descrizione, perc, fisso }], profili: [{ codice, lunghezza, quantita, kgMl, costo }], accessori: [{ codice, quantita, prezzo, unitaVendita, costo }], vetri: [{ codice, quantita, l, h, prezzoMq, costo }], pannelli: [...], totali: { costoProfili, costoAccessori, costoGuarnizioni, costoVetri, costoPannelli, costoPuro, costoIndustriale, imponibile } }` e XML del jobrecord senza immagini.

- [ ] **Step 1: Script** — `ponte/strumenti/estrai-commessa.ts` (Node, usa `ponte/.env` per il MySQL, sola lettura):

```ts
// Estrae una commessa calcolata da FP PRO in fixture per i test del motore di calcolo.
// Uso: node --env-file=ponte/.env ponte/strumenti/estrai-commessa.ts 170-26G
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import mysql from 'mysql2/promise'

const nome = process.argv[2]
if (!nome) throw new Error('Manca il nome della commessa')
const db = await mysql.createConnection({
  host: process.env.FP_MYSQL_HOST, port: Number(process.env.FP_MYSQL_PORT), user: process.env.FP_MYSQL_USER,
  password: process.env.FP_MYSQL_PASSWORD, database: process.env.FP_MYSQL_DATABASE,
})
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p))[0] as Record<string, unknown>[]
const n = (v: unknown) => Number(v ?? 0)

const [c] = await q('select * from commesse where nome = ? and voce = 1 order by idversionecommessa desc limit 1', [nome])
const ver = n(c.idversionecommessa)
const [cfg] = await q('select * from fp_configprev where nomecommessa = ? and versionecommessa = ? limit 1', [nome, ver])
const prof = await q('select * from preventivoprezziprofili where nomecommessa = ? and idversionecommessa = ? and voce = 1', [nome, ver])
const acc = await q('select * from preventivoprezziaccessori where nomecommessa = ? and idversionecommessa = ? and voce = 1', [nome, ver])
const vet = await q('select * from preventivoprezzivetri where nomecommessa = ? and idversionecommessa = ? and voce = 1', [nome, ver])
const pan = await q('select * from preventivoprezzipannelli where nomecommessa = ? and idversionecommessa = ? and voce = 1', [nome, ver])
const lav = await q('select * from speselav where nomecommessa = ? and idversionecommessa = ? and voce = 1', [nome, ver])
const spe = await q('select * from spesevarie where nomecommessa = ? and idversionecommessa = ? and voce = 1', [nome, ver])

const fixture = {
  nome, voce: 1, l: n(c.l), h: n(c.h),
  config: {
    spese_generali: n(c.spesegenerali), utile: n(c.utile), provvigione: n(c.provvigioni),
    nome: cfg?.nome ?? null,
  },
  lavoro: lav.map(r => ({ descrizione: String(r.descrspesa), ore: n(r.tempo), euroOra: n(r.prezzoh) })),
  speseVarie: spe.map(r => ({ descrizione: String(r.descrspesa), perc: n(r.percvoce), fisso: n(r.prezzofisso) })),
  profili: prof.map(r => ({ codice: String(r.codice), lunghezza: n(r.lung), quantita: n(r.qta), kgMl: n(r.kg_ml), peso: n(r.peso), costo: n(r.costonetto) })),
  accessori: acc.map(r => ({ codice: String(r.codice), quantita: n(r.qta), prezzo: n(r.prezzo), unitaVendita: n(r.un_vend), costo: n(r.costonetto) })),
  vetri: vet.map(r => ({ codice: String(r.codice), quantita: n(r.qta), l: n(r.l), h: n(r.h), prezzoMq: n(r.prezzo), costo: n(r.costonetto) })),
  pannelli: pan.map(r => ({ codice: String(r.codice), quantita: n(r.qta), l: n(r.l), h: n(r.h), prezzoMq: n(r.prezzo), costo: n(r.costonetto) })),
  totali: {
    costoProfili: n(c.costoprofili), costoAccessori: n(c.costoaccessori), costoGuarnizioni: n(c.costoguarnizioni),
    costoVetri: n(c.costovetri), costoPannelli: n(c.costopannelli), costoPuro: n(c.costopuro),
    costoIndustriale: n(c.costoindustriale), imponibile: n(c.imponibile),
  },
}
writeFileSync(`lib/fppro/__fixtures__/commessa-${nome}.json`, JSON.stringify(fixture, null, 2) + '\n')

// File della commessa senza immagini.
const cartella = join(process.env.FP_STR_PATH!, '..', 'JOB', nome)
const file = readdirSync(cartella).find(f => /_jobrecord_01\.xml$/i.test(f))!
const xml = new TextDecoder('windows-1252').decode(readFileSync(join(cartella, file)))
  .replace(/<picture>[\s\S]*?<\/picture>/g, '').replace(/<picture_alt_sight>[\s\S]*?<\/picture_alt_sight>/g, '')
writeFileSync(`lib/fppro/__fixtures__/commessa-${nome}.xml`, xml)
console.log('fatto', nome, 'versione', ver)
await db.end()
```

(Il file XML va salvato in UTF-8: i test lo leggono come testo UTF-8.)

- [ ] **Step 2: Estrarre** — `cd ponte && node --env-file=.env strumenti/estrai-commessa.ts 170-26G && node --env-file=.env strumenti/estrai-commessa.ts 172-26G && cd ..` (dalla cartella `ponte`, così trova `mysql2`; i percorsi di scrittura vanno resi relativi alla radice: usare `../lib/fppro/__fixtures__/…` nello script se si esegue da `ponte`).
Expected: 4 file; `commessa-170-26G.json` con `totali.costoProfili` 707,33 e `imponibile` 2.034,97; `172-26G` con 938,62 e 2.384,48.

- [ ] **Step 3: Commit**

```bash
git add ponte/strumenti/estrai-commessa.ts lib/fppro/__fixtures__/commessa-*
git commit -m "test(calcolo-fp): commesse vere di FP PRO come fixture"
```

---

### Task 3: Formula di prezzo e ottimizzazione dei tagli

**Files:**
- Create: `lib/fppro/calcolo/tipi.ts`, `lib/fppro/calcolo/prezzo.ts`, `lib/fppro/calcolo/barre.ts`
- Test: `lib/fppro/calcolo/prezzo.test.ts`, `lib/fppro/calcolo/barre.test.ts`

**Interfaces:**
- Produces:
  - `tipi.ts`: `interface ProfiloCalcolo { spese_generali: number; utile: number; provvigione: number; costo_taglio: number; costo_lavorazione: number; costo_montaggio: number; costo_assemblaggio: number; costo_posa: number; imballo: number; viaggio: number; materiali_vari: number; altro: number }`, `interface OreVoce { taglio: number; lavorazione: number; montaggio: number; assemblaggio: number; posa: number }`, `interface CorrezioniVoce { ore?: Partial<OreVoce>; percentuali?: Partial<Pick<ProfiloCalcolo, 'spese_generali' | 'utile' | 'provvigione' | 'imballo' | 'viaggio' | 'materiali_vari' | 'altro'>>; extra?: { descrizione: string; importo: number }[] }`
  - `prezzo.ts`: `prezzoComeFp(materiali: number, ore: OreVoce, p: ProfiloCalcolo, extraFissi: number): { costoLavoro: number; costoPuro: number; costoIndustriale: number; utile: number; provvigione: number; speseVarie: number; imponibile: number }`, `applicaCorrezioni(p: ProfiloCalcolo, ore: OreVoce, c: CorrezioniVoce | undefined): { profilo: ProfiloCalcolo; ore: OreVoce; extraFissi: number }`
  - `barre.ts`: `LAMA_MM = 5`, `ottimizzaBarre(pezzi: number[], barra: number, testa: number, coda: number): { barre: number[]; lunghezzaTotale: number }` (ogni elemento di `barre` = lunghezza della barra usata)

- [ ] **Step 1: Test (falliscono)** — `lib/fppro/calcolo/prezzo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applicaCorrezioni, prezzoComeFp } from './prezzo'
import type { ProfiloCalcolo } from './tipi'

const alm2026: ProfiloCalcolo = {
  spese_generali: 0.02, utile: 0.3, provvigione: 0.05, costo_taglio: 30, costo_lavorazione: 30, costo_montaggio: 30,
  costo_assemblaggio: 30, costo_posa: 50, imballo: 0.01, viaggio: 0.01, materiali_vari: 0.01, altro: 0.01,
}
const ore = { taglio: 0, lavorazione: 4, montaggio: 0, assemblaggio: 0, posa: 1 }

describe('prezzoComeFp', () => {
  it('commessa 170-26G al centesimo', () => {
    const r = prezzoComeFp(1231.8604, ore, alm2026, 0)
    expect(r.costoPuro).toBeCloseTo(1401.86, 2)
    expect(r.costoIndustriale).toBeCloseTo(1429.90, 2)
    expect(r.imponibile).toBeCloseTo(2034.97, 2)
  })
  it('commessa 172-26G: niente provvigione, 1% altro, 230 € fissi', () => {
    const p: ProfiloCalcolo = { ...alm2026, spese_generali: 0.03, utile: 0.25, provvigione: 0, costo_lavorazione: 35, costo_posa: 0, imballo: 0, viaggio: 0, materiali_vari: 0, altro: 0.01 }
    const r = prezzoComeFp(1510.9819, { ...ore, lavorazione: 4.166667, posa: 0 }, p, 230)
    expect(r.costoPuro).toBeCloseTo(1656.82, 1)
    expect(r.imponibile).toBeCloseTo(2384.48, 1)
  })
})

describe('applicaCorrezioni', () => {
  it('la correzione vale solo per la voce e somma gli extra', () => {
    const r = applicaCorrezioni(alm2026, ore, { ore: { posa: 2 }, percentuali: { utile: 0.25 }, extra: [{ descrizione: 'Maniglione', importo: 80 }, { descrizione: 'Lamiera', importo: 150 }] })
    expect(r.ore.posa).toBe(2)
    expect(r.profilo.utile).toBe(0.25)
    expect(r.profilo.spese_generali).toBe(0.02)
    expect(r.extraFissi).toBe(230)
    expect(alm2026.utile).toBe(0.3)
  })
})
```

`lib/fppro/calcolo/barre.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ottimizzaBarre } from './barre'

describe('ottimizzaBarre', () => {
  it('telaio 1900 x 2350: due barre da 6500 (i due lati lunghi non stanno con un traverso)', () => {
    expect(ottimizzaBarre([2350, 2350, 1900, 1900], 6500, 30, 30).barre).toEqual([6500, 6500])
  })
  it('scarti di testa/coda e lama contano: 2300+2300+950+950 non sta in una barra', () => {
    expect(ottimizzaBarre([2300, 2300, 950, 950, 2300, 2300, 950, 950], 6500, 30, 30).barre).toHaveLength(3)
  })
  it('anche un pezzo corto costa una barra intera', () => {
    expect(ottimizzaBarre([895], 6500, 30, 30).barre).toEqual([6500])
  })
  it('pezzo piu\' lungo della barra: barra su misura, nessun ciclo infinito', () => {
    expect(ottimizzaBarre([7000], 6500, 30, 30).barre).toEqual([7060])
  })
  it('nessun pezzo: nessuna barra', () => {
    expect(ottimizzaBarre([], 6500, 30, 30)).toEqual({ barre: [], lunghezzaTotale: 0 })
  })
})
```

Run → FAIL (moduli mancanti).

- [ ] **Step 2: Implementazione**

`lib/fppro/calcolo/tipi.ts`:

```ts
// Tipi del motore di calcolo "come FP PRO" (fase 4a).

export interface ProfiloCalcolo {
  spese_generali: number
  utile: number
  provvigione: number
  costo_taglio: number
  costo_lavorazione: number
  costo_montaggio: number
  costo_assemblaggio: number
  costo_posa: number
  imballo: number
  viaggio: number
  materiali_vari: number
  altro: number
}

/** Ore per una struttura */
export interface OreVoce {
  taglio: number
  lavorazione: number
  montaggio: number
  assemblaggio: number
  posa: number
}

export interface CorrezioniVoce {
  ore?: Partial<OreVoce>
  percentuali?: Partial<Pick<ProfiloCalcolo, 'spese_generali' | 'utile' | 'provvigione' | 'imballo' | 'viaggio' | 'materiali_vari' | 'altro'>>
  extra?: { descrizione: string; importo: number }[]
}
```

`lib/fppro/calcolo/prezzo.ts`:

```ts
// Formula di prezzo di FP PRO (verificata al centesimo su 170-26G e 172-26G).
import type { CorrezioniVoce, OreVoce, ProfiloCalcolo } from './tipi'

export function prezzoComeFp(materiali: number, ore: OreVoce, p: ProfiloCalcolo, extraFissi: number) {
  const costoLavoro =
    ore.taglio * p.costo_taglio + ore.lavorazione * p.costo_lavorazione + ore.montaggio * p.costo_montaggio +
    ore.assemblaggio * p.costo_assemblaggio + ore.posa * p.costo_posa
  const costoPuro = materiali + costoLavoro
  const costoIndustriale = costoPuro * (1 + p.spese_generali)
  const utile = costoIndustriale * p.utile
  const a = costoIndustriale + utile
  // La provvigione e' una percentuale del prezzo di vendita, non del costo.
  const b = p.provvigione < 1 ? a / (1 - p.provvigione) : a
  const speseVarie = b * (p.imballo + p.viaggio + p.materiali_vari + p.altro)
  return {
    costoLavoro, costoPuro, costoIndustriale, utile, provvigione: b - a, speseVarie,
    imponibile: b + speseVarie + extraFissi,
  }
}

export function applicaCorrezioni(p: ProfiloCalcolo, ore: OreVoce, c: CorrezioniVoce | undefined) {
  return {
    profilo: { ...p, ...(c?.percentuali ?? {}) },
    ore: { ...ore, ...(c?.ore ?? {}) },
    extraFissi: (c?.extra ?? []).reduce((s, e) => s + (Number.isFinite(e.importo) ? e.importo : 0), 0),
  }
}
```

`lib/fppro/calcolo/barre.ts`:

```ts
// Ottimizzazione dei tagli come FP PRO: si pagano le barre intere usate.
// "Il piu' lungo per primo" (first-fit decreasing), scarto di testa e coda per barra,
// lama per taglio. L'ottimizzatore di FP PRO (OPTI32) e' chiuso: il metodo e' lo stesso,
// i risultati si verificano sulle commesse vere (lib/fppro/calcolo/voce.test.ts).

export const LAMA_MM = 5

export function ottimizzaBarre(
  pezzi: number[],
  barra: number,
  testa: number,
  coda: number,
): { barre: number[]; lunghezzaTotale: number } {
  const utile = barra - testa - coda
  const residui: number[] = []
  const barre: number[] = []
  for (const p of [...pezzi].filter(x => x > 0).sort((a, b) => b - a)) {
    const serve = p + LAMA_MM
    if (serve > utile) {
      // Pezzo piu' lungo della barra: barra su misura (lo segnala chi chiama).
      barre.push(p + testa + coda)
      continue
    }
    const i = residui.findIndex(r => r >= serve)
    if (i >= 0) residui[i] -= serve
    else {
      residui.push(utile - serve)
      barre.push(barra)
    }
  }
  return { barre, lunghezzaTotale: barre.reduce((s, b) => s + b, 0) }
}
```

Nota: nella prova 2 i pezzi 2300+2300+950+950 + 4 lame = 6520 > 6440 → 3 barre. Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/fppro/calcolo
git commit -m "feat(calcolo-fp): formula di prezzo di FP PRO e ottimizzazione dei tagli"
```

---

### Task 4: Pezzi e campi dalla struttura alle misure

**Files:**
- Create: `lib/fppro/calcolo/geometria.ts`
- Test: `lib/fppro/calcolo/geometria.test.ts`

**Interfaces:**
- Consumes: `NodoStruttura` (fase 2).
- Produces: `interface PezzoCalcolo { dxf: string; tipo: number; lunghezza: number }`, `interface CampoCalcolo { codiceNodo: string; tipo: 'vetro' | 'pannello'; dxf: string; l: number; h: number }`, `interface Larghezze { telaio: number; anta: number; divisione: number; fermavetro: number }`, `LARGHEZZE_PREDEFINITE`, `larghezzeDaPoligoni(poligoni: number[][]): Larghezze`, `pezziECampi(albero: NodoStruttura[], misure: { L: number; H: number; L0: number; H0: number; quote: Record<string, number> }, larghezze: Larghezze): { pezzi: PezzoCalcolo[]; campi: CampoCalcolo[] }`.

**Regole (tutte in mm, y dal basso):**
- `8600` telaio: i suoi pezzi `8050` nell'ordine sinistra, alto, destra, basso; sinistra/destra lunghe quanto l'altezza della zona, alto/basso quanto la larghezza. I figli lavorano nella zona ridotta di `larghezze.telaio` sui lati che hanno un pezzo.
- `8070` traverso all'asse `quote[codice] ?? y × H/H0` (da `zona.y0`): pezzo lungo la larghezza della zona; i figli vanno sopra o sotto secondo il loro `y` nominale rispetto all'asse nominale; ogni metà ridotta di `larghezze.divisione / 2` verso l'asse. `8060` montante uguale con x e altezza.
- `8610` battente / `8620` scorrevole con `elementi = n`: la zona si divide in `n` ante uguali; i pezzi `8090/8100` con `indice = i` appartengono all'anta i e prendono, nell'ordine, altezza, larghezza, altezza, larghezza dell'anta; `8150/8210/8240/8250` (riporti) lunghi quanto l'altezza. I figli (riempimenti) vanno uno per anta (il k-esimo figlio all'anta k), zona ridotta di `larghezze.anta` per lato.
- `8180` fermavetro / `8270` fermapannello con 4 pezzi: altezza, larghezza, altezza, larghezza della zona; figli nella stessa zona.
- `8110` fascia, `8120` zoccolo, `8130` soglia e ogni nodo di tipo diverso con pezzi: ogni pezzo lungo la larghezza della zona; figli nella stessa zona.
- `8650` riempimento (macro) e nodi senza pezzi: figli nella stessa zona.
- Pezzi `8510` vetro / `8500` pannello: un campo con le misure della zona (ridotta di `larghezze.fermavetro` per lato se il genitore e' un fermavetro/fermapannello).
- Misure di zona negative o nulle: il pezzo/campo si salta.

- [ ] **Step 1: Test (falliscono)** — `lib/fppro/calcolo/geometria.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from '../strutture-xml'
import { LARGHEZZE_PREDEFINITE, pezziECampi } from './geometria'

const commessa = (nome: string) => strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  readFileSync(join(__dirname, '..', '__fixtures__', `commessa-${nome}.xml`), 'utf8'),
))
const somma = (pezzi: { dxf: string; lunghezza: number }[], parte: string) =>
  pezzi.filter(p => p.dxf.includes(parte)).reduce((s, p) => s + p.lunghezza, 0)

describe('170-26G scorrevole 2 ante 1900 x 2350', () => {
  const s = commessa('170-26G')
  const { pezzi, campi } = pezziECampi(s.albero, { L: 1900, H: 2350, L0: 1900, H0: 2350, quote: {} }, { ...LARGHEZZE_PREDEFINITE, telaio: 46.7 })

  it('telaio: 2 lati da 2350 e 2 da 1900', () => {
    expect(pezzi.filter(p => p.tipo === 8050).map(p => p.lunghezza).sort((a, b) => a - b)).toEqual([1900, 1900, 2350, 2350])
  })
  it('ante: 8 pezzi, somma vicina a quella di FP PRO (12,88 m) entro il 5%', () => {
    expect(pezzi.filter(p => p.tipo === 8100)).toHaveLength(8)
    expect(Math.abs(somma(pezzi, 'TT8011') - 12880) / 12880).toBeLessThan(0.05)
  })
  it('2 vetri vicini a 814 x 2142 (entro 5 cm)', () => {
    expect(campi).toHaveLength(2)
    for (const c of campi) {
      expect(Math.abs(c.l - 814)).toBeLessThan(50)
      expect(Math.abs(c.h - 2142)).toBeLessThan(50)
    }
  })
})

describe('172-26G porta 2 ante 1200 x 2200 con zoccoli, fasce e pannelli', () => {
  const s = commessa('172-26G')
  const { pezzi, campi } = pezziECampi(s.albero, { L: 1200, H: 2200, L0: 1200, H0: 2200, quote: {} }, { ...LARGHEZZE_PREDEFINITE, telaio: 28, anta: 51.5 })

  it('telaio a 3 lati (sotto la soglia)', () => {
    expect(pezzi.filter(p => p.tipo === 8050)).toHaveLength(3)
  })
  it('2 vetri e 2 pannelli', () => {
    expect(campi.filter(c => c.tipo === 'vetro')).toHaveLength(2)
    expect(campi.filter(c => c.tipo === 'pannello')).toHaveLength(2)
  })
})

describe('casi limite', () => {
  it('nodo sconosciuto con un pezzo: lungo quanto la zona', () => {
    const albero = [{ tipo: 9999, codice: 1, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], accessori: [], kit: [], figli: [],
      pezzi: [{ tipo: 9999, dxf: 'X\\P1.DXF', serie: 'X', indice: 0 }] }]
    expect(pezziECampi(albero, { L: 1000, H: 800, L0: 1000, H0: 800, quote: {} }, LARGHEZZE_PREDEFINITE).pezzi)
      .toEqual([{ dxf: 'X\\P1.DXF', tipo: 9999, lunghezza: 1000 }])
  })
})
```

Run → FAIL.

- [ ] **Step 2: Implementazione** — `lib/fppro/calcolo/geometria.ts`:

```ts
// Pezzi (profili con lunghezza) e campi (vetri/pannelli) di una struttura alle misure
// del rilievo. Stima per il preventivo: le misure esatte di produzione sono di FP PRO.
import type { NodoStruttura } from '../strutture-xml'

export interface PezzoCalcolo { dxf: string; tipo: number; lunghezza: number }
export interface CampoCalcolo { codiceNodo: string; tipo: 'vetro' | 'pannello'; dxf: string; l: number; h: number }
export interface Larghezze { telaio: number; anta: number; divisione: number; fermavetro: number }

export const LARGHEZZE_PREDEFINITE: Larghezze = { telaio: 50, anta: 55, divisione: 50, fermavetro: 20 }

interface Zona { x0: number; y0: number; x1: number; y1: number }
const larg = (z: Zona) => z.x1 - z.x0
const alt = (z: Zona) => z.y1 - z.y0
const RIPORTI = new Set([8150, 8210, 8240, 8250])

/** Larghezza del telaio letta dai poligoni: spessore del pezzo verticale appoggiato al bordo sinistro. */
export function larghezzeDaPoligoni(poligoni: number[][]): Larghezze {
  let telaio = LARGHEZZE_PREDEFINITE.telaio
  for (const p of poligoni) {
    const xs = p.filter((_, i) => i % 2 === 0)
    const ys = p.filter((_, i) => i % 2 === 1)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    if (Math.min(...xs) === 0 && h > w * 5 && w > 10 && w < 200) { telaio = w; break }
  }
  return { ...LARGHEZZE_PREDEFINITE, telaio }
}

export function pezziECampi(
  albero: NodoStruttura[],
  misure: { L: number; H: number; L0: number; H0: number; quote: Record<string, number> },
  larghezze: Larghezze,
): { pezzi: PezzoCalcolo[]; campi: CampoCalcolo[] } {
  const pezzi: PezzoCalcolo[] = []
  const campi: CampoCalcolo[] = []
  const aggiungi = (dxf: string, tipo: number, lunghezza: number) => { if (lunghezza > 0) pezzi.push({ dxf, tipo, lunghezza: Math.round(lunghezza * 10) / 10 }) }

  const visita = (n: NodoStruttura, z: Zona, genitoreFermavetro: boolean) => {
    if (larg(z) <= 0 || alt(z) <= 0) return
    const riempimento = n.pezzi.find(p => p.tipo === 8510 || p.tipo === 8500)
    if (riempimento) {
      const r = genitoreFermavetro ? larghezze.fermavetro : 0
      campi.push({ codiceNodo: String(n.codice), tipo: riempimento.tipo === 8510 ? 'vetro' : 'pannello', dxf: riempimento.dxf, l: larg(z) - 2 * r, h: alt(z) - 2 * r })
    }
    const profili = n.pezzi.filter(p => p.tipo !== 8510 && p.tipo !== 8500)

    if (n.tipo === 8600) {
      const telai = profili.filter(p => p.tipo === 8050)
      const lati = ['sinistra', 'alto', 'destra', 'basso'] as const
      telai.slice(0, 4).forEach((p, i) => aggiungi(p.dxf, p.tipo, lati[i] === 'sinistra' || lati[i] === 'destra' ? alt(z) : larg(z)))
      const ha = (lato: (typeof lati)[number]) => telai.length > lati.indexOf(lato)
      const dentro: Zona = {
        x0: z.x0 + (ha('sinistra') ? larghezze.telaio : 0), x1: z.x1 - (ha('destra') ? larghezze.telaio : 0),
        y0: z.y0 + (ha('basso') ? larghezze.telaio : 0), y1: z.y1 - (ha('alto') ? larghezze.telaio : 0),
      }
      profili.filter(p => p.tipo !== 8050).forEach(p => aggiungi(p.dxf, p.tipo, larg(dentro)))
      n.figli.forEach(f => visita(f, dentro, false))
      return
    }

    if ((n.tipo === 8070 && n.y !== null) || (n.tipo === 8060 && n.x !== null)) {
      const traverso = n.tipo === 8070
      const nominale = traverso ? n.y! : n.x!
      const asse = misure.quote[String(n.codice)] ?? nominale * (traverso ? misure.H / misure.H0 : misure.L / misure.L0)
      profili.forEach(p => aggiungi(p.dxf, p.tipo, traverso ? larg(z) : alt(z)))
      const mezza = larghezze.divisione / 2
      for (const f of n.figli) {
        const pos = traverso ? f.y : f.x
        const primaParte = pos !== null && pos < nominale
        const sotto: Zona = traverso
          ? (primaParte ? { ...z, y1: Math.min(z.y1, asse - mezza) } : { ...z, y0: Math.max(z.y0, asse + mezza) })
          : (primaParte ? { ...z, x1: Math.min(z.x1, asse - mezza) } : { ...z, x0: Math.max(z.x0, asse + mezza) })
        visita(f, sotto, false)
      }
      return
    }

    if (n.tipo === 8610 || n.tipo === 8620) {
      const k = Math.max(1, n.elementi)
      const w = larg(z) / k
      const ante: Zona[] = Array.from({ length: k }, (_, i) => ({ ...z, x0: z.x0 + i * w, x1: z.x0 + (i + 1) * w }))
      for (let i = 0; i < k; i++) {
        profili.filter(p => !RIPORTI.has(p.tipo) && p.indice === i)
          .forEach((p, j) => aggiungi(p.dxf, p.tipo, j % 2 === 0 ? alt(ante[i]) : larg(ante[i])))
      }
      profili.filter(p => RIPORTI.has(p.tipo)).forEach(p => aggiungi(p.dxf, p.tipo, alt(z)))
      n.figli.forEach((f, i) => {
        const a = ante[Math.min(i, k - 1)]
        visita(f, { x0: a.x0 + larghezze.anta, x1: a.x1 - larghezze.anta, y0: a.y0 + larghezze.anta, y1: a.y1 - larghezze.anta }, false)
      })
      return
    }

    if (n.tipo === 8180 || n.tipo === 8270) {
      profili.forEach((p, j) => aggiungi(p.dxf, p.tipo, j % 2 === 0 ? alt(z) : larg(z)))
      n.figli.forEach(f => visita(f, z, true))
      return
    }

    profili.forEach(p => aggiungi(p.dxf, p.tipo, larg(z)))
    n.figli.forEach(f => visita(f, z, genitoreFermavetro))
  }

  albero.forEach(n => visita(n, { x0: 0, y0: 0, x1: misure.L, y1: misure.H }, false))
  return { pezzi, campi }
}
```

Run → PASS. Se un'attesa non torna, ricavare la regola dal file della commessa (pezzi con `RealL`/`RealH`) e registrare la scelta nel registro come `Ruling:`; l'obiettivo vero è il Task 6 (materiali entro il 5%).

- [ ] **Step 3: Commit**

```bash
git add lib/fppro/calcolo/geometria.ts lib/fppro/calcolo/geometria.test.ts
git commit -m "feat(calcolo-fp): pezzi e campi della struttura alle misure del rilievo"
```

---

### Task 5: Quantità degli accessori

**Files:**
- Create: `lib/fppro/calcolo/accessori.ts`
- Test: `lib/fppro/calcolo/accessori.test.ts`

**Interfaces:**
- Consumes: `AccessorioStruttura`, `NodoStruttura`.
- Produces: `MAGGIORAZIONE_METRO = 1.06`, `interface QuantitaAccessorio { codice: string; serie: string; descrizione: string; quantita: number; metri: boolean; regolaIgnota: boolean }`, `accessoriVoce(albero: NodoStruttura[], kitScelti: Record<string, boolean>, dim: { L: number; H: number; perimetro: number; perimetroAnta: number; perimetroVetri: number; w: number; h: number }): QuantitaAccessorio[]`.

**Regole (ricavate dai risultati di FP PRO su 170-26G):**
- Accessori sciolti di ogni nodo + accessori dei kit **scelti** (kit non opzionali sempre; opzionali secondo `kitScelti["nodo:indice"]`, altrimenti `confermato`).
- Condizione a fasce: se `min`/`max` presenti, valore di riferimento per `dimRif`: 1 = H, 2 = L, 5 = formula (`w`, `h`, `L`, `H` con `/`, `*`, `+`, `-`), altro = H; fuori fascia → 0.
- Tipo 1 (a pezzo): `quantita` = `quantita × 1`; con `passo` > 0: `round(riferimento / passo)` con riferimento = formula di distribuzione se c'è, altrimenti perimetro dell'anta.
- Tipo 2 o 4 (a metro): metri = `quantita ×` (dimCalcolo 1 = H, 2 = L, 3 = perimetro del campo vetro/zona) `/ 1000 × MAGGIORAZIONE_METRO`.
- Formula non interpretabile → `regolaIgnota: true`, quantità 1.

- [ ] **Step 1: Test (falliscono)** — `lib/fppro/calcolo/accessori.test.ts` con il file 170-26G: verificare `ACP 8012` = 4 (H 2350 nella fascia 1500-2500), `ACP 1608` assente (w/2 = 950 fuori da 90-200), `ACP 8003` = 1, `ACP 50552` = 2, `AGP 8005` ≈ 23 m (entro 5%), `ACP 8028` = 6 (L/2 = 950 ÷ 150).

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from '../strutture-xml'
import { accessoriVoce } from './accessori'

const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  readFileSync(join(__dirname, '..', '__fixtures__', 'commessa-170-26G.xml'), 'utf8'),
))
const acc = accessoriVoce(s.albero, {}, { L: 1900, H: 2350, perimetro: 8500, perimetroAnta: 6480, perimetroVetri: 11824, w: 1900, h: 2350 })
const q = (codice: string) => acc.filter(a => a.codice === codice).reduce((t, a) => t + a.quantita, 0)

describe('accessori di 170-26G come FP PRO', () => {
  it('a fasce su H', () => expect(q('ACP 8012')).toBe(4))
  it('fascia con formula fuori range: escluso', () => expect(q('ACP 1608')).toBe(0))
  it('a pezzo', () => {
    expect(q('ACP 8003')).toBe(1)
    expect(q('ACP 50552')).toBe(2)
  })
  it('a passo con formula di distribuzione', () => expect(q('ACP 8028')).toBe(6))
  it('a metro con maggiorazione (FP PRO: 23,03 m)', () => expect(Math.abs(q('AGP 8005') - 23.03) / 23.03).toBeLessThan(0.05))
})
```

Run → FAIL.

- [ ] **Step 2: Implementazione** — `lib/fppro/calcolo/accessori.ts`:

```ts
// Quantita' degli accessori di una voce secondo le regole dei kit di FP PRO.
import type { AccessorioStruttura, NodoStruttura } from '../strutture-xml'

export const MAGGIORAZIONE_METRO = 1.06

export interface QuantitaAccessorio {
  codice: string
  serie: string
  descrizione: string
  quantita: number
  metri: boolean
  regolaIgnota: boolean
}

type Dim = { L: number; H: number; perimetro: number; perimetroAnta: number; perimetroVetri: number; w: number; h: number }

/** Formula semplice di FP PRO (w/2, L-43, 4*H+4*L…); null se non interpretabile. */
export function valutaFormula(f: string, d: Dim): number | null {
  const testo = f.replace(/,/g, '.').replace(/\s+/g, '')
  if (!/^[0-9wWhHlL.+\-*/()]+$/.test(testo)) return null
  const sostituito = testo.replace(/[wW]/g, String(d.w)).replace(/[hH]/g, String(d.h)).replace(/[lL]/g, String(d.L))
  try {
    // Solo numeri e + - * / ( ): controllato dalla regex sopra.
    const v = Function(`"use strict"; return (${sostituito})`)() as unknown
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

function quantitaDi(a: AccessorioStruttura, d: Dim): { quantita: number; ignota: boolean } {
  if (a.min !== null && a.max !== null) {
    const rif = a.dimRif === 2 ? d.L : a.dimRif === 5 && a.formula ? valutaFormula(a.formula, d) : d.H
    if (rif === null) return { quantita: 1, ignota: true }
    if (rif < a.min || rif > a.max) return { quantita: 0, ignota: false }
  }
  if (a.tipo === 2 || a.tipo === 4) {
    const base = a.dimCalcolo === 1 ? d.H : a.dimCalcolo === 2 ? d.L : d.perimetroVetri
    return { quantita: (a.quantita * base) / 1000 * MAGGIORAZIONE_METRO, ignota: false }
  }
  if (a.passo !== null && a.passo > 0) {
    const rif = a.formula ? valutaFormula(a.formula, d) : d.perimetroAnta
    if (rif === null) return { quantita: 1, ignota: true }
    return { quantita: Math.round(rif / a.passo), ignota: false }
  }
  return { quantita: a.quantita, ignota: false }
}

export function accessoriVoce(albero: NodoStruttura[], kitScelti: Record<string, boolean>, d: Dim): QuantitaAccessorio[] {
  const out: QuantitaAccessorio[] = []
  const usa = (a: AccessorioStruttura) => {
    const { quantita, ignota } = quantitaDi(a, d)
    if (quantita > 0) out.push({ codice: a.codice, serie: a.serie, descrizione: a.descrizione, quantita, metri: a.tipo === 2 || a.tipo === 4, regolaIgnota: ignota })
  }
  const visita = (nodi: NodoStruttura[]) => {
    for (const n of nodi) {
      n.accessori.forEach(usa)
      n.kit.forEach((k, i) => {
        const scelto = !k.opzionale || (kitScelti[`${n.codice}:${i}`] ?? k.confermato)
        if (scelto) k.accessori.filter(a => !a.opzionale || a.confermato).forEach(usa)
      })
      visita(n.figli)
    }
  }
  visita(albero)
  return out
}
```

Nota: la formula di distribuzione di `ACP 8028` (`DistFormula`) oggi non è letta da `strutture-xml.ts` (legge solo `RFormula`). Se il test di `ACP 8028` fallisce, aggiungere a `AccessorioStruttura` il campo `formulaDistribuzione: string | null` (da `DistFormula`) in `strutture-xml.ts` (+ test di lettura) e usarlo al posto di `formula` per il passo; registrare `Ruling:`. Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/fppro/calcolo/accessori.ts lib/fppro/calcolo/accessori.test.ts lib/fppro/strutture-xml.ts lib/fppro/strutture-xml.test.ts
git commit -m "feat(calcolo-fp): quantita' degli accessori con le regole dei kit"
```

---

### Task 6: Calcolo di una voce e verifica sulle commesse vere

**Files:**
- Create: `lib/fppro/calcolo/voce.ts`
- Test: `lib/fppro/calcolo/voce.test.ts`

**Interfaces:**
- Consumes: Task 3-5.
- Produces:
  - `interface ListinoCalcolo { profilo(codice: string): { codice: string; fpId: number; kgMl: number; euroKg: number | null; euroMl: number | null; barra: number; testa: number; coda: number; componenti: { codice: string; principale: boolean; offset: number }[] } | null; accessorio(codice: string, serie: string): { prezzo: number; unitaVendita: number } | null; vetro(codice: string): { euroMq: number; minFatt: number } | null; pannello(codice: string): { euroMq: number; minFatt: number } | null }`
  - `interface RigaMateriale { gruppo: 'profili' | 'accessori' | 'vetri' | 'pannelli'; codice: string; descrizione: string; quantita: number; unita: string; costo: number }`
  - `interface CalcoloVoce { materiali: number; righe: RigaMateriale[]; ore: OreVoce; prezzo: ReturnType<typeof prezzoComeFp>; avvisi: string[] }`
  - `calcolaVoce(input: { albero: NodoStruttura[]; poligoni: number[][]; L: number; H: number; L0: number; H0: number; quote: Record<string, number>; kitScelti: Record<string, boolean>; tempi: OreVoce; profilo: ProfiloCalcolo; correzioni?: CorrezioniVoce; vetriScelti: Record<string, string>; larghezze?: Larghezze }, listino: ListinoCalcolo): CalcoloVoce`

**Regole:**
- Pezzi (Task 4) → per ogni pezzo: profilo del codice DXF (vedi Global Constraints per le lettere finali); se composto, un pezzo per ogni componente lungo `lunghezza − 2 × offset` (componente principale o con offset 0 = lunghezza intera); i pezzi si raggruppano per codice e si ottimizzano sulle barre di quel codice (Task 3). Costo = per ogni barra `barra/1000 × kgMl × 1,03 × euroKg`, oppure `barra/1000 × euroMl` se `kgMl` = 0 o `euroKg` assente.
- Accessori (Task 5): costo = `prezzo ÷ unitaVendita × quantità` (a metro: `quantita` in metri, `unitaVendita` in metri).
- Vetri/pannelli: `vetriScelti[codiceNodo]` sostituisce il codice del DXF; costo = `max(l × h / 1e6, minFatt) × euroMq` (minimo solo se `minFatt` > 0).
- Ore: `tempi` della struttura; poi `applicaCorrezioni` e `prezzoComeFp`.
- Tutto ciò che manca nel listino → costo 0 e una riga in `avvisi` ("Profilo XYZ senza prezzo", "Accessorio … non trovato", "Vetro … senza prezzo", "Regola dell'accessorio … non interpretata").

- [ ] **Step 1: Test (falliscono)** — `lib/fppro/calcolo/voce.test.ts`: un `ListinoCalcolo` costruito dalla fixture JSON (prezzi di FP PRO di quella commessa: `euroKg = costo / peso` per le righe a barre con peso > 0, `euroMl = costo / (lunghezza/1000 × quantita)` per quelle a peso 0; accessori con `prezzo`/`unitaVendita`; vetri e pannelli con `prezzoMq`; barra 6.500 o la lunghezza della riga "a barre" della fixture; componenti dei composti dal DB **copiati nella fixture** con lo script del Task 2 — aggiungere allo script l'estrazione di `profilicomponenti` per i codici presenti nel file della commessa). Attese:

```ts
it('170-26G: materiali entro il 5% di FP PRO (1.231,86 €)', () => {
  const r = calcolaVoce(input170, listino170)
  expect(Math.abs(r.materiali - 1231.86) / 1231.86).toBeLessThan(0.05)
})
it('170-26G: profili a barre entro il 5% (707,33 €)', () => {
  const profili = calcolaVoce(input170, listino170).righe.filter(x => x.gruppo === 'profili').reduce((s, x) => s + x.costo, 0)
  expect(Math.abs(profili - 707.33) / 707.33).toBeLessThan(0.05)
})
it('172-26G: materiali entro il 5% di FP PRO (1.510,98 €)', () => { /* come sopra */ })
it('prezzo mancante: voce calcolata, avviso presente', () => {
  const r = calcolaVoce(input170, { ...listino170, vetro: () => null })
  expect(r.avvisi.some(a => a.includes('Vetro'))).toBe(true)
  expect(r.prezzo.imponibile).toBeGreaterThan(0)
})
it('correzione di riga: utile 25% e 80 € di extra cambiano solo questa voce', () => { /* imponibile ricalcolato */ })
```

(Scrivere per intero `input170`/`listino170`/`input172` nel file di test leggendo le fixture; `tempi` dal `FP_TIMES` del file commessa; `profilo` dalla fixture `config` + `lavoro` + `speseVarie`.)

Run → FAIL.

- [ ] **Step 2: Implementazione** — `lib/fppro/calcolo/voce.ts` secondo le **Regole** sopra, usando `pezziECampi`, `larghezzeDaPoligoni` (se `larghezze` non passate), `ottimizzaBarre`, `accessoriVoce` (dimensioni: `perimetro = 2 × (L + H)`, `perimetroAnta` = perimetro della prima anta stimata, `perimetroVetri` = somma dei perimetri dei campi vetro, `w = L / numero ante`, `h = H`), `applicaCorrezioni`, `prezzoComeFp`.

Run: `npx vitest run lib/fppro/calcolo` → PASS. **Se una commessa sta oltre il 5%:** confrontare codice per codice le barre con la fixture (`profili` a barre) e gli accessori, correggere la regola responsabile nel modulo giusto (geometria, componenti, accessori) con un test che la fissi, e registrare ogni scelta come `Ruling:`. Non alzare la tolleranza.

- [ ] **Step 3: Commit**

```bash
git add lib/fppro/calcolo/voce.ts lib/fppro/calcolo/voce.test.ts ponte/strumenti/estrai-commessa.ts lib/fppro/__fixtures__
git commit -m "feat(calcolo-fp): calcolo completo di una voce, entro il 5% di FP PRO sulle commesse vere"
```

---

### Task 7: Calcolo del rilievo sul server

**Files:**
- Create: `actions/calcolo-fp.ts`
- Modify: `types/rilievo-fp.ts` (`VoceFpDati.correzioni?: CorrezioniVoce`)

**Interfaces:**
- Produces: `getProfiliCalcoloFp(): Promise<{ fpId: number; nome: string }[] | { errore: string }>`, `calcolaRilievoFp(rilievoId: string, configPrevFpId: number): Promise<{ calcolo: CalcoloRilievo } | { errore: string }>`, `salvaCorrezioniVoce(voceId: string, correzioni: CorrezioniVoce): Promise<{ ok: true } | { errore: string }>`, `interface CalcoloRilievo { configPrevFpId: number; nomeProfilo: string; voci: { voceId: string; posizione: string; quantita: number; descrizione: string; calcolo: CalcoloVoce }[]; totaleImponibile: number; calcolatoAt: string }`.

- [ ] **Step 1:** Implementare `actions/calcolo-fp.ts`:
  - `caricaListino(orgId, codiciProfili, codiciAccessori, codiciVetri, codiciPannelli, coloreFpId)` legge solo le righe che servono (`.in(...)` a blocchi di 100) da `fp_profili`, `fp_profili_costi` (colore della voce: `colore_fp_id` = `coloreEst` o `coloreInt`; `costo_kg`/`costo_ml`), `fp_barre`, `fp_scarti`, `fp_profili_componenti` (+ `fp_profili` dei componenti), `fp_accessori` (+ `fp_accessori_costi` per il colore se presente), `fp_vetri`, `fp_pannelli`, e restituisce un `ListinoCalcolo` sincrono costruito su `Map`.
  - `calcolaRilievoFp`: legge il rilievo e le sue voci (`fp` non nullo), le strutture complete (albero **completo**, poligoni, tempi) da `fp_strutture`, il profilo da `fp_config_prev`; per ogni voce chiama `calcolaVoce` con `correzioni = voce.fp.correzioni`; salva in `rilievi_veloci` `config_prev_fp_id` e `calcolo` (jsonb); restituisce il risultato. Errori → `{ errore }`.
  - `salvaCorrezioniVoce`: aggiorna `fp.correzioni` della voce (merge jsonb lato server: legge `fp`, sostituisce `correzioni`, scrive con `updated_at = now()`).
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint actions/calcolo-fp.ts` → pulito. Prova con `execute_sql` dopo aver creato dal telefono (o in sviluppo) un rilievo con una voce EKOS_66TH 1300 × 1500: chiamare la pagina del Task 8.
- [ ] **Step 3: Commit** — `git commit -m "feat(calcolo-fp): calcolo del rilievo sul server con il listino di FP PRO"`.

---

### Task 8: Pagina Calcolo e trasferimento in Preventivi

**Files:**
- Create: `app/(dashboard)/rilievo/calcolo/[id]/page.tsx`, `components/rilievo-fp/CalcoloRilievo.tsx`
- Modify: `actions/calcolo-fp.ts` (`trasferisciInPreventivi`), `components/rilievo-fp/SchedaRilievo.tsx`, `actions/preventivi.ts`, `types/preventivo.ts`

**Interfaces:**
- Produces: `trasferisciInPreventivi(rilievoId: string): Promise<{ preventivoId: string; giaTrasferito: boolean } | { errore: string }>`; rotta `/rilievo/calcolo/[id]`.

- [ ] **Step 1: Preventivi** — `types/preventivo.ts`: `config_fppro?: unknown | null` su `ArticoloPreventivoRow`/`ArticoloWizard` (stesso posto di `config_su_misura`); `actions/preventivi.ts`: nei due bulk insert aggiungere `config_fppro: a.config_fppro ?? null` (chiavi omogenee, gotcha `omaggio`).
- [ ] **Step 2: Trasferimento** — `trasferisciInPreventivi`:
  - usa l'ultimo `calcolo` del rilievo (se manca: `{ errore: 'Calcola prima il rilievo' }`);
  - cliente: `clienteSnapshot` dal rilievo (`ClienteSnapshotRilievo` → `ClienteSnapshot`), `clienteId: null`;
  - per ogni voce una riga **identica a `ImportaPdfCosti.tsx`** (stessi campi): `tipo: 'libera'`, `tipologia: "<nome struttura> <L>x<H>"`, `note` con righe `Profili: <serie>`, `Est.: <colore est>`, `Int.: <colore int>`, `Vetri: <codici>`, `immagine_url`: copia della PNG della struttura (`fp-strutture`) in `preventivi-allegati/<org>/fppro/<uuid>.png` (download + upload lato server) e `getPublicUrl`; `quantita`; `prezzo_unitario: calcolo.prezzo.imponibile`; `costo_acquisto_unitario: calcolo.materiali`; `costo_posa: calcolo.prezzo.costoLavoro`; `aliquota_iva` = default dei preventivi (leggerlo dove lo legge il wizard); `config_fppro: { rilievoId, voceId, voce: fp, calcolo }`;
  - crea il preventivo con `createPreventivo` e restituisce l'id; `giaTrasferito` = esiste già un articolo con `config_fppro->>rilievoId` uguale.
- [ ] **Step 3: Pagina** — `page.tsx` (server, `requireAccesso('rilievo')`) carica rilievo, voci, profili di calcolo e l'ultimo calcolo, e rende `CalcoloRilievo` (client) con:
  - scelta del profilo di calcolo (select) + pulsante "Calcola";
  - tabella voci: posizione, struttura e misure, q.tà, materiali, ore, prezzo unitario, totale, avvisi (in arancione), pulsante "Correggi" che apre un pannello con ore (5 campi), percentuali (spese generali, utile, provvigione, imballo, viaggio, materiali vari, altro) e extra fissi (descrizione + importo, aggiungibili), "Salva e ricalcola";
  - totale del rilievo;
  - "Trasferisci in Preventivi" (conferma se `giaTrasferito`), poi `router.push('/preventivi/<id>')`.
  Testi in italiano, tabella con `overflow-x-auto`, importi con `formatEuro`.
- [ ] **Step 4: Collegamento dal cantiere** — in `SchedaRilievo.tsx`, se `isOnline`, un pulsante "Calcolo e preventivo" con `<a href={`/rilievo/calcolo/${id}`}>` (navigazione piena; avviso "invia prima le modifiche" se il rilievo ha voci `daInviare`).
- [ ] **Step 5:** `npx tsc --noEmit && npm run lint && npm test && npm run build` → tutto verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(calcolo-fp): pagina Calcolo del rilievo e trasferimento in Preventivi"`.

---

### Task 9: Verifica, revisione, rilascio

- [ ] **Step 1:** prova con dati veri (sviluppo non possibile senza login: in produzione con l'utente): rilievo con la stessa struttura e misure della 170-26G (SOLUZIONE SERRAMENTO › ALSISTEM › SLIDE_80 › 01-SLIDE80-F2A, 1900 × 2350, colore 19 - RAL 9010C2 CLAS, vetro 33.1_10_33.1S), profilo ALM2026 → prezzo vicino a 2.034,97 € (stessa formula; materiali entro il 5%).
- [ ] **Step 2:** "Trasferisci in Preventivi" → preventivo con la riga uguale a quelle importate dal PDF di FP PRO; ritrasferire → avviso "già trasferito".
- [ ] **Step 3:** revisione finale indipendente, correzioni, merge, push, deploy; ponte reinstallato.
- [ ] **Step 4:** memoria (`project_catalogo_fp.md`: formula FP verificata, barre ottimizzate, composti, fixture delle commesse, invarianti del calcolo) e PRD (fase 4a fatta, 4b da fare).
