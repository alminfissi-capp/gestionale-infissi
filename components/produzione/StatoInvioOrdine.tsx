'use client'

import { Circle, Mail, CheckCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { conFallbackInvio, righeTooltip, TRACKING_VUOTO } from '@/lib/produzione-tracking'
import type { TrackingOrdine } from '@/types/produzione'

interface Props {
  tracking?: TrackingOrdine
  /** Colonna `inviato_at` dell'ordine: copre gli invii precedenti al tracking. */
  inviatoAt: string | null
}

export default function StatoInvioOrdine({ tracking, inviatoAt }: Props) {
  const t = conFallbackInvio(tracking ?? TRACKING_VUOTO, inviatoAt)
  const righe = righeTooltip(t)
  const descrizione = righe.join(' · ')

  const icona =
    t.stato === 'letto' ? (
      <CheckCheck className="h-4 w-4 text-green-600" />
    ) : t.stato === 'inviato' ? (
      <Mail className="h-4 w-4 text-gray-400" />
    ) : (
      <Circle className="h-4 w-4 text-gray-300" />
    )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Niente attributo title: raddoppierebbe il tooltip di shadcn.
              L'aria-label porta lo stesso testo agli screen reader. */}
          <span className="inline-flex" role="img" aria-label={descrizione}>
            {icona}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {righe.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
