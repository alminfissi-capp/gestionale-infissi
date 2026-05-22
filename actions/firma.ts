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
    inputDocuments: [
      {
        uri: `data:application/pdf;base64,${pdfBase64}`,
        title: pdfName,
      },
    ],
    signers: [
      {
        name: signerName,
        surname: signerSurname,
        email: signerEmail,
        mobile: signerMobile,
        authentication: ['sms'],
        signatures: [
          {
            documentTitle: pdfName,
            pageNumber: 1,
            x: 70,
            y: 680,
            signatureName: 'Firma Cliente',
          },
        ],
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
