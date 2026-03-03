'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  Users,
  BookOpen,
  Database,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
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
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({
  logoUrl,
  denominazione,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = (denominazione || 'A').charAt(0).toUpperCase()

  return (
    <aside
      className={cn(
        // Mobile: fixed drawer che scorre da sinistra
        'fixed inset-y-0 left-0 z-30 flex flex-col bg-white border-r border-gray-200',
        'transition-all duration-300 ease-in-out',
        // Stato mobile: aperto / chiuso
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: posizione relativa nel flusso, translate azzerato
        'lg:relative lg:translate-x-0 lg:z-auto lg:shrink-0',
        // Larghezza: 64 su desktop collassato, 256 altrimenti
        'w-64',
        collapsed && 'lg:w-16',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'relative flex items-center border-b border-gray-200 shrink-0 p-4',
          collapsed && 'lg:justify-center lg:p-3',
        )}
      >
        {/* Pulsante chiudi — solo mobile */}
        <button
          className="lg:hidden absolute top-3 right-3 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 active:bg-gray-200"
          onClick={onMobileClose}
          aria-label="Chiudi menu"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Avatar iniziale — solo desktop collassato */}
        <div
          className={cn(
            'hidden h-8 w-8 rounded-md bg-blue-600 items-center justify-center shrink-0',
            collapsed && 'lg:flex',
          )}
        >
          <span className="text-white text-xs font-bold">{initial}</span>
        </div>

        {/* Logo + nome — desktop espanso e mobile */}
        <div className={cn('flex flex-col flex-1 min-w-0', collapsed && 'lg:hidden')}>
          {logoUrl ? (
            <div className="relative h-10 w-full mb-2">
              <Image src={logoUrl} alt="Logo" fill className="object-contain object-left" />
            </div>
          ) : null}
          <p className="text-sm font-bold text-gray-900 truncate">
            {denominazione || 'A.L.M. Infissi'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Gestionale</p>
        </div>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' || href === '/preventivi'
              ? pathname === href
              : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md text-sm font-medium transition-colors py-2.5 px-3',
                collapsed && 'lg:justify-center lg:px-0',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer: logout + toggle collapse */}
      <div className="p-2 border-t border-gray-200 space-y-0.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? 'Esci' : undefined}
          className={cn(
            'w-full gap-3 text-gray-600 hover:text-gray-900 justify-start px-3',
            collapsed && 'lg:justify-center lg:px-0',
          )}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={cn(collapsed && 'lg:hidden')}>Esci</span>
        </Button>

        {/* Toggle collapse — solo desktop */}
        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          className={cn(
            'hidden lg:flex w-full gap-3 text-gray-400 hover:text-gray-600 justify-start px-3',
            collapsed && 'justify-center px-0',
          )}
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Comprimi menu</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
