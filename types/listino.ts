export type TipoCategoria = 'griglia' | 'libero'

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
  ordine: number
  created_at: string
}

export type ListinoLiberoCompleto = ListinoLibero & {
  prodotti: ProdottoListino[]
  accessori: AccessorioListino[]
}

// ---- Categoria con listini ----

export type CategoriaConListini = Categoria & {
  listini: ListinoCompleto[]
  finiture_categoria: FinituraCategoria[]
  listini_liberi: ListinoLiberoCompleto[]
}

export type GrigliaData = {
  larghezze: number[]
  altezze: number[]
  griglia: Record<string, Record<string, number>>
}
