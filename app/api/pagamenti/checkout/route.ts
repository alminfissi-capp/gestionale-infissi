// Il cliente preme "Paga ora": si apre una sessione Stripe Checkout. L'importo NON arriva dal browser:
// lo ricalcola il motore dal database.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { dipendenzePagamenti } from '@/lib/pagamenti/dipendenze'
import { avviaPagamento, ErrorePagamento } from '@/lib/pagamenti/servizio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  let body: { token?: unknown; tipo?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ errore: 'Richiesta non valida' }, { status: 400 }) }
  const token = typeof body.token === 'string' ? body.token : ''
  const tipo = body.tipo === 'acconto' || body.tipo === 'saldo' ? body.tipo : null
  if (!UUID.test(token) || !tipo) return NextResponse.json({ errore: 'Richiesta non valida' }, { status: 400 })

  const { data: p } = await createServiceClient().from('preventivi').select('organization_id').eq('share_token', token).maybeSingle()
  if (!p) return NextResponse.json({ errore: 'Preventivo non trovato' }, { status: 404 })
  const d = await dipendenzePagamenti(p.organization_id as string)
  if (!d) return NextResponse.json({ errore: 'Pagamento online non disponibile' }, { status: 409 })
  try {
    const { url } = await avviaPagamento(token, tipo, d)
    return NextResponse.json({ url })
  } catch (e) {
    if (e instanceof ErrorePagamento) return NextResponse.json({ errore: e.message }, { status: e.status })
    console.error('[pagamenti] checkout', e)
    return NextResponse.json({ errore: 'Pagamento non avviato, riprova tra poco' }, { status: 500 })
  }
}
