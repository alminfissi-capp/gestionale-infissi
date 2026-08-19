// components/calendario/BarraEvento.tsx
'use client'

import { ASPETTO_TIPO } from '@/types/calendario'
import { etichettaEvento } from '@/lib/calendario'
import type { EventoConContesto } from '@/types/calendario'

export const ALTEZZA_BARRA = 22

export default function BarraEvento({
  evento,
  sinistraPct,
  larghezzaPct,
  riga,
  onClick,
}: {
  evento: EventoConContesto
  sinistraPct: number
  larghezzaPct: number
  riga: number
  onClick?: () => void
}) {
  const aspetto = ASPETTO_TIPO[evento.tipo]

  return (
    <div
      className="absolute flex items-center overflow-hidden whitespace-nowrap rounded-sm px-1 text-[11px] leading-none shadow-sm"
      style={{
        left: `${sinistraPct}%`,
        width: `${larghezzaPct}%`,
        top: riga * ALTEZZA_BARRA,
        height: ALTEZZA_BARRA - 3,
        backgroundColor: aspetto.sfondo,
        color: aspetto.testo,
      }}
      onClick={onClick}
      title={etichettaEvento(evento)}
    >
      <span className="truncate font-medium">{etichettaEvento(evento)}</span>
      {evento.confermato_cliente && (
        <span className="ml-2 shrink-0 italic text-red-700">
          CONFERMATO CON IL CLIENTE
        </span>
      )}
      {evento.note && <span className="ml-2 shrink-0 opacity-80">{evento.note}</span>}
    </div>
  )
}
