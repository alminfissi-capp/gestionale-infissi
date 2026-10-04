import type {
  FatturaFornitore,
  RataFatturaFornitore,
  TipoFatturaFornitore,
} from '@/types/fatture-fornitori'
import type { DocumentoFic, TipoEmessoFic, TipoSpesaFic } from '@/lib/fic/tipi'
import type { FatturaEmessa, TipoFatturaEmessa } from '@/types/fatture-emesse'

export type RigaFattura = Omit<FatturaFornitore, 'id' | 'rate'> & {
  fic_updated_at: string
  fic_dati: Record<string, unknown>
}
export type RigaRata = Omit<RataFatturaFornitore, 'id' | 'fattura_id'>
export type DocumentoMappato = { fattura: RigaFattura; rate: RigaRata[] }

export const TIPO_DA_FIC: Record<TipoSpesaFic, TipoFatturaFornitore> = {
  expense: 'fattura',
  passive_credit_note: 'nota_credito',
}

const cent = (v: number | null | undefined): number => Math.round((v ?? 0) * 100) / 100
const testo = (v: string | null | undefined): string | null => {
  const t = v?.trim()
  return t ? t : null
}

/**
 * Documento FiC → righe di fatture_fornitori e fatture_fornitori_rate.
 * Unico punto in cui si decide il segno: le note di credito sono sempre
 * negative (riducono il costo), le rate restano positive.
 */
export function mappaDocumento(doc: DocumentoFic, tipoFic: TipoSpesaFic, ora: string): DocumentoMappato {
  const tipo = TIPO_DA_FIC[tipoFic]
  const segno = (v: number | null | undefined) => (tipo === 'nota_credito' ? -Math.abs(cent(v)) : cent(v))

  // Gli URL degli allegati sono temporanei: conservarli non serve, il PDF si chiede al clic.
  const { attachment_url, attachment_preview_url, ...resto } = doc
  void attachment_preview_url

  const fattura: RigaFattura = {
    fic_id: doc.id,
    tipo,
    numero: testo(doc.invoice_number),
    data: doc.date,
    descrizione: testo(doc.description),
    categoria: testo(doc.category),
    elettronica: doc.e_invoice === true,
    fornitore_fic_id: doc.entity?.id ?? null,
    fornitore_nome: testo(doc.entity?.name) ?? '(senza fornitore)',
    fornitore_piva: testo(doc.entity?.vat_number),
    importo_netto: segno(doc.amount_net),
    importo_iva: segno(doc.amount_vat),
    ritenuta: cent(doc.amount_withholding_tax),
    altra_ritenuta: cent(doc.amount_other_withholding_tax),
    importo_lordo: segno(doc.amount_gross),
    prossima_scadenza: doc.next_due_date ?? null,
    ha_allegato: Boolean(attachment_url),
    fic_updated_at: doc.updated_at,
    fic_dati: resto,
    sincronizzata_at: ora,
  }

  const rate: RigaRata[] = (doc.payments_list ?? []).map((p, ordine) => ({
    fic_id: p.id ?? null,
    importo: Math.abs(cent(p.amount)),
    scadenza: p.due_date ?? null,
    stato: p.status === 'paid' ? 'pagata' : 'da_pagare',
    pagata_il: p.paid_date ?? null,
    conto_fic_id: p.payment_account?.id ?? null,
    conto_nome: testo(p.payment_account?.name),
    ordine,
  }))

  return { fattura, rate }
}

export type RigaFatturaEmessa = Omit<FatturaEmessa, 'id' | 'rate'> & {
  fic_updated_at: string
  fic_dati: Record<string, unknown>
}
export type EmessoMappato = { fattura: RigaFatturaEmessa; rate: RigaRata[] }

export const TIPO_EMESSO_DA_FIC: Record<TipoEmessoFic, TipoFatturaEmessa> = {
  invoice: 'fattura',
  credit_note: 'nota_credito',
}

function numeroEmesso(doc: DocumentoFic): string | null {
  if (doc.number === null || doc.number === undefined) return null
  const suffisso = testo(doc.numeration)
  if (!suffisso) return String(doc.number)
  return `${doc.number}${suffisso.startsWith('/') ? '' : '/'}${suffisso}`
}

/**
 * Documento emesso FiC → righe di fatture_emesse e fatture_emesse_rate.
 * Stesse regole dei fornitori: note di credito negative, rate positive.
 * `amount_gross` di FiC e' gia' al netto della ritenuta: e' cio' che il cliente paga.
 */
export function mappaEmesso(doc: DocumentoFic, tipoFic: TipoEmessoFic, ora: string): EmessoMappato {
  const tipo = TIPO_EMESSO_DA_FIC[tipoFic]
  const segno = (v: number | null | undefined) => (tipo === 'nota_credito' ? -Math.abs(cent(v)) : cent(v))

  // Link temporanei e token permanente del documento: non servono e non vanno conservati.
  const { url, attachment_url, attachment_preview_url, permanent_token, ...resto } = doc
  void url; void attachment_url; void attachment_preview_url; void permanent_token

  const rate: RigaRata[] = (doc.payments_list ?? []).map((p, ordine) => ({
    fic_id: p.id ?? null,
    importo: Math.abs(cent(p.amount)),
    scadenza: p.due_date ?? null,
    stato: p.status === 'paid' ? 'pagata' : 'da_pagare',
    pagata_il: p.paid_date ?? null,
    conto_fic_id: p.payment_account?.id ?? null,
    conto_nome: testo(p.payment_account?.name),
    ordine,
  }))
  const scadenzeAperte = rate
    .filter((r) => r.stato !== 'pagata' && r.scadenza)
    .map((r) => r.scadenza as string)
    .sort()

  const fattura: RigaFatturaEmessa = {
    fic_id: doc.id,
    tipo,
    numero: numeroEmesso(doc),
    data: doc.date,
    cliente_fic_id: doc.entity?.id ?? null,
    cliente_nome: testo(doc.entity?.name) ?? '(senza cliente)',
    cliente_piva: testo(doc.entity?.vat_number) ?? testo(doc.entity?.tax_code),
    importo_netto: segno(doc.amount_net),
    importo_iva: segno(doc.amount_vat),
    ritenuta: cent(doc.amount_withholding_tax),
    importo_lordo: segno(doc.amount_gross),
    prossima_scadenza: scadenzeAperte[0] ?? null,
    elettronica: doc.e_invoice === true,
    fic_updated_at: doc.updated_at,
    fic_dati: resto,
    sincronizzata_at: ora,
  }

  return { fattura, rate }
}
