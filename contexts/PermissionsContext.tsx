'use client'

import { createContext, useContext } from 'react'
import type { ModuloApp, PermessiUtente } from '@/types/permessi'
import { PERMESSI_ADMIN, PERMESSI_VUOTI } from '@/types/permessi'

interface PermissionsContextValue {
  permessi: PermessiUtente
  isAdmin: boolean
  canView: (modulo: ModuloApp) => boolean
  canEdit: (modulo: ModuloApp) => boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permessi: PERMESSI_VUOTI,
  isAdmin: false,
  canView: () => false,
  canEdit: () => false,
})

export function PermissionsProvider({
  children,
  permessi,
  isAdmin,
}: {
  children: React.ReactNode
  permessi: PermessiUtente
  isAdmin: boolean
}) {
  return (
    <PermissionsContext.Provider
      value={{
        permessi,
        isAdmin,
        canView: (m) => isAdmin || permessi[m] !== 'nessuno',
        canEdit: (m) => isAdmin || permessi[m] === 'scrittura',
      }}
    >
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

export { PERMESSI_ADMIN }
