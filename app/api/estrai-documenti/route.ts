import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { assertAccessoDipendenti } from '@/lib/permessi-dipendenti'

export const maxDuration = 60

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.WINSTUDIO,
})

const MODEL = 'google/gemini-2.5-flash-preview-05-20'
const MENSILITA = ['mensile', 'tredicesima', 'quattordicesima', 'altro'] as const

const busteSchema = z.object({
  buste: z.array(
    z.object({
      nome: z.string(),
      cognome: z.string(),
      codice_fiscale: z.string().nullable(),
      periodo: z.string().describe('Mese di competenza in formato YYYY-MM'),
      mensilita: z.enum(MENSILITA),
      netto: z.number().describe('Netto a pagare in euro, formato numerico 1234.56'),
      lordo: z.number().nullable(),
      pagina: z.number().int().describe('Pagina del PDF in cui inizia la busta (da 1)'),
    }),
  ),
})

const bonificoSchema = z.object({
  beneficiario: z.string().nullable(),
  iban_beneficiario: z.string().nullable(),
  data_pagamento: z.string().nullable().describe('Data esecuzione, YYYY-MM-DD'),
  importo: z.number().nullable(),
  causale: z.string().nullable(),
  periodo_competenza: z.string().nullable().describe('Mese coperto dal pagamento dedotto dalla causale, YYYY-MM'),
  mensilita: z.enum(MENSILITA),
})

export async function POST(req: Request) {
  try {
    await assertAccessoDipendenti()
  } catch {
    return Response.json({ error: 'Accesso non consentito' }, { status: 401 })
  }

  let tipo: 'busta' | 'bonifico'
  let pagine: string[]
  try {
    const body = (await req.json()) as { tipo?: unknown; pagine?: unknown }
    if (body.tipo !== 'busta' && body.tipo !== 'bonifico') throw new Error('tipo non valido')
    if (!Array.isArray(body.pagine) || !body.pagine.every((p) => typeof p === 'string')) {
      throw new Error('pagine non valide')
    }
    tipo = body.tipo
    pagine = body.pagine
  } catch {
    return Response.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  if (pagine.length === 0 || pagine.every((p) => !p)) {
    return Response.json({ error: 'Il PDF non contiene testo leggibile' }, { status: 400 })
  }

  const testo = pagine.map((p, i) => `--- PAGINA ${i + 1} ---\n${p}`).join('\n\n')

  try {
    if (tipo === 'busta') {
      const { object } = await generateObject({
        model: openrouter(MODEL),
        schema: busteSchema,
        mode: 'json',
        prompt: `Questo è il testo estratto da un PDF di buste paga italiane. Il file può contenere UNA sola busta o PIÙ buste di dipendenti diversi (una o più pagine ciascuna). Per OGNI busta paga individua: nome e cognome del dipendente, codice fiscale, mese di competenza (periodo), mensilità (tredicesima o quattordicesima solo se indicato esplicitamente, altrimenti mensile), NETTO A PAGARE in euro (il netto finale che il dipendente riceve, non il lordo né l'imponibile), lordo se presente, pagina di inizio.\n\n${testo}`,
      })
      return Response.json(object)
    }
    const { object } = await generateObject({
      model: openrouter(MODEL),
      schema: bonificoSchema,
      mode: 'json',
      prompt: `Questo è il testo estratto dalla contabile PDF di un bonifico bancario italiano (pagamento di uno stipendio). Estrai: nome del beneficiario, IBAN del beneficiario, data di esecuzione, importo in euro, causale. Dalla causale deduci il mese di competenza dello stipendio (periodo_competenza in formato YYYY-MM, es. "stipendio giugno 2026" → 2026-06) e la mensilità (tredicesima o quattordicesima se citate, altrimenti mensile). Usa null per i campi non deducibili.\n\n${testo}`,
    })
    return Response.json(object)
  } catch {
    return Response.json({ error: 'Estrazione non riuscita, inserisci i dati manualmente' }, { status: 502 })
  }
}
