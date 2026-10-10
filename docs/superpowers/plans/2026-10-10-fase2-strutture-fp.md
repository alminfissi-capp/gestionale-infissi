# Fase 2 — Strutture di FP PRO in WinStudio: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** il ponte legge tutte le strutture `.STR` di FP PRO (4.661 file) e le copia in WinStudio; nel Catalogo FP PRO una scheda "Strutture" le mostra per serie e cartella, con immagine, disegno vettoriale, pezzi e kit.

**Architecture:** come la fase 1. Il ponte legge i file con Node, li trasforma con `fast-xml-parser` in un oggetto JS e passa l'oggetto alla funzione pura `strutturaDaXml` (`lib/fppro/strutture-xml.ts`, senza import, testata su due file veri). Converte l'immagine BMP incorporata in PNG (`lib/fppro/bmp.ts` + `pngjs`) e la carica nel bucket privato `fp-strutture`. Rilegge solo i file cambiati (data e dimensione). La pagina legge `fp_strutture` e usa le funzioni pure di `lib/fppro/strutture.ts` per disegno, elenco pezzi e accessori.

**Tech Stack:** come fase 1 + `fast-xml-parser` 4.x (ponte e test), `pngjs` 7.x (ponte), Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-10-10-rilievo-preventivo-fppro-design.md` (§12 Fase 2) + design approvato in chat il 2026-10-10:
- importare **tutte** le strutture della cartella STR di EDILSIDER (ALM, SOLUZIONE SERRAMENTO, EDILSIDER SPA, DEMO), filtrabili per serie e cartella;
- serie di una struttura = cartelle DXF dei profili di telaio (tipo 8050), in ordine; le strutture miste stanno in più serie;
- immagine di FP PRO (BMP incorporato) convertita in PNG su Storage; disegno vettoriale dai poligoni `FP_PREV_PIECE` alle misure nominali; il ridimensionamento con le misure del rilievo è della fase 3;
- rilettura solo dei file cambiati (data + dimensione).

## Global Constraints

- Cartella sorgente: `STR_PATH` di `C:\FP_PRO\CONFIGS\EDILSIDER\CONF_FPP.INI` (oggi `C:\FP_PRO\ARCHIVI_EDILSIDER_NEW\STR\`). Il ponte **legge soltanto**: non scrive mai nelle cartelle di FP PRO.
- I file `.STR` sono XML in Windows-1252: decodificarli con `new TextDecoder('windows-1252')`.
- `lib/fppro/strutture-xml.ts` e `lib/fppro/bmp.ts` sono usati dal ponte: **nessun import**. `lib/fppro/strutture.ts` è solo dell'app.
- Tutte le regole della fase 1 restano valide (RLS con `get_user_organization_id()`, `numeric` senza precisione, segreti solo nei `.env` locali, lint a zero, testi in italiano, una sola richiesta aperta, controllo della sorgente prima di scrivere, righe sparite = `presente=false`).
- Bucket `fp-strutture` privato; percorso file `<organization_id>/<sha1 del percorso relativo>.png`; lettura dall'app con URL firmati (1 ora).
- Una struttura che non si riesce a leggere non ferma la sincronizzazione: si salva con `errore` valorizzato e si conta in `fp_strutture_errori`.
- Tempo massimo di una sincronizzazione: **60 minuti** (la prima, con 4.661 file, è lunga); una richiesta "in corso" è bloccata dopo **90 minuti**.

## Review Focus

1. **Cartella STR spostata o non raggiungibile** (FP PRO reinstallato, disco esterno): la sincronizzazione deve fermarsi con un messaggio chiaro **senza** segnare tutte le strutture "non presenti" → test in Task 5 (`verificaCartellaStrutture` con 0 file).
2. **Un file `.STR` rovinato o di una versione diversa di FP PRO** (tag mancanti, anteprima vuota, nessuna immagine): non deve fermare le altre 4.660 → test in Task 2 (`strutturaDaXml` su XML minimo senza anteprima/immagine) e gestione `errore` per file nel Task 5.
3. **Prima sincronizzazione lunga** (4.661 file, ~4,5 GB): non deve essere uccisa dal tempo massimo né dallo sblocco automatico → costanti a 60/90 min con test in Task 5 (`richiestaBloccata` a 40 e 100 minuti).
4. **Nomi di file con spazi, `+`, accenti o caratteri strani** (`01-SLIDE65-F2A+AL50PLUS.STR`, `BOX LATERALE FISSO .STR`): il percorso nello Storage non deve dipendere dal nome → sha1 del percorso; verificato sul primo giro reale (Task 5).
5. **Struttura senza poligoni o senza immagine** (2 file su 4.661 senza anteprima): la scheda e il dettaglio devono mostrare un segnaposto, non rompersi → test in Task 4 (`vistaPoligoni([])`) e componenti del Task 6.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261011100000_strutture_fp.sql` | tabella `fp_strutture`, viste filtri, bucket `fp-strutture` |
| `types/fppro.ts` (modifica) | tipi delle strutture per l'app |
| `lib/fppro/strutture-xml.ts` | opzioni XML + oggetto XML → `StrutturaLetta` (albero, serie, poligoni, immagine) |
| `lib/fppro/__fixtures__/*.str.xml` | due strutture vere senza immagine, per i test |
| `lib/fppro/bmp.ts` | BMP non compresso 24/32 bit → RGBA |
| `lib/fppro/strutture.ts` | etichette tipi, riassunto pezzi, accessori e regole, vista SVG dei poligoni |
| `lib/fppro/ponte-regole.ts` (modifica) | tempo massimo richiesta 90 min |
| `ponte/src/sincronizza-strutture.ts` | legge la cartella STR, confronta, scrive righe e immagini |
| `ponte/src/sincronizza.ts`, `ponte/src/ponte.ts`, `ponte/src/config.ts`, `ponte/crea-env.ps1`, `ponte/package.json` (modifiche) | aggancio della sync strutture, `FP_STR_PATH`, dipendenze, 60 min |
| `actions/catalogo-fp.ts` (modifica) | filtri, ricerca e dettaglio strutture |
| `components/catalogo-fp/StruttureFp.tsx` | filtri + griglia schede |
| `components/catalogo-fp/DettaglioStrutturaFp.tsx` | finestra con disegno, pezzi, kit e accessori |
| `components/catalogo-fp/CatalogoFpClient.tsx` (modifica) | scheda "Strutture" |

---

### Task 1: Tabella, viste e bucket delle strutture

**Files:**
- Create: `supabase/migrations/20261011100000_strutture_fp.sql`
- Modify: `types/fppro.ts` (in fondo)

**Interfaces:**
- Produces: tabella `fp_strutture` (chiave `UNIQUE (organization_id, percorso)`), viste `fp_strutture_serie(organization_id, serie, strutture)` e `fp_strutture_cartelle(organization_id, cartella, strutture)`, bucket `fp-strutture`; tipi `StrutturaFpRiga`, `StrutturaFpDettaglio`, `FiltriStrutture` (Task 6).

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/strutture-fp
```

- [ ] **Step 2: Migration**

`supabase/migrations/20261011100000_strutture_fp.sql`:

```sql
-- ============================================================
-- 20261011100000_strutture_fp.sql
-- Strutture (tipologie) di FP PRO: fase 2 del progetto rilievo -> preventivo -> FP PRO.
-- Le scrive solo il ponte sul PC; una riga per file .STR, chiave = percorso
-- relativo alla cartella STR di FP PRO. errore valorizzato = file non leggibile
-- (resta in tabella per non rileggerlo a ogni giro finche' non cambia).
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_strutture (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  percorso         text NOT NULL,
  cartella         text NOT NULL,
  nome             text NOT NULL,
  codice           text,
  descrizione      text,
  serie            text[] NOT NULL DEFAULT '{}',
  l_nominale       numeric,
  h_nominale       numeric,
  albero           jsonb NOT NULL DEFAULT '[]',
  poligoni         jsonb NOT NULL DEFAULT '[]',
  immagine         text,
  errore           text,
  file_mtime       timestamptz NOT NULL,
  file_size        bigint NOT NULL,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, percorso)
);
CREATE INDEX IF NOT EXISTS idx_fp_strutture_serie ON fp_strutture USING gin (serie);
CREATE INDEX IF NOT EXISTS idx_fp_strutture_cartella ON fp_strutture(organization_id, cartella);

ALTER TABLE fp_strutture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_strutture_select" ON fp_strutture
  FOR SELECT USING (organization_id = get_user_organization_id());

-- Conteggi per i filtri della pagina (security_invoker: valgono le RLS di chi legge).
CREATE OR REPLACE VIEW fp_strutture_serie WITH (security_invoker = true) AS
  SELECT organization_id, s AS serie, count(*)::int AS strutture
  FROM fp_strutture, unnest(serie) AS s
  WHERE presente
  GROUP BY organization_id, s;

CREATE OR REPLACE VIEW fp_strutture_cartelle WITH (security_invoker = true) AS
  SELECT organization_id, cartella, count(*)::int AS strutture
  FROM fp_strutture
  WHERE presente
  GROUP BY organization_id, cartella;

