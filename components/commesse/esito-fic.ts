import { toast } from 'sonner'
import { messaggioEsitoFic } from '@/lib/fic/allineamento'
import type { EsitoFic } from '@/types/fatture-fornitori'

/** Avviso con l'esito su FiC di un'azione sulla scadenza. Niente se non c'era niente da fare. */
export function mostraEsitoFic(e: EsitoFic | null | undefined) {
  if (!e) return
  const m = messaggioEsitoFic(e)
  if (m.tipo === 'successo') toast.success(m.testo)
  else if (m.tipo === 'avviso') toast.warning(m.testo, { duration: 10000 })
}
