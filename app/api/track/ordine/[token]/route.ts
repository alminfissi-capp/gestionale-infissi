import { NextRequest, NextResponse } from 'next/server'
import { getOrdinePerToken, registraEvento } from '@/lib/produzione-tracking-db'

// GIF 1×1 trasparente
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

const rispostaPixel = () =>
  new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  })

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ordine = await getOrdinePerToken(token)

  // Token sconosciuto: rispondiamo comunque con l'immagine, senza rivelare nulla.
  if (ordine) {
    await registraEvento(ordine.id, ordine.organizationId, 'email_aperta', {
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for'),
      // I client di posta richiedono l'immagine più volte per una sola apertura.
      dedupSecondi: 60,
    })
  }

  return rispostaPixel()
}
