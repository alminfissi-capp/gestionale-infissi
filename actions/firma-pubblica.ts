'use server'

import { createServiceClient } from '@/lib/supabase/service'

const EU_SES_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://esignature.openapi.com'
    : 'https://test.esignature.openapi.com'

/** Normalizza un numero italiano in formato E.164 (es. "+393331234567") */
function normalizzaTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return `+${digits}`
  if (digits.startsWith('0039')) return `+${digits.slice(4)}`
  if (digits.startsWith('39') && digits.length >= 11) return `+${digits}`
  return `+39${digits}`
}

/**
 * Avvia il processo di firma EU-SES quando il cliente clicca "Accetta" sulla
 * pagina pubblica del preventivo. Il PDF è generato lato client e passato via FormData.
 *
 * @param shareToken  token pubblico del preventivo (da URL /p/[token])
 * @param telefono    cellulare del firmatario (E.164 o formato italiano)
 * @param formData    FormData con campo "pdf" (File/Blob)
 */
export async function avviaFirmaPreventivo(
  shareToken: string,
  telefono: string,
  formData: FormData
): Promise<{ signingUrl: string }> {
  const service = createServiceClient()

  const { data: prev } = await service
    .from('preventivi')
    .select('*')
    .eq('share_token', shareToken)
    .single()

  if (!prev) throw new Error('Preventivo non trovato')
  if (prev.firma_stato === 'firmato') throw new Error('Preventivo già firmato')
  if (prev.firma_stato === 'in_attesa') throw new Error('Firma già in corso')

  // PDF generato lato client
  const pdfFile = formData.get('pdf') as File | null
  if (!pdfFile || pdfFile.size === 0) throw new Error('PDF mancante o vuoto')

  const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
  const pdfName = pdfFile.name || (prev.numero ? `preventivo-${prev.numero}.pdf` : 'preventivo.pdf')

  // Dati firmatario dal snapshot
  const snap = prev.cliente_snapshot as {
    tipo?: string; ragione_sociale?: string | null
    nome?: string | null; cognome?: string | null
    email?: string | null; telefono?: string | null
  }
  const nomeCompleto =
    snap.tipo === 'azienda'
      ? (snap.ragione_sociale || 'Cliente')
      : [snap.nome, snap.cognome].filter(Boolean).join(' ') || 'Cliente'

  const parts = nomeCompleto.trim().split(/\s+/)
  const signerName = parts[0] || 'Cliente'
  const signerSurname = parts.slice(1).join(' ') || ' '
  const signerEmail = snap.email || ''
  if (!telefono) throw new Error('Numero di cellulare obbligatorio per ricevere il codice OTP')
  const signerMobile = normalizzaTelefono(telefono)

  const firmaToken = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  // Carica PDF su storage → openapi.it lo scarica via URL firmato (non accetta data URI)
  const tempPath = `firma-temp/${prev.id}/${firmaToken}.pdf`
  const { error: uploadError } = await service.storage
    .from('commesse-docs')
    .upload(tempPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw new Error(`Errore upload PDF: ${uploadError.message}`)

  const { data: signedUrlData } = await service.storage
    .from('commesse-docs')
    .createSignedUrl(tempPath, 86400) // 24h
  if (!signedUrlData?.signedUrl) throw new Error('Impossibile generare URL firmato per il PDF')
  const pdfUrl = signedUrlData.signedUrl

  const payload = {
    inputDocuments: [{ uri: pdfUrl, title: pdfName }],
    signers: [{
      name: signerName,
      surname: signerSurname,
      email: signerEmail,
      mobile: signerMobile,
      authentication: ['sms'],
      signatures: [{
        documentTitle: pdfName,
        pageNumber: 1,
        x: 70,
        y: 680,
        signatureName: 'Firma Cliente',
      }],
    }],
    callbackUrl: `${appUrl}/api/firma-callback?token=${firmaToken}`,
    redirectUrl: `${appUrl}/conferma/${firmaToken}/grazie`,
    signatureMode: ['typed', 'drawn'],
  }

  const res = await fetch(`${EU_SES_BASE}/EU-SES`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`openapi.it errore ${res.status}: ${err}`)
  }

  const json = await res.json()
  const responseData = json.data ?? json
  const documentId: string = responseData.id
  const signingUrl: string = responseData.signers?.[0]?.url ?? responseData.signers?.[0]?.signingUrl ?? ''

  if (!signingUrl) throw new Error('openapi.it non ha restituito il link di firma')

  await service.from('preventivi').update({
    token_conferma: firmaToken,
    firma_documento_id: documentId,
    firma_stato: 'in_attesa',
    firma_richiesta_at: new Date().toISOString(),
    stato: 'inviato',
  }).eq('id', prev.id)

  return { signingUrl }
}
