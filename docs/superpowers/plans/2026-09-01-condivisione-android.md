# Condivisione da Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far comparire WinStudio nel foglio di condivisione di Android, così un PDF o una foto condivisa dal tablet entra nel gestionale scegliendo la destinazione da un imbuto.

**Architecture:** Il manifest dichiara un `share_target`; il service worker intercetta il POST della condivisione e mette il file in Dexie senza farlo passare dal server; una pagina `/condividi` legge quel file e mostra un imbuto — area, poi i passi dell'area — che si chiude riusando `addDocumentoCommessa`. Le aree stanno in un registro dichiarativo: ora ne è accesa una sola, Produzione.

**Tech Stack:** Next.js 16 App Router (React 19, TypeScript), Serwist (service worker), Dexie (IndexedDB), Supabase Storage, shadcn/ui + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-condivisione-android-design.md`

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `types/condivisione.ts` | `FileCondiviso`, `PassiProps`, `AreaCondivisione` |
| `lib/db.ts` | Dexie versione 5: tabella `condivisioni` |
| `lib/documenti-percorsi.ts` | Logica pura: estensione, MIME, percorso storage, limite |
| `lib/documenti-percorsi.test.ts` | Vitest sulla logica pura |
| `lib/upload-documento.ts` | Caricamento a due livelli, estratto da `DialogDocumenti` |
| `public/site.webmanifest` | Blocco `share_target` |
| `app/sw.ts` | Listener `fetch` che intercetta la condivisione |
| `app/condividi/ricevi/route.ts` | Ripiego quando il service worker non è attivo |
| `app/(dashboard)/condividi/page.tsx` | Pagina dell'imbuto |
| `components/condivisione/ImbutoCondivisione.tsx` | Legge il file, primo livello, orchestrazione |
| `components/condivisione/aree.ts` | Registro delle aree |
| `components/condivisione/AreaProduzione.tsx` | Passi del ramo Produzione |
| `components/pwa/DataSync.tsx` | Avviso quando resta un file condiviso in sospeso |
| `components/commesse/DialogDocumenti.tsx` | Usa l'helper estratto invece della copia locale |

**Perché la logica pura è in un file a parte da `lib/upload-documento.ts`:** quest'ultimo importa le Server Action, che a loro volta importano `next/cache`. Importarlo da Vitest in ambiente `node` farebbe fallire il test per ragioni che non c'entrano con quello che si sta verificando. Le funzioni pure stanno quindi in `lib/documenti-percorsi.ts`, che non importa niente.

## Convenzioni del progetto da rispettare

- Server Action: `'use server'`, `createClient()` da `@/lib/supabase/server`, `getOrgId()` da `@/lib/auth`, `revalidatePath('/commesse', 'layout')` dopo le mutazioni.
- Client Component: `'use client'`, `useRouter().refresh()` dopo le mutazioni, `toast` da `sonner`.
- Dialoghi montati condizionalmente (`{stato && <Dialog… />}`), mai `useEffect` che azzera lo stato.
- Niente letture di `ref.current` in render né scritture su ref-prop (React Compiler).
- `lib/` ospita solo logica senza React; i componenti stanno in `components/`.
- Commenti in italiano, che spiegano il *perché*.

**Cancello di verifica per-task:** `npx tsc --noEmit` pulito. Il lint del progetto è a **zero problemi**: si controlla nel task finale e il criterio è che resti a zero.

**Non si può provare la condivisione da qui.** Serve un tablet Android con la PWA installata, e la PWA si installa solo da HTTPS: quindi dalla produzione, dopo il deploy. Tutti i task si verificano con `tsc`, i test e la build; la prova sul campo è il Task 10 e la fa l'utente.

---

### Task 1: Tipi e tabella Dexie

**Files:**
- Create: `types/condivisione.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Creare `types/condivisione.ts`**

