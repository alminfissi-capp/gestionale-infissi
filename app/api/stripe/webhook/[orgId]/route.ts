// Ricevute dei pagamenti da Stripe. Il webhook lo crea WinStudio (Impostazioni → Collegamenti) con l'id
// dell'organizzazione nell'indirizzo; la firma si verifica col segreto di quell'organizzazione.
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { leggiSegreto } from '@/lib/integrazioni'
import { clientStripe } from '@/lib/pagamenti/gateway'
import { dipendenzePagamenti } from '@/lib/pagamenti/dipendenze'
import { gestisciEvento, normalizzaEventoStripe } from '@/lib/pagamenti/servizio'
import { inviaAvvisoPagamento } from '@/lib/pagamenti/avviso-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  if (!UUID.test(orgId)) return NextResponse.json({ errore: 'Non trovato' }, { status: 404 })
  const [segreto, d] = await Promise.all([leggiSegreto(orgId, 'stripe', 'segreto_webhook'), dipendenzePagamenti(orgId)])
  if (!segreto || !d) return NextResponse.json({ errore: 'Stripe non collegato' }, { status: 404 })

  const corpo = await req.text() // serve il corpo grezzo per verificare la firma
  let evento: Stripe.Event
  try {
    evento = clientStripe('sk_verifica_firma').webhooks.constructEvent(corpo, req.headers.get('stripe-signature') ?? '', segreto)
  } catch {
    return NextResponse.json({ errore: 'Firma non valida' }, { status: 400 })
  }

  const ev = normalizzaEventoStripe(evento)
  if (!ev) return NextResponse.json({ ricevuto: true, ignorato: evento.type })
  try {
    const r = await gestisciEvento(ev, d)
    if (ev.tipo === 'riuscito' && r.esito === 'aggiornato' && r.pagamento) await inviaAvvisoPagamento(r.pagamento)
    return NextResponse.json({ ricevuto: true, esito: r.esito })
  } catch (e) {
    // 500: Stripe riprova da solo nelle ore successive
    console.error('[pagamenti] errore webhook', evento.id, e)
    return NextResponse.json({ errore: 'Errore interno' }, { status: 500 })
  }
}
