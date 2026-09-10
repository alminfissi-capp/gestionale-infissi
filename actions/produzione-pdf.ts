'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'

/**
 * Carica il PDF generato lato client, lo registra tra i documenti e lo lega
 * all'ordine. Se l'ordine aveva già un PDF archiviato lo sostituisce (rimuove
 * file e voce documento vecchi) così da non accumulare duplicati.
 * Per gli ordini di magazzino (commessaId null) il file va sotto il percorso
 * dell'ordine e non viene registrato tra i documenti di commessa.
 *
 * `pdfBase64` è sempre la copia PULITA, senza footer di tracking: la route di
 * invio congela proprio quella per il fornitore, che non deve vedere quando ha
 * aperto il documento. `pdfDocumentoBase64`, se passato, è la copia col footer
 * di invio e ricezione: è quella che finisce tra i documenti della commessa,
 * dove serve da ricevuta. Senza di essa le due copie coincidono e il file
 * caricato resta uno solo.
 *
 * Ritorna lo storage path della copia pulita.
 */
export async function salvaPdfOrdine(
  ordineId: string,
  commessaId: string | null,
  pdfBase64: string,
  nomeFile: string,
  pdfDocumentoBase64?: string
): Promise<{ path?: string; error?: string }> {
  const orgId = await getOrgId()
  const cartella = commessaId ?? `ordini/${ordineId}`
  const adesso = Date.now()
  const storagePath = `${orgId}/${cartella}/${adesso}.pdf`
  const buffer = Buffer.from(pdfBase64, 'base64')

  const supabase = await createClient()
  const service = createServiceClient()

  // PDF archiviati in precedenza per questo ordine (da rimuovere dopo).
  const { data: ordinePrec } = await supabase
    .from('ordini_fornitore')
    .select('pdf_path, pdf_documento_path')
    .eq('id', ordineId)
    .eq('organization_id', orgId)
    .maybeSingle()
  const vecchioPath = ordinePrec?.pdf_path as string | null | undefined
  const vecchioDocPath = ordinePrec?.pdf_documento_path as string | null | undefined

  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, buffer, { contentType: 'application/pdf' })
  if (uploadError) return { error: uploadError.message }

  // Copia con footer: file distinto solo se davvero diversa dalla pulita.
  let documentoPath = storagePath
  if (pdfDocumentoBase64 && pdfDocumentoBase64 !== pdfBase64) {
    documentoPath = `${orgId}/${cartella}/${adesso}-doc.pdf`
    const { error: docUploadError } = await service.storage
      .from('commesse-docs')
      .upload(documentoPath, Buffer.from(pdfDocumentoBase64, 'base64'), {
        contentType: 'application/pdf',
      })
    if (docUploadError) {
      await service.storage.from('commesse-docs').remove([storagePath])
      return { error: docUploadError.message }
    }
  }

  // Solo gli ordini di commessa compaiono tra i documenti della commessa.
  if (commessaId) {
    const { error: docError } = await supabase.from('documenti_commessa').insert({
      commessa_id: commessaId,
      organization_id: orgId,
      nome_file: nomeFile,
      storage_path: documentoPath,
      tipo_documento: 'ordine_fornitore',
    })
    if (docError) {
      const daPulire = documentoPath === storagePath ? [storagePath] : [storagePath, documentoPath]
      await service.storage.from('commesse-docs').remove(daPulire)
      return { error: docError.message }
    }
  }

  const { error: ordineError } = await supabase
    .from('ordini_fornitore')
    .update({
      pdf_path: storagePath,
      pdf_documento_path: documentoPath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ordineId)
    .eq('organization_id', orgId)
  if (ordineError) return { error: ordineError.message }

  // Rimuove i PDF precedenti (best effort, non blocca l'esito).
  const nuovi = new Set([storagePath, documentoPath])
  const daRimuovere = [vecchioPath, vecchioDocPath].filter(
    (p): p is string => !!p && !nuovi.has(p)
  )
  if (daRimuovere.length > 0) {
    await service.storage.from('commesse-docs').remove([...new Set(daRimuovere)])
    await supabase
      .from('documenti_commessa')
      .delete()
      .eq('organization_id', orgId)
      .in('storage_path', [...new Set(daRimuovere)])
  }

  revalidatePath('/produzione', 'layout')
  return { path: storagePath }
}

/**
 * Sostituisce la sola copia mostrata tra i documenti di commessa, lasciando
 * intatta `pdf_path`: quella resta la versione pulita che la route di invio
 * congela per il fornitore. Serve subito dopo un invio riuscito, per far
 * comparire nella ricevuta archiviata la data di spedizione e il destinatario.
 */
export async function aggiornaPdfDocumentoOrdine(
  ordineId: string,
  commessaId: string | null,
  pdfBase64: string,
  nomeFile: string
): Promise<{ error?: string }> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: ordine } = await supabase
    .from('ordini_fornitore')
    .select('pdf_path, pdf_documento_path')
    .eq('id', ordineId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!ordine) return { error: 'Ordine non trovato' }

  const pdfPath = ordine.pdf_path as string | null
  const vecchioDocPath = ordine.pdf_documento_path as string | null

  const cartella = commessaId ?? `ordini/${ordineId}`
  const documentoPath = `${orgId}/${cartella}/${Date.now()}-doc.pdf`
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(documentoPath, Buffer.from(pdfBase64, 'base64'), {
      contentType: 'application/pdf',
    })
  if (uploadError) return { error: uploadError.message }

  if (commessaId) {
    // Via la vecchia voce d'elenco: puntava alla copia senza ricevuta.
    if (vecchioDocPath) {
      await supabase
        .from('documenti_commessa')
        .delete()
        .eq('organization_id', orgId)
        .eq('storage_path', vecchioDocPath)
    }
    const { error: docError } = await supabase.from('documenti_commessa').insert({
      commessa_id: commessaId,
      organization_id: orgId,
      nome_file: nomeFile,
      storage_path: documentoPath,
      tipo_documento: 'ordine_fornitore',
    })
    if (docError) {
      await service.storage.from('commesse-docs').remove([documentoPath])
      return { error: docError.message }
    }
  }

  const { error: ordineError } = await supabase
    .from('ordini_fornitore')
    .update({ pdf_documento_path: documentoPath })
    .eq('id', ordineId)
    .eq('organization_id', orgId)
  if (ordineError) return { error: ordineError.message }

  // Il vecchio file si cancella solo se non e' anche la copia del fornitore:
  // quando le due coincidevano, quel file deve restare al suo posto.
  if (vecchioDocPath && vecchioDocPath !== pdfPath && vecchioDocPath !== documentoPath) {
    await service.storage.from('commesse-docs').remove([vecchioDocPath])
  }

  revalidatePath('/produzione', 'layout')
  return {}
}
