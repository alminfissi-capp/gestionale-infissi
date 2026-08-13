# Resoconto economico di commessa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare dalla scheda commessa un PDF di resoconto economico per il cliente, con le fatture allegate lette in automatico e avvisi sulle incongruenze contabili.

**Architecture:** Logica pura in `lib/` con test Vitest (parser fattura, calcoli, controlli); lettura del testo dei PDF nel browser con pdfjs; persistenza in una tabella `resoconti_commessa` con una riga per commessa; form in un Dialog e PDF con `@react-pdf/renderer` sullo stile della ricevuta acconto.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (RLS), Vitest, pdfjs-dist, @react-pdf/renderer, shadcn/ui, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-13-resoconto-economico-commessa-design.md`

## Global Constraints

- Multi-tenancy: ogni tabella ha `organization_id`; ogni server action chiama `getOrgId()` da `@/lib/auth`; policy RLS `organization_id = get_user_organization_id()`.
- Le funzioni in `lib/` restano pure: nessun import React, nessun accesso a Supabase. Vitest gira in ambiente `node` e raccoglie solo `lib/**/*.test.ts`.
- Comandi di verifica: `npm test` (vitest run), `npm run lint`, `npm run build`.
- `npm run build` in locale ha bisogno di `RESEND_API_KEY` valorizzata anche con un valore fittizio.
- Il testo italiano nel codice e nei commenti resta senza accenti nei commenti sorgente, come nel resto del progetto; le stringhe mostrate all'utente sono accentate correttamente.
- Nessun avviso di lint per variabili non usate: la build fallisce.
- Importi sempre `number` in euro; formattazione solo a video con `formatEuro` da `@/lib/pricing`.
- Date sempre in formato `YYYY-MM-DD` nei dati, `dd/mm/yyyy` a video.

---

### Task 1: Impostazioni — sito web, banca, IBAN

**Files:**
- Create: `supabase/migrations/20260813110000_settings_sito_banca_iban.sql`
- Modify: `types/impostazioni.ts`
- Modify: `lib/validations/impostazioniSchema.ts`
- Modify: `components/impostazioni/FormAzienda.tsx`

**Interfaces:**
- Consumes: niente.
- Produces: `Settings.sito_web`, `Settings.banca`, `Settings.iban` (tutti `string | null`), usati dal PDF nel Task 7.

- [ ] **Step 1: Migrazione**

```sql
-- Dati aziendali usati dal resoconto economico di commessa:
-- sito nell'intestazione, banca e IBAN nel piede del documento.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS sito_web text,
  ADD COLUMN IF NOT EXISTS banca    text,
  ADD COLUMN IF NOT EXISTS iban     text;
```

Applicare con il tool Supabase `apply_migration` (nome `settings_sito_banca_iban`).

- [ ] **Step 2: Estendere il tipo**

In `types/impostazioni.ts`, dentro `Settings`, subito dopo `email`:

```ts
  sito_web: string | null
  banca: string | null
  iban: string | null
```

- [ ] **Step 3: Estendere lo schema zod**

In `lib/validations/impostazioniSchema.ts`, dentro `settingsSchema`, dopo `email`:

```ts
  sito_web: z.string().max(100).optional().nullable(),
  banca: z.string().max(120).optional().nullable(),
  iban: z.string().max(40).optional().nullable(),
```

- [ ] **Step 4: Campi nel form**

In `components/impostazioni/FormAzienda.tsx`, nella griglia, dopo il campo `telefono`:

```tsx
        <div className="space-y-2">
          <Label htmlFor="sito_web">Sito web</Label>
          <Input id="sito_web" {...register('sito_web')} placeholder="www.esempio.it" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="banca">Banca</Label>
          <Input id="banca" {...register('banca')} placeholder="Intesa Sanpaolo - Via Roma 1, Palermo" />
        </div>

        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="iban">IBAN</Label>
          <Input id="iban" {...register('iban')} placeholder="IT00A0000000000000000000000" />
        </div>
```

- [ ] **Step 5: Passare i nuovi valori al form**

In `app/(dashboard)/impostazioni/page.tsx` i `defaultValues` di `FormAzienda` vanno estesi con `sito_web`, `banca`, `iban` letti da `settings`, con `?? ''` come gli altri campi. Aprire il file e replicare il pattern gia' presente per `telefono`.

- [ ] **Step 6: Verifica**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations types/impostazioni.ts lib/validations/impostazioniSchema.ts components/impostazioni/FormAzienda.tsx "app/(dashboard)/impostazioni/page.tsx"
git commit -m "feat: sito web, banca e IBAN nelle impostazioni aziendali"
```

---

### Task 2: Parser delle fatture FattureInCloud

**Files:**
- Create: `lib/parseFattura.ts`
- Test: `lib/parseFattura.test.ts`
- Create (temporaneo, non committato): script in scratchpad per estrarre il testo reale dei PDF

**Interfaces:**
- Consumes: niente.
- Produces:

```ts
export type TipoDocumentoFiscale = 'fattura' | 'nota_credito'

export type FatturaEstratta = {
  tipo: TipoDocumentoFiscale
  numero: string
  data: string                  // YYYY-MM-DD
  descrizione: string
  imponibile: number            // negativo per le note di credito
  iva: number                   // negativo per le note di credito
  totale: number                // imponibile + iva
  destinatario: string | null
  destinatarioIndirizzo: string | null
  destinatarioPiva: string | null
  destinatarioCf: string | null
  preventivoCitato: { numero: string; data: string } | null
}

export function parseFattura(text: string): FatturaEstratta | null
```

