import { NextResponse } from 'next/server'
import { getConfermaFirmataPubblica, registraAperturaConferma } from '@/lib/conferme-ordine-db'

/** Beacon della pagina della conferma firmata: parte solo eseguendo JavaScript. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const conferma = await getConfermaFirmataPubblica(token)
  if (conferma) await registraAperturaConferma(conferma.id)
  return new NextResponse(null, { status: 204 })
}