-- Immagini delle strutture (PNG convertiti dal BMP che FP PRO salva nel file).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fp-strutture', 'fp-strutture', false, 1048576, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fp_strutture_img_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fp-strutture' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );
```

- [ ] **Step 3: Applicare e verificare**

Con `apply_migration` (nome `strutture_fp`). Poi `execute_sql`:

```sql
select
  (select count(*) from information_schema.tables where table_name in ('fp_strutture','fp_strutture_serie','fp_strutture_cartelle')) oggetti,
  (select count(*) from storage.buckets where id = 'fp-strutture') bucket;
```
Expected: `oggetti` = 3, `bucket` = 1.

- [ ] **Step 4: Tipi dell'app**

In fondo a `types/fppro.ts`:

```ts
export type { NodoStruttura, PezzoStruttura, AccessorioStruttura, KitStruttura } from '@/lib/fppro/strutture-xml'
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'

/** Riga della griglia strutture. */
export interface StrutturaFpRiga {
  id: string
  percorso: string
  cartella: string
  nome: string
  codice: string | null
  descrizione: string | null
  serie: string[]
  l_nominale: number | null
  h_nominale: number | null
  /** URL firmato dell'immagine (1 ora), null se manca */
  immagineUrl: string | null
  errore: string | null
}

export interface StrutturaFpDettaglio extends StrutturaFpRiga {
  albero: NodoStruttura[]
  /** Poligoni piatti [x1, y1, x2, y2, ...] alle misure nominali */
  poligoni: number[][]
}

export interface FiltriStrutture {
  serie: { serie: string; strutture: number }[]
  cartelle: { cartella: string; strutture: number }[]
}
```

(`types/fppro.ts` può importare da `lib/fppro/strutture-xml.ts`: il divieto di import vale al contrario, per i file di `lib/fppro` usati dal ponte.)

L'import di tipo va in cima al file insieme agli altri import, se il lint lo richiede (`import/first`).

- [ ] **Step 5: Commit** (dopo il Task 2, perché i tipi importano `strutture-xml.ts`): rimandato al commit del Task 2.

---

### Task 2: Lettura delle strutture (`lib/fppro/strutture-xml.ts`)

**Files:**
- Create: `lib/fppro/strutture-xml.ts`, `lib/fppro/__fixtures__/ekos-2-ante.str.xml`, `lib/fppro/__fixtures__/al50plus-monoblocco.str.xml`
- Test: `lib/fppro/strutture-xml.test.ts`
- Modify: `package.json` (devDependency `fast-xml-parser`)

**Interfaces:**
- Consumes: niente (nessun import).
- Produces:
  - `OPZIONI_XML` (da passare a `new XMLParser(OPZIONI_XML)`)
  - `interface PezzoStruttura { tipo: number; dxf: string; serie: string; indice: number }`
  - `interface AccessorioStruttura { codice: string; descrizione: string; serie: string; tipo: number; quantita: number; dimRif: number; dimCalcolo: number; min: number | null; max: number | null; passo: number | null; formula: string | null; opzionale: boolean; confermato: boolean }`
  - `interface KitStruttura { codice: string; descrizione: string; serie: string; opzionale: boolean; confermato: boolean; accessori: AccessorioStruttura[] }`
  - `interface NodoStruttura { tipo: number; codice: number; elementi: number; x: number | null; y: number | null; prm: { nome: string; variabili: Record<string, number> }[]; macro: Record<string, string> | null; ante: Record<string, string>[]; ird: string[]; pezzi: PezzoStruttura[]; accessori: AccessorioStruttura[]; kit: KitStruttura[]; figli: NodoStruttura[] }`
  - `interface StrutturaLetta { codice: string | null; descrizione: string | null; lNominale: number | null; hNominale: number | null; serie: string[]; albero: NodoStruttura[]; poligoni: number[][]; immagineBase64: string | null }`
  - `strutturaDaXml(doc: unknown): StrutturaLetta` (lancia se manca `FP_TREE`)

- [ ] **Step 1: Dipendenza e file di prova**

Run: `npm install --save-dev fast-xml-parser@^4.5.0`

Creare i due file di prova (strutture vere dell'utente, senza le immagini base64 che pesano ~1 MB):

```bash
mkdir -p lib/fppro/__fixtures__
python - <<'EOF'
import re
coppie = [
  (r'C:\FP_PRO\ARCHIVI_EDILSIDER_NEW\STR\ALM\EKOS 66TH\03- Finestra 2 Ante.STR', 'lib/fppro/__fixtures__/ekos-2-ante.str.xml'),
  (r'C:\FP_PRO\ARCHIVI_EDILSIDER_NEW\STR\ALM\AL50PLUS\01-SLIDE65-F2A+AL50PLUS.STR', 'lib/fppro/__fixtures__/al50plus-monoblocco.str.xml'),
]
for sorgente, destinazione in coppie:
    testo = open(sorgente, encoding='cp1252').read()
    # Tiene <picture> ma con un'immagine finta di 4 caratteri; toglie la vista alternativa.
    testo = re.sub(r'<picture><!\[CDATA\[.*?\]\]></picture>', '<picture><![CDATA[Qk0=]]></picture>', testo, flags=re.S)
    testo = re.sub(r'<picture_alt_sight>.*?</picture_alt_sight>', '', testo, flags=re.S)
    open(destinazione, 'w', encoding='cp1252', newline='\n').write(testo)
    print(destinazione, len(testo))
EOF
```
Expected: due file da circa 16 KB e 90 KB.

- [ ] **Step 2: Test (falliscono)**

`lib/fppro/strutture-xml.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml, type NodoStruttura } from './strutture-xml'

const leggi = (nome: string) => {
  const byte = readFileSync(join(__dirname, '__fixtures__', nome))
  return new XMLParser(OPZIONI_XML).parse(new TextDecoder('windows-1252').decode(byte))
}

const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])

describe('EKOS 66TH finestra 2 ante', () => {
  const s = strutturaDaXml(leggi('ekos-2-ante.str.xml'))

  it('testata: codice, descrizione decodificata, misure nominali, serie', () => {
    expect(s.codice).toBe('PL62UCVIF2AR')
    expect(s.descrizione).toBe('03- Finestra 2 Ante')
    expect(s.lNominale).toBe(1300)
    expect(s.hNominale).toBe(1500)
    expect(s.serie).toEqual(['EKOS_66TH'])
  })

  it('albero: telaio -> anta battente a 2 ante -> 2 vetri', () => {
    expect(s.albero).toHaveLength(1)
    const telaio = s.albero[0]
    expect(telaio.tipo).toBe(8600)
    expect(telaio.prm[0]).toEqual({ nome: 'MODEL-00', variabili: { L: 1300, H: 1500 } })
    expect(telaio.pezzi.map(p => p.tipo)).toEqual([8050, 8050, 8050, 8050])
    expect(telaio.pezzi[0]).toEqual({ tipo: 8050, dxf: 'EKOS_66TH\\ES24500170.DXF', serie: 'EKOS_66TH', indice: 0 })
    const anta = telaio.figli[0]
    expect(anta.tipo).toBe(8610)
    expect(anta.elementi).toBe(2)
    expect(anta.macro?.MainSashIndex).toBe('1')
    expect(anta.ante).toHaveLength(2)
    expect(anta.pezzi.filter(p => p.tipo === 8090)).toHaveLength(8)
    expect(anta.pezzi.find(p => p.tipo === 8090 && p.indice === 1)).toBeTruthy()
    expect(anta.figli.map(f => f.tipo)).toEqual([8510, 8510])
    expect(anta.figli[0].pezzi[0].dxf).toBe('GLASSES\\4_15_33.1_S+G.DXF')
  })

  it('accessori: 19 in tutta la struttura, con quantita\' e tipo', () => {
    const acc = tutti(s.albero).flatMap(n => n.accessori)
    expect(acc).toHaveLength(19)
    expect(acc[0]).toMatchObject({ codice: '1125F', serie: 'EKOS 66TH', tipo: 1, quantita: 1 })
  })

  it('anteprima: 13 poligoni piatti [x, y, ...], immagine presente', () => {
    expect(s.poligoni).toHaveLength(13)
    expect(s.poligoni[0].length % 2).toBe(0)
    expect(s.immagineBase64).toBe('Qk0=')
  })
})

describe('monoblocco AL50PLUS + scorrevole SL65', () => {
  const s = strutturaDaXml(leggi('al50plus-monoblocco.str.xml'))

  it('appartiene a due serie, in ordine', () => {
    expect(s.serie).toEqual(['AL_50PLU', 'AL_SL65'])
  })
  it('8 kit con i loro accessori, opzionali e scelti', () => {
    const kit = tutti(s.albero).flatMap(n => n.kit)
    expect(kit).toHaveLength(8)
    expect(kit[0]).toMatchObject({ codice: 'AL-SLIDE65 KIT  2 ANTE', serie: 'AL_SISTEM', opzionale: false, confermato: true })
    expect(kit.some(k => k.opzionale && !k.confermato)).toBe(true)
  })
  it('traversi e montanti sono nodi dell\'albero', () => {
    const tipi = tutti(s.albero).map(n => n.tipo)
    expect(tipi).toContain(8070)
    expect(tipi).toContain(8060)
    expect(tipi).toContain(8620)
  })
  it('40 poligoni, misure 2447 x 2885', () => {
    expect(s.poligoni).toHaveLength(40)
    expect([s.lNominale, s.hNominale]).toEqual([2447, 2885])
  })
})

