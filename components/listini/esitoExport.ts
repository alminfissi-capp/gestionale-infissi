import { toast } from 'sonner'
import type { EsitoSalvataggio } from '@/lib/exportListino'

/**
 * Dà voce all'esportazione. Prima il pulsante restava muto in ogni caso, e
 * nella PWA installata — dove il salvataggio può essere bloccato — sembrava
 * rotto. Su 'annullato' non si dice niente: l'utente ha chiuso lui il dialog.
 */
export function avvisaEsito(esito: EsitoSalvataggio): void {
  if (esito === 'salvato') toast.success('Listino esportato')
  else if (esito === 'fallito') toast.error('Esportazione non riuscita')
}
