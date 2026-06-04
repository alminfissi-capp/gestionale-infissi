# Firma Ricevuta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere firma touch (canvas) alla ricevuta di pagamento: lo staff disegna con il dito, la firma viene salvata sull'acconto e inclusa nel PDF condivisibile.

**Architecture:** SignaturePad canvas → DrawerFirmaRicevuta (Sheet) → server action salva base64 su `acconti_commessa.firma_immagine` → RicevutaPdfDocument embeds firma via `<Image>`. Firma default riusabile salvata in `impostazioni.firma_default`. Nessun Storage esterno — base64 diretto in Postgres TEXT.

**Tech Stack:** Next.js App Router, shadcn/ui Sheet, react-pdf Image, Supabase MCP, TypeScript

---

### Task 1: Installa shadcn Sheet + DB migration

**Files:**
- Create: `components/ui/sheet.tsx` (via shadcn CLI)
- Create: `supabase/migrations/20260604190000_firma_ricevuta.sql`

- [ ] **Step 1: Installa Sheet**

```bash
npx shadcn@latest add sheet
```

Risposta attesa: file `components/ui/sheet.tsx` creato.

- [ ] **Step 2: Crea il file di migration**

Crea `supabase/migrations/20260604190000_firma_ricevuta.sql`:

```sql
ALTER TABLE acconti_commessa ADD COLUMN IF NOT EXISTS firma_immagine TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS firma_default TEXT;
```

- [ ] **Step 3: Applica la migration via Supabase MCP**

Usa `mcp__claude_ai_Supabase__apply_migration` con:
- `project_id`: `xawyrtqclpeylxnhwhwo`
- `name`: `firma_ricevuta`
- sql: il contenuto del file sopra

- [ ] **Step 4: Commit**

```bash
git add components/ui/sheet.tsx supabase/migrations/20260604190000_firma_ricevuta.sql
git commit -m "feat: installa Sheet + migration firma_immagine/firma_default"
```

---

### Task 2: Aggiorna tipi TypeScript

**Files:**
- Modify: `types/commessa.ts` (aggiungi campo ad AccontoCommessa)
- Modify: `types/impostazioni.ts` (aggiungi campo a Settings)

- [ ] **Step 1: Aggiungi `firma_immagine` ad `AccontoCommessa` in `types/commessa.ts`**

Trova il blocco `AccontoCommessa` (riga 50) e aggiungi il campo prima della chiusura:

```typescript
export type AccontoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  importo: number
  data_pagamento: string
  metodo_pagamento: MetodoPagamento
  note: string | null
  firma_immagine: string | null
  created_at: string
}
```

- [ ] **Step 2: Aggiungi `firma_default` a `Settings` in `types/impostazioni.ts`**

Aggiungi prima di `created_at`:

```typescript
export type Settings = {
  id: string
  organization_id: string
  denominazione: string | null
  indirizzo: string | null
  piva: string | null
  codice_fiscale: string | null
  telefono: string | null
  email: string | null
  logo_url: string | null
  aliquote_iva: number[]
  giorni_validita_preventivo: number
  num_prefisso: string | null
  num_prefisso_calcoli: string | null
  num_operatore: string | null
  num_contatore: number
  num_anno: number
  num_padding: number
  firma_default: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 4: Commit**

```bash
git add types/commessa.ts types/impostazioni.ts
git commit -m "feat: tipi firma_immagine su AccontoCommessa e firma_default su Settings"
```

---

### Task 3: Server actions

**Files:**
- Modify: `actions/commesse.ts` (aggiungi `salvaFirmaAcconto`)
- Modify: `actions/impostazioni.ts` (aggiungi `salvaFirmaDefault`)

- [ ] **Step 1: Aggiungi `salvaFirmaAcconto` in `actions/commesse.ts`**

Aggiungi in fondo al file, prima dell'ultima riga:

```typescript
export async function salvaFirmaAcconto(accontoId: string, firmaBase64: string): Promise<void> {
  if (!firmaBase64.startsWith('data:image/png;base64,')) {
    throw new Error('Formato firma non valido')
  }
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('acconti_commessa')
    .update({ firma_immagine: firmaBase64 })
    .eq('id', accontoId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}
```

- [ ] **Step 2: Aggiungi `salvaFirmaDefault` in `actions/impostazioni.ts`**

Aggiungi dopo `saveLogoUrl`:

```typescript
export async function salvaFirmaDefault(firmaBase64: string | null): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('settings')
    .upsert({ organization_id: orgId, firma_default: firmaBase64 }, { onConflict: 'organization_id' })
  if (error) throw new Error(error.message)
  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
}
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 4: Commit**

