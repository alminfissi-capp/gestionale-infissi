# AI Assistant Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un pannello AI chat nella sidebar destra di Win Studio che conosce il contesto della pagina corrente e può leggere/scrivere dati (con conferma utente per le mutazioni).

**Architecture:** API route Next.js con Vercel AI SDK (`streamText`) per lo streaming; tool read-only auto-eseguiti lato server; tool write senza `execute` (human-in-the-loop) — il frontend mostra la richiesta, l'utente conferma, il client chiama la server action e passa il risultato via `addToolResult`. Pannello destro slide-in integrato in `LayoutShell.tsx`.

**Tech Stack:** `ai` v4, `@ai-sdk/anthropic`, `ai/react` (`useChat`), `claude-3-5-sonnet-20241022`, React 19, Next.js 16 App Router, Supabase server client

---

## Struttura file

| File | Operazione | Responsabilità |
|------|-----------|----------------|
| `app/api/assistant/route.ts` | Crea | Endpoint POST streaming, definisce tutti i tool, system prompt |
| `components/assistant/AISidebar.tsx` | Crea | UI chat, rendering messaggi, conferma tool write |
| `components/layout/LayoutShell.tsx` | Modifica | Aggiunge stato `aiOpen`, bottone toggle, render `<AISidebar>` |
| `.env.local` | Modifica | Aggiunge `ANTHROPIC_API_KEY` |

---

## Task 1: Installazione dipendenze + env

**Files:**
- Modifica: `package.json` (via npm install)
- Modifica: `.env.local`

- [ ] **Step 1: Installa Vercel AI SDK e provider Anthropic**

```bash
npm install ai @ai-sdk/anthropic
```

Atteso: nessun errore, `package.json` aggiornato con `"ai": "^4.x.x"` e `"@ai-sdk/anthropic": "^1.x.x"`.

- [ ] **Step 2: Aggiungi ANTHROPIC_API_KEY a .env.local**

Apri `.env.local` e aggiungi in coda:
```
ANTHROPIC_API_KEY=sk-ant-...
```

> Nota: la chiave va presa da https://console.anthropic.com — è una chiave server-side (nessun prefisso `NEXT_PUBLIC_`). Va aggiunta anche in Vercel → Settings → Environment Variables.

- [ ] **Step 3: Verifica che il build non sia rotto**

```bash
npm run build 2>&1 | tail -5
```

