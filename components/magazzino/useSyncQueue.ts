'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type SyncStatus =
  | 'pending' | 'processing' | 'done' | 'no_price' | 'not_found' | 'error' | 'timeout'

export type QueueItem = { codice: string; reparto?: number | null }

type QueueRow = {
  codice: string
  status: SyncStatus
  prezzo: number | null
}

const BATCH_SIZE     = 10
const STALE_MS       = 20_000   // se il heartbeat è più vecchio, il processore è considerato morto
const HEARTBEAT_MS   = 5_000

// id univoco per questo tab (sopravvive ai re-render, non ai reload — ok)
function makeClientId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function useSyncQueue(orgId: string, onJobComplete: () => void) {
  const supabase = useRef(createClient()).current
  const clientId = useRef(makeClientId()).current

  const [rows, setRows]   = useState<Record<string, QueueRow>>({})
  const isOwner           = useRef(false)
  const heartbeatTimer    = useRef<ReturnType<typeof setInterval> | null>(null)
  const processing        = useRef(false)

  const rowsArr     = Object.values(rows)
  const total       = rowsArr.length
  const completed   = rowsArr.filter(r => r.status !== 'pending' && r.status !== 'processing').length
  const pendingCount = rowsArr.filter(r => r.status === 'pending').length
  const active      = total > 0 && completed < total

  // ─── Caricamento iniziale + Realtime ──────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function loadInitial() {
      const { data } = await supabase
        .from('catalogo_sync_queue')
        .select('codice, status, prezzo')
        .eq('organization_id', orgId)
      if (!mounted || !data) return
      const map: Record<string, QueueRow> = {}
      for (const r of data) map[r.codice] = r as QueueRow
      setRows(map)
      // Se ci sono pendenti e nessuno li sta processando → adotta il job
      maybeAdopt(data.filter((r) => r.status === 'pending').length > 0)
    }

    loadInitial()

    const channel = supabase
      .channel(`sync-queue-${orgId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'catalogo_sync_queue', filter: `organization_id=eq.${orgId}` },
        (payload) => {
          setRows(prev => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as QueueRow
              if (old?.codice) delete next[old.codice]
            } else {
              const r = payload.new as QueueRow
              next[r.codice] = { codice: r.codice, status: r.status, prezzo: r.prezzo }
            }
            return next
          })
        })
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel); stopHeartbeat() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  // Quando il job finisce (era attivo, ora completo) → notifica il parent per refresh
  const wasActive = useRef(false)
  useEffect(() => {
    if (active) wasActive.current = true
    else if (wasActive.current && total > 0) {
      wasActive.current = false
      stopHeartbeat()
      isOwner.current = false
      onJobComplete()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, total])

  // ─── Lock / heartbeat ──────────────────────────────────────────────────────
  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer.current = setInterval(async () => {
      await supabase.from('catalogo_sync_state')
        .update({ heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('owner_id', clientId)
    }, HEARTBEAT_MS)
  }
  function stopHeartbeat() {
    if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null }
  }

  // Prova ad acquisire il lock se ci sono pendenti e nessuno è attivo
  async function maybeAdopt(hasPending: boolean) {
    if (!hasPending || processing.current) return
    const stale = new Date(Date.now() - STALE_MS).toISOString()
    // crea la riga di stato se non esiste
    await supabase.from('catalogo_sync_state')
      .upsert({ organization_id: orgId }, { onConflict: 'organization_id', ignoreDuplicates: true })
    const { data } = await supabase.from('catalogo_sync_state')
      .update({ owner_id: clientId, heartbeat: new Date().toISOString() })
      .eq('organization_id', orgId)
      .or(`heartbeat.is.null,heartbeat.lt.${stale}`)
      .select()
    if (data && data.length > 0) {
      isOwner.current = true
      startHeartbeat()
      runProcessor()
    }
  }

  // ─── Processore (gira solo nel tab owner) ─────────────────────────────────
  const runProcessor = useCallback(async () => {
    if (processing.current) return
    processing.current = true
    try {
      while (true) {
        const { data: pend } = await supabase
          .from('catalogo_sync_queue')
          .select('codice, reparto')
          .eq('organization_id', orgId)
          .eq('status', 'pending')
          .limit(BATCH_SIZE)
        if (!pend || pend.length === 0) break

        const items = pend.map(p => ({ codice: p.codice, reparto: p.reparto }))
        const res = await fetch('/api/sync-prezzi', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ items }),
        })
        if (!res.body) break
        // Consuma lo stream — gli aggiornamenti reali arrivano via Realtime,
        // qui aspettiamo solo che il batch finisca.
        const reader = res.body.getReader()
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }
    } finally {
      processing.current = false
      // libera il lock
      await supabase.from('catalogo_sync_state')
        .update({ heartbeat: null, owner_id: null })
        .eq('organization_id', orgId)
        .eq('owner_id', clientId)
      stopHeartbeat()
      isOwner.current = false
    }
  }, [orgId, supabase])

  // ─── API pubblica ──────────────────────────────────────────────────────────
  const enqueue = useCallback(async (items: QueueItem[]) => {
    // Pulisce il job precedente e inserisce i nuovi pendenti
    await supabase.from('catalogo_sync_queue').delete().eq('organization_id', orgId)
    const rowsToInsert = items.map(i => ({
      organization_id: orgId,
      codice:  i.codice,
      reparto: i.reparto ?? null,
      status:  'pending',
    }))
    // ottimistico locale
    setRows(Object.fromEntries(items.map(i => [i.codice, { codice: i.codice, status: 'pending' as SyncStatus, prezzo: null }])))
    await supabase.from('catalogo_sync_queue').insert(rowsToInsert)

    // diventa owner e avvia
    await supabase.from('catalogo_sync_state')
      .upsert({ organization_id: orgId, owner_id: clientId, heartbeat: new Date().toISOString() },
              { onConflict: 'organization_id' })
    isOwner.current = true
    startHeartbeat()
    runProcessor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, supabase, runProcessor])

  const clear = useCallback(async () => {
    await supabase.from('catalogo_sync_queue').delete().eq('organization_id', orgId)
    setRows({})
  }, [orgId, supabase])

  return {
    queueStatus: Object.fromEntries(rowsArr.map(r => [r.codice, r.status])) as Record<string, SyncStatus>,
    livePrezzi:  Object.fromEntries(rowsArr.filter(r => r.prezzo != null).map(r => [r.codice, r.prezzo!])) as Record<string, number>,
    total, completed, pendingCount, active,
    enqueue, clear,
  }
}