- [ ] **Step 1: Estrarre il testo reale dei PDF di esempio**

Le regex devono lavorare sul testo che produce pdfjs, non su come il PDF appare a schermo: l'ordine dei blocchi puo' essere diverso. Scrivere in scratchpad `dump-fattura.mjs`:

```js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import fs from 'node:fs'

const file = process.argv[2]
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise
let out = ''
for (let p = 1; p <= doc.numPages; p++) {
  const content = await (await doc.getPage(p)).getTextContent()
  for (const item of content.items) {
    out += item.str
    out += item.hasEOL ? '\n' : ' '
  }
}
console.log(out)
```

Eseguirlo dalla root del progetto (servono i node_modules) sui tre PDF in
`C:/Users/almin/Dropbox/Ufficio/-- LISTINI & CATALOGHI --/WIN STUDIO SOFTWARE/Tranchida/`
(`1781521458184.pdf`, `1781521469434.pdf`, `1781521502504.pdf`) e conservare
l'output: e' la fixture del test.

- [ ] **Step 2: Scrivere il test che fallisce**

`lib/parseFattura.test.ts`. La costante `FATTURA_97` va sostituita con il testo
reale ottenuto allo Step 1; qui sotto la struttura del file e i casi da coprire.

```ts
import { describe, it, expect } from 'vitest'
import { parseFattura } from './parseFattura'

const FATTURA_97 = `...testo reale del PDF 1781521458184.pdf...`

describe('parseFattura', () => {
  it('legge numero, data e importi di una fattura', () => {
    const f = parseFattura(FATTURA_97)
    expect(f).not.toBeNull()
    expect(f!.tipo).toBe('fattura')
    expect(f!.numero).toBe('97/2025')
    expect(f!.data).toBe('2025-11-24')
    expect(f!.imponibile).toBeCloseTo(15163.94, 2)
    expect(f!.iva).toBeCloseTo(3336.07, 2)
    expect(f!.totale).toBeCloseTo(18500.01, 2)
  })

  it('legge il destinatario e i suoi dati fiscali', () => {
    const f = parseFattura(FATTURA_97)!
    expect(f.destinatario).toContain('TRANCHIDA')
    expect(f.destinatarioPiva).toBe('02562640819')
    expect(f.destinatarioCf).toBe('TRNGLC92D19G273K')
  })

  it('riconosce il preventivo citato nella descrizione', () => {
    const f = parseFattura(FATTURA_97)!
    expect(f.preventivoCitato).toEqual({ numero: '10040/2025 G', data: '2025-11-22' })
  })

  it('rende negativi gli importi di una nota di credito', () => {
    const testo = FATTURA_97.replace('FATTURA nr. 97/2025', 'NOTA DI CREDITO nr. 3/2026')
    const f = parseFattura(testo)!
    expect(f.tipo).toBe('nota_credito')
    expect(f.numero).toBe('3/2026')
    expect(f.imponibile).toBeLessThan(0)
    expect(f.iva).toBeLessThan(0)
    expect(f.totale).toBeCloseTo(-18500.01, 2)
  })

  it('restituisce null se il documento non e\u2019 una fattura', () => {
    expect(parseFattura('Contabile di bonifico\nImporto 1.000,00')).toBeNull()
  })

  it('gestisce importi senza separatore delle migliaia', () => {
    const testo = FATTURA_97
      .replace('15.163,94', '900,00')
      .replace('3.336,07', '198,00')
    const f = parseFattura(testo)!
    expect(f.imponibile).toBeCloseTo(900, 2)
    expect(f.totale).toBeCloseTo(1098, 2)
  })
})
```

- [ ] **Step 3: Eseguire il test e vederlo fallire**

Run: `npx vitest run lib/parseFattura.test.ts`
Expected: FAIL, il modulo `./parseFattura` non esiste.

- [ ] **Step 4: Implementare il parser**

`lib/parseFattura.ts`. Punti fermi:

- riconoscimento su `FATTURA nr. <numero> del <dd/mm/yyyy>` e
  `NOTA DI CREDITO nr. <numero> del <dd/mm/yyyy>`, case-insensitive, con spazi
  variabili (`\s+`); il numero puo' contenere lettere e barre (`[\w/\-.]+`);
- l'intestazione compare due volte nel PDF (titolo e piede di pagina): prendere
  la prima occorrenza;
- `Imponibile\s*€?\s*([\d.]+,\d{2})` e `Totale\s+IVA\s*€?\s*([\d.]+,\d{2})`;
- totale calcolato come somma, mai letto;
- conversione dal formato italiano con lo stesso approccio di
  `lib/parseBonificoScadenza.ts`: togliere i punti, virgola in punto;
- descrizione: dalla parola `DESCRIZIONE` alla prima riga non vuota successiva,
  scartando la riga che contiene solo `IMPORTO`;
- `preventivo\s+n\.?\s*([\w/\-. ]+?)\s+del\s+(\d{2}\/\d{2}\/\d{4})` sulla
  descrizione, con il numero ripulito dagli spazi in eccesso;
- destinatario: prima riga non vuota dopo `DESTINATARIO`, indirizzo dalle righe
  successive fino a una riga vuota;
