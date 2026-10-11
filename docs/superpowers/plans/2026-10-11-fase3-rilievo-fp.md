# Fase 3 — Rilievo in cantiere con le strutture di FP PRO: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dal telefono, anche senza rete, si rileva ogni serramento scegliendo serie e struttura di FP PRO e inserendo misure, quote, finiture, vetri, kit, mano di apertura e telaio per lato; il disegno segue le misure; i dati arrivano da soli in WinStudio. WinConfig e i rilievi di prova spariscono.

**Architecture:** pagina unica client `/rilievo/cantiere` conservata dal service worker. Catalogo FP PRO copiato nel telefono (Dexie v6) a pagine e solo per differenze; rilievi e voci scritti prima in Dexie con id uuid e `aggiornatoAt`, inviati con upsert quando c'è rete (vince il più recente). Logica pura testata in `lib/fppro/rilievo-fp.ts` (analisi della struttura), `lib/fppro/disegno-voce.ts` (disegno che segue le misure) e `lib/fppro/sync-rilievi.ts` (regole di unione).

**Tech Stack:** Next.js 16 / React 19 / Dexie 4 + dexie-react-hooks / Serwist / Supabase / Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-fase3-rilievo-fp-design.md` (e, sopra, `2026-10-10-rilievo-preventivo-fppro-design.md`).

## Global Constraints

- Funziona **senza rete**: dentro `/rilievo/cantiere` niente navigazioni Next (cambi di vista con stato + `history.pushState`); ogni dato letto da Dexie.
- Dexie: nuova **versione 6** che ripete tutte le tabelle della 5 e aggiunge le nuove (Dexie richiede l'elenco completo).
- Voci e rilievi: `id` uuid generato sul telefono (`crypto.randomUUID()`), `aggiornatoAt` ISO; ogni modifica locale mette `daInviare = 1`.
- Server action: **non lanciano** verso il client (restituiscono `{ errore }`), tranne le letture usate solo da pagine server.
- Letture complete dal database: sempre a pagine (`selectAll` o `range`), mai oltre 1000 righe per richiesta.
- Codici sempre di FP PRO (strutture, colori `fp_colori.fp_id`, vetri `fp_vetri.fp_id`, telai = codice profilo).
- Disegno: **simboli di apertura rimandati** (i poligoni non dicono quale pezzo è quale anta in modo affidabile, verificato sui dati del 2026-10-11); il disegno mostra profili e vetro. Deviazione dalla spec §5 decisa qui.
- Foto (allegati): solo con rete e solo per voci già inviate.
- Testi in italiano, lint a zero, interfaccia pensata per il telefono (bersagli ≥ 44 px, `inputMode="numeric"` sulle misure).

## Review Focus

1. **App aperta da zero senza campo** (telefono riavviato in cantiere): la pagina deve aprirsi dalla cache del service worker e mostrare rilievi e strutture già scaricate → regola NetworkFirst nel Task 7, provata in produzione nel Task 9.
2. **Scaricamento del catalogo interrotto a metà** (campo che va e viene, app chiusa): deve ripartire da dove era, senza ricominciare e senza doppioni → cursore per tabella in `fpMeta` (Task 5), provato a mano nel Task 9.
3. **Voce modificata mentre il suo invio era in corso**: la modifica nuova non deve essere segnata come inviata → test di `inviateConfermate` (Task 4).
4. **Rilievo modificato sul PC e sul telefono**: vince il più recente, una modifica locale non inviata non viene mai sovrascritta da una remota più vecchia → test di `remotiDaApplicare` (Task 4).
5. **Misure assurde** (vuote, 0, quota di un traverso oltre l'altezza): avviso sulla voce, disegno comunque leggibile → test di `problemiVoce` e `mappaAsse` (Task 2, 3).

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261011130000_rilievo_fp.sql` | colonna `fp` e `updated_at` sulle voci, tabella `fp_preferenze` |
| `supabase/migrations/20261011140000_via_winconfig.sql` | via tabelle `wc_*`, colonna `config_winconfig`, tipo `winconfig`, modulo permessi, `rilievo_opzioni` |
| `types/rilievo-fp.ts` | tipi di voce, rilievo, righe locali del catalogo |
| `lib/fppro/rilievo-fp.ts` (+test) | analisi della struttura: divisioni, campi vetro, kit opzionali, telai, voce nuova, problemi |
| `lib/fppro/disegno-voce.ts` (+test) | `mappaAsse`, `disegnoVoce` |
| `lib/fppro/sync-rilievi.ts` (+test) | `remotiDaApplicare`, `inviateConfermate` |
| `lib/db.ts` (modifica) | Dexie v6 |
| `lib/rilievo-fp-locale.ts` | operazioni locali su rilievi e voci (Dexie) |
| `actions/rilievo-fp.ts` | scaricamento catalogo, firme immagini, invio/ricezione rilievi, preferenze |
| `hooks/useCatalogoLocale.ts`, `hooks/useInvioRilievi.ts` | motori di scaricamento e invio |
| `components/rilievo-fp/*` | app del cantiere (vedi Task 6) |
| `app/(dashboard)/rilievo/cantiere/page.tsx` | pagina |
| `app/sw.ts` (modifica) | pagina del cantiere disponibile senza rete |
| `components/rilievo/MenuRilievo.tsx`, `components/rilievo/ImpostazioniRilievo.tsx`, `app/(dashboard)/rilievo/impostazioni/page.tsx`, `components/catalogo-fp/DettaglioStrutturaFp.tsx`, `actions/catalogo-fp.ts` (modifiche) | menu, liste brevi, stella nel catalogo |
| WinConfig e rilievo veloce vecchio (eliminazioni, Task 8) | |

---

### Task 1: Database e tipi

**Files:**
- Create: `supabase/migrations/20261011130000_rilievo_fp.sql`, `types/rilievo-fp.ts`

**Interfaces:**
- Produces: colonne `rilievo_veloce_voci.fp jsonb`, `rilievo_veloce_voci.updated_at`; tabella `fp_preferenze(id, organization_id, tipo, rif, ordine, created_at)` con `UNIQUE(organization_id, tipo, rif)`; tipi `Lato`, `RifFp`, `VoceFpDati`, `RilievoFp`, `VoceFp`, `RilievoLocale`, `VoceLocale`, `EliminatoFp`, `TabellaCatalogoLocale`, `StrutturaLocale`, `ColoreLocale`, `VetroLocale`, `TelaioLocale`, `SerieLocale`, `PreferenzaFp`, `ImmagineLocale`, `MetaFp`.

- [ ] **Step 1: Migration**

`supabase/migrations/20261011130000_rilievo_fp.sql`:

```sql
-- ============================================================
-- 20261011130000_rilievo_fp.sql
-- Fase 3: rilievo in cantiere con le strutture di FP PRO.
-- La voce nuova sta tutta in rilievo_veloce_voci.fp (jsonb); le colonne vecchie
-- restano ma non si usano piu'. updated_at serve al telefono per capire chi e'
-- piu' recente (vince la modifica piu' recente).
-- ============================================================

ALTER TABLE rilievo_veloce_voci ADD COLUMN IF NOT EXISTS fp jsonb;
ALTER TABLE rilievo_veloce_voci ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_rilievo_voci_updated ON rilievo_veloce_voci(organization_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_rilievi_veloci_updated ON rilievi_veloci(organization_id, updated_at);

-- Strutture preferite e liste brevi di colori/vetri, per azienda.
CREATE TABLE IF NOT EXISTS fp_preferenze (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('struttura', 'colore', 'vetro')),
  rif             text NOT NULL,
  ordine          integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tipo, rif)
);

ALTER TABLE fp_preferenze ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_preferenze_select" ON fp_preferenze
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fp_preferenze_insert" ON fp_preferenze
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "fp_preferenze_delete" ON fp_preferenze
  FOR DELETE USING (organization_id = get_user_organization_id());
```

- [ ] **Step 2: Applicare e verificare**

`apply_migration` (nome `rilievo_fp`). Poi `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_name = 'rilievo_veloce_voci' and column_name in ('fp', 'updated_at')) colonne,
  (select count(*) from information_schema.tables where table_name = 'fp_preferenze') preferenze,
  (select string_agg(tgname, ',') from pg_trigger where tgrelid = 'rilievi_veloci'::regclass and not tgisinternal) trigger_rilievi,
  (select confdeltype from pg_constraint where conrelid = 'rilievo_veloce_voci'::regclass and contype = 'f' and confrelid = 'rilievi_veloci'::regclass) cascade_voci;
```
Expected: `colonne` 2, `preferenze` 1. Annotare nel registro `trigger_rilievi` (se un trigger riscrive `updated_at`, l'invio dal telefono resta corretto: alla ricezione la riga torna uguale) e `cascade_voci` (`c` = eliminare un rilievo elimina le voci; se non è `c`, il Task 4 elimina prima le voci).

- [ ] **Step 3: Tipi** — `types/rilievo-fp.ts`:

```ts
// Tipi del rilievo in cantiere con le strutture di FP PRO (fase 3).
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export type Lato = 'sinistra' | 'alto' | 'destra' | 'basso'

export interface RifFp {
  fpId: number
  descrizione: string
}

/** Contenuto di rilievo_veloce_voci.fp */
export interface VoceFpDati {
  strutturaId: string
  percorso: string
  nome: string
  serie: string
  larghezza: number | null
  altezza: number | null
  /** codice nodo -> mm: traversi dal basso, montanti da sinistra, all'asse del profilo */
  quote: Record<string, number>
  coloreInt: RifFp | null
  coloreEst: RifFp | null
  /** codice nodo del riempimento -> vetro scelto (assente = come la struttura) */
  vetri: Record<string, { fpId: number; codice: string }>
  /** `${codiceNodo}:${indiceKit}` -> scelto (solo kit opzionali) */
  kit: Record<string, boolean>
  mano: 'sx' | 'dx' | null
  /** lato -> codice profilo di telaio (assente = come la struttura) */
  telai: Partial<Record<Lato, string>>
}

export interface RilievoFp {
  id: string
  cliente: ClienteSnapshotRilievo
  note: string
  creatoAt: string
  aggiornatoAt: string
}

export interface VoceFp {
  id: string
  rilievoId: string
  ordine: number
  posizione: string
  quantita: number
  note: string
  fp: VoceFpDati
  aggiornatoAt: string
}

/** Righe nel telefono: daInviare = 1 finche' il server non le ha ricevute. */
export type RilievoLocale = RilievoFp & { daInviare: 0 | 1 }
export type VoceLocale = VoceFp & { daInviare: 0 | 1 }
export interface EliminatoFp {
  id: string
  tipo: 'rilievo' | 'voce'
}

export type TabellaCatalogoLocale = 'fp_strutture' | 'fp_colori' | 'fp_vetri' | 'fp_telai' | 'fp_serie'

export interface StrutturaLocale {
  id: string
  percorso: string
  cartella: string
  nome: string
  codice: string | null
  descrizione: string | null
  serie: string[]
  l_nominale: number | null
  h_nominale: number | null
  albero: NodoStruttura[]
  poligoni: number[][]
  immagine: string | null
  presente: boolean
  sincronizzato_at: string
}

export interface ColoreLocale { fp_id: number; descrizione: string; presente: boolean; sincronizzato_at: string }
export interface VetroLocale { fp_id: number; codice: string; descrizione: string | null; presente: boolean; sincronizzato_at: string }
export interface TelaioLocale { fp_id: number; serie_fp_id: number | null; codice: string; descrizione: string | null; presente: boolean; sincronizzato_at: string }
export interface SerieLocale { fp_id: number; nome: string; descrizione: string | null; presente: boolean; sincronizzato_at: string }

export interface PreferenzaFp {
  /** `${tipo}:${rif}` */
  id: string
  tipo: 'struttura' | 'colore' | 'vetro'
  rif: string
  ordine: number
}

export interface ImmagineLocale { path: string; blob: Blob }

/** Cursore di scaricamento per tabella: riparte da `da` se interrotto. */
export interface MetaFp { chiave: string; dopo: string | null; da: number; massimo: string | null }
```

- [ ] **Step 4: Controllo**

Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261011130000_rilievo_fp.sql types/rilievo-fp.ts
git commit -m "feat(rilievo-fp): colonna fp sulle voci, preferenze FP PRO e tipi"
```

---

### Task 2: Analisi della struttura (`lib/fppro/rilievo-fp.ts`)

**Files:**
- Create: `lib/fppro/rilievo-fp.ts`
- Test: `lib/fppro/rilievo-fp.test.ts`

**Interfaces:**
- Consumes: `NodoStruttura` (fase 2), `Lato`, `VoceFpDati` (Task 1); fixture `lib/fppro/__fixtures__/*.str.xml`.
- Produces:
  - `interface Divisione { codice: string; tipo: 'traverso' | 'montante'; nominale: number; etichetta: string }` e `divisioniStruttura(albero): Divisione[]`
  - `interface CampoRiempimento { codice: string; tipo: 'vetro' | 'pannello'; codiceDefault: string; etichetta: string }` e `campiRiempimento(albero): CampoRiempimento[]`
  - `interface KitOpzionale { chiave: string; codice: string; descrizione: string; predefinito: boolean }` e `kitOpzionali(albero): KitOpzionale[]`
  - `haAnteBattenti(albero): boolean`
  - `telaiStruttura(albero): Partial<Record<Lato, string>>`
  - `nuovaVoceFp(s: { id: string; percorso: string; nome: string; albero: NodoStruttura[] }, serie: string): VoceFpDati`
  - `problemiVoce(v: VoceFpDati, divisioni: Divisione[]): string[]`

- [ ] **Step 1: Test (falliscono)** — `lib/fppro/rilievo-fp.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from './strutture-xml'
import {
  campiRiempimento, divisioniStruttura, haAnteBattenti, kitOpzionali, nuovaVoceFp, problemiVoce, telaiStruttura,
} from './rilievo-fp'

const leggi = (nome: string) => strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
  new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '__fixtures__', nome))),
))
const ekos = leggi('ekos-2-ante.str.xml')
const al50 = leggi('al50plus-monoblocco.str.xml')

describe('divisioniStruttura', () => {
  it('finestra 2 ante: nessun traverso o montante', () => expect(divisioniStruttura(ekos.albero)).toEqual([]))
  it('monoblocco: traversi a 1050 e 2350 dal basso, montanti a 1223,5 da sinistra', () => {
    expect(divisioniStruttura(al50.albero)).toEqual([
      { codice: '3', tipo: 'traverso', nominale: 1050, etichetta: 'Traverso 1' },
      { codice: '4', tipo: 'montante', nominale: 1223.5, etichetta: 'Montante 1' },
      { codice: '5', tipo: 'traverso', nominale: 2350, etichetta: 'Traverso 2' },
      { codice: '7', tipo: 'montante', nominale: 1223.5, etichetta: 'Montante 2' },
    ])
  })
})

describe('campiRiempimento', () => {
  it('finestra 2 ante: due vetri con il codice della struttura', () => {
    expect(campiRiempimento(ekos.albero)).toEqual([
      { codice: '3', tipo: 'vetro', codiceDefault: '4_15_33.1_S+G', etichetta: 'Vetro 1' },
      { codice: '4', tipo: 'vetro', codiceDefault: '4_15_33.1_S+G', etichetta: 'Vetro 2' },
    ])
  })
  it('monoblocco: 2 pannelli e 4 vetri', () => {
    const c = campiRiempimento(al50.albero)
    expect(c.filter(x => x.tipo === 'pannello')).toHaveLength(2)
    expect(c.filter(x => x.tipo === 'vetro')).toHaveLength(4)
    expect(c.find(x => x.tipo === 'pannello')?.codiceDefault).toBe('30MM')
  })
})

describe('kit e ante', () => {
  it('kit opzionali con chiave nodo:indice e scelta di FP PRO', () => {
    const k = kitOpzionali(al50.albero)
    expect(k.length).toBeGreaterThan(0)
    expect(k.every(x => /^\d+:\d+$/.test(x.chiave))).toBe(true)
    expect(k.some(x => x.predefinito)).toBe(true)
    expect(k.some(x => !x.predefinito)).toBe(true)
  })
  it('ante battenti: si nella finestra, no nel monoblocco scorrevole', () => {
    expect(haAnteBattenti(ekos.albero)).toBe(true)
    expect(haAnteBattenti(al50.albero)).toBe(false)
  })
})

describe('telaiStruttura', () => {
  it('4 lati nella finestra', () => {
    expect(telaiStruttura(ekos.albero)).toEqual({
      sinistra: 'ES24500170', alto: 'ES24500170', destra: 'ES24500170', basso: 'ES24500170',
    })
  })
  it('3 lati nel monoblocco (sotto c\'e\' lo zoccolo)', () => {
    expect(telaiStruttura(al50.albero)).toEqual({ sinistra: 'TT51803', alto: 'TT51803', destra: 'TT51803' })
  })
})

describe('nuovaVoceFp e problemiVoce', () => {
  const voce = nuovaVoceFp({ id: 's1', percorso: 'ALM/x.STR', nome: 'x', albero: al50.albero }, 'AL_50PLU')

  it('voce nuova: kit come in FP PRO, il resto vuoto', () => {
    expect(voce).toMatchObject({ strutturaId: 's1', serie: 'AL_50PLU', larghezza: null, quote: {}, vetri: {}, telai: {}, mano: null })
    expect(Object.values(voce.kit).some(Boolean)).toBe(true)
  })
  it('senza misure: due problemi', () => {
    expect(problemiVoce(voce, [])).toEqual(['Manca la larghezza', 'Manca l\'altezza'])
  })
  it('quota di un traverso oltre l\'altezza', () => {
    const div = divisioniStruttura(al50.albero)
    expect(problemiVoce({ ...voce, larghezza: 2400, altezza: 2800, quote: { 3: 3000, 4: 1200 } }, div))
      .toEqual(['Traverso 1: quota fuori dal telaio'])
  })
})
```

Run: `npx vitest run lib/fppro/rilievo-fp.test.ts` → FAIL, modulo non trovato.

- [ ] **Step 2: Implementazione** — `lib/fppro/rilievo-fp.ts`:

```ts
// Analisi di una struttura di FP PRO per il rilievo in cantiere (solo app).
import type { Lato, VoceFpDati } from '@/types/rilievo-fp'
import type { NodoStruttura } from './strutture-xml'

const LATI_TELAIO: Lato[] = ['sinistra', 'alto', 'destra', 'basso']

const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])
const nomeDxf = (dxf: string) => dxf.slice(dxf.lastIndexOf('\\') + 1).replace(/\.dxf$/i, '')

export interface Divisione {
  codice: string
  tipo: 'traverso' | 'montante'
  /** Posizione dell'asse nella struttura di FP PRO: y dal basso (traverso), x da sinistra (montante) */
  nominale: number
  etichetta: string
}

