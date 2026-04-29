export type TipoAccesso = 'nessuno' | 'lettura' | 'scrittura'

export const MODULI_APP = [
  'preventivi',
  'clienti',
  'listini',
  'cataloghi',
  'rilievo',
  'winconfig',
  'magazzino',
  'impostazioni',
] as const

export type ModuloApp = (typeof MODULI_APP)[number]

export const MODULO_LABELS: Record<ModuloApp, string> = {
  preventivi:   'Preventivi',
  clienti:      'Clienti',
  listini:      'Listini',
  cataloghi:    'Cataloghi e Brochure',
  rilievo:      'Rilievo Misure',
  winconfig:    'WinConfig',
  magazzino:    'Magazzino',
  impostazioni: 'Impostazioni',
}

export type PermessiUtente = Record<ModuloApp, TipoAccesso>

export const PERMESSI_ADMIN: PermessiUtente = {
  preventivi:   'scrittura',
  clienti:      'scrittura',
  listini:      'scrittura',
  cataloghi:    'scrittura',
  rilievo:      'scrittura',
  winconfig:    'scrittura',
  magazzino:    'scrittura',
  impostazioni: 'scrittura',
}

export const PERMESSI_VUOTI: PermessiUtente = {
  preventivi:   'nessuno',
  clienti:      'nessuno',
  listini:      'nessuno',
  cataloghi:    'nessuno',
  rilievo:      'nessuno',
  winconfig:    'nessuno',
  magazzino:    'nessuno',
  impostazioni: 'nessuno',
}

export type UtenteConPermessi = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'operator'
  disabled: boolean
  permessi: PermessiUtente
}