- `P\.?IVA\s*(\d{11})` e `\bCF\s*([A-Z0-9]{11,16})\b` per i dati fiscali del
  destinatario; attenzione: nel testo compaiono anche la P.IVA e il C.F.
  dell'emittente, quindi vanno prese quelle **piu' vicine** al blocco
  DESTINATARIO. Se il blocco DESTINATARIO precede quelle etichette nel testo
  estratto, prendere la prima occorrenza dopo di esso; altrimenti l'ultima
  occorrenza del documento;
- per una nota di credito, `imponibile`, `iva` e `totale` vengono restituiti
  negativi (valore assoluto letto, poi segno invertito);
- se manca l'intestazione oppure manca l'imponibile: `return null`.

- [ ] **Step 5: Eseguire i test**

Run: `npx vitest run lib/parseFattura.test.ts`
Expected: PASS, 6 test verdi.

- [ ] **Step 6: Commit**

```bash
git add lib/parseFattura.ts lib/parseFattura.test.ts
git commit -m "feat: parser delle fatture FattureInCloud"
```

---

### Task 3: Calcoli del resoconto

**Files:**
- Create: `lib/resoconto.ts`
- Test: `lib/resoconto.test.ts`

**Interfaces:**
- Consumes: `TipoDocumentoFiscale` dal Task 2.
- Produces:

```ts
export type RigaPreventivo = {
  numero: string
  data: string | null
  oggetto: string
  imponibile: number
  iva: number
  totale: number
}

export type RigaFattura = {
  tipo: TipoDocumentoFiscale
  numero: string
  data: string | null
  descrizione: string
  imponibile: number
  iva: number
  totale: number
  daAllegato: boolean
}

export type TotaliResoconto = {
  preventivatoImponibile: number
  preventivatoIva: number
  preventivatoTotale: number
  fatturatoImponibile: number
  fatturatoIva: number
  fatturatoTotale: number
  incassato: number
  saldoResiduoFatture: number
  preventivatoNonFatturato: number
  totaleASaldo: number
}

export function calcolaTotaliResoconto(
  preventivi: RigaPreventivo[],
  fatture: RigaFattura[],
  incassi: { importo: number }[],
): TotaliResoconto

export function bozzaNotaScostamento(
  differenzaTotale: number,
  aliquota: number,
): { titolo: string; testo: string } | null

export const TOLLERANZA = 0.01
```

Nota: `differenzaTotale` e' IVA inclusa; l'imponibile corrispondente si ricava
dividendo per `1 + aliquota / 100`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest'
import { calcolaTotaliResoconto, bozzaNotaScostamento } from './resoconto'
import type { RigaPreventivo, RigaFattura } from './resoconto'

const prev = (totale: number, iva: number): RigaPreventivo =>
  ({ numero: 'P', data: null, oggetto: '', imponibile: totale - iva, iva, totale })

const fatt = (totale: number, iva: number): RigaFattura =>
  ({ tipo: 'fattura', numero: 'F', data: null, descrizione: '', imponibile: totale - iva, iva, totale, daAllegato: true })

describe('calcolaTotaliResoconto', () => {
  it('riproduce i numeri della commessa Tranchida 174-2025', () => {
    const preventivi = [
      prev(37351.85, 6735.58),
      prev(12331.88, 2223.78),
      prev(2244.80, 404.80),
    ]
    const fatture = [
      fatt(18500.01, 3336.07),
      fatt(6165.94, 1111.89),
      fatt(26910.72, 4852.75),
    ]
    const incassi = [18500, 5500, 5000, 2000, 12000].map((importo) => ({ importo }))

    const t = calcolaTotaliResoconto(preventivi, fatture, incassi)

    expect(t.preventivatoTotale).toBeCloseTo(51928.53, 2)
    expect(t.fatturatoTotale).toBeCloseTo(51576.67, 2)
    expect(t.incassato).toBeCloseTo(43000, 2)
    expect(t.saldoResiduoFatture).toBeCloseTo(8576.67, 2)
    expect(t.preventivatoNonFatturato).toBeCloseTo(351.86, 2)
    expect(t.totaleASaldo).toBeCloseTo(8928.53, 2)
  })

  it('sottrae le note di credito dal fatturato', () => {
    const nota: RigaFattura = {
      tipo: 'nota_credito', numero: 'NC1', data: null, descrizione: '',
      imponibile: -100, iva: -22, totale: -122, daAllegato: true,
    }
    const t = calcolaTotaliResoconto([], [fatt(1220, 220), nota], [])
    expect(t.fatturatoTotale).toBeCloseTo(1098, 2)
    expect(t.fatturatoImponibile).toBeCloseTo(900, 2)
  })

  it('da zero su tutte le voci quando non c\u2019e\u2019 nulla', () => {
    const t = calcolaTotaliResoconto([], [], [])
    expect(t.totaleASaldo).toBe(0)
    expect(t.preventivatoNonFatturato).toBe(0)
  })
})

describe('bozzaNotaScostamento', () => {
  it('scrive la bozza con imponibile e IVA', () => {
    const b = bozzaNotaScostamento(351.86, 22)
    expect(b).not.toBeNull()
    expect(b!.titolo).toContain('351,86')
    expect(b!.testo).toContain('288,41')
  })

  it('non produce nulla per differenze irrilevanti', () => {
    expect(bozzaNotaScostamento(0.004, 22)).toBeNull()
  })

  it('cambia testo quando si e\u2019 fatturato piu\u2019 del preventivato', () => {
    const b = bozzaNotaScostamento(-500, 22)
    expect(b!.titolo).toContain('500,00')
    expect(b!.testo.toLowerCase()).toContain('in eccesso')
  })
})
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `npx vitest run lib/resoconto.test.ts`
Expected: FAIL, modulo assente.