Atteso: `Route (app)` table senza errori. Se ci sono errori di tipo TypeScript ignorarli — sono nei file non toccati.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add Vercel AI SDK and Anthropic provider"
```

---

## Task 2: API route streaming con tool

**Files:**
- Crea: `app/api/assistant/route.ts`

- [ ] **Step 1: Crea il file route**

```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages, pageContext } = await req.json()

  const systemPrompt = `Sei l'assistente AI di Win Studio, un gestionale per un'azienda di infissi e serramenti (A.L.M. Infissi).
Aiuti l'utente a navigare nell'app, trovare informazioni, creare preventivi e gestire clienti.
Rispondi sempre in italiano. Sii conciso e diretto.

Contesto pagina corrente: ${pageContext?.pathname ?? '/'}
${pageContext?.description ? `Descrizione: ${pageContext.description}` : ''}

Strumenti disponibili:
- list_clienti: elenca tutti i clienti
- get_cliente: dettagli di un cliente
- list_preventivi: elenca i preventivi recenti
- get_preventivo: dettagli di un preventivo
- create_cliente: crea un nuovo cliente (richiede conferma utente)
- navigate_to: naviga a una pagina dell'app

Quando usi un tool write (create_cliente), l'utente deve confermare prima che venga eseguito.
Non inventare dati — usa sempre i tool per leggere dal database.`

  const supabase = await createClient()
  const orgId = await getOrgId()

  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    system: systemPrompt,
    messages,
    maxSteps: 5,
    tools: {
      list_clienti: tool({
        description: 'Elenca tutti i clienti dell\'organizzazione',
        parameters: z.object({}),
        execute: async () => {
          const { data, error } = await supabase
            .from('clienti')
            .select('id, nome, cognome, ragione_sociale, tipo, email, telefono')
            .eq('organization_id', orgId)
            .order('cognome', { ascending: true })
            .limit(50)
          if (error) return { error: error.message }
          return { clienti: data ?? [] }
        },
      }),

      get_cliente: tool({
        description: 'Dettagli di un cliente specifico',
        parameters: z.object({
          id: z.string().describe('ID del cliente'),
        }),
        execute: async ({ id }) => {
          const { data, error } = await supabase
            .from('clienti')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single()
          if (error) return { error: error.message }
          return { cliente: data }
        },
      }),

      list_preventivi: tool({
        description: 'Elenca i preventivi recenti',
        parameters: z.object({
          limit: z.number().optional().describe('Max risultati, default 20'),
          stato: z.enum(['bozza', 'inviato', 'accettato', 'rifiutato']).optional(),
        }),
        execute: async ({ limit = 20, stato }) => {
          let query = supabase
            .from('preventivi')
            .select('id, numero, data, stato, totale_finale, clienti(nome, cognome, ragione_sociale)')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit)
          if (stato) query = query.eq('stato', stato)
          const { data, error } = await query
          if (error) return { error: error.message }
          return { preventivi: data ?? [] }
        },
      }),

      get_preventivo: tool({
        description: 'Dettagli di un preventivo specifico',
        parameters: z.object({
          id: z.string().describe('ID del preventivo'),
        }),
        execute: async ({ id }) => {
          const { data, error } = await supabase
            .from('preventivi')
            .select('*, clienti(nome, cognome, ragione_sociale, email, telefono)')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single()
          if (error) return { error: error.message }
          return { preventivo: data }
        },
      }),

      // Tool write: NESSUN execute → human-in-the-loop
      create_cliente: tool({
        description: 'Crea un nuovo cliente (richiede conferma dell\'utente)',
        parameters: z.object({
          tipo: z.enum(['privato', 'azienda']).describe('Tipo cliente'),
          nome: z.string().optional().describe('Nome (privati)'),
          cognome: z.string().optional().describe('Cognome (privati)'),
          ragione_sociale: z.string().optional().describe('Ragione sociale (aziende)'),
          email: z.string().optional(),
          telefono: z.string().optional(),
          indirizzo: z.string().optional(),
          citta: z.string().optional(),
          cap: z.string().optional(),
        }),
      }),

      navigate_to: tool({
        description: 'Naviga a una pagina dell\'app',
        parameters: z.object({
          path: z.string().describe('Path relativo, es: /clienti, /preventivi, /preventivi/nuovo'),
          label: z.string().describe('Nome leggibile della destinazione'),
        }),
        // Nessun execute: navigazione gestita lato client
      }),
    },
  })

  return result.toDataStreamResponse()
}
```

- [ ] **Step 2: Verifica che la route compili**

```bash
npm run build 2>&1 | grep -E "assistant|error|Error" | head -20
```

Atteso: nessuna riga con `error`. Se TypeScript si lamenta di `orgId` in closure asincrona, spostare `const orgId = await getOrgId()` dentro ogni `execute`.

- [ ] **Step 3: Commit**

```bash
git add app/api/assistant/route.ts
git commit -m "feat: add AI assistant streaming API route with tools"
```

---

## Task 3: Componente AISidebar

**Files:**
- Crea: `components/assistant/AISidebar.tsx`

- [ ] **Step 1: Crea il componente**

```tsx
'use client'

