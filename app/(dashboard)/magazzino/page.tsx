import Link from 'next/link'
import { Users, Package, ArrowDownUp, BarChart3, Tag } from 'lucide-react'

const SEZIONI = [
  { href: '/magazzino/categorie', icon: Tag, titolo: 'Categorie', desc: 'Tipi di materiale (alluminio, ferro…)' },
  { href: '/magazzino/fornitori', icon: Users, titolo: 'Fornitori', desc: 'Anagrafica fornitori e contatti' },
  { href: '/magazzino/prodotti', icon: Package, titolo: 'Prodotti', desc: 'Anagrafica prodotti e varianti colore' },
  { href: '/magazzino/movimenti', icon: ArrowDownUp, titolo: 'Movimenti', desc: 'Carichi, scarichi e storico' },
  { href: '/magazzino/giacenze', icon: BarChart3, titolo: 'Giacenze', desc: 'Disponibilità e alert scorte' },
]

export default function MagazzinoPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">Gestione scorte, movimenti e anagrafica prodotti</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {SEZIONI.map(({ href, icon: Icon, titolo, desc }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          >
            <Icon className="h-8 w-8 text-blue-600 mb-3" />
            <p className="font-semibold text-gray-900 group-hover:text-blue-700">{titolo}</p>
            <p className="text-xs text-gray-500 mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
