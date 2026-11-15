import Link from 'next/link'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import { euro } from '@/lib/pagamenti/formato'

export const metadata = { title: 'Esito del pagamento' }
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
  searchParams: Promise<{ sessione?: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ritorno da Stripe Checkout. Lo stato vero lo scrive il webhook: se non e' ancora arrivato, "in conferma". */
export default async function EsitoPagamentoPage({ params, searchParams }: Props) {
  const { token } = await params
  const { sessione } = await searchParams
  let stato: string | null = null
  let importo = 0
  if (UUID.test(token) && sessione && sessione.length < 200) {
    const service = createServiceClient()
    const { data: p } = await service.from('preventivi').select('id').eq('share_token', token).maybeSingle()
    if (p) {
      const { data: pag } = await service.from('pagamenti_online').select('stato, importo')
        .eq('preventivo_id', p.id).eq('stripe_session_id', sessione).maybeSingle()
      stato = (pag?.stato as string | undefined) ?? null
      importo = Number(pag?.importo ?? 0)
    }
  }
  const pagato = stato === 'pagato'
  const fallito = stato === 'fallito' || stato === 'scaduto' || stato === 'annullato'
  const qui = `/p/${token}/esito?sessione=${encodeURIComponent(sessione ?? '')}`

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border max-w-md w-full p-10 text-center space-y-4 text-gray-900">
        <div className="flex justify-center">
          {pagato ? <CheckCircle className="h-16 w-16 text-green-500" /> : fallito ? <XCircle className="h-16 w-16 text-red-500" /> : <Clock className="h-16 w-16 text-amber-500" />}
        </div>
        <h1 className="text-2xl font-bold">
          {pagato ? 'Pagamento ricevuto, grazie!' : fallito ? 'Pagamento non riuscito' : 'Pagamento in conferma'}
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          {pagato ? `Abbiamo ricevuto ${euro(importo)}. Riceverai la ricevuta da Stripe via email.`
            : fallito ? 'Il pagamento non è andato a buon fine. Puoi riprovare dal preventivo.'
              : 'Stiamo aspettando la conferma del pagamento: di solito arriva in pochi secondi, per alcuni metodi in qualche minuto.'}
        </p>
        <div className="flex justify-center gap-3 pt-2 text-sm">
          {!pagato && !fallito && <Link href={qui} className="rounded-md border px-4 py-2">Aggiorna</Link>}
          <Link href={`/p/${token}`} className="rounded-md bg-[#0E8F9C] px-4 py-2 text-white">Torna al preventivo</Link>
        </div>
      </div>
    </div>
  )
}
