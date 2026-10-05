'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Tra due aggiornamenti per "finestra tornata in primo piano" almeno questo intervallo. */
const PAUSA_MS = 5_000

/** Generazioni di pagina gia' mostrate in questa sessione del browser. */
const giaMostrate = new Set<number>()

/**
 * Tiene aggiornata una pagina server che mostra dati modificati altrove.
 * Tornando alla pagina (indietro, link gia' visitato, app installata) il router di
 * Next puo' mostrare la copia gia' in memoria, con i dati di prima. La si riconosce
 * perche' la sua generazione e' gia' stata mostrata, e la si rigenera: si confrontano
 * identificativi, non orologi, cosi' uno scarto fra server e telefono non crea cicli.
 * Si aggiorna anche quando la finestra torna in primo piano, per le modifiche fatte
 * da un'altra scheda o da un altro utente.
 *
 * `generataAlle` viene da istanteGenerazione() nel Server Component della pagina.
 */
export function useAggiornaSeVecchia(generataAlle: number) {
  const router = useRouter()

  useEffect(() => {
    if (giaMostrate.has(generataAlle)) router.refresh()
    else giaMostrate.add(generataAlle)
  }, [generataAlle, router])

  useEffect(() => {
    let ultimo = Date.now()
    const aggiorna = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimo < PAUSA_MS) return
      ultimo = Date.now()
      router.refresh()
    }
    document.addEventListener('visibilitychange', aggiorna)
    window.addEventListener('focus', aggiorna)
    return () => {
      document.removeEventListener('visibilitychange', aggiorna)
      window.removeEventListener('focus', aggiorna)
    }
  }, [router])
}