- [ ] **Step 3: Implementare**

`lib/resoconto.ts`. Somme semplici; `preventivatoNonFatturato` e
`totaleASaldo` vanno azzerati quando il valore assoluto sta sotto `TOLLERANZA`,
per non trascinarsi gli arrotondamenti. `bozzaNotaScostamento` restituisce
`null` sotto tolleranza, altrimenti due stringhe: titolo del tipo
`Importo preventivato e non fatturato: € 351,86 (IVA inclusa)` e un testo che
riporta imponibile e IVA e spiega che l'importo sara' oggetto di fattura
integrativa. Per il caso negativo (fatturato oltre il preventivo) titolo e testo
parlano di importo fatturato **in eccesso** rispetto a quanto pattuito. Usare
`formatEuro` da `@/lib/pricing` per gli importi dentro le stringhe.

- [ ] **Step 4: Eseguire i test**

Run: `npx vitest run lib/resoconto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/resoconto.ts lib/resoconto.test.ts
git commit -m "feat: calcoli e bozza nota del resoconto economico"
```

---

### Task 4: Controlli di coerenza

**Files:**
- Create: `lib/resoconto-controlli.ts`
- Test: `lib/resoconto-controlli.test.ts`

**Interfaces:**
- Consumes: `RigaPreventivo`, `RigaFattura`, `calcolaTotaliResoconto` dal Task 3.
- Produces:

```ts
export type CodiceAvviso =
  | 'preventivato_non_fatturato'
  | 'fatturato_oltre_preventivo'
  | 'incassato_oltre_fatturato'
  | 'fattura_duplicata'
  | 'allegato_non_letto'
  | 'iva_incoerente'
  | 'fattura_precede_preventivo'
  | 'destinatario_diverso'

export type Avviso = {
  codice: CodiceAvviso
  messaggio: string
  numeroFattura?: string
  differenza?: number
}

export type DatiVerifica = {
  preventivi: RigaPreventivo[]
  fatture: RigaFattura[]
  incassi: { importo: number }[]
  aliquoteIva: number[]
  clienteNome: string
  destinatariPerFattura: Record<string, string | null>
  preventiviCitati: Record<string, { numero: string; data: string } | null>
  allegatiNonLetti: string[]      // nomi file
}

export function verificaResoconto(dati: DatiVerifica): Avviso[]
export function nomiCorrispondono(a: string, b: string): boolean
```

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest'
import { verificaResoconto, nomiCorrispondono } from './resoconto-controlli'
import type { DatiVerifica } from './resoconto-controlli'
import type { RigaPreventivo, RigaFattura } from './resoconto'

const prev = (totale: number, iva: number): RigaPreventivo =>
  ({ numero: 'P', data: null, oggetto: '', imponibile: totale - iva, iva, totale })

const fatt = (numero: string, totale: number, iva: number, data: string | null = null): RigaFattura =>
  ({ tipo: 'fattura', numero, data, descrizione: '', imponibile: totale - iva, iva, totale, daAllegato: true })

const base = (over: Partial<DatiVerifica> = {}): DatiVerifica => ({
  preventivi: [], fatture: [], incassi: [], aliquoteIva: [10, 22],
  clienteNome: 'Mario Rossi', destinatariPerFattura: {}, preventiviCitati: {},
  allegatiNonLetti: [], ...over,
})

const codici = (d: DatiVerifica) => verificaResoconto(d).map((a) => a.codice)

describe('nomiCorrispondono', () => {
  it('accetta nome e cognome invertiti', () => {
    expect(nomiCorrispondono(
      'AZIENDA AGRICOLA DI GIANLUCA TRANCHIDA',
      'AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA',
    )).toBe(true)
  })

  it('ignora maiuscole, accenti e punteggiatura', () => {
    expect(nomiCorrispondono('Cafe\u0301 S.r.l.', 'CAFE SRL')).toBe(true)
  })

  it('rifiuta due clienti diversi', () => {
    expect(nomiCorrispondono('Mario Rossi', 'Giuseppe Verdi')).toBe(false)
  })
})

