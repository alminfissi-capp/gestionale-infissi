import { NextRequest, NextResponse } from 'next/server'
import { getOrdinePerToken, registraEvento } from '@/lib/produzione-tracking-db'

/**
 * Chiamato dal browser del fornitore dopo il mount della pagina. Volutamente
 * non registrato lato server: i filtri antispam aziendali visitano i link
 * contenuti nelle email ma non eseguono JavaScript, e produrrebbero letture
 * che non sono mai avvenute.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ordine = await getOrdinePerToken(token)

  if (ordine) {
    await registraEvento(ordine.id, ordine.organizationId, 'pagina_aperta', {
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for'),
      dedupSecondi: 60,
    })
  }

  return NextResponse.json({ ok: true })
}
