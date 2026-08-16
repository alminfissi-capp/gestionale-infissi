# Incassi vs pagamenti e riepilogo crediti/debiti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nella pagina `/commesse/statistiche`, trasformare il grafico Incassi in un confronto mensile incassi/pagamenti e aggiungere un riepilogo crediti/debiti aggiornato a oggi.

**Architecture:** Tutta l'aggregazione vive in `lib/statistiche-commesse.ts`, che è puro (niente React, niente Supabase, niente `new Date()`): il Server Component carica le scadenze e passa anche la data odierna come stringa, il Client Component si limita a disegnare. Questo tiene i test deterministici e segue il taglio già usato dal resto del modulo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, recharts, Vitest, shadcn/ui.

Spec di riferimento: `docs/superpowers/specs/2026-08-16-incassi-pagamenti-crediti-debiti-design.md`

---

## Struttura file

| File | Responsabilità |
|---|---|
| `lib/statistiche-commesse.ts` (modifica) | Tipi e funzioni pure: `ScadenzaRow`, `PuntoFlusso`, `RiepilogoFinanziario`, `aggregaFlussoMese`, `riepilogoCreditiDebiti`. Rimuove `aggregaIncassiMese` e `PuntoIncasso`, che hanno un solo chiamante. |
| `lib/statistiche-commesse.test.ts` (nuovo) | Test delle funzioni pure sopra. |
| `app/(dashboard)/commesse/statistiche/page.tsx` (modifica) | Carica le scadenze dell'organizzazione e calcola `oggi` nel fuso Europe/Rome. |
| `components/commesse/StatisticheCommesse.tsx` (modifica) | Grafico "Incassi e pagamenti" al posto di "Incassi" + Card "Crediti e debiti". |

Il branch `feat-incassi-pagamenti-crediti-debiti` esiste già e contiene la specifica.

---

