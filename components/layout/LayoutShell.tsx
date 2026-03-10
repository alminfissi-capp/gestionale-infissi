'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import DataSync from '@/components/pwa/DataSync'
import OfflineIndicator from '@/components/pwa/OfflineIndicator'

interface Props {
  children: React.ReactNode
  logoUrl: string | null
  denominazione: string | null
}

export default function LayoutShell({ children, logoUrl, denominazione }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Chiudi il menu mobile ad ogni cambio di rotta
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Overlay scuro per mobile */}
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
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden print:ml-0">
        {/* Top bar mobile */}
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

        <main className="flex-1 overflow-auto">
          <div className="p-2 sm:p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
