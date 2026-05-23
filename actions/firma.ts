'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

const EU_SES_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://esignature.openapi.com'
    : 'https://test.esignature.openapi.com'

function normalizzaTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return `+${digits}`
  if (digits.startsWith('0039')) return `+${digits.slice(4)}`
  if (digits.startsWith('39') && digits.length >= 11) return `+${digits}`
  return `+39${digits}`
}

export async function richiediFirmaPreventivo(
  preventivoId: string,
  formData: FormData
): Promise<{ signingUrl: string; token: string }> {
  const orgId = await getOrgId()
  const supabase = await createClient()

  const { data: prev } = await supabase
    .from('preventivi')
    .select('id, numero, cliente_snapshot')
    .eq('id', preventivoId)
    .eq('organization_id', orgId)
    .single()

  if (!prev) throw new Error('Preventivo non trovato')

  const pdfFile = formData.get('pdf') as File | null
  if (!pdfFile) throw new Error('PDF obbligatorio')

  const buffer = await pdfFile.arrayBuffer()
  const pdfBase64 = Buffer.from(buffer).toString('base64')
  const pdfName = pdfFile.name || `Preventivo_${prev.numero || prev.id}.pdf`

  // Token univoco per identificare questo processo di firma nel callback
  const { randomUUID } = await import('crypto')
  const token = randomUUID()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const s = prev.cliente_snapshot as {
    tipo?: string
    ragione_sociale?: string | null
    nome?: string | null
    cognome?: string | null
    email?: string | null
    telefono?: string | null
  }

  const nomeCompleto =
    s.tipo === 'azienda'
      ? (s.ragione_sociale || '')
      : [s.nome, s.cognome].filter(Boolean).join(' ')
  const parts = nomeCompleto.trim().split(/\s+/)
  const signerName = parts[0] || 'Cliente'
  const signerSurname = parts.slice(1).join(' ') || ' '
  const signerEmail = (formData.get('email') as string) || s.email || ''
  const rawMobile = (formData.get('telefono') as string) || s.telefono || ''
  const signerMobile = rawMobile ? normalizzaTelefono(rawMobile) : ''

  const payload = {
    inputDocuments: [{ sourceType: 'base64', payload: pdfBase64 }],
    signers: [
      {
        name: signerName,
        surname: signerSurname,
        email: signerEmail,
        mobile: signerMobile,
        authentication: ['sms'],
        signatures: [{ page: 1, x: '70', y: '680' }],
        language: 'it',
      },
    ],
    callbackUrl: `${appUrl}/api/firma-callback?token=${token}`,
    redirectUrl: `${appUrl}/conferma/${token}/grazie`,
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
  const signingUrl: string =
    responseData.signers?.[0]?.url ??
    responseData.signers?.[0]?.signingUrl ??
    ''

  if (!signingUrl) throw new Error('openapi.it non ha restituito il link di firma')

  const service = createServiceClient()
  await service
    .from('preventivi')
    .update({
      token_conferma: token,
      firma_documento_id: documentId,
      firma_signing_url: signingUrl,
      firma_stato: 'in_attesa',
      firma_richiesta_at: new Date().toISOString(),
    })
    .eq('id', preventivoId)

  revalidatePath(`/preventivi/${preventivoId}`)

  return { signingUrl, token }
}

export async function verificaERecuperaFirma(
  preventivoId: string
): Promise<{ firmato: boolean; pdfPath?: string }> {
  const orgId = await getOrgId()
  const supabase = await createClient()

  const { data: prev } = await supabase
    .from('preventivi')
    .select('id, firma_documento_id, firma_pdf_path, firma_stato')
    .eq('id', preventivoId)
    .eq('organization_id', orgId)
    .single()

  if (!prev) return { firmato: false }
  if (prev.firma_stato === 'firmato') return { firmato: true, pdfPath: prev.firma_pdf_path ?? undefined }
  if (!prev.firma_documento_id) return { firmato: false }

  try {
    const pdfRes = await fetch(
      `https://esignature.openapi.com/signatures/${prev.firma_documento_id}/signedDocument`,
      { headers: { Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}` }, cache: 'no-store' }
    )

    if (!pdfRes.ok) return { firmato: false }

    const contentType = pdfRes.headers.get('content-type') ?? ''
    let pdfBuffer: Buffer | null = null

    if (contentType.includes('application/json')) {
      const json = await pdfRes.json()
      const downloadUrl: string | undefined =
        json.url ?? json.downloadUrl ?? json.data?.url ?? json.data?.downloadUrl
      if (downloadUrl) {
        const pdf2 = await fetch(downloadUrl)
        if (pdf2.ok) pdfBuffer = Buffer.from(await pdf2.arrayBuffer())
      }
    } else {
      pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    }

    const service = createServiceClient()
    const updates: Record<string, unknown> = {
      firma_stato: 'firmato',
      firma_completata_at: new Date().toISOString(),
      stato: 'accettato',
    }

    if (pdfBuffer && pdfBuffer.length > 0) {
      const storagePath = `firmati/${preventivoId}/${prev.firma_documento_id}.pdf`
      const { error: uploadErr } = await service.storage
        .from('commesse-docs')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
      if (!uploadErr) updates.firma_pdf_path = storagePath
    }

    await service.from('preventivi').update(updates).eq('id', preventivoId)
    revalidatePath(`/preventivi/${preventivoId}`)

    return { firmato: true, pdfPath: (updates.firma_pdf_path as string) ?? undefined }
  } catch {
    return { firmato: false }
  }
}

export async function getFirmaSignedUrl(path: string): Promise<string> {
  await getOrgId()
  const service = createServiceClient()
  const { data } = await service.storage
    .from('commesse-docs')
    .createSignedUrl(path, 3600)
  if (!data?.signedUrl) throw new Error('Impossibile generare URL download')
  return data.signedUrl
}

export async function recuperaPdfFirmato(
  preventivoId: string
): Promise<{ path: string }> {
  const orgId = await getOrgId()
  const supabase = await createClient()

  const { data: prev } = await supabase
    .from('preventivi')
    .select('id, firma_documento_id, firma_pdf_path')
    .eq('id', preventivoId)
    .eq('organization_id', orgId)
    .single()

  if (!prev) throw new Error('Preventivo non trovato')
  if (!prev.firma_documento_id) throw new Error('Nessun documento di firma associato')

  if (prev.firma_pdf_path) return { path: prev.firma_pdf_path }

  const pdfRes = await fetch(
    `https://esignature.openapi.com/signatures/${prev.firma_documento_id}/signedDocument`,
    {
      headers: { Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}` },
      cache: 'no-store',
    }
  )

  if (!pdfRes.ok) {
    const err = await pdfRes.text()
    throw new Error(`openapi.it errore ${pdfRes.status}: ${err.slice(0, 200)}`)
  }

  const contentType = pdfRes.headers.get('content-type') ?? ''
  let pdfBuffer: Buffer

  if (contentType.includes('application/json')) {
    const json = await pdfRes.json()
    const downloadUrl: string | undefined =
      json.url ?? json.downloadUrl ?? json.data?.url ?? json.data?.downloadUrl
    if (!downloadUrl) throw new Error('URL download non trovato nella risposta')
    const pdf2 = await fetch(downloadUrl)
    if (!pdf2.ok) throw new Error(`Download PDF fallito: ${pdf2.status}`)
    pdfBuffer = Buffer.from(await pdf2.arrayBuffer())
  } else {
    pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
  }

  if (pdfBuffer.length === 0) throw new Error('PDF ricevuto vuoto')

  const service = createServiceClient()
  const storagePath = `firmati/${preventivoId}/${prev.firma_documento_id}.pdf`
  const { error: uploadErr } = await service.storage
    .from('commesse-docs')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) throw new Error('Errore upload PDF: ' + uploadErr.message)

  await service.from('preventivi').update({ firma_pdf_path: storagePath }).eq('id', preventivoId)
  revalidatePath(`/preventivi/${preventivoId}`)

  return { path: storagePath }
}