```bash
git add actions/commesse.ts actions/impostazioni.ts
git commit -m "feat: server actions salvaFirmaAcconto e salvaFirmaDefault"
```

---

### Task 4: Componente SignaturePad

**Files:**
- Create: `components/ui/SignaturePad.tsx`

- [ ] **Step 1: Crea `components/ui/SignaturePad.tsx`**

```typescript
'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface SignaturePadProps {
  onChange: (base64: string | null) => void
  className?: string
}

export default function SignaturePad({ onChange, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    // Sfondo bianco esplicito (necessario per PNG opaco in react-pdf)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = 'clientX' in e ? e.clientX : e.clientX
    const clientY = 'clientY' in e ? e.clientY : e.clientY
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }, [onChange])

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const onDown = (e: MouseEvent) => {
      drawing.current = true
      const pos = getPos(e, canvas)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
    const onMove = (e: MouseEvent) => {
      if (!drawing.current) return
      const pos = getPos(e, canvas)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      hasDrawn.current = true
    }
    const onUp = () => {
      if (!drawing.current) return
      drawing.current = false
      emitChange()
    }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onUp)
    }
  }, [emitChange])

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const onStart = (e: TouchEvent) => {
      e.preventDefault()
      drawing.current = true
      const pos = getPos(e.touches[0], canvas)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      if (!drawing.current) return
      const pos = getPos(e.touches[0], canvas)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      hasDrawn.current = true
    }
    const onEnd = () => {
      if (!drawing.current) return
      drawing.current = false
      emitChange()
    }

    canvas.addEventListener('touchstart', onStart, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onEnd)
    return () => {
      canvas.removeEventListener('touchstart', onStart)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onEnd)
    }
  }, [emitChange])

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    hasDrawn.current = false
    onChange(null)
  }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 text-gray-400 hover:text-gray-600 text-xs"
        onClick={handleClear}
      >
        Cancella
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add components/ui/SignaturePad.tsx
git commit -m "feat: SignaturePad — canvas touch/mouse per firma"
```

---

### Task 5: DrawerFirmaRicevuta

**Files:**
- Create: `components/commesse/DrawerFirmaRicevuta.tsx`

- [ ] **Step 1: Crea `components/commesse/DrawerFirmaRicevuta.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PenLine, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import SignaturePad from '@/components/ui/SignaturePad'
import { salvaFirmaAcconto } from '@/actions/commesse'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  accontoId: string
  firmaDefault: string | null
  onFirmaSalvata: (base64: string) => void
}

export default function DrawerFirmaRicevuta({
  open,
  onOpenChange,
  accontoId,
  firmaDefault,
  onFirmaSalvata,
}: Props) {
  const [firmaCanvas, setFirmaCanvas] = useState<string | null>(null)
  const [usaDefault, setUsaDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  const firmaScelta = usaDefault ? firmaDefault : firmaCanvas

  const handleSalva = async () => {
    if (!firmaScelta) {
      toast.error('Traccia la firma prima di salvare')
      return
    }
    setSaving(true)
    try {
      await salvaFirmaAcconto(accontoId, firmaScelta)
      onFirmaSalvata(firmaScelta)
      onOpenChange(false)
      toast.success('Firma salvata')
    } catch {
      toast.error('Errore nel salvataggio della firma')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            Firma del ricevente
          </SheetTitle>
        </SheetHeader>

        {/* Firma default */}
        {firmaDefault && (
          <div className="mb-4 border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Firma predefinita
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={firmaDefault}
              alt="Firma predefinita"
              className="h-12 object-contain"
            />
            <Button
              type="button"
              variant={usaDefault ? 'default' : 'outline'}
              size="sm"
              className="mt-2 w-full"
              onClick={() => setUsaDefault(!usaDefault)}
            >
              {usaDefault ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Selezionata</>
              ) : (
                'Usa questa firma'
              )}
            </Button>
          </div>
        )}

        {/* Canvas */}
        {!usaDefault && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {firmaDefault ? 'Oppure traccia una nuova firma:' : 'Traccia la firma con il dito:'}
            </p>
            <SignaturePad onChange={setFirmaCanvas} />
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={saving || !firmaScelta}
          onClick={handleSalva}
        >
          {saving ? 'Salvataggio...' : 'Salva e applica'}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/DrawerFirmaRicevuta.tsx
git commit -m "feat: DrawerFirmaRicevuta — sheet con canvas firma e firma default"
```

