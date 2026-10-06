import { NextResponse } from 'next/server'
import { preparaCaricamento } from '@/lib/conferme-ordine-db'

/** Il fornitore chiede dove caricare un file: risponde con un URL di upload firmato. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  let body: { tipo?: string; nome?: string; contentType?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  if (body.tipo !== 'conferma' && body.tipo !== 'documento') {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const esito = await preparaCaricamento(
    token, body.tipo, String(body.nome ?? ''), String(body.contentType ?? ''), Number(body.dimensione)
  )
  if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: esito.status })
  return NextResponse.json({ path: esito.path, uploadToken: esito.uploadToken })
}
