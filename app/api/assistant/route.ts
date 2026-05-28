import { createOpenAI } from '@ai-sdk/openai'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

export const maxDuration = 30

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
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

    const result = streamText({
      model: openrouter('minimax/minimax-m2.5:free'),
      maxSteps: 5,
      system: `Sei l'assistente AI di Win Studio, il gestionale infissi di A.L.M. Infissi.
Rispondi sempre in italiano. Sii conciso e diretto.
Pagina corrente: ${pageContext?.pathname ?? '/'}.
Puoi usare strumenti per leggere dati dal database (clienti, preventivi) e per navigare nell'app.`,
      messages: messages as Parameters<typeof streamText>[0]['messages'],
      tools: {
        list_clienti: tool({
          description: "Elenca i clienti dell'organizzazione corrente.",
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
          description: 'Recupera i dettagli di un cliente tramite il suo id.',
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
          description: "Elenca i preventivi dell'organizzazione con dati cliente. Filtro opzionale per stato.",
          parameters: z.object({
            stato: z
              .enum(['bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto'])
              .optional()
              .describe('Filtra per stato preventivo'),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .default(20)
              .describe('Numero massimo di risultati (default 20)'),
          }),
          execute: async ({ stato, limit }) => {
            let query = supabase
              .from('preventivi')
              .select('id, numero, data, stato, totale_finale, clienti(nome, cognome, ragione_sociale)')
              .eq('organization_id', orgId)
              .order('created_at', { ascending: false })
              .limit(limit ?? 20)
            if (stato) query = query.eq('stato', stato)
            const { data, error } = await query
            if (error) return { error: error.message }
            return { preventivi: data ?? [] }
          },
        }),

        get_preventivo: tool({
          description: 'Recupera i dettagli di un preventivo tramite il suo id, con dati cliente.',
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
            path: z.string().describe('Percorso della pagina (es. /clienti, /preventivi)'),
            label: z.string().describe('Nome leggibile della destinazione'),
          }),
        }),
      },
    })

    return result.toDataStreamResponse()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore interno'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
