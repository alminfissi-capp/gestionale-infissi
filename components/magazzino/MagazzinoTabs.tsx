'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tag, Package, Warehouse, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/magazzino/categorie', label: 'Categorie', icon: Tag },
  { href: '/magazzino/prodotti', label: 'Prodotti', icon: Package },
  { href: '/magazzino/scorte', label: 'Magazzino', icon: Warehouse },
  { href: '/magazzino/impostazioni', label: 'Impostazioni', icon: Settings2 },
]

export default function MagazzinoTabs() {
  const pathname = usePathname()

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href) ||
            (href === '/magazzino/impostazioni' && pathname.startsWith('/magazzino/fornitori'))

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
