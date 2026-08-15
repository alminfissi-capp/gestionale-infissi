'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  setPagatoScadenza,
  deleteScadenza,
  updateScadenza,
  removeFotoScadenza,
  getFotoScadenzaUrl,
  toggleCalcoliScadenza,
  setAnnullataScadenza,
  copiaScadenzaRate,
  spostaInDaProgrammare,
} from '@/actions/scadenze'
import { caricaAllegato, anteprimaPdf, tipoAllegato, isPdfFile } from '@/lib/allegatoScadenza'
import { conRiprova } from '@/lib/riprova'
import { ocrAssegno, type OcrAssegnoResult } from '@/lib/ocrAssegno'
import { parseBonificoScadenza, type BonificoScadenza } from '@/lib/parseBonificoScadenza'
import type { Scadenza } from '@/types/commessa'

/**
 * Stato e comandi comuni alle due viste delle scadenze: quella per mesi dei
 * blocchi anno e quella piatta del blocco "da programmare". Qui stanno le cose
 * che non dipendono da come le righe sono raggruppate a schermo: allegati,
 * spunte, eliminazione, copia.
 */
export function useScadenzeRighe(scadenze: Scadenza[]) {
  const router = useRouter()

  // Stato locale sincronizzato con i dati server (adjust-state-during-render)
  const [items, setItems] = useState<Scadenza[]>(scadenze)
  const [prevScad, setPrevScad] = useState(scadenze)
  if (prevScad !== scadenze) {
    setPrevScad(scadenze)
    setItems(scadenze)
  }

  // URL firmati degli allegati + caricamento/lettura in corso
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Carica gli URL firmati delle righe con allegato. Per i PDF si usa
  // l'anteprima: e' quella che si mostra a schermo e in stampa.
  useEffect(() => {
    let cancelled = false
    const conAllegato = items.filter((s) => s.foto_path)
    if (conAllegato.length === 0) { setFotoUrls({}); return }
    const load = async () => {
      const map: Record<string, string> = {}
      await Promise.all(
        conAllegato.map(async (s) => {
          const path = s.anteprima_path ?? s.foto_path!
          try { map[s.id] = await getFotoScadenzaUrl(path) } catch { /* ignora */ }
        })
      )
      if (!cancelled) setFotoUrls(map)
    }
    load()
    return () => { cancelled = true }
  }, [items])

  const handleTogglePagato = async (s: Scadenza) => {
    const nuovo = !s.pagato
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, pagato: nuovo } : x)))
    try {
      await setPagatoScadenza(s.id, nuovo)
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, pagato: !nuovo } : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleToggleCalcoli = async (s: Scadenza) => {
    const nuovo = !s.in_calcoli
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, in_calcoli: nuovo } : x)))
    try {
      await toggleCalcoliScadenza(s.id, nuovo)
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, in_calcoli: !nuovo } : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  // Annullamento: la riga resta dov'e' con tutti i suoi dati, ma smette di
  // contare nei totali. Annullando esce anche dai Calcoli.
  const handleToggleAnnullata = async (s: Scadenza) => {
    const nuovo = !s.annullata
    setItems((cur) =>
      cur.map((x) =>
        x.id === s.id ? { ...x, annullata: nuovo, in_calcoli: nuovo ? false : x.in_calcoli } : x
      )
    )
    try {
      await setAnnullataScadenza(s.id, nuovo)
      toast.success(nuovo ? 'Scadenza annullata' : 'Scadenza ripristinata')
      router.refresh()
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? s : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDelete = async (s: Scadenza) => {
    if (!confirm('Eliminare questa scadenza?')) return
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== s.id))
    try {
      await deleteScadenza(s.id)
      router.refresh()
    } catch {
      setItems(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  /** Riporta nel limbo una riga collocata in un mese: perde data e spunta pagato */
  const handleSpostaInLimbo = async (s: Scadenza) => {
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== s.id))
    try {
      await spostaInDaProgrammare(s.id)
      toast.success('Spostata in Da programmare')
      router.refresh()
    } catch {
      setItems(prev)
      toast.error('Errore nello spostamento')
    }
  }

  const handleFotoSelected = async (s: Scadenza, file: File | null) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('File troppo grande (max 20 MB)'); return }

    const isPdf = isPdfFile(file)
    const daLeggere = s.categoria === 'assegno'

    setUploadingId(s.id)
    if (daLeggere) toast.info(isPdf ? 'Lettura del bonifico in corso…' : 'Lettura assegno in corso…')

    try {
      // Su iOS i file da cloud (iCloud/Dropbox) sono pigri: arrayBuffer() forza
      // la lettura completa prima di spedirli
      const buffer = await file.arrayBuffer()
      const { ext, contentType } = tipoAllegato(file)
      const blob = new Blob([buffer], { type: contentType })

      // I PDF non si vedono a schermo ne' in stampa: si allega l'immagine
      // della prima pagina, generata qui nel browser
      const anteprima = isPdf ? await anteprimaPdf(file) : null

      // La lettura parte subito ma non trattiene il caricamento: l'OCR di un
      // assegno impiega secondi, e l'allegato deve comparire prima
      const lettura = !daLeggere
        ? Promise.resolve(null)
        : isPdf
          ? parseBonificoScadenza(file)
          : ocrAssegno(file)

      const esito = await caricaAllegato(s.id, blob, ext, contentType, anteprima)

      // Il file e' al sicuro: la riga lo mostra adesso, senza aspettare il giro
      // dal server. E' il punto in cui prima restava indietro nel PWA.
      setItems((cur) =>
        cur.map((x) =>
          x.id === s.id
            ? { ...x, foto_path: esito.fotoPath, anteprima_path: esito.anteprimaPath }
            : x
        )
      )
      setUploadingId(null)

      const nome = isPdf ? 'Bonifico allegato' : 'Foto allegata'
      toast.success(nome)
      if (isPdf && !esito.anteprimaPath) {
        toast.warning("Anteprima non generata: il PDF resta allegato ma non comparirà nella scheda")
      }

      // Da qui in poi l'allegato e' salvo: quello che puo' ancora fallire
      // riguarda solo i campi letti, e va detto senza allarmare sul file.
      try {
        const letto = await lettura
        // Il fornitore non si tocca mai: quello scritto a mano e' piu' preciso
        // del nome che compare in banca.
        const patch: { descrizione?: string; importo?: number; data_scadenza?: string } = {}
        if (letto) {
          if (isPdf) {
            const b = letto as BonificoScadenza
            if (b.causale) patch.descrizione = b.causale
            if (b.importo != null && !s.importo) patch.importo = b.importo
            // Nel limbo la data letta dal bonifico non si applica da sola: e'
            // la spunta "pagata" nella scheda a decidere quando collocarla
            if (b.data && s.data_scadenza) patch.data_scadenza = b.data
          } else {
            const o = letto as OcrAssegnoResult
            if (o.numero) patch.descrizione = `Assegno n. ${o.numero}`
            if (o.importo != null && !s.importo) patch.importo = o.importo
          }
        }
        if (Object.keys(patch).length > 0) {
          await conRiprova(() => updateScadenza(s.id, patch))
          setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
          toast.success('Dati letti dal documento')
        } else if (daLeggere) {
          toast.info('Nessun dato riconosciuto: compila a mano')
        }
      } catch {
        toast.warning('Allegato salvato, ma i dati letti non si sono salvati: correggili a mano')
      }

      router.refresh()
    } catch {
      toast.error('Caricamento non riuscito: il file non è stato allegato, riprova')
    } finally {
      setUploadingId(null)
      if (fileRefs.current[s.id]) fileRefs.current[s.id]!.value = ''
      if (cameraRefs.current[s.id]) cameraRefs.current[s.id]!.value = ''
    }
  }

  /** Ritorna true se l'allegato e' stato davvero rimosso (serve a chiudere l'anteprima) */
  const handleRemoveFoto = async (s: Scadenza): Promise<boolean> => {
    if (!s.foto_path) return false
    if (!confirm('Rimuovere la foto?')) return false
    try {
      await removeFotoScadenza(s.id, s.foto_path)
      router.refresh()
      return true
    } catch {
      toast.error("Errore nell'eliminazione")
      return false
    }
  }

  const handleCopia = async (s: Scadenza, cadenzaMesi: number) => {
    setCopyingId(s.id)
    try {
      await copiaScadenzaRate({ origineId: s.id, cadenzaMesi, count: 1 })
      const quando = cadenzaMesi === 1 ? 'al mese successivo' : `(+${cadenzaMesi} mesi)`
      toast.success(`${s.categoria === 'utenza' ? 'Utenza copiata' : 'Rata copiata'} ${quando}`)
      router.refresh()
    } catch {
      toast.error('Errore nella copia')
    } finally {
      setCopyingId(null)
    }
  }

  return {
    items,
    setItems,
    fotoUrls,
    uploadingId,
    copyingId,
    fileRefs,
    cameraRefs,
    handleTogglePagato,
    handleToggleCalcoli,
    handleToggleAnnullata,
    handleDelete,
    handleSpostaInLimbo,
    handleFotoSelected,
    handleRemoveFoto,
    handleCopia,
  }
}
