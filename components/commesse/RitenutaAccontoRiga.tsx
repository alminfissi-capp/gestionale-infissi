'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark } from 'lucide-react'
import { formatEuro } from '@/lib/pricing'
import { calcolaRitenutaPer, nettoIncassato, type TipoRitenuta } from '@/lib/ritenuta-acconto'
import { updateAccontoRitenuta } from '@/actions/commesse'
import type { AccontoCommessa } from '@/types/commessa'

interface Props {
  acconto: AccontoCommessa
  /** Quota imponibile della commessa (`quotaImponibile`): la usa solo il 4%. */
  quota: number
  /** Spenti dove la ritenuta non si applica; il testo dice il perche'. */
  motivoDetrazioniDisabilitata?: string | null
  motivoCondominioDisabilitata?: string | null
}

const PERCENTUALE: Record<TipoRitenuta, string> = {
  detrazioni: '11%',
  condominio: '4%',
}

const COMANDO: Record<TipoRitenuta, string> = {
  detrazioni: 'Bonifico per detrazioni fiscali',
  condominio: 'Pagamento da condominio',
}

/**
 * Riga di dettaglio della ritenuta sotto un acconto gia' registrato, e comandi
 * per marcarla. Serve soprattutto ai pagamenti inseriti prima che la funzione
 * esistesse: senza, resterebbero per sempre al lordo nel flusso di cassa.
 */
export default function RitenutaAccontoRiga({
  acconto,
  quota,
  motivoDetrazioniDisabilitata,
  motivoCondominioDisabilitata,
}: Props) {
  const router = useRouter()
  const [salvando, setSalvando] = useState(false)
  const attivo = (acconto.ritenuta ?? 0) > 0 ? acconto.ritenuta_tipo : null

  const salva = async (tipo: TipoRitenuta | null) => {
    setSalvando(true)
    try {
      await updateAccontoRitenuta(acconto.id, calcolaRitenutaPer(tipo, acconto.importo, quota), tipo)
      toast.success(tipo === null ? 'Ritenuta rimossa' : 'Ritenuta registrata')
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSalvando(false)
    }
  }

  // Dove la ritenuta non si applica il comando sparisce del tutto: qui, a
  // differenza del form, non c'e' una spunta che l'utente sta cercando.
  const disponibili = ([
    ['detrazioni', motivoDetrazioniDisabilitata],
    ['condominio', motivoCondominioDisabilitata],
  ] as const)
    .filter(([, motivo]) => !motivo)
    .map(([t]) => t)

  if (!attivo && disponibili.length === 0) return null

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap">
      {attivo && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          <Landmark className="h-3 w-3 shrink-0" />
          ritenuta {PERCENTUALE[attivo]} {formatEuro(acconto.ritenuta)} · incassati{' '}
          {formatEuro(nettoIncassato(acconto.importo, acconto.ritenuta))}
        </span>
      )}
      {attivo ? (
        <button
          type="button"
          onClick={() => salva(null)}
          disabled={salvando}
          className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
        >
          togli ritenuta
        </button>
      ) : (
        disponibili.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => salva(t)}
            disabled={salvando}
            className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
          >
            {COMANDO[t]}
          </button>
        ))
      )}
    </div>
  )
}
