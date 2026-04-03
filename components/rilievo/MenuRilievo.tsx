'use client'

import Link from 'next/link'
import { PlusCircle, Database, Zap } from 'lucide-react'

const VOCI = [
  {
    href: '/rilievo/veloce',
    icon: Zap,
    titolo: 'Rilievo veloce',
    descrizione: 'Rileva rapidamente misure e specifiche dei serramenti',
    color: 'text-orange-600',
    bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
  },
  {
    href: '/rilievo/nuovo',
    icon: PlusCircle,
    titolo: 'Nuovo rilievo grafico',
    descrizione: 'Avvia un nuovo rilievo misure con disegno cantiere',
    color: 'text-teal-600',
    bg: 'bg-teal-50 hover:bg-teal-100 border-teal-200',
  },
  {
    href: '/rilievo/impostazioni',
    icon: Database,
    titolo: 'Database e impostazioni',
    descrizione: 'Configura tipologie di infissi, materiali e valori predefiniti',
    color: 'text-gray-600',
    bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
  },
]

export default function MenuRilievo() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Rilievo misure cantiere</h1>
      <p className="text-sm text-gray-500 mb-8">Seleziona un&apos;operazione</p>

      <div className="flex flex-col gap-4">
        {VOCI.map(({ href, icon: Icon, titolo, descrizione, color, bg }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-5 rounded-xl border p-5 transition-colors ${bg}`}
          >
            <div className={`shrink-0 ${color}`}>
              <Icon className="h-8 w-8" />
            </div>
            <div>
              <p className={`text-base font-semibold ${color}`}>{titolo}</p>
              <p className="text-sm text-gray-500 mt-0.5">{descrizione}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
