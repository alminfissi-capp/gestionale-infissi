import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, NetworkOnly } from 'serwist'
import { defaultCache } from '@serwist/next/worker'
import { db } from '@/lib/db'

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Il worker nuovo resta in attesa finché l'utente non preme "Aggiorna":
  // subentrare da soli ricaricherebbe la pagina sotto le mani di chi sta
  // compilando un preventivo o caricando un file.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Le pagine HTML (navigate) non vengono mai messe in cache — sempre dati freschi dal server
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

// Sblocca il worker in attesa quando la pagina lo chiede (pulsante "Aggiorna"
// in ServiceWorkerRegistration). Subito dopo il browser emette controllerchange
// e la pagina si ricarica sulla versione nuova.
//
// Con `skipWaiting: false` Serwist ne registra già uno equivalente: questo è
// una rete, perché se un aggiornamento della libreria lo togliesse, il pulsante
// smetterebbe di funzionare senza che nulla lo segnali. Chiamare skipWaiting()
// due volte non ha effetti collaterali.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/**
 * Condivisione da Android: il foglio di condivisione fa un POST multipart verso
 * `/condividi/ricevi`. Lo intercettiamo qui e mettiamo il file in IndexedDB,
 * cosi' non attraversa il server finche' non si sa dove va, e sopravvive a un
 * login intermedio se la sessione era scaduta.
 *
 * Questo listener va registrato PRIMA di `serwist.addEventListeners()`: la
 * regola `NetworkOnly` sulle navigazioni intercetterebbe altrimenti il POST e
 * lo manderebbe al server, dove finirebbe sul route di ripiego.
 */
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/condividi/ricevi') return

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('file')
        if (file instanceof File && file.size > 0) {
          // Una condivisione per volta: senza questo si accumulerebbero file
          // dimenticati che occupano spazio sul tablet.
          await db.condivisioni.clear()
          await db.condivisioni.add({
            nome: file.name || 'documento',
            tipo: file.type,
            blob: file,
            createdAt: new Date().toISOString(),
          })
        }
        return Response.redirect('/condividi', 303)
      } catch {
        return Response.redirect('/condividi?errore=lettura', 303)
      }
    })(),
  )
})

serwist.addEventListeners()