describe('file minimi o rovinati', () => {
  const parser = new XMLParser(OPZIONI_XML)
  it('senza anteprima, immagine, descrizione: si legge lo stesso', () => {
    const s = strutturaDaXml(parser.parse(
      '<FP_TREE NameStr="X"><FP_PREVIEW><FP_PREV_PIECE></FP_PREV_PIECE></FP_PREVIEW>' +
      '<FP_NODE ElementType="8600" Code="1"><FP_PIECE Type="8050" DXF="AL_45\\T1.DXF" /></FP_NODE></FP_TREE>',
    ))
    expect(s).toMatchObject({ codice: 'X', descrizione: null, poligoni: [], immagineBase64: null, serie: ['AL_45'] })
    expect([s.lNominale, s.hNominale]).toEqual([null, null])
  })
  it('senza FP_TREE: errore chiaro', () => {
    expect(() => strutturaDaXml(parser.parse('<ALTRO />'))).toThrow(/FP_TREE/)
  })
  it('serie ricavata dalle ante se non ci sono profili di telaio', () => {
    const s = strutturaDaXml(parser.parse(
      '<FP_TREE><FP_NODE ElementType="8610" Code="1"><FP_PIECE Type="8090" DXF="ED_ES40\\A1.DXF" /></FP_NODE></FP_TREE>',
    ))
    expect(s.serie).toEqual(['ED_ES40'])
  })
})
```

- [ ] **Step 3: Vederli fallire**

Run: `npx vitest run lib/fppro/strutture-xml.test.ts`
Expected: FAIL — modulo `./strutture-xml` non trovato.

- [ ] **Step 4: Implementazione**

`lib/fppro/strutture-xml.ts`:

```ts
/**
 * Lettura delle strutture (.STR) di FP PRO.
 *
 * Lo usa il ponte (Node, senza build): NESSUN import. Il ponte passa qui l'oggetto
 * prodotto da `new XMLParser(OPZIONI_XML).parse(testo)` di fast-xml-parser.
 *
 * Codici tipo (tabella tipi_utilizzi di FP PRO): 8050 telaio, 8060 montante,
 * 8070 traverso, 8090 anta battente, 8100 anta scorrevole, 8180 fermavetro,
 * 8500 pannello, 8510 vetro; nodi "macro": 8600 telaio, 8610 battente,
 * 8620 scorrevole, 8650 riempimento; -1 = foglia vuota.
 */

const RIPETUTI = new Set([
  'FP_NODE', 'FP_PIECE', 'FP_FITTING', 'FP_KIT', 'FP_PRM', 'FP_PRM_VAR', 'FP_IRD',
  'FP_MACRO_SASH', 'FP_PREV_PIECE', 'FP_VERTEX', 'FP_PATH_VERTEX', 'FP_VAR',
])

export const OPZIONI_XML = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
  isArray: (nome: string, _percorso: string, _foglia: boolean, attributo: boolean) =>
    !attributo && RIPETUTI.has(nome),
}

export interface PezzoStruttura {
  tipo: number
  dxf: string
  /** Cartella DXF in maiuscolo = nome della serie in FP PRO (es. AL_50PLU) */
  serie: string
  /** Anta a cui appartiene il pezzo nei nodi con piu' ante (ElementIndex) */
  indice: number
}

export interface AccessorioStruttura {
  codice: string
  descrizione: string
  serie: string
  /** 1 = a pezzo, 2/4 = a metro */
  tipo: number
  quantita: number
  dimRif: number
  dimCalcolo: number
  min: number | null
  max: number | null
  passo: number | null
  formula: string | null
  opzionale: boolean
  confermato: boolean
}

export interface KitStruttura {
  codice: string
  descrizione: string
  serie: string
  opzionale: boolean
  /** Per i kit opzionali: quello scelto nella struttura */
  confermato: boolean
  accessori: AccessorioStruttura[]
}

export interface NodoStruttura {
  tipo: number
  codice: number
  /** Numero di elementi (es. ante) del nodo */
  elementi: number
  x: number | null
  y: number | null
  prm: { nome: string; variabili: Record<string, number> }[]
  macro: Record<string, string> | null
  ante: Record<string, string>[]
  ird: string[]
  pezzi: PezzoStruttura[]
  accessori: AccessorioStruttura[]
  kit: KitStruttura[]
  figli: NodoStruttura[]
}

export interface StrutturaLetta {
  codice: string | null
  descrizione: string | null
  lNominale: number | null
  hNominale: number | null
  serie: string[]
  albero: NodoStruttura[]
  /** Un poligono per pezzo, piatto: [x1, y1, x2, y2, ...] */
  poligoni: number[][]
  immagineBase64: string | null
}

type Ogg = Record<string, unknown>

const ogg = (v: unknown): Ogg => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Ogg) : {})
const lista = (v: unknown): Ogg[] => (Array.isArray(v) ? v.map(ogg) : v === undefined || v === '' ? [] : [ogg(v)])
const testo = (v: unknown): string | null => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const num = (v: unknown): number | null => {
  const s = testo(v)
  if (s === null) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const vero = (v: unknown): boolean => {
  const n = num(v)
  return n !== null && n !== 0
}
const tondo = (n: number) => Math.round(n * 10) / 10

function serieDaDxf(dxf: string): string {
  const i = dxf.indexOf('\\')
  return i > 0 ? dxf.slice(0, i).toUpperCase() : ''
}

function daBase64(b64: string): string | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''))
    const byte = Uint8Array.from(bin, c => c.charCodeAt(0))
    return testo(new TextDecoder('windows-1252').decode(byte))
  } catch {
    return null
  }
}

function attributi(o: Ogg): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string') out[k] = v
  return out
}

function accessorio(f: Ogg): AccessorioStruttura {
  return {
    codice: testo(f.Code) ?? '',
    descrizione: testo(f.Description) ?? '',
    serie: testo(f.Serie) ?? '',
    tipo: num(f.Type) ?? 1,
    quantita: num(f.Multiply) ?? 1,
    dimRif: num(f.RefDim) ?? 0,
    dimCalcolo: num(f.CalcDim) ?? 0,
    min: num(f.RMin),
    max: num(f.RMax),
    passo: num(f.Step),
    formula: testo(f.RFormula),
    opzionale: vero(f.Optional),
    confermato: f.Confirmed === undefined ? true : vero(f.Confirmed),
  }
}

function nodo(n: Ogg): NodoStruttura {
  const macro = lista(n.FP_MACRO)[0]
  return {
    tipo: num(n.ElementType) ?? -1,
    codice: num(n.Code) ?? 0,
    elementi: num(n.ElementNumber) ?? 1,
    x: num(n.xinsert),
    y: num(n.yinsert),
    prm: lista(n.FP_PRM).map(p => ({
      nome: testo(p.Name) ?? '',
      variabili: Object.fromEntries(
        lista(p.FP_PRM_VAR).map(v => [testo(v.VarName) ?? '', num(v.VarValue) ?? 0]),
      ),
    })),
    macro: macro ? attributi(macro) : null,
    ante: macro ? lista(macro.FP_MACRO_SASH).map(attributi) : [],
    ird: lista(n.FP_IRD).map(i => testo(i.FileName) ?? ''),
    pezzi: lista(n.FP_PIECE).map(p => {
      const dxf = testo(p.DXF) ?? ''
      return { tipo: num(p.Type) ?? 0, dxf, serie: serieDaDxf(dxf), indice: num(p.ElementIndex) ?? 0 }
    }),
    accessori: lista(n.FP_FITTING).map(accessorio),
    kit: lista(n.FP_KIT).map(k => ({
      codice: testo(k.Code) ?? '',
      descrizione: testo(k.Description) ?? '',
      serie: testo(k.Serie) ?? '',
      opzionale: vero(k.Optional),
      confermato: k.Confirmed === undefined ? true : vero(k.Confirmed),
      accessori: lista(k.FP_FITTING).map(accessorio),
    })),
    figli: lista(n.FP_NODE).map(nodo),
  }
}

function tuttiPezzi(nodi: NodoStruttura[]): PezzoStruttura[] {
  return nodi.flatMap(n => [...n.pezzi, ...tuttiPezzi(n.figli)])
}

/** Serie = cartelle DXF dei profili di telaio; in mancanza, delle ante; poi di qualunque profilo. */
function serieStruttura(albero: NodoStruttura[]): string[] {
  const pezzi = tuttiPezzi(albero)
  const esclusi = new Set(['', 'GLASSES', 'PANELS'])
  const da = (tipi: number[] | null) => [...new Set(
    pezzi.filter(p => (tipi === null || tipi.includes(p.tipo)) && !esclusi.has(p.serie)).map(p => p.serie),
  )]
  for (const tipi of [[8050], [8090, 8100], null]) {
    const s = da(tipi)
    if (s.length > 0) return s
  }
  return []
}

function ingombro(punti: number[][]): { l: number; h: number } | null {
  const xs = punti.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = punti.flatMap(p => p.filter((_, i) => i % 2 === 1))
  if (xs.length === 0) return null
  return { l: tondo(Math.max(...xs) - Math.min(...xs)), h: tondo(Math.max(...ys) - Math.min(...ys)) }
}

