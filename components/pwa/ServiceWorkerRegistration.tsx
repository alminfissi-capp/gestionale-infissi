'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Registra il service worker e avvisa quando esce una versione nuova.
 *
 * Senza questo, il browser continua a servire il JavaScript in cache: dopo un
 * rilascio l'app resta indietro finché non si svuota la cache a mano, e le
 * modifiche sembrano non essere mai arrivate.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return

    // Il worker nuovo prende il controllo solo dopo lo SKIP_WAITING che manda
    // il pulsante qui sotto: a quel punto la pagina va ricaricata per allineare
    // il codice a quello che il worker sta già servendo.
    let ricaricando = false
    const alCambioControllo = () => {
      if (ricaricando) return
      ricaricando = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', alCambioControllo)

    const avvisa = (worker: ServiceWorker) => {
      toast('Nuova versione disponibile', {
        description: 'Ricarica per aggiornare il gestionale.',
        duration: Infinity,
        action: {
          label: 'Aggiorna',
          onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        },
      })
    }

    let registrazione: Awaited<ReturnType<typeof navigator.serviceWorker.register>> | null = null

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registrazione = reg

        // `controller` assente = prima installazione: non c'è nulla da aggiornare
        // e l'avviso confonderebbe soltanto.
        if (reg.waiting && navigator.serviceWorker.controller) avvisa(reg.waiting)

        reg.addEventListener('updatefound', () => {
          const nuovo = reg.installing
          if (!nuovo) return
          nuovo.addEventListener('statechange', () => {
            if (nuovo.state === 'installed' && navigator.serviceWorker.controller) {
              avvisa(nuovo)
            }
          })
        })
      })
      .catch((err) => console.error('SW registration failed:', err))

    // Il browser ricontrolla /sw.js a ogni navigazione, ma un gestionale resta
    // aperto per ore sulla stessa scheda: senza questo, un rilascio del mattino
    // verrebbe visto solo il giorno dopo.
    const cercaAggiornamenti = () => {
      if (document.visibilityState !== 'visible') return
      registrazione?.update().catch(() => {
        // Offline o rete instabile: si riprova al controllo successivo.
      })
    }
    const timer = setInterval(cercaAggiornamenti, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', cercaAggiornamenti)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', cercaAggiornamenti)
      navigator.serviceWorker.removeEventListener('controllerchange', alCambioControllo)
    }
  }, [])

  return null
}
