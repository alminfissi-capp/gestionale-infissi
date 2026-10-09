import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { registraCaricamentoFallito } from '@/lib/conferme-ordine-db'

/** Il fornitore non e' riuscito a caricare un file: lo si segnala nel cruscotto. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  let body: { tipo?: string; nome?: string; errore?: string; motivo?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  if (body.tipo !== 'conferma' && body.tipo !== 'documento') {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  console.error('[file fornitore] caricamento non riuscito:', { token, ...body })
  await registraCaricamentoFallito(token, {
    tipo: body.tipo,
    nome: String(body.nome ?? ''),
    errore: String(body.errore ?? ''),
    motivo: String(body.motivo ?? ''),
    userAgent: req.headers.get('user-agent'),
  })
  revalidatePath('/produzione', 'layout')
  return NextResponse.json({ ok: true })
}