```ts
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Un file arrivato dal foglio di condivisione di Android, in attesa di destinazione. */
export type FileCondiviso = {
  id: number
  nome: string
  tipo: string // MIME
  blob: Blob
  createdAt: string
}

export type PassiProps = {
  file: FileCondiviso
  /** Chiamata a salvataggio riuscito: l'imbuto cancella il file e chiude. */
  onFatto: () => void
  /** Torna al primo livello, la scelta dell'area. */
  onIndietro: () => void
}

/**
 * Un'area di destinazione dell'imbuto.
 *
 * Ogni area porta il proprio componente di passi invece di descriverli in un
 * linguaggio comune: Produzione cerca una commessa e sceglie un tipo, Dipendenti
 * sceglierebbe persona e mensilita', Magazzino un prodotto. Un motore generico
 * costerebbe piu' di quanto farebbe risparmiare, e andrebbe stretto alla prima
 * area che non ci rientra.
 */
export type AreaCondivisione = {
  id: string
  label: string
  descrizione: string
  icona: LucideIcon
  Passi: ComponentType<PassiProps>
}
```

- [ ] **Step 2: Aggiungere la tabella a `lib/db.ts`**

Dopo l'interfaccia `PendingAcconto`, aggiungere:

```ts
/**
 * File arrivato dal foglio di condivisione di Android e non ancora smistato.
 * Ce n'e' al massimo uno: il service worker svuota la tabella prima di scrivere.
 */
export interface CondivisioneInArrivo {
  id?: number
  nome: string
  tipo: string
  blob: Blob
  createdAt: string
}
```

Nella classe `GestionaleDB`, dopo `pendingAcconti!: …`:

```ts
  condivisioni!: EntityTable<CondivisioneInArrivo, 'id'>
```

E in fondo al costruttore, dopo il blocco `this.version(4)`:

```ts
    this.version(5).stores({
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
    })
```

Le versioni da 1 a 4 restano invariate: Dexie le usa per migrare i database già esistenti sui dispositivi.

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add types/condivisione.ts lib/db.ts
git commit -m "feat(condivisione): tipi e tabella Dexie per i file condivisi"
```

---

### Task 2: Logica pura dei percorsi (TDD)

**Files:**
- Create: `lib/documenti-percorsi.ts`
- Test: `lib/documenti-percorsi.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `lib/documenti-percorsi.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  LIMITE_BYTE_DOCUMENTO,
  estensioneDi,
  mimeDocumento,
  percorsoStorage,
} from './documenti-percorsi'

describe('estensioneDi', () => {
  it('prende l’ultima estensione, in minuscolo', () => {
    expect(estensioneDi('Rilievo.PDF')).toBe('pdf')
    expect(estensioneDi('scansione.2026.jpeg')).toBe('jpeg')
  })

  it('restituisce stringa vuota se non c’è estensione', () => {
    expect(estensioneDi('rilievo')).toBe('')
  })
})

describe('mimeDocumento', () => {
  it('si fida del tipo dichiarato dal browser quando c’è', () => {
    expect(mimeDocumento('x.pdf', 'application/pdf')).toBe('application/pdf')
  })

  it('ricava il tipo dall’estensione quando il browser dice octet-stream', () => {
    expect(mimeDocumento('rilievo.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(mimeDocumento('foto.JPG', '')).toBe('image/jpeg')
    expect(mimeDocumento('foto.png', '')).toBe('image/png')
  })

  it('ripiega su octet-stream per estensioni che non conosce', () => {
    expect(mimeDocumento('disegno.dxf', '')).toBe('application/octet-stream')
  })
})

describe('percorsoStorage', () => {
  it('mette org e commessa nel percorso, e l’estensione nel nome', () => {
    expect(percorsoStorage('org1', 'comm1', 'Rilievo.pdf', 1700000000000))
      .toBe('org1/comm1/1700000000000.pdf')
  })

  it('usa .bin quando il nome non ha estensione', () => {
    expect(percorsoStorage('org1', 'comm1', 'rilievo', 1700000000000))
      .toBe('org1/comm1/1700000000000.bin')
  })
})

describe('LIMITE_BYTE_DOCUMENTO', () => {
  it('è 20 MB, come il controllo che esisteva in DialogDocumenti', () => {
    expect(LIMITE_BYTE_DOCUMENTO).toBe(20 * 1024 * 1024)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `npx vitest run lib/documenti-percorsi.test.ts`
Expected: FAIL — `Failed to resolve import "./documenti-percorsi"`.

- [ ] **Step 3: Scrivere l'implementazione**

Creare `lib/documenti-percorsi.ts`:

```ts
/**
 * Come si chiama e dove finisce un documento caricato su una commessa.
 *
 * Sta a parte da `lib/upload-documento.ts` perche' quello importa le Server
 * Action, e con loro `next/cache`: importarlo da Vitest farebbe fallire i test
 * per ragioni che non c'entrano con quello che verificano.
 */

