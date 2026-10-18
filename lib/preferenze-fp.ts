// Stellina dei preferiti del rilievo FP PRO (strutture, colori, vetri): sul server per
// averli su tutti i dispositivi, subito anche nel catalogo locale per vederli senza attese.
import { toast } from 'sonner'
import { impostaPreferenzaFp } from '@/actions/rilievo-fp'
import { db } from '@/lib/db'
import type { PreferenzaFp } from '@/types/rilievo-fp'

export async function cambiaPreferenzaFp(tipo: PreferenzaFp['tipo'], rif: string, attiva: boolean): Promise<void> {
  if (!navigator.onLine) { toast.error('Per segnare un preferito serve la rete'); return }
  const r = await impostaPreferenzaFp(tipo, rif, attiva)
  if ('errore' in r) { toast.error(r.errore); return }
  if (attiva) await db.fpPreferenze.put({ id: `${tipo}:${rif}`, tipo, rif, ordine: 0 })
  else await db.fpPreferenze.delete(`${tipo}:${rif}`)
}
