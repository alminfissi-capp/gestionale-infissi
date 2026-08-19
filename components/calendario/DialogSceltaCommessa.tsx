// components/calendario/DialogSceltaCommessa.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { CommessaOpzione } from '@/types/produzione'

const formattaData = (data: string) => data.split('-').reverse().join('/')

/**
 * Scelta della commessa dopo il clic su uno slot libero: prima si dice per chi
 * si sta programmando, poi si compila l'attivita'. "Senza commessa" resta
 * possibile, per le lavorazioni che non ne hanno una.
 */
export default function DialogSceltaCommessa({
  data,
  ora,
  commesse,
  onScegli,
  onClose,
}: {
  data: string
  ora: string
  commesse: CommessaOpzione[]
  onScegli: (commessa: CommessaOpzione | null) => void
  onClose: () => void
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
    <Dialog open onOpenChange={(aperto) => !aperto && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Commessa da programmare — {formattaData(data)} alle {ora}
          </DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca per numero o cliente"
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtrate.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onScegli(c)}
              className="flex w-full items-center justify-between rounded-md border border-gray-200 p-2 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <span className="font-medium">{c.numero_commessa}</span>
              <span className="ml-2 truncate text-gray-500 dark:text-gray-400">
                {c.cliente_nome}
              </span>
            </button>
          ))}
          {filtrate.length === 0 && (
            <p className="p-2 text-sm text-gray-500 dark:text-gray-400">
              Nessuna commessa aperta trovata.
            </p>
          )}
        </div>

        <Button type="button" variant="outline" onClick={() => onScegli(null)}>
          Senza commessa
        </Button>
      </DialogContent>
    </Dialog>
  )
}