describe('verificaResoconto', () => {
  it('non segnala nulla quando i conti tornano', () => {
    const d = base({ preventivi: [prev(1220, 220)], fatture: [fatt('1/2026', 1220, 220)] })
    expect(codici(d)).toEqual([])
  })

  it('segnala il preventivato non fatturato', () => {
    const d = base({ preventivi: [prev(1220, 220)], fatture: [fatt('1/2026', 1000, 180.33)] })
    const avvisi = verificaResoconto(d)
    expect(avvisi.map((a) => a.codice)).toContain('preventivato_non_fatturato')
    expect(avvisi.find((a) => a.codice === 'preventivato_non_fatturato')!.differenza)
      .toBeCloseTo(220, 2)
  })

  it('segnala il fatturato oltre il preventivo', () => {
    const d = base({ preventivi: [prev(1000, 180.33)], fatture: [fatt('1/2026', 1220, 220)] })
    expect(codici(d)).toContain('fatturato_oltre_preventivo')
  })

  it('segnala gli incassi superiori al fatturato', () => {
    const d = base({ fatture: [fatt('1/2026', 1000, 180.33)], incassi: [{ importo: 1500 }] })
    expect(codici(d)).toContain('incassato_oltre_fatturato')
  })

  it('segnala due allegati con lo stesso numero di fattura', () => {
    const d = base({ fatture: [fatt('1/2026', 100, 0), fatt('1/2026', 100, 0)] })
    expect(codici(d)).toContain('fattura_duplicata')
  })

  it('segnala gli allegati non riconosciuti', () => {
    const d = base({ allegatiNonLetti: ['Fattura 5-2026.pdf'] })
    const a = verificaResoconto(d).find((x) => x.codice === 'allegato_non_letto')!
    expect(a.messaggio).toContain('Fattura 5-2026.pdf')
  })

  it('segnala un\u2019aliquota IVA fuori da quelle configurate', () => {
    const d = base({ fatture: [fatt('1/2026', 104, 4)] })
    expect(codici(d)).toContain('iva_incoerente')
  })

  it('segnala la fattura anteriore al preventivo che cita', () => {
    const d = base({
      fatture: [fatt('1/2026', 122, 22, '2026-01-10')],
      preventiviCitati: { '1/2026': { numero: '9/2026', data: '2026-02-01' } },
    })
    expect(codici(d)).toContain('fattura_precede_preventivo')
  })

  it('segnala il destinatario che non e\u2019 il cliente della commessa', () => {
    const d = base({
      fatture: [fatt('1/2026', 122, 22)],
      destinatariPerFattura: { '1/2026': 'Giuseppe Verdi' },
    })
    expect(codici(d)).toContain('destinatario_diverso')
  })

  it('non segnala il destinatario col nome invertito', () => {
    const d = base({
      clienteNome: 'AZIENDA AGRICOLA DI GIANLUCA TRANCHIDA',
      fatture: [fatt('1/2026', 122, 22)],
      destinatariPerFattura: { '1/2026': 'AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA' },
    })
    expect(codici(d)).not.toContain('destinatario_diverso')
  })
})
```

- [ ] **Step 2: Eseguire il test e vederlo fallire**

Run: `npx vitest run lib/resoconto-controlli.test.ts`
Expected: FAIL, modulo assente.

- [ ] **Step 3: Implementare**

`lib/resoconto-controlli.ts`.

`nomiCorrispondono`: normalizza entrambe le stringhe con
`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`, maiuscolo, sostituisce i
non alfanumerici con spazi, divide in parole, scarta quelle di due caratteri o
meno; poi conta quante parole della prima compaiono nella seconda e restituisce
`true` se sono almeno due terzi. Se una delle due dopo il filtro resta senza
parole: `true` (non si puo' concludere niente, non si disturba l'utente).

`verificaResoconto`: usa `calcolaTotaliResoconto` per i primi tre controlli,
poi cicla sulle fatture per i restanti. I controlli sui totali scattano solo
sopra `TOLLERANZA` e solo se ci sono righe da confrontare: con zero preventivi
non ha senso dire che si e' fatturato oltre il preventivo, e con zero fatture
non ha senso il confronto con gli incassi.

Per `iva_incoerente`: aliquota implicita `iva / imponibile * 100`, saltando le
righe con imponibile a zero; nessun avviso se dista meno di 0,5 punti da una
delle `aliquoteIva`.

I messaggi sono frasi complete in italiano, con gli importi passati da
`formatEuro`, per esempio: `Preventivato € 51.928,53 ma fatturato € 51.576,67: mancano € 351,86 da fatturare.`

- [ ] **Step 4: Eseguire i test**

Run: `npx vitest run lib/resoconto-controlli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/resoconto-controlli.ts lib/resoconto-controlli.test.ts
git commit -m "feat: controlli di coerenza sulle fatture della commessa"
```

---

### Task 5: Lettura del testo dei PDF nel browser

**Files:**
- Create: `lib/pdfText.ts`

**Interfaces:**
- Consumes: niente.
- Produces: `export async function estraiTestoPdf(url: string): Promise<string>`

Nessun test automatico: la funzione dipende da API del browser, e vitest gira in
ambiente node. La verifica e' manuale, nel Task 10.

- [ ] **Step 1: Implementare**

```ts
// Testo di un PDF, letto nel browser. Serve al riconoscimento automatico delle
// fatture allegate a una commessa.
//
// Stesso schema usato in components/cataloghi/PaginaCataloghi.tsx: pdfjs si
// importa dinamicamente, perche' non puo' girare lato server, e il worker sta
// in public/ (viene copiato all'avvio dal predev/prebuild).
export async function estraiTestoPdf(url: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise

  let testo = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      testo += item.str
      testo += item.hasEOL ? '\n' : ' '
    }
    testo += '\n'
  }
  return testo
}
```

- [ ] **Step 2: Verifica**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add lib/pdfText.ts
git commit -m "feat: estrazione del testo dei PDF nel browser"
```

---

### Task 6: Persistenza e server actions

**Files:**
- Create: `supabase/migrations/20260813120000_resoconti_commessa.sql`
- Create: `types/resoconto.ts`
- Create: `actions/resoconto-commessa.ts`

**Interfaces:**
- Consumes: `RigaPreventivo`, `RigaFattura` dal Task 3.
- Produces:

```ts
// types/resoconto.ts
export type ResocontoCommessa = {
  id: string
  organization_id: string
  commessa_id: string
  data_documento: string
  cliente_indirizzo: string | null
  cliente_piva: string | null
  cliente_cf: string | null
  cantiere_nome: string | null
  cantiere_indirizzo: string | null
  progetto_titolo: string | null
  progetto_sottotitolo: string | null
  progetto_cup: string | null
  righe_preventivi: RigaPreventivo[]
  righe_fatture: RigaFattura[]
  nota_fatture: string | null
  nota_titolo: string | null
  nota_testo: string | null
  nota_finale: string | null
  created_at: string
  updated_at: string
}

export type ResocontoCommessaInput = Omit<
  ResocontoCommessa, 'id' | 'organization_id' | 'commessa_id' | 'created_at' | 'updated_at'
>

// dati che il form usa per precompilarsi
export type DatiPrecompilazione = {
  preventivi: RigaPreventivo[]
  clienteIndirizzo: string | null
  clientePiva: string | null
  cantiere: string | null
}
```

```ts
// actions/resoconto-commessa.ts
export async function getResocontoCommessa(commessaId: string): Promise<ResocontoCommessa | null>
export async function saveResocontoCommessa(commessaId: string, input: ResocontoCommessaInput): Promise<void>
export async function getDatiPrecompilazione(commessaId: string): Promise<DatiPrecompilazione>
export async function getIntestazioneAzienda(): Promise<{ settings: Settings | null; logoUrl: string | null }>
```

- [ ] **Step 1: Migrazione**

```sql
-- Resoconto economico di commessa: documento riepilogativo per il cliente.
-- Una riga per commessa; gli incassi non si salvano, si rileggono sempre da
-- acconti_commessa.
CREATE TABLE resoconti_commessa (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commessa_id          uuid        NOT NULL UNIQUE REFERENCES commesse(id) ON DELETE CASCADE,
  data_documento       date        NOT NULL DEFAULT CURRENT_DATE,
  cliente_indirizzo    text,
  cliente_piva         text,
  cliente_cf           text,
  cantiere_nome        text,
  cantiere_indirizzo   text,
  progetto_titolo      text,
  progetto_sottotitolo text,
  progetto_cup         text,
  righe_preventivi     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  righe_fatture        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  nota_fatture         text,
  nota_titolo          text,
  nota_testo           text,
  nota_finale          text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE resoconti_commessa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON resoconti_commessa
  FOR ALL USING (organization_id = get_user_organization_id());
```

Applicare con `apply_migration` (nome `resoconti_commessa`).

- [ ] **Step 2: Tipi**

Creare `types/resoconto.ts` con i tipi dell'interfaccia sopra, importando
`RigaPreventivo` e `RigaFattura` da `@/lib/resoconto`.

- [ ] **Step 3: Server actions**

`actions/resoconto-commessa.ts`, file `'use server'`.

- `getResocontoCommessa`: select su `resoconti_commessa` per `commessa_id` e
  `organization_id`, `maybeSingle()`; le due colonne jsonb tornano gia' come
  array, ma vanno normalizzate a `[]` se nulle.
- `saveResocontoCommessa`: upsert con `onConflict: 'commessa_id'`, aggiungendo
  `organization_id`, `commessa_id` e `updated_at: new Date().toISOString()`;
  poi `revalidatePath('/commesse', 'layout')`.
- `getDatiPrecompilazione`: legge `preventivi_commessa` della commessa; per le
  righe con `preventivo_id` valorizzato fa una select su `preventivi`
  (`id, numero, totale_finale, iva_totale, created_at, cliente_snapshot`) e
  costruisce una `RigaPreventivo` con `imponibile = totale_finale - iva_totale`,
  `data` presa da `created_at` troncata a `YYYY-MM-DD`, `oggetto` vuoto; per le
  righe senza `preventivo_id` costruisce una riga con il solo
  `numero_preventivo` e importi a zero. Dal `cliente_snapshot` del primo
  preventivo trovato ricava anche `clienteIndirizzo` (componendo via, civico,
  cap, citta e provincia, con ripiego su `indirizzo`), `clientePiva`
  (`cf_piva`) e `cantiere`.
- `getIntestazioneAzienda`: chiama `getSettings()` da `@/actions/impostazioni` e,
  se c'e' un `logo_url`, `getLogoSignedUrl`; restituisce entrambi.

- [ ] **Step 4: Verifica**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations types/resoconto.ts actions/resoconto-commessa.ts
git commit -m "feat: persistenza e actions del resoconto economico"
```

---

### Task 7: Documento PDF

**Files:**
- Create: `components/commesse/ResocontoPdfDocument.tsx`

**Interfaces:**
- Consumes: `ResocontoCommessaInput` (Task 6), `TotaliResoconto` (Task 3), `Settings`.
- Produces:

```tsx
export type IncassoResoconto = {
  data: string
  riferimento: string
  metodo: string
  importo: number
}

type Props = {
  resoconto: ResocontoCommessaInput
  totali: TotaliResoconto
  incassi: IncassoResoconto[]
  clienteNome: string
  numeroCommessa: string
  settings: Settings | null
  logoUrl: string | null
}

