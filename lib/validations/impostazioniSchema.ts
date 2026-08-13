import { z } from 'zod'

export const settingsSchema = z.object({
  denominazione: z.string().max(100).optional().nullable(),
  indirizzo: z.string().max(200).optional().nullable(),
  piva: z.string().max(20).optional().nullable(),
  codice_fiscale: z.string().max(20).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  email: z
    .string()
    .email('Email non valida')
    .optional()
    .nullable()
    .or(z.literal('')),
  sito_web: z.string().max(100).optional().nullable(),
  banca: z.string().max(120).optional().nullable(),
  iban: z.string().max(40).optional().nullable(),
})

export type SettingsInput = z.infer<typeof settingsSchema>