/** Oltre questa soglia il caricamento viene rifiutato. */
export const LIMITE_BYTE_DOCUMENTO = 20 * 1024 * 1024

const MIME_DA_ESTENSIONE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function estensioneDi(nome: string): string {
  const pezzi = nome.split('.')
  if (pezzi.length < 2) return ''
  return pezzi[pezzi.length - 1].toLowerCase()
}

/**
 * Il tipo MIME con cui salvare il file.
 *
 * Android e iOS a volte dichiarano `application/octet-stream` anche per un PDF:
 * salvandolo cosi', il browser poi lo scaricherebbe invece di aprirlo. Quando il
 * tipo dichiarato non dice niente, si ricava dall'estensione.
 */
export function mimeDocumento(nome: string, tipoDichiarato: string): string {
  if (tipoDichiarato && tipoDichiarato !== 'application/octet-stream') return tipoDichiarato
  return MIME_DA_ESTENSIONE[estensioneDi(nome)] ?? 'application/octet-stream'
}

/**
 * Percorso dentro il bucket `commesse-docs`. L'organizzazione in testa tiene
 * separati i dati fra aziende diverse anche a livello di storage.
 */
export function percorsoStorage(
  orgId: string,
  commessaId: string,
  nomeFile: string,
  ora: number = Date.now(),
): string {
  return `${orgId}/${commessaId}/${ora}.${estensioneDi(nomeFile) || 'bin'}`
}
```

- [ ] **Step 4: Eseguire il test per vederlo passare**

Run: `npx vitest run lib/documenti-percorsi.test.ts`
Expected: PASS — 8 test passati.

- [ ] **Step 5: Commit**

```bash
git add lib/documenti-percorsi.ts lib/documenti-percorsi.test.ts
git commit -m "feat(documenti): logica pura di percorso e tipo MIME"
```

---

### Task 3: Estrarre il caricamento da DialogDocumenti

**Files:**
- Create: `lib/upload-documento.ts`
- Modify: `components/commesse/DialogDocumenti.tsx`

- [ ] **Step 1: Creare `lib/upload-documento.ts`**

```ts
import { createClient } from '@/lib/supabase/client'
import {
  addDocumentoCommessa,
  getOrgIdPerUpload,
  uploadDocumentoCommessa,
} from '@/actions/commesse'
import {
  LIMITE_BYTE_DOCUMENTO,
  mimeDocumento,
  percorsoStorage,
} from '@/lib/documenti-percorsi'

/**
 * Carica un documento su una commessa. Restituisce `null` se e' andata,
 * altrimenti il messaggio d'errore da mostrare.
 *
 * Due strade, in quest'ordine, e non e' un dettaglio:
 *
 * 1. Il browser carica dritto su Supabase. Il file non attraversa le funzioni
 *    Vercel, quindi non incontra il limite sul corpo della richiesta (~4,5 MB)
 *    che blocca i file grandi passando dalla Server Action. Da qui sono passati
 *    file da 18 MB.
 * 2. Se quella fallisce, si ripiega sulla Server Action: su iOS e Android il
 *    client browser puo' non avere la sessione. Li' il file passa dal server e
 *    torna soggetto al limite di dimensione, ma il caso mobile continua a
 *    funzionare invece di fallire e basta.
 */
export async function caricaDocumentoCommessa(
  file: Blob,
  nomeFile: string,
  commessaId: string,
  tipo: string,
): Promise<string | null> {
  // Il controllo vive anche nella Server Action, ma il caricamento diretto su
  // Supabase non ci passa: senza questo, il limite non varrebbe piu'.
  if (file.size > LIMITE_BYTE_DOCUMENTO) return 'File troppo grande (max 20 MB)'

  // Su iOS i file da cloud (Dropbox/iCloud) sono lazy: arrayBuffer() forza la
  // lettura completa prima di spedirli.
  const buffer = await file.arrayBuffer()
  const contentType = mimeDocumento(nomeFile, file.type)
  const blob = new Blob([buffer], { type: contentType })

  try {
    const orgId = await getOrgIdPerUpload()
    const storagePath = percorsoStorage(orgId, commessaId, nomeFile)
    const supabase = createClient()
    const { error } = await supabase.storage
      .from('commesse-docs')
      .upload(storagePath, blob, { contentType })
    if (error) throw error
    await addDocumentoCommessa(commessaId, nomeFile, storagePath, tipo)
    return null
  } catch {
    const fd = new FormData()
    fd.append('file', blob, nomeFile)
    fd.append('commessaId', commessaId)
    fd.append('tipo', tipo)
    const result = await uploadDocumentoCommessa(fd)
    return result.error ?? null
  }
}
```

- [ ] **Step 2: Riscrivere `caricaFile` in `DialogDocumenti.tsx`**

Sostituire l'intera funzione `caricaFile` (dalla riga `const caricaFile = async (file: File): Promise<string | null> => {` fino alla `}` che la chiude, poco prima di `const handleUpload`) con:

```tsx
  const caricaFile = (file: File) => caricaDocumentoCommessa(file, file.name, commessaId, tipo)
