'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { getClienti } from '@/actions/clienti'
import { getCategorie } from '@/actions/listini'
import { createPreventivo } from '@/actions/preventivi'
import { getAllCommesse, createCommessa, addAcconto } from '@/actions/commesse'

export default function DataSync() {
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

  return null
}
