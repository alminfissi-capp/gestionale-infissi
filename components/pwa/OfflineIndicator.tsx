'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { db } from '@/lib/db'

export default function OfflineIndicator() {
  const { isOnline } = useOnlineStatus()
  const pendingCount = useLiveQuery(() => db.pendingPreventivi.count(), []) ?? 0

  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Offline
      </span>
    )
  }

  if (pendingCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        Sincronizzazione…
      </span>
    )
  }

  return null
}
