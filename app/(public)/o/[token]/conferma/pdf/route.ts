import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getConfermaFirmataPubblica, registraAperturaConferma } from '@/lib/conferme-ordine-db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const conferma = await getConfermaFirmataPubblica(token)
  if (!conferma) return new NextResponse('Documento non disponibile', { status: 404 })

  const { data, error } = await createServiceClient()
    .storage.from('commesse-docs')
    .download(conferma.firmataPath)
  if (error || !data) return new NextResponse('Documento non disponibile', { status: 404 })

  await registraAperturaConferma(conferma.id)

  const numero = conferma.numeroOrdine.replace(/[\x00-\x1f\x7f"]/g, '').trim()
  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Conferma firmata ${numero || 'ordine'}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
