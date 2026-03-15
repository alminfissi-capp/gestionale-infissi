'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function VaniRilievo() {
  const [vani, setVani] = useState<string[]>([])

  const aggiungiVano = () => {
    setVani((prev) => [...prev, `Vano ${prev.length + 1}`])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">

      {/* Header */}
      <div className="p-4 border-b bg-white">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/rilievo/nuovo">
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Link>
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Vani del cantiere</h1>
        <p className="text-sm text-gray-500 mt-0.5">Aggiungi i vani da rilevare</p>
      </div>

      {/* Contenuto */}
      <div className="flex-1 overflow-y-auto p-4">
        {vani.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
            <p className="text-sm">Nessun vano aggiunto.</p>
            <p className="text-xs mt-1">Usa il tasto <strong>+</strong> in basso per iniziare.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {vani.map((v, i) => (
              <li
                key={i}
                className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm"
              >
                {v}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Barra inferiore */}
      <div className="shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-3 flex items-center justify-center">
        <button
          onClick={aggiungiVano}
          className="flex items-center justify-center w-12 h-12 rounded-xl border-2 border-gray-400 bg-white text-gray-600 hover:border-teal-500 hover:text-teal-600 hover:bg-teal-50 active:scale-95 transition-all shadow-sm"
          title="Aggiungi vano"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      </div>

    </div>
  )
}
