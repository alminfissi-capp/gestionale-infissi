'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { getClienti } from '@/actions/clienti'
import { getCategorie } from '@/actions/listini'
import { createPreventivo } from '@/actions/preventivi'

export default function DataSync() {
  // Sync clienti e listini all'avvio (se online)
  useEffect(() => {
    if (!navigator.onLine) return

    async function syncData() {
      try {
        const [clienti, categorie] = await Promise.all([getClienti(), getCategorie()])
        await db.clienti.bulkPut(clienti)
        await db.listiniData.bulkPut(categorie)
      } catch {
        // Silenzioso: il sync dei dati di riferimento è best-effort
      }
    }

    syncData()
  }, [])

  // Svuota la coda dei preventivi pending al ritorno online
  useEffect(() => {
    async function flushPending() {
      const pending = await db.pendingPreventivi.toArray()
      if (pending.length === 0) return

      let synced = 0
      for (const item of pending) {
        try {
          await createPreventivo(item.input)
          await db.pendingPreventivi.delete(item.tempId!)
          synced++
        } catch {
          // Lascia in coda, riproverà al prossimo evento online
        }
      }

      if (synced > 0) {
        toast.success(
          synced === 1
            ? '1 preventivo sincronizzato'
            : `${synced} preventivi sincronizzati`
        )
      }
    }

    window.addEventListener('online', flushPending)
    return () => window.removeEventListener('online', flushPending)
  }, [])

  return null
}
