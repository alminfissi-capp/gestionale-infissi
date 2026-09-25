'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import type { PdfCaricato } from '@/types/produzione'

/**
 * Porta il PDF al suo posto su Storage e ne restituisce il percorso.
 *
 * Se il browser lo ha gia' caricato arriva un `path` e qui non si fa altro che
 * controllarlo: deve stare nella cartella dell'organizzazione e dell'ordine,
 * altrimenti un client potrebbe far registrare un file altrui. Il `base64` e'
 * il ripiego, e paga il tetto del corpo della function.
 */
async function materializzaPdf(
  service: ReturnType<typeof createServiceClient>,
  orgId: string,
  cartella: string,
  pdf: PdfCaricato,
  nomePath: string,
): Promise<{ path: string } | { error: string }> {
  const prefisso = `${orgId}/${cartella}/`
  if ('path' in pdf) {
    if (!pdf.path.startsWith(prefisso)) return { error: 'Percorso PDF non valido' }
    return { path: pdf.path }
  }
  const path = `${prefisso}${nomePath}`
  const { error } = await service.storage
    .from('commesse-docs')
    .upload(path, Buffer.from(pdf.base64, 'base64'), { contentType: 'application/pdf' })
  if (error) return { error: error.message }
  return { path }
}

/**
 * Carica il PDF generato lato client, lo registra tra i documenti e lo lega
 * all'ordine. Se l'ordine aveva già un PDF archiviato lo sostituisce (rimuove
 * file e voce documento vecchi) così da non accumulare duplicati.
 * Per gli ordini di magazzino (commessaId null) il file va sotto il percorso
 * dell'ordine e non viene registrato tra i documenti di commessa.
 *
 * `pdf` è sempre la copia PULITA, senza footer di tracking: la route di
 * invio congela proprio quella per il fornitore, che non deve vedere quando ha
 * aperto il documento. `pdfDocumento`, se passato, è la copia col footer
 * di invio e ricezione: è quella che finisce tra i documenti della commessa,
 * dove serve da ricevuta. Senza di essa le due copie coincidono e il file
 * archiviato resta uno solo.
 *
 * Ritorna lo storage path della copia pulita.
 */
export async function salvaPdfOrdine(
  ordineId: string,
  commessaId: string | null,
  pdf: PdfCaricato,
  nomeFile: string,
  pdfDocumento?: PdfCaricato
): Promise<{ path?: string; error?: string }> {
  const orgId = await getOrgId()
  const cartella = commessaId ?? `ordini/${ordineId}`
  const adesso = Date.now()

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

  const pulita = await materializzaPdf(service, orgId, cartella, pdf, `${adesso}.pdf`)
  if ('error' in pulita) return { error: pulita.error }
  const storagePath = pulita.path

  // Copia con footer: file distinto solo quando il chiamante la passa, cioe'
  // quando c'e' davvero una ricevuta da raccontare.
  let documentoPath = storagePath
  if (pdfDocumento) {
    const conFooter = await materializzaPdf(
      service, orgId, cartella, pdfDocumento, `${adesso}-doc.pdf`
    )
    if ('error' in conFooter) {
      await service.storage.from('commesse-docs').remove([storagePath])
      return { error: conFooter.error }
    }
    documentoPath = conFooter.path
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
  pdf: PdfCaricato,
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
  const caricato = await materializzaPdf(
    service, orgId, cartella, pdf, `${Date.now()}-doc.pdf`
  )
  if ('error' in caricato) return { error: caricato.error }
  const documentoPath = caricato.path

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
