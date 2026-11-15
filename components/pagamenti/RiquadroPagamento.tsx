'use client'

import { useState } from 'react'
import { CreditCard, Landmark, Loader2 } from 'lucide-react'
import { euro } from '@/lib/pagamenti/formato'
import type { SituazionePubblica } from '@/lib/pagamenti/situazione-pubblica'
import type { TipoPagamento } from '@/lib/pagamenti/tipi'

/** Riquadro "Pagamento" per il cliente: Paga ora (Stripe) e bonifico come alternativa. */
export default function RiquadroPagamento({ token, situazione: s }: { token: string; situazione: SituazionePubblica }) {
  const [inCorso, setInCorso] = useState<TipoPagamento | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  if (!s.pagabile && !s.bonifico && !s.inConferma) return null

  const paga = async (tipo: TipoPagamento) => {
    setInCorso(tipo)
    setErrore(null)
    try {
      const r = await fetch('/api/pagamenti/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, tipo }) })
      const j = await r.json() as { url?: string; errore?: string }
      if (!r.ok || !j.url) throw new Error(j.errore ?? 'Pagamento non avviato')
      window.location.href = j.url
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
      setInCorso(null)
    }
  }

  return (
    <section className="print:hidden max-w-[210mm] mx-auto my-6 bg-white rounded-xl border shadow-sm p-5 space-y-4 text-gray-900">
      <h2 className="text-lg font-semibold">Pagamento</h2>
      {s.giaPagato > 0 && <p className="text-sm text-green-700">Già ricevuti online: {euro(s.giaPagato)}</p>}
      {s.inConferma && <p className="text-sm text-amber-700">C&apos;è un pagamento in fase di conferma: l&apos;esito arriva entro pochi minuti.</p>}
      {s.pagabile && s.opzioni.map(o => (
        <div key={o.tipo} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">{o.etichetta}: {euro(o.importo)}</p>
            <p className="text-xs text-gray-500">
              Carta, PayPal, Apple Pay, Google Pay{o.rateIndicative.length > 0 ? ` o a rate con ${o.rateIndicative.join(' o ')}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => paga(o.tipo)} disabled={inCorso !== null || s.inConferma}
            className="inline-flex items-center gap-2 rounded-md bg-[#0E8F9C] px-4 py-2 text-white font-medium disabled:opacity-60">
            {inCorso === o.tipo ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} Paga ora
          </button>
        </div>
      ))}
      {!s.pagabile && s.messaggio && !s.inConferma && <p className="text-sm text-gray-600">{s.messaggio}</p>}
      {errore && <p className="text-sm text-red-600">{errore}</p>}
      {s.bonifico && (
        <div className="rounded-lg bg-gray-50 p-4 text-sm space-y-1">
          <p className="font-medium flex items-center gap-2"><Landmark className="size-4" /> {s.pagabile ? 'Oppure con bonifico' : 'Bonifico'}</p>
          <p>Intestatario: {s.bonifico.intestatario}</p>
          <p>IBAN: <span className="font-mono">{s.bonifico.iban}</span></p>
          <p>Causale: {s.bonifico.causale}</p>
        </div>
      )}
    </section>
  )
}