export function strutturaDaXml(doc: unknown): StrutturaLetta {
  const radice = ogg(doc).FP_TREE
  if (radice === undefined) throw new Error('Non e\' una struttura di FP PRO: manca FP_TREE')
  const t = ogg(radice)

  const albero = lista(t.FP_NODE).map(nodo)
  const anteprima = ogg(t.FP_PREVIEW)
  const poligoni = lista(anteprima.FP_PREV_PIECE)
    .map(p => lista(p.FP_VERTEX).flatMap(v => [tondo(num(v.x) ?? 0), tondo(num(v.y) ?? 0)]))
    .filter(p => p.length >= 6)

  // Misure nominali: variabili L/H del modello del telaio, altrimenti ingombro dell'anteprima.
  const modello = albero.flatMap(n => n.prm).find(p => p.variabili.L !== undefined && p.variabili.H !== undefined)
  const percorso = lista(anteprima.FP_PATH_VERTEX).map(v => [num(v.x) ?? 0, num(v.y) ?? 0])
  const misure = modello
    ? { l: modello.variabili.L, h: modello.variabili.H }
    : ingombro(percorso.length > 0 ? [percorso.flat()] : poligoni)

  const descrizione = ogg(t.FP_DESCRIPTION)
  const cdata = testo(descrizione.__cdata)

  return {
    codice: testo(t.NameStr),
    descrizione: cdata === null ? null : descrizione.DescrB64 !== undefined ? daBase64(cdata) : cdata,
    lNominale: misure?.l ?? null,
    hNominale: misure?.h ?? null,
    serie: serieStruttura(albero),
    albero,
    poligoni,
    immagineBase64: testo(ogg(t.picture).__cdata),
  }
}
```

- [ ] **Step 5: Vederli passare**

Run: `npx vitest run lib/fppro/strutture-xml.test.ts`
Expected: PASS, tutti.

Se un'aspettativa sui conteggi (19 accessori, 8 kit, 13/40 poligoni) non torna: ricontare sul file sorgente con `grep -c` prima di toccare il codice. I numeri vengono dal file vero (verificati il 2026-10-10).

- [ ] **Step 6: Commit (insieme ai Task 1)**

```bash
git add supabase/migrations/20261011100000_strutture_fp.sql types/fppro.ts lib/fppro/strutture-xml.ts lib/fppro/strutture-xml.test.ts lib/fppro/__fixtures__ package.json package-lock.json
git commit -m "feat(strutture-fp): tabella strutture e lettura dei file .STR di FP PRO"
```

---

### Task 3: Immagine BMP → RGBA (`lib/fppro/bmp.ts`)

**Files:**
- Create: `lib/fppro/bmp.ts`
- Test: `lib/fppro/bmp.test.ts`

**Interfaces:**
- Produces: `bmpInRgba(b: Uint8Array): { larghezza: number; altezza: number; rgba: Uint8Array }` (lancia su formati non supportati).

- [ ] **Step 1: Test (falliscono)**

`lib/fppro/bmp.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bmpInRgba } from './bmp'

/** BMP non compresso: pixel in BGR(A), righe dal basso, ogni riga allineata a 4 byte. */
function creaBmp(larghezza: number, altezza: number, bpp: 24 | 32, pixel: [number, number, number][], dallAlto = false): Uint8Array {
  const byte = bpp / 8
  const passo = Math.ceil((larghezza * bpp) / 32) * 4
  const dati = new Uint8Array(54 + passo * altezza)
  const v = new DataView(dati.buffer)
  dati[0] = 0x42; dati[1] = 0x4d
  v.setUint32(2, dati.length, true)
  v.setUint32(10, 54, true)
  v.setUint32(14, 40, true)
  v.setInt32(18, larghezza, true)
  v.setInt32(22, dallAlto ? -altezza : altezza, true)
  v.setUint16(26, 1, true)
  v.setUint16(28, bpp, true)
  v.setUint32(30, 0, true)
  for (let y = 0; y < altezza; y++) {
    const riga = dallAlto ? y : altezza - 1 - y
    for (let x = 0; x < larghezza; x++) {
      const [r, g, b] = pixel[y * larghezza + x]
      const o = 54 + riga * passo + x * byte
      dati[o] = b; dati[o + 1] = g; dati[o + 2] = r
      if (bpp === 32) dati[o + 3] = 0 // FP PRO salva alfa a 0: va ignorato
    }
  }
  return dati
}

const ROSSO: [number, number, number] = [255, 0, 0]
const VERDE: [number, number, number] = [0, 255, 0]
const BLU: [number, number, number] = [0, 0, 255]
const BIANCO: [number, number, number] = [255, 255, 255]

