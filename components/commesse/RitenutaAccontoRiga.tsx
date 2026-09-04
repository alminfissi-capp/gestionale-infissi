'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark } from 'lucide-react'
import { formatEuro } from '@/lib/pricing'
import { calcolaRitenuta, nettoIncassato } from '@/lib/ritenuta-acconto'
import { updateAccontoRitenuta } from '@/actions/commesse'
import type { AccontoCommessa } from '@/types/commessa'

interface Props {
  acconto: AccontoCommessa
  /** Spento sulle commesse di clienti azienda; il testo dice il perche'. */
  motivoDisabilitata?: string | null
}

/**
 * Riga di dettaglio della ritenuta sotto un acconto gia' registrato, e comando
 * per marcarla. Serve soprattutto ai pagamenti inseriti prima che la funzione
 * esistesse: senza, resterebbero per sempre al lordo nel flusso di cassa.
 */
export default function RitenutaAccontoRiga({ acconto, motivoDisabilitata }: Props) {
  const router = useRouter()
  const [salvando, setSalvando] = useState(false)
  const attiva = (acconto.ritenuta ?? 0) > 0

  const alterna = async () => {
    setSalvando(true)
    try {
      await updateAccontoRitenuta(acconto.id, attiva ? 0 : calcolaRitenuta(acconto.importo))
      toast.success(attiva ? 'Ritenuta rimossa' : 'Ritenuta registrata')
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSalvando(false)
    }
  }

  if (!attiva && motivoDisabilitata) return null

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap">
      {attiva && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          <Landmark className="h-3 w-3 shrink-0" />
          ritenuta {formatEuro(acconto.ritenuta)} · incassati {formatEuro(nettoIncassato(acconto.importo, acconto.ritenuta))}
        </span>
      )}
      <button
        type="button"
        onClick={alterna}
        disabled={salvando}
        className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
      >
        {attiva ? 'togli ritenuta' : 'Bonifico per detrazioni fiscali'}
      </button>
    </div>
  )
}