```

Aggiungere in testa al file:

```tsx
import { caricaDocumentoCommessa } from '@/lib/upload-documento'
```

Poi togliere dagli import quelli rimasti senza uso — probabilmente `createClient` da `@/lib/supabase/client`, e da `@/actions/commesse` le voci `addDocumentoCommessa`, `getOrgIdPerUpload`, `uploadDocumentoCommessa` se il file non le usa altrove. **Verificare prima con una ricerca nel file**, non a occhio: alcune sono usate anche altrove nel componente.

- [ ] **Step 3: Verificare che il comportamento non sia cambiato**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npx eslint components/commesse/DialogDocumenti.tsx lib/upload-documento.ts`
Expected: nessun problema. Se segnala import non usati, toglierli.

Confronto a mano: l'ordine dei tentativi, il limite dei 20 MB, il testo del messaggio d'errore e il percorso di storage devono essere identici a prima. Il diff di `DialogDocumenti.tsx` deve essere solo rimozione più una riga.

- [ ] **Step 4: Commit**

```bash
git add lib/upload-documento.ts components/commesse/DialogDocumenti.tsx
git commit -m "refactor(documenti): un solo caricamento condiviso invece della copia nel dialog"
```

---

### Task 4: Manifest — dichiarare il share target

**Files:**
- Modify: `public/site.webmanifest`

- [ ] **Step 1: Aggiungere il blocco**

In `public/site.webmanifest`, dopo `"scope": "/"`, aggiungere (attenzione alla virgola dopo `"scope": "/"`):

```json
  "scope": "/",
  "share_target": {
    "action": "/condividi/ricevi",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [
        {
          "name": "file",
          "accept": ["application/pdf", "image/jpeg", "image/png"]
        }
      ]
    }
  }
```

- [ ] **Step 2: Verificare che sia JSON valido**

Run: `node -e "console.log(Object.keys(require('./public/site.webmanifest')))"`
Expected: elenco delle chiavi comprendente `share_target`. Se il file non è JSON valido il comando fallisce con un errore di parsing.

- [ ] **Step 3: Commit**

```bash
git add public/site.webmanifest
git commit -m "feat(condivisione): dichiarare WinStudio come destinazione di condivisione"
```

---

### Task 5: Service worker — intercettare la condivisione

**Files:**
- Modify: `app/sw.ts`

- [ ] **Step 1: Aggiungere il listener**

In `app/sw.ts`, subito **prima** della riga finale `serwist.addEventListeners()`, aggiungere:

```ts
/**
 * Condivisione da Android: il foglio di condivisione fa un POST multipart verso
 * `/condividi/ricevi`. Lo intercettiamo qui e mettiamo il file in IndexedDB,
 * cosi' non attraversa il server finche' non si sa dove va, e sopravvive a un
 * login intermedio se la sessione era scaduta.
 *
 * Questo listener va registrato PRIMA di `serwist.addEventListeners()`: la
 * regola `NetworkOnly` sulle navigazioni intercetterebbe altrimenti il POST e
 * lo manderebbe al server, dove finirebbe sul route di ripiego.
 */
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/condividi/ricevi') return

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('file')
        if (file instanceof File && file.size > 0) {
          // Una condivisione per volta: senza questo si accumulerebbero file
          // dimenticati che occupano spazio sul tablet.
          await db.condivisioni.clear()
          await db.condivisioni.add({
            nome: file.name || 'documento',
            tipo: file.type,
            blob: file,
            createdAt: new Date().toISOString(),
          })
        }
        return Response.redirect('/condividi', 303)
      } catch {
        return Response.redirect('/condividi?errore=lettura', 303)
      }
    })(),
  )
})
```

