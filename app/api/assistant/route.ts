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
      model: openrouter('anthropic/claude-3-5-haiku-20241022'),
      maxSteps: 10,
      system: `Sei l'assistente AI di Win Studio, il gestionale infissi di A.L.M. Infissi. Rispondi SEMPRE in italiano. Sii conciso e diretto.

REGOLE FONDAMENTALI:
- Per qualsiasi domanda su dati del gestionale: chiama SEMPRE lo strumento appropriato. Non rispondere mai da memoria o inventare dati.
- Dopo aver ricevuto i risultati dallo strumento, usa quei dati per rispondere con precisione.
- Se cerchi preventivi di un cliente specifico: prima usa list_clienti per trovare l'ID del cliente, poi usa list_preventivi con cliente_id.
- Per conteggi completi aumenta sempre il limit a 200.
- Quando hai bisogno di dati da più moduli, fai più chiamate in sequenza.

MODULI DISPONIBILI:
- Clienti: list_clienti, get_cliente
- Preventivi: list_preventivi, get_preventivo
- Commesse: list_commesse, get_commessa
- Magazzino: get_giacenze_magazzino
- Riepilogo generale: get_statistiche

PAGINE DISPONIBILI (usa navigate_to per andarci):
/clienti, /preventivi, /commesse, /listini, /magazzino, /magazzino/giacenze, /magazzino/movimenti, /impostazioni

Pagina corrente: ${pathname}`,
      messages: messages as Parameters<typeof streamText>[0]['messages'],
      tools: {

        // ── CLIENTI ──────────────────────────────────────────────────────
        list_clienti: tool({
          description: 'Elenca i clienti. Usa search per filtrare per nome, cognome o ragione sociale (ricerca parziale).',
          parameters: z.object({
            search: z.string().optional().describe('Testo da cercare in nome, cognome o ragione sociale'),
            limit: z.number().int().min(1).max(200).optional().default(50),
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

        // ── PREVENTIVI ───────────────────────────────────────────────────
        list_preventivi: tool({
          description: 'Elenca i preventivi. Filtra per stato e/o per cliente_id. Per trovare preventivi di un cliente, prima usa list_clienti per ottenere il suo ID.',
          parameters: z.object({
            stato: z
              .enum(['bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto'])
              .optional()
              .describe('Filtra per stato preventivo'),
            cliente_id: z.string().optional().describe('ID del cliente (ottenuto da list_clienti)'),
            limit: z.number().int().min(1).max(200).optional().default(50),
          }),
          execute: async ({ stato, cliente_id, limit }) => {
            let query = supabase
              .from('preventivi')
              .select('id, numero, data, stato, totale_finale, clienti(id, nome, cognome, ragione_sociale)')
              .eq('organization_id', orgId)
              .order('created_at', { ascending: false })
              .limit(limit ?? 50)
            if (stato) query = query.eq('stato', stato)
            if (cliente_id) query = query.eq('cliente_id', cliente_id)
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

        // ── COMMESSE ─────────────────────────────────────────────────────
        list_commesse: tool({
          description: 'Elenca le commesse. Filtra per stato e/o per nome cliente. Mostra numero commessa, cliente, totale, saldo da incassare e stato.',
          parameters: z.object({
            stato: z
              .enum(['in_attesa', 'da_iniziare', 'in_lavorazione', 'da_consegnare', 'consegnato', 'parzialmente_consegnato', 'concluso', 'bloccato', 'annullato'])
              .optional()
              .describe('Filtra per stato commessa'),
            cliente_search: z.string().optional().describe('Cerca per nome cliente (ricerca parziale)'),
            limit: z.number().int().min(1).max(200).optional().default(50),
          }),
          execute: async ({ stato, cliente_search, limit }) => {
            let query = supabase
              .from('commesse')
              .select('id, numero_commessa, cliente_nome, stato, totale, imponibile, iva_totale, data_conferma, operatore_nome, note, reparti')
              .eq('organization_id', orgId)
              .order('ordine', { ascending: true })
              .limit(limit ?? 50)
            if (stato) query = query.eq('stato', stato)
            if (cliente_search) query = query.ilike('cliente_nome', `%${cliente_search}%`)
            const { data: commesse, error } = await query
            if (error) return { error: error.message }
            if (!commesse?.length) return { commesse: [], totale: 0 }

            const ids = commesse.map((c) => c.id)
            const { data: acconti } = await supabase
              .from('acconti_commessa')
              .select('commessa_id, importo')
              .in('commessa_id', ids)

            const result = commesse.map((c) => {
              const acc = (acconti ?? []).filter((a) => a.commessa_id === c.id)
              const totaleAcc = acc.reduce((s, a) => s + Number(a.importo), 0)
              return {
                ...c,
                totale: Number(c.totale),
                imponibile: Number(c.imponibile),
                iva_totale: Number(c.iva_totale),
                totale_acconti: totaleAcc,
                saldo: Number(c.totale) - totaleAcc,
              }
            })
            return { commesse: result, totale: result.length }
          },
        }),

        get_commessa: tool({
          description: 'Recupera tutti i dettagli di una commessa tramite il suo id, inclusi acconti ricevuti e saldo.',
          parameters: z.object({
            id: z.string().describe('ID della commessa'),
          }),
          execute: async ({ id }) => {
            const [{ data: c, error }, { data: acconti }] = await Promise.all([
              supabase.from('commesse').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle(),
              supabase.from('acconti_commessa').select('*').eq('commessa_id', id).order('data_pagamento', { ascending: true }),
            ])
            if (error || !c) return { error: 'Commessa non trovata' }
            const totaleAcc = (acconti ?? []).reduce((s, a) => s + Number(a.importo), 0)
            return {
              commessa: {
                ...c,
                totale: Number(c.totale),
                imponibile: Number(c.imponibile),
                iva_totale: Number(c.iva_totale),
                acconti: (acconti ?? []).map((a) => ({ ...a, importo: Number(a.importo) })),
                totale_acconti: totaleAcc,
                saldo: Number(c.totale) - totaleAcc,
              },
            }
          },
        }),

        // ── MAGAZZINO ────────────────────────────────────────────────────
        get_giacenze_magazzino: tool({
          description: 'Mostra le giacenze attuali del magazzino. Filtra per nome prodotto o mostra solo i prodotti sotto la soglia minima.',
          parameters: z.object({
            search: z.string().optional().describe('Filtra per nome prodotto'),
            solo_sotto_soglia: z.boolean().optional().describe('Se true, mostra solo i prodotti con giacenza sotto la soglia minima'),
          }),
          execute: async ({ search, solo_sotto_soglia }) => {
            let query = supabase
              .from('giacenze')
              .select('prodotto_id, codice, prodotto_nome, unita_misura, variante_nome, giacenza_attuale')
              .order('prodotto_nome', { ascending: true })
              .limit(100)
            if (search) query = query.ilike('prodotto_nome', `%${search}%`)
            const { data, error } = await query
            if (error) return { error: error.message }

            let giacenze = data ?? []

            if (solo_sotto_soglia && giacenze.length > 0) {
              const ids = [...new Set(giacenze.map((r) => r.prodotto_id as string))]
              const { data: soglie } = await supabase
                .from('anagrafica_prodotti')
                .select('id, soglia_minima, soglia_abilitata')
                .in('id', ids)
              const soglieMap = Object.fromEntries((soglie ?? []).map((s) => [s.id, s]))
              giacenze = giacenze.filter((g) => {
                const s = soglieMap[g.prodotto_id as string]
                return s?.soglia_abilitata && s?.soglia_minima != null && g.giacenza_attuale < s.soglia_minima
              })
            }

            return { giacenze, totale_prodotti: giacenze.length }
          },
        }),

        // ── STATISTICHE ──────────────────────────────────────────────────
        get_statistiche: tool({
          description: 'Restituisce un riepilogo generale del gestionale: conteggi clienti, preventivi per stato, commesse per stato, fatturato totale e saldo da incassare.',
          parameters: z.object({}),
          execute: async () => {
            const [
              { count: nClienti },
              { data: preventivi },
              { data: commesse },
              { data: acconti },
            ] = await Promise.all([
              supabase.from('clienti').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
              supabase.from('preventivi').select('stato, totale_finale').eq('organization_id', orgId),
              supabase.from('commesse').select('id, stato, totale').eq('organization_id', orgId),
              supabase.from('acconti_commessa').select('commessa_id, importo').eq('organization_id', orgId),
            ])

            // Preventivi per stato
            const prevPerStato: Record<string, number> = {}
            let totalePreventivi = 0
            for (const p of preventivi ?? []) {
              prevPerStato[p.stato] = (prevPerStato[p.stato] ?? 0) + 1
              totalePreventivi += Number(p.totale_finale ?? 0)
            }

            // Commesse per stato + fatturato
            const commPerStato: Record<string, number> = {}
            let fatturatoTotale = 0
            const totalePerCommessa: Record<string, number> = {}
            for (const c of commesse ?? []) {
              commPerStato[c.stato] = (commPerStato[c.stato] ?? 0) + 1
              fatturatoTotale += Number(c.totale ?? 0)
              totalePerCommessa[c.id ?? ''] = Number(c.totale ?? 0)
            }

            // Saldo da incassare
            const accontiPerCommessa: Record<string, number> = {}
            for (const a of acconti ?? []) {
              accontiPerCommessa[a.commessa_id] = (accontiPerCommessa[a.commessa_id] ?? 0) + Number(a.importo)
            }
            let saldoTotale = 0
            for (const [id, tot] of Object.entries(totalePerCommessa)) {
              saldoTotale += tot - (accontiPerCommessa[id] ?? 0)
            }

            return {
              clienti: { totale: nClienti ?? 0 },
              preventivi: { per_stato: prevPerStato, valore_totale: totalePreventivi },
              commesse: { per_stato: commPerStato, fatturato_totale: fatturatoTotale, saldo_da_incassare: saldoTotale },
            }
          },
        }),

        // ── AZIONI ───────────────────────────────────────────────────────
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
      getErrorMessage: (error) => {
        console.error('[AI assistant] stream error:', error)
        return error instanceof Error ? error.message : String(error)
      },
    })
  } catch (err) {
    console.error('[AI assistant] catch error:', err)
    const message = err instanceof Error ? err.message : 'Errore interno'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}