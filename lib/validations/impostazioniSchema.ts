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
})

export type SettingsInput = z.infer<typeof settingsSchema>
