export type StatoPreventivoScorrevoli = 'bozza' | 'inviato' | 'accettato' | 'rifiutato'

export type ClienteScorrevoli = {
  nome: string
  azienda: string
  telefono: string
  email: string
  indirizzo: string
  cantiere: string
}

export type OptionalRiga = {
  optional_id: string
  descrizione: string
  prezzo: number
  unita: string
  quantita: number
}

export type RigaScorrevoli = {
  id: string
  riferimento: string
  modello: string // 'alpha' | 'alpha_plus' | 'maxima' | 'prisma'
  larghezza_mm: number
  altezza_mm: number
  nr_ante: number | string
  apertura: 'laterale' | 'centrale' | 'fisso'
  raccolta: 'destra' | 'sinistra' | ''
  quantita: number
  colore_struttura_nome: string
  colore_struttura_maggiorazione: number // es. 0 | 0.1 | 0.3
  colore_accessori: string
  tipo_vetro: 'standard' | 'extrachiaro' | 'satinato' | 'fume'
  note: string
  optional: OptionalRiga[]
}

export type TotaliScorrevoli = {
  // calcolati al volo, non salvati
  righe: {
    id: string
    mq_reali: number
    mq_fatturati: number
    prezzo_mq: number
    prezzo_vetrata: number
    sconto_vetrata: number        // solo Prisma
    prezzo_vetrata_netto: number
    maggiorazione_colore: number
    prezzo_vetro_extra: number
    totale_optional: number
    sconto_optional: number
    totale_optional_netto: number
    totale_riga: number
    totale_riga_x_qty: number
  }[]
  subtotale_vetrate: number
  subtotale_optional: number
  totale_netto: number
  trasporto: number
  totale_imponibile: number
  iva: number
  totale_generale: number
}

/** Dati salvati dentro config_scorrevole dell'articolo preventivo classico */
export type ConfigScorrevoleArticolo = {
  riga: RigaScorrevoli
  sconto_vetrata_prisma: number
  sconto_optional: number
  dettaglio: {
    mq_fatturati: number
    prezzo_mq: number
    prezzo_vetrata: number
    sconto_vetrata: number
    prezzo_vetrata_netto: number
    maggiorazione_colore: number
    prezzo_vetro_extra: number
    totale_optional: number
    sconto_optional: number
    totale_optional_netto: number
    totale_riga: number
  }
}

export type PreventivoScorrevoli = {
  id: string
  numero: string
  data: string           // ISO date string
  stato: StatoPreventivoScorrevoli
  cliente: ClienteScorrevoli
  righe: RigaScorrevoli[]
  // parametri commerciali per commessa (editabili, override del default)
  sconto_vetrata_prisma: number  // es. 0.5
  sconto_optional: number        // es. 0.45
  trasporto: number              // es. 0.04
  iva: number                    // es. 0.22
  margine_alm: number | null
  note_generali: string
  created_at: string
  updated_at: string
}