E in testa al file, dopo gli import esistenti:

```ts
import { db } from '@/lib/db'
```

- [ ] **Step 2: Verificare che il worker compili**

Run: `npx tsc --noEmit -p tsconfig.worker.json`
Expected: nessun errore. `tsconfig.worker.json` estende `tsconfig.json`, quindi l'alias `@/*` è disponibile.

Se l'import di `@/lib/db` non si risolve nel bundle del worker, il piano non cambia strada: verificare con `npm run build` che `public/sw.js` venga generato (Step 3). Il worker è compilato dallo stesso webpack dell'app, quindi l'alias vale.

- [ ] **Step 3: Verificare che la build produca il worker**

Run: `npm run build`
Expected: build completata, e nell'output la riga `(serwist) Bundling the service worker script with the URL '/sw.js'`.

Run: `node -e "const s=require('fs').readFileSync('public/sw.js','utf8'); console.log(s.includes('/condividi/ricevi') ? 'listener presente nel worker' : 'ATTENZIONE: listener assente')"`
Expected: `listener presente nel worker`.

- [ ] **Step 4: Commit**

```bash
git add app/sw.ts
git commit -m "feat(condivisione): il service worker tiene il file condiviso sul dispositivo"
```

---

### Task 6: Route di ripiego

**Files:**
- Create: `app/condividi/ricevi/route.ts`

- [ ] **Step 1: Creare il file**

```ts
import { NextResponse } from 'next/server'

/**
 * Ripiego per quando il service worker non e' ancora attivo — capita nei primi
 * istanti dopo l'installazione della PWA, o subito dopo un aggiornamento.
 *
 * In quel caso il POST della condivisione arriva davvero qui invece di essere
 * intercettato. Non salviamo niente: rimandiamo alla pagina con un avviso, che
 * e' meglio del 405 secco che Next risponderebbe senza questo file, e che
 * Android mostrerebbe come una pagina di errore grezza.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.redirect(
    new URL('/condividi?errore=sw', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    303,
  )
}
```

- [ ] **Step 2: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/condividi/ricevi/route.ts
git commit -m "feat(condivisione): ripiego quando il service worker non e' attivo"
```

---

### Task 7: I passi del ramo Produzione

**Files:**
- Create: `components/condivisione/AreaProduzione.tsx`

**Contesto:** `getCommessePerOrdine()` da `@/actions/produzione` restituisce `CommessaOpzione[]` = `{ id, numero_commessa, cliente_nome }[]`, già senza le vendite anonime. I tipi documento sono `TIPI_DOCUMENTO_PRODUZIONE` da `@/types/produzione`: `{ value, label }[]` con disegno, scheda_tecnica, ddt, conferma_ordine, foto, ordine_fornitore.

- [ ] **Step 1: Creare il componente**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCommessePerOrdine } from '@/actions/produzione'
import { caricaDocumentoCommessa } from '@/lib/upload-documento'
import { TIPI_DOCUMENTO_PRODUZIONE } from '@/types/produzione'
import type { CommessaOpzione } from '@/types/produzione'
import type { PassiProps } from '@/types/condivisione'

/** Normalizza per la ricerca: minuscolo e senza accenti. */
function normalizza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export default function AreaProduzione({ file, onFatto, onIndietro }: PassiProps) {
  const [commesse, setCommesse] = useState<CommessaOpzione[] | null>(null)
  const [cerca, setCerca] = useState('')
  const [scelta, setScelta] = useState<CommessaOpzione | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  // Caricamento dell'elenco: unica cosa che serve dal server prima di scegliere.
  useEffect(() => {
    let vivo = true
    getCommessePerOrdine()
      .then((c) => { if (vivo) setCommesse(c) })
      .catch(() => { if (vivo) setCommesse([]) })
    return () => { vivo = false }
  }, [])

  const q = normalizza(cerca.trim())
  const filtrate = (commesse ?? []).filter(
    (c) => !q || normalizza(`${c.numero_commessa} ${c.cliente_nome}`).includes(q),
  )

  const salva = async (tipo: string) => {
    if (!scelta) return
    setSalvando(tipo)
    const errore = await caricaDocumentoCommessa(file.blob, file.nome, scelta.id, tipo)
    setSalvando(null)
    if (errore) {
      toast.error(errore)
      return
    }
    toast.success(`Salvato su ${scelta.numero_commessa}`)
    onFatto()
  }

  // ── Secondo passo: il tipo di documento ────────────────────────────────────
  if (scelta) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => setScelta(null)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {scelta.numero_commessa} — {scelta.cliente_nome}
        </Button>
        <p className="text-sm font-medium text-gray-700">Che tipo di documento è?</p>
        <div className="grid grid-cols-2 gap-2">
          {TIPI_DOCUMENTO_PRODUZIONE.map((t) => (
            <Button
              key={t.value}
              variant="outline"
              className="h-12 justify-start"
              disabled={salvando !== null}
              onClick={() => salva(t.value)}
            >
              {salvando === t.value
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Upload className="h-4 w-4 mr-2 text-teal-600" />}
              {t.label}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  // ── Primo passo: la commessa ───────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={onIndietro}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Cambia area
      </Button>
      <p className="text-sm font-medium text-gray-700">Su quale commessa?</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-8"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Numero commessa o cliente..."
          autoFocus
        />
      </div>

      {commesse === null ? (
        <p className="text-sm text-gray-400 text-center py-6">Caricamento commesse...</p>
      ) : filtrate.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nessuna commessa trovata.</p>
      ) : (
        <div className="divide-y rounded-md border bg-white max-h-[50vh] overflow-y-auto">
          {filtrate.slice(0, 50).map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
              onClick={() => setScelta(c)}
            >
              <p className="text-sm font-medium text-gray-900">{c.numero_commessa}</p>
              <p className="text-xs text-gray-500">{c.cliente_nome}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/condivisione/AreaProduzione.tsx
git commit -m "feat(condivisione): passi del ramo Produzione, commessa e tipo documento"
```

