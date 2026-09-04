// 'da_programmare' e' un blocco di sistema, uno solo per organizzazione: raccoglie
// le scadenze ancora senza data di pagamento
export type TipoBlocco = 'commesse' | 'scadenze' | 'da_programmare'

export type GruppoCommesse = {
  id: string
  organization_id: string
  nome: string
  ordine: number
  tipo: TipoBlocco
  created_at: string
}

// Conto corrente (anagrafica): banca dove vengono addebitate le scadenze
export type ContoCorrente = {
  id: string
  organization_id: string
  nome: string
  saldo_attuale: number // disponibilità, fido incluso: è il numero che l'utente legge in banca
  fido_accordato: number
  ordine: number
  created_at: string
  updated_at: string
}

export type ContoCorrenteInput = {
  nome: string
  saldo_attuale: number
  fido_accordato: number
}

// 'tassa' aggiunta il 2026-08-17: le imposte e i contributi sono un costo che va
// visto a parte, non annegato in 'altro'. La colonna DB è text senza vincolo, quindi
// non serve migrazione; le etichette stanno in Record<CategoriaScadenza, …> così il
// compilatore segnala ogni punto da completare quando la lista cresce.
export type CategoriaScadenza = 'finanziamento' | 'assegno' | 'utenza' | 'tassa' | 'altro'

// Scadenza fornitore / rateizzazione (blocco anno, raggruppata per mese da data_scadenza)
export type Scadenza = {
  id: string
  organization_id: string
  gruppo_id: string
  // Senza data = scadenza da programmare: vive nel blocco di sistema e non
  // appartiene a nessun mese finche' non viene pagata
  data_scadenza: string | null
  descrizione: string
  fornitore: string
  importo: number
  pagato: boolean
  categoria: CategoriaScadenza
  numero_rata: number | null
  totale_rate: number | null
  conto_id: string | null
  foto_path: string | null
  // Immagine della prima pagina, solo per gli allegati PDF: serve ad anteprima
  // e stampa, che sanno mostrare solo immagini
  anteprima_path: string | null
  in_calcoli: boolean
  // Annullata: la riga conserva tutti i dati (allegato compreso) ma esce da
  // ogni totale e dallo slot Calcoli. Serve quando una scadenza non viene
  // pagata perche' sostituita da un'altra.
  annullata: boolean
  ordine: number
  created_at: string
  updated_at: string
}

export type ScadenzaInput = {
  gruppo_id: string
  data_scadenza: string | null
  descrizione: string
  fornitore: string
  importo: number
  pagato: boolean
  categoria: CategoriaScadenza
  numero_rata: number | null
  totale_rate: number | null
  conto_id: string | null
}

export type MetodoPagamento = 'contanti' | 'bonifico' | 'riba' | 'altro'
export type Reparto = 'alluminio' | 'ferro' | 'servizi' | 'rivendita' | 'ebay'
export const REPARTI: { value: Reparto; label: string }[] = [
  { value: 'alluminio', label: 'Alluminio' },
  { value: 'ferro',     label: 'Ferro' },
  { value: 'servizi',   label: 'Servizi' },
  { value: 'rivendita', label: 'Rivendita' },
  { value: 'ebay',      label: 'Ebay' },
]

/**
 * I tipi di documento del lato Commesse — quelli che NON sono di produzione.
 * I valori sono le stringhe già scritte in `documenti_commessa.tipo_documento`,
 * spazi compresi: cambiarli scollegherebbe i documenti già caricati.
 */
export const TIPI_DOCUMENTO_COMMESSA: { value: string; label: string }[] = [
  { value: 'fattura',         label: 'Fattura' },
  { value: 'nota di credito', label: 'Nota di credito' },
  { value: 'bolla',           label: 'Bolla' },
  { value: 'contratto',       label: 'Contratto' },
  { value: 'altro',           label: 'Altro' },
]

/** Una commessa come la vede l'imbuto di condivisione: giusto quel che serve a cercarla. */
export type CommessaCondivisione = {
  id: string
  numero_commessa: string | null
  numero_preventivo: string | null // il principale, quello mostrato in elenco
  cliente_nome: string
  numeri_preventivo: string[]      // tutti i collegati, solo per la ricerca
}
export type StatoCommessa =
  | 'in_attesa'
  | 'da_iniziare'
  | 'in_lavorazione'
  | 'da_consegnare'
  | 'consegnato'
  | 'parzialmente_consegnato'
  | 'concluso'
  | 'bloccato'
  | 'annullato'

