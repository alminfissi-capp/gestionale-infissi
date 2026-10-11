'use client'

// Invio dei rilievi fatti nel telefono e ricezione di quelli fatti altrove.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { getRilieviFp, inviaRilieviFp } from '@/actions/rilievo-fp'
import { inviateConfermate, remotiDaApplicare } from '@/lib/fppro/sync-rilievi'

const OGNI_MS = 60_000
const BLOCCO_VOCI = 100

export function useInvioRilievi() {
  const [errore, setErrore] = useState<string | null>(null)
  const inCorso = useRef(false)
  const daInviare = useLiveQuery(async () =>
    (await db.rilieviFp.where('daInviare').equals(1).count()) +
    (await db.vociFp.where('daInviare').equals(1).count()) +
    (await db.eliminatiFp.count()), [], 0)

  const invia = useCallback(async () => {
    if (inCorso.current || !navigator.onLine) return
    inCorso.current = true
    try {
      const rilievi = await db.rilieviFp.where('daInviare').equals(1).toArray()
      const voci = await db.vociFp.where('daInviare').equals(1).toArray()
      const eliminati = await db.eliminatiFp.toArray()
      for (let i = 0; i === 0 || i < voci.length; i += BLOCCO_VOCI) {
        const blocco = voci.slice(i, i + BLOCCO_VOCI)
        const r = await inviaRilieviFp({ rilievi: i === 0 ? rilievi : [], voci: blocco, eliminati: i === 0 ? eliminati : [] })
        if ('errore' in r) throw new Error(r.errore)
        if (i === 0) {
          const attualiR = new Map((await db.rilieviFp.bulkGet(rilievi.map(x => x.id))).filter(x => !!x).map(x => [x!.id, x!]))
          await db.rilieviFp.bulkUpdate(inviateConfermate(rilievi, attualiR).map(id => ({ key: id, changes: { daInviare: 0 as const } })))
          await db.eliminatiFp.bulkDelete(eliminati.map(e => e.id))
        }
        const attualiV = new Map((await db.vociFp.bulkGet(blocco.map(x => x.id))).filter(x => !!x).map(x => [x!.id, x!]))
        await db.vociFp.bulkUpdate(inviateConfermate(blocco, attualiV).map(id => ({ key: id, changes: { daInviare: 0 as const } })))
      }

      const cursore = await db.fpMeta.get('cursore:rilievi')
      const remoti = await getRilieviFp(cursore?.dopo ?? null)
      if ('errore' in remoti) throw new Error(remoti.errore)
      const localiR = new Map((await db.rilieviFp.toArray()).map(r => [r.id, r]))
      const localiV = new Map((await db.vociFp.toArray()).map(v => [v.id, v]))
      await db.rilieviFp.bulkPut(remotiDaApplicare(localiR, remoti.rilievi).map(r => ({ ...r, daInviare: 0 as const })))
      await db.vociFp.bulkPut(remotiDaApplicare(localiV, remoti.voci).map(v => ({ ...v, daInviare: 0 as const })))
      const massimo = [...remoti.rilievi, ...remoti.voci].reduce<string | null>((m, x) => (!m || x.aggiornatoAt > m ? x.aggiornatoAt : m), cursore?.dopo ?? null)
      await db.fpMeta.put({ chiave: 'cursore:rilievi', dopo: massimo, da: 0, massimo })
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito')
    } finally {
      inCorso.current = false
    }
  }, [])

  useEffect(() => {
    void invia()
    window.addEventListener('online', invia)
    const id = setInterval(invia, OGNI_MS)
    return () => {
      window.removeEventListener('online', invia)
      clearInterval(id)
    }
  }, [invia])

  return { daInviare: daInviare ?? 0, invia, errore }
}
