export type TipoCategoriaMagazzino = 'alluminio' | 'ferro' | 'accessori' | 'pannelli' | 'chimici' | 'viteria'
export type TipoMovimento = 'entrata' | 'uscita'

export const TIPO_CATEGORIA_LABELS: Record<TipoCategoriaMagazzino, string> = {
  alluminio: 'Alluminio',
  ferro: 'Ferro',
  accessori: 'Accessori',
  pannelli: 'Pannelli',
  chimici: 'Chimici / Vernicianti',
  viteria: 'Viteria',
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
  /** Decide il colore della ricezione generata dagli ordini di questo fornitore. */
  categoria_calendario: 'alluminio' | 'vetri' | 'accessori' | null
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
  categoria_calendario?: 'alluminio' | 'vetri' | 'accessori' | null
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

// Prodotto-master — sostituisce AnagraficaProdotto
// Corrisponde alla tabella catalogo_articoli su Supabase
export type CatalogoArticolo = {
  id: string
  organization_id: string
  codice: string
  descrizione: string           // nome/titolo del prodotto (campo ESP)
  um: string                    // unità misura raw ESP: 'ACC. PEZZO', 'BR', 'MT', ecc.
  reparto: number | null        // 1-6: Alluminio, Ferro, Accessori, Macchine Utensili, Acciaio Inox, PVC
  gruppo: string | null
  immagine_url: string | null
  categoria_id: string | null
  prezzo_acquisto: number | null
  fornitore_principale_id: string | null
  posizione_id: string | null
  soglia_minima: number | null
  soglia_abilitata: boolean
  peso_al_metro: number | null
  lunghezza_default: number | null
  foto_url: string | null
  dxf_url: string | null
  note: string | null
  created_at: string
  updated_at: string
}

// Alias per retrocompatibilità nei componenti ancora non aggiornati
export type AnagraficaProdotto = CatalogoArticolo

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
  unita_misura: string          // raw ESP um
  variante_id: string | null
  variante_nome: string | null
  giacenza_attuale: number
}

// ---- Inventario semplice ----

export type ArticoloMagazzino = {
  id: string
  organization_id: string
  prodotto_id: string | null
  finitura: string | null
  quantita: number
  quantita_2: number | null
  unita_misura_2: string | null
  posizione_id: string | null
  fornitore_id: string | null
  commessa: string | null
  note: string | null
  ordine: number
  created_at: string
  updated_at: string
}

export type ProdottoInventario = Pick<
  CatalogoArticolo,
  'id' | 'codice' | 'descrizione' | 'um' | 'categoria_id' | 'foto_url' | 'dxf_url'
>

export type ArticoloMagazzinoConDettagli = ArticoloMagazzino & {
  prodotto: ProdottoInventario | null
  posizione: Pick<PosizioneMagazzino, 'id' | 'nome'> | null
  fornitore: Pick<Fornitore, 'id' | 'nome'> | null
  preview_url?: string | null
  preview_tipo?: 'foto' | 'dxf' | null
}

export type ArticoloMagazzinoInput = {
  prodotto_id: string
  finitura?: string | null
  quantita: number
  quantita_2?: number | null
  unita_misura_2?: string | null
  posizione_id?: string | null
  fornitore_id?: string | null
  commessa?: string | null
  note?: string | null
}
