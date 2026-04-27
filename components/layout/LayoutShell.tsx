'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import dynamic from 'next/dynamic'
import Sidebar from './Sidebar'
import { PermissionsProvider } from '@/contexts/PermissionsContext'
import type { PermessiUtente } from '@/types/permessi'

const DataSync = dynamic(() => import('@/components/pwa/DataSync'), { ssr: false })
const OfflineIndicator = dynamic(() => import('@/components/pwa/OfflineIndicator'), { ssr: false })

interface Props {
  children: React.ReactNode
  logoUrl: string | null
  denominazione: string | null
  permessi: PermessiUtente
  isAdmin: boolean
}

export default function LayoutShell({ children, logoUrl, denominazione, permessi, isAdmin }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    const handler = () => setCollapsed(true)
    window.addEventListener('layout:sidebar-collapse', handler)
    return () => window.removeEventListener('layout:sidebar-collapse', handler)
  }, [])

  return (
    <PermissionsProvider permessi={permessi} isAdmin={isAdmin}>
      <div className="flex min-h-screen bg-gray-50">
        <div
          className={`fixed inset-0 z-20 bg-black/50 transition-opacity duration-300 lg:hidden print:hidden ${
            mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setMobileOpen(false)}
        />

        <div className="print:hidden">
          <Sidebar
            logoUrl={logoUrl}
            denominazione={denominazione}
            permessi={permessi}
            isAdmin={isAdmin}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden print:ml-0">
          <header className="lg:hidden print:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 active:bg-gray-200"
              aria-label="Apri menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-gray-900 truncate flex-1">
              {denominazione || 'A.L.M. Infissi'}
            </span>
            <OfflineIndicator />
          </header>
          <DataSync />

          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-2 sm:p-4 lg:p-6">{children}</div>
          </main>
        </div>
      </div>
    </PermissionsProvider>
  )
}
