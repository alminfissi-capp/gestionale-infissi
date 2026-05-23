import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { NextRequest } from 'next/server'

const EU_SES_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://esignature.openapi.com'
    : 'https://test.esignature.openapi.com'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return Response.json({ error: 'token mancante' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'body non valido' }, { status: 400 })
  }

  console.log('[firma-callback] token:', token, 'body:', JSON.stringify(body))

  const documentId = body.id as string | undefined
  const state = (body.state as string | undefined)?.toUpperCase()

  const firmaStato =
    state === 'COMPLETED' ? 'firmato' :
    state === 'REJECTED'  ? 'rifiutato' :
    state === 'EXPIRED'   ? 'scaduto' :
    null

  // Stato intermedio (es. WAIT_VALIDATION) — nessuna azione
  if (!firmaStato) return Response.json({ ok: true })

  const service = createServiceClient()

  let q = service
    .from('preventivi')
    .select('id')
    .eq('token_conferma', token)

  if (documentId) q = q.eq('firma_documento_id', documentId)

  const { data: prev } = await q.single()
  if (!prev) return Response.json({ error: 'preventivo non trovato' }, { status: 404 })

  const updates: Record<string, unknown> = {
    firma_stato: firmaStato,
    firma_completata_at: firmaStato === 'firmato' ? new Date().toISOString() : null,
  }

  if (firmaStato === 'firmato') {
    updates.stato = 'accettato'

    // Scarica il PDF firmato da openapi.it e salvalo su Supabase
    if (documentId) {
      try {
        const pdfRes = await fetch(
          `${EU_SES_BASE}/signatures/${documentId}/signedDocument`,
          {
            headers: { Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}` },
            cache: 'no-store',
          }
        )
        if (pdfRes.ok) {
          const contentType = pdfRes.headers.get('content-type') ?? ''
          let pdfBuffer: Buffer | null = null

          if (contentType.includes('application/json')) {
            const json = await pdfRes.json()
            console.log('[firma-callback] risposta JSON download:', JSON.stringify(json).slice(0, 500))
            const downloadUrl: string | undefined =
              json.url ?? json.downloadUrl ?? json.data?.url ?? json.data?.downloadUrl
            if (downloadUrl) {
              const pdf2 = await fetch(downloadUrl)
              if (pdf2.ok) pdfBuffer = Buffer.from(await pdf2.arrayBuffer())
            }
          } else {
            pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
          }

          if (pdfBuffer && pdfBuffer.length > 0) {
            const storagePath = `firmati/${prev.id}/${documentId}.pdf`
            const { error: uploadErr } = await service.storage
              .from('commesse-docs')
              .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
            if (!uploadErr) {
              updates.firma_pdf_path = storagePath
              console.log('[firma-callback] PDF firmato salvato:', storagePath)
            } else {
              console.error('[firma-callback] upload error:', uploadErr.message)
            }
          } else {
            console.warn('[firma-callback] pdfBuffer vuoto o null')
          }
        } else {
          const errText = await pdfRes.text()
          console.error('[firma-callback] download PDF fallito:', pdfRes.status, errText.slice(0, 300))
        }
      } catch (e) {
        console.error('[firma-callback] errore download PDF firmato:', e)
      }
    }
  }

  await service.from('preventivi').update(updates).eq('id', prev.id)
  revalidatePath(`/preventivi/${prev.id}`)

  return Response.json({ ok: true })
}
