// Reparti nativi dal catalogo ESP Edilsider (REPARTI_NOMI in ESP backend/db.js)
export const REPARTI: Record<number, string> = {
  1: 'Alluminio',
  2: 'Ferro',
  3: 'Accessori',
  4: 'Macchine Utensili',
  5: 'Acciaio Inox',
  6: 'PVC',
}

export type FiltriCatalogo = {
  reparto?: number
  gruppo?: string
  cerca?: string
  pagina?: number
}

export type CountReparto = { reparto: number; cnt: number }
export type CountGruppo  = { gruppo: string | null; cnt: number }

export type ArticoloCatalogo = {
  id: string
  organization_id: string
  codice: string
  descrizione: string
  um: string
  reparto: number | null
  gruppo: string | null
  immagine_url: string | null
  prezzo_acquisto: number | null
  soglia_minima: number | null
  soglia_abilitata: boolean
  categoria_id: string | null
  fornitore_principale_id: string | null
  posizione_id: string | null
  peso_al_metro: number | null
  lunghezza_default: number | null
  foto_url: string | null
  dxf_url: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type PrezzoLive = {
  codice: string
  prezzo: number | null
  disponibile_al: boolean
  disponibile_ct: boolean
  qty_al: number
  qty_ct: number
  fetched_at: string
  da_cache: boolean
  // Presenti solo quando fetchato live (non dalla cache)
  descrizione?: string | null
  um?: string | null
}
