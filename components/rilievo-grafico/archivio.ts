// Salvataggio dei rilievi grafici: prima nel dispositivo (funziona anche senza rete), poi
// sul server appena c'e' la rete. Vince la modifica piu' recente.
import { db } from '@/lib/db'
import { elencoRilieviGrafici, inviaRilieviGrafici } from '@/actions/rilievo-grafico'
import type { RilievoGrafico } from '@/types/rilievo-grafico'

const senzaFlag = ({ daInviare: _d, ...r }: RilievoGrafico & { daInviare?: 0 | 1 }): RilievoGrafico => r

export async function salvaRilievo(r: RilievoGrafico): Promise<void> {
  await db.rilieviGrafici.put({ ...r, daInviare: 1 })
  void inviaInSospeso()
}

export async function eliminaRilievo(id: string): Promise<void> {
  await db.transaction('rw', db.rilieviGrafici, db.eliminatiGrafici, async () => {
    await db.rilieviGrafici.delete(id)
    await db.eliminatiGrafici.put({ id })
  })
  void inviaInSospeso()
}

let inCorso: Promise<boolean> | null = null

/** Manda al server cio' che non ha ancora. true = niente in sospeso */
export function inviaInSospeso(): Promise<boolean> {
  if (inCorso) return inCorso
  inCorso = (async () => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false
      const rilievi = await db.rilieviGrafici.where('daInviare').equals(1).toArray()
      const eliminati = (await db.eliminatiGrafici.toArray()).map(e => e.id)
      if (rilievi.length === 0 && eliminati.length === 0) return true
      const r = await inviaRilieviGrafici({ rilievi: rilievi.map(senzaFlag), eliminati })
      if ('errore' in r) return false
      await db.transaction('rw', db.rilieviGrafici, db.eliminatiGrafici, async () => {
        for (const x of rilievi) {
          // Cambiato di nuovo mentre si inviava: resta da inviare.
          const ora = await db.rilieviGrafici.get(x.id)
          if (ora && ora.aggiornatoAt === x.aggiornatoAt) await db.rilieviGrafici.update(x.id, { daInviare: 0 })
        }
        await db.eliminatiGrafici.bulkDelete(eliminati)
      })
      return true
    } catch {
      return false
    } finally {
      inCorso = null
    }
  })()
  return inCorso
}

/**
 * Allinea il dispositivo al server: prima invia, poi prende le versioni piu' recenti e
 * toglie i rilievi eliminati altrove (solo quelli gia' inviati da qui).
 */
export async function aggiornaDalServer(): Promise<{ ok: boolean; errore?: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, errore: 'Senza rete' }
  await inviaInSospeso()
  const r = await elencoRilieviGrafici()
  if ('errore' in r) return { ok: false, errore: r.errore }
  const server = new Map(r.rilievi.map(x => [x.id, x]))
  const eliminati = new Set((await db.eliminatiGrafici.toArray()).map(e => e.id))
  await db.transaction('rw', db.rilieviGrafici, async () => {
    const locali = await db.rilieviGrafici.toArray()
    for (const l of locali) {
      const s = server.get(l.id)
      if (!s && l.daInviare === 0) await db.rilieviGrafici.delete(l.id)
      else if (s && l.daInviare === 0 && s.aggiornatoAt !== l.aggiornatoAt) await db.rilieviGrafici.put({ ...s, daInviare: 0 })
      else if (s && l.daInviare === 1 && s.aggiornatoAt > l.aggiornatoAt) await db.rilieviGrafici.put({ ...s, daInviare: 0 })
    }
    const ids = new Set(locali.map(l => l.id))
    for (const s of r.rilievi) if (!ids.has(s.id) && !eliminati.has(s.id)) await db.rilieviGrafici.put({ ...s, daInviare: 0 })
  })
  return { ok: true }
}
