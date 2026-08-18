'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Copy, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Error boundary del gruppo (dashboard).
 *
 * Senza, una qualunque eccezione lato client sostituisce l'intera applicazione con
 * "Application error: a client-side exception has occurred", che non dice nulla né
 * all'utente né a chi deve correggere: bisogna aprire la console del browser per
 * sapere cosa è successo. Qui il messaggio resta a schermo e si copia con un tasto,
 * e il resto della navigazione continua a funzionare.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const [copiato, setCopiato] = useState(false)

  useEffect(() => {
    // resta anche nella console, per chi sa aprirla
    console.error('Errore nella dashboard:', error)
  }, [error])

  const dettaglio = [
    `Messaggio: ${error.message || '(nessun messaggio)'}`,
    error.digest ? `Digest: ${error.digest}` : null,
    `Pagina: ${typeof window !== 'undefined' ? window.location.pathname : ''}`,
    error.stack ? `\nStack:\n${error.stack}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(dettaglio)
      setCopiato(true)
      setTimeout(() => setCopiato(false), 2000)
    } catch {
      // clipboard negata: il testo resta comunque selezionabile a schermo
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-2xl rounded-lg border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-red-900">Qualcosa è andato storto in questa pagina</h2>
            <p className="text-sm text-red-800 mt-1">
              Il resto del gestionale continua a funzionare. Se il problema si ripete,
              copia il dettaglio qui sotto e mandalo a chi segue lo sviluppo.
            </p>

            <pre className="mt-3 max-h-60 overflow-auto rounded bg-white/70 border border-red-200 p-3 text-xs text-red-900 whitespace-pre-wrap break-words">
              {dettaglio}
            </pre>

            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Riprova
              </Button>
              <Button size="sm" variant="outline" onClick={copia}>
                {copiato ? (
                  <><Check className="h-3.5 w-3.5 mr-1.5" /> Copiato</>
                ) : (
                  <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copia dettaglio</>
                )}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => router.push('/commesse')}>
                Torna alle commesse
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
