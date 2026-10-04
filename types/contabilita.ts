// Contabilita' di commessa: costi reali dalle fatture d'acquisto FiC e a mano,
// manodopera, costi fissi e stima. Spec: docs/superpowers/specs/2026-10-04-contabilita-commessa-design.md

/** Le categorie del foglio Excel usato finora, nello stesso ordine. */
export const CATEGORIE_COSTO = [
  { value: 'barre', label: 'Barre o similari' },
  { value: 'accessori', label: 'Accessori' },
  { value: 'accessori_secondari', label: 'Accessori secondari' },
  { value: 'riempimenti', label: 'Riempimenti vari' },
  { value: 'spese_accessorie', label: 'Spese accessorie' },
  { value: 'trasporti', label: 'Carburanti e trasporti' },
  { value: 'noleggi', label: 'Noleggi attrezzature' },
  { value: 'altro', label: 'Altro/Imprevisti' },
] as const

export type CategoriaCosto = (typeof CATEGORIE_COSTO)[number]['value']

export const VOCI_MANODOPERA = [
  { value: 'posa', label: 'Posa' },
  { value: 'produzione', label: 'Produzione' },
  { value: 'altro', label: 'Altro' },
] as const

export type VoceManodopera = (typeof VOCI_MANODOPERA)[number]['value']

export type RigaManodopera = { persone: number | null; giorni: number | null }

export type CostoCommessa = {
  id: string
  commessa_id: string
  origine: 'fattura' | 'manuale'
  categoria: CategoriaCosto
  descrizione: string
  quantita: number | null
  importo: number
  fic_documento_id: number | null
  fic_riga_id: number | null
  tipo_documento: 'fattura' | 'nota_credito' | null
  fornitore_nome: string | null
  numero_documento: string | null
  data_documento: string | null
  codice: string | null
  unita: string | null
  quantita_fattura: number | null
  prezzo_unitario: number | null
  foto_path: string | null
}

/** Stima: importi per categoria, piu' manodopera e materiali del preventivo non ancora divisi. */
export type StimaCommessa = Partial<Record<CategoriaCosto, number>> & {
  manodopera?: number
  materiali_preventivo?: number
}

export type ContabilitaCommessa = {
  manodopera: Record<VoceManodopera, RigaManodopera>
  /** null = valore di Impostazioni */
  tariffa_giornaliera: number | null
  perc_costi_fissi: number | null
  stima: StimaCommessa | null
}
