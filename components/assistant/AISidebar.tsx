'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useChat } from 'ai/react'
import type { ToolInvocation } from 'ai'
import { Bot, X, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { createCliente } from '@/actions/clienti'

interface Props {
  open: boolean
  onClose: () => void
}

// Tool names that are "read" operations — show spinner while loading
const READ_TOOLS = ['get_clienti', 'get_preventivi', 'get_commesse', 'get_magazzino', 'cerca_cliente', 'cerca_preventivo']

function readToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    get_clienti: 'Carico clienti…',
    get_preventivi: 'Carico preventivi…',
    get_commesse: 'Carico commesse…',
    get_magazzino: 'Carico magazzino…',
    cerca_cliente: 'Cerco cliente…',
    cerca_preventivo: 'Cerco preventivo…',
  }
  return labels[toolName] ?? `Eseguo ${toolName}…`
}

interface NavigateArgs {
  path: string
  [key: string]: unknown
}

interface CreateClienteArgs {
  tipo: 'privato' | 'azienda'
  nome?: string
  cognome?: string
  ragione_sociale?: string
  email?: string
  telefono?: string
  indirizzo?: string
  citta?: string
  cap?: string
  [key: string]: unknown
}

export default function AISidebar({ open, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, addToolResult } = useChat({
    api: '/api/assistant',
    body: { pageContext: { pathname } },
  })

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleNavigateConfirm(toolCallId: string, path: string) {
    addToolResult({ toolCallId, result: { success: true, path } })
    router.push(path)
    onClose()
  }

  function handleDeny(toolCallId: string) {
    addToolResult({
      toolCallId,
      result: { success: false, error: "L'utente ha rifiutato l'operazione" },
    })
  }

  async function handleCreateClienteConfirm(toolCallId: string, args: CreateClienteArgs) {
    try {
      const result = await createCliente({
        tipo: args.tipo,
        nome: args.nome,
        cognome: args.cognome,
        ragione_sociale: args.ragione_sociale,
        email: args.email,
        telefono: args.telefono,
        citta: args.citta,
        cap: args.cap,
      })
      addToolResult({ toolCallId, result: { success: true, id: result.id } })
      toast.success('Cliente creato')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto'
      addToolResult({ toolCallId, result: { success: false, error: message } })
      toast.error(`Errore: ${message}`)
    }
  }

  function renderToolInvocation(inv: ToolInvocation, msgId: string) {
    const key = `${msgId}-${inv.toolCallId}`

    if (inv.state === 'result') {
      const res = inv.result as { success?: boolean; error?: string } | undefined
      if (res && res.success === false) {
        return (
          <div key={key} className="mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            Errore: {res.error ?? 'Operazione fallita'}
          </div>
        )
      }
      return null
    }

    if (inv.state === 'call') {
      // Read tool — spinner
      if (READ_TOOLS.includes(inv.toolName)) {
        return (
          <div key={key} className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>{readToolLabel(inv.toolName)}</span>
          </div>
        )
      }

      // navigate_to confirmation card
      if (inv.toolName === 'navigate_to') {
        const args = inv.args as NavigateArgs
        return (
          <div key={key} className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <p className="font-medium text-blue-800 mb-1">Navigare verso:</p>
            <p className="text-blue-700 font-mono text-xs mb-3">{args.path}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleNavigateConfirm(inv.toolCallId, args.path)}
                className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
              >
                Vai
              </button>
              <button
                onClick={() => handleDeny(inv.toolCallId)}
                className="flex-1 rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-100 transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        )
      }

      // create_cliente confirmation card
      if (inv.toolName === 'create_cliente') {
        const args = inv.args as CreateClienteArgs
        return (
          <div key={key} className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <p className="font-medium text-amber-800 mb-1">Creare nuovo cliente?</p>
            <pre className="text-xs text-amber-700 bg-amber-100 rounded p-2 mb-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(args, null, 2)}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => handleCreateClienteConfirm(inv.toolCallId, args)}
                className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 active:bg-amber-700 transition-colors"
              >
                Conferma
              </button>
              <button
                onClick={() => handleDeny(inv.toolCallId)}
                className="flex-1 rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 active:bg-amber-100 transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        )
      }

      // Generic call — show spinner
      return (
        <div key={key} className="mt-2 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Eseguo {inv.toolName}…</span>
        </div>
      )
    }

    return null
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden print:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sliding panel */}
      <aside
        className={`print:hidden fixed top-0 right-0 z-40 h-full w-80 bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-800 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Assistente AI"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <Bot className="h-5 w-5 text-teal-600 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Assistente AI
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            aria-label="Chiudi assistente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <Bot className="h-10 w-10 text-teal-500 opacity-60" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Come posso aiutarti?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Puoi chiedermi di cercare clienti, preventivi, navigare tra le sezioni o creare nuovi record.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[85%]">
                {/* Message bubble */}
                {(message.content as string) && (
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-teal-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm'
                    }`}
                  >
                    {message.content as string}
                  </div>
                )}

                {/* Tool invocations */}
                {message.toolInvocations?.map((inv) =>
                  renderToolInvocation(inv, message.id)
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-3 py-3 flex gap-2 items-end"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!isLoading && input.trim()) {
                  handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)
                }
              }
            }}
            placeholder="Scrivi un messaggio…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="shrink-0 flex items-center justify-center rounded-xl bg-teal-600 p-2.5 text-white hover:bg-teal-700 active:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Invia messaggio"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </aside>
    </>
  )
}