export type Commessa = {
  id: string
  organization_id: string
  numero_commessa: string
  preventivo_id: string | null
  numero_preventivo: string | null
  cliente_nome: string
  imponibile: number
  iva_totale: number
  totale: number
  data_conferma: string
  operatore_id: string | null
  operatore_nome: string | null
  note: string | null
  stato: StatoCommessa
  reparti: Reparto[]
  gruppo_id: string | null
  in_calcoli: boolean
  // Vendite online (e-commerce, eBay): commessa contabile senza lavorazione.
  // Vedi types SezioneAnonima / VenditaAnonima piu' sotto.
  anonima: boolean
  sezione_anonima_id: string | null
  canale: string | null
  aliquota_iva: number | null
  incasso_previsto: number | null
  costo_materiali_manuale: number | null
  costo_manodopera_manuale: number | null
  utile_manuale: number | null
  cantiere_lat: number | null
  cantiere_lng: number | null
  created_at: string
  updated_at: string
}

export type AccontoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  // Il LORDO bonificato dal cliente: e' quanto ha pagato, e chiude il suo debito.
  importo: number
  // Quanto la banca ha trattenuto sul bonifico per detrazioni fiscali e versato
  // all'Erario. 0 su tutti gli altri pagamenti. L'incassato e' la differenza:
  // vedi `nettoIncassato` in lib/ritenuta-acconto.ts.
  ritenuta: number
  data_pagamento: string
  metodo_pagamento: MetodoPagamento
  note: string | null
  firma_immagine: string | null
  created_at: string
}

export type DocumentoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  nome_file: string
  storage_path: string
  tipo_documento: string
  created_at: string
}

export type PreventivoCommessa = {
  id: string
  commessa_id: string
  organization_id: string
  preventivo_id: string | null
  numero_preventivo: string | null
  nome_file: string | null
  storage_path: string | null
  ordine: number
  created_at: string
}

export type CommessaCompleta = Commessa & {
  acconti: AccontoCommessa[]
  documenti: DocumentoCommessa[]
  preventivi_collegati: PreventivoCommessa[]
  totale_acconti: number
  saldo: number
}

export type CommessaInput = {
  numero_commessa: string
  preventivo_id: string | null
  numero_preventivo: string | null
  cliente_nome: string
  imponibile: number
  iva_totale: number
  totale: number
  data_conferma: string
  operatore_id: string | null
  operatore_nome: string | null
  note: string | null
  reparti: Reparto[]
  gruppo_id?: string
  costo_materiali_manuale?: number | null
  costo_manodopera_manuale?: number | null
  utile_manuale?: number | null
  cantiere_lat?: number | null
  cantiere_lng?: number | null
}

export type AccontoInput = {
  importo: number
  ritenuta: number
  data_pagamento: string
  metodo_pagamento: MetodoPagamento
  note: string | null
}

export type PreventivoPerCommessa = {
  id: string
  numero: string | null
  cliente_nome: string
  imponibile: number
  iva_totale: number
  totale: number
}

export type UtentePerCommessa = {
  id: string
  nome: string
}

// Riga libera dei Calcoli: giacenze banca / contanti / liquidità corrente
export type RigaCalcolo = {
  id: string
  organization_id: string
  descrizione: string
  importo: number
  ordine: number
  created_at: string
  updated_at: string
}

// Incasso in attesa: entrata che non nasce da una commessa (rimborsi, note di
// credito, prestiti). Inseribile solo dalla pagina Calcoli.
/**
 * Credito fiscale inserito a mano: IVA a credito, acconti d'imposta, crediti
 * d'imposta. Le ritenute d'acconto NON si registrano qui — si calcolano dagli
 * acconti e comparirebbero due volte. `recuperato` e' l'equivalente di
 * `incassato` su IncassoAttesa: la voce esce dal totale, la riga resta.
 */
export type CreditoFiscale = {
  id: string
  organization_id: string
  nome: string
  descrizione: string
  importo: number
  recuperato: boolean
  ordine: number
  created_at: string
  updated_at: string
}

