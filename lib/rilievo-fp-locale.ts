// Scritture del rilievo in cantiere nel telefono: ogni modifica e' "da inviare".
import { db } from '@/lib/db'
import type { RilievoFp, VoceFp } from '@/types/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

const adesso = () => new Date().toISOString()

export async function creaRilievoLocale(cliente: ClienteSnapshotRilievo, note: string, dataRilievo: string | null = null): Promise<string> {
  const id = crypto.randomUUID()
  const ora = adesso()
  await db.rilieviFp.put({ id, cliente, note, dataRilievo, creatoAt: ora, aggiornatoAt: ora, daInviare: 1 })
  return id
}

export async function salvaRilievoLocale(r: RilievoFp): Promise<void> {
  await db.rilieviFp.put({ ...r, aggiornatoAt: adesso(), daInviare: 1 })
}

export async function salvaVoceLocale(v: VoceFp): Promise<void> {
  await db.transaction('rw', db.vociFp, db.rilieviFp, async () => {
    const ora = adesso()
    await db.vociFp.put({ ...v, aggiornatoAt: ora, daInviare: 1 })
    // Il rilievo va inviato prima delle sue voci: lo si segna anche lui.
    const r = await db.rilieviFp.get(v.rilievoId)
    if (r && !r.daInviare) await db.rilieviFp.update(v.rilievoId, { daInviare: 1 })
  })
}

export async function eliminaVoceLocale(id: string): Promise<void> {
  await db.transaction('rw', db.vociFp, db.eliminatiFp, async () => {
    await db.vociFp.delete(id)
    await db.eliminatiFp.put({ id, tipo: 'voce' })
  })
}

export async function eliminaRilievoLocale(id: string): Promise<void> {
  await db.transaction('rw', db.vociFp, db.rilieviFp, db.eliminatiFp, async () => {
    const voci = await db.vociFp.where('rilievoId').equals(id).primaryKeys()
    await db.vociFp.bulkDelete(voci)
    await db.eliminatiFp.bulkPut(voci.map(v => ({ id: v, tipo: 'voce' as const })))
    await db.rilieviFp.delete(id)
    await db.eliminatiFp.put({ id, tipo: 'rilievo' })
  })
}
