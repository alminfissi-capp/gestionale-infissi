import { createOpenAI } from '@ai-sdk/openai'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

export const maxDuration = 30

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.WINSTUDIO,
})

interface PageContext {
  pathname?: string
}

export async function POST(req: Request) {
  try {
    const { messages, pageContext } = (await req.json()) as {
      messages: { role: string; content: string }[]
      pageContext?: PageContext
    }

    const supabase = await createClient()
    const orgId = await getOrgId()
    const pathname = pageContext?.pathname ?? '/'

    const result = streamText({
      model: openrouter('openai/gpt-4o-mini'),
      maxSteps: 10,
      system: `Sei l'assistente AI di Win Studio, il gestionale infissi di A.L.M. Infissi. Rispondi SEMPRE in italiano. Sii conciso e diretto.

REGOLE FONDAMENTALI:
- Per qualsiasi domanda su clienti o preventivi: chiama SEMPRE lo strumento appropriato. Non rispondere mai da memoria o inventare dati.
- Dopo aver ricevuto i risultati dallo strumento, usa quei dati per rispondere.
- Se cerchi un cliente per nome/cognome, usa list_clienti con il parametro search.
- Se cerchi preventivi di un cliente specifico, usa list_preventivi con il parametro cliente_search.
- Aumenta il limit se l'utente chiede conteggi o vuole vedere tutti i risultati.

PAGINE DISPONIBILI (usa navigate_to per andarci):
/clienti, /preventivi, /commesse, /listini, /magazzino, /impostazioni

Pagina corrente: ${pathname}`,
      messages: messages as Parameters<typeof streamText>[0]['messages'],
      tools: {
        list_clienti: tool({
          description: 'Elenca i clienti. Usa search per filtrare per nome o cognome (ricerca parziale). Aumenta limit se servono più risultati.',
          parameters: z.object({
            search: z.string().optional().describe('Testo da cercare in nome, cognome o ragione sociale'),
            limit: z.number().int().min(1).max(200).optional().default(50).describe('Numero massimo di risultati (default 50)'),
          }),
          execute: async ({ search, limit }) => {
            let query = supabase
              .from('clienti')
              .select('id, nome, cognome, ragione_sociale, tipo, email, telefono')
              .eq('organization_id', orgId)
              .order('cognome', { ascending: true })
              .limit(limit ?? 50)
            if (search) {
              query = query.or(
                `cognome.ilike.%${search}%,nome.ilike.%${search}%,ragione_sociale.ilike.%${search}%`
              )
            }
            const { data, error } = await query
            if (error) return { error: error.message }
            return { clienti: data ?? [], totale: data?.length ?? 0 }
          },
        }),

        get_cliente: tool({
          description: 'Recupera tutti i dettagli di un cliente tramite il suo id.',
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
          description: 'Elenca i preventivi. Filtra per stato e/o per nome cliente. Aumenta limit per conteggi completi.',
          parameters: z.object({
            stato: z
              .enum(['bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto'])
              .optional()
              .describe('Filtra per stato preventivo'),
            cliente_search: z.string().optional().describe('Cerca per nome o cognome del cliente'),
            limit: z.number().int().min(1).max(200).optional().default(50).describe('Numero massimo di risultati (default 50)'),
          }),
          execute: async ({ stato, cliente_search, limit }) => {
            let query = supabase
              .from('preventivi')
              .select('id, numero, data, stato, totale_finale, clienti(id, nome, cognome, ragione_sociale)')
              .eq('organization_id', orgId)
              .order('created_at', { ascending: false })
              .limit(limit ?? 50)
            if (stato) query = query.eq('stato', stato)
            if (cliente_search) {
              query = query.or(
                `clienti.cognome.ilike.%${cliente_search}%,clienti.nome.ilike.%${cliente_search}%,clienti.ragione_sociale.ilike.%${cliente_search}%`
              )
            }
            const { data, error } = await query
            if (error) return { error: error.message }
            return { preventivi: data ?? [], totale: data?.length ?? 0 }
          },
        }),

        get_preventivo: tool({
          description: 'Recupera tutti i dettagli di un preventivo tramite il suo id, inclusi articoli e dati cliente.',
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

        // Write tools — no execute (human-in-the-loop)
        create_cliente: tool({
          description: "Crea un nuovo cliente. Richiede conferma dell'utente prima dell'esecuzione.",
          parameters: z.object({
            tipo: z.enum(['privato', 'azienda']).describe('Tipo di cliente'),
            nome: z.string().optional().describe('Nome (per privati)'),
            cognome: z.string().optional().describe('Cognome (per privati)'),
            ragione_sociale: z.string().optional().describe('Ragione sociale (per aziende)'),
            email: z.string().email().optional().describe('Indirizzo email'),
            telefono: z.string().optional().describe('Numero di telefono'),
            indirizzo: z.string().optional().describe('Indirizzo'),
            citta: z.string().optional().describe('Città'),
            cap: z.string().optional().describe('CAP'),
          }),
        }),

        navigate_to: tool({
          description: "Naviga verso una pagina dell'applicazione. Richiede conferma dell'utente.",
          parameters: z.object({
            page: z.string().describe('Percorso della pagina (es. /clienti, /preventivi)'),
            label: z.string().optional().describe('Nome leggibile della destinazione'),
          }),
        }),
      },
    })

    return result.toDataStreamResponse({
      getErrorMessage: (error) => error instanceof Error ? error.message : String(error),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore interno'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}