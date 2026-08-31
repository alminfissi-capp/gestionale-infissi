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

  const [rows, setRows]     = useState<Record<string, QueueRow>>({})
  const [amIOwner, setAmIOwner] = useState(false)
  const isOwner             = useRef(false)
  const cancelRef           = useRef(false)
  const heartbeatTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const processing          = useRef(false)

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
      setAmIOwner(false)
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
      cancelRef.current = false
      isOwner.current = true
      setAmIOwner(true)
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
        if (cancelRef.current) break
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
      cancelRef.current = false
      await supabase.from('catalogo_sync_state')
        .update({ heartbeat: null, owner_id: null })
        .eq('organization_id', orgId)
        .eq('owner_id', clientId)
      stopHeartbeat()
      isOwner.current = false
      setAmIOwner(false)
    }
  }, [orgId, supabase, clientId])

  // ─── API pubblica ──────────────────────────────────────────────────────────
  const enqueue = useCallback(async (items: QueueItem[]) => {
    const rowsToInsert = items.map(i => ({
      organization_id: orgId,
      codice:  i.codice,
      reparto: i.reparto ?? null,
      status:  'pending',
    }))

    // Controlla se c'è già un processore attivo di un altro tab/utente
    const stale = new Date(Date.now() - STALE_MS).toISOString()
    const { data: lockData } = await supabase
      .from('catalogo_sync_state')
      .select('owner_id, heartbeat')
      .eq('organization_id', orgId)
      .maybeSingle()

    const lockActive = lockData?.heartbeat && lockData.heartbeat > stale
    const lockIsOurs = lockData?.owner_id === clientId

    if (lockActive && !lockIsOurs) {
      // Un altro processore è attivo: aggiungo solo i nuovi articoli in coda senza
      // cancellare quelli già presenti né rubare il lock. Il processore esistente
      // li raccoglierà al prossimo giro del while loop.
      setRows(prev => {
        const next = { ...prev }
        for (const i of items) next[i.codice] = { codice: i.codice, status: 'pending', prezzo: null }
        return next
      })
      // Inserisce solo articoli che non sono già in coda (evita duplicati)
      await supabase.from('catalogo_sync_queue')
        .upsert(rowsToInsert, { onConflict: 'organization_id,codice', ignoreDuplicates: true })
      return
    }

    // Nessun processore attivo (o siamo già noi): reset coda e avvia
    await supabase.from('catalogo_sync_queue').delete().eq('organization_id', orgId)
    setRows(Object.fromEntries(items.map(i => [i.codice, { codice: i.codice, status: 'pending' as SyncStatus, prezzo: null }])))
    await supabase.from('catalogo_sync_queue').insert(rowsToInsert)

    await supabase.from('catalogo_sync_state')
      .upsert({ organization_id: orgId, owner_id: clientId, heartbeat: new Date().toISOString() },
              { onConflict: 'organization_id' })
    cancelRef.current = false
    isOwner.current = true
    setAmIOwner(true)
    startHeartbeat()
    runProcessor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, supabase, runProcessor])

  const clear = useCallback(async () => {
    await supabase.from('catalogo_sync_queue').delete().eq('organization_id', orgId)
    setRows({})
  }, [orgId, supabase])

  // Annulla la scansione: interrompe il loop del processore dopo il batch corrente
  // e cancella tutti i pending rimanenti dal DB.
  const cancel = useCallback(async () => {
    if (!isOwner.current) return
    cancelRef.current = true
    await supabase.from('catalogo_sync_queue')
      .delete()
      .eq('organization_id', orgId)
      .eq('status', 'pending')
    await supabase.from('catalogo_sync_state')
      .update({ heartbeat: null, owner_id: null })
      .eq('organization_id', orgId)
      .eq('owner_id', clientId)
    stopHeartbeat()
    isOwner.current = false
    setAmIOwner(false)
    setRows(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { if (next[k].status === 'pending') delete next[k] })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, supabase])

  // Forza reset: usabile da qualsiasi utente dell'org quando il processore
  // sembra bloccato. Cancella TUTTE le righe della coda (non solo pending)
  // e resetta subito lo state locale senza aspettare Realtime.
  const forceReset = useCallback(async () => {
    cancelRef.current = true
    await supabase.from('catalogo_sync_queue')
      .delete()
      .eq('organization_id', orgId)
    await supabase.from('catalogo_sync_state')
      .update({ heartbeat: null, owner_id: null })
      .eq('organization_id', orgId)
    stopHeartbeat()
    isOwner.current = false
    setAmIOwner(false)
    setRows({})  // reset immediato, non aspetta Realtime

  }, [orgId, supabase])

  return {
    queueStatus: Object.fromEntries(rowsArr.map(r => [r.codice, r.status])) as Record<string, SyncStatus>,
    livePrezzi:  Object.fromEntries(rowsArr.filter(r => r.prezzo != null).map(r => [r.codice, r.prezzo!])) as Record<string, number>,
    total, completed, pendingCount, active,
    amIOwner,
    enqueue, cancel, forceReset, clear,
  }
}
