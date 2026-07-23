export type TipoAccesso = 'nessuno' | 'lettura' | 'scrittura'

export const MODULI_APP = [
  'dashboard',
  'preventivi',
  'clienti',
  'listini',
  'cataloghi',
  'rilievo',
  'winconfig',
  'magazzino',
  'commesse',
  'dipendenti',
  'produzione',
  'impostazioni',
] as const

export type ModuloApp = (typeof MODULI_APP)[number]

export const MODULO_LABELS: Record<ModuloApp, string> = {
  dashboard:    'Dashboard',
  preventivi:   'Preventivi',
  clienti:      'Clienti',
  listini:      'Listini',
  cataloghi:    'Cataloghi e Brochure',
  rilievo:      'Rilievo Misure',
  winconfig:    'WinConfig',
  magazzino:    'Magazzino',
  commesse:     'Commesse',
  dipendenti:   'Dipendenti',
  produzione:   'Produzione',
  impostazioni: 'Impostazioni',
}

export type PermessiUtente = Record<ModuloApp, TipoAccesso>

export const PERMESSI_ADMIN: PermessiUtente = {
  dashboard:    'scrittura',
  preventivi:   'scrittura',
  clienti:      'scrittura',
  listini:      'scrittura',
  cataloghi:    'scrittura',
  rilievo:      'scrittura',
  winconfig:    'scrittura',
  magazzino:    'scrittura',
  commesse:     'scrittura',
  dipendenti:   'scrittura',
  produzione:   'scrittura',
  impostazioni: 'scrittura',
}

export const PERMESSI_VUOTI: PermessiUtente = {
  dashboard:    'nessuno',
  preventivi:   'nessuno',
  clienti:      'nessuno',
  listini:      'nessuno',
  cataloghi:    'nessuno',
  rilievo:      'nessuno',
  winconfig:    'nessuno',
  magazzino:    'nessuno',
  commesse:     'nessuno',
  dipendenti:   'nessuno',
  produzione:   'nessuno',
  impostazioni: 'nessuno',
}

export type UtenteConPermessi = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'operator'
  disabled: boolean
  operatore: string | null
  permessi: PermessiUtente
}
