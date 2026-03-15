export type SvgTemplate =
  | 'rettangolo'
  | 'arco_pieno'
  | 'arco_ribassato'
  | 'arco_acuto'
  | 'trapezio'
  | 'parallelogramma'
  | 'triangolo'
  | 'semicerchio'
  | 'cerchio'
  | 'ovale'
  | 'forma_l'

export type TipoMisura = 'input' | 'calcolato'
export type TipoAngolo = 'fisso' | 'libero'

export interface MisuraForma {
  id: string
  forma_id: string
  codice: string
  nome: string
  tipo: TipoMisura
  formula: string | null
  unita: string
  ordine: number
}

export interface AngoloForma {
  id: string
  forma_id: string
  nome: string
  tipo: TipoAngolo
  gradi: number | null
  ordine: number
}

export interface FormaSerramentoDb {
  id: string
  organization_id: string
  nome: string
  svg_template: SvgTemplate
  attiva: boolean
  ordine: number
  created_at: string
}

export interface FormaSerramentoCompleta extends FormaSerramentoDb {
  misure: MisuraForma[]
  angoli: AngoloForma[]
}

export type MisuraInput = {
  id?: string
  codice: string
  nome: string
  tipo: TipoMisura
  formula: string | null
  unita: string
  ordine: number
}

export type AngoloInput = {
  id?: string
  nome: string
  tipo: TipoAngolo
  gradi: number | null
  ordine: number
}

export type FormaSerramentoInput = {
  nome: string
  svg_template: SvgTemplate
  attiva: boolean
  ordine: number
  misure: MisuraInput[]
  angoli: AngoloInput[]
}