### Task 1: Aggregazione mensile del flusso

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Test: `lib/statistiche-commesse.test.ts` (creare)

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `lib/statistiche-commesse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  aggregaFlussoMese,
  type AccontoRow,
  type ScadenzaRow,
} from '@/lib/statistiche-commesse'

const acconti: AccontoRow[] = [
  { commessa_id: 'c1', importo: 1000, data_pagamento: '2026-01-15' },
  { commessa_id: 'c2', importo: 500, data_pagamento: '2026-01-20' },
  { commessa_id: 'c3', importo: 2000, data_pagamento: '2026-03-02' },
  { commessa_id: 'c4', importo: 999, data_pagamento: '2025-01-10' }, // altro anno
  { commessa_id: 'c5', importo: 777, data_pagamento: null },         // senza data
]

const scadenze: ScadenzaRow[] = [
  { data_scadenza: '2026-01-31', importo: 400, pagato: true, annullata: false },
  { data_scadenza: '2026-03-10', importo: 300, pagato: true, annullata: false },
  { data_scadenza: '2026-03-15', importo: 900, pagato: false, annullata: false }, // non pagata
  { data_scadenza: '2026-03-20', importo: 800, pagato: true, annullata: true },   // annullata
  { data_scadenza: '2027-01-05', importo: 100, pagato: true, annullata: false },  // altro anno
  { data_scadenza: null, importo: 50, pagato: false, annullata: false },          // da programmare
]

describe('aggregaFlussoMese', () => {
  it('restituisce sempre 12 mesi in ordine', () => {
    const r = aggregaFlussoMese([], [], '2026')
    expect(r).toHaveLength(12)
    expect(r[0].mese).toBe('Gen')
    expect(r[11].mese).toBe('Dic')
    expect(r.every((p) => p.incasso === 0 && p.pagamento === 0 && p.saldo === 0)).toBe(true)
  })

  it('somma gli incassi sul mese della data di pagamento', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    expect(r[0].incasso).toBe(1500) // gennaio: 1000 + 500
    expect(r[2].incasso).toBe(2000) // marzo
    expect(r[1].incasso).toBe(0)    // febbraio
  })

  it('conta come pagamento solo le scadenze pagate e non annullate', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    expect(r[0].pagamento).toBe(400) // gennaio
    expect(r[2].pagamento).toBe(300) // marzo: esclude la non pagata e l'annullata
  })

  it('ignora le righe di un altro anno o senza data', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    const totIncassi = r.reduce((s, p) => s + p.incasso, 0)
    const totPagamenti = r.reduce((s, p) => s + p.pagamento, 0)
    expect(totIncassi).toBe(3500) // esclusi 999 (2025) e 777 (senza data)
    expect(totPagamenti).toBe(700) // esclusi 100 (2027) e 50 (senza data)
  })

  it('calcola il saldo mensile come incassi meno pagamenti', () => {
    const r = aggregaFlussoMese(acconti, scadenze, '2026')
    expect(r[0].saldo).toBe(1100) // 1500 - 400
    expect(r[2].saldo).toBe(1700) // 2000 - 300
  })

  it('produce un saldo negativo quando esce più di quanto entra', () => {
    const soloUscite: ScadenzaRow[] = [
      { data_scadenza: '2026-05-10', importo: 250, pagato: true, annullata: false },
    ]
    const r = aggregaFlussoMese([], soloUscite, '2026')
    expect(r[4].saldo).toBe(-250)
  })
})
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — `aggregaFlussoMese` non è esportata.

- [ ] **Step 3: Implementare**

In `lib/statistiche-commesse.ts`, aggiungere il tipo in ingresso dopo `AccontoRow`:

```ts
// Uscita dell'azienda: fornitori, finanziamenti, assegni, utenze.
export type ScadenzaRow = {
  data_scadenza: string | null
  importo: number
  pagato: boolean
  annullata: boolean
}
```

Sostituire il tipo `PuntoIncasso` con:

```ts
export type PuntoFlusso = { mese: string; incasso: number; pagamento: number; saldo: number }
```

Sostituire l'intera funzione `aggregaIncassiMese` con:

```ts
// Flusso di cassa del mese: acconti incassati contro scadenze effettivamente pagate.
// L'anno è quello della data di pagamento (acconti) e di scadenza (uscite), non il
// blocco della commessa. Le scadenze annullate e quelle non ancora pagate restano
// fuori: il grafico confronta soldi realmente usciti con soldi realmente entrati.
export function aggregaFlussoMese(
  acconti: AccontoRow[],
  scadenze: ScadenzaRow[],
  anno: string,
): PuntoFlusso[] {
  const out: PuntoFlusso[] = MESI_LABEL.map((mese) => ({ mese, incasso: 0, pagamento: 0, saldo: 0 }))

  for (const a of acconti) {
    if (annoStr(a.data_pagamento) !== anno) continue
    const m = meseDi(a.data_pagamento)
    if (m === null) continue
    out[m].incasso += Number(a.importo) || 0
  }

  for (const s of scadenze) {
    if (!s.pagato || s.annullata) continue
    if (annoStr(s.data_scadenza) !== anno) continue
    const m = meseDi(s.data_scadenza)
    if (m === null) continue
    out[m].pagamento += Number(s.importo) || 0
  }

  for (const p of out) p.saldo = p.incasso - p.pagamento
  return out
}
```

Aggiornare `DatiStatistiche` aggiungendo i due campi nuovi:

```ts
export type DatiStatistiche = {
  commesse: StatRow[]
  acconti: AccontoRow[]
  anni: string[] // valori del selettore (nomi blocco + anni di pagamento), desc
  costiCommesse: CostoCommessaRow[] // commesse con ≥1 preventivo interno collegato
  scadenze: ScadenzaRow[] // uscite: usate per flusso mensile e debiti
  oggi: string // 'YYYY-MM-DD' calcolata sul server, per rendere puro il riepilogo
}
```

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts
git commit -m "feat: aggregazione mensile di incassi e pagamenti"
```

---

### Task 2: Riepilogo crediti e debiti

**Files:**
- Modify: `lib/statistiche-commesse.ts`
- Test: `lib/statistiche-commesse.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in fondo a `lib/statistiche-commesse.test.ts` (e `riepilogoCreditiDebiti`, `StatRow` all'import in cima):

```ts
const OGGI = '2026-08-16'

const commesseRiep: StatRow[] = [
  { id: 'c1', cliente_nome: 'Rossi', totale: 10000, data_conferma: '2026-02-01', blocco: '2026' },
  { id: 'c2', cliente_nome: 'Bianchi', totale: 5000, data_conferma: '2026-03-01', blocco: '2026' },
  { id: 'c3', cliente_nome: 'Verdi', totale: 2000, data_conferma: '2025-11-01', blocco: '2025' },
]