import { useChat } from 'ai/react'
import { usePathname, useRouter } from 'next/navigation'
import { useRef, useEffect } from 'react'
import { X, Send, Bot, User, Loader2 } from 'lucide-react'
import { createCliente } from '@/actions/clienti'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AISidebar({ open, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, addToolResult } = useChat({
    api: '/api/assistant',
    body: {
      pageContext: { pathname },
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleToolConfirm(toolCallId: string, toolName: string, args: Record<string, unknown>) {
    try {
      if (toolName === 'create_cliente') {
        const result = await createCliente(args as Parameters<typeof createCliente>[0])
        addToolResult({ toolCallId, result: { success: true, id: result.id, message: 'Cliente creato con successo' } })
        toast.success('Cliente creato')
        router.refresh()
      } else if (toolName === 'navigate_to') {
        const path = args.path as string
        addToolResult({ toolCallId, result: { success: true, message: `Navigato a ${args.label}` } })
        router.push(path)
        onClose()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto'
      addToolResult({ toolCallId, result: { success: false, error: message } })
      toast.error(message)
    }
  }

  function handleToolDeny(toolCallId: string, toolName: string) {
    addToolResult({ toolCallId, result: { success: false, error: `L'utente ha rifiutato l'esecuzione di ${toolName}` } })
  }

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Pannello */}
      <div
        className={`fixed top-0 right-0 z-40 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-xl transition-transform duration-300 print:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-teal-600" />
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Assistente AI</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messaggi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 dark:text-gray-500 mt-8 space-y-2">
              <Bot className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600" />
              <p>Ciao! Come posso aiutarti?</p>
              <p className="text-xs">Puoi chiedermi di cercare clienti, preventivi o navigare nell'app.</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
              )}

              <div className={`max-w-[85%] space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Testo messaggio */}
                {message.content && (
                  <div
                    className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {message.content}
                  </div>
                )}

                {/* Tool invocations */}
                {message.toolInvocations?.map((invocation) => {
                  if (invocation.state === 'result') {
                    // Tool completato — mostra solo se ha fallito
                    const result = invocation.result as { success?: boolean; error?: string; message?: string } | null
                    if (result && result.success === false) {
                      return (
                        <div key={invocation.toolCallId} className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded px-2 py-1">
                          {result.error}
                        </div>
                      )
                    }
                    return null
                  }

                  // Tool in attesa di conferma (stato 'call')
                  const isWrite = ['create_cliente'].includes(invocation.toolName)
                  const isNavigate = invocation.toolName === 'navigate_to'

                  if (isNavigate) {
                    const args = invocation.args as { path: string; label: string }
                    return (
                      <div key={invocation.toolCallId} className="bg-blue-50 dark:bg-blue-950 rounded-lg px-3 py-2 text-sm space-y-2">
                        <p className="font-medium text-blue-800 dark:text-blue-200">Naviga a: {args.label}</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">{args.path}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToolConfirm(invocation.toolCallId, invocation.toolName, invocation.args as Record<string, unknown>)}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          >
                            Vai
                          </button>
                          <button
                            onClick={() => handleToolDeny(invocation.toolCallId, invocation.toolName)}
                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300"
                          >
                            Annulla
                          </button>
                        </div>
                      </div>
                    )
                  }

                  if (isWrite) {
                    return (
                      <div key={invocation.toolCallId} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm space-y-2">
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          {invocation.toolName === 'create_cliente' ? 'Creare nuovo cliente?' : 'Conferma azione'}
                        </p>
                        <pre className="text-xs text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                          {JSON.stringify(invocation.args, null, 2)}
                        </pre>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToolConfirm(invocation.toolCallId, invocation.toolName, invocation.args as Record<string, unknown>)}
                            className="px-3 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700"
                          >
                            Conferma
                          </button>
                          <button
                            onClick={() => handleToolDeny(invocation.toolCallId, invocation.toolName)}
                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300"
                          >
                            Annulla
                          </button>
                        </div>
                      </div>
                    )
                  }

                  // Tool read in esecuzione
                  return (
                    <div key={invocation.toolCallId} className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>
                        {invocation.toolName === 'list_clienti' && 'Carico clienti…'}
                        {invocation.toolName === 'get_cliente' && 'Cerco cliente…'}
                        {invocation.toolName === 'list_preventivi' && 'Carico preventivi…'}
                        {invocation.toolName === 'get_preventivo' && 'Cerco preventivo…'}
                        {!['list_clienti', 'get_cliente', 'list_preventivi', 'get_preventivo'].includes(invocation.toolName) && `Eseguo ${invocation.toolName}…`}
                      </span>
                    </div>
                  )
                })}
              </div>

              {message.role === 'user' && (
                <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-200 dark:border-gray-800 p-3 flex gap-2 shrink-0"
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Chiedi qualcosa…"
            disabled={isLoading}
            className="flex-1 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verifica tipi**

```bash
npx tsc --noEmit 2>&1 | grep "AISidebar" | head -20
```

Atteso: nessun errore su AISidebar.tsx. Se ci sono errori su `invocation.args`, aggiungere il cast `as Record<string, unknown>` dove necessario.

- [ ] **Step 3: Commit**

```bash
git add components/assistant/AISidebar.tsx
git commit -m "feat: add AI assistant sidebar component"
```

---

## Task 4: Integrazione in LayoutShell

**Files:**
- Modifica: `components/layout/LayoutShell.tsx`

- [ ] **Step 1: Aggiungi import e stato aiOpen**

In cima al file, dopo gli import esistenti, aggiungi:

```tsx
import dynamic from 'next/dynamic'
import { Sparkles } from 'lucide-react'

const AISidebar = dynamic(() => import('@/components/assistant/AISidebar'), { ssr: false })
```

Dentro il componente, dopo `const [mobileOpen, setMobileOpen] = useState(false)`, aggiungi:

```tsx
const [aiOpen, setAiOpen] = useState(false)
```

- [ ] **Step 2: Aggiungi bottone AI nell'header mobile**

Nell'header mobile (il `<header className="lg:hidden ...">`) aggiorna il blocco in modo che tra `<OfflineIndicator />` e la fine dell'header venga aggiunto il bottone:

```tsx
<OfflineIndicator />
<button
  onClick={() => setAiOpen((o) => !o)}
  className="p-1.5 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
  aria-label="Assistente AI"
>
  <Sparkles className="h-5 w-5" />
</button>
```

- [ ] **Step 3: Aggiungi bottone AI nella top bar desktop e render del pannello**

Prima del tag di chiusura `</div>` del wrapper principale (la div `flex min-h-screen`), aggiungi:

```tsx
{/* Bottone AI desktop — visibile solo su lg */}
<button
  onClick={() => setAiOpen((o) => !o)}
  className={`hidden lg:flex fixed bottom-6 right-6 z-30 items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium transition-colors ${
    aiOpen
      ? 'bg-teal-700 text-white'
      : 'bg-teal-600 text-white hover:bg-teal-700'
  }`}
  aria-label="Assistente AI"
>
  <Sparkles className="h-4 w-4" />
  AI
</button>

<AISidebar open={aiOpen} onClose={() => setAiOpen(false)} />
```

- [ ] **Step 4: Verifica che il layout compili**

```bash
npx tsc --noEmit 2>&1 | grep -E "LayoutShell|AISidebar" | head -10
```

Atteso: nessun errore.

- [ ] **Step 5: Build finale**

```bash
npm run build 2>&1 | tail -10
```

Atteso: `✓ Compiled successfully` senza errori.

- [ ] **Step 6: Commit finale**

```bash
git add components/layout/LayoutShell.tsx
git commit -m "feat: integrate AI assistant panel into dashboard layout"
```

---

## Self-Review

### Copertura spec
- [x] Streaming AI con Vercel AI SDK → `streamText` + `toDataStreamResponse()`
- [x] Context pagina corrente → `pageContext.pathname` nel body
- [x] Tool read auto-eseguiti (list_clienti, get_cliente, list_preventivi, get_preventivo)
- [x] Tool write human-in-the-loop (create_cliente, navigate_to)
- [x] Conferma UI per tool write con Conferma/Annulla
- [x] Pannello slide-in destro
- [x] Bottone toggle (mobile header + desktop FAB)
- [x] `addToolResult` per concludere il loop tool
- [x] Server action chiamata dal client dopo conferma

### Placeholder check
- Nessun "TBD" o "TODO" nei task
- Tutti i code block sono completi e funzionali
- I tipi usati nei task sono consistenti con il codebase (`createCliente` → ritorna `{ id: string }`)

### Note post-implementazione
- Aggiungere `ANTHROPIC_API_KEY` in Vercel env vars prima del deploy
- Il tool `create_cliente` importa da `@/actions/clienti` — verificare che il type `ClienteInput` includa `tipo` come campo richiesto (da `lib/validations/clienteSchema.ts`)
- Per aggiungere altri tool write in futuro (es. `create_preventivo`, `update_stato_preventivo`), seguire il pattern: nessun `execute` nella route, gestione nel `handleToolConfirm` di AISidebar
