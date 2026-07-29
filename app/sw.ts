import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, NetworkOnly } from 'serwist'
import { defaultCache } from '@serwist/next/worker'

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

serwist.addEventListeners()