const accontiRiep: AccontoRow[] = [
  { commessa_id: 'c1', importo: 4000, data_pagamento: '2026-02-10' },
  { commessa_id: 'c2', importo: 7000, data_pagamento: '2026-03-05' }, // incassata in eccesso
]

const scadenzeRiep: ScadenzaRow[] = [
  { data_scadenza: '2026-07-01', importo: 300, pagato: false, annullata: false }, // scaduta
  { data_scadenza: '2026-08-16', importo: 100, pagato: false, annullata: false }, // oggi
  { data_scadenza: '2026-12-31', importo: 700, pagato: false, annullata: false }, // entro l'anno
  { data_scadenza: '2027-01-01', importo: 900, pagato: false, annullata: false }, // futura
  { data_scadenza: null, importo: 50, pagato: false, annullata: false },          // da programmare
  { data_scadenza: '2026-07-05', importo: 999, pagato: true, annullata: false },  // già pagata
  { data_scadenza: '2026-07-06', importo: 888, pagato: false, annullata: true },  // annullata
]

describe('riepilogoCreditiDebiti', () => {
  it('somma i crediti come residuo per commessa, senza compensare fra commesse', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], OGGI)
    // c1: 10000-4000 = 6000 · c2: -2000 → 0 (non riduce c1) · c3: 2000
    expect(r.crediti).toBe(8000)
  })

  it('divide i debiti per orizzonte rispetto a oggi', () => {
    const r = riepilogoCreditiDebiti([], [], scadenzeRiep, OGGI)
    expect(r.debitiScaduti).toBe(300)
    expect(r.debitiAnno).toBe(800) // 100 di oggi + 700 di fine anno
    expect(r.debitiFuturi).toBe(900)
    expect(r.debitiDaProgrammare).toBe(50)
  })

  it('una scadenza in data odierna non è ancora scaduta', () => {
    const r = riepilogoCreditiDebiti([], [], [
      { data_scadenza: OGGI, importo: 100, pagato: false, annullata: false },
    ], OGGI)
    expect(r.debitiScaduti).toBe(0)
    expect(r.debitiAnno).toBe(100)
  })

  it('esclude dai debiti le scadenze pagate e quelle annullate', () => {
    const r = riepilogoCreditiDebiti([], [], scadenzeRiep, OGGI)
    expect(r.debitiTotali).toBe(2050) // 300+800+900+50, senza 999 e 888
  })

  it('tiene le rate future fuori dalla posizione netta', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, scadenzeRiep, OGGI)
    // 8000 - (300 + 800 + 50) = 6850
    expect(r.posizioneNetta).toBe(6850)
  })

  it('regge liste vuote', () => {
    const r = riepilogoCreditiDebiti([], [], [], OGGI)
    expect(r).toEqual({
      crediti: 0,
      debitiScaduti: 0,
      debitiAnno: 0,
      debitiFuturi: 0,
      debitiDaProgrammare: 0,
      debitiTotali: 0,
      posizioneNetta: 0,
    })
  })
})
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: FAIL — `riepilogoCreditiDebiti` non è esportata.

- [ ] **Step 3: Implementare**

In fondo a `lib/statistiche-commesse.ts`:

```ts
// Posizione dell'azienda a una certa data: quanto resta da incassare e quanto da pagare.
// Indipendente dal selettore anno della pagina.
export type RiepilogoFinanziario = {
  crediti: number
  debitiScaduti: number
  debitiAnno: number
  debitiFuturi: number
  debitiDaProgrammare: number
  debitiTotali: number
  posizioneNetta: number
}

// `oggi` arriva dal server come 'YYYY-MM-DD': le date ISO si confrontano come stringhe
// e la funzione resta pura, quindi testabile con una data fissa.
export function riepilogoCreditiDebiti(
  commesse: StatRow[],
  acconti: AccontoRow[],
  scadenze: ScadenzaRow[],
  oggi: string,
): RiepilogoFinanziario {
  const incassatoPerCommessa = new Map<string, number>()
  for (const a of acconti) {
    const attuale = incassatoPerCommessa.get(a.commessa_id) ?? 0
    incassatoPerCommessa.set(a.commessa_id, attuale + (Number(a.importo) || 0))
  }

  // Residuo per commessa con floor a zero: una commessa incassata in eccesso non deve
  // mascherare il credito di un'altra.
  let crediti = 0
  for (const c of commesse) {
    const residuo = (Number(c.totale) || 0) - (incassatoPerCommessa.get(c.id) ?? 0)
    if (residuo > 0) crediti += residuo
  }

  const annoOggi = annoStr(oggi)
  let debitiScaduti = 0
  let debitiAnno = 0
  let debitiFuturi = 0
  let debitiDaProgrammare = 0

  for (const s of scadenze) {
    if (s.pagato || s.annullata) continue
    const importo = Number(s.importo) || 0
    if (!s.data_scadenza) {
      debitiDaProgrammare += importo
    } else if (s.data_scadenza < oggi) {
      debitiScaduti += importo
    } else if (annoStr(s.data_scadenza) === annoOggi) {
      debitiAnno += importo
    } else {
      debitiFuturi += importo
    }
  }

  const debitiTotali = debitiScaduti + debitiAnno + debitiFuturi + debitiDaProgrammare
  // Le rate oltre l'anno restano fuori dal netto: rispondono a "reggo quest'anno?".
  const posizioneNetta = crediti - (debitiScaduti + debitiAnno + debitiDaProgrammare)

  return {
    crediti,
    debitiScaduti,
    debitiAnno,
    debitiFuturi,
    debitiDaProgrammare,
    debitiTotali,
    posizioneNetta,
  }
}
```

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run lib/statistiche-commesse.test.ts`
Expected: PASS, 12 test in totale.

- [ ] **Step 5: Commit**

```bash
git add lib/statistiche-commesse.ts lib/statistiche-commesse.test.ts
git commit -m "feat: riepilogo crediti e debiti per orizzonte temporale"
```

---

### Task 3: Caricare scadenze e data odierna nel Server Component

**Files:**
- Modify: `app/(dashboard)/commesse/statistiche/page.tsx`

- [ ] **Step 1: Aggiungere la query delle scadenze**

Nel `Promise.all` iniziale (righe 11-29) aggiungere una quinta destrutturazione e la query:

```ts
  const [{ data: commesseRaw }, { data: accontiRaw }, { data: gruppiRaw }, { data: junctionRaw }, { data: scadenzeRaw }] =
    await Promise.all([
      supabase
        .from('commesse')
        .select('id, cliente_nome, totale, data_conferma, gruppo_id, preventivo_id, stato, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale')
        .eq('organization_id', orgId),
      supabase
        .from('acconti_commessa')
        .select('commessa_id, importo, data_pagamento')
        .eq('organization_id', orgId),
      supabase
        .from('gruppi_commesse')
        .select('id, nome')
        .eq('organization_id', orgId),
      supabase
        .from('preventivi_commessa')
        .select('commessa_id, preventivo_id')
        .eq('organization_id', orgId),
      supabase
        .from('scadenze')
        .select('data_scadenza, importo, pagato, annullata')
        .eq('organization_id', orgId),
    ])
```

- [ ] **Step 2: Normalizzare le scadenze e calcolare `oggi`**

Subito prima del `return` finale (riga 162):

```ts
  // Le scadenze non appartengono ai blocchi commesse: entrano come lista a sé.
  const scadenze: ScadenzaRow[] = (scadenzeRaw ?? []).map((s) => ({
    data_scadenza: s.data_scadenza,
    importo: Number(s.importo) || 0,
    pagato: !!s.pagato,
    annullata: !!s.annullata,
  }))

  // Data locale italiana, non UTC: dopo mezzanotte a Roma il server UTC è ancora al
  // giorno prima e sposterebbe il confine dello "scaduto". 'en-CA' formatta YYYY-MM-DD.
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
```

Aggiornare la riga di ritorno:

```ts
  return <StatisticheCommesse dati={{ commesse, acconti, anni, costiCommesse, scadenze, oggi }} />
```

E l'import dei tipi in cima al file:

```ts
import type { StatRow, AccontoRow, CostoCommessaRow, ScadenzaRow } from '@/lib/statistiche-commesse'
```

- [ ] **Step 3: Verificare che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun output oltre agli errori attesi in `StatisticheCommesse.tsx`, che usa ancora `aggregaIncassiMese` (rimossa nel Task 1). Questi si risolvono nel Task 4.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/commesse/statistiche/page.tsx"
git commit -m "feat: carica scadenze e data odierna nella pagina statistiche"
```

---