describe('bmpInRgba', () => {
  it('32 bit dal basso (come FP PRO): pixel in ordine dall\'alto, alfa pieno', () => {
    const r = bmpInRgba(creaBmp(2, 2, 32, [ROSSO, VERDE, BLU, BIANCO]))
    expect([r.larghezza, r.altezza]).toEqual([2, 2])
    expect(Array.from(r.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
  })
  it('24 bit con righe da allineare (larghezza 3)', () => {
    const r = bmpInRgba(creaBmp(3, 1, 24, [ROSSO, VERDE, BLU]))
    expect(Array.from(r.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
  })
  it('altezza negativa = righe dall\'alto', () => {
    const r = bmpInRgba(creaBmp(1, 2, 24, [ROSSO, BLU], true))
    expect(Array.from(r.rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255])
  })
  it('non e\' un BMP', () => {
    expect(() => bmpInRgba(new Uint8Array([1, 2, 3]))).toThrow(/BMP/)
  })
  it('BMP a 8 bit (con palette) non supportato', () => {
    const b = creaBmp(1, 1, 24, [ROSSO])
    new DataView(b.buffer).setUint16(28, 8, true)
    expect(() => bmpInRgba(b)).toThrow(/non supportato/)
  })
})
```

- [ ] **Step 2: Vederli fallire**

Run: `npx vitest run lib/fppro/bmp.test.ts`
Expected: FAIL — modulo `./bmp` non trovato.

- [ ] **Step 3: Implementazione**

`lib/fppro/bmp.ts`:

```ts
/**
 * BMP non compresso (24 o 32 bit) -> pixel RGBA dall'alto in basso.
 * Usato dal ponte (Node, senza build) per convertire l'immagine che FP PRO salva
 * dentro ogni .STR (300x300, 32 bit, alfa a 0): nessun import.
 */
export function bmpInRgba(b: Uint8Array): { larghezza: number; altezza: number; rgba: Uint8Array } {
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) throw new Error('Immagine non valida: non e\' un BMP')
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const inizio = v.getUint32(10, true)
  const larghezza = v.getInt32(18, true)
  const altezzaGrezza = v.getInt32(22, true)
  const bpp = v.getUint16(28, true)
  const compressione = v.getUint32(30, true)
  if (compressione !== 0 || (bpp !== 24 && bpp !== 32)) {
    throw new Error(`BMP non supportato: ${bpp} bit, compressione ${compressione}`)
  }
  const altezza = Math.abs(altezzaGrezza)
  const dalBasso = altezzaGrezza > 0
  const passo = Math.ceil((larghezza * bpp) / 32) * 4
  const byte = bpp / 8
  if (inizio + passo * altezza > b.length) throw new Error('BMP troncato')

  const rgba = new Uint8Array(larghezza * altezza * 4)
  for (let y = 0; y < altezza; y++) {
    const riga = dalBasso ? altezza - 1 - y : y
    for (let x = 0; x < larghezza; x++) {
      const s = inizio + riga * passo + x * byte
      const d = (y * larghezza + x) * 4
      rgba[d] = b[s + 2]
      rgba[d + 1] = b[s + 1]
      rgba[d + 2] = b[s]
      rgba[d + 3] = 255
    }
  }
  return { larghezza, altezza, rgba }
}
```

- [ ] **Step 4: Vederli passare**

Run: `npx vitest run lib/fppro/bmp.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add lib/fppro/bmp.ts lib/fppro/bmp.test.ts
git commit -m "feat(strutture-fp): conversione dell'immagine BMP delle strutture"
```

---

### Task 4: Regole per la pagina (`lib/fppro/strutture.ts`)

**Files:**
- Create: `lib/fppro/strutture.ts`
- Test: `lib/fppro/strutture.test.ts`

**Interfaces:**
- Consumes: `NodoStruttura`, `AccessorioStruttura`, `KitStruttura` (Task 2).
- Produces:
  - `etichettaTipo(tipo: number): string`
  - `riassuntoPezzi(albero: NodoStruttura[]): { ruolo: string; profilo: string; serie: string; quantita: number }[]`
  - `regolaQuantita(a: AccessorioStruttura): string`
  - `accessoriStruttura(albero: NodoStruttura[]): { accessori: AccessorioStruttura[]; kit: KitStruttura[] }`
  - `vistaPoligoni(poligoni: number[][]): { viewBox: string; punti: string[] } | null`

- [ ] **Step 1: Test (falliscono)**

`lib/fppro/strutture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AccessorioStruttura, NodoStruttura } from './strutture-xml'
import { accessoriStruttura, etichettaTipo, regolaQuantita, riassuntoPezzi, vistaPoligoni } from './strutture'

const nodo = (p: Partial<NodoStruttura>): NodoStruttura => ({
  tipo: -1, codice: 0, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [],
  pezzi: [], accessori: [], kit: [], figli: [], ...p,
})
const acc = (p: Partial<AccessorioStruttura>): AccessorioStruttura => ({
  codice: 'A', descrizione: '', serie: '', tipo: 1, quantita: 1, dimRif: 0, dimCalcolo: 0,
  min: null, max: null, passo: null, formula: null, opzionale: false, confermato: true, ...p,
})

describe('etichettaTipo', () => {
  it('nomi italiani dei codici di FP PRO', () => {
    expect(etichettaTipo(8050)).toBe('Telaio')
    expect(etichettaTipo(8070)).toBe('Traverso')
    expect(etichettaTipo(8510)).toBe('Vetro')
    expect(etichettaTipo(9999)).toBe('Tipo 9999')
  })
})

describe('riassuntoPezzi', () => {
  it('conta i pezzi uguali in tutto l\'albero, in ordine di tipo', () => {
    const albero = [nodo({
      tipo: 8600,
      pezzi: [8050, 8050, 8050, 8050].map(t => ({ tipo: t, dxf: 'EKOS_66TH\\ES24500170.DXF', serie: 'EKOS_66TH', indice: 0 })),
      figli: [nodo({
        tipo: 8610,
        pezzi: [{ tipo: 8090, dxf: 'EKOS_66TH\\ES24500319.DXF', serie: 'EKOS_66TH', indice: 0 }],
        figli: [nodo({ tipo: 8510, pezzi: [{ tipo: 8510, dxf: 'GLASSES\\4_15_4.DXF', serie: 'GLASSES', indice: 0 }] })],
      })],
    })]
    expect(riassuntoPezzi(albero)).toEqual([
      { ruolo: 'Telaio', profilo: 'ES24500170', serie: 'EKOS_66TH', quantita: 4 },
      { ruolo: 'Anta battente', profilo: 'ES24500319', serie: 'EKOS_66TH', quantita: 1 },
      { ruolo: 'Vetro', profilo: '4_15_4', serie: 'GLASSES', quantita: 1 },
    ])
  })
})

describe('regolaQuantita', () => {
  it('fissa', () => expect(regolaQuantita(acc({ quantita: 4 }))).toBe('4 pz'))
  it('a metro', () => expect(regolaQuantita(acc({ tipo: 2, quantita: 2 }))).toBe('2 × perimetro (m)'))
  it('a fascia di misura', () =>
    expect(regolaQuantita(acc({ quantita: 6, min: 2500.1, max: 5000 }))).toBe('6 pz se 2.500,1–5.000 mm'))
  it('a passo', () => expect(regolaQuantita(acc({ quantita: 2, passo: 500 }))).toBe('2 pz, 1 ogni 500 mm'))
  it('a formula', () => expect(regolaQuantita(acc({ quantita: 1, formula: 'w/2' }))).toBe('1 pz · formula w/2'))
})

describe('accessoriStruttura', () => {
  it('separa accessori sciolti e kit di tutto l\'albero', () => {
    const albero = [nodo({
      accessori: [acc({ codice: 'X1' })],
      figli: [nodo({ accessori: [acc({ codice: 'X2' })], kit: [{ codice: 'K', descrizione: '', serie: '', opzionale: true, confermato: false, accessori: [] }] })],
    })]
    const r = accessoriStruttura(albero)
    expect(r.accessori.map(a => a.codice)).toEqual(['X1', 'X2'])
    expect(r.kit.map(k => k.codice)).toEqual(['K'])
  })
})

describe('vistaPoligoni', () => {
  it('nessun poligono: niente disegno', () => expect(vistaPoligoni([])).toBeNull())
  it('capovolge la y (in FP PRO cresce verso l\'alto) e aggiunge un margine', () => {
    const v = vistaPoligoni([[0, 0, 0, 100, 50, 100]])
    expect(v).toEqual({ viewBox: '-5 -5 60 110', punti: ['0,100 0,0 50,0'] })
  })
})
```

- [ ] **Step 2: Vederli fallire**

Run: `npx vitest run lib/fppro/strutture.test.ts`
Expected: FAIL — modulo `./strutture` non trovato.

- [ ] **Step 3: Implementazione**

`lib/fppro/strutture.ts`:

```ts
// Regole della pagina Strutture (solo app: il ponte non lo usa).
import type { AccessorioStruttura, KitStruttura, NodoStruttura } from './strutture-xml'

const ETICHETTE: Record<number, string> = {
  8050: 'Telaio', 8060: 'Montante', 8070: 'Traverso', 8080: 'Cambio battuta',
  8090: 'Anta battente', 8100: 'Anta scorrevole', 8101: 'Anta scorrevole fissa',
  8110: 'Fascia', 8120: 'Zoccolo', 8130: 'Soglia', 8150: 'Riporto verticale',
  8160: 'Riporto orizzontale', 8170: 'Profilo multiuso', 8180: 'Fermavetro',
  8190: 'Compensatore', 8210: 'Incrocio ante scorrevoli', 8240: 'Riporto bilico (anta)',
  8250: 'Riporto bilico (telaio)', 8260: 'Sottozoccolo', 8270: 'Fermapannello',
  8280: 'Guida', 8290: 'Cassonetto', 8300: 'Ovalina o doga', 8500: 'Pannello', 8510: 'Vetro',
}

export function etichettaTipo(tipo: number): string {
  return ETICHETTE[tipo] ?? `Tipo ${tipo}`
}

const numeri = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

function nomeProfilo(dxf: string): string {
  const base = dxf.slice(dxf.lastIndexOf('\\') + 1)
  return base.replace(/\.dxf$/i, '')
}

export function riassuntoPezzi(albero: NodoStruttura[]): { ruolo: string; profilo: string; serie: string; quantita: number }[] {
  const conta = new Map<string, { tipo: number; profilo: string; serie: string; quantita: number }>()
  const visita = (nodi: NodoStruttura[]) => {
    for (const n of nodi) {
      for (const p of n.pezzi) {
        const chiave = `${p.tipo}|${p.dxf}`
        const r = conta.get(chiave)
        if (r) r.quantita++
        else conta.set(chiave, { tipo: p.tipo, profilo: nomeProfilo(p.dxf), serie: p.serie, quantita: 1 })
      }
      visita(n.figli)
    }
  }
  visita(albero)
  return [...conta.values()]
    .sort((a, b) => a.tipo - b.tipo || a.profilo.localeCompare(b.profilo))
    .map(r => ({ ruolo: etichettaTipo(r.tipo), profilo: r.profilo, serie: r.serie, quantita: r.quantita }))
}

export function regolaQuantita(a: AccessorioStruttura): string {
  const q = numeri.format(a.quantita)
  if (a.tipo === 2 || a.tipo === 4) return `${q} × perimetro (m)`
  if (a.min !== null && a.max !== null) return `${q} pz se ${numeri.format(a.min)}–${numeri.format(a.max)} mm`
  if (a.passo !== null && a.passo > 0) return `${q} pz, 1 ogni ${numeri.format(a.passo)} mm`
  if (a.formula) return `${q} pz · formula ${a.formula}`
  return `${q} pz`
}

export function accessoriStruttura(albero: NodoStruttura[]): { accessori: AccessorioStruttura[]; kit: KitStruttura[] } {
  const accessori: AccessorioStruttura[] = []
  const kit: KitStruttura[] = []
  const visita = (nodi: NodoStruttura[]) => {
    for (const n of nodi) {
      accessori.push(...n.accessori)
      kit.push(...n.kit)
      visita(n.figli)
    }
  }
  visita(albero)
  return { accessori, kit }
}

/** Poligoni di FP PRO (y verso l'alto) -> punti SVG (y verso il basso), con un margine del 2% del lato corto, minimo 5 mm. */
export function vistaPoligoni(poligoni: number[][]): { viewBox: string; punti: string[] } | null {
  if (poligoni.length === 0) return null
  const xs = poligoni.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = poligoni.flatMap(p => p.filter((_, i) => i % 2 === 1))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const margine = Math.max(5, Math.round(Math.min(maxX - minX, maxY - minY) * 0.02))
  const punti = poligoni.map(p => {
    const coppie: string[] = []
    for (let i = 0; i < p.length; i += 2) coppie.push(`${p[i] - minX},${maxY - p[i + 1]}`)
    return coppie.join(' ')
  })
  return {
    viewBox: `${-margine} ${-margine} ${maxX - minX + 2 * margine} ${maxY - minY + 2 * margine}`,
    punti,
  }
}
```

- [ ] **Step 4: Vederli passare**

Run: `npx vitest run lib/fppro/strutture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fppro/strutture.ts lib/fppro/strutture.test.ts
git commit -m "feat(strutture-fp): riassunto pezzi, regole accessori e disegno vettoriale"
```

---

### Task 5: Il ponte legge le strutture

**Files:**
- Create: `ponte/src/sincronizza-strutture.ts`
- Modify: `ponte/src/sincronizza.ts` (in fondo a `sincronizza`), `ponte/src/ponte.ts` (`SYNC_MAX_MS`, messaggio), `ponte/src/config.ts` (`strPath`), `ponte/crea-env.ps1` (`FP_STR_PATH`), `ponte/package.json` (dipendenze), `lib/fppro/ponte-regole.ts` + test (90 min), `lib/fppro/sync-tabelle.ts` + test (`verificaCartellaStrutture`)

**Interfaces:**
- Consumes: `OPZIONI_XML`, `strutturaDaXml` (Task 2); `bmpInRgba` (Task 3); `aBlocchi` (fase 1); tabella e bucket (Task 1).
- Produces: `sincronizzaStrutture(supabase: SupabaseClient, orgId: string, cartella: string): Promise<{ lette: number; scritte: number; errori: number; assenti: number }>`; `verificaCartellaStrutture(cartella: string, file: number): string | null`; esito della sync con chiavi `fp_strutture` e `fp_strutture_errori`; variabile `FP_STR_PATH`.

- [ ] **Step 1: Test delle regole (falliscono)**

In `lib/fppro/ponte-regole.test.ts` sostituire il blocco `describe('richiestaBloccata', ...)` con:

```ts
describe('richiestaBloccata', () => {
  const ora = new Date('2026-10-10T10:00:00Z')
  it('in corso da 40 minuti: la prima sync delle strutture e\' lunga, sta lavorando', () =>
    expect(richiestaBloccata('2026-10-10T09:20:00Z', ora)).toBe(false))
  it('in corso da 100 minuti: e\' bloccata', () =>
    expect(richiestaBloccata('2026-10-10T08:20:00Z', ora)).toBe(true))
  it('senza data di inizio non si giudica', () =>
    expect(richiestaBloccata(null, ora)).toBe(false))
})
```

In fondo a `lib/fppro/sync-tabelle.test.ts`:

```ts
describe('verificaCartellaStrutture', () => {
  it('cartella con file: ok', () => expect(verificaCartellaStrutture('C:\\FP_PRO\\STR', 4661)).toBeNull())
  it('cartella vuota o non trovata: si ferma senza toccare nulla', () => {
    const msg = verificaCartellaStrutture('C:\\FP_PRO\\STR', 0)
    expect(msg).toMatch(/C:\\FP_PRO\\STR/)
    expect(msg).toMatch(/nessun dato modificato/i)
  })
})
```

e aggiungere `verificaCartellaStrutture` all'import in cima al file.

Run: `npx vitest run lib/fppro`
Expected: FAIL — `richiestaBloccata` a 40 minuti dà `true`; `verificaCartellaStrutture` non è una funzione.

- [ ] **Step 2: Implementare le regole**

In `lib/fppro/ponte-regole.ts`:

```ts
/** Oltre questo tempo una richiesta "in corso" e' bloccata (la prima sync delle strutture puo' durare decine di minuti). */
export const TEMPO_MASSIMO_RICHIESTA_MS = 90 * 60 * 1000
```

e correggere il commento di `richiestaBloccata` ("Dopo 90 minuti si considera bloccata.").

In fondo a `lib/fppro/sync-tabelle.ts`:

```ts
/** La cartella delle strutture deve contenere file: vuota = spostata o non raggiungibile. */
export function verificaCartellaStrutture(cartella: string, file: number): string | null {
  if (file > 0) return null
  return `FP PRO: nessuna struttura .STR trovata in ${cartella} (cartella spostata o non raggiungibile?). ` +
    'Sincronizzazione delle strutture annullata, nessun dato modificato.'
}
```

Run: `npx vitest run lib/fppro`
Expected: PASS.

- [ ] **Step 3: Dipendenze e configurazione del ponte**

Run: `cd ponte && npm install fast-xml-parser@^4.5.0 pngjs@^7.0.0 && npm install --save-dev @types/pngjs@^6.0.5 && cd ..`

In `ponte/tsconfig.json`, aggiungere a `include`: `"../lib/fppro/strutture-xml.ts"`, `"../lib/fppro/bmp.ts"`.

In `ponte/src/config.ts`: aggiungere `strPath: string` all'interfaccia e `strPath: v('FP_STR_PATH'),` nell'oggetto.

In `ponte/crea-env.ps1`, nell'elenco `$righe` dopo `FP_MYSQL_DATABASE`:

```powershell
  # Senza barra finale: dentro le virgolette del .env \" chiuderebbe male il valore.
  "FP_STR_PATH=`"$((Valore $righeIni 'STR_PATH').TrimEnd(''))`"",
```

In `ponte/installa.ps1`, nella copia dei file di `lib`:

```powershell
Copy-Item "$repo\lib\fppro\sync-tabelle.ts", "$repo\lib\fppro\ponte-regole.ts", "$repo\lib\fppro\strutture-xml.ts", "$repo\lib\fppro\bmp.ts" "$Destinazione\lib\fppro\" -Force
```

In `ponte/src/ponte.ts`:

```ts
// La prima sync delle strutture (4.661 file) e' lunga: oltre 60 minuti e' appesa.
const SYNC_MAX_MS = 60 * 60 * 1000
```
e il messaggio: `'Sincronizzazione bloccata da oltre 60 minuti: interrotta. Riprova.'`. Portare `VERSIONE` a `'1.2.0'`.

- [ ] **Step 4: `ponte/src/sincronizza-strutture.ts`**

```ts
// Strutture .STR di FP PRO -> fp_strutture + immagini PNG nel bucket fp-strutture.
// Rilegge solo i file cambiati (data e dimensione). Un file illeggibile si salva con
// `errore` e non ferma gli altri.
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import { PNG } from 'pngjs'
import { bmpInRgba } from '../../lib/fppro/bmp.ts'
import { OPZIONI_XML, strutturaDaXml } from '../../lib/fppro/strutture-xml.ts'
import { aBlocchi, verificaCartellaStrutture } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

const PAGINA = 1000
const BLOCCO_RIGHE = 25
const BUCKET = 'fp-strutture'

interface Esistente {
  percorso: string
  file_mtime: string
  file_size: number
  presente: boolean
}

async function leggiEsistenti(supabase: SupabaseClient, orgId: string): Promise<Map<string, Esistente>> {
  const mappa = new Map<string, Esistente>()
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await supabase
      .from('fp_strutture').select('percorso, file_mtime, file_size, presente')
      .eq('organization_id', orgId).order('percorso').range(da, da + PAGINA - 1)
    if (error) throw new Error(`fp_strutture: ${error.message}`)
    for (const r of data as Esistente[]) mappa.set(r.percorso, r)
    if (data.length < PAGINA) return mappa
  }
}

function pngDaBase64(b64: string): Buffer {
  const { larghezza, altezza, rgba } = bmpInRgba(new Uint8Array(Buffer.from(b64, 'base64')))
  const png = new PNG({ width: larghezza, height: altezza })
  png.data = Buffer.from(rgba)
  return PNG.sync.write(png)
}

export async function sincronizzaStrutture(
  supabase: SupabaseClient,
  orgId: string,
  cartella: string,
): Promise<{ lette: number; scritte: number; errori: number; assenti: number }> {
  let voci: string[] = []
  try {
    voci = (await readdir(cartella, { recursive: true })).filter(f => f.toLowerCase().endsWith('.str'))
  } catch {
    voci = []
  }
  const problema = verificaCartellaStrutture(cartella, voci.length)
  if (problema) throw new Error(problema)

  const esistenti = await leggiEsistenti(supabase, orgId)
  const parser = new XMLParser(OPZIONI_XML)
  const decoder = new TextDecoder('windows-1252')
  const ora = new Date().toISOString()
  const visti = new Set<string>()
  const daScrivere: Record<string, unknown>[] = []
  let errori = 0
  let scritte = 0

  for (const voce of voci) {
    const percorso = voce.split(sep).join('/')
    visti.add(percorso)
    const pieno = join(cartella, voce)
    const info = await stat(pieno)
    const mtime = info.mtime.toISOString()
    const prima = esistenti.get(percorso)
    if (prima && prima.presente && new Date(prima.file_mtime).toISOString() === mtime && Number(prima.file_size) === info.size) continue

    const nomeFile = percorso.slice(percorso.lastIndexOf('/') + 1).replace(/\.str$/i, '')
    const base = {
      organization_id: orgId,
      percorso,
      cartella: percorso.includes('/') ? percorso.slice(0, percorso.indexOf('/')) : '(radice)',
      nome: nomeFile,
      file_mtime: mtime,
      file_size: info.size,
      presente: true,
      sincronizzato_at: ora,
    }
    try {
      const s = strutturaDaXml(parser.parse(decoder.decode(await readFile(pieno))))
      let immagine: string | null = null
      if (s.immagineBase64) {
        immagine = `${orgId}/${createHash('sha1').update(percorso).digest('hex')}.png`
        const { error } = await supabase.storage.from(BUCKET)
          .upload(immagine, pngDaBase64(s.immagineBase64), { contentType: 'image/png', upsert: true })
        if (error) throw new Error(`immagine: ${error.message}`)
      }
      daScrivere.push({
        ...base, codice: s.codice, descrizione: s.descrizione, serie: s.serie,
        l_nominale: s.lNominale, h_nominale: s.hNominale, albero: s.albero, poligoni: s.poligoni,
        immagine, errore: null,
      })
    } catch (e) {
      errori++
      const msg = e instanceof Error ? e.message : String(e)
      log(`Struttura non leggibile ${percorso}: ${msg}`)
      daScrivere.push({ ...base, codice: null, descrizione: null, serie: [], l_nominale: null, h_nominale: null, albero: [], poligoni: [], immagine: null, errore: msg })
    }

    scritte++
    if (daScrivere.length >= BLOCCO_RIGHE) await scrivi(supabase, daScrivere.splice(0))
  }
  await scrivi(supabase, daScrivere.splice(0))

  // Non si cancella: rilievi e preventivi della fase 3 punteranno a queste righe.
  const assenti = [...esistenti.values()].filter(e => e.presente && !visti.has(e.percorso)).map(e => e.percorso)
  for (const blocco of aBlocchi(assenti, 200)) {
    const { error } = await supabase.from('fp_strutture').update({ presente: false, sincronizzato_at: ora })
      .eq('organization_id', orgId).in('percorso', blocco)
    if (error) throw new Error(`fp_strutture: ${error.message}`)
  }

  log(`Strutture: ${voci.length} in FP PRO, ${scritte} lette di nuovo, ${errori} non leggibili, ${assenti.length} non piu' presenti`)
  return { lette: voci.length, scritte, errori, assenti: assenti.length }
}

async function scrivi(supabase: SupabaseClient, righe: Record<string, unknown>[]): Promise<void> {
  if (righe.length === 0) return
  const { error } = await supabase.from('fp_strutture').upsert(righe, { onConflict: 'organization_id,percorso' })
  if (error) throw new Error(`fp_strutture: ${error.message}`)
}
```

- [ ] **Step 5: Agganciare alla sincronizzazione**

In `ponte/src/sincronizza.ts`: firma `sincronizza(db, supabase, orgId, cartellaStrutture: string)` e, prima di `return esito`:

```ts
  const strutture = await sincronizzaStrutture(supabase, orgId, cartellaStrutture)
  esito.fp_strutture = strutture.lette
  esito.fp_strutture_errori = strutture.errori
```
con `import { sincronizzaStrutture } from './sincronizza-strutture.ts'`.

In `ponte/src/ponte.ts` passare `cfg.strPath` in entrambe le chiamate a `sincronizza(...)`.

Run: `cd ponte && npm run typecheck && cd ..`
Expected: nessun errore.

- [ ] **Step 6: Prima sincronizzazione vera, a mano**

Fermare il ponte installato (per non avere due sincronizzazioni insieme):

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*WinStudioPonte*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Poi:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ponte/crea-env.ps1 -Uscita ponte/.env -LogDir ponte/log
node --env-file=ponte/.env ponte/src/ponte.ts --una-volta > /tmp/sync-strutture.log 2>&1; tail -20 /tmp/sync-strutture.log
```
(usare la cartella di lavoro del piano al posto di `/tmp`.)
Expected: tabelle del catalogo con 0 scritte; "Strutture: 4661 in FP PRO, N non leggibili, 0 non piu' presenti"; esito JSON con `fp_strutture: 4661`. Durata: alcuni minuti.

Verificare con `execute_sql`:

```sql
select count(*) tot, count(*) filter (where errore is not null) errori,
       count(*) filter (where immagine is not null) con_immagine,
       count(*) filter (where cardinality(serie) = 0) senza_serie
from fp_strutture;
select serie, strutture from fp_strutture_serie order by strutture desc limit 10;
select pg_size_pretty(pg_total_relation_size('fp_strutture')) dimensione;
select nome, serie, l_nominale, h_nominale, jsonb_array_length(poligoni) poligoni
from fp_strutture where percorso = 'ALM/EKOS 66TH/03- Finestra 2 Ante.STR';
```
Expected: `tot` 4661; `errori` vicino a 0 (annotare i nomi dal log se > 0); `con_immagine` ≈ 4660; EKOS 2 ante con serie `{EKOS_66TH}`, 1300 × 1500, 13 poligoni; dimensione nell'ordine di qualche decina di MB.

- [ ] **Step 7: Seconda sincronizzazione (solo cambiati)**

Run: di nuovo `node --env-file=ponte/.env ponte/src/ponte.ts --una-volta`
Expected: dura pochi secondi per le strutture; nessuna immagine ricaricata; conteggi uguali.

- [ ] **Step 8: Reinstallare il ponte e commit**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File ponte/installa.ps1`
Expected: "Ponte installato…"; nel log `C:\WinStudioPonte\log` (leggerlo da PowerShell) "Ponte avviato (versione 1.2.0)".

```bash
git add lib/fppro/ponte-regole.ts lib/fppro/ponte-regole.test.ts lib/fppro/sync-tabelle.ts lib/fppro/sync-tabelle.test.ts ponte
git commit -m "feat(ponte): sincronizzazione delle strutture .STR con immagini"
```

---

### Task 6: Scheda "Strutture" nel Catalogo FP PRO

**Files:**
- Modify: `actions/catalogo-fp.ts`, `components/catalogo-fp/CatalogoFpClient.tsx`
- Create: `components/catalogo-fp/StruttureFp.tsx`, `components/catalogo-fp/DettaglioStrutturaFp.tsx`

**Interfaces:**
- Consumes: `StrutturaFpRiga`, `StrutturaFpDettaglio`, `FiltriStrutture` (Task 1); `riassuntoPezzi`, `accessoriStruttura`, `regolaQuantita`, `vistaPoligoni` (Task 4).
- Produces: `getFiltriStrutture(): Promise<FiltriStrutture>`, `cercaStrutture(f: { serie: string | null; cartella: string | null; testo: string }): Promise<{ strutture: StrutturaFpRiga[] } | { errore: string }>`, `getStrutturaFp(id: string): Promise<{ struttura: StrutturaFpDettaglio } | { errore: string }>`.

- [ ] **Step 1: Server action** (in fondo ad `actions/catalogo-fp.ts`; aggiungere `FiltriStrutture, StrutturaFpDettaglio, StrutturaFpRiga` all'import dei tipi)

```ts
const CAMPI_STRUTTURA = 'id, percorso, cartella, nome, codice, descrizione, serie, l_nominale, h_nominale, immagine, errore'
const LIMITE_STRUTTURE = 60

type RigaStrutturaDb = Omit<StrutturaFpRiga, 'immagineUrl'> & { immagine: string | null }

async function conImmagini(righe: RigaStrutturaDb[]): Promise<StrutturaFpRiga[]> {
  const supabase = await createClient()
  const percorsi = righe.map(r => r.immagine).filter((p): p is string => p !== null)
  const url = new Map<string, string>()
  if (percorsi.length > 0) {
    const { data, error } = await supabase.storage.from('fp-strutture').createSignedUrls(percorsi, 3600)
    if (error) throw new Error(error.message)
    for (const d of data ?? []) if (d.path && d.signedUrl) url.set(d.path, d.signedUrl)
  }
  return righe.map(({ immagine, ...r }) => ({ ...r, immagineUrl: immagine ? url.get(immagine) ?? null : null }))
}

export async function getFiltriStrutture(): Promise<FiltriStrutture> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [serie, cartelle] = await Promise.all([
    supabase.from('fp_strutture_serie').select('serie, strutture').eq('organization_id', orgId).order('serie'),
    supabase.from('fp_strutture_cartelle').select('cartella, strutture').eq('organization_id', orgId).order('cartella'),
  ])
  if (serie.error) throw new Error(serie.error.message)
  if (cartelle.error) throw new Error(cartelle.error.message)
  return { serie: serie.data ?? [], cartelle: cartelle.data ?? [] }
}

