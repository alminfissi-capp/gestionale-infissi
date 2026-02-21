'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  PlusCircle,
  ClipboardList,
  Users,
  BookOpen,
  Database,
  Settings,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { href: '/preventivi/nuovo', label: 'Nuovo Preventivo', icon: PlusCircle },
  { href: '/preventivi', label: 'Preventivi Salvati', icon: ClipboardList },
  { href: '/clienti', label: 'Gestione Clienti', icon: Users },
  { href: '/listini', label: 'Gestione Listini', icon: BookOpen },
  { href: '/import-export', label: 'Import / Export', icon: Database },
  { href: '/impostazioni', label: 'Impostazioni', icon: Settings },
]

interface Props {
  logoUrl: string | null
  denominazione: string | null
}

export default function Sidebar({ logoUrl, denominazione }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo / Header */}
      <div className="p-5 border-b border-gray-200">
        {logoUrl ? (
          <div className="relative h-12 w-full mb-2">
            <Image src={logoUrl} alt="Logo" fill className="object-contain object-left" />
          </div>
        ) : null}
        <p className="text-base font-bold text-gray-900 truncate">
          {denominazione || 'A.L.M. Infissi'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">Gestionale</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/preventivi'
              ? pathname === '/preventivi'
              : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-gray-600"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Esci
        </Button>
      </div>
    </aside>
  )
}
