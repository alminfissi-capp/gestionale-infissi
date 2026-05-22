import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

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

/**
 * POST /api/avvia-firma
 *
 * Body JSON: { shareToken, telefono, pdfBase64, pdfName }
 *
 * Flusso:
 * 1. Valida il PDF ricevuto dal client
 * 2. Carica il PDF su Supabase storage (firma-temp/{prevId}/{firmaToken}.pdf)
 * 3. Salva token_conferma in DB (così /api/firma-pdf/[token] può trovare il file)
 * 4. Chiama openapi.it con URL proxy pubblico (GET /api/firma-pdf/[token])
 * 5. Aggiorna DB con firma_documento_id e firma_stato
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      shareToken: string
      telefono: string
      pdfBase64: string
      pdfName: string
    }
    const { shareToken, telefono, pdfBase64, pdfName } = body

    console.log('[avvia-firma] shareToken:', shareToken?.slice(0, 8), 'pdfBase64 length:', pdfBase64?.length)

    if (!shareToken) return NextResponse.json({ error: 'shareToken mancante' }, { status: 400 })
    if (!pdfBase64)  return NextResponse.json({ error: 'PDF mancante' }, { status: 400 })

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    console.log('[avvia-firma] Buffer length:', pdfBuffer.length)
    if (pdfBuffer.length === 0) {
      return NextResponse.json({ error: 'PDF ricevuto vuoto (0 byte dopo decodifica base64)' }, { status: 400 })
    }

    const header = pdfBuffer.slice(0, 5).toString('ascii')
    console.log('[avvia-firma] Header PDF:', JSON.stringify(header))
    if (!header.startsWith('%PDF')) {
      return NextResponse.json({ error: 'PDF non valido: header errato — ' + JSON.stringify(header) }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: prev } = await service
      .from('preventivi')
      .select('*')
      .eq('share_token', shareToken)
      .single()

    if (!prev) return NextResponse.json({ error: 'Preventivo non trovato' }, { status: 404 })
    if (prev.firma_stato === 'firmato')   return NextResponse.json({ error: 'Preventivo già firmato' }, { status: 400 })
    if (prev.firma_stato === 'in_attesa') return NextResponse.json({ error: 'Firma già in corso' }, { status: 400 })

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
    const signerName    = parts[0] || 'Cliente'
    const signerSurname = parts.slice(1).join(' ') || ' '
    const signerEmail   = snap.email || ''
    if (!telefono) return NextResponse.json({ error: 'Numero di cellulare obbligatorio per ricevere il codice OTP' }, { status: 400 })
    const signerMobile = normalizzaTelefono(telefono)

    const firmaToken = crypto.randomUUID()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    // 1. Carica PDF su Supabase storage
    const storagePath = `firma-temp/${prev.id}/${firmaToken}.pdf`
    const { error: uploadError } = await service.storage
      .from('commesse-docs')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      console.error('[avvia-firma] Upload Supabase error:', uploadError.message)
      return NextResponse.json({ error: 'Errore upload PDF: ' + uploadError.message }, { status: 500 })
    }
    console.log('[avvia-firma] PDF caricato su Supabase:', storagePath)

    // 2. Salva token_conferma in DB prima di chiamare openapi.it
    //    (così /api/firma-pdf/[token] può trovare il file)
    await service.from('preventivi').update({
      token_conferma: firmaToken,
      firma_stato: 'in_attesa',
      firma_richiesta_at: new Date().toISOString(),
      stato: 'inviato',
    }).eq('id', prev.id)

    // 3. Invia il PDF come base64 puro (EU-SES sourceType: 'base64')
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
      // Ripristina stato in caso di errore
      await service.from('preventivi').update({ firma_stato: null }).eq('id', prev.id)
      return NextResponse.json({ error: `openapi.it errore ${res.status}: ${err}` }, { status: 502 })
    }

    const json = await res.json()
    const responseData = json.data ?? json
    const documentId: string = responseData.id
    const signingUrl: string = responseData.signers?.[0]?.url ?? responseData.signers?.[0]?.signingUrl ?? ''

    if (!signingUrl) {
      await service.from('preventivi').update({ firma_stato: null }).eq('id', prev.id)
      return NextResponse.json({ error: 'openapi.it non ha restituito il link di firma' }, { status: 502 })
    }

    // 4. Aggiorna DB con firma_documento_id
    await service.from('preventivi').update({
      firma_documento_id: documentId,
    }).eq('id', prev.id)

    console.log('[avvia-firma] OK — documentId:', documentId, 'signingUrl:', signingUrl.slice(0, 60))
    return NextResponse.json({ signingUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore sconosciuto'
    console.error('[avvia-firma] Errore:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
