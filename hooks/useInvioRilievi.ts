'use client'

// Invio dei rilievi fatti nel telefono e ricezione di quelli fatti altrove.
// Invio e ricezione sono indipendenti: un rilievo che non parte non blocca gli altri
// ne' la ricezione.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { getRilieviFp, inviaRilieviFp } from '@/actions/rilievo-fp'
import { inviateConfermate, posizioneSicura, remotiDaApplicare } from '@/lib/fppro/sync-rilievi'

const OGNI_MS = 60_000

/** Toglie dal telefono rilievi (con le loro voci) e voci eliminati altrove. */
async function eliminaLocali(ids: { id: string; tipo: 'rilievo' | 'voce' }[]): Promise<void> {
  if (ids.length === 0) return
  await db.transaction('rw', db.rilieviFp, db.vociFp, async () => {
    for (const e of ids) {
      if (e.tipo === 'rilievo') {
        await db.vociFp.where('rilievoId').equals(e.id).delete()
        await db.rilieviFp.delete(e.id)
      } else {
        await db.vociFp.delete(e.id)
      }
    }
  })
}

async function inviaTutto(): Promise<string[]> {
  const errori: string[] = []

  const eliminati = await db.eliminatiFp.toArray()
  if (eliminati.length > 0) {
    const r = await inviaRilieviFp({ rilievi: [], voci: [], eliminati })
    if ('errore' in r) errori.push(`eliminazioni: ${r.errore}`)
    else await db.eliminatiFp.bulkDelete(eliminati.map(e => e.id))
  }

  const rilievi = await db.rilieviFp.where('daInviare').equals(1).toArray()
  const voci = await db.vociFp.where('daInviare').equals(1).toArray()
  const gruppi = [...new Set([...rilievi.map(r => r.id), ...voci.map(v => v.rilievoId)])]
  for (const rilievoId of gruppi) {
    const r = rilievi.filter(x => x.id === rilievoId)
    const v = voci.filter(x => x.rilievoId === rilievoId)
    const esito = await inviaRilieviFp({ rilievi: r, voci: v, eliminati: [] })
    if ('errore' in esito) {
      errori.push(esito.errore)
      continue
    }
    const attualiR = new Map((await db.rilieviFp.bulkGet(r.map(x => x.id))).filter(x => !!x).map(x => [x!.id, x!]))
    await db.rilieviFp.bulkUpdate(inviateConfermate(r, attualiR).map(id => ({ key: id, changes: { daInviare: 0 as const } })))
    const attualiV = new Map((await db.vociFp.bulkGet(v.map(x => x.id))).filter(x => !!x).map(x => [x!.id, x!]))
    await db.vociFp.bulkUpdate(inviateConfermate(v, attualiV).map(id => ({ key: id, changes: { daInviare: 0 as const } })))
    // Eliminati altrove nel frattempo: si tolgono anche qui.
    await eliminaLocali(esito.saltati.map(id => ({ id, tipo: id === rilievoId ? 'rilievo' as const : 'voce' as const })))
  }
  return errori.length > 0 ? [`${errori.length} invii non riusciti (ultimo: ${errori[errori.length - 1]})`] : []
}

async function riceviTutto(): Promise<void> {
  const meta = await db.fpMeta.get('cursore:rilievi')
  const remoti = await getRilieviFp(meta?.ricevuto?.segno ?? null)
  if ('errore' in remoti) throw new Error(remoti.errore)
  await eliminaLocali(remoti.eliminati)
  const esclusi = new Set([
    ...((await db.eliminatiFp.toCollection().primaryKeys()) as string[]),
    ...remoti.eliminati.map(e => e.id),
  ])
  const localiR = new Map((await db.rilieviFp.toArray()).map(r => [r.id, r]))
  const localiV = new Map((await db.vociFp.toArray()).map(v => [v.id, v]))
  await db.rilieviFp.bulkPut(remotiDaApplicare(localiR, remoti.rilievi, esclusi).map(r => ({ ...r, daInviare: 0 as const })))
  await db.vociFp.bulkPut(
    remotiDaApplicare(localiV, remoti.voci, esclusi)
      .filter(v => !esclusi.has(v.rilievoId))
      .map(v => ({ ...v, daInviare: 0 as const })),
  )
  const ricevuto = posizioneSicura(remoti.ultimoSegno ? { segno: remoti.ultimoSegno, chiave: null } : null, remoti.adesso)
  await db.fpMeta.put({ chiave: 'cursore:rilievi', ricevuto: ricevuto ?? meta?.ricevuto ?? null, inCorso: null })
}

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
    const problemi: string[] = []
    try {
      problemi.push(...await inviaTutto())
    } catch (e) {
      problemi.push(e instanceof Error ? e.message : 'Invio non riuscito')
    }
    try {
      await riceviTutto()
    } catch (e) {
      problemi.push(`ricezione: ${e instanceof Error ? e.message : 'non riuscita'}`)
    } finally {
      inCorso.current = false
    }
    setErrore(problemi.length > 0 ? problemi.join(' · ') : null)
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