---

### Task 8: Registro delle aree e imbuto

**Files:**
- Create: `components/condivisione/aree.ts`
- Create: `components/condivisione/ImbutoCondivisione.tsx`

- [ ] **Step 1: Creare il registro**

`components/condivisione/aree.ts`:

```ts
import { Factory } from 'lucide-react'
import AreaProduzione from './AreaProduzione'
import type { AreaCondivisione } from '@/types/condivisione'

/**
 * Le aree dell'imbuto. Aggiungerne una domani vuol dire scrivere il suo
 * componente di passi e metterlo qui: nient'altro cambia.
 *
 * Si mostrano solo le aree che funzionano davvero. Un elenco con Commesse,
 * Dipendenti e Magazzino in grigio orienterebbe meno di uno con una voce sola.
 */
export const AREE: AreaCondivisione[] = [
  {
    id: 'produzione',
    label: 'Produzione',
    descrizione: 'Disegni, schede tecniche, DDT e foto di una commessa',
    icona: Factory,
    Passi: AreaProduzione,
  },
]
```

- [ ] **Step 2: Creare l'imbuto**

`components/condivisione/ImbutoCondivisione.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Image as IconaImmagine, Share2 } from 'lucide-react'
import { db } from '@/lib/db'
import { AREE } from './aree'
import type { AreaCondivisione, FileCondiviso } from '@/types/condivisione'

/** Dimensione leggibile, per far capire subito se è il file giusto. */
function dimensione(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImbutoCondivisione({ errore }: { errore?: string }) {
  const router = useRouter()
  const [area, setArea] = useState<AreaCondivisione | null>(null)

  // useLiveQuery: se la condivisione arriva mentre la pagina è già aperta
  // (redirect del service worker su una scheda viva) il file compare da solo.
  const record = useLiveQuery(() => db.condivisioni.orderBy('createdAt').last(), [])

  if (errore === 'sw') {
    return (
      <Avviso titolo="Condivisione non completata">
        WinStudio era appena stato aggiornato e non era pronto a ricevere il file.
        Riapri l&apos;app e condividi di nuovo: è l&apos;unica volta che serve.
      </Avviso>
    )
  }

  if (errore === 'lettura') {
    return (
      <Avviso titolo="File non leggibile">
        Non è stato possibile leggere il file condiviso. Riprova dall&apos;app di
        origine, oppure caricalo dalla scheda della commessa.
      </Avviso>
    )
  }

  if (record === undefined) {
    return <p className="text-sm text-gray-400 py-8 text-center">Caricamento...</p>
  }

  if (!record) {
    return (
      <Avviso titolo="Nessun file da smistare">
        Questa pagina si apre da sola quando condividi un PDF o una foto verso
        WinStudio dal tuo dispositivo Android. Per farlo, WinStudio dev&apos;essere
        installato come app dalla schermata home.
      </Avviso>
    )
  }

  const file: FileCondiviso = {
    id: record.id!,
    nome: record.nome,
    tipo: record.tipo,
    blob: record.blob,
    createdAt: record.createdAt,
  }

  const chiudi = async () => {
    await db.condivisioni.clear()
    router.push('/produzione')
  }

  const Icona = file.tipo.startsWith('image/') ? IconaImmagine : FileText

  return (
    <div className="space-y-4">
      {/* Il file in cima, sempre visibile: dice cosa stai smistando */}
      <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
        <Icona className="h-8 w-8 text-teal-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{file.nome}</p>
          <p className="text-xs text-gray-500">{dimensione(file.blob.size)}</p>
        </div>
      </div>

      {area ? (
        <area.Passi file={file} onFatto={chiudi} onIndietro={() => setArea(null)} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Dove lo salvo?</p>
          {AREE.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setArea(a)}
              className="w-full flex items-center gap-3 rounded-lg border bg-white p-3 text-left hover:bg-gray-50"
            >
              <a.icona className="h-5 w-5 text-teal-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{a.label}</p>
                <p className="text-xs text-gray-500">{a.descrizione}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Avviso({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center space-y-2">
      <Share2 className="h-8 w-8 text-gray-300 mx-auto" />
      <p className="text-sm font-semibold text-gray-800">{titolo}</p>
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  )
}
```

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add components/condivisione/aree.ts components/condivisione/ImbutoCondivisione.tsx
git commit -m "feat(condivisione): registro delle aree e imbuto di scelta"
```

---

### Task 9: La pagina e l'avviso di file in sospeso

**Files:**
- Create: `app/(dashboard)/condividi/page.tsx`
- Modify: `components/pwa/DataSync.tsx`

- [ ] **Step 1: Creare la pagina**

`app/(dashboard)/condividi/page.tsx`:

```tsx
import ImbutoCondivisione from '@/components/condivisione/ImbutoCondivisione'