### Task 4: Grafico "Incassi e pagamenti"

**Files:**
- Modify: `components/commesse/StatisticheCommesse.tsx`

- [ ] **Step 1: Caricare la skill dataviz**

Invocare la skill `dataviz` **prima** di scrivere il codice del grafico, e seguirne le indicazioni su colori e leggibilità. Vincolo dal progetto: gli incassi mantengono `#0ea5e9` (sky-500), già in uso e riconosciuto dall'utente.

- [ ] **Step 2: Aggiornare import, colori e dati derivati**

Sostituire l'import da `@/lib/statistiche-commesse`:

```ts
import {
  aggregaMese, aggregaFlussoMese, aggregaCostiUtiliMese, contaCommesseSenzaPreventivo,
  resocontoCliente, clientiUnici, riepilogoCreditiDebiti,
  type DatiStatistiche,
} from '@/lib/statistiche-commesse'
```

Aggiungere il colore delle uscite in `COLORS` (riga 23):

```ts
  pagamento: '#f43f5e', // rose-500 — uscite, distinto dallo sky degli incassi
```

Sostituire la destrutturazione (riga 53) e la riga `datiIncassi` (riga 62):

```ts
  const { commesse, acconti, anni, costiCommesse, scadenze, oggi } = dati
```

```ts
  const datiFlusso = useMemo(() => aggregaFlussoMese(acconti, scadenze, anno), [acconti, scadenze, anno])
  const riepilogo = useMemo(
    () => riepilogoCreditiDebiti(commesse, acconti, scadenze, oggi),
    [commesse, acconti, scadenze, oggi],
  )
```

Sostituire il totale incassi (riga 72) con i tre totali del flusso:

```ts
  const totaleAnnoIncassi = datiFlusso.reduce((s, r) => s + r.incasso, 0)
  const totaleAnnoPagamenti = datiFlusso.reduce((s, r) => s + r.pagamento, 0)
  const saldoCassaAnno = totaleAnnoIncassi - totaleAnnoPagamenti
```

- [ ] **Step 3: Sostituire il corpo della Card "Incassi"**

Nella sezione B (intorno alle righe 165-190), sostituire titolo, grafico e piè di pagina:

```tsx
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Incassi e pagamenti — {anno}</CardTitle>
              <p className="text-xs text-gray-500">
                Acconti incassati e scadenze pagate, sul mese della rispettiva data
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={datiFlusso} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => compactEuro.format(Number(v))} />
                  <Tooltip formatter={(v: number, name: string) => [`${formatEuro(Number(v))} €`, name]} />
                  <Legend />
                  <Bar dataKey="incasso" name="Incassi" fill={COLORS.incasso} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="incasso" position="top" formatter={labelEuro} style={{ fontSize: 10, fill: '#6b7280' }} />
                  </Bar>
                  <Bar dataKey="pagamento" name="Pagamenti" fill={COLORS.pagamento} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="pagamento" position="top" formatter={labelEuro} style={{ fontSize: 10, fill: '#6b7280' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm border-t pt-3">
                <span className="text-gray-600">
                  Incassato <strong className="text-sky-600">{formatEuro(totaleAnnoIncassi)} €</strong>
                </span>
                <span className="text-gray-600">
                  Pagato <strong className="text-rose-600">{formatEuro(totaleAnnoPagamenti)} €</strong>
                </span>
                <span className="text-gray-600">
                  Saldo di cassa{' '}
                  <strong className={saldoCassaAnno >= 0 ? 'text-green-600' : 'text-rose-600'}>
                    {saldoCassaAnno >= 0 ? '+' : ''}{formatEuro(saldoCassaAnno)} €
                  </strong>
                </span>
              </div>
            </CardContent>
          </Card>
```

- [ ] **Step 4: Verificare compilazione e test**

Run: `npx tsc --noEmit && npm test`
Expected: nessun errore TypeScript, 12 test della statistica verdi insieme al resto della suite.

- [ ] **Step 5: Commit**

```bash
git add components/commesse/StatisticheCommesse.tsx
git commit -m "feat: il grafico incassi confronta entrate e uscite mensili"
```

---

### Task 5: Card "Crediti e debiti"

**Files:**
- Modify: `components/commesse/StatisticheCommesse.tsx`

- [ ] **Step 1: Inserire la Card dopo il grafico di flusso**

