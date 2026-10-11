'use client'

// Copia del catalogo FP PRO nel telefono: a pagine, solo differenze, riprende se interrotta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { firmeImmagini, scaricaCatalogo } from '@/actions/rilievo-fp'
import type {
  ColoreLocale, SerieLocale, StrutturaLocale, TabellaCatalogoLocale, TelaioLocale, VetroLocale,
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
    case 'fp_strutture': await db.fpStrutture.bulkPut(righe as StrutturaLocale[]); break
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
    if (inCorso.current || !navigator.onLine) return
    inCorso.current = true
    let fatte = 0
    try {
      await navigator.storage?.persist?.()
      setStato(s => ({ ...s, fase: 'dati', fatte: 0, messaggio: null }))
      for (const tabella of TABELLE) {
        const chiave = `cursore:${tabella}`
        const meta = await db.fpMeta.get(chiave)
        const dopo = meta?.dopo ?? null
        let da = meta?.da ?? 0
        let massimo = meta?.massimo ?? dopo
        for (;;) {
          const r = await scaricaCatalogo(tabella, dopo, da)
          if ('errore' in r) throw new Error(r.errore)
          const righe = r.righe as { sincronizzato_at: string }[]
          await salvaPagina(tabella, righe)
          if (tabella === 'fp_strutture') {
            // Struttura cambiata: la sua immagine va riscaricata.
            const percorsi = (righe as unknown as StrutturaLocale[]).map(s => s.immagine).filter((p): p is string => !!p)
            await db.fpImmagini.bulkDelete(percorsi)
          }
          for (const x of righe) if (!massimo || x.sincronizzato_at > massimo) massimo = x.sincronizzato_at
          da += righe.length
          fatte += righe.length
          setStato(s => ({ ...s, fatte }))
          if (r.fine) break
          await db.fpMeta.put({ chiave, dopo, da, massimo })
        }
        await db.fpMeta.put({ chiave, dopo: massimo, da: 0, massimo })
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
      const ultimo = new Date().toISOString()
      await db.fpMeta.put({ chiave: 'catalogo:ultimo', dopo: ultimo, da: 0, massimo: null })
      setStato({ fase: 'fermo', fatte, messaggio: null, ultimo })
    } catch (e) {
      setStato(s => ({ ...s, fase: 'errore', messaggio: e instanceof Error ? e.message : 'Scaricamento non riuscito' }))
    } finally {
      inCorso.current = false
    }
  }, [])

  useEffect(() => {
    let attivo = true
    db.fpMeta.get('catalogo:ultimo').then(m => {
      if (attivo && m?.dopo) setStato(s => ({ ...s, ultimo: m.dopo }))
    })
    void aggiorna()
    window.addEventListener('online', aggiorna)
    return () => {
      attivo = false
      window.removeEventListener('online', aggiorna)
    }
  }, [aggiorna])

  return { stato, aggiorna }
}
