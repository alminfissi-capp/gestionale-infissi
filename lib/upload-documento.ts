import { createClient } from '@/lib/supabase/client'
import {
  addDocumentoCommessa,
  getOrgIdPerUpload,
  uploadDocumentoCommessa,
} from '@/actions/commesse'
import {
  LIMITE_BYTE_DOCUMENTO,
  mimeDocumento,
  percorsoStorage,
} from '@/lib/documenti-percorsi'

/**
 * Carica un documento su una commessa. Restituisce `null` se e' andata,
 * altrimenti il messaggio d'errore da mostrare.
 *
 * Due strade, in quest'ordine, e non e' un dettaglio:
 *
 * 1. Il browser carica dritto su Supabase. Il file non attraversa le funzioni
 *    Vercel, quindi non incontra il limite sul corpo della richiesta (~4,5 MB)
 *    che blocca i file grandi passando dalla Server Action. Da qui sono passati
 *    file da 18 MB.
 * 2. Se quella fallisce, si ripiega sulla Server Action: su iOS e Android il
 *    client browser puo' non avere la sessione. Li' il file passa dal server e
 *    torna soggetto al limite di dimensione, ma il caso mobile continua a
 *    funzionare invece di fallire e basta.
 */
export async function caricaDocumentoCommessa(
  file: Blob,
  nomeFile: string,
  commessaId: string,
  tipo: string,
): Promise<string | null> {
  // Il controllo vive anche nella Server Action, ma il caricamento diretto su
  // Supabase non ci passa: senza questo, il limite non varrebbe piu'.
  if (file.size > LIMITE_BYTE_DOCUMENTO) return 'File troppo grande (max 20 MB)'

  // Su iOS i file da cloud (Dropbox/iCloud) sono lazy: arrayBuffer() forza la
  // lettura completa prima di spedirli.
  const buffer = await file.arrayBuffer()
  const contentType = mimeDocumento(nomeFile, file.type)
  const blob = new Blob([buffer], { type: contentType })

  try {
    const orgId = await getOrgIdPerUpload()
    const storagePath = percorsoStorage(orgId, commessaId, nomeFile)
    const supabase = createClient()
    const { error } = await supabase.storage
      .from('commesse-docs')
      .upload(storagePath, blob, { contentType })
    if (error) throw error
    await addDocumentoCommessa(commessaId, nomeFile, storagePath, tipo)
    return null
  } catch {
    const fd = new FormData()
    fd.append('file', blob, nomeFile)
    fd.append('commessaId', commessaId)
    fd.append('tipo', tipo)
    const result = await uploadDocumentoCommessa(fd)
    return result.error ?? null
  }
}
