'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'

/*
 * Spia per il caso "resta su Caricamento...": la lettura del file condiviso dalla
 * memoria del dispositivo (IndexedDB) non finisce e non da' errore. Non si
 * riproduce dal computer, quindi la pagina raccoglie da sola gli indizi e li
 * mostra, per poterli riferire. Ogni controllo ha un tempo massimo: un controllo
 * che resta appeso e' esso stesso l'indizio.
 */

const ATTESA_MS = 5000

function entro<T>(p: Promise<T>, ms = ATTESA_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rifiuta) => setTimeout(() => rifiuta(new Error(`nessuna risposta in ${ms / 1000} s`)), ms)),
  ])
}

function descriviErrore(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  return String(e)
}

async function raccogli(): Promise<string[]> {
  const righe: string[] = []
  righe.push(`Memoria del dispositivo: ${typeof indexedDB === 'undefined' ? 'NON disponibile' : 'disponibile'}`)

  try {
    const elenco = await entro(
      (indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }).databases?.() ??
        Promise.resolve([] as IDBDatabaseInfo[]),
    )
    righe.push(`Database presenti: ${elenco.map((d) => `${d.name} v${d.version}`).join(', ') || 'nessuno'}`)
  } catch (e) {
    righe.push(`Elenco database: ${descriviErrore(e)}`)
  }

  try {
    await entro(db.open())
    righe.push(`Apertura database: ok (versione ${db.verno})`)
  } catch (e) {
    righe.push(`Apertura database: ${descriviErrore(e)}`)
  }

  try {
    const n = await entro(db.condivisioni.count())
    righe.push(`File condivisi in attesa: ${n}`)
  } catch (e) {
    righe.push(`Lettura file condivisi: ${descriviErrore(e)}`)
  }

  try {
    const stima = await entro(navigator.storage?.estimate?.() ?? Promise.resolve({} as StorageEstimate))
    if (stima.quota) {
      const mb = (x?: number) => `${Math.round((x ?? 0) / 1024 / 1024)} MB`
      righe.push(`Spazio usato: ${mb(stima.usage)} su ${mb(stima.quota)}`)
    }
  } catch (e) {
    righe.push(`Spazio: ${descriviErrore(e)}`)
  }

  const sw = navigator.serviceWorker?.controller
  righe.push(`Service worker: ${sw ? `attivo (${new URL(sw.scriptURL).pathname})` : 'nessuno'}`)
  righe.push(`Dispositivo: ${navigator.userAgent}`)
  return righe
}

export default function DiagnosiCondivisione() {
  const [righe, setRighe] = useState<string[] | null>(null)

  useEffect(() => {
    let vivo = true
    raccogli()
      .then((r) => { if (vivo) setRighe(r) })
      .catch((e) => { if (vivo) setRighe([`Diagnosi interrotta: ${descriviErrore(e)}`]) })
    return () => { vivo = false }
  }, [])

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
      <p className="font-semibold text-amber-900">Il file condiviso non si riesce a leggere dal dispositivo</p>
      <p className="text-amber-900">
        Riferisci a chi ti assiste le righe qui sotto (anche con uno screenshot). Intanto puoi caricare il
        file dalla scheda della commessa.
      </p>
      <div className="rounded border bg-white p-2 font-mono text-xs text-gray-700 space-y-0.5 break-all">
        {righe ? righe.map((r) => <div key={r}>{r}</div>) : <div>Raccolta degli indizi...</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Riprova
        </button>
        <Link href="/produzione" className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
          Vai a Produzione
        </Link>
      </div>
    </div>
  )
}
