import { z } from 'zod'

export const clienteSchema = z
  .object({
    nome: z.string().max(100).optional().nullable(),
    cognome: z.string().max(100).optional().nullable(),
    telefono: z.string().max(30).optional().nullable(),
    email: z
      .string()
      .email('Email non valida')
      .optional()
      .nullable()
      .or(z.literal('')),
    indirizzo: z.string().max(200).optional().nullable(),
    cantiere: z.string().max(200).optional().nullable(),
    cf_piva: z.string().max(20).optional().nullable(),
    note: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      (data.nome && data.nome.trim().length > 0) ||
      (data.cognome && data.cognome.trim().length > 0),
    {
      message: 'Inserisci almeno nome o cognome',
      path: ['nome'],
    }
  )

export type ClienteInput = z.infer<typeof clienteSchema>
