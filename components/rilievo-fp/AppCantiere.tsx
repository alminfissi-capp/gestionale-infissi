'use client'

import { useEffect, useState } from 'react'
import { useCatalogoLocale } from '@/hooks/useCatalogoLocale'
import { useInvioRilievi } from '@/hooks/useInvioRilievi'
import ElencoRilievi from './ElencoRilievi'
import ProntoOffline from './ProntoOffline'
import RiepilogoRilievo from './RiepilogoRilievo'
import SchedaRilievo from './SchedaRilievo'
import StatoSync from './StatoSync'
import SchermataVoce from './SchermataVoce'

import { vistaPrecedente, type VistaCantiere as Vista } from '@/lib/fppro/cantiere-elenco'

export default function AppCantiere() {
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const catalogo = useCatalogoLocale()
  const invio = useInvioRilievi()

  // Indietro (tasto del telefono, o Salva/Indietro nelle viste) = vista precedente nella gerarchia
  // elenco > rilievo > voce/riepilogo. Non si legge history.state: Next.js lo riscrive, e da una
  // voce salvata si finiva sull'elenco dei rilievi invece che nel rilievo.
  useEffect(() => {
    const indietro = () => setVista(v => vistaPrecedente(v))
    window.addEventListener('popstate', indietro)
    return () => window.removeEventListener('popstate', indietro)
  }, [])

  const vai = (v: Vista) => {
    // Lo stato di Next.js resta com'e': si aggiunge solo una voce alla cronologia.
    window.history.pushState(window.history.state, '')
    setVista(v)
  }

  return (
    // La voce e' una schermata larga (disegno + pannelli): il resto resta stretto.
    <div className={`mx-auto space-y-3 p-3 ${vista.tipo === 'voce' ? 'max-w-7xl' : vista.tipo === 'elenco' ? 'max-w-xl' : 'max-w-4xl'} print:max-w-none print:p-0`}>
      <div className="space-y-3 print:hidden">
        <ProntoOffline catalogoPronto={catalogo.stato.ultimo !== null} onScaricaCatalogo={catalogo.aggiorna} />
        <StatoSync catalogo={catalogo} invio={invio} />
      </div>
      {vista.tipo === 'elenco' && <ElencoRilievi onApri={id => vai({ tipo: 'rilievo', id })} />}
      {vista.tipo === 'rilievo' && (
        <SchedaRilievo id={vista.id} onIndietro={() => window.history.back()} onVoce={voceId => vai({ tipo: 'voce', rilievoId: vista.id, voceId })}
          onRiepilogo={() => vai({ tipo: 'riepilogo', id: vista.id })} />
      )}
      {vista.tipo === 'riepilogo' && <RiepilogoRilievo id={vista.id} onIndietro={() => window.history.back()} />}
      {vista.tipo === 'voce' && (
        <SchermataVoce key={vista.voceId ?? 'nuova'} rilievoId={vista.rilievoId} voceId={vista.voceId} onFine={() => window.history.back()} />
      )}
    </div>
  )
}
