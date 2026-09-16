import type { StatoCommessa } from '@/types/commessa'

/**
 * Lo stato della commessa e' un campo solo, la colonna `stato` di `commesse`:
 * l'elenco economico e la pagina di Produzione lo leggono e lo scrivono
 * entrambi, quindi non c'e' niente da tenere in sincrono fra le due viste.
 * Etichette e colori stanno qui perche' il badge sia lo stesso da tutte le
 * parti — chi lo cambia da Produzione deve ritrovarlo identico in Commesse.
 */
export const STATI_COMMESSA: { value: StatoCommessa; label: string }[] = [
  { value: 'in_attesa',                label: 'In attesa' },
  { value: 'da_iniziare',              label: 'Da iniziare' },
  { value: 'in_lavorazione',           label: 'In lavorazione' },
  { value: 'da_consegnare',            label: 'Da consegnare' },
  { value: 'consegnato',               label: 'Consegnato' },
  { value: 'parzialmente_consegnato',  label: 'Parz. consegnato' },
  { value: 'concluso',                 label: 'Concluso' },
  { value: 'bloccato',                 label: 'Bloccato' },
  { value: 'annullato',                label: 'Annullato' },
]

export function labelStatoCommessa(stato: StatoCommessa): string {
  return STATI_COMMESSA.find((s) => s.value === stato)?.label ?? stato
}

export function statoCommessaBadgeClass(stato: StatoCommessa): string {
  if (stato === 'concluso')   return 'bg-sky-100 text-sky-700 border-sky-200'
  if (stato === 'bloccato')   return 'bg-orange-100 text-orange-700 border-orange-200'
  if (stato === 'annullato')  return 'bg-red-100 text-red-700 border-red-200'
  if (stato === 'in_attesa')  return 'bg-gray-100 text-gray-500 border-gray-200'
  return 'bg-yellow-100 text-yellow-700 border-yellow-200'
}