export default function ResocontoPdfDocument(props: Props): JSX.Element
```

- [ ] **Step 1: Implementare**

Modello di riferimento: `components/commesse/RicevutaPdfDocument.tsx` — stesse
costanti colore (`TEAL = '#0E8F9C'`, i grigi), `StyleSheet.create`, font
Helvetica, `Page size="A4"`.

Struttura, nell'ordine:

1. Header: `logoUrl` a sinistra in `<Image>` (solo se presente), dati azienda al
   centro (denominazione in grassetto, indirizzo, `P.IVA … – C.F. …`,
   `Tel. … – email – sito`, saltando i campi vuoti), a destra il titolo
   `RESOCONTO ECONOMICO DI COMMESSA` e sotto
   `Documento riepilogativo – emesso il <data_documento>`.
2. Riquadro con tre colonne: CLIENTE (nome in grassetto, indirizzo,
   `P.IVA … – C.F. …`), N. COMMESSA (numero in grassetto, poi
   `Cantiere: <cantiere_nome>` e `cantiere_indirizzo`), PROGETTO
   (`progetto_titolo` in grassetto, `progetto_sottotitolo`, `CUP <progetto_cup>`).
   Le colonne prive di contenuto non si stampano.
3. Sezione `PREVENTIVI ACCETTATI`: tabella con PREVENTIVO, DATA, OGGETTO,
   IMPONIBILE, IVA, TOTALE e riga `TOTALE PREVENTIVATO` in grassetto.
4. Sezione `FATTURE EMESSE`: tabella con FATTURA, DATA, DESCRIZIONE,
   IMPONIBILE, IVA, TOTALE; le righe con `tipo === 'nota_credito'` mostrano
   `Nota di credito n. <numero>` nella prima colonna; riga `TOTALE FATTURATO`.
   Sotto, `nota_fatture` in corpo piccolo grigio, se valorizzata.
5. Sezione `INCASSI RICEVUTI`: DATA, RICEVUTA N., MODALITA, IMPORTO, con riga
   `TOTALE INCASSATO`.
6. Riquadro `SITUAZIONE CONTABILE`: righe `Totale fatturato (IVA inclusa)`,
   `Totale incassato` con il segno meno, `Saldo residuo su fatture emesse` in
   grassetto, `Importo preventivato non ancora fatturato – IVA inclusa` col
   segno piu' (solo se diverso da zero) e infine
   `TOTALE A SALDO DELLA COMMESSA` in teal, corpo grande.
7. Riquadro nota, con sfondo ambra chiaro, se `nota_titolo` o `nota_testo` sono
   valorizzati.
8. `nota_finale` in corpo piccolo; poi, se ci sono `settings.banca` o
   `settings.iban`, la riga delle coordinate per il versamento del saldo.
9. Riquadro firme: a sinistra `Palermo, li ....` — in realta' la citta' non e'
   nota, quindi solo `Data ......` e sotto la denominazione dell'azienda con la
   riga per la firma; a destra `Per presa visione – Il Cliente` con la sua riga.
10. Piede con la denominazione e
    `Documento riepilogativo privo di valenza fiscale`, fissato con
    `position: 'absolute'` in fondo alla pagina e `fixed`.

Gli importi si formattano con `formatEuro` da `@/lib/pricing`; le date con una
funzione locale `formatData` che converte `YYYY-MM-DD` in `dd/mm/yyyy`,
identica a quella di `RicevutaPdfDocument.tsx`.

- [ ] **Step 2: Verifica**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/ResocontoPdfDocument.tsx
git commit -m "feat: documento PDF del resoconto economico"
```

---

### Task 8: Form del resoconto

**Files:**
- Create: `components/commesse/DialogResoconto.tsx`

**Interfaces:**
- Consumes: tutto quanto prodotto dai Task 2-7.
- Produces:

```tsx
type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa: CommessaCompleta
}

export default function DialogResoconto(props: Props): JSX.Element
```

- [ ] **Step 1: Implementare lo scheletro e il caricamento**

Client component. All'apertura, in un `useEffect` con guardia su `open`:

1. `getResocontoCommessa(commessa.id)` e `getDatiPrecompilazione(commessa.id)` e
   `getIntestazioneAzienda()` in parallelo;
2. se esiste un resoconto salvato, il form parte da quello; altrimenti parte
   dai dati di precompilazione, con `data_documento` a oggi;
3. scansione degli allegati: per ogni documento della commessa con nome che
   finisce per `.pdf`, `getDocumentoCommessaUrl(doc.storage_path)` poi
   `estraiTestoPdf` poi `parseFattura`. Le fatture riconosciute diventano righe
   con `daAllegato: true`, ordinate per data. I documenti non riconosciuti il
   cui `tipo_documento` e' `fattura`, o il cui nome contiene "fattura" o "nota
   di credito" (senza distinzione di maiuscole), finiscono in
   `allegatiNonLetti`. Errori di rete o di lettura su un singolo file: si salta
   quel file e si prosegue.
4. le righe salvate vincono: una fattura letta entra solo se il suo numero non
   e' gia' presente tra quelle salvate.
5. dalla prima fattura letta si precompilano `cliente_piva` e `cliente_cf` se
   ancora vuoti, e `cliente_indirizzo` se la precompilazione da preventivo non
   ha dato nulla.

Durante la scansione, sopra le tabelle, una riga con spinner e testo
`Lettura degli allegati…`.

- [ ] **Step 2: Le sezioni del form**

Un `Dialog` con `DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0"`,
header fisso, corpo scrollabile, barra azioni in fondo. Sezioni nell'ordine:
Documento (data), Cliente, Cantiere e progetto, Preventivi accettati, Fatture
emesse, Incassi ricevuti, Situazione contabile, Note.