export function divisioniStruttura(albero: NodoStruttura[]): Divisione[] {
  let traversi = 0
  let montanti = 0
  const out: Divisione[] = []
  for (const n of tutti(albero)) {
    if (n.tipo === 8070 && n.y !== null) {
      out.push({ codice: String(n.codice), tipo: 'traverso', nominale: n.y, etichetta: `Traverso ${++traversi}` })
    } else if (n.tipo === 8060 && n.x !== null) {
      out.push({ codice: String(n.codice), tipo: 'montante', nominale: n.x, etichetta: `Montante ${++montanti}` })
    }
  }
  return out
}

export interface CampoRiempimento {
  codice: string
  tipo: 'vetro' | 'pannello'
  codiceDefault: string
  etichetta: string
}

export function campiRiempimento(albero: NodoStruttura[]): CampoRiempimento[] {
  let vetri = 0
  let pannelli = 0
  const out: CampoRiempimento[] = []
  for (const n of tutti(albero)) {
    const pezzo = n.pezzi.find(p => p.tipo === 8510 || p.tipo === 8500)
    if (!pezzo) continue
    const vetro = pezzo.tipo === 8510
    out.push({
      codice: String(n.codice),
      tipo: vetro ? 'vetro' : 'pannello',
      codiceDefault: nomeDxf(pezzo.dxf),
      etichetta: vetro ? `Vetro ${++vetri}` : `Pannello ${++pannelli}`,
    })
  }
  return out
}

export interface KitOpzionale {
  chiave: string
  codice: string
  descrizione: string
  /** Scelto nella struttura di FP PRO */
  predefinito: boolean
}

export function kitOpzionali(albero: NodoStruttura[]): KitOpzionale[] {
  const out: KitOpzionale[] = []
  for (const n of tutti(albero)) {
    n.kit.forEach((k, i) => {
      if (k.opzionale) out.push({ chiave: `${n.codice}:${i}`, codice: k.codice, descrizione: k.descrizione, predefinito: k.confermato })
    })
  }
  return out
}

export function haAnteBattenti(albero: NodoStruttura[]): boolean {
  return tutti(albero).some(n => n.tipo === 8610)
}

/** Profili del telaio esterno, nell'ordine in cui FP PRO li salva: sinistra, alto, destra, basso. */
export function telaiStruttura(albero: NodoStruttura[]): Partial<Record<Lato, string>> {
  const telaio = tutti(albero).find(n => n.tipo === 8600)
  const pezzi = telaio?.pezzi.filter(p => p.tipo === 8050) ?? []
  const out: Partial<Record<Lato, string>> = {}
  pezzi.slice(0, 4).forEach((p, i) => { out[LATI_TELAIO[i]] = nomeDxf(p.dxf) })
  return out
}

export function nuovaVoceFp(
  s: { id: string; percorso: string; nome: string; albero: NodoStruttura[] },
  serie: string,
): VoceFpDati {
  return {
    strutturaId: s.id,
    percorso: s.percorso,
    nome: s.nome,
    serie,
    larghezza: null,
    altezza: null,
    quote: {},
    coloreInt: null,
    coloreEst: null,
    vetri: {},
    kit: Object.fromEntries(kitOpzionali(s.albero).map(k => [k.chiave, k.predefinito])),
    mano: null,
    telai: {},
  }
}

