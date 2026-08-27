# Fidi bancari e anticipi fattura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare l'esposizione bancaria dentro i conti dell'azienda — fido di cassa sui conti correnti e anticipi fattura legati alle commesse — sommandola ai Debiti e alla posizione netta in `/commesse/statistiche`, e mostrandola nei Calcoli senza gonfiare la liquidità.

**Architecture:** Due tabelle nuove (`linee_credito`, `anticipi_fattura`) più una colonna su `conti_correnti`. Tutta la matematica sta in un file puro nuovo, `lib/banche.ts`, testato con Vitest e senza `new Date()`: `oggi` arriva sempre dal chiamante come stringa `YYYY-MM-DD`. `riepilogoCreditiDebiti` riceve il risultato già calcolato e lo somma ai debiti. L'interfaccia si divide: plafond e fidi in Impostazioni, anticipi e disponibilità nei Calcoli.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), TypeScript, Supabase (Postgres + RLS), shadcn/ui, Tailwind, Vitest.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-27-fidi-bancari-design.md` — leggerla prima di iniziare. Le scelte semantiche lì dentro non vanno reinterpretate.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20260827120000_fidi_bancari.sql` (nuovo) | colonna `fido_accordato`, tabelle `linee_credito` e `anticipi_fattura`, RLS |
| `types/commessa.ts` (modifica) | `ContoCorrente.fido_accordato`, `LineaCredito`, `AnticipoFattura`, etichette dei tipi |
| `lib/banche.ts` (nuovo) | **tutta** la matematica dell'esposizione bancaria, pura |
| `lib/banche.test.ts` (nuovo) | test della matematica |
| `lib/statistiche-commesse.ts` (modifica) | `riepilogoCreditiDebiti` somma i debiti bancari |
| `lib/statistiche-commesse.test.ts` (modifica) | fixture e test del nuovo addendo |
| `actions/conti.ts` (modifica) | `fido_accordato` in create/update |
| `actions/banche.ts` (nuovo) | CRUD linee e anticipi, elenco commesse per il collegamento |
| `components/impostazioni/FormConti.tsx` (modifica) | campo "Fido accordato" |
| `components/impostazioni/FormLineeCredito.tsx` (nuovo) | anagrafica delle linee (plafond) |
| `app/(dashboard)/impostazioni/page.tsx` (modifica) | carica e monta la sezione linee |
| `app/(dashboard)/commesse/statistiche/page.tsx` (modifica) | tre query in più + mappa commesse |
| `components/commesse/StatisticheCommesse.tsx` (modifica) | riga "Banche" con tendina |
| `app/(dashboard)/commesse/calcoli/page.tsx` (modifica) | carica linee, anticipi, opzioni commesse |
| `components/commesse/TabellaCalcoli.tsx` (modifica) | etichetta "Disponibilità" + scomposizione della liquidità |
| `components/commesse/BloccoFidi.tsx` (nuovo) | blocco "Fidi e anticipi" nei Calcoli |
| `components/commesse/DialogAnticipo.tsx` (nuovo) | inserimento/modifica di un anticipo |

Il blocco dei Calcoli sta in file propri e non dentro `TabellaCalcoli.tsx`, che è già a 490 righe e fa altro.

---

### Task 1: Migrazione e tipi

**Files:**
- Create: `supabase/migrations/20260827120000_fidi_bancari.sql`
- Modify: `types/commessa.ts` (in fondo al file)

- [ ] **Step 1: Scrivere la migrazione**

Crea `supabase/migrations/20260827120000_fidi_bancari.sql`:

```sql
-- Esposizione bancaria: fido di cassa sui conti + anticipi fattura per commessa.
-- Convenzioni d'inserimento opposte e volute (vedi spec 2026-08-27-fidi-bancari):
--  · conto corrente → si scrive il DISPONIBILE, l'utilizzato si ricava
--  · linea di credito → si scrivono i singoli ANTICIPI, utilizzato e disponibile si ricavano

-- Default 0: i conti esistenti restano senza fido, nessun numero si muove al deploy.
ALTER TABLE conti_correnti ADD COLUMN IF NOT EXISTS fido_accordato numeric NOT NULL DEFAULT 0;

-- Il plafond, e basta: nessuna colonna "disponibile", sarebbe un secondo modo di dire
-- la stessa cosa e prima o poi i due numeri litigherebbero.
CREATE TABLE linee_credito (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  tipo             text        NOT NULL DEFAULT 'anticipo_fatture',
  accordato        numeric     NOT NULL DEFAULT 0,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE linee_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON linee_credito
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX linee_credito_org_idx ON linee_credito (organization_id);

-- commessa_id facoltativo e ON DELETE SET NULL: non tutte le fatture nascono da una
-- commessa registrata, e cancellare una commessa non cancella il debito con la banca.
CREATE TABLE anticipi_fattura (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linea_id         uuid        NOT NULL REFERENCES linee_credito(id) ON DELETE CASCADE,
  commessa_id      uuid        REFERENCES commesse(id) ON DELETE SET NULL,
  descrizione      text        NOT NULL DEFAULT '',
  importo          numeric     NOT NULL DEFAULT 0,
  data_erogazione  date,
  data_scadenza    date,
  rimborsato       boolean     NOT NULL DEFAULT false,
  rimborsato_at    date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE anticipi_fattura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON anticipi_fattura
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX anticipi_fattura_org_idx ON anticipi_fattura (organization_id);
CREATE INDEX anticipi_fattura_linea_idx ON anticipi_fattura (linea_id);
```

- [ ] **Step 2: Applicare la migrazione al progetto Supabase**

Applicarla con lo strumento MCP Supabase `apply_migration` (nome `fidi_bancari`, contenuto identico al file), oppure incollando il file nell'SQL editor del progetto `xawyrtqclpeylxnhwhwo`.

Verifica, sempre via MCP `execute_sql`:

```sql
select column_name from information_schema.columns
where table_name = 'conti_correnti' and column_name = 'fido_accordato';
select tablename from pg_tables where tablename in ('linee_credito','anticipi_fattura');
```

Atteso: una riga `fido_accordato`, due righe con i nomi delle tabelle.

- [ ] **Step 3: Aggiungere i tipi**

In `types/commessa.ts`, aggiungere `fido_accordato` ai due tipi esistenti:

```ts
export type ContoCorrente = {
  id: string
  organization_id: string
  nome: string
  saldo_attuale: number // disponibilità, fido incluso: è il numero che l'utente legge in banca
  fido_accordato: number
  ordine: number
  created_at: string
  updated_at: string
}

export type ContoCorrenteInput = {
  nome: string
  saldo_attuale: number
  fido_accordato: number
}
```

e in fondo al file i tipi nuovi:

```ts
// ── Linee di credito e anticipi fattura ──────────────────────────────────────
// `tipo` è text senza vincolo DB, come CategoriaScadenza: le etichette stanno in un
// Record, così il compilatore segnala ogni punto da completare quando la lista cresce.
export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export const LABEL_TIPO_LINEA: Record<TipoLineaCredito, string> = {
  anticipo_fatture: 'Anticipo fatture',
  sbf: 'Salvo buon fine',
  castelletto: 'Castelletto',
  altro: 'Altro',
}

export type LineaCredito = {
  id: string
  organization_id: string
  nome: string
  tipo: TipoLineaCredito
  accordato: number
  ordine: number
  created_at: string
  updated_at: string
}

export type LineaCreditoInput = {
  nome: string
  tipo: TipoLineaCredito
  accordato: number
}

export type AnticipoFattura = {
  id: string
  organization_id: string
  linea_id: string
  commessa_id: string | null
  descrizione: string
  importo: number
  data_erogazione: string | null
  data_scadenza: string | null
  rimborsato: boolean
  rimborsato_at: string | null
  created_at: string
  updated_at: string
}

export type AnticipoFatturaInput = {
  linea_id: string
  commessa_id: string | null
  descrizione: string
  importo: number
  data_erogazione: string | null
  data_scadenza: string | null
}

// Commessa collegabile a un anticipo: etichetta pronta e residuo da incassare.
export type OpzioneCommessa = {
  id: string
  etichetta: string // "C-2026-014 — Rossi Mario"
  residuo: number
}
```

