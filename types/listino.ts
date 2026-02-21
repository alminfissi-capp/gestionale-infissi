export type Categoria = {
  id: string
  organization_id: string
  nome: string
  icona: string
  ordine: number
  created_at: string
  updated_at: string
}

export type Finitura = {
  id: string
  listino_id: string
  nome: string
  aumento: number
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

export type CategoriaConListini = Categoria & {
  listini: ListinoCompleto[]
}

export type GrigliaData = {
  larghezze: number[]
  altezze: number[]
  griglia: Record<string, Record<string, number>>
}
