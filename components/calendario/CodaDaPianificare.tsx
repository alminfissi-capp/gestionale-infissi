// components/calendario/CodaDaPianificare.tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { AlertTriangle } from 'lucide-react'
import { ASPETTO_TIPO } from '@/types/calendario'
import type { VoceDaPianificare } from '@/types/calendario'

/** Prefisso dell'id trascinabile: distingue le voci della coda dalle barre. */
export const PREFISSO_VOCE = 'coda:'

function VoceTrascinabile({
  idDraggable,
  children,
}: {
  idDraggable: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: idDraggable })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-md border border-gray-200 bg-white p-2 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {children}
    </div>
  )
}

export default function CodaDaPianificare({ voci }: { voci: VoceDaPianificare[] }) {
  if (voci.length === 0) {
    return (
      <aside className="w-64 shrink-0 rounded-lg border border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Niente da pianificare.
      </aside>
    )
  }

  return (
    <aside className="w-64 shrink-0 space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Da pianificare
      </h2>

      {voci.map((voce) =>
        voce.genere === 'commessa' ? (
          voce.tipi_mancanti.map((tipo) => (
            <VoceTrascinabile
              key={`${voce.id}-${tipo}`}
              idDraggable={`${PREFISSO_VOCE}commessa:${voce.id}:${tipo}`}
            >
              <div className="flex items-center gap-1 font-medium">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: ASPETTO_TIPO[tipo].sfondo }}
                />
                {ASPETTO_TIPO[tipo].label}
              </div>
              <div className="text-gray-600 dark:text-gray-300">
                {voce.numero_commessa} — {voce.cliente_nome}
              </div>
            </VoceTrascinabile>
          ))
        ) : (
          <VoceTrascinabile
            key={voce.id}
            idDraggable={`${PREFISSO_VOCE}ordine:${voce.id}:${voce.tipo_ricezione}`}
          >
            <div className="flex items-center gap-1 font-medium">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: ASPETTO_TIPO[voce.tipo_ricezione].sfondo }}
              />
              {ASPETTO_TIPO[voce.tipo_ricezione].label}
            </div>
            <div className="text-gray-600 dark:text-gray-300">
              {voce.fornitore_nome ?? 'Fornitore ignoto'} · {voce.numero_ordine}
            </div>
            <div className="text-gray-400">
              cons. {voce.data_consegna_prevista.split('-').reverse().join('/')}
            </div>
            {voce.categoria_mancante && (
              <div className="mt-1 flex items-start gap-1 text-amber-600">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span>Categoria fornitore non impostata</span>
              </div>
            )}
          </VoceTrascinabile>
        )
      )}
    </aside>
  )
}
