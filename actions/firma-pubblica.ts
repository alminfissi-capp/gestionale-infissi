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
 * Avvia il processo di firma EU-SES quando il cliente clicca "Accetta".
 * Il PDF è generato lato client e inviato come base64 string.
 * Viene passato direttamente a openapi.it come data URI (evita problemi
 * di fetch asincrono da URL esterni con asyncDocumentsValidation).
 */
export async function avviaFirmaPreventivo(
  shareToken: string,
  telefono: string,
  pdfBase64: string,
  pdfName: string
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

  // Validazione PDF ricevuto dal client
  console.log('[firma-pubblica] pdfBase64 length:', pdfBase64.length)
  if (!pdfBase64) throw new Error('PDF base64 mancante')

  const pdfBuffer = Buffer.from(pdfBase64, 'base64')
  console.log('[firma-pubblica] Buffer length dopo decodifica:', pdfBuffer.length)
  if (pdfBuffer.length === 0) throw new Error('PDF ricevuto vuoto (0 byte dopo decodifica base64)')

  const header = pdfBuffer.slice(0, 5).toString('ascii')
  console.log('[firma-pubblica] Header PDF:', JSON.stringify(header))
  if (!header.startsWith('%PDF')) throw new Error('PDF non valido: header errato — ' + JSON.stringify(header))

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

  const payload = {
    inputDocuments: [{ sourceType: 'base64', payload: pdfBase64 }],
    signers: [{
      name: signerName,
      surname: signerSurname,
      email: signerEmail,
      mobile: signerMobile,
      authentication: ['sms'],
      signatures: [{ page: 1, x: '70', y: '680' }],
      language: 'it',
    }],
    callback: {
      method: 'JSON',
      url: `${appUrl}/api/firma-callback?token=${firmaToken}`,
    },
    options: {
      signatureMode: ['typed', 'drawn'],
      ui: {
        completeUrl: `${appUrl}/conferma/${firmaToken}/grazie`,
        cancelUrl: `${appUrl}/conferma/${firmaToken}/grazie`,
      },
    },
  }

  console.log('[firma-pubblica] Chiamata openapi.it — pdfBase64 length:', pdfBase64.length)

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
    firma_signing_url: signingUrl,
    firma_stato: 'in_attesa',
    firma_richiesta_at: new Date().toISOString(),
    stato: 'inviato',
  }).eq('id', prev.id)

  console.log('[firma-pubblica] OK — documentId:', documentId, 'signingUrl:', signingUrl.slice(0, 60))
  return { signingUrl }
}