---

### Task 6: Aggiorna RicevutaAcconto

**Files:**
- Modify: `components/commesse/RicevutaAcconto.tsx`

- [ ] **Step 1: Sostituisci il contenuto completo di `components/commesse/RicevutaAcconto.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Printer, ChevronLeft, Share2, PenLine, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, AccontoCommessa, MetodoPagamento } from '@/types/commessa'
import type { Settings } from '@/types/impostazioni'
import DrawerFirmaRicevuta from '@/components/commesse/DrawerFirmaRicevuta'

interface Props {
  commessa: CommessaCompleta
  acconto: AccontoCommessa
  settings: Settings | null
  logoUrl: string | null
  firmaDefault: string | null
}

const METODI: Record<MetodoPagamento, string> = {
  contanti: 'Contanti',
  bonifico: 'Bonifico',
  riba: 'Ri.Ba.',
  altro: 'Altro',
}

function formatData(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export default function RicevutaAcconto({ commessa, acconto, settings, logoUrl, firmaDefault }: Props) {
  const ricevutaRef = acconto.id.slice(-6).toUpperCase()
  const [sharing, setSharing] = useState(false)
  const [firmaAperta, setFirmaAperta] = useState(false)
  const [firmaCorrente, setFirmaCorrente] = useState<string | null>(acconto.firma_immagine)

  async function handleShare() {
    setSharing(true)
    try {
      const [{ pdf }, { default: RicevutaPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./RicevutaPdfDocument'),
      ])

      const blob = await pdf(
        <RicevutaPdfDocument
          commessa={commessa}
          acconto={acconto}
          settings={settings}
          logoUrl={logoUrl}
          firmaImmagine={firmaCorrente}
        />
      ).toBlob()

      const [y, m, d] = acconto.data_pagamento.split('-')
      const dataStr = `${d}.${m}.${y.slice(2)}`
      const fileName = `Ric.n ${ricevutaRef} - ${commessa.cliente_nome} - ${dataStr}.pdf`
      const file = new File([blob], fileName, { type: 'application/pdf' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // L'utente ha chiuso il pannello — nessun errore da mostrare
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/commesse">
            <ChevronLeft className="h-4 w-4" />
            Commesse
          </Link>
        </Button>
        <div className="flex-1" />
        {firmaCorrente ? (
          <Button
            variant="outline"
            size="sm"
            className="text-green-600 border-green-200 hover:border-green-300"
            onClick={() => setFirmaAperta(true)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
            Firmata
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setFirmaAperta(true)}>
            <PenLine className="h-4 w-4 mr-1.5" />
            Firma
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleShare} disabled={sharing}>
          <Share2 className="h-4 w-4 mr-1.5" />
          {sharing ? 'Generazione...' : 'Condividi PDF'}
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa
        </Button>
      </div>

      {/* Sfondo grigio schermo */}
      <div className="print:hidden bg-gray-100 min-h-screen py-10 px-4 flex items-start justify-center">
        <div className="bg-white shadow-md w-full max-w-[600px] p-10">
          <Ricevuta
            commessa={commessa}
            acconto={acconto}
            settings={settings}
            logoUrl={logoUrl}
            ricevutaRef={ricevutaRef}
            firmaCorrente={firmaCorrente}
          />
        </div>
      </div>

      {/* Stampa */}
      <div className="hidden print:block p-10 max-w-[600px] mx-auto">
        <Ricevuta
          commessa={commessa}
          acconto={acconto}
          settings={settings}
          logoUrl={logoUrl}
          ricevutaRef={ricevutaRef}
          firmaCorrente={firmaCorrente}
        />
      </div>

      <style>{`
        @page { size: A4; margin: 20mm 25mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>

      <DrawerFirmaRicevuta
        open={firmaAperta}
        onOpenChange={setFirmaAperta}
        accontoId={acconto.id}
        firmaDefault={firmaDefault}
        onFirmaSalvata={setFirmaCorrente}
      />
    </>
  )
}

