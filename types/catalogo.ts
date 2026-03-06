export interface Catalogo {
  id: string
  organization_id: string
  nome: string
  storage_path: string
  ordine: number
  created_at: string
  /** URL pubblica del PDF (popolata lato server) */
  url: string
}