Subito dopo la Card del Task 4 e prima della sezione Costi/Utili:

```tsx
          {/* B2) Crediti e debiti — fotografia a oggi, NON segue il selettore anno */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                Crediti e debiti
                <span className="text-xs font-normal text-white bg-gray-500 rounded px-1.5 py-0.5">
                  a oggi
                </span>
              </CardTitle>
              <p className="text-xs text-gray-500">
                Posizione dell&apos;azienda alla data odierna: non segue il selettore dell&apos;anno
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                <p className="text-xs uppercase tracking-wide text-sky-700 font-medium">Crediti da incassare</p>
                <p className="text-2xl font-bold text-sky-700 mt-1">{formatEuro(riepilogo.crediti)} €</p>
                <p className="text-xs text-gray-500 mt-1">Saldo residuo delle commesse non ancora incassate</p>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-600 font-medium">Debiti da pagare</p>
                <dl className="mt-2 space-y-1 text-sm">
                  {riepilogo.debitiScaduti > 0 && (
                    <div className="flex justify-between text-rose-700 font-medium">
                      <dt>Già scaduto</dt>
                      <dd>{formatEuro(riepilogo.debitiScaduti)} €</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-700">
                    <dt>Entro il {oggi.slice(0, 4)}</dt>
                    <dd>{formatEuro(riepilogo.debitiAnno)} €</dd>
                  </div>
                  {riepilogo.debitiDaProgrammare > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <dt>Da programmare</dt>
                      <dd>{formatEuro(riepilogo.debitiDaProgrammare)} €</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-500">
                    <dt>Rate oltre il {oggi.slice(0, 4)}</dt>
                    <dd>{formatEuro(riepilogo.debitiFuturi)} €</dd>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1 font-semibold text-gray-800">
                    <dt>Totale</dt>
                    <dd>{formatEuro(riepilogo.debitiTotali)} €</dd>
                  </div>
                </dl>
              </div>

              <div className="sm:col-span-2 rounded-lg border p-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-600 font-medium">
                    Posizione netta {oggi.slice(0, 4)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Crediti meno i debiti da saldare entro l&apos;anno; le rate future restano escluse
                  </p>
                </div>
                <p className={`text-2xl font-bold ${riepilogo.posizioneNetta >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                  {riepilogo.posizioneNetta >= 0 ? '+' : ''}{formatEuro(riepilogo.posizioneNetta)} €
                </p>
              </div>
            </CardContent>
          </Card>
```

- [ ] **Step 2: Aggiornare il sottotitolo della pagina**

Riga 104, per riflettere il contenuto nuovo:

```tsx
            <p className="text-sm text-gray-500 mt-0.5">Andamento commesse, flusso di cassa, crediti/debiti e resoconto per cliente</p>
```

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit && npx eslint components/commesse/StatisticheCommesse.tsx "app/(dashboard)/commesse/statistiche/page.tsx" lib/statistiche-commesse.ts`
Expected: nessun errore, nessun warning nuovo.

- [ ] **Step 4: Commit**

```bash
git add components/commesse/StatisticheCommesse.tsx
git commit -m "feat: riquadro crediti e debiti nella pagina statistiche"
```

---

### Task 6: Verifica finale

**Files:** nessuno

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: tutti i test verdi, compresi i 12 nuovi.

- [ ] **Step 2: Build di produzione**

Run: `npm run build`
Expected: `✓ Compiled successfully`, zero warning.

- [ ] **Step 3: Confronto coi dati reali**

Interrogare il database e confrontare i numeri con quelli mostrati dalla Card:

```sql
select
  (select coalesce(sum(importo),0) from scadenze where not pagato and not annullata) as debiti_totali,
  (select coalesce(sum(importo),0) from scadenze where not pagato and not annullata and data_scadenza is null) as da_programmare,
  (select coalesce(sum(importo),0) from scadenze where not pagato and not annullata and data_scadenza < current_date) as scaduti;
```

Valori attesi al 2026-08-16: debiti totali 522.884,55 · da programmare 4.266,59 · scaduti 4.440,51.

- [ ] **Step 4: Merge e push**

```bash
git checkout master
git merge --no-ff feat-incassi-pagamenti-crediti-debiti -m "Merge branch 'feat-incassi-pagamenti-crediti-debiti'"
git push origin master
git branch -d feat-incassi-pagamenti-crediti-debiti
```