export async function cercaStrutture(
  f: { serie: string | null; cartella: string | null; testo: string },
): Promise<{ strutture: StrutturaFpRiga[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    let query = supabase.from('fp_strutture').select(CAMPI_STRUTTURA)
      .eq('organization_id', orgId).eq('presente', true).order('nome').limit(LIMITE_STRUTTURE)
    if (f.serie) query = query.contains('serie', [f.serie])
    if (f.cartella) query = query.eq('cartella', f.cartella)
    const q = pulisciRicerca(f.testo)
    if (q) query = query.or(['nome', 'codice', 'descrizione', 'percorso'].map(c => `${c}.ilike.%${q}%`).join(','))
    const { data, error } = await query
    if (error) return { errore: error.message }
    return { strutture: await conImmagini((data ?? []) as RigaStrutturaDb[]) }
  } catch (e) {
    return { errore: e instanceof Error ? e.message : 'Ricerca non riuscita' }
  }
}

export async function getStrutturaFp(id: string): Promise<{ struttura: StrutturaFpDettaglio } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data, error } = await supabase.from('fp_strutture')
      .select(`${CAMPI_STRUTTURA}, albero, poligoni`)
      .eq('organization_id', orgId).eq('id', id).single()
    if (error) return { errore: error.message }
    const { albero, poligoni, ...riga } = data as RigaStrutturaDb & Pick<StrutturaFpDettaglio, 'albero' | 'poligoni'>
    const [conUrl] = await conImmagini([riga])
    return { struttura: { ...conUrl, albero, poligoni } }
  } catch (e) {
    return { errore: e instanceof Error ? e.message : 'Struttura non trovata' }
  }
}
```

- [ ] **Step 2: `components/catalogo-fp/DettaglioStrutturaFp.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getStrutturaFp } from '@/actions/catalogo-fp'
import { accessoriStruttura, regolaQuantita, riassuntoPezzi, vistaPoligoni } from '@/lib/fppro/strutture'
import type { StrutturaFpDettaglio } from '@/types/fppro'

