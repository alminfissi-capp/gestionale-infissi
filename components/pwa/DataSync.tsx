'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { getClienti } from '@/actions/clienti'
import { getCategorie } from '@/actions/listini'
import { createPreventivo } from '@/actions/preventivi'
import { getAllCommesse, createCommessa, addAcconto } from '@/actions/commesse'

export default function DataSync() {
  const pathname = usePathname()
  // Un file condiviso rimasto in sospeso: succede se al momento della
  // condivisione la sessione era scaduta e il login ha riportato alla home,
  // lasciando il file nel database locale senza che nulla lo dica.
  const inSospeso = useLiveQuery(() => db.condivisioni.count(), [])
  const mostraAvviso = (inSospeso ?? 0) > 0 && pathname !== '/condividi'

  // Sync dati di riferimento all'avvio (se online)
  useEffect(() => {
    if (!navigator.onLine) return

    async function syncData() {
      try {
        const [clienti, categorie, commesse] = await Promise.all([
          getClienti(),
          getCategorie(),
          getAllCommesse(),
        ])
        await db.clienti.bulkPut(clienti)
        await db.listiniData.bulkPut(categorie)
        await db.commesse.bulkPut(commesse)
      } catch {
        // Silenzioso: il sync è best-effort
      }
    }

    syncData()
  }, [])

  // Flush coda preventivi pending
  useEffect(() => {
    async function flushPreventivi() {
      const pending = await db.pendingPreventivi.toArray()
      if (pending.length === 0) return

      let synced = 0
      for (const item of pending) {
        try {
          await createPreventivo(item.input)
          await db.pendingPreventivi.delete(item.tempId!)
          synced++
        } catch {
          // Lascia in coda
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

    if (navigator.onLine) flushPreventivi()
    window.addEventListener('online', flushPreventivi)
    return () => window.removeEventListener('online', flushPreventivi)
  }, [])

  // Flush coda commesse pending
  useEffect(() => {
    async function flushCommesse() {
      const pending = await db.pendingCommesse.toArray()
      if (pending.length === 0) return

      let synced = 0
      for (const item of pending) {
        try {
          await createCommessa(item.input)
          await db.pendingCommesse.delete(item.tempId!)
          synced++
        } catch {
          // Lascia in coda
        }
      }

      if (synced > 0) {
        toast.success(
          synced === 1
            ? '1 commessa sincronizzata'
            : `${synced} commesse sincronizzate`
        )
        // Aggiorna cache IDB con dati freschi
        try {
          const commesse = await getAllCommesse()
          await db.commesse.bulkPut(commesse)
        } catch { /* best-effort */ }
      }
    }

    if (navigator.onLine) flushCommesse()
    window.addEventListener('online', flushCommesse)
    return () => window.removeEventListener('online', flushCommesse)
  }, [])

  // Flush coda acconti pending
  useEffect(() => {
    async function flushAcconti() {
      const pending = await db.pendingAcconti.toArray()
      if (pending.length === 0) return

      let synced = 0
      for (const item of pending) {
        // Salta acconti legati a commesse ancora pending (id temporaneo)
        if (item.commessaId.startsWith('pending-')) continue
        try {
          await addAcconto(item.commessaId, item.input)
          await db.pendingAcconti.delete(item.tempId!)
          synced++
        } catch {
          // Lascia in coda
        }
      }

      if (synced > 0) {
        toast.success(
          synced === 1
            ? '1 acconto sincronizzato'
            : `${synced} acconti sincronizzati`
        )
        try {
          const commesse = await getAllCommesse()
          await db.commesse.bulkPut(commesse)
        } catch { /* best-effort */ }
      }
    }

    if (navigator.onLine) flushAcconti()
    window.addEventListener('online', flushAcconti)
    return () => window.removeEventListener('online', flushAcconti)
  }, [])

  if (!mostraAvviso) return null

  return (
    <Link
      href="/condividi"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      Hai un file condiviso da salvare
    </Link>
  )
}
