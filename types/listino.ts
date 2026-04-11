export type TipoCategoria = 'griglia' | 'libero' | 'su_misura'

export type Categoria = {
  id: string
  organization_id: string
  nome: string
  icona: string
  ordine: number
  tipo: TipoCategoria
  // Opzioni categoria
  trasporto_costo_unitario: number
  trasporto_costo_minimo: number
  trasporto_minimo_pezzi: number
  sconto_fornitore: number
  sconto_massimo: number
  created_at: string
  updated_at: string
}

export type FinituraCategoria = {
  id: string
  organization_id: string
  categoria_id: string
  nome: string
  aumento_percentuale: number
  aumento_euro: number
  ordine: number
  created_at: string
}

export type Finitura = {
  id: string
  listino_id: string
  nome: string
  aumento: number       // percentuale
  aumento_euro: number  // fisso in €
  ordine: number
  created_at: string
}

export type AccessorioGriglia = {
  id: string
  listino_id: string
  organization_id: string
  gruppo: string
  gruppo_tipo: 'multiplo' | 'unico'
  nome: string
  tipo_prezzo: 'pezzo' | 'mq' | 'percentuale'
  prezzo: number
  prezzo_acquisto: number
  mq_minimo: number | null
  ordine: number
  created_at: string
}

export type Listino = {
  id: string
  organization_id: string
  categoria_id: string
  tipologia: string
  larghezze: number[]
  altezze: number[]
  griglia: Record<string, Record<string, number>>
  immagine_url: string | null
  ordine: number
  created_at: string
  updated_at: string
}

export type ListinoCompleto = Listino & {
  finiture: Finitura[]
  accessori_griglia: AccessorioGriglia[]
}

// ---- Listino libero (catalogo prodotti) ----

export type ListinoLibero = {
  id: string
  organization_id: string
  categoria_id: string
  tipologia: string
  ordine: number
  created_at: string
  updated_at: string
}

export type ProdottoListino = {
  id: string
  organization_id: string
  listino_libero_id: string
  nome: string
  prezzo: number
  prezzo_acquisto: number
  descrizione: string | null
  immagine_url: string | null
  ordine: number
  created_at: string
}

export type AccessorioListino = {
  id: string
  organization_id: string
  listino_libero_id: string
  nome: string
  prezzo: number
  prezzo_acquisto: number
  ordine: number
  created_at: string
}

export type ListinoLiberoCompleto = ListinoLibero & {
  prodotti: ProdottoListino[]
  accessori: AccessorioListino[]
}

// ---- Listino su misura ----

export type ListinoSuMisura = {
  id: string
  organization_id: string
  categoria_id: string
  nome: string
  descrizione: string | null
  prezzo_mq: number
  prezzo_acquisto_mq: number
  larghezza_min: number
  larghezza_max: number
  altezza_min: number
  altezza_max: number
  mq_minimo: number
  immagine_url: string | null
  ordine: number
  attivo: boolean
  created_at: string
  updated_at: string
}

export type FinituraSuMisura = {
  id: string
  organization_id: string
  listino_id: string
  nome: string
  tipo_maggiorazione: 'percentuale' | 'mq' | 'fisso'
  valore: number
  prezzo_acquisto: number
  ordine: number
  created_at: string
}

export type GruppoAccessoriSuMisura = {
  id: string
  organization_id: string
  listino_id: string
  nome: string
  tipo_scelta: 'singolo' | 'multiplo' | 'incluso'
  ordine: number
  accessori: AccessorioSuMisura[]
}

export type AccessorioSuMisura = {
  id: string
  organization_id: string
  gruppo_id: string
  nome: string
  unita: 'pz' | 'mq' | 'ml'
  prezzo: number
  prezzo_acquisto: number
  qty_modificabile: boolean
  qty_default: number
  ordine: number
  created_at: string
}

export type ListinoSuMisuraCompleto = ListinoSuMisura & {
  finiture: FinituraSuMisura[]
  gruppi_accessori: GruppoAccessoriSuMisura[]
}

// ---- Categoria con listini ----

export type CategoriaConListini = Categoria & {
  listini: ListinoCompleto[]
  finiture_categoria: FinituraCategoria[]
  listini_liberi: ListinoLiberoCompleto[]
  listini_su_misura: ListinoSuMisuraCompleto[]
}

export type GrigliaData = {
  larghezze: number[]
  altezze: number[]
  griglia: Record<string, Record<string, number>>
}
