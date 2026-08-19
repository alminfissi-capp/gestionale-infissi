// components/calendario/BarraEvento.tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { aspettoDi } from '@/types/calendario'
import { etichettaEvento, minutiDaOra, oraDaMinuti, snapMinuti } from '@/lib/calendario'
import type { AspettiTipo, EventoConContesto } from '@/types/calendario'

export const ALTEZZA_BARRA = 22

export default function BarraEvento({
  evento,
  aspetti,
  sinistraPct,
  larghezzaPct,
  riga,
  trascinabile,
  minutiPerPixel,
  onRidimensiona,
  onClick,
}: {
  evento: EventoConContesto
  aspetti: AspettiTipo
  sinistraPct: number
  larghezzaPct: number
  riga: number
  trascinabile?: boolean
  minutiPerPixel?: number
  onRidimensiona?: (id: string, oraInizio: string, oraFine: string) => void
  onClick?: () => void
}) {
  const aspetto = aspettoDi(aspetti, evento.tipo)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: evento.id,
    disabled: !trascinabile,
  })

  const avviaResize = (lato: 'inizio' | 'fine') => (e: React.PointerEvent) => {
    if (!onRidimensiona || !minutiPerPixel) return
    e.preventDefault()
    e.stopPropagation()

    const xPartenza = e.clientX
    const inizioPartenza = minutiDaOra(evento.ora_inizio)
    const finePartenza = minutiDaOra(evento.ora_fine)
    let ultimoInizio = inizioPartenza
    let ultimaFine = finePartenza

    const muovi = (ev: PointerEvent) => {
      const delta = snapMinuti((ev.clientX - xPartenza) * minutiPerPixel)
      ultimoInizio = lato === 'inizio'
        ? Math.min(finePartenza - 30, inizioPartenza + delta)
        : inizioPartenza
      ultimaFine = lato === 'fine'
        ? Math.max(inizioPartenza + 30, finePartenza + delta)
        : finePartenza
    }

    // Il salvataggio avviene al rilascio: a ogni movimento sarebbero decine
    // di scritture sul database per una sola trascinata.
    const rilascia = () => {
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', rilascia)
      if (ultimoInizio !== inizioPartenza || ultimaFine !== finePartenza) {
        onRidimensiona(evento.id, oraDaMinuti(ultimoInizio), oraDaMinuti(ultimaFine))
      }
    }

    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', rilascia)
  }

  return (
    <div
      ref={setNodeRef}
      {...(trascinabile ? { ...listeners, ...attributes } : {})}
      className="absolute flex items-center overflow-hidden whitespace-nowrap rounded-sm px-1 text-[11px] leading-none shadow-sm"
      style={{
        left: `${sinistraPct}%`,
        width: `${larghezzaPct}%`,
        top: riga * ALTEZZA_BARRA,
        height: ALTEZZA_BARRA - 3,
        backgroundColor: aspetto.sfondo,
        color: aspetto.testo,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.6 : 1,
        cursor: trascinabile ? 'grab' : 'pointer',
        zIndex: isDragging ? 20 : undefined,
      }}
      // Il clic non deve arrivare alla pista sotto, che aprirebbe anche la
      // scelta della commessa per uno slot nuovo.
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      title={etichettaEvento(evento, aspetti)}
    >
      <span className="truncate font-medium">{etichettaEvento(evento, aspetti)}</span>
      {evento.confermato_cliente && (
        <span className="ml-2 shrink-0 italic text-red-700">
          CONFERMATO CON IL CLIENTE
        </span>
      )}
      {evento.note && <span className="ml-2 shrink-0 opacity-80">{evento.note}</span>}
      {onRidimensiona && (
        <>
          <span
            onPointerDown={avviaResize('inizio')}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
            aria-label="Sposta l’inizio"
          />
          <span
            onPointerDown={avviaResize('fine')}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
            aria-label="Sposta la fine"
          />
        </>
      )}
    </div>
  )
}