- [ ] **Step 4: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: errori **solo** in `actions/conti.ts`, `components/impostazioni/FormConti.tsx` e ovunque si costruisca un `ContoCorrente` senza `fido_accordato`. Sono attesi: li chiudono i Task 4 e 5.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260827120000_fidi_bancari.sql types/commessa.ts
git commit -m "feat(banche): tabelle linee di credito e anticipi fattura, fido sui conti"
```

---

### Task 2: `lib/banche.ts` — fido di cassa sui conti

**Files:**
- Create: `lib/banche.ts`
- Test: `lib/banche.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `lib/banche.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  utilizzoConto,
  riepilogoBanche,
  type ContoBancaRow,
} from '@/lib/banche'

const conto = (over: Partial<ContoBancaRow> = {}): ContoBancaRow => ({
  id: 'cc1',
  nome: 'Intesa c/c',
  disponibile: 0,
  accordato: 0,
  ...over,
})

describe('utilizzoConto', () => {
  it('ricava utilizzato e residuo dal disponibile', () => {
    const r = utilizzoConto(conto({ accordato: 40000, disponibile: 10000 }))
    expect(r.utilizzato).toBe(30000)
    expect(r.propria).toBe(0)
    expect(r.residuo).toBe(10000)
  })

  it('conto in attivo oltre il fido: niente utilizzato, il resto sono soldi propri', () => {
    const r = utilizzoConto(conto({ accordato: 40000, disponibile: 45000 }))
    expect(r.utilizzato).toBe(0)
    expect(r.propria).toBe(5000)
    expect(r.residuo).toBe(40000)
  })

  it('conto senza fido: tutto liquidità propria', () => {
    const r = utilizzoConto(conto({ accordato: 0, disponibile: 5000 }))
    expect(r.utilizzato).toBe(0)
    expect(r.propria).toBe(5000)
    expect(r.residuo).toBe(0)
  })
})

describe('riepilogoBanche — conti correnti', () => {
  it('somma i conti col floor per singola entità: l\u2019attivo non compensa il rosso', () => {
    const r = riepilogoBanche(
      [
        conto({ id: 'a', accordato: 40000, disponibile: 10000 }), // 30.000 usati
        conto({ id: 'b', accordato: 20000, disponibile: 25000 }), // 5.000 propri
      ],
      [], [], {}, '2026-08-27',
    )
    expect(r.fidoCassaUtilizzato).toBe(30000)
    expect(r.liquiditaPropria).toBe(5000)
    expect(r.utilizzatoTotale).toBe(30000)
  })

  it('i conti senza fido restano fuori dal dettaglio ma dentro la liquidità propria', () => {
    const r = riepilogoBanche(
      [conto({ id: 'a', accordato: 0, disponibile: 5000 })],
      [], [], {}, '2026-08-27',
    )
    expect(r.conti).toHaveLength(0)
    expect(r.liquiditaPropria).toBe(5000)
  })

  it('liste vuote: tutti zeri, nessuna eccezione', () => {
    const r = riepilogoBanche([], [], [], {}, '2026-08-27')
    expect(r.utilizzatoTotale).toBe(0)
    expect(r.residuoTotale).toBe(0)
    expect(r.conti).toEqual([])
    expect(r.linee).toEqual([])
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run lib/banche.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/banche"`.

- [ ] **Step 3: Scrivere `lib/banche.ts`**

Crea `lib/banche.ts`:

```ts
// Esposizione verso le banche: fido di cassa sui conti correnti e anticipi fattura.
// Logica pura: niente React, niente Supabase, e `oggi` arriva sempre dal chiamante come
// 'YYYY-MM-DD' — le date ISO si confrontano come stringhe e i test restano riproducibili.
//
// Due convenzioni d'inserimento opposte, entrambe volute (vedi la spec):
//  · conto corrente → si scrive il DISPONIBILE, l'utilizzato si ricava
//  · linea di credito → si scrivono i singoli ANTICIPI, utilizzato e disponibile si ricavano

export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export type ContoBancaRow = {
  id: string
  nome: string
  disponibile: number // saldo_attuale: quanto si può spendere, fido incluso
  accordato: number   // fido_accordato
}

export type LineaCreditoRow = {
  id: string
  nome: string
  tipo: TipoLineaCredito
  accordato: number
}

export type AnticipoRow = {
  id: string
  linea_id: string
  commessa_id: string | null
  descrizione: string
  importo: number
  data_scadenza: string | null // 'YYYY-MM-DD'
  rimborsato: boolean
}

// Quello che la pagina sa delle commesse collegate. Chiave = commessa_id.
// Una chiave mancante non è un errore: l'anticipo si mostra senza residuo.
export type InfoCommessa = { etichetta: string; residuo: number }

export type AnticipoCalcolato = AnticipoRow & {
  etichettaCommessa: string | null
  residuoCommessa: number | null
  scaduto: boolean
  daChiudere: boolean // la commessa risulta saldata: promemoria, non azione
}

export type UtilizzoBanca = {
  id: string
  nome: string
  accordato: number
  disponibile: number
  utilizzato: number
  residuo: number
  anticipi: AnticipoCalcolato[] // sempre vuoto per i conti correnti
}

export type RiepilogoBanche = {
  conti: UtilizzoBanca[] // solo quelli con un fido accordato
  linee: UtilizzoBanca[]
  liquiditaPropria: number // Σ max(0, disponibile − accordato) sui conti
  fidoCassaUtilizzato: number
  lineeUtilizzato: number
  utilizzatoTotale: number
  residuoTotale: number
  anticipiScaduti: number
  anticipiDaChiudere: number
}

const num = (v: number) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Floor per singola entità, come per i crediti da commessa e i conti dipendenti:
// un conto in attivo non deve mascherare il rosso di un altro.
export function utilizzoConto(c: ContoBancaRow): {
  utilizzato: number
  propria: number
  residuo: number
} {
  const accordato = num(c.accordato)
  const disponibile = num(c.disponibile)
  return {
    utilizzato: Math.max(0, accordato - disponibile),
    propria: Math.max(0, disponibile - accordato),
    residuo: Math.max(0, Math.min(disponibile, accordato)),
  }
}

export function riepilogoBanche(
  conti: ContoBancaRow[],
  linee: LineaCreditoRow[],
  anticipi: AnticipoRow[],
  commesse: Record<string, InfoCommessa>,
  oggi: string,
): RiepilogoBanche {
  let liquiditaPropria = 0
  let fidoCassaUtilizzato = 0
  const contiUso: UtilizzoBanca[] = []

  for (const c of conti) {
    const { utilizzato, propria, residuo } = utilizzoConto(c)
    liquiditaPropria += propria
    fidoCassaUtilizzato += utilizzato
    // Una riga di fido a zero non dice niente: resta fuori dal dettaglio, ma la sua
    // disponibilità è già entrata in liquiditaPropria.
    if (num(c.accordato) <= 0) continue
    contiUso.push({
      id: c.id,
      nome: c.nome,
      accordato: num(c.accordato),
      disponibile: num(c.disponibile),
      utilizzato,
      residuo,
      anticipi: [],
    })
  }

  const utilizzatoTotale = fidoCassaUtilizzato
  const residuoTotale = contiUso.reduce((s, c) => s + c.residuo, 0)

  return {
    conti: contiUso,
    linee: [],
    liquiditaPropria,
    fidoCassaUtilizzato,
    lineeUtilizzato: 0,
    utilizzatoTotale,
    residuoTotale,
    anticipiScaduti: 0,
    anticipiDaChiudere: 0,
  }
}
```

I parametri `linee`, `anticipi`, `commesse` e `oggi` sono già in firma ma ancora ignorati: li riempie il Task 3. Restano dichiarati perché i chiamanti non cambino due volte.

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx vitest run lib/banche.test.ts`
Expected: PASS, 6 test.

Se ESLint segnala i parametri inutilizzati (`linee`, `anticipi`, `commesse`, `oggi`), **non** silenziarli con un underscore o un commento di disabilitazione: sono usati fra un attimo. Verificarlo alla fine del Task 3 con `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/banche.ts lib/banche.test.ts
git commit -m "feat(banche): fido di cassa ricavato dalla disponibilita' del conto"
```

---

### Task 3: `lib/banche.ts` — linee di credito e anticipi

**Files:**
- Modify: `lib/banche.ts` (funzione `riepilogoBanche`)
- Test: `lib/banche.test.ts`

- [ ] **Step 1: Scrivere i test che falliscono**

Prima cosa, estendi l'import già presente in cima al file — **una sola** istruzione di import da `@/lib/banche`, non una seconda:

```ts
import {
  utilizzoConto,
  riepilogoBanche,
  type ContoBancaRow,
  type LineaCreditoRow,
  type AnticipoRow,
  type InfoCommessa,
} from '@/lib/banche'
```

Poi aggiungi in fondo al file:

```ts
const linea = (over: Partial<LineaCreditoRow> = {}): LineaCreditoRow => ({
  id: 'l1',
  nome: 'Anticipo fatture Intesa',
  tipo: 'anticipo_fatture',
  accordato: 100000,
  ...over,
})

const anticipo = (over: Partial<AnticipoRow> = {}): AnticipoRow => ({
  id: 'a1',
  linea_id: 'l1',
  commessa_id: null,
  descrizione: '',
  importo: 15000,
  data_scadenza: null,
  rimborsato: false,
  ...over,
})

const OGGI = '2026-08-27'

