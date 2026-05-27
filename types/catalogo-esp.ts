export type TipologiaESP =
  | 'cerniere' | 'maniglie' | 'chiusure' | 'cilindri'
  | 'guarnizioni' | 'squadrette' | 'scorrevoli' | 'profilati'
  | 'tapparelle' | 'viteria' | 'accessori'

export type MaterialeESP =
  | 'alluminio' | 'ferro' | 'acciaio' | 'acciaio_zincato'
  | 'inox' | 'ottone' | 'nylon' | 'vari'

export const TIPOLOGIA_LABELS: Record<TipologiaESP, string> = {
  cerniere: 'Cerniere',
  maniglie: 'Maniglie & Pomoli',
  chiusure: 'Chiusure & Cremonesi',
  cilindri: 'Cilindri & Serrature',
  guarnizioni: 'Guarnizioni',
  squadrette: 'Squadrette & Angolari',
  scorrevoli: 'Scorrevoli & Binari',
  profilati: 'Tubolari & Profilati',
  tapparelle: 'Tapparelle & Avvolgibili',
  viteria: 'Viteria & Ferramenta',
  accessori: 'Accessori Generici',
}

export const MATERIALE_LABELS: Record<MaterialeESP, string> = {
  alluminio: 'Alluminio',
  ferro: 'Ferro Nero',
  acciaio: 'Acciaio',
  acciaio_zincato: 'Acciaio Zincato',
  inox: 'Acciaio Inox',
  ottone: 'Ottone',
  nylon: 'Nylon / PVC',
  vari: 'Vari',
}

export type FiltriCatalogoESP = {
  tipologia?: TipologiaESP
  materiale?: MaterialeESP
  cerca?: string
  pagina?: number
}

export type CountTipologia = { tipologia: TipologiaESP; cnt: number }
export type CountMateriale = { materiale: MaterialeESP; cnt: number }
