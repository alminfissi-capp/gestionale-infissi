import { createClient } from '@/lib/supabase/client'
import { conRiprova } from '@/lib/riprova'
import {
  setAllegatoScadenza,
  getPathAllegatoScadenza,
  uploadFotoScadenza,
} from '@/actions/scadenze'

const BUCKET_ALLEGATI = 'commesse-docs'

export const MIME_ALLEGATO: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', heic: 'image/heic',
}

export type EsitoAllegato = { fotoPath: string; anteprimaPath: string | null }

/** Il file selezionato e' un PDF (per tipo MIME o, su Android, per estensione) */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Immagine della prima pagina di un PDF, generata qui nel browser.
 *
 * Serve perche' anteprima a schermo e scheda di stampa sanno mostrare solo
 * immagini: senza, la contabile del bonifico resterebbe allegata ma invisibile.
 * Se la conversione non riesce si prosegue lo stesso: il PDF resta allegato.
 */
export async function anteprimaPdf(file: File): Promise<Blob | null> {
  try {
    const { renderPaginePdf } = await import('@/lib/pdf-items')
    const [dataUrl] = await renderPaginePdf(file, { maxPagine: 1 })
    if (!dataUrl) return null
    return await (await fetch(dataUrl)).blob()
  } catch {
    return null
  }
}

/** Estensione e content type con cui salvare il file sul bucket */
export function tipoAllegato(file: File): { ext: string; contentType: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const contentType =
    file.type && file.type !== 'application/octet-stream'
      ? file.type
      : (MIME_ALLEGATO[ext] ?? 'image/jpeg')
  return { ext, contentType }
}

/**
 * Carica l'allegato di una scadenza e ne restituisce i percorsi.
 *
 * Strada normale: il browser scrive direttamente su Supabase. Il file non
 * attraversa le funzioni Vercel e quindi non incontra il limite sul corpo della
 * richiesta (~4,5 MB), che faceva fallire in silenzio le foto scattate col
 * telefono. Stesso percorso di DialogDocumenti e DialogPreventivoManuale.
 *
 * Ripiego: la Server Action. Su iOS e Android il client browser può non avere
 * la sessione, e lì il caricamento diretto fallirebbe; passando dal server il
 * caso mobile continua a funzionare, al prezzo del limite di dimensione.
 *
 * Una volta che il file e' nel bucket non si torna indietro a rimandarlo: si
 * riprova solo a registrarlo. Rimandare un file gia' al sicuro e' tempo perso
 * su rete mobile e lascia copie orfane nel bucket.
 */
export async function caricaAllegato(
  scadenzaId: string,
  file: Blob,
  ext: string,
  contentType: string,
  anteprima: Blob | null,
): Promise<EsitoAllegato> {
  try {
    const base = await getPathAllegatoScadenza(scadenzaId)
    const fotoPath = `${base}.${ext}`
    const supabase = createClient()

    // upsert: una riprova dopo una risposta persa non deve fallire per "file gia' esistente"
    await conRiprova(async () => {
      const { error } = await supabase.storage
        .from(BUCKET_ALLEGATI)
        .upload(fotoPath, file, { contentType, upsert: true })
      if (error) throw error
    })

    // L'anteprima e' un di piu': se non ce la fa, il documento resta allegato
    let anteprimaPath: string | null = null
    if (anteprima) {
      const p = `${base}.anteprima.jpg`
      try {
        await conRiprova(async () => {
          const { error } = await supabase.storage
            .from(BUCKET_ALLEGATI)
            .upload(p, anteprima, { contentType: 'image/jpeg', upsert: true })
          if (error) throw error
        })
        anteprimaPath = p
      } catch { /* si prosegue senza anteprima */ }
    }

    await conRiprova(() => setAllegatoScadenza(scadenzaId, fotoPath, anteprimaPath))
    return { fotoPath, anteprimaPath }
  } catch {
    const fd = new FormData()
    fd.append('file', file, `allegato.${ext}`)
    fd.append('scadenzaId', scadenzaId)
    if (anteprima) fd.append('anteprima', anteprima, 'anteprima.jpg')
    const res = await conRiprova(async () => {
      const r = await uploadFotoScadenza(fd)
      if (r.error) throw new Error(r.error)
      return r
    })
    return { fotoPath: res.path!, anteprimaPath: res.anteprimaPath ?? null }
  }
}
