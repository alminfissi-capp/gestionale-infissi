export type UnitaMisura = 'pz' | 'ml' | 'cop' | 'kg' | 'pacco' | 'lt' | 'm2'
export type TipoCategoriaMagazzino = 'alluminio' | 'ferro' | 'accessori' | 'pannelli' | 'chimici'
export type TipoMovimento = 'entrata' | 'uscita'

export const UNITA_MISURA_LABELS: Record<UnitaMisura, string> = {
  pz: 'Pezzo',
  ml: 'Metro lineare',
  cop: 'Coppia',
  kg: 'Kg',
  pacco: 'Pacco',
  lt: 'Litro',
  m2: 'M²',
}

export const TIPO_CATEGORIA_LABELS: Record<TipoCategoriaMagazzino, string> = {
  alluminio: 'Alluminio',
  ferro: 'Ferro',
  accessori: 'Accessori',
  pannelli: 'Pannelli',
  chimici: 'Chimici / Vernicianti',
}

export const CATEGORIE_CON_FINITURE: TipoCategoriaMagazzino[] = ['alluminio', 'ferro']

export type Fornitore = {
  id: string
  organization_id: string
  nome: string
  partita_iva: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type FornitoreInput = {
  nome: string
  partita_iva?: string
  telefono?: string
  email?: string
  indirizzo?: string
  note?: string
}

export type CategoriaMagazzino = {
  id: string
  organization_id: string
  nome: string
  tipo: TipoCategoriaMagazzino
  ordine: number
  created_at: string
}

export type FinituraCategoria = {
  id: string
  categoria_id: string
  organization_id: string
  nome: string
  costo_per_kg: number | null
  costo_per_metro: number | null
  ordine: number
  created_at: string
}

export type FinituraCategoriaInput = {
  nome: string
  costo_per_kg?: number | null
  costo_per_metro?: number | null
  ordine?: number
}

export type PosizioneInput = {
  nome: string
  descrizione?: string
}

export type PosizioneMagazzino = {
  id: string
  organization_id: string
  nome: string
  descrizione: string | null
  created_at: string
}

export type AnagraficaProdotto = {
  id: string
  organization_id: string
  codice: string
  nome: string
  descrizione: string | null
  categoria_id: string | null
  unita_misura: UnitaMisura
  prezzo_acquisto: number | null
  peso_al_metro: number | null
  lunghezza_default: number | null
  posizione_id: string | null
  fornitore_principale_id: string | null
  soglia_minima: number | null
  soglia_abilitata: boolean
  foto_url: string | null
  dxf_url: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type VarianteProdotto = {
  id: string
  prodotto_id: string
  nome: string
  codice_variante: string | null
  foto_url: string | null
  dxf_url: string | null
  created_at: string
}

export type MovimentoMagazzino = {
  id: string
  organization_id: string
  tipo: TipoMovimento
  prodotto_id: string
  variante_id: string | null
  quantita: number
  prezzo_unitario: number | null
  finitura_id: string | null
  lunghezza: number | null
  fornitore_id: string | null
  commessa_ref: string | null
  data: string
  note: string | null
  created_at: string
}

export type Giacenza = {
  organization_id: string
  prodotto_id: string
  codice: string
  prodotto_nome: string
  unita_misura: UnitaMisura
  variante_id: string | null
  variante_nome: string | null
  giacenza_attuale: number
}