export function problemiVoce(v: VoceFpDati, divisioni: Divisione[]): string[] {
  const problemi: string[] = []
  if (!v.larghezza || v.larghezza <= 0) problemi.push('Manca la larghezza')
  if (!v.altezza || v.altezza <= 0) problemi.push('Manca l\'altezza')
  for (const d of divisioni) {
    const q = v.quote[d.codice]
    if (q === undefined) continue
    const limite = d.tipo === 'traverso' ? v.altezza : v.larghezza
    if (q <= 0 || (limite !== null && limite > 0 && q >= limite)) problemi.push(`${d.etichetta}: quota fuori dal telaio`)
  }
  return problemi
}
```

- [ ] **Step 3:** `npx vitest run lib/fppro/rilievo-fp.test.ts` → PASS. Se i codici dei nodi o i conteggi differiscono, ricontrollare sul fixture (`grep -n 'ElementType="80[67]0"'`) prima di toccare il codice.

- [ ] **Step 4: Commit**

```bash
git add lib/fppro/rilievo-fp.ts lib/fppro/rilievo-fp.test.ts
git commit -m "feat(rilievo-fp): divisioni, vetri, kit e telai di una struttura"
```

---

### Task 3: Disegno che segue le misure (`lib/fppro/disegno-voce.ts`)

**Files:**
- Create: `lib/fppro/disegno-voce.ts`
- Test: `lib/fppro/disegno-voce.test.ts`

**Interfaces:**
- Consumes: `divisioniStruttura` (Task 2), `VoceFpDati` (Task 1).
- Produces: `ZONA_BORDO = 150`, `MEZZA_ZONA = 75`, `mappaAsse(nominale: number, reale: number, ancore: { nominale: number; reale: number }[]): (v: number) => number`, `interface DisegnoVoce { viewBox: string; larghezza: number; altezza: number; profili: string[] }`, `disegnoVoce(s: { albero: NodoStruttura[]; poligoni: number[][]; l_nominale: number | null; h_nominale: number | null }, v: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'>): DisegnoVoce | null`.

- [ ] **Step 1: Test (falliscono)** — `lib/fppro/disegno-voce.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml } from './strutture-xml'
import { disegnoVoce, mappaAsse } from './disegno-voce'

const leggi = (nome: string) => {
  const s = strutturaDaXml(new XMLParser(OPZIONI_XML).parse(
    new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '__fixtures__', nome))),
  ))
  return { albero: s.albero, poligoni: s.poligoni, l_nominale: s.lNominale, h_nominale: s.hNominale }
}

describe('mappaAsse', () => {
  it('bordo rigido, centro che si allunga', () => {
    const f = mappaAsse(1000, 2000, [])
    expect([f(0), f(150), f(500), f(850), f(1000)]).toEqual([0, 150, 1000, 1850, 2000])
  })
  it('una divisione va alla quota e resta larga uguale', () => {
    const f = mappaAsse(1000, 2000, [{ nominale: 500, reale: 700 }])
    expect([f(425), f(500), f(575)]).toEqual([625, 700, 775])
  })
  it('misure troppo piccole per le zone rigide: riduzione uniforme', () => {
    expect(mappaAsse(1000, 200, [])(500)).toBe(100)
  })
  it('divisione che invade il bordo: riduzione uniforme', () => {
    expect(mappaAsse(1000, 2000, [{ nominale: 500, reale: 100 }])(500)).toBe(1000)
  })
})

describe('disegnoVoce', () => {
  it('alle misure della struttura il disegno non cambia (y capovolta)', () => {
    const d = disegnoVoce(leggi('ekos-2-ante.str.xml'), { larghezza: null, altezza: null, quote: {} })
    expect(d?.profili).toHaveLength(13)
    expect(d?.profili[0]).toBe('0,1500 0,0 50,50 50,1450')
    expect([d?.larghezza, d?.altezza]).toEqual([1300, 1500])
  })
  it('monoblocco 3000 x 3000 con il traverso basso a 1200: profili spessi uguali', () => {
    const d = disegnoVoce(leggi('al50plus-monoblocco.str.xml'), { larghezza: 3000, altezza: 3000, quote: { 3: 1200 } })!
    expect(d.viewBox).toBe('-60 -60 3120 3120')
    const tutto = d.profili.join(' ')
    expect(tutto).toContain(',1775')   // bordo alto del traverso: 3000 - (1200 + 25)
    expect(tutto).toContain('2950,')   // telaio destro sempre largo 50
  })
  it('struttura senza anteprima: niente disegno', () => {
    expect(disegnoVoce({ albero: [], poligoni: [], l_nominale: 1000, h_nominale: 1000 }, { larghezza: 1, altezza: 1, quote: {} })).toBeNull()
  })
})
```

Run: `npx vitest run lib/fppro/disegno-voce.test.ts` → FAIL, modulo non trovato.

- [ ] **Step 2: Implementazione** — `lib/fppro/disegno-voce.ts`:

```ts
// Disegno della voce: i poligoni della struttura adattati alle misure del rilievo.
import type { VoceFpDati } from '@/types/rilievo-fp'
import { divisioniStruttura } from './rilievo-fp'
import type { NodoStruttura } from './strutture-xml'

/** Fascia lungo il bordo che si sposta senza deformarsi (telaio, anta, fermavetro). */
export const ZONA_BORDO = 150
/** Mezza fascia rigida attorno all'asse di un traverso o montante. */
export const MEZZA_ZONA = 75

const tondo = (n: number) => Math.round(n * 10) / 10

/**
 * Mappa a tratti di un asse: zone rigide al bordo e attorno alle divisioni, tratti
 * intermedi (i vetri) che si allungano. Se le zone non ci stanno: riduzione uniforme.
 */
export function mappaAsse(
  nominale: number,
  reale: number,
  ancore: { nominale: number; reale: number }[],
): (v: number) => number {
  const uniforme = (v: number) => (nominale > 0 ? (v * reale) / nominale : v)
  if (nominale <= 2 * ZONA_BORDO || reale <= 2 * ZONA_BORDO) return uniforme
  const punti: [number, number][] = [
    [0, 0], [ZONA_BORDO, ZONA_BORDO],
    [nominale - ZONA_BORDO, reale - ZONA_BORDO], [nominale, reale],
  ]
  for (const a of ancore) punti.push([a.nominale - MEZZA_ZONA, a.reale - MEZZA_ZONA], [a.nominale + MEZZA_ZONA, a.reale + MEZZA_ZONA])
  punti.sort((p, q) => p[0] - q[0])
  for (let i = 1; i < punti.length; i++) {
    if (punti[i][0] <= punti[i - 1][0] || punti[i][1] < punti[i - 1][1]) return uniforme
  }
  return v => {
    if (v <= 0) return v
    for (let i = 1; i < punti.length; i++) {
      const [x0, y0] = punti[i - 1]
      const [x1, y1] = punti[i]
      if (v <= x1) return y0 + ((v - x0) * (y1 - y0)) / (x1 - x0)
    }
    return v - nominale + reale
  }
}

export interface DisegnoVoce {
  viewBox: string
  larghezza: number
  altezza: number
  /** Punti SVG (y verso il basso) di ogni profilo */
  profili: string[]
}

export function disegnoVoce(
  s: { albero: NodoStruttura[]; poligoni: number[][]; l_nominale: number | null; h_nominale: number | null },
  v: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'>,
): DisegnoVoce | null {
  if (s.poligoni.length === 0 || !s.l_nominale || !s.h_nominale) return null
  const xs = s.poligoni.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = s.poligoni.flatMap(p => p.filter((_, i) => i % 2 === 1))
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const L0 = s.l_nominale
  const H0 = s.h_nominale
  const L = v.larghezza && v.larghezza > 0 ? v.larghezza : L0
  const H = v.altezza && v.altezza > 0 ? v.altezza : H0

  // Due montanti alla stessa x (in zone diverse della struttura) sono un'unica ancora.
  const divisioni = divisioniStruttura(s.albero)
  const ancore = (tipo: 'traverso' | 'montante', nom: number, rea: number) => {
    const viste = new Set<number>()
    const out: { nominale: number; reale: number }[] = []
    for (const d of divisioni.filter(x => x.tipo === tipo)) {
      const k = Math.round(d.nominale)
      if (viste.has(k)) continue
      viste.add(k)
      out.push({ nominale: d.nominale, reale: v.quote[d.codice] ?? (d.nominale * rea) / nom })
    }
    return out
  }
  const fx = mappaAsse(L0, L, ancore('montante', L0, L))
  const fy = mappaAsse(H0, H, ancore('traverso', H0, H))

  const profili = s.poligoni.map(p => {
    const coppie: string[] = []
    for (let i = 0; i < p.length; i += 2) coppie.push(`${tondo(fx(p[i] - x0))},${tondo(H - fy(p[i + 1] - y0))}`)
    return coppie.join(' ')
  })
  const margine = Math.max(5, Math.round(Math.min(L, H) * 0.02))
  return { viewBox: `${-margine} ${-margine} ${L + 2 * margine} ${H + 2 * margine}`, larghezza: L, altezza: H, profili }
}
```

- [ ] **Step 3:** `npx vitest run lib/fppro/disegno-voce.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/fppro/disegno-voce.ts lib/fppro/disegno-voce.test.ts
git commit -m "feat(rilievo-fp): disegno della voce che segue misure e quote"
```

---

### Task 4: Regole di unione, Dexie, azioni server

**Files:**
- Create: `lib/fppro/sync-rilievi.ts` (+ test), `lib/rilievo-fp-locale.ts`, `actions/rilievo-fp.ts`
- Modify: `lib/db.ts` (versione 6)

**Interfaces:**
- Consumes: tipi del Task 1; `createClient`, `getOrgId`, `selectAll`.
- Produces:
  - `remotiDaApplicare<T extends ConData>(locali: Map<string, ConData>, remoti: T[]): T[]`, `inviateConfermate(inviate: ConData[], attuali: Map<string, ConData>): string[]`, `interface ConData { id: string; aggiornatoAt: string; daInviare?: number }`
  - tabelle Dexie `fpStrutture`, `fpImmagini`, `fpColori`, `fpVetri`, `fpTelai`, `fpSerie`, `fpPreferenze`, `fpMeta`, `rilieviFp`, `vociFp`, `eliminatiFp`
  - `lib/rilievo-fp-locale.ts`: `creaRilievoLocale(cliente: ClienteSnapshotRilievo, note: string): Promise<string>`, `salvaRilievoLocale(r: RilievoFp): Promise<void>`, `salvaVoceLocale(v: VoceFp): Promise<void>`, `eliminaVoceLocale(id: string): Promise<void>`, `eliminaRilievoLocale(id: string): Promise<void>`
  - `actions/rilievo-fp.ts`: `scaricaCatalogo(tabella: TabellaCatalogoLocale, dopo: string | null, da: number): Promise<{ righe: unknown[]; fine: boolean } | { errore: string }>`, `firmeImmagini(paths: string[]): Promise<{ url: Record<string, string> } | { errore: string }>`, `inviaRilieviFp(p: { rilievi: RilievoFp[]; voci: VoceFp[]; eliminati: EliminatoFp[] }): Promise<{ ok: true } | { errore: string }>`, `getRilieviFp(dopo: string | null): Promise<{ rilievi: RilievoFp[]; voci: VoceFp[] } | { errore: string }>`, `getPreferenzeFp(): Promise<PreferenzaFp[] | { errore: string }>`, `impostaPreferenzaFp(tipo: PreferenzaFp['tipo'], rif: string, attiva: boolean): Promise<{ ok: true } | { errore: string }>`

- [ ] **Step 1: Test delle regole (falliscono)** — `lib/fppro/sync-rilievi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { inviateConfermate, remotiDaApplicare } from './sync-rilievi'

const m = (righe: { id: string; aggiornatoAt: string; daInviare?: number }[]) => new Map(righe.map(r => [r.id, r]))

describe('remotiDaApplicare', () => {
  it('nuove e piu\' recenti si applicano, vecchie no', () => {
    const locali = m([{ id: 'a', aggiornatoAt: '2026-10-11T10:00:00Z' }, { id: 'b', aggiornatoAt: '2026-10-11T10:00:00Z' }])
    const r = remotiDaApplicare(locali, [
      { id: 'a', aggiornatoAt: '2026-10-11T11:00:00Z' },
      { id: 'b', aggiornatoAt: '2026-10-11T09:00:00Z' },
      { id: 'c', aggiornatoAt: '2026-10-11T08:00:00Z' },
    ])
    expect(r.map(x => x.id)).toEqual(['a', 'c'])
  })
  it('una modifica locale non inviata e piu\' recente non viene mai sovrascritta', () => {
    const locali = m([{ id: 'a', aggiornatoAt: '2026-10-11T12:00:00Z', daInviare: 1 }])
    expect(remotiDaApplicare(locali, [{ id: 'a', aggiornatoAt: '2026-10-11T11:00:00Z' }])).toEqual([])
  })
})

describe('inviateConfermate', () => {
  it('se la voce e\' cambiata durante l\'invio resta da inviare', () => {
    const inviate = [{ id: 'a', aggiornatoAt: 't1' }, { id: 'b', aggiornatoAt: 't1' }]
    const attuali = m([{ id: 'a', aggiornatoAt: 't1' }, { id: 'b', aggiornatoAt: 't2' }])
    expect(inviateConfermate(inviate, attuali)).toEqual(['a'])
  })
})
```

Run → FAIL (modulo non trovato).

- [ ] **Step 2: Implementazione** — `lib/fppro/sync-rilievi.ts`:

```ts
// Regole di unione tra rilievi del telefono e del server: vince il piu' recente.

export interface ConData {
  id: string
  aggiornatoAt: string
  daInviare?: number
}

/** Righe arrivate dal server da salvare nel telefono: nuove o piu' recenti, mai sopra una modifica locale non inviata piu' recente. */
export function remotiDaApplicare<T extends ConData>(locali: Map<string, ConData>, remoti: T[]): T[] {
  return remoti.filter(r => {
    const l = locali.get(r.id)
    if (!l) return true
    if (l.daInviare && l.aggiornatoAt >= r.aggiornatoAt) return false
    return r.aggiornatoAt > l.aggiornatoAt
  })
}

/** Tra le righe inviate, quelle da segnare "inviate": solo se nel frattempo non sono cambiate. */
export function inviateConfermate(inviate: ConData[], attuali: Map<string, ConData>): string[] {
  return inviate.filter(i => attuali.get(i.id)?.aggiornatoAt === i.aggiornatoAt).map(i => i.id)
}
```

Run: `npx vitest run lib/fppro/sync-rilievi.test.ts` → PASS.

- [ ] **Step 3: Dexie v6** — in `lib/db.ts`: importare i tipi da `@/types/rilievo-fp`; aggiungere alla classe:

```ts
  fpStrutture!: EntityTable<StrutturaLocale, 'id'>
  fpImmagini!: EntityTable<ImmagineLocale, 'path'>
  fpColori!: EntityTable<ColoreLocale, 'fp_id'>
  fpVetri!: EntityTable<VetroLocale, 'fp_id'>
  fpTelai!: EntityTable<TelaioLocale, 'fp_id'>
  fpSerie!: EntityTable<SerieLocale, 'fp_id'>
  fpPreferenze!: EntityTable<PreferenzaFp, 'id'>
  fpMeta!: EntityTable<MetaFp, 'chiave'>
  rilieviFp!: EntityTable<RilievoLocale, 'id'>
  vociFp!: EntityTable<VoceLocale, 'id'>
  eliminatiFp!: EntityTable<EliminatoFp, 'id'>
```

e dopo `this.version(5)`:

```ts
    // Fase 3: catalogo FP PRO nel telefono e rilievi che funzionano senza rete.
    this.version(6).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
    })
```

- [ ] **Step 4: Operazioni locali** — `lib/rilievo-fp-locale.ts`:

```ts
// Scritture del rilievo in cantiere nel telefono: ogni modifica e' "da inviare".
import { db } from '@/lib/db'
import type { RilievoFp, VoceFp } from '@/types/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

const adesso = () => new Date().toISOString()

export async function creaRilievoLocale(cliente: ClienteSnapshotRilievo, note: string): Promise<string> {
  const id = crypto.randomUUID()
  const ora = adesso()
  await db.rilieviFp.put({ id, cliente, note, creatoAt: ora, aggiornatoAt: ora, daInviare: 1 })
  return id
}

export async function salvaRilievoLocale(r: RilievoFp): Promise<void> {
  await db.rilieviFp.put({ ...r, aggiornatoAt: adesso(), daInviare: 1 })
}

export async function salvaVoceLocale(v: VoceFp): Promise<void> {
  await db.transaction('rw', db.vociFp, db.rilieviFp, async () => {
    const ora = adesso()
    await db.vociFp.put({ ...v, aggiornatoAt: ora, daInviare: 1 })
    // Il rilievo va inviato prima delle sue voci: lo si segna anche lui.
    const r = await db.rilieviFp.get(v.rilievoId)
    if (r && !r.daInviare) await db.rilieviFp.update(v.rilievoId, { daInviare: 1 })
  })
}

export async function eliminaVoceLocale(id: string): Promise<void> {
  await db.transaction('rw', db.vociFp, db.eliminatiFp, async () => {
    await db.vociFp.delete(id)
    await db.eliminatiFp.put({ id, tipo: 'voce' })
  })
}

export async function eliminaRilievoLocale(id: string): Promise<void> {
  await db.transaction('rw', db.vociFp, db.rilieviFp, db.eliminatiFp, async () => {
    const voci = await db.vociFp.where('rilievoId').equals(id).primaryKeys()
    await db.vociFp.bulkDelete(voci)
    await db.eliminatiFp.bulkPut(voci.map(v => ({ id: v, tipo: 'voce' as const })))
    await db.rilieviFp.delete(id)
    await db.eliminatiFp.put({ id, tipo: 'rilievo' })
  })
}
```

- [ ] **Step 5: Azioni server** — `actions/rilievo-fp.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import type { EliminatoFp, PreferenzaFp, RilievoFp, TabellaCatalogoLocale, VoceFp, VoceFpDati } from '@/types/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

const PAGINA = 200
const messaggio = (e: unknown, riserva: string) => (e instanceof Error ? e.message : riserva)

const UTILIZZO_TELAIO = Array.from({ length: 10 }, (_, i) => `dati->>utilizzo${i + 1}.eq.8050`).join(',')

/** Catalogo per il telefono, a pagine e solo righe cambiate dopo `dopo`. */
export async function scaricaCatalogo(
  tabella: TabellaCatalogoLocale,
  dopo: string | null,
  da: number,
): Promise<{ righe: unknown[]; fine: boolean } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const base = (nome: string, campi: string) => {
      let q = supabase.from(nome).select(campi).eq('organization_id', orgId)
      if (dopo) q = q.gt('sincronizzato_at', dopo)
      return q
    }
    const query =
      tabella === 'fp_strutture'
        ? base('fp_strutture', 'id, percorso, cartella, nome, codice, descrizione, serie, l_nominale, h_nominale, albero, poligoni, immagine, presente, sincronizzato_at').is('errore', null)
        : tabella === 'fp_colori'
          ? base('fp_colori', 'fp_id, descrizione, presente, sincronizzato_at').eq('per_profili', true)
          : tabella === 'fp_vetri'
            ? base('fp_vetri', 'fp_id, codice, descrizione, presente, sincronizzato_at')
            : tabella === 'fp_telai'
              ? base('fp_profili', 'fp_id, serie_fp_id, codice, descrizione, presente, sincronizzato_at').or(UTILIZZO_TELAIO)
              : base('fp_serie', 'fp_id, nome, descrizione, presente, sincronizzato_at')
    const chiave = tabella === 'fp_strutture' ? 'id' : 'fp_id'
    const { data, error } = await query.order('sincronizzato_at').order(chiave).range(da, da + PAGINA - 1)
    if (error) return { errore: error.message }
    return { righe: data ?? [], fine: (data ?? []).length < PAGINA }
  } catch (e) {
    return { errore: messaggio(e, 'Scaricamento non riuscito') }
  }
}

export async function firmeImmagini(paths: string[]): Promise<{ url: Record<string, string> } | { errore: string }> {
  try {
    if (paths.length === 0) return { url: {} }
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from('fp-strutture').createSignedUrls(paths.slice(0, 200), 3600)
    if (error) return { errore: error.message }
    const url: Record<string, string> = {}
    for (const d of data ?? []) if (d.path && d.signedUrl) url[d.path] = d.signedUrl
    return { url }
  } catch (e) {
    return { errore: messaggio(e, 'Immagini non disponibili') }
  }
}

type RigaRilievo = { id: string; cliente_snapshot: ClienteSnapshotRilievo; note: string | null; created_at: string; updated_at: string }
type RigaVoce = { id: string; rilievo_id: string; ordine: number; voce: string | null; quantita: number; note: string | null; fp: VoceFpDati; updated_at: string }

/** Invio dal telefono: upsert per id, vince il piu' recente; poi le eliminazioni. */
export async function inviaRilieviFp(p: { rilievi: RilievoFp[]; voci: VoceFp[]; eliminati: EliminatoFp[] }): Promise<{ ok: true } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()

    const piuRecenti = async <T extends { id: string; aggiornatoAt: string }>(tabella: string, righe: T[]) => {
      if (righe.length === 0) return righe
      const { data, error } = await supabase.from(tabella).select('id, updated_at').in('id', righe.map(r => r.id))
      if (error) throw new Error(error.message)
      const server = new Map((data ?? []).map(d => [d.id as string, d.updated_at as string]))
      return righe.filter(r => !server.has(r.id) || new Date(r.aggiornatoAt) > new Date(server.get(r.id)!))
    }

    const rilievi = await piuRecenti('rilievi_veloci', p.rilievi)
    if (rilievi.length > 0) {
      const { error } = await supabase.from('rilievi_veloci').upsert(rilievi.map(r => ({
        id: r.id, organization_id: orgId, cliente_snapshot: r.cliente, note: r.note || null,
        created_at: r.creatoAt, updated_at: r.aggiornatoAt,
      })))
      if (error) return { errore: error.message }
    }
    const voci = await piuRecenti('rilievo_veloce_voci', p.voci)
    if (voci.length > 0) {
      const { error } = await supabase.from('rilievo_veloce_voci').upsert(voci.map(v => ({
        id: v.id, rilievo_id: v.rilievoId, organization_id: orgId, ordine: v.ordine, voce: v.posizione || null,
        quantita: v.quantita, note: v.note || null, fp: v.fp, updated_at: v.aggiornatoAt,
      })))
      if (error) return { errore: error.message }
    }
    const vociEliminate = p.eliminati.filter(e => e.tipo === 'voce').map(e => e.id)
    if (vociEliminate.length > 0) {
      const { error } = await supabase.from('rilievo_veloce_voci').delete().eq('organization_id', orgId).in('id', vociEliminate)
      if (error) return { errore: error.message }
    }
    const rilieviEliminati = p.eliminati.filter(e => e.tipo === 'rilievo').map(e => e.id)
    if (rilieviEliminati.length > 0) {
      const { error } = await supabase.from('rilievi_veloci').delete().eq('organization_id', orgId).in('id', rilieviEliminati)
      if (error) return { errore: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Invio non riuscito') }
  }
}

/** Rilievi e voci (solo quelle nuove, con fp) cambiati dopo `dopo`, per il telefono. */
export async function getRilieviFp(dopo: string | null): Promise<{ rilievi: RilievoFp[]; voci: VoceFp[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const rilievi = await selectAll<RigaRilievo>((da, a) => {
      let q = supabase.from('rilievi_veloci').select('id, cliente_snapshot, note, created_at, updated_at').eq('organization_id', orgId)
      if (dopo) q = q.gt('updated_at', dopo)
      return q.order('id').range(da, a)
    })
    const voci = await selectAll<RigaVoce>((da, a) => {
      let q = supabase.from('rilievo_veloce_voci').select('id, rilievo_id, ordine, voce, quantita, note, fp, updated_at')
        .eq('organization_id', orgId).not('fp', 'is', null)
      if (dopo) q = q.gt('updated_at', dopo)
      return q.order('id').range(da, a)
    })
    return {
      rilievi: rilievi.map(r => ({ id: r.id, cliente: r.cliente_snapshot, note: r.note ?? '', creatoAt: r.created_at, aggiornatoAt: r.updated_at })),
      voci: voci.map(v => ({ id: v.id, rilievoId: v.rilievo_id, ordine: v.ordine, posizione: v.voce ?? '', quantita: v.quantita, note: v.note ?? '', fp: v.fp, aggiornatoAt: v.updated_at })),
    }
  } catch (e) {
    return { errore: messaggio(e, 'Rilievi non disponibili') }
  }
}

export async function getPreferenzeFp(): Promise<PreferenzaFp[] | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data, error } = await supabase.from('fp_preferenze').select('tipo, rif, ordine').eq('organization_id', orgId)
    if (error) return { errore: error.message }
    return (data ?? []).map(p => ({ id: `${p.tipo}:${p.rif}`, tipo: p.tipo as PreferenzaFp['tipo'], rif: p.rif, ordine: p.ordine }))
  } catch (e) {
    return { errore: messaggio(e, 'Preferenze non disponibili') }
  }
}

export async function impostaPreferenzaFp(tipo: PreferenzaFp['tipo'], rif: string, attiva: boolean): Promise<{ ok: true } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { error } = attiva
      ? await supabase.from('fp_preferenze').upsert({ organization_id: orgId, tipo, rif }, { onConflict: 'organization_id,tipo,rif' })
      : await supabase.from('fp_preferenze').delete().eq('organization_id', orgId).eq('tipo', tipo).eq('rif', rif)
    if (error) return { errore: error.message }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Preferenza non salvata') }
  }
}
```

Se nel Task 1 `cascade_voci` non è `c`: in `inviaRilieviFp`, prima di eliminare i rilievi eliminare le loro voci (`.in('rilievo_id', rilieviEliminati)`).

- [ ] **Step 6: Controllo e commit**

Run: `npx tsc --noEmit && npx vitest run lib/fppro && npx eslint lib/db.ts lib/rilievo-fp-locale.ts actions/rilievo-fp.ts lib/fppro/sync-rilievi.ts` → tutto pulito.

```bash
git add lib/fppro/sync-rilievi.ts lib/fppro/sync-rilievi.test.ts lib/db.ts lib/rilievo-fp-locale.ts actions/rilievo-fp.ts
git commit -m "feat(rilievo-fp): archivio nel telefono, regole di unione e azioni di invio"
```

---

### Task 5: Motori di scaricamento e invio

**Files:**
- Create: `hooks/useCatalogoLocale.ts`, `hooks/useInvioRilievi.ts`

**Interfaces:**
- Consumes: azioni e Dexie del Task 4; `remotiDaApplicare`, `inviateConfermate`.
- Produces: `useCatalogoLocale(): { stato: StatoCatalogo; aggiorna: () => Promise<void> }` con `StatoCatalogo = { fase: 'fermo' | 'dati' | 'immagini' | 'errore'; fatte: number; messaggio: string | null; ultimo: string | null }`; `useInvioRilievi(): { daInviare: number; invia: () => Promise<void>; errore: string | null }`.

- [ ] **Step 1: `hooks/useCatalogoLocale.ts`**

```ts
'use client'

// Copia del catalogo FP PRO nel telefono: a pagine, solo differenze, riprende se interrotta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { firmeImmagini, scaricaCatalogo } from '@/actions/rilievo-fp'
import type { StrutturaLocale, TabellaCatalogoLocale } from '@/types/rilievo-fp'

export interface StatoCatalogo {
  fase: 'fermo' | 'dati' | 'immagini' | 'errore'
  fatte: number
  messaggio: string | null
  ultimo: string | null
}

const TABELLE: TabellaCatalogoLocale[] = ['fp_serie', 'fp_colori', 'fp_vetri', 'fp_telai', 'fp_strutture']
const BLOCCO_IMMAGINI = 50

function tabellaLocale(t: TabellaCatalogoLocale) {
  switch (t) {
    case 'fp_strutture': return db.fpStrutture
    case 'fp_colori': return db.fpColori
    case 'fp_vetri': return db.fpVetri
    case 'fp_telai': return db.fpTelai
    default: return db.fpSerie
  }
}

export function useCatalogoLocale() {
  const [stato, setStato] = useState<StatoCatalogo>({ fase: 'fermo', fatte: 0, messaggio: null, ultimo: null })
  const inCorso = useRef(false)

  const aggiorna = useCallback(async () => {
    if (inCorso.current || !navigator.onLine) return
    inCorso.current = true
    let fatte = 0
    try {
      await navigator.storage?.persist?.()
      setStato(s => ({ ...s, fase: 'dati', fatte: 0, messaggio: null }))
      for (const tabella of TABELLE) {
        const chiave = `cursore:${tabella}`
        const meta = await db.fpMeta.get(chiave)
        const dopo = meta?.dopo ?? null
        let da = meta?.da ?? 0
        let massimo = meta?.massimo ?? dopo
        for (;;) {
          const r = await scaricaCatalogo(tabella, dopo, da)
          if ('errore' in r) throw new Error(r.errore)
          const righe = r.righe as { sincronizzato_at: string }[]
          await tabellaLocale(tabella).bulkPut(righe as never[])
          if (tabella === 'fp_strutture') {
            // Struttura cambiata: la sua immagine va riscaricata.
            const percorsi = (righe as unknown as StrutturaLocale[]).map(s => s.immagine).filter((p): p is string => !!p)
            await db.fpImmagini.bulkDelete(percorsi)
          }
          for (const x of righe) if (!massimo || x.sincronizzato_at > massimo) massimo = x.sincronizzato_at
          da += righe.length
          fatte += righe.length
          setStato(s => ({ ...s, fatte }))
          if (r.fine) break
          await db.fpMeta.put({ chiave, dopo, da, massimo })
        }
        await db.fpMeta.put({ chiave, dopo: massimo, da: 0, massimo })
      }

      setStato(s => ({ ...s, fase: 'immagini' }))
      const servono = (await db.fpStrutture.orderBy('immagine').uniqueKeys()) as string[]
      const presenti = new Set((await db.fpImmagini.toCollection().primaryKeys()) as string[])
      const mancanti = servono.filter(p => p && !presenti.has(p))
      for (let i = 0; i < mancanti.length; i += BLOCCO_IMMAGINI) {
        const blocco = mancanti.slice(i, i + BLOCCO_IMMAGINI)
        const firme = await firmeImmagini(blocco)
        if ('errore' in firme) throw new Error(firme.errore)
        const scaricate = await Promise.all(blocco.map(async path => {
          const url = firme.url[path]
          if (!url) return null
          const risposta = await fetch(url)
          return risposta.ok ? { path, blob: await risposta.blob() } : null
        }))
        await db.fpImmagini.bulkPut(scaricate.filter((x): x is { path: string; blob: Blob } => x !== null))
        fatte += blocco.length
        setStato(s => ({ ...s, fatte }))
      }
      const ultimo = new Date().toISOString()
      await db.fpMeta.put({ chiave: 'catalogo:ultimo', dopo: ultimo, da: 0, massimo: null })
      setStato({ fase: 'fermo', fatte, messaggio: null, ultimo })
    } catch (e) {
      setStato(s => ({ ...s, fase: 'errore', messaggio: e instanceof Error ? e.message : 'Scaricamento non riuscito' }))
    } finally {
      inCorso.current = false
    }
  }, [])

  useEffect(() => {
    let attivo = true
    db.fpMeta.get('catalogo:ultimo').then(m => {
      if (attivo && m?.dopo) setStato(s => ({ ...s, ultimo: m.dopo }))
    })
    void aggiorna()
    window.addEventListener('online', aggiorna)
    return () => {
      attivo = false
      window.removeEventListener('online', aggiorna)
    }
  }, [aggiorna])

  return { stato, aggiorna }
}
```

- [ ] **Step 2: `hooks/useInvioRilievi.ts`**

```ts
'use client'

// Invio dei rilievi fatti nel telefono e ricezione di quelli fatti altrove.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { getRilieviFp, inviaRilieviFp } from '@/actions/rilievo-fp'
import { inviateConfermate, remotiDaApplicare } from '@/lib/fppro/sync-rilievi'

const OGNI_MS = 60_000
const BLOCCO_VOCI = 100

export function useInvioRilievi() {
  const [errore, setErrore] = useState<string | null>(null)
  const inCorso = useRef(false)
  const daInviare = useLiveQuery(async () =>
    (await db.rilieviFp.where('daInviare').equals(1).count()) +
    (await db.vociFp.where('daInviare').equals(1).count()) +
    (await db.eliminatiFp.count()), [], 0)

  const invia = useCallback(async () => {
    if (inCorso.current || !navigator.onLine) return
    inCorso.current = true
    try {
      const rilievi = await db.rilieviFp.where('daInviare').equals(1).toArray()
      const voci = await db.vociFp.where('daInviare').equals(1).toArray()
      const eliminati = await db.eliminatiFp.toArray()
      for (let i = 0; i === 0 || i < voci.length; i += BLOCCO_VOCI) {
        const blocco = voci.slice(i, i + BLOCCO_VOCI)
        const r = await inviaRilieviFp({ rilievi: i === 0 ? rilievi : [], voci: blocco, eliminati: i === 0 ? eliminati : [] })
        if ('errore' in r) throw new Error(r.errore)
        if (i === 0) {
          const attualiR = new Map((await db.rilieviFp.bulkGet(rilievi.map(x => x.id))).filter(x => !!x).map(x => [x!.id, x!]))
          await db.rilieviFp.bulkUpdate(inviateConfermate(rilievi, attualiR).map(id => ({ key: id, changes: { daInviare: 0 as const } })))
          await db.eliminatiFp.bulkDelete(eliminati.map(e => e.id))
        }
        const attualiV = new Map((await db.vociFp.bulkGet(blocco.map(x => x.id))).filter(x => !!x).map(x => [x!.id, x!]))
        await db.vociFp.bulkUpdate(inviateConfermate(blocco, attualiV).map(id => ({ key: id, changes: { daInviare: 0 as const } })))
      }

      const cursore = await db.fpMeta.get('cursore:rilievi')
      const remoti = await getRilieviFp(cursore?.dopo ?? null)
      if ('errore' in remoti) throw new Error(remoti.errore)
      const localiR = new Map((await db.rilieviFp.toArray()).map(r => [r.id, r]))
      const localiV = new Map((await db.vociFp.toArray()).map(v => [v.id, v]))
      await db.rilieviFp.bulkPut(remotiDaApplicare(localiR, remoti.rilievi).map(r => ({ ...r, daInviare: 0 as const })))
      await db.vociFp.bulkPut(remotiDaApplicare(localiV, remoti.voci).map(v => ({ ...v, daInviare: 0 as const })))
      const massimo = [...remoti.rilievi, ...remoti.voci].reduce<string | null>((m, x) => (!m || x.aggiornatoAt > m ? x.aggiornatoAt : m), cursore?.dopo ?? null)
      await db.fpMeta.put({ chiave: 'cursore:rilievi', dopo: massimo, da: 0, massimo })
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito')
    } finally {
      inCorso.current = false
    }
  }, [])

  useEffect(() => {
    void invia()
    window.addEventListener('online', invia)
    const id = setInterval(invia, OGNI_MS)
    return () => {
      window.removeEventListener('online', invia)
      clearInterval(id)
    }
  }, [invia])

  return { daInviare: daInviare ?? 0, invia, errore }
}
```

- [ ] **Step 3: Controllo e commit**

Run: `npx tsc --noEmit && npx eslint hooks/useCatalogoLocale.ts hooks/useInvioRilievi.ts` → pulito (se `react-hooks/set-state-in-effect` segnala il `setStato` nel `.then`: è asincrono, ma in caso spostare la lettura di `catalogo:ultimo` dentro `aggiorna`).

```bash
git add hooks/useCatalogoLocale.ts hooks/useInvioRilievi.ts
git commit -m "feat(rilievo-fp): scaricamento del catalogo e invio dei rilievi in background"
```

---

### Task 6: L'app del cantiere

**Files (tutti in `components/rilievo-fp/`):**
- `AppCantiere.tsx` (viste + storia del browser), `StatoSync.tsx`, `ElencoRilievi.tsx`, `SchedaRilievo.tsx`, `WizardVoce.tsx`, `SceltaTipologia.tsx`, `ListaConRicerca.tsx`, `DisegnoVoceSvg.tsx`, `ImmagineStruttura.tsx`
- Create: `app/(dashboard)/rilievo/cantiere/page.tsx`

**Interfaces:**
- Consumes: tutto quanto sopra; `AllegatiVoce` (esistente, `{ voceId }`).
- Produces: rotta `/rilievo/cantiere`; `DisegnoVoceSvg({ struttura, voce, className })`; `ImmagineStruttura({ path, className })`.

- [ ] **Step 1: `DisegnoVoceSvg.tsx` e `ImmagineStruttura.tsx`**

```tsx
'use client'

import { disegnoVoce } from '@/lib/fppro/disegno-voce'
import type { StrutturaLocale, VoceFpDati } from '@/types/rilievo-fp'

interface Props {
  struttura: Pick<StrutturaLocale, 'albero' | 'poligoni' | 'l_nominale' | 'h_nominale'>
  voce: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'>
  className?: string
}

export default function DisegnoVoceSvg({ struttura, voce, className }: Props) {
  const d = disegnoVoce(struttura, voce)
  if (!d) return <div className={`grid place-items-center text-xs text-muted-foreground ${className ?? ''}`}>Disegno non disponibile</div>
  return (
    <svg viewBox={d.viewBox} className={className} role="img" aria-label={`Disegno ${d.larghezza} per ${d.altezza} mm`}>
      <rect x={0} y={0} width={d.larghezza} height={d.altezza} fill="#bfdbfe" />
      {d.profili.map((p, i) => (
        <polygon key={i} points={p} fill="#d4d4d8" stroke="#3f3f46" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}
```

```tsx
'use client'

// Immagine di FP PRO salvata nel telefono (Blob in IndexedDB).
import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

export default function ImmagineStruttura({ path, className }: { path: string | null; className?: string }) {
  const riga = useLiveQuery(() => (path ? db.fpImmagini.get(path) : undefined), [path])
  const url = useMemo(() => (riga ? URL.createObjectURL(riga.blob) : null), [riga])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return <div className={`grid place-items-center bg-muted text-[10px] text-muted-foreground ${className ?? ''}`}>…</div>
  // eslint-disable-next-line @next/next/no-img-element -- immagine locale (blob:)
  return <img src={url} alt="" className={`object-contain bg-white ${className ?? ''}`} />
}
```

(Se il lint dice che la direttiva `eslint-disable` è inutile, toglierla.)

- [ ] **Step 2: `ListaConRicerca.tsx`** (scelta di colori e vetri: preferiti prima, poi ricerca)

```tsx
'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface ElementoLista { id: number; testo: string; sotto?: string | null }

interface Props {
  elementi: ElementoLista[]
  preferiti: Set<number>
  valore: number | null
  onScegli: (e: ElementoLista | null) => void
  segnaposto: string
  etichettaNessuno?: string
}

export default function ListaConRicerca({ elementi, preferiti, valore, onScegli, segnaposto, etichettaNessuno }: Props) {
  const [testo, setTesto] = useState('')
  const q = testo.trim().toLowerCase()
  const visibili = q.length >= 2
    ? elementi.filter(e => `${e.testo} ${e.sotto ?? ''}`.toLowerCase().includes(q)).slice(0, 40)
    : elementi.filter(e => preferiti.has(e.id) || e.id === valore)

  const riga = (e: ElementoLista) => (
    <li key={e.id}>
      <button type="button" onClick={() => onScegli(e)} className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left hover:bg-muted">
        <span className="flex-1">
          <span className="block text-sm">{e.testo}</span>
          {e.sotto && <span className="block text-xs text-muted-foreground">{e.sotto}</span>}
        </span>
        {valore === e.id && <Check className="size-4 text-primary" />}
      </button>
    </li>
  )

  return (
    <div className="space-y-2">
      <Input value={testo} onChange={e => setTesto(e.target.value)} placeholder={segnaposto} aria-label={segnaposto} />
      <ul className="max-h-72 overflow-y-auto rounded-md border divide-y">
        {etichettaNessuno && (
          <li>
            <button type="button" onClick={() => onScegli(null)} className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted">
              <span className="flex-1">{etichettaNessuno}</span>
              {valore === null && <Check className="size-4 text-primary" />}
            </button>
          </li>
        )}
        {visibili.map(riga)}
        {visibili.length === 0 && (
          <li className="px-3 py-3 text-xs text-muted-foreground">
            {q.length >= 2 ? 'Nessun risultato' : 'Scrivi almeno 2 lettere per cercare tra tutti'}
          </li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: `SceltaTipologia.tsx`** (cartelle come FP PRO, preferite ⭐ e recenti, ricerca)

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Folder, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import { impostaPreferenzaFp } from '@/actions/rilievo-fp'
import ImmagineStruttura from './ImmagineStruttura'
import type { StrutturaLocale } from '@/types/rilievo-fp'

interface Props {
  serie: string
  onScegli: (s: StrutturaLocale) => void
}

const cartellaDi = (percorso: string) => percorso.slice(0, percorso.lastIndexOf('/') + 1)

export default function SceltaTipologia({ serie, onScegli }: Props) {
  const strutture = useLiveQuery(() => db.fpStrutture.where('serie').equals(serie).filter(s => s.presente).toArray(), [serie], [])
  const preferite = useLiveQuery(async () => new Set((await db.fpPreferenze.where('tipo').equals('struttura').toArray()).map(p => p.rif)), [], new Set<string>())
  const recenti = useLiveQuery(async () => {
    const voci = await db.vociFp.orderBy('aggiornatoAt').reverse().limit(200).toArray()
    return [...new Set(voci.filter(v => v.fp.serie === serie).map(v => v.fp.strutturaId))].slice(0, 6)
  }, [serie], [])
  const [cartella, setCartella] = useState('')
  const [testo, setTesto] = useState('')

  const q = testo.trim().toLowerCase()
  const { sottocartelle, qui } = useMemo(() => {
    const sotto = new Map<string, number>()
    const file: StrutturaLocale[] = []
    for (const s of strutture) {
      if (!s.percorso.startsWith(cartella)) continue
      const resto = s.percorso.slice(cartella.length)
      const i = resto.indexOf('/')
      if (i === -1) file.push(s)
      else sotto.set(resto.slice(0, i), (sotto.get(resto.slice(0, i)) ?? 0) + 1)
    }
    return { sottocartelle: [...sotto.entries()].sort((a, b) => a[0].localeCompare(b[0])), qui: file.sort((a, b) => a.nome.localeCompare(b.nome)) }
  }, [strutture, cartella])

  const inEvidenza = strutture.filter(s => preferite.has(s.id) || recenti.includes(s.id))
  const trovate = q.length >= 2 ? strutture.filter(s => `${s.nome} ${s.codice ?? ''} ${s.percorso}`.toLowerCase().includes(q)).slice(0, 60) : []

  const stella = async (s: StrutturaLocale) => {
    const attiva = !preferite.has(s.id)
    if (!navigator.onLine) { toast.error('Per segnare una preferita serve la rete'); return }
    const r = await impostaPreferenzaFp('struttura', s.id, attiva)
    if ('errore' in r) { toast.error(r.errore); return }
    if (attiva) await db.fpPreferenze.put({ id: `struttura:${s.id}`, tipo: 'struttura', rif: s.id, ordine: 0 })
    else await db.fpPreferenze.delete(`struttura:${s.id}`)
  }

  const scheda = (s: StrutturaLocale) => (
    <li key={s.id} className="flex items-center gap-2 rounded-md border bg-card">
      <button type="button" onClick={() => onScegli(s)} className="flex flex-1 items-center gap-3 p-2 text-left">
        <ImmagineStruttura path={s.immagine} className="size-16 shrink-0 rounded" />
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-tight">{s.nome}</span>
          <span className="block truncate text-xs text-muted-foreground">{cartellaDi(s.percorso)}</span>
        </span>
      </button>
      <button type="button" onClick={() => stella(s)} className="p-3" aria-label={preferite.has(s.id) ? 'Togli dalle preferite' : 'Aggiungi alle preferite'}>
        <Star className={`size-5 ${preferite.has(s.id) ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
      </button>
    </li>
  )

  if (strutture.length === 0) return <p className="text-sm text-muted-foreground">Nessuna struttura di {serie} nel telefono: aggiorna il catalogo quando c&apos;è rete.</p>

  return (
    <div className="space-y-3">
      <Input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca per nome (es. 2 ante, vasistas)" aria-label="Cerca struttura" />
      {q.length >= 2 ? (
        <ul className="space-y-2">{trovate.map(scheda)}{trovate.length === 0 && <li className="text-sm text-muted-foreground">Nessuna struttura</li>}</ul>
      ) : (
        <>
          {inEvidenza.length > 0 && cartella === '' && (
            <section>
              <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Preferite e recenti</h3>
              <ul className="space-y-2">{inEvidenza.map(scheda)}</ul>
            </section>
          )}
          <section>
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              {cartella && (
                <button type="button" className="flex items-center p-1" onClick={() => setCartella(cartella.slice(0, cartella.slice(0, -1).lastIndexOf('/') + 1))} aria-label="Cartella superiore">
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <span className="truncate">{cartella || 'Tutte le cartelle'}</span>
            </div>
            <ul className="space-y-1">
              {sottocartelle.map(([nome, n]) => (
                <li key={nome}>
                  <button type="button" onClick={() => setCartella(`${cartella}${nome}/`)} className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left hover:bg-muted">
                    <Folder className="size-4 text-muted-foreground" /><span className="flex-1 text-sm">{nome}</span><span className="text-xs text-muted-foreground">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
            {qui.length > 0 && <ul className="mt-2 space-y-2">{qui.map(scheda)}</ul>}
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `WizardVoce.tsx`** (passi della voce, si salva a ogni passo)

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/db'
import { salvaVoceLocale } from '@/lib/rilievo-fp-locale'
import {
  campiRiempimento, divisioniStruttura, haAnteBattenti, kitOpzionali, nuovaVoceFp, problemiVoce, telaiStruttura,
} from '@/lib/fppro/rilievo-fp'
import DisegnoVoceSvg from './DisegnoVoceSvg'
import ListaConRicerca from './ListaConRicerca'
import SceltaTipologia from './SceltaTipologia'
import type { Lato, StrutturaLocale, VoceFp, VoceFpDati } from '@/types/rilievo-fp'

const PASSI = ['Serie', 'Tipologia', 'Misure', 'Finitura', 'Vetri', 'Opzioni', 'Telaio', 'Note'] as const
const LATI: Lato[] = ['sinistra', 'alto', 'destra', 'basso']

interface Props {
  rilievoId: string
  voceId: string | null
  onFine: () => void
}

const numero = (s: string): number | null => {
  const n = Number(s.replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}

export default function WizardVoce({ rilievoId, voceId, onFine }: Props) {
  const esistente = useLiveQuery(() => (voceId ? db.vociFp.get(voceId) : undefined), [voceId])
  const [bozza, setBozza] = useState<VoceFp | null>(null)
  const voce = bozza ?? esistente ?? null
  const [passo, setPasso] = useState(voceId ? 2 : 0)
  const [serie, setSerie] = useState<string | null>(null)

  const struttura = useLiveQuery(() => (voce ? db.fpStrutture.get(voce.fp.strutturaId) : undefined), [voce?.fp.strutturaId])
  const elencoSerie = useLiveQuery(() => db.fpSerie.orderBy('nome').filter(s => s.presente).toArray(), [], [])
  const serieRecenti = useLiveQuery(async () => {
    const v = await db.vociFp.orderBy('aggiornatoAt').reverse().limit(100).toArray()
    return [...new Set(v.map(x => x.fp.serie))].slice(0, 5)
  }, [], [])
  const colori = useLiveQuery(() => db.fpColori.filter(c => c.presente).toArray(), [], [])
  const vetri = useLiveQuery(() => db.fpVetri.filter(v => v.presente).toArray(), [], [])
  const preferenze = useLiveQuery(() => db.fpPreferenze.toArray(), [], [])
  const serieFp = useLiveQuery(() => (voce ? db.fpSerie.where('nome').equals(voce.fp.serie).first() : undefined), [voce?.fp.serie])
  const telaiSerie = useLiveQuery(
    () => (serieFp ? db.fpTelai.where('serie_fp_id').equals(serieFp.fp_id).filter(t => t.presente).toArray() : []),
    [serieFp?.fp_id], [],
  )

  const pref = (tipo: 'colore' | 'vetro') => new Set(preferenze.filter(p => p.tipo === tipo).map(p => Number(p.rif)))
  const divisioni = useMemo(() => (struttura ? divisioniStruttura(struttura.albero) : []), [struttura])
  const campi = useMemo(() => (struttura ? campiRiempimento(struttura.albero) : []), [struttura])
  const kit = useMemo(() => (struttura ? kitOpzionali(struttura.albero) : []), [struttura])
  const telaiDefault = useMemo(() => (struttura ? telaiStruttura(struttura.albero) : {}), [struttura])

  const aggiorna = (patch: Partial<VoceFpDati>, altro: Partial<VoceFp> = {}) => {
    if (!voce) return
    setBozza({ ...voce, ...altro, fp: { ...voce.fp, ...patch } })
  }

  const salva = async (prossimo: number | 'fine') => {
    if (voce) await salvaVoceLocale(voce)
    if (prossimo === 'fine') { toast.success('Voce salvata'); onFine() } else setPasso(prossimo)
  }

  const sceltaStruttura = async (s: StrutturaLocale) => {
    const ordine = await db.vociFp.where('rilievoId').equals(rilievoId).count()
    const nuova: VoceFp = {
      id: voce?.id ?? crypto.randomUUID(),
      rilievoId,
      ordine: voce?.ordine ?? ordine,
      posizione: voce?.posizione ?? '',
      quantita: voce?.quantita ?? 1,
      note: voce?.note ?? '',
      fp: { ...nuovaVoceFp(s, serie ?? voce?.fp.serie ?? s.serie[0]), larghezza: voce?.fp.larghezza ?? null, altezza: voce?.fp.altezza ?? null },
      aggiornatoAt: new Date().toISOString(),
    }
    setBozza(nuova)
    await salvaVoceLocale(nuova)
    setPasso(2)
  }

  const testa = (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={onFine}>Chiudi</Button>
      <span className="text-sm text-muted-foreground">{passo + 1}/{PASSI.length} · {PASSI[passo]}</span>
    </div>
  )
  const piede = (
    <div className="sticky bottom-0 flex gap-2 bg-background py-3">
      {passo > 0 && <Button variant="outline" className="flex-1 h-12" onClick={() => salva(passo - 1)}>Indietro</Button>}
      {passo >= 2 && passo < PASSI.length - 1 && <Button className="flex-1 h-12" onClick={() => salva(passo + 1)}>Avanti</Button>}
      {passo === PASSI.length - 1 && <Button className="flex-1 h-12" onClick={() => salva('fine')}>Salva voce</Button>}
    </div>
  )

  if (passo === 0) {
    const ordinate = [...elencoSerie].sort((a, b) => Number(serieRecenti.includes(b.nome)) - Number(serieRecenti.includes(a.nome)))
    return (
      <div className="space-y-3">{testa}
        <ul className="divide-y rounded-md border">
          {ordinate.map(s => (
            <li key={s.fp_id}>
              <button type="button" className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-muted" onClick={() => { setSerie(s.nome); setPasso(1) }}>
                <span className="text-sm font-medium">{s.nome}</span>
                <span className="text-xs text-muted-foreground">{s.descrizione}{serieRecenti.includes(s.nome) ? ' · recente' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (passo === 1) {
    return <div className="space-y-3">{testa}<SceltaTipologia serie={serie ?? voce?.fp.serie ?? ''} onScegli={sceltaStruttura} />{piede}</div>
  }

  if (!voce || !struttura) return <div className="space-y-3">{testa}<p className="text-sm text-muted-foreground">Caricamento…</p></div>
  const v = voce.fp
  const problemi = problemiVoce(v, divisioni)

  return (
    <div className="space-y-4">
      {testa}
      <div className="rounded-md border bg-white p-2">
        <DisegnoVoceSvg struttura={struttura} voce={v} className="mx-auto h-48 w-full" />
        <p className="mt-1 text-center text-xs text-muted-foreground">{v.serie} · {v.nome}</p>
      </div>

      {passo === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="pos">Posizione / locale</Label><Input id="pos" value={voce.posizione} onChange={e => aggiorna({}, { posizione: e.target.value })} /></div>
          <div><Label htmlFor="l">Larghezza (mm)</Label><Input id="l" inputMode="numeric" value={v.larghezza ?? ''} onChange={e => aggiorna({ larghezza: numero(e.target.value) })} /></div>
          <div><Label htmlFor="h">Altezza (mm)</Label><Input id="h" inputMode="numeric" value={v.altezza ?? ''} onChange={e => aggiorna({ altezza: numero(e.target.value) })} /></div>
          <div><Label htmlFor="q">Quantità</Label><Input id="q" inputMode="numeric" value={voce.quantita} onChange={e => aggiorna({}, { quantita: Math.max(1, numero(e.target.value) ?? 1) })} /></div>
          {divisioni.map(d => {
            const totale = d.tipo === 'traverso' ? (v.altezza ?? struttura.h_nominale) : (v.larghezza ?? struttura.l_nominale)
            const nominaleTot = d.tipo === 'traverso' ? struttura.h_nominale : struttura.l_nominale
            const proporzionale = totale && nominaleTot ? Math.round((d.nominale * totale) / nominaleTot) : null
            return (
              <div key={d.codice}>
                <Label htmlFor={`d${d.codice}`}>{d.etichetta} {d.tipo === 'traverso' ? '(dal basso)' : '(da sinistra)'}</Label>
                <Input id={`d${d.codice}`} inputMode="numeric" placeholder={proporzionale ? `≈ ${proporzionale}` : ''} value={v.quote[d.codice] ?? ''}
                  onChange={e => {
                    const n = numero(e.target.value)
                    const quote = { ...v.quote }
                    if (n === null) delete quote[d.codice]; else quote[d.codice] = n
                    aggiorna({ quote })
                  }} />
              </div>
            )
          })}
          {problemi.length > 0 && <ul className="col-span-2 text-sm text-amber-700">{problemi.map(p => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-4">
          {(['coloreInt', 'coloreEst'] as const).map(campo => (
            <div key={campo} className="space-y-1">
              <Label>{campo === 'coloreInt' ? 'Colore interno' : 'Colore esterno'}</Label>
              <ListaConRicerca
                elementi={colori.map(c => ({ id: c.fp_id, testo: c.descrizione }))}
                preferiti={pref('colore')}
                valore={v[campo]?.fpId ?? null}
                segnaposto="Cerca colore (es. 9010)"
                onScegli={e => aggiorna({ [campo]: e ? { fpId: e.id, descrizione: e.testo } : null })}
              />
            </div>
          ))}
        </div>
      )}

      {passo === 4 && (
        <div className="space-y-4">
          {campi.filter(c => c.tipo === 'vetro').map((c, i) => (
            <div key={c.codice} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{c.etichetta} <span className="text-xs text-muted-foreground">(FP PRO: {c.codiceDefault})</span></Label>
                {i === 0 && campi.filter(x => x.tipo === 'vetro').length > 1 && v.vetri[c.codice] && (
                  <Button variant="link" size="sm" onClick={() => aggiorna({ vetri: Object.fromEntries(campi.filter(x => x.tipo === 'vetro').map(x => [x.codice, v.vetri[c.codice]])) })}>Uguale per tutti</Button>
                )}
              </div>
              <ListaConRicerca
                elementi={vetri.map(x => ({ id: x.fp_id, testo: x.codice, sotto: x.descrizione }))}
                preferiti={pref('vetro')}
                valore={v.vetri[c.codice]?.fpId ?? null}
                segnaposto="Cerca vetro (es. 33.1)"
                etichettaNessuno={`Come la struttura (${c.codiceDefault})`}
                onScegli={e => {
                  const vetriNuovi = { ...v.vetri }
                  if (e) vetriNuovi[c.codice] = { fpId: e.id, codice: e.testo }; else delete vetriNuovi[c.codice]
                  aggiorna({ vetri: vetriNuovi })
                }}
              />
            </div>
          ))}
          {campi.some(c => c.tipo === 'pannello') && <p className="text-xs text-muted-foreground">I pannelli restano come nella struttura.</p>}
          {campi.length === 0 && <p className="text-sm text-muted-foreground">Questa struttura non ha vetri.</p>}
        </div>
      )}

      {passo === 5 && (
        <div className="space-y-4">
          {kit.length === 0 && <p className="text-sm text-muted-foreground">Nessuna opzione da scegliere.</p>}
          {kit.map(k => (
            <label key={k.chiave} className="flex items-start gap-3 rounded-md border p-3">
              <input type="checkbox" className="mt-1 size-5" checked={v.kit[k.chiave] ?? k.predefinito} onChange={e => aggiorna({ kit: { ...v.kit, [k.chiave]: e.target.checked } })} />
              <span><span className="block text-sm">{k.descrizione || k.codice}</span><span className="block text-xs text-muted-foreground">{k.codice}</span></span>
            </label>
          ))}
          {haAnteBattenti(struttura.albero) && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Mano di apertura (anta principale)</legend>
              <div className="flex gap-2">
                {([['sx', 'Sinistra'], ['dx', 'Destra'], [null, 'Non indicata']] as const).map(([valore, testo]) => (
                  <Button key={testo} type="button" variant={v.mano === valore ? 'default' : 'outline'} className="flex-1 h-11" onClick={() => aggiorna({ mano: valore })}>{testo}</Button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {passo === 6 && (
        <div className="space-y-3">
          {LATI.filter(l => telaiDefault[l]).map(l => (
            <div key={l} className="space-y-1">
              <Label htmlFor={`t-${l}`}>Telaio {l}</Label>
              <select id={`t-${l}`} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={v.telai[l] ?? ''}
                onChange={e => { const telai = { ...v.telai }; if (e.target.value) telai[l] = e.target.value; else delete telai[l]; aggiorna({ telai }) }}>
                <option value="">Come la struttura ({telaiDefault[l]})</option>
                {telaiSerie.map(t => <option key={t.fp_id} value={t.codice}>{t.codice} — {t.descrizione}</option>)}
              </select>
            </div>
          ))}
          {Object.keys(telaiDefault).length === 0 && <p className="text-sm text-muted-foreground">Nessun telaio da scegliere.</p>}
        </div>
      )}

      {passo === 7 && (
        <div className="space-y-1">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" rows={4} value={voce.note} onChange={e => aggiorna({}, { note: e.target.value })} />
        </div>
      )}

      {piede}
    </div>
  )
}
```

- [ ] **Step 5: `ElencoRilievi.tsx`, `SchedaRilievo.tsx`, `StatoSync.tsx`, `AppCantiere.tsx`**

`StatoSync.tsx`:

```tsx
'use client'

import { CloudOff, RefreshCw, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { StatoCatalogo } from '@/hooks/useCatalogoLocale'

const data = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' })

interface Props {
  catalogo: { stato: StatoCatalogo; aggiorna: () => Promise<void> }
  invio: { daInviare: number; invia: () => Promise<void>; errore: string | null }
}

export default function StatoSync({ catalogo, invio }: Props) {
  const { isOnline } = useOnlineStatus()
  const s = catalogo.stato
  return (
    <div className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
      <div className="flex items-center gap-2">
        {!isOnline && <span className="flex items-center gap-1 text-amber-700"><CloudOff className="size-4" />Senza rete</span>}
        <span className={invio.daInviare > 0 ? 'font-medium text-red-700' : 'text-muted-foreground'}>
          {invio.daInviare > 0 ? `${invio.daInviare} modifiche da inviare` : 'Tutto inviato'}
        </span>
        {invio.daInviare > 0 && isOnline && (
          <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => invio.invia()}><UploadCloud className="mr-1 size-4" />Invia</Button>
        )}
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>
          {s.fase === 'dati' && `Scarico il catalogo FP PRO… ${s.fatte} righe`}
          {s.fase === 'immagini' && `Scarico le immagini… ${s.fatte}`}
          {s.fase === 'errore' && <span className="text-red-700">Catalogo non aggiornato: {s.messaggio}</span>}
          {s.fase === 'fermo' && (s.ultimo ? `Catalogo aggiornato il ${data.format(new Date(s.ultimo))}` : 'Catalogo non ancora scaricato (meglio con Wi-Fi)')}
        </span>
        {isOnline && s.fase !== 'dati' && s.fase !== 'immagini' && (
          <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => catalogo.aggiorna()}><RefreshCw className="mr-1 size-4" />Aggiorna</Button>
        )}
      </div>
      {invio.errore && <p className="text-red-700">Ultimo invio non riuscito: {invio.errore}</p>}
    </div>
  )
}
```

`ElencoRilievi.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/db'
import { creaRilievoLocale } from '@/lib/rilievo-fp-locale'
import type { Cliente } from '@/types/cliente'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export const nomeCliente = (c: ClienteSnapshotRilievo) =>
  c.tipo === 'azienda' ? c.ragione_sociale ?? '' : [c.cognome, c.nome].filter(Boolean).join(' ')

const daCliente = (c: Cliente): ClienteSnapshotRilievo => ({
  tipo: c.tipo, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome, telefono: c.telefono,
  email: c.email, indirizzo: [c.via, c.civico, c.citta].filter(Boolean).join(' ') || c.indirizzo, cantiere: c.cantiere,
})

export default function ElencoRilievi({ onApri }: { onApri: (id: string) => void }) {
  const rilievi = useLiveQuery(() => db.rilieviFp.orderBy('aggiornatoAt').reverse().toArray(), [], [])
  const clienti = useLiveQuery(() => db.clienti.toArray(), [], [])
  const [nuovo, setNuovo] = useState(false)
  const [cerca, setCerca] = useState('')
  const [cantiere, setCantiere] = useState('')

  const crea = async (cliente: ClienteSnapshotRilievo) => {
    const id = await creaRilievoLocale({ ...cliente, cantiere: cantiere || cliente.cantiere }, '')
    setNuovo(false)
    onApri(id)
  }
  const q = cerca.trim().toLowerCase()
  const trovati = q.length >= 2
    ? clienti.filter(c => `${c.ragione_sociale ?? ''} ${c.cognome ?? ''} ${c.nome ?? ''}`.toLowerCase().includes(q)).slice(0, 20)
    : []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rilievi in cantiere</h1>
        <Button onClick={() => setNuovo(!nuovo)} className="h-11"><Plus className="mr-1 size-4" />Nuovo</Button>
      </div>
      {nuovo && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="cerca-cliente">Cliente</Label>
          <Input id="cerca-cliente" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca in anagrafica o scrivi un nome nuovo" />
          <Label htmlFor="cantiere">Cantiere / indirizzo</Label>
          <Input id="cantiere" value={cantiere} onChange={e => setCantiere(e.target.value)} />
          <ul className="divide-y">
            {trovati.map(c => (
              <li key={c.id}><button type="button" className="w-full px-2 py-3 text-left text-sm hover:bg-muted" onClick={() => crea(daCliente(c))}>{nomeCliente(daCliente(c))}</button></li>
            ))}
          </ul>
          {cerca.trim() && (
            <Button variant="outline" className="h-11 w-full" onClick={() => crea({ tipo: 'privato', ragione_sociale: null, nome: null, cognome: cerca.trim(), telefono: null, email: null, indirizzo: null, cantiere: null })}>
              Nuovo cliente: &quot;{cerca.trim()}&quot;
            </Button>
          )}
        </div>
      )}
      <ul className="space-y-2">
        {rilievi.map(r => (
          <li key={r.id}>
            <button type="button" onClick={() => onApri(r.id)} className="w-full rounded-md border bg-card p-3 text-left">
              <span className="block text-sm font-medium">{nomeCliente(r.cliente) || 'Senza nome'}</span>
              <span className="block text-xs text-muted-foreground">
                {r.cliente.cantiere ?? ''} {r.daInviare ? '· da inviare' : ''}
              </span>
            </button>
          </li>
        ))}
        {rilievi.length === 0 && <li className="text-sm text-muted-foreground">Nessun rilievo</li>}
      </ul>
    </div>
  )
}
```

`SchedaRilievo.tsx`:

```tsx
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import AllegatiVoce from '@/components/rilievo/AllegatiVoce'
import { db } from '@/lib/db'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { eliminaRilievoLocale, eliminaVoceLocale, salvaRilievoLocale } from '@/lib/rilievo-fp-locale'
import DisegnoVoceSvg from './DisegnoVoceSvg'
import { nomeCliente } from './ElencoRilievi'

interface Props {
  id: string
  onIndietro: () => void
  onVoce: (voceId: string | null) => void
}

export default function SchedaRilievo({ id, onIndietro, onVoce }: Props) {
  const { isOnline } = useOnlineStatus()
  const rilievo = useLiveQuery(() => db.rilieviFp.get(id), [id])
  const voci = useLiveQuery(() => db.vociFp.where('rilievoId').equals(id).sortBy('ordine'), [id], [])
  const strutture = useLiveQuery(async () => {
    const righe = await db.fpStrutture.bulkGet(voci.map(v => v.fp.strutturaId))
    return new Map(righe.filter(s => !!s).map(s => [s!.id, s!]))
  }, [voci])

  if (!rilievo) return <p className="text-sm text-muted-foreground">Rilievo non trovato.</p>

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onIndietro}><ChevronLeft className="mr-1 size-4" />Rilievi</Button>
      <div>
        <h1 className="text-lg font-semibold">{nomeCliente(rilievo.cliente) || 'Senza nome'}</h1>
        {rilievo.cliente.cantiere && <p className="text-sm text-muted-foreground">{rilievo.cliente.cantiere}</p>}
      </div>
      <Textarea aria-label="Note del rilievo" placeholder="Note del rilievo" value={rilievo.note} onChange={e => salvaRilievoLocale({ ...rilievo, note: e.target.value })} />

      <ul className="space-y-2">
        {voci.map(v => {
          const s = strutture?.get(v.fp.strutturaId)
          return (
            <li key={v.id} className="rounded-md border bg-card p-2">
              <div className="flex gap-3">
                <button type="button" className="flex flex-1 gap-3 text-left" onClick={() => onVoce(v.id)}>
                  {s ? <DisegnoVoceSvg struttura={s} voce={v.fp} className="size-20 shrink-0" /> : <div className="size-20 shrink-0 bg-muted" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{v.posizione || 'Voce'} · {v.quantita} pz</span>
                    <span className="block text-xs text-muted-foreground">{v.fp.serie} · {v.fp.nome}</span>
                    <span className="block text-xs">{v.fp.larghezza ?? '?'} × {v.fp.altezza ?? '?'} mm</span>
                    {!s && <span className="block text-xs text-amber-700">Struttura non più in FP PRO</span>}
                    {v.daInviare === 1 && <span className="block text-xs text-red-700">da inviare</span>}
                  </span>
                </button>
                <button type="button" className="p-2" aria-label="Elimina voce" onClick={() => { if (confirm('Eliminare questa voce?')) void eliminaVoceLocale(v.id) }}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </button>
              </div>
              {isOnline && v.daInviare === 0 && <div className="mt-2"><AllegatiVoce voceId={v.id} /></div>}
            </li>
          )
        })}
      </ul>
      <Button className="h-12 w-full" onClick={() => onVoce(null)}><Plus className="mr-1 size-4" />Aggiungi voce</Button>
      <Button variant="ghost" className="w-full text-red-700" onClick={async () => { if (confirm('Eliminare tutto il rilievo?')) { await eliminaRilievoLocale(id); onIndietro() } }}>
        Elimina rilievo
      </Button>
    </div>
  )
}
```

`AppCantiere.tsx` (le viste stanno nella storia del browser: il "indietro" del telefono non esce dalla pagina):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useCatalogoLocale } from '@/hooks/useCatalogoLocale'
import { useInvioRilievi } from '@/hooks/useInvioRilievi'
import ElencoRilievi from './ElencoRilievi'
import SchedaRilievo from './SchedaRilievo'
import StatoSync from './StatoSync'
import WizardVoce from './WizardVoce'

type Vista = { tipo: 'elenco' } | { tipo: 'rilievo'; id: string } | { tipo: 'voce'; rilievoId: string; voceId: string | null }

export default function AppCantiere() {
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const catalogo = useCatalogoLocale()
  const invio = useInvioRilievi()

  useEffect(() => {
    window.history.replaceState({ vista: { tipo: 'elenco' } }, '')
    const indietro = (e: PopStateEvent) => setVista((e.state?.vista as Vista | undefined) ?? { tipo: 'elenco' })
    window.addEventListener('popstate', indietro)
    return () => window.removeEventListener('popstate', indietro)
  }, [])

  const vai = (v: Vista) => {
    window.history.pushState({ vista: v }, '')
    setVista(v)
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <StatoSync catalogo={catalogo} invio={invio} />
      {vista.tipo === 'elenco' && <ElencoRilievi onApri={id => vai({ tipo: 'rilievo', id })} />}
      {vista.tipo === 'rilievo' && (
        <SchedaRilievo id={vista.id} onIndietro={() => window.history.back()} onVoce={voceId => vai({ tipo: 'voce', rilievoId: vista.id, voceId })} />
      )}
      {vista.tipo === 'voce' && (
        <WizardVoce key={vista.voceId ?? 'nuova'} rilievoId={vista.rilievoId} voceId={vista.voceId} onFine={() => window.history.back()} />
      )}
    </div>
  )
}
```

`app/(dashboard)/rilievo/cantiere/page.tsx`:

```tsx
import { requireAccesso } from '@/lib/permessi'
import AppCantiere from '@/components/rilievo-fp/AppCantiere'

export const metadata = { title: 'Rilievo in cantiere' }

export default async function RilievoCantierePage() {
  await requireAccesso('rilievo')
  return <AppCantiere />
}
```

- [ ] **Step 6: Controllo e commit**

Run: `npx tsc --noEmit && npm run lint` → pulito. Correggere eventuali segnalazioni di React (nessun `setState` sincrono negli effetti, niente `ref.current` letti nel render).

```bash
git add components/rilievo-fp "app/(dashboard)/rilievo/cantiere"
git commit -m "feat(rilievo-fp): app del rilievo in cantiere (senza rete)"
```

---

### Task 7: Senza rete, menu, liste brevi, stella nel catalogo

**Files:**
- Modify: `app/sw.ts`, `components/rilievo/MenuRilievo.tsx`, `components/rilievo/ImpostazioniRilievo.tsx`, `app/(dashboard)/rilievo/impostazioni/page.tsx`, `actions/catalogo-fp.ts`, `components/catalogo-fp/DettaglioStrutturaFp.tsx`, `types/fppro.ts`
- Create: `components/rilievo-fp/ListeBreviFp.tsx`

- [ ] **Step 1: Service worker** — in `app/sw.ts` importare `NetworkFirst` da `serwist` e mettere **prima** della regola `NetworkOnly` delle navigazioni:

```ts
    // Il rilievo in cantiere deve riaprirsi anche senza campo: si usa l'ultima
    // versione scaricata della pagina (il contenuto sta in IndexedDB).
    {
      matcher: ({ request, url }) => request.mode === 'navigate' && url.pathname === '/rilievo/cantiere',
      handler: new NetworkFirst({ cacheName: 'pagina-cantiere', networkTimeoutSeconds: 4 }),
    },
```

- [ ] **Step 2: Menu** — in `components/rilievo/MenuRilievo.tsx` la prima voce diventa `{ href: '/rilievo/cantiere', icon: Zap, titolo: 'Rilievo in cantiere', descrizione: 'Serie e strutture di FP PRO, funziona anche senza rete', ... }` (stessi colori). La voce impostazioni: descrizione "Forme serramento e liste brevi di colori e vetri".

- [ ] **Step 3: Liste brevi** — `components/rilievo-fp/ListeBreviFp.tsx` (in ufficio, con rete):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { getPreferenzeFp, impostaPreferenzaFp } from '@/actions/rilievo-fp'
import { getElenchiBreviFp } from '@/actions/catalogo-fp'

type Voce = { id: number; testo: string; sotto: string | null }

export default function ListeBreviFp() {
  const [elenchi, setElenchi] = useState<{ colori: Voce[]; vetri: Voce[] }>({ colori: [], vetri: [] })
  const [scelti, setScelti] = useState<Set<string>>(new Set())
  const [cerca, setCerca] = useState('')

  useEffect(() => {
    Promise.all([getElenchiBreviFp(), getPreferenzeFp()]).then(([e, p]) => {
      if ('errore' in e) toast.error(e.errore); else setElenchi(e)
      if ('errore' in p) toast.error(p.errore); else setScelti(new Set(p.map(x => x.id)))
    }).catch(() => toast.error('Liste non disponibili'))
  }, [])

  const cambia = async (tipo: 'colore' | 'vetro', id: number) => {
    const chiave = `${tipo}:${id}`
    const attiva = !scelti.has(chiave)
    const r = await impostaPreferenzaFp(tipo, String(id), attiva)
    if ('errore' in r) { toast.error(r.errore); return }
    setScelti(s => { const n = new Set(s); if (attiva) n.add(chiave); else n.delete(chiave); return n })
  }

  const q = cerca.trim().toLowerCase()
  const blocco = (tipo: 'colore' | 'vetro', titolo: string, voci: Voce[]) => {
    const visibili = voci.filter(v => scelti.has(`${tipo}:${v.id}`) || (q.length >= 2 && `${v.testo} ${v.sotto ?? ''}`.toLowerCase().includes(q)))
    return (
      <section className="space-y-1">
        <h3 className="text-sm font-medium">{titolo} ({voci.filter(v => scelti.has(`${tipo}:${v.id}`)).length} nella lista breve)</h3>
        <ul className="divide-y rounded-md border">
          {visibili.slice(0, 60).map(v => (
            <li key={v.id}>
              <button type="button" onClick={() => cambia(tipo, v.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                <Star className={`size-4 ${scelti.has(`${tipo}:${v.id}`) ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
                <span className="flex-1">{v.testo}{v.sotto && <span className="text-xs text-muted-foreground"> · {v.sotto}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">I colori e i vetri con la stella compaiono per primi nel rilievo in cantiere. Cerca per aggiungerne.</p>
      <Input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca colore o vetro (almeno 2 lettere)" aria-label="Cerca colore o vetro" />
      {blocco('colore', 'Colori', elenchi.colori)}
      {blocco('vetro', 'Vetri', elenchi.vetri)}
    </div>
  )
}
```

In `actions/catalogo-fp.ts` aggiungere:

```ts
export async function getElenchiBreviFp(): Promise<{ colori: { id: number; testo: string; sotto: string | null }[]; vetri: { id: number; testo: string; sotto: string | null }[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const [colori, vetri] = await Promise.all([
      selectAll<{ fp_id: number; descrizione: string }>((da, a) => supabase.from('fp_colori').select('fp_id, descrizione').eq('organization_id', orgId).eq('presente', true).eq('per_profili', true).order('fp_id').range(da, a)),
      selectAll<{ fp_id: number; codice: string; descrizione: string | null }>((da, a) => supabase.from('fp_vetri').select('fp_id, codice, descrizione').eq('organization_id', orgId).eq('presente', true).order('fp_id').range(da, a)),
    ])
    return {
      colori: colori.map(c => ({ id: c.fp_id, testo: c.descrizione, sotto: null })).sort((a, b) => a.testo.localeCompare(b.testo)),
      vetri: vetri.map(v => ({ id: v.fp_id, testo: v.codice, sotto: v.descrizione })).sort((a, b) => a.testo.localeCompare(b.testo)),
    }
  } catch (e) {
    return { errore: e instanceof Error ? e.message : 'Elenchi non disponibili' }
  }
}
```

In `components/rilievo/ImpostazioniRilievo.tsx`: togliere `ImpostazioniOpzioniVeloce`, il tipo `RilievoOpzione`, la prop `opzioniVeloce`; la scheda `'veloce'` diventa `'liste'` con etichetta "Colori e vetri" e contenuto `<ListeBreviFp />`. In `app/(dashboard)/rilievo/impostazioni/page.tsx` togliere `getOpzioni` e la prop.

- [ ] **Step 4: Stella nel catalogo** — `getStrutturaFp` restituisce anche `preferita: boolean` (lettura di `fp_preferenze` con `tipo='struttura'` e `rif=id`; aggiungere `preferita` a `StrutturaFpDettaglio` in `types/fppro.ts`). In `DettaglioStrutturaFp.tsx`, accanto al titolo, un pulsante ⭐ che chiama `impostaPreferenzaFp('struttura', s.id, !preferita)` e aggiorna lo stato locale (`aria-label` "Aggiungi alle preferite"/"Togli dalle preferite").

- [ ] **Step 5: Controllo e commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → tutto verde.

```bash
git add app/sw.ts components/rilievo components/rilievo-fp/ListeBreviFp.tsx "app/(dashboard)/rilievo/impostazioni/page.tsx" actions/catalogo-fp.ts components/catalogo-fp/DettaglioStrutturaFp.tsx types/fppro.ts
git commit -m "feat(rilievo-fp): pagina disponibile senza rete, liste brevi e preferite"
```

---

### Task 8: Via WinConfig, rilievo veloce vecchio e dati di prova

**Files:**
- Create: `supabase/migrations/20261011140000_via_winconfig.sql`
- Delete: `app/(dashboard)/winconfig/` (tutta), `components/winconfig/` (tutta), `actions/winconfig.ts`, `lib/winconfig-geometry.ts`, `types/winconfig.ts`, `app/(dashboard)/rilievo/veloce/nuovo/`, `app/(dashboard)/rilievo/veloce/[id]/`, `components/rilievo/DialogVoceVeloce.tsx`, `DettaglioRilievoVeloce.tsx`, `NuovoRilievoVeloce.tsx`, `RilievoVeloceList.tsx`, `ImpostazioniOpzioniVeloce.tsx`, `PreviewSerramento.tsx`, `actions/rilievo-veloce.ts`
- Modify: `app/(dashboard)/rilievo/veloce/page.tsx` (redirect), riferimenti a WinConfig elencati sotto

- [ ] **Step 1: Dati di prova** (autorizzato dall'utente il 2026-10-10: "erano prove, li puoi cancellare"). Con `execute_sql`, prima guardare e annotare nel registro:

```sql
select r.id, r.cliente_snapshot->>'cognome' cognome, count(v.id) voci from rilievi_veloci r left join rilievo_veloce_voci v on v.rilievo_id = r.id group by r.id;
select id, storage_path from rilievo_voci_allegati;
```
Expected: 2 rilievi, 5 voci, 1 allegato. Poi eliminare il file dell'allegato con lo Storage (il bucket è quello usato in `components/rilievo/AllegatiVoce.tsx` / `actions/rilievo-allegati.ts`: leggerlo da lì) con uno script Node usando `ponte/.env` e `supabase.storage.from(<bucket>).remove([storage_path])`, poi:

```sql
delete from rilievo_voci_allegati;
delete from rilievo_veloce_voci;
delete from rilievi_veloci;
```

- [ ] **Step 2: Migration** — `supabase/migrations/20261011140000_via_winconfig.sql`:

```sql
-- ============================================================
-- 20261011140000_via_winconfig.sql
-- WinConfig sostituito dal rilievo con le strutture di FP PRO (fase 3).
-- Verificato il 2026-10-11: 0 righe di preventivo di tipo winconfig.
-- Via anche le opzioni in testo libero del vecchio rilievo veloce.
-- ============================================================

DROP TABLE IF EXISTS wc_accessori, wc_colori, wc_profili, wc_riempimenti, wc_serie CASCADE;

ALTER TABLE articoli_preventivo DROP COLUMN IF EXISTS config_winconfig;
ALTER TABLE articoli_preventivo DROP CONSTRAINT IF EXISTS articoli_preventivo_tipo_check;
ALTER TABLE articoli_preventivo ADD CONSTRAINT articoli_preventivo_tipo_check
  CHECK (tipo IN ('listino', 'libera', 'listino_libero', 'scorrevole', 'su_misura'));

DELETE FROM user_permissions WHERE modulo = 'winconfig';
-- (nome del vincolo: leggerlo prima con pg_constraint e sostituirlo qui)
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_modulo_check
  CHECK (modulo IN ('dashboard', 'calendario', 'preventivi', 'clienti', 'listini', 'cataloghi', 'rilievo',
                    'magazzino', 'commesse', 'dipendenti', 'produzione', 'fatture_fornitori', 'impostazioni'));

DROP TABLE IF EXISTS rilievo_opzioni CASCADE;
```

Prima di applicarla, con `execute_sql` leggere i nomi veri dei due vincoli:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('articoli_preventivo'::regclass, 'user_permissions'::regclass) and contype = 'c';
```
e correggere i nomi nel file se diversi. Applicare con `apply_migration` (nome `via_winconfig`).

- [ ] **Step 3: Codice** — eliminare i file elencati in **Files**. Poi togliere i riferimenti (aggiornati al 2026-10-11):
  - `types/preventivo.ts:77` togliere `| 'winconfig'`; `:117-118` togliere `config_winconfig`.
  - `actions/preventivi.ts:234` commento; `:565-566` e `:642-643` togliere `config_winconfig` dalla destrutturazione e dall'oggetto.
  - `actions/contabilita-commessa.ts:135`, `app/(dashboard)/commesse/statistiche/page.tsx:190`: togliere `config_winconfig` dalla select.
  - `lib/preventivo-costi.ts:16,20,38-39` e `lib/preventivo-costi.test.ts:41,66`: togliere il ramo e il campo.
  - `components/preventivi/ArticoliEditor.tsx:188-189,216`, `DettaglioPreventivo.tsx:581-583`, `TabellaArticoli.tsx:161-163`: togliere i rami `winconfig`.
  - `types/permessi.ts`: togliere `winconfig` da `MODULI_APP`, `MODULO_LABELS`, `PERMESSI_ADMIN`, `PERMESSI_VUOTI`; `lib/permessi.ts:50` da `MODULO_HOME`.
  - `components/layout/Sidebar.tsx`: togliere la voce WinConfig e l'icona `Wrench` se non più usata.
  - `app/(dashboard)/rilievo/veloce/page.tsx` diventa:

```tsx
import { redirect } from 'next/navigation'

// Il rilievo veloce e' diventato il rilievo in cantiere con le strutture di FP PRO.
export default function RilievoVelocePage() {
  redirect('/rilievo/cantiere')
}
```

Run: `grep -rn -i "winconfig\|rilievo-veloce'\|getOpzioni" app components actions lib hooks types --include=*.ts --include=*.tsx` → nessun risultato tranne `types/rilievo-veloce.ts` (tipi ancora usati: `ClienteSnapshotRilievo`). Se `types/rilievo-veloce.ts` contiene tipi non più usati da nessuno, toglierli.

- [ ] **Step 4: Controllo e commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build` → tutto verde; nella build non compaiono più `/winconfig`, `/rilievo/veloce/nuovo`, `/rilievo/veloce/[id]`.

```bash
git add -A supabase/migrations/20261011140000_via_winconfig.sql app components actions lib types
git commit -m "chore: via WinConfig, rilievo veloce vecchio e opzioni in testo libero"
```

---

### Task 9: Prova dal vivo, revisione, rilascio

- [ ] **Step 1: Prova sul PC in sviluppo** (`npm run dev`, Chrome con strumenti per sviluppatori in modalità telefono): aprire `/rilievo/cantiere`, attendere lo scaricamento (contatore che sale fino a ~4.661 strutture + immagini), creare un rilievo, aggiungere una voce EKOS_66TH "03- Finestra 2 Ante" 1200×1400 con un colore e un vetro, una voce AL_50PLU monoblocco con traverso a 1200; verificare il disegno; mettere la rete "Offline" negli strumenti, aggiungere una terza voce, ricaricare la pagina... (in sviluppo il service worker è spento: la prova senza rete con riapertura si fa in produzione, Step 4); rimettere la rete e verificare "Tutto inviato" e, con `execute_sql`, le 3 voci in `rilievo_veloce_voci` con `fp` valorizzato.
- [ ] **Step 2: Interruzione dello scaricamento**: svuotare IndexedDB, avviare lo scaricamento, chiudere la scheda a metà, riaprire: il contatore riparte senza ricominciare da zero (cursore in `fpMeta`).
- [ ] **Step 3: Revisione finale** del ramo (come fasi 1-2), correzioni, merge su `master`, push, eliminazione del ramo.
- [ ] **Step 4: Prova in produzione dal telefono** (con l'utente): installare/aprire la PWA, aprire Rilievo in cantiere e lasciare scaricare (Wi-Fi), poi modalità aereo, chiudere e riaprire l'app: la pagina si apre, si inserisce una voce; togliere la modalità aereo: la voce viene inviata.
- [ ] **Step 5: Memoria e PRD**: `project_catalogo_fp.md` (fase 3: pagina unica, Dexie v6, regole di unione, 5 invarianti: niente navigazioni nella pagina del cantiere, `daInviare`, vince il più recente, cursori di scaricamento, foto solo con rete), PRD: fase 3 fatta, WinConfig rimosso.