export type IncassoAttesa = {
  id: string
  organization_id: string
  nome: string
  descrizione: string
  importo: number
  incassato: boolean
  ordine: number
  created_at: string
  updated_at: string
}

// ── Linee di credito e anticipi fattura ──────────────────────────────────────
// `tipo` è text senza vincolo DB, come CategoriaScadenza: le etichette stanno in un
// Record, così il compilatore segnala ogni punto da completare quando la lista cresce.
export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export const LABEL_TIPO_LINEA: Record<TipoLineaCredito, string> = {
  anticipo_fatture: 'Anticipo fatture',
  sbf: 'Salvo buon fine',
  castelletto: 'Castelletto',
  altro: 'Altro',
}

export type LineaCredito = {
  id: string
  organization_id: string
  nome: string
  tipo: TipoLineaCredito
  accordato: number
  ordine: number
  created_at: string
  updated_at: string
}

export type LineaCreditoInput = {
  nome: string
  tipo: TipoLineaCredito
  accordato: number
}

export type AnticipoFattura = {
  id: string
  organization_id: string
  linea_id: string
  // Più commesse per un anticipo: una sola fattura emessa per più lavori.
  // I legami stanno nella tabella `anticipi_commesse`.
  commesse_ids: string[]
  descrizione: string
  importo: number // quanto la banca ha erogato
  // Acconti del cliente che la banca ha trattenuto per rientrare, scelti a mano.
  // I legami stanno in `anticipi_acconti`; `scalato` è la loro somma.
  acconti_ids: string[]
  scalato: number
  data_erogazione: string | null
  data_scadenza: string | null
  rimborsato: boolean
  rimborsato_at: string | null
  created_at: string
  updated_at: string
}

export type AnticipoFatturaInput = {
  linea_id: string
  commesse_ids: string[]
  acconti_ids: string[]
  descrizione: string
  importo: number
  data_erogazione: string | null
  data_scadenza: string | null
}

// Un acconto del cliente, come si vede scegliendo cosa la banca ha trattenuto.
export type AccontoSelezionabile = {
  id: string
  commessa_id: string
  etichettaCommessa: string
  importo: number
  data_pagamento: string
  metodo_pagamento: string
  // id dell'anticipo che se l'è già preso, se c'è: un acconto rientra su un solo
  // anticipo, altrimenti gli stessi soldi verrebbero scalati due volte.
  anticipo_id: string | null
}

// Commessa collegabile a un anticipo: etichetta pronta e residuo da incassare.
export type OpzioneCommessa = {
  id: string
  etichetta: string // "C-2026-014 — Rossi Mario"
  residuo: number
}

// ── Commesse anonime: vendite e-commerce ed eBay ─────────────────────────────
// Sono ricavi a tutti gli effetti ma non sono lavori: nessuna scheda in
// produzione, nessun appuntamento, nessun saldo residuo. Tecnicamente ognuna e'
// una riga di `commesse` con `anonima = true` piu' il suo unico acconto.

export type CanaleVendita = 'ebay' | 'ecommerce' | 'altro'

export const CANALI_VENDITA: { value: CanaleVendita; label: string }[] = [
  { value: 'ebay', label: 'eBay' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'altro', label: 'Altro' },
]

/** Raccoglitore di vendite dentro un blocco anno. Creato a richiesta. */
export type SezioneAnonima = {
  id: string
  organization_id: string
  gruppo_id: string
  nome: string
  ordine: number
  created_at: string
  updated_at: string
}

/** Una vendita come la legge l'interfaccia: i due record gia' ricomposti. */
export type VenditaAnonima = {
  id: string // id della commessa sottostante
  sezione_id: string
  data: string // 'YYYY-MM-DD'
  descrizione: string
  canale: CanaleVendita
  metodo_pagamento: MetodoPagamento
  lordo: number
  aliquota_iva: number
  imponibile: number
  iva: number
  materiale: number
  manodopera: number
  utile: number
}

export type SezioneConVendite = SezioneAnonima & { vendite: VenditaAnonima[] }

export type VenditaAnonimaInput = {
  sezione_id: string
  data: string
  descrizione: string
  canale: CanaleVendita
  metodo_pagamento: MetodoPagamento
  lordo: number
  aliquota_iva: number
  materiale: number
  manodopera: number
}
