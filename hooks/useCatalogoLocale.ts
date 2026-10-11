'use client'

// Copia del catalogo FP PRO nel telefono: a pagine, solo differenze (segno del server),
// riprende da dove era rimasta se interrotta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { firmeImmagini, getPreferenzeFp, scaricaCatalogo } from '@/actions/rilievo-fp'
import { posizioneSicura } from '@/lib/fppro/sync-rilievi'
import type {
  ColoreLocale, PosizioneFp, SerieLocale, StrutturaLocale, TabellaCatalogoLocale, TelaioLocale, VetroLocale,
} from '@/types/rilievo-fp'

export interface StatoCatalogo {
  fase: 'fermo' | 'dati' | 'immagini' | 'errore'
  fatte: number
  messaggio: string | null
  ultimo: string | null
}

const TABELLE: TabellaCatalogoLocale[] = ['fp_serie', 'fp_colori', 'fp_vetri', 'fp_telai', 'fp_strutture']
const BLOCCO_IMMAGINI = 50

/** Salva una pagina scaricata nella tabella locale giusta. */
async function salvaPagina(t: TabellaCatalogoLocale, righe: unknown[]): Promise<void> {
  switch (t) {
    case 'fp_strutture': {
      const nuove = righe as StrutturaLocale[]
      // Struttura davvero cambiata (segno diverso): la sua immagine va riscaricata.
      const prima = await db.fpStrutture.bulkGet(nuove.map(s => s.id))
      const cambiate = nuove.filter((s, i) => s.immagine && prima[i] && prima[i]!.segno_server !== s.segno_server)
      await db.fpImmagini.bulkDelete(cambiate.map(s => s.immagine!))
      await db.fpStrutture.bulkPut(nuove)
      break
    }
    case 'fp_colori': await db.fpColori.bulkPut(righe as ColoreLocale[]); break
    case 'fp_vetri': await db.fpVetri.bulkPut(righe as VetroLocale[]); break
    case 'fp_telai': await db.fpTelai.bulkPut(righe as TelaioLocale[]); break
    default: await db.fpSerie.bulkPut(righe as SerieLocale[])
  }
}

export function useCatalogoLocale() {
  const [stato, setStato] = useState<StatoCatalogo>({ fase: 'fermo', fatte: 0, messaggio: null, ultimo: null })
  const inCorso = useRef(false)

  const aggiorna = useCallback(async () => {
    if (inCorso.current) return
    const ultimo = (await db.fpMeta.get('catalogo:ultimo'))?.ricevuto?.segno ?? null
    if (!navigator.onLine) {
      setStato(s => ({ ...s, ultimo }))
      return
    }
    inCorso.current = true
    let fatte = 0
    try {
      await navigator.storage?.persist?.()
      setStato({ fase: 'dati', fatte: 0, messaggio: null, ultimo })
      for (const tabella of TABELLE) {
        const chiave = `cursore:${tabella}`
        const meta = await db.fpMeta.get(chiave)
        let posizione: PosizioneFp | null = meta?.inCorso ?? meta?.ricevuto ?? null
        let ricevuto = meta?.ricevuto ?? null
        for (;;) {
          const r = await scaricaCatalogo(tabella, posizione)
          if ('errore' in r) throw new Error(r.errore)
          await salvaPagina(tabella, r.righe)
          fatte += r.righe.length
          setStato(s => ({ ...s, fatte }))
          if (r.ultima) {
            posizione = r.ultima
            ricevuto = posizioneSicura(r.ultima, r.adesso)
          }
          if (r.fine) break
          await db.fpMeta.put({ chiave, ricevuto: meta?.ricevuto ?? null, inCorso: posizione })
        }
        await db.fpMeta.put({ chiave, ricevuto, inCorso: null })
      }

      // Preferite e liste brevi: si sostituiscono per intero (piccole).
      const preferenze = await getPreferenzeFp()
      if (!('errore' in preferenze)) {
        await db.transaction('rw', db.fpPreferenze, async () => {
          await db.fpPreferenze.clear()
          await db.fpPreferenze.bulkPut(preferenze)
        })
      }

      setStato(s => ({ ...s, fase: 'immagini' }))
      const servono = (await db.fpStrutture.orderBy('immagine').uniqueKeys()) as string[]
      const presenti = new Set((await db.fpImmagini.toCollection().primaryKeys()) as string[])
      const mancanti = servono.filter(p => p && !presenti.has(p))
      for (let i = 0; i < mancanti.length; i += BLOCCO_IMMAGINI) {
        const blocco = mancanti.slice(i, i + BLOCCO_IMMAGINI)
        const firme = await firmeImmagini(blocco)
        if ('errore' in firme) throw new Error(firme.errore)
        const scaricate = await Promise.all(blocco.map(async path => {
          const url = firme.url[path]
          if (!url) return null
          const risposta = await fetch(url)
          return risposta.ok ? { path, blob: await risposta.blob() } : null
        }))
        await db.fpImmagini.bulkPut(scaricate.filter((x): x is { path: string; blob: Blob } => x !== null))
        fatte += blocco.length
        setStato(s => ({ ...s, fatte }))
      }
      const fine = new Date().toISOString()
      await db.fpMeta.put({ chiave: 'catalogo:ultimo', ricevuto: { segno: fine, chiave: null }, inCorso: null })
      setStato({ fase: 'fermo', fatte, messaggio: null, ultimo: fine })
    } catch (e) {
      setStato(s => ({ ...s, fase: 'errore', messaggio: e instanceof Error ? e.message : 'Scaricamento non riuscito' }))
    } finally {
      inCorso.current = false
    }
  }, [])

  useEffect(() => {
    void aggiorna()
    window.addEventListener('online', aggiorna)
    return () => window.removeEventListener('online', aggiorna)
  }, [aggiorna])

  return { stato, aggiorna }
}