/**
 * Dove atterra un file condiviso da Android.
 *
 * Sta dentro il gruppo (dashboard) per ereditarne l'autenticazione: se la
 * sessione e' scaduta il login scatta prima, e al ritorno il file e' ancora nel
 * database locale del dispositivo, quindi non si perde.
 */
export default async function CondividiPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>
}) {
  const { errore } = await searchParams

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salva nel gestionale</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Scegli dove far finire il file che hai condiviso
        </p>
      </div>
      <ImbutoCondivisione errore={errore} />
    </div>
  )
}
```

- [ ] **Step 2: Aggiungere l'avviso in `DataSync.tsx`**

`DataSync` è montato in `LayoutShell`, quindi vive su tutte le pagine dell'area riservata. Serve perché se la sessione era scaduta al momento della condivisione, il login rimanda a `/` e il file resterebbe in attesa senza che nulla lo dica.

Il file importa già `db` e `useEffect`. Aggiungere agli import in testa:

```tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
```

Dentro `DataSync()`, subito dopo la riga `export default function DataSync() {`, aggiungere:

```tsx
  const pathname = usePathname()
  // Un file condiviso rimasto in sospeso: succede se al momento della
  // condivisione la sessione era scaduta e il login ha riportato alla home,
  // lasciando il file nel database locale senza che nulla lo dica.
  const inSospeso = useLiveQuery(() => db.condivisioni.count(), [])
  const mostraAvviso = (inSospeso ?? 0) > 0 && pathname !== '/condividi'
```

Il componente termina oggi con `return null` (ultima riga prima della `}` di
chiusura). Sostituire quella riga con:

```tsx
  if (!mostraAvviso) return null

  return (
    <Link
      href="/condividi"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      Hai un file condiviso da salvare
    </Link>
  )
