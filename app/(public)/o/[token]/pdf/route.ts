import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { getOrdinePerToken, registraEvento } from '@/lib/produzione-tracking-db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const ordine = await getOrdinePerToken(token)
  if (!ordine || !ordine.pdfInviatoPath) {
    return new NextResponse('Documento non disponibile', { status: 404 })
  }

  await registraEvento(ordine.id, ordine.organizationId, 'pdf_scaricato', {
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for'),
  })

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from('commesse-docs')
    .download(ordine.pdfInviatoPath)
  if (error || !data) {
    return new NextResponse('Documento non disponibile', { status: 404 })
  }

  const nomeFile = `${formattaNumeroOrdine(ordine.numeroOrdine) || 'Ordine'}.pdf`

  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'no-store',
    },
  })
}