interface Props {
  id: string | null
  onChiudi: () => void
}

export default function DettaglioStrutturaFp({ id, onChiudi }: Props) {
  const [struttura, setStruttura] = useState<StrutturaFpDettaglio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let annullato = false
    getStrutturaFp(id).then(r => {
      if (annullato) return
      if ('errore' in r) {
        setErrore(r.errore)
        setStruttura(null)
      } else {
        setErrore(null)
        setStruttura(r.struttura)
      }
    })
    return () => { annullato = true }
  }, [id])

  const s = struttura && struttura.id === id ? struttura : null
  const vista = s ? vistaPoligoni(s.poligoni) : null
  const pezzi = s ? riassuntoPezzi(s.albero) : []
  const { accessori, kit } = s ? accessoriStruttura(s.albero) : { accessori: [], kit: [] }

  return (
    <Dialog open={id !== null} onOpenChange={aperto => { if (!aperto) onChiudi() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s?.nome ?? 'Struttura'}</DialogTitle>
        </DialogHeader>
        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {!s && !errore && <p className="text-sm text-muted-foreground">Caricamento…</p>}
        {s && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              {s.codice && <span className="font-mono">{s.codice}</span>}
              <span>{s.percorso}</span>
              {s.l_nominale && s.h_nominale && <span>{s.l_nominale} × {s.h_nominale} mm (misure di FP PRO)</span>}
              {s.serie.map(x => <Badge key={x} variant="secondary">{x}</Badge>)}
            </div>
            {s.errore && <p className="text-destructive">File non leggibile: {s.errore}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border bg-white p-2">
                {vista ? (
                  <svg viewBox={vista.viewBox} className="w-full h-72" role="img" aria-label={`Disegno di ${s.nome}`}>
                    {vista.punti.map((p, i) => (
                      <polygon key={i} points={p} fill="#d4d4d8" stroke="#3f3f46" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                ) : (
                  <div className="h-72 grid place-items-center text-muted-foreground">Disegno non disponibile</div>
                )}
              </div>
              <div className="rounded-md border bg-white p-2 grid place-items-center">
                {s.immagineUrl
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmato temporaneo di Storage
                  ? <img src={s.immagineUrl} alt={`Immagine FP PRO di ${s.nome}`} className="max-h-72" />
                  : <span className="text-muted-foreground">Immagine non disponibile</span>}
              </div>
            </div>

            <section>
              <h3 className="font-medium mb-2">Pezzi</h3>
              <table className="w-full text-left">
                <thead className="text-muted-foreground"><tr><th className="py-1">Ruolo</th><th>Profilo / codice</th><th>Serie</th><th className="text-right">Pz</th></tr></thead>
                <tbody>
                  {pezzi.map(p => (
                    <tr key={`${p.ruolo}|${p.profilo}`} className="border-t">
                      <td className="py-1">{p.ruolo}</td><td className="font-mono text-xs">{p.profilo}</td><td>{p.serie}</td><td className="text-right">{p.quantita}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {kit.length > 0 && (
              <section>
                <h3 className="font-medium mb-2">Kit</h3>
                <ul className="space-y-1">
                  {kit.map((k, i) => (
                    <li key={`${k.codice}-${i}`} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{k.codice}</span>
                      <span>{k.descrizione}</span>
                      {k.opzionale && <Badge variant={k.confermato ? 'default' : 'outline'}>{k.confermato ? 'opzione scelta' : 'opzione'}</Badge>}
                      <span className="text-muted-foreground">{k.accessori.length} accessori</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {accessori.length > 0 && (
              <section>
                <h3 className="font-medium mb-2">Accessori</h3>
                <table className="w-full text-left">
                  <thead className="text-muted-foreground"><tr><th className="py-1">Codice</th><th>Descrizione</th><th>Quantità</th></tr></thead>
                  <tbody>
                    {accessori.map((a, i) => (
                      <tr key={`${a.codice}-${i}`} className="border-t">
                        <td className="py-1 font-mono text-xs whitespace-nowrap">{a.codice}</td><td>{a.descrizione}</td><td className="whitespace-nowrap">{regolaQuantita(a)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: `components/catalogo-fp/StruttureFp.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cercaStrutture, getFiltriStrutture } from '@/actions/catalogo-fp'
import DettaglioStrutturaFp from './DettaglioStrutturaFp'
import type { FiltriStrutture, StrutturaFpRiga } from '@/types/fppro'

const TUTTE = '__tutte__'

export default function StruttureFp() {
  const [filtri, setFiltri] = useState<FiltriStrutture>({ serie: [], cartelle: [] })
  const [serie, setSerie] = useState<string>(TUTTE)
  const [cartella, setCartella] = useState<string>(TUTTE)
  const [testo, setTesto] = useState('')
  const [strutture, setStrutture] = useState<StrutturaFpRiga[]>([])
  const [cercando, setCercando] = useState(true)
  const [aperta, setAperta] = useState<string | null>(null)

  useEffect(() => {
    getFiltriStrutture().then(setFiltri).catch(() => toast.error('Filtri delle strutture non disponibili'))
  }, [])

  useEffect(() => {
    let annullata = false
    const id = setTimeout(async () => {
      try {
        const r = await cercaStrutture({ serie: serie === TUTTE ? null : serie, cartella: cartella === TUTTE ? null : cartella, testo })
        if (annullata) return
        if ('errore' in r) toast.error(r.errore)
        else setStrutture(r.strutture)
      } catch {
        if (!annullata) toast.error('Ricerca non riuscita: controlla la connessione')
      } finally {
        if (!annullata) setCercando(false)
      }
    }, 300)
    return () => { annullata = true; clearTimeout(id) }
  }, [serie, cartella, testo])

  const cambia = (f: () => void) => { setCercando(true); f() }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={serie} onValueChange={v => cambia(() => setSerie(v))}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Serie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTE}>Tutte le serie</SelectItem>
            {filtri.serie.map(s => <SelectItem key={s.serie} value={s.serie}>{s.serie} ({s.strutture})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cartella} onValueChange={v => cambia(() => setCartella(v))}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Cartella" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTE}>Tutte le cartelle</SelectItem>
            {filtri.cartelle.map(c => <SelectItem key={c.cartella} value={c.cartella}>{c.cartella} ({c.strutture})</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="sm:max-w-xs" placeholder="Cerca nome o codice" value={testo} onChange={e => cambia(() => setTesto(e.target.value))} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {strutture.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setAperta(s.id)}
            className="rounded-md border bg-card text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary overflow-hidden"
          >
            <div className="aspect-square bg-white grid place-items-center">
              {s.immagineUrl
                // eslint-disable-next-line @next/next/no-img-element -- URL firmato temporaneo di Storage
                ? <img src={s.immagineUrl} alt="" className="w-full h-full object-contain" loading="lazy" />
                : <span className="text-xs text-muted-foreground">{s.errore ? 'File non leggibile' : 'Nessuna immagine'}</span>}
            </div>
            <div className="p-2">
              <p className="text-sm font-medium leading-tight line-clamp-2">{s.nome}</p>
              <p className="text-xs text-muted-foreground truncate">{s.serie.join(' + ') || '—'} · {s.cartella}</p>
            </div>
          </button>
        ))}
      </div>
      {strutture.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">{cercando ? 'Ricerca…' : 'Nessuna struttura'}</p>
      )}
      <p className="text-xs text-muted-foreground">Al massimo 60 strutture: usa serie, cartella o ricerca per restringere.</p>

      <DettaglioStrutturaFp id={aperta} onChiudi={() => setAperta(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Scheda nel catalogo**

In `components/catalogo-fp/CatalogoFpClient.tsx`:
- `import StruttureFp from './StruttureFp'`
- tipo locale `type Scheda = TipoCatalogo | 'strutture'`; lo stato `tipo` diventa `useState<Scheda>('strutture')`;
- `SCHEDE` diventa `{ valore: Scheda; etichetta: string }[]` con `{ valore: 'strutture', etichetta: 'Strutture' }` in testa;
- nell'effetto di ricerca: `if (tipo === 'strutture') return` all'inizio del callback (prima di `setTimeout`), e `cercaCatalogo(tipo, testo)` riceve `tipo` già ristretto;
- `onValueChange={v => setTipo(v as Scheda)}`;
- quando `tipo === 'strutture'` si mostra `<StruttureFp />` al posto di input di ricerca, tabella e nota sotto la tabella.

- [ ] **Step 5: Lint, tipi, test**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: lint senza problemi, nessun errore di tipi, tutti i test verdi.

- [ ] **Step 6: Commit**

```bash
git add actions/catalogo-fp.ts components/catalogo-fp
git commit -m "feat(strutture-fp): scheda Strutture nel Catalogo FP PRO"
```

---

### Task 7: Verifica, revisione, rilascio

- [ ] **Step 1:** `npm run build` → build riuscita.
- [ ] **Step 2:** con `execute_sql`, una struttura per ciascuna delle 4 cartelle ha `serie` non vuoto e `immagine` valorizzata.
- [ ] **Step 3:** revisione finale del ramo (come fase 1), correzioni, merge su `master`, push, eliminazione dei rami.
- [ ] **Step 4:** memoria `project_catalogo_fp.md` aggiornata (fase 2: tabella `fp_strutture`, bucket, invarianti: chiave = percorso, rilettura per data+dimensione, file illeggibile salvato con `errore`, immagine = sha1 del percorso); PRD: fase 2 fatta.
- [ ] **Step 5:** chiedere all'utente di aprire Catalogo FP PRO → Strutture in produzione: filtro serie EKOS_66TH, apertura di "03- Finestra 2 Ante", controllo di disegno, pezzi e kit.