Le due tabelle editabili hanno la stessa struttura: una riga per record con
`Input` per i campi testo e `Input type="number" step="0.01"` per gli importi,
un pulsante cestino per riga e un pulsante `+ Aggiungi riga` in fondo. Nella
tabella fatture, le righe con `daAllegato` mostrano un piccolo badge `da allegato`.
Cambiando imponibile o IVA, il totale della riga si ricalcola da solo.

Gli incassi sono in sola lettura: `commessa.acconti` mappati con
`riferimento = acconto.id.slice(-6).toUpperCase()` e il metodo tradotto con la
stessa mappa usata in `RicevutaAcconto.tsx`.

La situazione contabile e' un riquadro in sola lettura alimentato da
`calcolaTotaliResoconto`, ricalcolato a ogni modifica con `useMemo`.

- [ ] **Step 3: Banner degli avvisi**

Sopra tutte le sezioni, un riquadro ambra con l'elenco degli avvisi restituiti
da `verificaResoconto`, ricalcolati con `useMemo` a ogni modifica. Le righe
fattura citate da un avviso prendono uno sfondo ambra chiaro nella loro tabella.
Se non ci sono avvisi il riquadro non compare.

Nella sezione Note, quando fra gli avvisi c'e' `preventivato_non_fatturato` o
`fatturato_oltre_preventivo`, compare un pulsante `Usa come nota` che scrive
`nota_titolo` e `nota_testo` con il risultato di `bozzaNotaScostamento`,
passando come aliquota la piu' alta fra le `settings.aliquote_iva` (in
mancanza, 22).

- [ ] **Step 4: Salvataggio e PDF**

Due pulsanti in fondo. `Salva` chiama `saveResocontoCommessa` e mostra un toast.
`Genera PDF` prima salva, poi genera e condivide con lo stesso schema di
`RicevutaAcconto.handleShare`: import dinamico di `@react-pdf/renderer` e del
documento, `pdf(<ResocontoPdfDocument … />).toBlob()`, `navigator.canShare` con
ripiego sul download. Nome file:
`Resoconto_Commessa_<numero_commessa>_<cliente>.pdf`, con numero e cliente
ripuliti sostituendo con `_` tutto cio' che non e' lettera, cifra, punto o
trattino.

- [ ] **Step 5: Verifica**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add components/commesse/DialogResoconto.tsx
git commit -m "feat: form del resoconto economico con avvisi di incongruenza"
```

---

### Task 9: Voce nel menu della scheda commessa

**Files:**
- Modify: `components/commesse/DialogSchedaCommessa.tsx`

**Interfaces:**
- Consumes: `DialogResoconto` dal Task 8.
- Produces: niente.

- [ ] **Step 1: Aggiungere il menu**

Nella barra azioni dell'header (il ramo `else` del `editMode`, dopo il pulsante
`Condividi`), aggiungere un `DropdownMenu` di shadcn con trigger
`<Button variant="outline" size="sm">` contenente `<MoreVertical className="h-3.5 w-3.5" />`
e un solo `DropdownMenuItem` con icona `FileBarChart` e testo
`Resoconto economico`, che imposta a `true` un nuovo stato `resocontoAperto`.

Importare `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`,
`DropdownMenuTrigger` da `@/components/ui/dropdown-menu` e le due icone da
`lucide-react`.

- [ ] **Step 2: Montare il dialog**

Accanto al `Dialog` di selezione documenti per la stampa, montare
`<DialogResoconto open={resocontoAperto} onOpenChange={setResocontoAperto} commessa={commessa} />`.

- [ ] **Step 3: Verifica**

Run: `npm run lint`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/commesse/DialogSchedaCommessa.tsx
git commit -m "feat: voce Resoconto economico nel menu della scheda commessa"
```

---

### Task 10: Verifica complessiva e chiusura

**Files:** nessuno nuovo.

- [ ] **Step 1: Test**

Run: `npm test`
Expected: PASS su tutti i file, compresi quelli preesistenti.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: nessun errore e nessun warning.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completata.

- [ ] **Step 4: Aggiornare la memoria di progetto**

Aggiungere a `docs/PRD.md` la voce del modulo e una riga in `MEMORY.md`
(memoria utente) che punti a un nuovo `project_resoconto_commessa.md` con:
percorso dei file, formato FattureInCloud atteso dal parser, elenco degli otto
controlli e il vincolo che il confronto sui nomi e' per insiemi di parole.

- [ ] **Step 5: Commit e push**

```bash
git add -A
git commit -m "docs: aggiorna PRD con il resoconto economico di commessa"
git push -u origin feat-resoconto-economico
```

- [ ] **Step 6: Prova manuale in produzione**

Sulla commessa Tranchida 174-2025: aprire la scheda, menu tre puntini,
Resoconto economico. Verificare che le tre fatture allegate vengano riconosciute
da sole, che la situazione contabile chiuda su € 8.928,53, che compaia l'avviso
dei € 351,86 non fatturati e che **non** compaia quello sul destinatario.
Generare il PDF e controllare logo e intestazione.

---

## Note di esecuzione

- I Task 2, 3, 4 sono indipendenti fra loro e dipendono solo dal Task 1 per
  niente: si possono fare in qualunque ordine.
- Il Task 8 dipende da tutti i precedenti tranne il 9.
- La spec prevedeva una migrazione unica; qui sono due, una per task, per
  tenere ogni task committabile da solo. Effetto identico.
