import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { NextRequest } from 'next/server'

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
    state === 'REJECTED' ? 'rifiutato' :
    state === 'EXPIRED' ? 'scaduto' :
    null

  // Stato intermedio (es. WAIT_VALIDATION) — nessuna azione necessaria
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
  }

  await service.from('preventivi').update(updates).eq('id', prev.id)

  revalidatePath(`/preventivi/${prev.id}`)

  return Response.json({ ok: true })
}
