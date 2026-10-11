'use client'

import { useEffect, useState } from 'react'

const PAGINA_CANTIERE = '/rilievo/cantiere'

export default function OfflinePage() {
  const [vaiAlCantiere, setVaiAlCantiere] = useState(false)

  // Senza rete si va dritti al rilievo in cantiere, se il telefono l'ha salvato
  // (altrimenti si resterebbe qui: il service worker non avrebbe nulla da mostrare).
  useEffect(() => {
    if (typeof caches === 'undefined') return
    caches.open('pagina-cantiere')
      .then(c => c.match(PAGINA_CANTIERE))
      .then(r => {
        if (!r) return
        setVaiAlCantiere(true)
        window.location.replace(PAGINA_CANTIERE)
      })
      .catch(() => {})
  }, [])

  if (vaiAlCantiere) {
    return <p className="p-8 text-center text-muted-foreground">Apro il rilievo in cantiere…</p>
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-muted p-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 13a10 10 0 0 1 5.24-2.76" />
            <circle cx="12" cy="20" r="1" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nessuna connessione</h1>
          <p className="mt-2 text-muted-foreground">
            Non è possibile caricare questa pagina senza connessione a Internet.
          </p>
        </div>
      </div>
      {/* Navigazione piena (non Link): la pagina del cantiere la serve il service worker dalla cache. */}
      <a
        href="/rilievo/cantiere"
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        Apri il rilievo in cantiere (funziona senza rete)
      </a>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Riprova
      </button>
    </div>
  )
}
