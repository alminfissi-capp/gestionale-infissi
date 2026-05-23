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

export async function getFirmaSignedUrl(path: string): Promise<string> {
  await getOrgId()
  const service = createServiceClient()
  const { data } = await service.storage
    .from('commesse-docs')
    .createSignedUrl(path, 3600)
  if (!data?.signedUrl) throw new Error('Impossibile generare URL download')
  return data.signedUrl
}

export async function verificaStatoFirma(
  preventivoId: string
): Promise<{ stato: string; aggiornato: boolean }> {
  const orgId = await getOrgId()
  const supabase = await createClient()

  const { data: prev } = await supabase
    .from('preventivi')
    .select('id, firma_documento_id, firma_stato')
    .eq('id', preventivoId)
    .eq('organization_id', orgId)
    .single()

  if (!prev) throw new Error('Preventivo non trovato')
  if (!prev.firma_documento_id) throw new Error('Nessun documento di firma associato')

  const res = await fetch(`${EU_SES_BASE}/EU-SES/${prev.firma_documento_id}`, {
    headers: { Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`openapi.it errore ${res.status}: ${err}`)
  }

  const json = await res.json()
  console.log('[verificaStatoFirma] risposta openapi.it:', JSON.stringify(json).slice(0, 500))

  const data = json.data ?? json
  const state = (data.state as string | undefined)?.toUpperCase()

  const firmaStato =
    state === 'COMPLETED' ? 'firmato' :
    state === 'REJECTED'  ? 'rifiutato' :
    state === 'EXPIRED'   ? 'scaduto' :
    null

  if (!firmaStato || firmaStato === prev.firma_stato) {
    return { stato: state ?? 'sconosciuto', aggiornato: false }
  }

  const service = createServiceClient()
  const updates: Record<string, unknown> = {
    firma_stato: firmaStato,
    firma_completata_at: firmaStato === 'firmato' ? new Date().toISOString() : null,
  }
  if (firmaStato === 'firmato') updates.stato = 'accettato'

  // Scarica il PDF firmato se disponibile
  if (firmaStato === 'firmato') {
    const downloadUrl: string | undefined =
      data?.downloadUrl ??
      data?.documents?.[0]?.downloadUrl ??
      data?.inputDocuments?.[0]?.downloadUrl ??
      data?.signedDocuments?.[0]?.url ??
      data?.signedDocuments?.[0]?.downloadUrl

    if (downloadUrl) {
      try {
        const pdfRes = await fetch(downloadUrl)
        if (pdfRes.ok) {
          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
          const storagePath = `firmati/${preventivoId}/${prev.firma_documento_id}.pdf`
          const { error: uploadErr } = await service.storage
            .from('commesse-docs')
            .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
          if (!uploadErr) updates.firma_pdf_path = storagePath
        }
      } catch (e) {
        console.error('[verificaStatoFirma] errore download PDF:', e)
      }
    }
  }

  await service.from('preventivi').update(updates).eq('id', preventivoId)
  revalidatePath(`/preventivi/${preventivoId}`)

  return { stato: state ?? 'sconosciuto', aggiornato: true }
}
