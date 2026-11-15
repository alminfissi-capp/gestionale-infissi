'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCreditoOpenapi } from '@/actions/openapi'
import type { EsitoCredito } from '@/lib/openapi-credito'
import { formatEuro } from '@/lib/pricing'

/** Saldo dei crediti openapi.it (firma elettronica): letto dal server, mai le credenziali nel browser. */
export default function CreditoOpenapi() {
  const [esito, setEsito] = useState<EsitoCredito | null>(null)
  const [aggiornato, setAggiornato] = useState<Date | null>(null)
  const [inCorso, avvia] = useTransition()

  const aggiorna = useCallback(() => {
    avvia(async () => {
      setEsito(await getCreditoOpenapi())
      setAggiornato(new Date())
    })
  }, [])

  useEffect(() => { aggiorna() }, [aggiorna])

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-0">
        {esito === null ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Lettura del saldo…</p>
        ) : esito.stato === 'ok' ? (
          <>
            <p className={`text-2xl font-semibold ${esito.credito < 10 ? 'text-red-600' : ''}`}>{formatEuro(esito.credito)}</p>
            <p className="text-xs text-muted-foreground">
              {esito.credito < 10 ? 'Credito quasi finito: ricaricarlo dalla console di openapi.it prima delle prossime firme. ' : ''}
              {aggiornato && `Aggiornato alle ${aggiornato.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </>
        ) : esito.stato === 'non_configurato' ? (
          <p className="text-sm text-muted-foreground">
            Per vedere il saldo servono l&apos;email dell&apos;account openapi.it e la sua APIkey: aggiungerle su Vercel
            come <code>OPENAPI_IT_EMAIL</code> e <code>OPENAPI_IT_APIKEY</code> (il token della firma non basta).
          </p>
        ) : (
          <p className="text-sm text-red-600">{esito.messaggio}</p>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={aggiorna} disabled={inCorso} className="ml-auto">
        {inCorso ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Aggiorna
      </Button>
    </div>
  )
}
