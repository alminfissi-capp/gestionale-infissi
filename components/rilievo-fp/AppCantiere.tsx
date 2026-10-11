'use client'

import { useEffect, useState } from 'react'
import { useCatalogoLocale } from '@/hooks/useCatalogoLocale'
import { useInvioRilievi } from '@/hooks/useInvioRilievi'
import ElencoRilievi from './ElencoRilievi'
import ProntoOffline from './ProntoOffline'
import SchedaRilievo from './SchedaRilievo'
import StatoSync from './StatoSync'
import WizardVoce from './WizardVoce'

type Vista = { tipo: 'elenco' } | { tipo: 'rilievo'; id: string } | { tipo: 'voce'; rilievoId: string; voceId: string | null }

export default function AppCantiere() {
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const catalogo = useCatalogoLocale()
  const invio = useInvioRilievi()

  useEffect(() => {
    window.history.replaceState({ vista: { tipo: 'elenco' } }, '')
    const indietro = (e: PopStateEvent) => setVista((e.state?.vista as Vista | undefined) ?? { tipo: 'elenco' })
    window.addEventListener('popstate', indietro)
    return () => window.removeEventListener('popstate', indietro)
  }, [])

  const vai = (v: Vista) => {
    window.history.pushState({ vista: v }, '')
    setVista(v)
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <ProntoOffline catalogoPronto={catalogo.stato.ultimo !== null} onScaricaCatalogo={catalogo.aggiorna} />
      <StatoSync catalogo={catalogo} invio={invio} />
      {vista.tipo === 'elenco' && <ElencoRilievi onApri={id => vai({ tipo: 'rilievo', id })} />}
      {vista.tipo === 'rilievo' && (
        <SchedaRilievo id={vista.id} onIndietro={() => window.history.back()} onVoce={voceId => vai({ tipo: 'voce', rilievoId: vista.id, voceId })} />
      )}
      {vista.tipo === 'voce' && (
        <WizardVoce key={vista.voceId ?? 'nuova'} rilievoId={vista.rilievoId} voceId={vista.voceId} onFine={() => window.history.back()} />
      )}
    </div>
  )
}