function Ricevuta({ commessa, acconto, settings, logoUrl, ricevutaRef, firmaCorrente }: {
  commessa: CommessaCompleta
  acconto: AccontoCommessa
  settings: Settings | null
  logoUrl: string | null
  ricevutaRef: string
  firmaCorrente: string | null
}) {
  const accontinSnapshot = commessa.acconti
    .filter((a) => a.created_at <= acconto.created_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const totaleSnapshot = accontinSnapshot.reduce((sum, a) => sum + a.importo, 0)
  const saldoSnapshot = commessa.totale - totaleSnapshot

  return (
    <div className="font-sans text-gray-900 text-[13px] space-y-6">

      {/* Intestazione azienda */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />
          )}
          {settings?.denominazione && (
            <div>
              <p className="font-bold text-[15px]">{settings.denominazione}</p>
              <p className="text-gray-500 text-[11px]">
                {[settings.indirizzo, settings.piva ? `P.IVA ${settings.piva}` : null]
                  .filter(Boolean).join(' — ')}
              </p>
              <p className="text-gray-500 text-[11px]">
                {[settings.telefono, settings.email].filter(Boolean).join(' — ')}
              </p>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Rif.</p>
          <p className="font-mono font-bold text-[15px] text-gray-700">{ricevutaRef}</p>
        </div>
      </div>

      <hr className="border-gray-300" />

      {/* Titolo */}
      <div className="text-center space-y-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ricevuta di pagamento</p>
        <p className="text-[13px] text-gray-500">Data: <strong>{formatData(acconto.data_pagamento)}</strong></p>
      </div>

      <hr className="border-gray-200" />

      {/* Cliente */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Cliente</p>
        <p className="text-[16px] font-semibold">{commessa.cliente_nome}</p>
      </div>

      {/* Importo */}
      <div className="border-2 border-gray-200 rounded-lg p-6 text-center space-y-1 bg-gray-50">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Si dichiara di aver ricevuto la somma di
        </p>
        <p className="text-4xl font-bold text-gray-900">{formatEuro(acconto.importo)}</p>
        <p className="text-[12px] text-gray-500">
          Metodo di pagamento: <strong>{METODI[acconto.metodo_pagamento] ?? acconto.metodo_pagamento}</strong>
        </p>
      </div>

      {/* Riferimento e causale */}
      <div className="space-y-2">
        {(commessa.numero_commessa || commessa.numero_preventivo) && (
          <div className="flex gap-2 flex-wrap">
            {commessa.numero_commessa && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">N. Commessa</p>
                <p className="font-mono font-medium">{commessa.numero_commessa}</p>
              </div>
            )}
            {commessa.numero_preventivo && (
              <div className="ml-8">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">N. Preventivo</p>
                <p className="font-mono font-medium">{commessa.numero_preventivo}</p>
              </div>
            )}
          </div>
        )}
        {commessa.note && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Descrizione lavori</p>
            <p className="text-gray-700">{commessa.note}</p>
          </div>
        )}
        {acconto.note && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Note pagamento</p>
            <p className="text-gray-700">{acconto.note}</p>
          </div>
        )}
      </div>

      {/* Riepilogo acconti */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
          Riepilogo pagamenti
        </p>
        {accontinSnapshot.length > 1 && (
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1 text-gray-400 font-semibold">Data</th>
                <th className="text-left py-1 text-gray-400 font-semibold">Metodo</th>
                <th className="text-right py-1 text-gray-400 font-semibold">Importo</th>
              </tr>
            </thead>
            <tbody>
              {accontinSnapshot.map((a) => (
                <tr key={a.id} className={`border-b border-gray-100 ${a.id === acconto.id ? 'font-semibold bg-gray-50' : 'text-gray-500'}`}>
                  <td className="py-1">{formatData(a.data_pagamento)}</td>
                  <td className="py-1">{METODI[a.metodo_pagamento] ?? a.metodo_pagamento}</td>
                  <td className="py-1 text-right">{formatEuro(a.importo)}{a.id === acconto.id ? ' ←' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-between mt-2 text-[12px]">
          <span className="text-gray-500">Totale lavori</span>
          <span className="font-medium">{formatEuro(commessa.totale)}</span>
        </div>
        <div className="flex justify-between mt-0.5 text-[12px]">
          <span className="text-gray-500">Totale ricevuto</span>
          <span className="font-semibold">{formatEuro(totaleSnapshot)}</span>
        </div>
        <div className="flex justify-between mt-1 pt-1 text-[12px] border-t border-gray-200">
          <span className="text-gray-600 font-medium">Saldo rimanente</span>
          <span className={`font-bold ${saldoSnapshot <= 0.005 ? 'text-green-600' : 'text-orange-600'}`}>
            {formatEuro(saldoSnapshot)}
          </span>
        </div>
      </div>

      <hr className="border-gray-300 mt-8" />

      {/* Firma */}
      <div className="flex justify-between items-end pt-4">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Firma del ricevente</p>
          {firmaCorrente ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firmaCorrente} alt="Firma" className="h-10 object-contain mb-1" />
          ) : (
            <div className="mb-4" />
          )}
          <div className="w-48 border-b border-gray-400" />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-6">Data e luogo</p>
          <div className="w-36 border-b border-gray-400" />
        </div>
      </div>

    </div>
  )
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/RicevutaAcconto.tsx
git commit -m "feat: RicevutaAcconto — pulsante Firma, drawer, firma nella preview"
```

---

### Task 7: Aggiorna RicevutaPdfDocument

**Files:**
- Modify: `components/commesse/RicevutaPdfDocument.tsx`

- [ ] **Step 1: Aggiungi prop `firmaImmagine` e aggiorna la sezione firma**

Aggiungi la prop all'interfaccia `Props`:

```typescript
interface Props {
  commessa: CommessaCompleta
  acconto: AccontoCommessa
  settings: Settings | null
  logoUrl: string | null
  firmaImmagine?: string | null
}
```

Aggiorna la firma dello stile per la firma:

Nella sezione `StyleSheet.create`, aggiungi dopo `firmaLineShort`:

```typescript
  firmaImg: { height: 36, maxWidth: 140 },
```

Aggiorna la destructuring della funzione:

```typescript
export default function RicevutaPdfDocument({ commessa, acconto, settings, logoUrl, firmaImmagine }: Props) {
```

Sostituisci la sezione `{/* Firma */}`:

```typescript
        {/* Firma */}
        <View style={s.firmaRow}>
          <View>
            <Text style={s.firmaLabel}>FIRMA DEL RICEVENTE</Text>
            {firmaImmagine ? (
              <Image src={firmaImmagine} style={s.firmaImg} />
            ) : (
              <View style={{ marginBottom: 18 }} />
            )}
            <View style={s.firmaLine} />
          </View>
          <View>
            <Text style={[s.firmaLabel, { textAlign: 'right' }]}>DATA E LUOGO</Text>
            <View style={s.firmaLineShort} />
          </View>
        </View>
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add components/commesse/RicevutaPdfDocument.tsx
git commit -m "feat: RicevutaPdfDocument — embed firma immagine nel PDF"
```

---

### Task 8: Aggiorna page.tsx ricevuta

**Files:**
- Modify: `app/(print)/commesse/[id]/ricevuta/[accontoId]/page.tsx`

- [ ] **Step 1: Passa `firmaDefault` a `RicevutaAcconto`**

Sostituisci il contenuto del file con:

```typescript
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCommessaById } from '@/actions/commesse'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import RicevutaAcconto from '@/components/commesse/RicevutaAcconto'

interface Props {
  params: Promise<{ id: string; accontoId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, accontoId } = await params
  const commessa = await getCommessaById(id)
  if (!commessa) return { title: 'Ricevuta' }
  const acconto = commessa.acconti.find((a) => a.id === accontoId)
  if (!acconto) return { title: 'Ricevuta' }

  const ref = acconto.id.slice(-6).toUpperCase()
  const [y, m, d] = acconto.data_pagamento.split('-')
  const data = `${d}.${m}.${y.slice(2)}`
  const nome = commessa.cliente_nome || ''

  return { title: `Ric.n ${ref} - ${nome} - ${data}` }
}

export default async function RicevutaAccontoPage({ params }: Props) {
  const { id, accontoId } = await params

  const [commessa, settings] = await Promise.all([
    getCommessaById(id),
    getSettings(),
  ])

  if (!commessa) notFound()

  const acconto = commessa.acconti.find((a) => a.id === accontoId)
  if (!acconto) notFound()

  const logoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

  return (
    <RicevutaAcconto
      commessa={commessa}
      acconto={acconto}
      settings={settings}
      logoUrl={logoUrl}
      firmaDefault={settings?.firma_default ?? null}
    />
  )
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add "app/(print)/commesse/[id]/ricevuta/[accontoId]/page.tsx"
git commit -m "feat: ricevuta page — passa firmaDefault da settings"
```

---

### Task 9: Sezione firma default in Impostazioni

**Files:**
- Modify: `app/(dashboard)/impostazioni/page.tsx`
- Create: `components/impostazioni/SezioneFiremaDefault.tsx`

- [ ] **Step 1: Crea `components/impostazioni/SezioneFirmaDefault.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SignaturePad from '@/components/ui/SignaturePad'
import { salvaFirmaDefault } from '@/actions/impostazioni'

interface Props {
  firmaDefault: string | null
}

export default function SezioneFirmaDefault({ firmaDefault: initialFirma }: Props) {
  const [firma, setFirma] = useState<string | null>(initialFirma)
  const [nuovaFirma, setNuovaFirma] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSalva = async () => {
    if (!nuovaFirma) return
    setSaving(true)
    try {
      await salvaFirmaDefault(nuovaFirma)
      setFirma(nuovaFirma)
      setNuovaFirma(null)
      toast.success('Firma predefinita salvata')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const handleElimina = async () => {
    if (!confirm('Eliminare la firma predefinita?')) return
    setSaving(true)
    try {
      await salvaFirmaDefault(null)
      setFirma(null)
      toast.success('Firma eliminata')
    } catch {
      toast.error('Errore eliminazione')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Firma predefinita ricevute</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Usata come scorciatoia nelle ricevute. Puoi sempre tracciare una firma diversa al momento.
        </p>
      </div>

      {firma && (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={firma} alt="Firma corrente" className="h-10 object-contain flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0"
            onClick={handleElimina}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2">
          {firma ? 'Traccia una nuova firma per sostituirla:' : 'Traccia la firma con il dito o il mouse:'}
        </p>
        <SignaturePad onChange={setNuovaFirma} />
      </div>

      <Button
        type="button"
        disabled={!nuovaFirma || saving}
        onClick={handleSalva}
        size="sm"
      >
        {saving ? 'Salvataggio...' : 'Salva firma predefinita'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Aggiorna `app/(dashboard)/impostazioni/page.tsx`**

Aggiungi l'import dopo gli import esistenti:

```typescript
import SezioneFirmaDefault from '@/components/impostazioni/SezioneFirmaDefault'
```

Inserisci la Card firma subito dopo la Card logo (riga 90, dopo `</Card>`):

```typescript
      {/* Firma predefinita */}
      <Card>
        <CardHeader>
          <CardTitle>Firma predefinita ricevute</CardTitle>
          <CardDescription>
            Usata come scorciatoia nelle ricevute di pagamento. Puoi sempre tracciare una firma diversa al momento dell&apos;incasso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SezioneFirmaDefault firmaDefault={settings?.firma_default ?? null} />
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npx tsc --noEmit
```

Atteso: zero errori.

- [ ] **Step 4: Commit e push finale**

```bash
git add components/impostazioni/SezioneFirmaDefault.tsx app/\(dashboard\)/impostazioni/page.tsx
git commit -m "feat: sezione firma default in impostazioni"
git push
```
