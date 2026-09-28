/**
 * Forma dei documenti di Fatture in Cloud (API v2) nella parte che usiamo.
 * Tutto opzionale tranne id, date, updated_at: FiC omette o manda null i campi
 * vuoti, e l'elenco "detailed" potrebbe non includere payments_list.
 */
export type TipoSpesaFic = 'expense' | 'passive_credit_note'

export type RataFic = {
  id?: number | null
  amount?: number | null
  due_date?: string | null
  paid_date?: string | null
  status?: string | null
  payment_account?: { id?: number | null; name?: string | null } | null
}

export type EntitaFic = {
  id?: number | null
  name?: string | null
  vat_number?: string | null
} | null

export type DocumentoFic = {
  id: number
  date: string
  updated_at: string
  type?: string | null
  entity?: EntitaFic
  category?: string | null
  description?: string | null
  invoice_number?: string | null
  e_invoice?: boolean | null
  amount_net?: number | null
  amount_vat?: number | null
  amount_withholding_tax?: number | null
  amount_other_withholding_tax?: number | null
  amount_gross?: number | null
  next_due_date?: string | null
  payments_list?: RataFic[] | null
  attachment_url?: string | null
  attachment_preview_url?: string | null
  [altro: string]: unknown
}