describe('riepilogoBanche — linee e anticipi', () => {
  it('utilizzato = somma degli anticipi aperti, disponibile = plafond meno utilizzato', () => {
    const r = riepilogoBanche(
      [],
      [linea()],
      [anticipo({ id: 'a1', importo: 15000 }), anticipo({ id: 'a2', importo: 20000 })],
      {}, OGGI,
    )
    expect(r.lineeUtilizzato).toBe(35000)
    expect(r.linee[0].disponibile).toBe(65000)
    expect(r.linee[0].residuo).toBe(65000)
    expect(r.utilizzatoTotale).toBe(35000)
  })

  it('un anticipo rimborsato non è più debito e libera il plafond', () => {
    const r = riepilogoBanche(
      [],
      [linea()],
      [anticipo({ id: 'a1', importo: 15000, rimborsato: true }), anticipo({ id: 'a2', importo: 20000 })],
      {}, OGGI,
    )
    expect(r.lineeUtilizzato).toBe(20000)
    expect(r.linee[0].disponibile).toBe(80000)
    expect(r.linee[0].anticipi).toHaveLength(1)
    expect(r.linee[0].anticipi[0].id).toBe('a2')
  })

  it('anticipi oltre il plafond: disponibile a zero, mai negativo', () => {
    const r = riepilogoBanche([], [linea({ accordato: 10000 })], [anticipo({ importo: 15000 })], {}, OGGI)
    expect(r.linee[0].utilizzato).toBe(15000)
    expect(r.linee[0].disponibile).toBe(0)
    expect(r.residuoTotale).toBe(0)
  })

  it('linea senza anticipi: utilizzato zero, disponibile pari al plafond', () => {
    const r = riepilogoBanche([], [linea()], [], {}, OGGI)
    expect(r.linee[0].utilizzato).toBe(0)
    expect(r.linee[0].disponibile).toBe(100000)
  })

  it('commessa sconosciuta: niente residuo e niente promemoria', () => {
    const r = riepilogoBanche([], [linea()], [anticipo({ commessa_id: 'ignota' })], {}, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.residuoCommessa).toBeNull()
    expect(a.etichettaCommessa).toBeNull()
    expect(a.daChiudere).toBe(false)
  })

  it('commessa saldata: promemoria acceso, ma l\u2019anticipo resta nei debiti', () => {
    const commesse: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
    }
    const r = riepilogoBanche([], [linea()], [anticipo({ commessa_id: 'c1' })], commesse, OGGI)
    const a = r.linee[0].anticipi[0]
    expect(a.daChiudere).toBe(true)
    expect(a.etichettaCommessa).toBe('C-2026-014 — Rossi')
    expect(r.lineeUtilizzato).toBe(15000)
    expect(r.anticipiDaChiudere).toBe(1)
  })

  it('scaduto solo se la data è passata: oggi non è scaduto', () => {
    const ieri = riepilogoBanche([], [linea()], [anticipo({ data_scadenza: '2026-08-26' })], {}, OGGI)
    const stessoGiorno = riepilogoBanche([], [linea()], [anticipo({ data_scadenza: OGGI })], {}, OGGI)
    expect(ieri.linee[0].anticipi[0].scaduto).toBe(true)
    expect(ieri.anticipiScaduti).toBe(1)
    expect(stessoGiorno.linee[0].anticipi[0].scaduto).toBe(false)
    expect(stessoGiorno.anticipiScaduti).toBe(0)
  })

  it('un anticipo rimborsato non è né scaduto né da chiudere: è chiuso', () => {
    const commesse: Record<string, InfoCommessa> = {
      c1: { etichetta: 'C-2026-014 — Rossi', residuo: 0 },
    }
    const r = riepilogoBanche(
      [],
      [linea()],
      [anticipo({ commessa_id: 'c1', data_scadenza: '2026-01-01', rimborsato: true })],
      commesse, OGGI,
    )
    expect(r.anticipiScaduti).toBe(0)
    expect(r.anticipiDaChiudere).toBe(0)
    expect(r.linee[0].anticipi).toHaveLength(0)
  })

  it('conti e linee si sommano nel totale e nel residuo', () => {
    const r = riepilogoBanche(
      [conto({ accordato: 40000, disponibile: 10000 })],
      [linea({ accordato: 100000 })],
      [anticipo({ importo: 20000 })],
      {}, OGGI,
    )
    expect(r.utilizzatoTotale).toBe(50000)   // 30.000 di cassa + 20.000 di anticipi
    expect(r.residuoTotale).toBe(90000)      // 10.000 + 80.000
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run lib/banche.test.ts`
Expected: FAIL — i test nuovi trovano `r.linee` vuoto (`expected [] to have a length of 1`); i 6 del Task 2 continuano a passare.

- [ ] **Step 3: Completare `riepilogoBanche`**

In `lib/banche.ts`, sostituisci il corpo dopo il ciclo sui conti (dalla riga `const utilizzatoTotale = fidoCassaUtilizzato` fino al `return` finale) con:

```ts
  // ── Anticipi aperti, raggruppati per linea ──
  // I rimborsati non sono più debito e liberano il plafond: escono subito, e con loro
  // escono anche i loro contatori. Lo storico si consulta nell'interfaccia, non qui.
  const apertiPerLinea = new Map<string, AnticipoCalcolato[]>()
  let anticipiScaduti = 0
  let anticipiDaChiudere = 0

  for (const a of anticipi) {
    if (a.rimborsato) continue
    const info = a.commessa_id ? commesse[a.commessa_id] : undefined
    const residuoCommessa = info ? info.residuo : null
    const scaduto = !!a.data_scadenza && a.data_scadenza < oggi
    // Promemoria, non azione: finché non si spunta "rimborsato" l'anticipo resta
    // nei debiti e occupa il plafond.
    const daChiudere = residuoCommessa !== null && residuoCommessa <= 0
    if (scaduto) anticipiScaduti += 1
    if (daChiudere) anticipiDaChiudere += 1
    const calcolato: AnticipoCalcolato = {
      ...a,
      importo: num(a.importo),
      etichettaCommessa: info ? info.etichetta : null,
      residuoCommessa,
      scaduto,
      daChiudere,
    }
    const list = apertiPerLinea.get(a.linea_id) ?? []
    list.push(calcolato)
    apertiPerLinea.set(a.linea_id, list)
  }

  // ── Linee: si scrivono gli anticipi, utilizzato e disponibile si ricavano ──
  let lineeUtilizzato = 0
  const lineeUso: UtilizzoBanca[] = linee.map((l) => {
    const accordato = num(l.accordato)
    const aperti = apertiPerLinea.get(l.id) ?? []
    const utilizzato = aperti.reduce((s, a) => s + a.importo, 0)
    const disponibile = Math.max(0, accordato - utilizzato)
    lineeUtilizzato += utilizzato
    return {
      id: l.id,
      nome: l.nome,
      accordato,
      disponibile,
      utilizzato,
      residuo: disponibile,
      anticipi: aperti,
    }
  })

  const utilizzatoTotale = fidoCassaUtilizzato + lineeUtilizzato
  const residuoTotale =
    contiUso.reduce((s, c) => s + c.residuo, 0) + lineeUso.reduce((s, l) => s + l.residuo, 0)

  return {
    conti: contiUso,
    linee: lineeUso,
    liquiditaPropria,
    fidoCassaUtilizzato,
    lineeUtilizzato,
    utilizzatoTotale,
    residuoTotale,
    anticipiScaduti,
    anticipiDaChiudere,
  }
}
```

- [ ] **Step 4: Eseguire i test e il lint**

Run: `npx vitest run lib/banche.test.ts`
Expected: PASS, 15 test.

Run: `npm run lint`
Expected: nessun warning su `lib/banche.ts` (i parametri ora sono tutti usati).

- [ ] **Step 5: Commit**

```bash
git add lib/banche.ts lib/banche.test.ts
git commit -m "feat(banche): utilizzo delle linee ricavato dagli anticipi aperti"
```

---

### Task 4: Server Actions

**Files:**
- Modify: `actions/conti.ts:20-46` (createConto, updateConto)
- Create: `actions/banche.ts`

- [ ] **Step 1: Aggiungere `fido_accordato` alle action dei conti**

In `actions/conti.ts`, dentro `createConto` cambia l'insert:

```ts
    .insert({
      nome: input.nome.trim(),
      saldo_attuale: input.saldo_attuale,
      fido_accordato: input.fido_accordato,
      organization_id: orgId,
    })
```

e dentro `updateConto` l'update:

```ts
    .update({
      nome: input.nome.trim(),
      saldo_attuale: input.saldo_attuale,
      fido_accordato: input.fido_accordato,
      updated_at: new Date().toISOString(),
    })
```

In `getConti`, normalizza anche il numero nuovo:

```ts
  return (data ?? []).map((c) => ({
    ...c,
    saldo_attuale: Number(c.saldo_attuale),
    fido_accordato: Number(c.fido_accordato) || 0,
  })) as ContoCorrente[]
```

`updateSaldoConto` resta invariata: tocca solo la disponibilità, ed è quella che si cambia dai Calcoli.

- [ ] **Step 2: Creare `actions/banche.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type {
  LineaCredito, LineaCreditoInput,
  AnticipoFattura, AnticipoFatturaInput,
  OpzioneCommessa,
} from '@/types/commessa'

function revalida() {
  revalidatePath('/impostazioni')
  revalidatePath('/commesse', 'layout')
}

// ── Linee di credito (il plafond, e basta) ──────────────────────────────────
export async function getLineeCredito(): Promise<LineaCredito[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('linee_credito')
    .select('*')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => ({ ...l, accordato: Number(l.accordato) || 0 })) as LineaCredito[]
}

export async function createLineaCredito(input: LineaCreditoInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('linee_credito')
    .insert({
      nome: input.nome.trim(),
      tipo: input.tipo,
      accordato: input.accordato,
      organization_id: orgId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalida()
  return { id: data.id }
}

export async function updateLineaCredito(id: string, input: LineaCreditoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('linee_credito')
    .update({
      nome: input.nome.trim(),
      tipo: input.tipo,
      accordato: input.accordato,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// Attenzione: ON DELETE CASCADE porta via anche gli anticipi della linea.
// Chi chiama deve averlo detto all'utente e mostrato quanti sono.
export async function deleteLineaCredito(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('linee_credito')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// ── Anticipi fattura ────────────────────────────────────────────────────────
// Restituisce anche i rimborsati: servono all'interruttore "mostra i rimborsati"
// nei Calcoli. È `riepilogoBanche` a escluderli dai conti.
export async function getAnticipi(): Promise<AnticipoFattura[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('anticipi_fattura')
    .select('*')
    .eq('organization_id', orgId)
    .order('data_scadenza', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((a) => ({ ...a, importo: Number(a.importo) || 0 })) as AnticipoFattura[]
}

export async function createAnticipo(input: AnticipoFatturaInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('anticipi_fattura')
    .insert({
      linea_id: input.linea_id,
      commessa_id: input.commessa_id,
      descrizione: input.descrizione.trim(),
      importo: input.importo,
      data_erogazione: input.data_erogazione,
      data_scadenza: input.data_scadenza,
      organization_id: orgId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalida()
  return { id: data.id }
}

export async function updateAnticipo(id: string, input: AnticipoFatturaInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('anticipi_fattura')
    .update({
      linea_id: input.linea_id,
      commessa_id: input.commessa_id,
      descrizione: input.descrizione.trim(),
      importo: input.importo,
      data_erogazione: input.data_erogazione,
      data_scadenza: input.data_scadenza,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// La chiusura è sempre una decisione dell'utente: il software non chiude mai da solo.
export async function setAnticipoRimborsato(id: string, rimborsato: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
  const { error } = await supabase
    .from('anticipi_fattura')
    .update({
      rimborsato,
      rimborsato_at: rimborsato ? oggi : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

export async function deleteAnticipo(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('anticipi_fattura')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalida()
}

// ── Commesse collegabili a un anticipo ──────────────────────────────────────
// Serve a due cose insieme: l'elenco del dialog e il residuo mostrato accanto
// all'anticipo. Una query sola, nessuna duplicazione della formula del residuo.
export async function getCommessePerAnticipo(): Promise<OpzioneCommessa[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [{ data: commesse, error: e1 }, { data: acconti, error: e2 }] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, numero_commessa, cliente_nome, totale')
      .eq('organization_id', orgId)
      .order('numero_commessa', { ascending: false }),
    supabase
      .from('acconti_commessa')
      .select('commessa_id, importo')
      .eq('organization_id', orgId),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)

  const incassato = new Map<string, number>()
  for (const a of acconti ?? []) {
    incassato.set(a.commessa_id, (incassato.get(a.commessa_id) ?? 0) + (Number(a.importo) || 0))
  }

  return (commesse ?? []).map((c) => ({
    id: c.id,
    etichetta: `${c.numero_commessa} — ${c.cliente_nome ?? ''}`.trim(),
    // Stesso floor a zero del riepilogo crediti: una commessa incassata in eccesso
    // vale zero, non un numero negativo.
    residuo: Math.max(0, (Number(c.totale) || 0) - (incassato.get(c.id) ?? 0)),
  }))
}
```

- [ ] **Step 3: Verificare che compili**

Run: `npx tsc --noEmit`
Expected: resta **solo** l'errore su `components/impostazioni/FormConti.tsx` (chiamata a `updateConto`/`createConto` senza `fido_accordato`). Lo chiude il Task 5.

- [ ] **Step 4: Commit**

```bash
git add actions/conti.ts actions/banche.ts
git commit -m "feat(banche): server actions per linee di credito e anticipi fattura"
```

---

### Task 5: Impostazioni — fido sui conti e anagrafica delle linee

**Files:**
- Modify: `components/impostazioni/FormConti.tsx`
- Create: `components/impostazioni/FormLineeCredito.tsx`
- Modify: `app/(dashboard)/impostazioni/page.tsx:32-39` e la sezione "Conti correnti"

- [ ] **Step 1: Aggiungere il campo fido a `FormConti.tsx`**

Nel tipo riga e nello stato, affianca il fido al saldo:

```ts
type ContoRow = ContoCorrente & { nomeSalvato: string; saldoSalvato: number; fidoSalvato: number }
const toRow = (c: ContoCorrente): ContoRow => ({
  ...c,
  nomeSalvato: c.nome,
  saldoSalvato: c.saldo_attuale,
  fidoSalvato: c.fido_accordato,
})
```

Dentro il componente, accanto a `saldiStr`:

```ts
  const [fidiStr, setFidiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialConti.map((c) => [c.id, String(c.fido_accordato)]))
  )
  const [nuovoFido, setNuovoFido] = useState('')
```

`handleSalva` diventa:

```ts
  const handleSalva = async (id: string) => {
    const conto = conti.find((c) => c.id === id)
    if (!conto) return
    const saldo = parseSaldo(saldiStr[id] ?? '')
    const fido = parseSaldo(fidiStr[id] ?? '')
    if (
      conto.nome.trim() === conto.nomeSalvato &&
      saldo === conto.saldoSalvato &&
      fido === conto.fidoSalvato
    ) return
    if (!conto.nome.trim()) { toast.error('Il nome del conto è obbligatorio'); return }
    try {
      await updateConto(id, { nome: conto.nome, saldo_attuale: saldo, fido_accordato: fido })
      setConti((cur) =>
        cur.map((c) => (c.id === id
          ? { ...c, saldo_attuale: saldo, fido_accordato: fido, nomeSalvato: c.nome.trim(), saldoSalvato: saldo, fidoSalvato: fido }
          : c))
      )
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }
```

`handleAdd`:

```ts
      const saldo = parseSaldo(nuovoSaldo)
      const fido = parseSaldo(nuovoFido)
      const { id } = await createConto({ nome: nuovoNome, saldo_attuale: saldo, fido_accordato: fido })
      const nuovo: ContoCorrente = {
        id, organization_id: '', nome: nuovoNome.trim(), saldo_attuale: saldo, fido_accordato: fido,
        ordine: 0, created_at: '', updated_at: '',
      }
      setConti((cur) => [...cur, toRow(nuovo)])
      setSaldiStr((cur) => ({ ...cur, [id]: String(saldo) }))
      setFidiStr((cur) => ({ ...cur, [id]: String(fido) }))
      setNuovoNome('')
      setNuovoSaldo('')
      setNuovoFido('')
```

Il flag `dirty` nella riga:

```ts
        const dirty =
          c.nome.trim() !== c.nomeSalvato ||
          parseSaldo(saldiStr[c.id] ?? '') !== c.saldoSalvato ||
          parseSaldo(fidiStr[c.id] ?? '') !== c.fidoSalvato
```

Nel JSX, subito **dopo** il `<div className="relative w-36 shrink-0">` del saldo, aggiungi il gemello per il fido:

```tsx
            <div className="relative w-36 shrink-0">
              <Input
                type="number"
                step={0.01}
                value={fidiStr[c.id] ?? ''}
                placeholder="Fido 0,00"
                title="Fido accordato dalla banca"
                onChange={(e) => setFidiStr((cur) => ({ ...cur, [c.id]: e.target.value }))}
                onBlur={() => handleSalva(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="text-right pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
            </div>
```

e lo stesso nella riga "Aggiungi conto", legato a `nuovoFido`/`setNuovoFido` con `placeholder="Fido 0,00"`.

Infine cambia i due placeholder del saldo da `"0,00"` e `"Saldo 0,00"` a `"Disponibilità 0,00"`: la colonna contiene la disponibilità, fido incluso, e l'etichetta deve dirlo.

- [ ] **Step 2: Creare `components/impostazioni/FormLineeCredito.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Check } from 'lucide-react'
import {
  createLineaCredito, updateLineaCredito, deleteLineaCredito,
} from '@/actions/banche'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LABEL_TIPO_LINEA, type LineaCredito, type TipoLineaCredito } from '@/types/commessa'

interface Props {
  initialLinee: LineaCredito[]
  conteggioAnticipi: Record<string, number> // linea_id → quanti anticipi aperti o chiusi
}

type Riga = LineaCredito & { nomeSalvato: string; tipoSalvato: TipoLineaCredito; accordatoSalvato: number }
const toRow = (l: LineaCredito): Riga => ({
  ...l, nomeSalvato: l.nome, tipoSalvato: l.tipo, accordatoSalvato: l.accordato,
})

const parseImporto = (s: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

const TIPI = Object.keys(LABEL_TIPO_LINEA) as TipoLineaCredito[]

export default function FormLineeCredito({ initialLinee, conteggioAnticipi }: Props) {
  const [linee, setLinee] = useState<Riga[]>(() => initialLinee.map(toRow))
  const [importiStr, setImportiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLinee.map((l) => [l.id, String(l.accordato)]))
  )
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoTipo, setNuovoTipo] = useState<TipoLineaCredito>('anticipo_fatture')
  const [nuovoAccordato, setNuovoAccordato] = useState('')
  const [adding, setAdding] = useState(false)

  const handleSalva = async (id: string) => {
    const l = linee.find((x) => x.id === id)
    if (!l) return
    const accordato = parseImporto(importiStr[id] ?? '')
    if (l.nome.trim() === l.nomeSalvato && l.tipo === l.tipoSalvato && accordato === l.accordatoSalvato) return
    if (!l.nome.trim()) { toast.error('Il nome della linea è obbligatorio'); return }
    try {
      await updateLineaCredito(id, { nome: l.nome, tipo: l.tipo, accordato })
      setLinee((cur) => cur.map((x) => (x.id === id
        ? { ...x, accordato, nomeSalvato: x.nome.trim(), tipoSalvato: x.tipo, accordatoSalvato: accordato }
        : x)))
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  // La cancellazione porta via gli anticipi (ON DELETE CASCADE): va detto, e va detto quanti.
  const handleDelete = async (id: string) => {
    const quanti = conteggioAnticipi[id] ?? 0
    const avviso = quanti > 0
      ? `Eliminare questa linea? Verranno eliminati anche i suoi ${quanti} anticipi, compresi quelli ancora aperti.`
      : 'Eliminare questa linea di credito?'
    if (!confirm(avviso)) return
    const prev = linee
    setLinee((cur) => cur.filter((l) => l.id !== id))
    try {
      await deleteLineaCredito(id)
    } catch {
      setLinee(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  const handleAdd = async () => {
    if (!nuovoNome.trim()) { toast.error('Inserisci il nome della linea'); return }
    setAdding(true)
    try {
      const accordato = parseImporto(nuovoAccordato)
      const { id } = await createLineaCredito({ nome: nuovoNome, tipo: nuovoTipo, accordato })
      const nuova: LineaCredito = {
        id, organization_id: '', nome: nuovoNome.trim(), tipo: nuovoTipo, accordato,
        ordine: 0, created_at: '', updated_at: '',
      }
      setLinee((cur) => [...cur, toRow(nuova)])
      setImportiStr((cur) => ({ ...cur, [id]: String(accordato) }))
      setNuovoNome('')
      setNuovoAccordato('')
      toast.success('Linea aggiunta')
    } catch {
      toast.error("Errore nell'aggiunta della linea")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      {linee.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Nessuna linea configurata. Aggiungine una per registrare gli anticipi fattura dai Calcoli.
        </p>
      )}

      {linee.map((l) => {
        const dirty =
          l.nome.trim() !== l.nomeSalvato ||
          l.tipo !== l.tipoSalvato ||
          parseImporto(importiStr[l.id] ?? '') !== l.accordatoSalvato
        return (
          <div key={l.id} className="flex items-center gap-2">
            <Input
              value={l.nome}
              placeholder="Nome linea (es. Anticipo fatture Intesa)"
              onChange={(e) => setLinee((cur) => cur.map((x) => (x.id === l.id ? { ...x, nome: e.target.value } : x)))}
              onBlur={() => handleSalva(l.id)}
              className="flex-1"
            />
            <Select
              value={l.tipo}
              onValueChange={(v) => {
                setLinee((cur) => cur.map((x) => (x.id === l.id ? { ...x, tipo: v as TipoLineaCredito } : x)))
              }}
            >
              <SelectTrigger className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI.map((t) => (
                  <SelectItem key={t} value={t}>{LABEL_TIPO_LINEA[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-36 shrink-0">
              <Input
                type="number"
                step={0.01}
                value={importiStr[l.id] ?? ''}
                placeholder="Plafond 0,00"
                onChange={(e) => setImportiStr((cur) => ({ ...cur, [l.id]: e.target.value }))}
                onBlur={() => handleSalva(l.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="text-right pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
            </div>
            {dirty && (
              <Button
                variant="ghost"
                size="icon"
                className="text-emerald-600 hover:text-emerald-700 shrink-0"
                title="Salva"
                onClick={() => handleSalva(l.id)}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-red-600 shrink-0"
              title="Elimina"
              onClick={() => handleDelete(l.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <div className="flex items-center gap-2 border-t pt-3">
        <Input
          value={nuovoNome}
          placeholder="Nuova linea (es. Anticipo fatture Intesa)"
          onChange={(e) => setNuovoNome(e.target.value)}
          className="flex-1"
        />
        <Select value={nuovoTipo} onValueChange={(v) => setNuovoTipo(v as TipoLineaCredito)}>
          <SelectTrigger className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPI.map((t) => (
              <SelectItem key={t} value={t}>{LABEL_TIPO_LINEA[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-36 shrink-0">
          <Input
            type="number"
            step={0.01}
            value={nuovoAccordato}
            placeholder="Plafond 0,00"
            onChange={(e) => setNuovoAccordato(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            className="text-right pr-7"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={adding} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          {adding ? '...' : 'Aggiungi'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Montare la sezione in `app/(dashboard)/impostazioni/page.tsx`**

Aggiungi gli import:

```ts
import { getLineeCredito, getAnticipi } from '@/actions/banche'
import FormLineeCredito from '@/components/impostazioni/FormLineeCredito'
```

Estendi il `Promise.all` (riga 32) con le due chiamate nuove:

```ts
  const [settings, templates, conti, orariLavoro, chiusure, tipiAttivita, linee, anticipi] =
    await Promise.all([
      getSettings(),
      getNoteTemplates(),
      getConti(),
      getOrariLavoro(),
      getChiusure(),
      getTipiAttivita(),
      getLineeCredito(),
      getAnticipi(),
    ])

  // Quanti anticipi porterebbe via la cancellazione di una linea (ON DELETE CASCADE).
  const conteggioAnticipi: Record<string, number> = {}
  for (const a of anticipi) {
    conteggioAnticipi[a.linea_id] = (conteggioAnticipi[a.linea_id] ?? 0) + 1
  }
```

Aggiorna la descrizione della card "Conti correnti" (riga 81) e aggiungi subito sotto la card nuova:

```tsx
      {/* Conti correnti */}
      <Card>
        <CardHeader>
          <CardTitle>Conti correnti</CardTitle>
          <CardDescription>
            Banche/conti su cui vengono addebitate le scadenze. La disponibilità (fido incluso)
            concorre alla liquidità nei Calcoli; il fido accordato serve a capire quanta parte
            di quella disponibilità è debito verso la banca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormConti initialConti={conti} />
        </CardContent>
      </Card>

      {/* Linee di credito */}
      <Card>
        <CardHeader>
          <CardTitle>Linee di credito</CardTitle>
          <CardDescription>
            Anticipo fatture, salvo buon fine, castelletto: qui si registra solo il plafond
            accordato. I singoli anticipi si inseriscono dai Calcoli, e da lì si ricavano
            utilizzato e disponibile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormLineeCredito initialLinee={linee} conteggioAnticipi={conteggioAnticipi} />
        </CardContent>
      </Card>
```

(La riga `<FormConti initialConti={conti} />` esiste già: va lasciata dov'è, quello che cambia è la `CardDescription` sopra.)

- [ ] **Step 4: Verificare compilazione e lint**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run lint`
Expected: nessun warning.

- [ ] **Step 5: Commit**

```bash
git add components/impostazioni/FormConti.tsx components/impostazioni/FormLineeCredito.tsx "app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat(impostazioni): fido accordato sui conti e anagrafica linee di credito"
```

---

### Task 6: I debiti bancari nel riepilogo crediti/debiti

**Files:**
- Modify: `lib/statistiche-commesse.ts` (tipo `RiepilogoFinanziario` e funzione `riepilogoCreditiDebiti`, righe ~405-512)
- Test: `lib/statistiche-commesse.test.ts`
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`
- Modify: `components/commesse/StatisticheCommesse.tsx:88-92` (chiamata)

- [ ] **Step 1: Scrivere i test che falliscono**

In `lib/statistiche-commesse.test.ts`, aggiungi all'import esistente da `@/lib/banche` e una fixture:

```ts
import { riepilogoBanche, type RiepilogoBanche } from '@/lib/banche'

// Nessuna banca: il caso di chi non ha ancora compilato i fidi.
const nessunaBanca: RiepilogoBanche = riepilogoBanche([], [], [], {}, '2026-08-27')
```

Tutte le chiamate esistenti a `riepilogoCreditiDebiti(...)` nel file vanno completate con `nessunaBanca` come ultimo argomento. Poi aggiungi il blocco nuovo:

```ts
describe('riepilogoCreditiDebiti — debiti bancari', () => {
  const banche = riepilogoBanche(
    [{ id: 'cc', nome: 'Intesa', accordato: 40000, disponibile: 10000 }], // 30.000 di cassa
    [{ id: 'l1', nome: 'Anticipo Intesa', tipo: 'anticipo_fatture', accordato: 100000 }],
    [{ id: 'a1', linea_id: 'l1', commessa_id: null, descrizione: '', importo: 15000, data_scadenza: null, rimborsato: false }],
    {},
    '2026-08-27',
  )

  it('somma il fido utilizzato ai debiti totali', () => {
    const senza = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', nessunaBanca)
    const con = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', banche)
    expect(con.debitiBanche).toBe(45000)
    expect(con.debitiTotali - senza.debitiTotali).toBe(45000)
  })

  it('il fido utilizzato pesa sulla posizione netta', () => {
    const senza = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', nessunaBanca)
    const con = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', banche)
    expect(senza.posizioneNetta - con.posizioneNetta).toBe(45000)
  })

  it('il dettaglio somma sempre al totale e scarta le righe a zero', () => {
    const r = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', banche)
    const somma =
      r.debitiPerBanca.conti.reduce((s, c) => s + c.utilizzato, 0) +
      r.debitiPerBanca.linee.reduce((s, l) => s + l.utilizzato, 0)
    expect(somma).toBe(r.debitiBanche)
    expect(r.debitiPerBanca.conti.every((c) => c.utilizzato > 0)).toBe(true)
    expect(r.debitiPerBanca.linee.every((l) => l.utilizzato > 0)).toBe(true)
  })

  it('senza banche il riepilogo resta identico a prima', () => {
    const r = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', nessunaBanca)
    expect(r.debitiBanche).toBe(0)
    expect(r.debitiPerBanca.conti).toEqual([])
    expect(r.debitiPerBanca.linee).toEqual([])
    expect(r.residuoFidi).toBe(0)
  })
})
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — `Expected 7 arguments, but got 6` in fase di transpile, o `r.debitiBanche` undefined.

- [ ] **Step 3: Estendere tipo e funzione**

In `lib/statistiche-commesse.ts`, in cima al file aggiungi:

```ts
import type { RiepilogoBanche, UtilizzoBanca } from '@/lib/banche'
```

Nel tipo `RiepilogoFinanziario`, dopo `debitiDipendenti`:

```ts
  debitiBanche: number // fido di cassa utilizzato + anticipi fattura aperti
  debitiPerBanca: {    // dettaglio della riga "Banche": le righe sommano a debitiBanche
    conti: UtilizzoBanca[]
    linee: UtilizzoBanca[]
  }
  residuoFidi: number  // margine ancora disponibile, testo di servizio
```

Nella firma di `riepilogoCreditiDebiti`, dopo `oggi: string,`:

```ts
  banche: RiepilogoBanche,
```

Prima del calcolo di `debitiTotali`:

```ts
  // L'esposizione bancaria arriva già calcolata da riepilogoBanche: qui si somma e basta,
  // così le due funzioni restano indipendenti e testabili da sole.
  const debitiBanche = banche.utilizzatoTotale
  const debitiPerBanca = {
    conti: banche.conti.filter((c) => c.utilizzato > 0),
    linee: banche.linee.filter((l) => l.utilizzato > 0),
  }
```

`debitiTotali` e `posizioneNetta` diventano:

```ts
  const debitiTotali =
    debitiScaduti + debitiAnno + debitiFuturi + debitiDaProgrammare + debitiDipendenti +
    debitiBanche
  // Le rate oltre l'anno restano fuori dal netto: risponde a "reggo quest'anno?".
  // Gli stipendi arretrati e il fido invece ci entrano: sono dovuti adesso, e la banca
  // può rientrare quando vuole.
  const posizioneNetta =
    crediti -
    (debitiScaduti + debitiAnno + debitiDaProgrammare + debitiDipendenti + debitiBanche)
```

e nel `return`, accanto agli altri campi:

```ts
    debitiBanche,
    debitiPerBanca,
    residuoFidi: banche.residuoTotale,
```

- [ ] **Step 4: Eseguire i test**

Run: `npx vitest run`
Expected: PASS su tutti i file (i 15 di `banche.test.ts` più quelli di `statistiche-commesse.test.ts`, che ora includono i 4 nuovi).

- [ ] **Step 5: Caricare i dati nella pagina Statistiche**

In `app/(dashboard)/commesse/statistiche/page.tsx`:

1. Aggiungi ai tipi importati da `@/lib/banche`:

```ts
import type { ContoBancaRow, LineaCreditoRow, AnticipoRow, InfoCommessa } from '@/lib/banche'
```

2. Nella `select` delle commesse (riga ~21) aggiungi `numero_commessa`:

```ts
        .select('id, numero_commessa, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id, stato, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale')
```

3. Aggiungi tre query in fondo al `Promise.all`, e i rispettivi destrutturati in cima:

```ts
      supabase
        .from('conti_correnti')
        .select('id, nome, saldo_attuale, fido_accordato')
        .eq('organization_id', orgId),
      supabase
        .from('linee_credito')
        .select('id, nome, tipo, accordato')
        .eq('organization_id', orgId),
      supabase
        .from('anticipi_fattura')
        .select('id, linea_id, commessa_id, descrizione, importo, data_scadenza, rimborsato')
        .eq('organization_id', orgId),
```

destrutturando `{ data: contiRaw }, { data: lineeRaw }, { data: anticipiRaw }`.

4. Subito prima del calcolo di `oggi`, costruisci le righe e la mappa commesse:

```ts
  const contiBanca: ContoBancaRow[] = (contiRaw ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    disponibile: Number(c.saldo_attuale) || 0,
    accordato: Number(c.fido_accordato) || 0,
  }))

  const lineeCredito: LineaCreditoRow[] = (lineeRaw ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    tipo: l.tipo,
    accordato: Number(l.accordato) || 0,
  }))

  const anticipi: AnticipoRow[] = (anticipiRaw ?? []).map((a) => ({
    id: a.id,
    linea_id: a.linea_id,
    commessa_id: a.commessa_id,
    descrizione: a.descrizione ?? '',
    importo: Number(a.importo) || 0,
    data_scadenza: a.data_scadenza,
    rimborsato: !!a.rimborsato,
  }))

  // Etichetta e residuo delle commesse collegate agli anticipi. Si costruisce su
  // commesseRaw, NON su commesseValide: un anticipo può puntare a una commessa
  // "in attesa", che è esclusa dalle statistiche ma il cui debito con la banca esiste.
  const incassatoTot = new Map<string, number>()
  for (const a of accontiRaw ?? []) {
    incassatoTot.set(a.commessa_id, (incassatoTot.get(a.commessa_id) ?? 0) + (Number(a.importo) || 0))
  }
  const infoCommesse: Record<string, InfoCommessa> = {}
  for (const c of commesseRaw ?? []) {
    infoCommesse[c.id] = {
      etichetta: `${c.numero_commessa} — ${c.cliente_nome ?? ''}`.trim(),
      residuo: Math.max(0, (Number(c.totale) || 0) - (incassatoTot.get(c.id) ?? 0)),
    }
  }
```

5. Passa i quattro campi nuovi al componente:

```tsx
    <StatisticheCommesse
      dati={{
        commesse, acconti, anni, costiCommesse, scadenze, oggi,
        altriCrediti, pagamentiDipendenti, contiDipendenti,
        contiBanca, lineeCredito, anticipi, infoCommesse,
      }}
    />
```

6. In `lib/statistiche-commesse.ts`, estendi `DatiStatistiche`:

```ts
  contiBanca: ContoBancaRow[] // conti correnti con la loro disponibilità e il fido
  lineeCredito: LineaCreditoRow[]
  anticipi: AnticipoRow[] // compresi i rimborsati: è riepilogoBanche a scartarli
  infoCommesse: Record<string, InfoCommessa> // etichetta + residuo per gli anticipi
```

aggiungendo i tipi all'import da `@/lib/banche` fatto allo Step 3.

- [ ] **Step 6: Collegare il calcolo nel componente**

In `components/commesse/StatisticheCommesse.tsx`, aggiungi l'import:

```ts
import { riepilogoBanche } from '@/lib/banche'
```

estendi la destrutturazione di `dati`:

```ts
  const {
    commesse, acconti, anni, costiCommesse, scadenze, oggi,
    altriCrediti, pagamentiDipendenti, contiDipendenti,
    contiBanca, lineeCredito, anticipi, infoCommesse,
  } = dati
```

e sostituisci il `useMemo` del riepilogo con i due incatenati:

```ts
  const banche = useMemo(
    () => riepilogoBanche(contiBanca, lineeCredito, anticipi, infoCommesse, oggi),
    [contiBanca, lineeCredito, anticipi, infoCommesse, oggi],
  )
  const riepilogo = useMemo(
    () => riepilogoCreditiDebiti(commesse, acconti, altriCrediti, scadenze, contiDipendenti, oggi, banche),
    [commesse, acconti, altriCrediti, scadenze, contiDipendenti, oggi, banche],
  )
```

- [ ] **Step 7: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts "app/(dashboard)/commesse/statistiche/page.tsx" components/commesse/StatisticheCommesse.tsx
git commit -m "feat(statistiche): il fido utilizzato entra nei debiti e nella posizione netta"
```

---

### Task 7: La riga "Banche" nel riquadro debiti

**Files:**
- Modify: `components/commesse/StatisticheCommesse.tsx` (stato in cima, blocco `<dl>` dei debiti, testo della posizione netta)

- [ ] **Step 1: Aggiungere lo stato della tendina**

Accanto a `const [dettaglioCommesse, setDettaglioCommesse] = useState(false)`:

```ts
  // Tendina del dettaglio "Banche": chiusa di default, come quella dei crediti
  const [dettaglioBanche, setDettaglioBanche] = useState(false)
```

- [ ] **Step 2: Inserire la riga nel `<dl>` dei debiti**

Dentro `<dl className="mt-2 space-y-1 text-sm">`, **dopo** il blocco `{riepilogo.debitiDipendenti > 0 && (…)}` e **prima** della riga "Rate oltre il {annoOggi}":

```tsx
                  {riepilogo.debitiBanche > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setDettaglioBanche((v) => !v)}
                        aria-expanded={dettaglioBanche}
                        className="w-full flex items-center justify-between gap-2 text-gray-700 hover:text-gray-900 transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-gray-500 transition-transform ${dettaglioBanche ? '' : '-rotate-90'}`}
                          />
                          Banche (fido utilizzato)
                        </span>
                        <span>{formatEuro(riepilogo.debitiBanche)}</span>
                      </button>
                      {dettaglioBanche && (
                        <ul className="ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-2 text-xs">
                          {riepilogo.debitiPerBanca.conti.map((c) => (
                            <li key={c.id} className="flex justify-between gap-2 text-gray-600">
                              <span>{c.nome}<span className="text-gray-400"> · fido di cassa</span></span>
                              <span className="font-medium text-gray-700">{formatEuro(c.utilizzato)}</span>
                            </li>
                          ))}
                          {riepilogo.debitiPerBanca.linee.map((l) => (
                            <li key={l.id} className="text-gray-600">
                              <div className="flex justify-between gap-2">
                                <span>{l.nome}</span>
                                <span className="font-medium text-gray-700">{formatEuro(l.utilizzato)}</span>
                              </div>
                              <ul className="ml-2 border-l border-gray-100 pl-2 text-[11px] text-gray-500">
                                {l.anticipi.map((a) => (
                                  <li key={a.id} className="flex justify-between gap-2">
                                    <span className={a.scaduto ? 'text-rose-600' : undefined}>
                                      {a.etichettaCommessa ?? (a.descrizione || 'Anticipo')}
                                      {a.data_scadenza && <span className="text-gray-400"> · scad. {a.data_scadenza}</span>}
                                    </span>
                                    <span>{formatEuro(a.importo)}</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                          <li className="pt-1 text-gray-400">
                            margine ancora disponibile: {formatEuro(riepilogo.residuoFidi)}
                          </li>
                        </ul>
                      )}
                    </div>
                  )}
```

`ChevronDown` è già importato in cima al file per la tendina dei crediti: non aggiungere un secondo import.

- [ ] **Step 3: Aggiornare il testo della posizione netta**

Sostituisci la riga di spiegazione sotto "Posizione netta" con:

```tsx
                  <p className="text-xs text-gray-500 mt-0.5">
                    Crediti meno i debiti da saldare entro l&apos;anno: stipendi arretrati e fido
                    bancario compresi, le rate future escluse
                  </p>
```

- [ ] **Step 4: Verificare**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning.

Run: `npm run dev`, apri `http://localhost:3000/commesse/statistiche`.
Expected: finché non è stato compilato nessun fido, la riga "Banche" **non compare** e tutti i numeri sono quelli di prima. Compilando un fido in Impostazioni (es. accordato 40.000 su un conto con disponibilità 10.000) compare la riga con €30.000 e la tendina si apre sul dettaglio.

- [ ] **Step 5: Commit**

```bash
git add components/commesse/StatisticheCommesse.tsx
git commit -m "feat(statistiche): riga Banche con tendina per conti e anticipi"
```

---

### Task 8: Calcoli — etichetta "Disponibilità" e scomposizione della liquidità

**Files:**
- Modify: `components/commesse/TabellaCalcoli.tsx` (blocco Giacenze, righe ~386-478)

- [ ] **Step 1: Calcolare il fido utilizzato dai conti già in pagina**

In cima al file aggiungi l'import:

```ts
import { utilizzoConto } from '@/lib/banche'
```

e accanto al `useMemo` di `liquidita` (riga ~213):

```ts
  // Quanta parte della liquidità è soldi della banca. Si usa lo stesso utilizzoConto
  // delle statistiche: la formula del fido sta in un posto solo.
  const fidoUtilizzato = useMemo(
    () =>
      contiItems.reduce(
        (s, c) =>
          s + utilizzoConto({
            id: c.id,
            nome: c.nome,
            disponibile: parseImporto(contiSaldiStr[c.id] ?? ''),
            accordato: c.fido_accordato,
          }).utilizzato,
        0,
      ),
    [contiItems, contiSaldiStr],
  )
```

- [ ] **Step 2: Mostrare il fido residuo accanto al conto**

Nel blocco dei conti correnti, dentro lo `<span>` del nome, dopo `{c.nome}`:

```tsx
                  {c.fido_accordato > 0 && (
                    <span className="text-xs font-normal text-gray-400 shrink-0">
                      fido {formatEuro(c.fido_accordato)}
                    </span>
                  )}
```

e cambia il `placeholder` dell'input del saldo da `"0,00"` a `"Disponibilità"`.

- [ ] **Step 3: Scomporre il footer della liquidità**

Sostituisci il footer "Liquidità corrente" con:

```tsx
        {/* Footer liquidità corrente */}
        <div className="border-t-2 border-emerald-200 bg-emerald-50/60">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold text-emerald-900">Liquidità corrente</span>
            <span className="text-lg font-bold text-emerald-800 pr-12">{formatEuro(liquidita)}</span>
          </div>
          {fidoUtilizzato > 0 && (
            <p className="px-4 pb-3 -mt-1 text-xs text-emerald-900/70">
              di cui <span className="font-medium text-amber-700">{formatEuro(fidoUtilizzato)}</span> di
              fido bancario — soldi tuoi: {formatEuro(liquidita - fidoUtilizzato)}
            </p>
          )}
        </div>
```

Il totale **non cambia**: resta la disponibilità, cioè quello che si può davvero pagare. Le righe libere (contanti, altre disponibilità) stanno fra i soldi propri, per questo si sottrae `fidoUtilizzato` dalla liquidità e non si usa `liquiditaPropria`, che guarda solo i conti.

- [ ] **Step 4: Verificare**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Run: `npm run dev`, apri `http://localhost:3000/commesse/calcoli`.
Expected: senza fidi compilati il blocco è identico a prima. Con un fido compilato compare la riga "di cui … di fido bancario" e il totale resta invariato.

- [ ] **Step 5: Commit**

```bash
git add components/commesse/TabellaCalcoli.tsx
git commit -m "feat(calcoli): la liquidita' dice quanta parte e' fido bancario"
```

---

### Task 9: Calcoli — blocco "Fidi e anticipi"

**Files:**
- Create: `components/commesse/DialogAnticipo.tsx`
- Create: `components/commesse/BloccoFidi.tsx`
- Modify: `app/(dashboard)/commesse/calcoli/page.tsx`

- [ ] **Step 1: Creare il dialog dell'anticipo**

`components/commesse/DialogAnticipo.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ComboboxField } from '@/components/ui/combobox-field'
import { createAnticipo, updateAnticipo } from '@/actions/banche'
import { formatEuro } from '@/lib/pricing'
import type { AnticipoFattura, LineaCredito, OpzioneCommessa } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  linee: LineaCredito[]
  commesse: OpzioneCommessa[]
  anticipo: AnticipoFattura | null // null = nuovo
}

const parseImporto = (s: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

export default function DialogAnticipo({ open, onOpenChange, linee, commesse, anticipo }: Props) {
  const router = useRouter()
  const [lineaId, setLineaId] = useState(anticipo?.linea_id ?? linee[0]?.id ?? '')
  const [commessaId, setCommessaId] = useState(anticipo?.commessa_id ?? '')
  const [descrizione, setDescrizione] = useState(anticipo?.descrizione ?? '')
  const [importo, setImporto] = useState(anticipo ? String(anticipo.importo) : '')
  const [erogazione, setErogazione] = useState(anticipo?.data_erogazione ?? '')
  const [scadenza, setScadenza] = useState(anticipo?.data_scadenza ?? '')
  const [saving, setSaving] = useState(false)

  const selezionata = commesse.find((c) => c.id === commessaId)

  const handleSalva = async () => {
    if (!lineaId) { toast.error('Scegli la linea di credito'); return }
    const valore = parseImporto(importo)
    if (valore <= 0) { toast.error("Inserisci l'importo anticipato"); return }
    setSaving(true)
    try {
      const input = {
        linea_id: lineaId,
        commessa_id: commessaId || null,
        descrizione,
        importo: valore,
        data_erogazione: erogazione || null,
        data_scadenza: scadenza || null,
      }
      if (anticipo) await updateAnticipo(anticipo.id, input)
      else await createAnticipo(input)
      toast.success(anticipo ? 'Anticipo aggiornato' : 'Anticipo aggiunto')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{anticipo ? 'Modifica anticipo' : 'Nuovo anticipo fattura'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Linea di credito</Label>
            <Select value={lineaId} onValueChange={setLineaId}>
              <SelectTrigger><SelectValue placeholder="Scegli la linea" /></SelectTrigger>
              <SelectContent>
                {linee.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Commessa</Label>
            <ComboboxField
              options={commesse.map((c) => ({ value: c.id, label: c.etichetta }))}
              value={commessaId}
              onChange={setCommessaId}
              placeholder="Nessuna commessa collegata"
              searchPlaceholder="Cerca per numero o cliente…"
            />
            {selezionata && (
              <p className="text-xs text-gray-500">
                Il cliente deve ancora saldare {formatEuro(selezionata.residuo)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Importo anticipato</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={importo}
              placeholder="0,00"
              onChange={(e) => setImporto(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Erogato il</Label>
              <Input type="date" value={erogazione} onChange={(e) => setErogazione(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza</Label>
              <Input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={descrizione}
              placeholder="Es. fattura 214/2026"
              onChange={(e) => setDescrizione(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSalva} disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Creare il blocco**

`components/commesse/BloccoFidi.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { formatEuro } from '@/lib/pricing'
import { riepilogoBanche, type AnticipoRow, type InfoCommessa, type LineaCreditoRow } from '@/lib/banche'
import { setAnticipoRimborsato, deleteAnticipo } from '@/actions/banche'
import DialogAnticipo from './DialogAnticipo'
import type { AnticipoFattura, LineaCredito, OpzioneCommessa } from '@/types/commessa'

interface Props {
  linee: LineaCredito[]
  anticipi: AnticipoFattura[] // compresi i rimborsati
  commesse: OpzioneCommessa[]
  oggi: string // 'YYYY-MM-DD' dal Server Component
}

export default function BloccoFidi({ linee, anticipi, commesse, oggi }: Props) {
  const router = useRouter()
  const [mostraRimborsati, setMostraRimborsati] = useState(false)
  const [dialogAperto, setDialogAperto] = useState(false)
  const [inModifica, setInModifica] = useState<AnticipoFattura | null>(null)

  const infoCommesse = useMemo(() => {
    const map: Record<string, InfoCommessa> = {}
    for (const c of commesse) map[c.id] = { etichetta: c.etichetta, residuo: c.residuo }
    return map
  }, [commesse])

  const riepilogo = useMemo(() => {
    const righeLinee: LineaCreditoRow[] = linee.map((l) => ({
      id: l.id, nome: l.nome, tipo: l.tipo, accordato: l.accordato,
    }))
    const righeAnticipi: AnticipoRow[] = anticipi.map((a) => ({
      id: a.id, linea_id: a.linea_id, commessa_id: a.commessa_id, descrizione: a.descrizione,
      importo: a.importo, data_scadenza: a.data_scadenza, rimborsato: a.rimborsato,
    }))
    return riepilogoBanche([], righeLinee, righeAnticipi, infoCommesse, oggi)
  }, [linee, anticipi, infoCommesse, oggi])

  const rimborsatiPerLinea = useMemo(() => {
    const map = new Map<string, AnticipoFattura[]>()
    for (const a of anticipi) {
      if (!a.rimborsato) continue
      const list = map.get(a.linea_id) ?? []
      list.push(a)
      map.set(a.linea_id, list)
    }
    return map
  }, [anticipi])

  const handleRimborso = async (a: AnticipoFattura, valore: boolean) => {
    try {
      await setAnticipoRimborsato(a.id, valore)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleElimina = async (a: AnticipoFattura) => {
    if (!confirm('Eliminare questo anticipo?')) return
    try {
      await deleteAnticipo(a.id)
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    }
  }

  const apri = (a: AnticipoFattura | null) => {
    setInModifica(a)
    setDialogAperto(true)
  }

  if (linee.length === 0) return null

  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/60">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-amber-600" />
          Fidi e anticipi
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <Checkbox
              checked={mostraRimborsati}
              onCheckedChange={(v) => setMostraRimborsati(v === true)}
            />
            Mostra i rimborsati
          </label>
          <Button variant="outline" size="sm" onClick={() => apri(null)}>
            <Plus className="h-4 w-4 mr-1" />
            Anticipo
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {riepilogo.linee.map((l) => {
          const chiusi = rimborsatiPerLinea.get(l.id) ?? []
          return (
            <div key={l.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-800">{l.nome}</span>
                <span className="text-xs text-gray-500">
                  plafond {formatEuro(l.accordato)} · utilizzato{' '}
                  <span className="font-semibold text-amber-700">{formatEuro(l.utilizzato)}</span> ·
                  residuo <span className="font-semibold text-emerald-700">{formatEuro(l.residuo)}</span>
                </span>
              </div>

              {l.anticipi.length === 0 && chiusi.length === 0 && (
                <p className="mt-2 text-xs text-gray-400">Nessun anticipo su questa linea</p>
              )}

              <ul className="mt-2 space-y-1">
                {l.anticipi.map((a) => {
                  const originale = anticipi.find((x) => x.id === a.id)!
                  return (
                    <li
                      key={a.id}
                      className={`flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm ${
                        a.scaduto ? 'bg-rose-50' : a.daChiudere ? 'bg-amber-50' : 'bg-gray-50/60'
                      }`}
                    >
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => handleRimborso(originale, true)}
                        title="Segna come rimborsato"
                      />
                      <span className="flex-1 min-w-0 truncate text-gray-700">
                        {a.etichettaCommessa ?? (a.descrizione || 'Anticipo')}
                        {a.data_scadenza && (
                          <span className={a.scaduto ? 'text-rose-600' : 'text-gray-400'}>
                            {' '}· scad. {a.data_scadenza}
                          </span>
                        )}
                      </span>
                      {a.residuoCommessa !== null && (
                        <span className="text-xs text-gray-500 shrink-0">
                          il cliente deve {formatEuro(a.residuoCommessa)}
                        </span>
                      )}
                      <span className="font-semibold text-gray-800 shrink-0">{formatEuro(a.importo)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-700 shrink-0" title="Modifica" onClick={() => apri(originale)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-300 hover:text-red-500 shrink-0" title="Elimina" onClick={() => handleElimina(originale)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {a.daChiudere && !a.scaduto && (
                        <p className="w-full text-xs text-amber-700">
                          Il cliente ha saldato: la banca dovrebbe essere rientrata
                        </p>
                      )}
                    </li>
                  )
                })}

                {mostraRimborsati && chiusi.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-400 line-through">
                    <Checkbox checked onCheckedChange={() => handleRimborso(a, false)} title="Riapri l'anticipo" />
                    <span className="flex-1 min-w-0 truncate">{a.descrizione || 'Anticipo'}</span>
                    <span className="shrink-0">{formatEuro(a.importo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <p className="px-4 py-2 border-t bg-gray-50/60 text-xs text-gray-500">
        Gli anticipi non entrano nella liquidità corrente: il residuo di un plafond diventa
        cassa solo presentando fatture.
      </p>

      {dialogAperto && (
        <DialogAnticipo
          key={inModifica?.id ?? 'nuovo'}
          open={dialogAperto}
          onOpenChange={setDialogAperto}
          linee={linee}
          commesse={commesse}
          anticipo={inModifica}
        />
      )}
    </div>
  )
}
```

Il `key` sul dialog serve a rimontarlo quando si passa da un anticipo all'altro: lo stato iniziale dei campi si legge una volta sola, all'apertura.

- [ ] **Step 3: Montare il blocco nella pagina Calcoli**

In `app/(dashboard)/commesse/calcoli/page.tsx`:

```ts
import { getLineeCredito, getAnticipi, getCommessePerAnticipo } from '@/actions/banche'
import BloccoFidi from '@/components/commesse/BloccoFidi'
```

Estendi il `Promise.all`:

```ts
  const [commesse, gruppi, righe, scadenze, conti, incassi, linee, anticipi, opzioniCommesse] =
    await Promise.all([
      getCommesseCalcoli(),
      getGruppiCommesse(),
      getRigheCalcoli(),
      getScadenzeCalcoli(),
      getConti(),
      getIncassiAttesa(),
      getLineeCredito(),
      getAnticipi(),
      getCommessePerAnticipo(),
    ])

  // Data locale italiana, non UTC: il confine dello "scaduto" non deve saltare di un giorno.
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
```

e nel JSX, subito dopo `<TabellaCalcoli … />`:

```tsx
        <BloccoFidi linee={linee} anticipi={anticipi} commesse={opzioniCommesse} oggi={oggi} />
```

- [ ] **Step 4: Verificare**

Run: `npx tsc --noEmit && npm run lint`
Expected: nessun errore, nessun warning.

Run: `npm run dev`, apri `http://localhost:3000/commesse/calcoli`.
Expected, con una linea creata in Impostazioni (plafond 100.000):
1. Il blocco "Fidi e anticipi" compare sotto le Giacenze; senza linee non compare affatto.
2. "Anticipo" apre il dialog, la commessa si cerca per numero o cliente e mostra il residuo.
3. Salvato un anticipo da 15.000, la linea segna utilizzato 15.000 e residuo 85.000, e la Liquidità corrente **non cambia**.
4. In `/commesse/statistiche` la riga "Banche" cresce di 15.000 e la posizione netta cala della stessa cifra.
5. Spuntando "rimborsato" l'anticipo sparisce dagli aperti, il plafond torna a 100.000 e i debiti calano; con "Mostra i rimborsati" riappare barrato e la spunta lo riapre.

- [ ] **Step 5: Commit**

```bash
git add components/commesse/BloccoFidi.tsx components/commesse/DialogAnticipo.tsx "app/(dashboard)/commesse/calcoli/page.tsx"
git commit -m "feat(calcoli): blocco fidi e anticipi con chiusura a mano"
```

---

### Task 10: Verifica finale e documentazione

**Files:**
- Modify: `C:\Users\almin\.claude\projects\C--Users-almin-OneDrive-Documenti-Applicazioni-ALM-Projects-gestionale-infissi\memory\PRD.md` — è questo il PRD che il progetto tiene aggiornato dopo ogni implementazione
- Create: `…\memory\project_fidi_bancari.md` + una riga in `…\memory\MEMORY.md`

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: PASS, tutti i file. Segnare il numero totale di test.

- [ ] **Step 2: Lint e build**

Run: `npx eslint` **sui soli file toccati da questo lavoro**, non sull'intero repository.

`npm run lint` senza argomenti tira dentro anche i file generati e non versionati (`public/sw.js` minificato, `.next/`) e file pre-esistenti mai toccati qui: sul repository pulito, prima di questo lavoro, riportava già 35 errori e 1708 warning. Non è un criterio utilizzabile, e non va "sistemato" qui.

Expected: nessun errore e nessun warning sui file di questo lavoro.

Run: `npm run build`
Expected: build completata.

Run: `npm run build`
Expected: build completata. Se fallisce per `RESEND_API_KEY` mancante, è un problema pre-esistente della route email: impostare una chiave fittizia in `.env.local` e ripetere.

- [ ] **Step 3: Prova sui dati veri, in lettura**

Con lo strumento MCP Supabase `execute_sql`, verificare che nessun conto abbia un fido incoerente:

```sql
select nome, saldo_attuale, fido_accordato,
       greatest(0, fido_accordato - saldo_attuale) as utilizzato
from conti_correnti
order by utilizzato desc;
```

Expected: la colonna `utilizzato` corrisponde a quello che mostra la riga "Banche". Se un conto ha `fido_accordato = 0`, `utilizzato` deve essere 0.

- [ ] **Step 4: Aggiornare il PRD**

Nel PRD in `memory\PRD.md`, aggiungere fra le fasi completate la voce "Fidi bancari e anticipi fattura", con: le due convenzioni d'inserimento opposte, il fatto che l'anticipo non genera scadenza e non è un costo, e il rimando a `docs/superpowers/specs/2026-08-27-fidi-bancari-design.md`.

- [ ] **Step 5: Scrivere la memoria di progetto**

Creare `memory/project_fidi_bancari.md` (frontmatter `type: project`) con le scelte da non ribaltare:

1. Conto → si scrive il disponibile; linea → si scrivono gli anticipi. Convenzioni opposte, entrambe volute.
2. `linee_credito` non ha la colonna `disponibile`: l'utilizzato viene sempre dagli anticipi.
3. L'anticipo **non** genera una scadenza: chi volesse portarlo nello scadenzario deve *spostare* il conteggio, non aggiungerlo.
4. L'anticipo **non è un costo**: fuori da `aggregaUscitePerCategoria`, dal grafico uscite e dall'analisi costi/utili. Gli interessi sì, ma si vedranno più avanti.
5. Credito della commessa e debito verso la banca convivono: la posizione netta è più severa su ogni fattura anticipata, ed è voluto.
6. `daChiudere` è un promemoria: l'anticipo resta nei debiti finché non lo si spunta.

Aggiungere la riga corrispondente in `MEMORY.md` e collegare `[[project-crediti-debiti-statistiche]]` e `[[project-commesse-calcoli]]`.

- [ ] **Step 6: Commit finale**

```bash
git add -A
git commit -m "docs: fidi bancari e anticipi fattura nel PRD"
```

---

## Note per chi esegue

- **Non toccare** il significato di `conti_correnti.saldo_attuale`: contiene la disponibilità, fido incluso. È la ragione per cui l'utente scrive quel numero.
- **Non filtrare mai** gli stati o i tipi escludendo per nome: elencare in positivo (vedi `gotcha_blocchi_commesse_tipo`).
- **Niente `new Date()`** dentro `lib/banche.ts` e `lib/statistiche-commesse.ts`: `oggi` arriva dal Server Component.
- **Niente scritture in ref durante il render** e nessuna lettura di `ref.current` in fase di render: il progetto usa React Compiler (vedi `gotcha_react_compiler_refs`).
- Se una verifica fallisce, **non proseguire** al task successivo: sistemare prima.