```

Gli hook stanno tutti sopra il `return` condizionale, quindi l'ordine delle
chiamate resta stabile fra un render e l'altro.

- [ ] **Step 3: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run dev`, aprire `http://localhost:3000/condividi`
Expected: la pagina mostra "Nessun file da smistare" con la spiegazione, non un errore.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/condividi/page.tsx" components/pwa/DataSync.tsx
git commit -m "feat(condivisione): pagina di smistamento e avviso per i file in sospeso"
```

---

### Task 10: Verifica e prova sul tablet

**Files:** nessuno da modificare — è il collaudo.

- [ ] **Step 1: Suite, tipi, lint e build**

Run: `npm test`
Expected: tutti i test passano, compresi gli 8 nuovi di `documenti-percorsi`.

Run: `npx tsc --noEmit`
Expected: nessun errore.

Run: `npm run lint`
Expected: **nessun output**. Il progetto è a zero problemi di lint: qualunque riga in più viene da questa modifica e va corretta.

Run: `npm run build`
Expected: build completata, con la riga `(serwist) Bundling the service worker script`.

- [ ] **Step 2: Prova che il caricamento normale non sia cambiato**

Con `npm run dev`, aprire una commessa → Documenti → caricare un PDF.
Expected: si carica come prima. Questo verifica il refactoring del Task 3, che è la parte con più rischio di regressione perché tocca codice già in uso.

- [ ] **Step 3: Deploy e prova sul tablet Android**

La condivisione **non è provabile in locale**: la PWA si installa solo da HTTPS. Serve il deploy in produzione.

Sul tablet, in Chrome:
1. Aprire `https://gestionale-infissi.vercel.app`, menu → **Installa app**
2. Aprire l'app installata almeno una volta, così il service worker si attiva
3. Da un file manager, condividere un PDF → **WinStudio deve comparire** fra le app
4. Sceglierlo: si apre "Salva nel gestionale" col nome del file giusto
5. Produzione → cercare una commessa → scegliere "Disegno" → salvare
6. Verificare che il documento compaia in `/produzione` sulla commessa, e nel dialog Documenti della commessa
7. Ripetere condividendo una foto dalla galleria, scegliendo tipo "Foto"

- [ ] **Step 4: Prova senza rete**

Con la modalità aereo attiva, ripetere la condivisione fino al salvataggio.
Expected: compare un messaggio d'errore, e riaprendo l'app il pulsante "Hai un file condiviso da salvare" riporta all'imbuto col file ancora lì.

- [ ] **Step 5: Chiusura**

```bash
git checkout master
git merge --ff-only feat/condivisione-android
git push origin master
git branch -d feat/condivisione-android
git push origin --delete feat/condivisione-android
```

---

## Scostamenti dallo spec

Uno solo, sui test. Lo spec chiedeva Vitest anche sull'ordine dei tentativi di
`lib/upload-documento.ts`. Verificarlo richiederebbe di simulare Supabase e le
Server Action, e in questo progetto non esiste alcuna infrastruttura di mock: la
suite copre solo funzioni pure. Il piano testa quindi la logica pura in
`lib/documenti-percorsi.ts` — estensione, tipo MIME, percorso, limite — e lascia
l'orchestrazione alla prova a mano del Task 10, Step 2. Introdurre i mock per
questa sola funzione sarebbe un cambio di infrastruttura fuori perimetro.

## Cosa resta fuori

iPhone e iPad: Safari non apre il foglio di condivisione alle PWA, e nessuna quantità di codice lo cambia. Più file in una sola condivisione. La coda che ricarica da sola al ritorno della rete. Le aree Commesse, Dipendenti e Magazzino: c'è l'impalcatura, si accendono quando servono. Condivisione di testo o link — il `share_target` dichiara solo file.

## Note per chi implementa

**Il rischio più alto di questo piano è il Task 3**, non i pezzi nuovi: tocca `DialogDocumenti`, che è in uso tutti i giorni. Il diff deve essere solo rimozione più una riga di chiamata, e il comportamento identico. Se ti accorgi di stare cambiando anche solo un messaggio d'errore, fermati.

**Il Task 5 ha un ordine che conta.** Il listener `fetch` va prima di `serwist.addEventListeners()`. Messo dopo, la regola `NetworkOnly` sulle navigazioni risponde per prima e il POST finisce sul route di ripiego: la condivisione sembrerebbe funzionare a metà, dicendo sempre "riapri l'app e riprova".
