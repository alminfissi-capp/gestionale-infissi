import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { registraCaricamento } from '@/lib/conferme-ordine-db'

/** Il file e' arrivato su Storage: lo si lega all'ordine (e alla commessa). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  let body: { tipo?: string; path?: string; nome?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  if ((body.tipo !== 'conferma' && body.tipo !== 'documento') || typeof body.path !== 'string') {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const esito = await registraCaricamento(token, body.tipo, body.path, String(body.nome ?? ''))
  if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: esito.status })
  // Il riquadro "Conferme da firmare" deve comparire al prossimo caricamento della pagina.
  revalidatePath('/produzione', 'layout')
  return NextResponse.json({ ok: true })
}
