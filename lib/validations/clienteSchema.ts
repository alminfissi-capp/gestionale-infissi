import { z } from 'zod'

export const clienteSchema = z.object({
  tipo: z.enum(['privato', 'azienda']),
  ragione_sociale: z.string().max(200).optional().nullable(),
  nome: z.string().max(100).optional().nullable(),
  cognome: z.string().max(100).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  email: z
    .string()
    .email('Email non valida')
    .optional()
    .nullable()
    .or(z.literal('')),
  via: z.string().max(200).optional().nullable(),
  civico: z.string().max(20).optional().nullable(),
  cap: z.string().max(10).optional().nullable(),
  citta: z.string().max(100).optional().nullable(),
  provincia: z.string().max(50).optional().nullable(),
  nazione: z.string().max(100).optional().nullable(),
  codice_sdi: z.string().max(10).optional().nullable(),
  cantiere: z.string().max(200).optional().nullable(),
  cf_piva: z.string().max(20).optional().nullable(),
  note: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.tipo === 'azienda') {
    if (!data.ragione_sociale?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Inserisci la ragione sociale',
        path: ['ragione_sociale'],
      })
    }
  } else {
    if (!data.nome?.trim() && !data.cognome?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Inserisci almeno nome o cognome',
        path: ['nome'],
      })
    }
  }
})

export type ClienteInput = z.infer<typeof clienteSchema>
