// components/calendario/CodaDaPianificare.tsx
'use client'

import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CommessaOpzione } from '@/types/produzione'

/** Prefisso dell'id trascinabile: distingue le commesse dalle barre. */
export const PREFISSO_VOCE = 'coda:'

function VoceCommessa({ commessa }: { commessa: CommessaOpzione }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PREFISSO_VOCE}${commessa.id}`,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-md border border-gray-200 bg-white p-2 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      title="Trascina su un giorno per programmarla"
    >
      <div className="font-medium text-gray-900 dark:text-gray-100">
        {commessa.numero_commessa}
      </div>
      <div className="truncate text-gray-600 dark:text-gray-300">
        {commessa.cliente_nome}
      </div>
    </div>
  )
}

/**
 * Le commesse aperte, da trascinare sul calendario. Una riga per commessa: il
 * tipo di attivita' si sceglie nel dialog, dove si stanno gia' scrivendo gli
 * orari.
 */
export default function CodaDaPianificare({
  commesse,
}: {
  commesse: CommessaOpzione[]
}) {
  const [ricerca, setRicerca] = useState('')

  const filtrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    if (!q) return commesse
    return commesse.filter(
      (c) =>
        c.numero_commessa.toLowerCase().includes(q) ||
        (c.cliente_nome ?? '').toLowerCase().includes(q)
    )
  }, [commesse, ricerca])

  return (
    <aside className="flex w-56 shrink-0 flex-col rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Commesse aperte
      </h2>

      <div className="relative mt-2">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca"
          className="h-8 pl-7 text-xs"
        />
      </div>

      {filtrate.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {commesse.length === 0 ? 'Nessuna commessa aperta.' : 'Nessun risultato.'}
        </p>
      ) : (
        <div className="mt-2 max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
          {filtrate.map((c) => (
            <VoceCommessa key={c.id} commessa={c} />
          ))}
        </div>
      )}
    </aside>
  )
}
