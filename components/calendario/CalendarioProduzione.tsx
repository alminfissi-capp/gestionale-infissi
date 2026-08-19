// components/calendario/CalendarioProduzione.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ASPETTO_TIPO, TIPI_PRODUZIONE } from '@/types/calendario'
import GrigliaGantt from './GrigliaGantt'
import DialogEvento, { type NuovoEvento } from './DialogEvento'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

export const NOMI_MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export default function CalendarioProduzione({
  anno,
  mese,
  eventi,
  orari,
  chiusure,
  commesse,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  commesse: CommessaOpzione[]
}) {
  const router = useRouter()
  const [inCorso, startTransition] = useTransition()
  const [eventoAperto, setEventoAperto] = useState<EventoConContesto | null>(null)
  const [nuovo, setNuovo] = useState<NuovoEvento | null>(null)

  const vaiA = (deltaMesi: number) => {
    const d = new Date(anno, mese - 1 + deltaMesi, 1)
    startTransition(() => {
      router.push(
        `/produzione/calendario?anno=${d.getFullYear()}&mese=${d.getMonth() + 1}`
      )
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="no-stampa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => vaiA(-1)} disabled={inCorso}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-48 text-center text-lg font-semibold">
            {NOMI_MESI[mese - 1]} {anno}
          </h1>
          <Button variant="outline" size="sm" onClick={() => vaiA(1)} disabled={inCorso}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {TIPI_PRODUZIONE.map((tipo) => (
              <span key={tipo} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: ASPETTO_TIPO[tipo].sfondo }}
                />
                {ASPETTO_TIPO[tipo].label}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            Stampa
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setNuovo({
                data: new Date().toISOString().slice(0, 10),
                ora_inizio: '08:00',
                ora_fine: '17:30',
                tipo: 'lavorazione',
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuova attività
          </Button>
        </div>
      </div>

      <GrigliaGantt
        anno={anno}
        mese={mese}
        eventi={eventi}
        orari={orari}
        chiusure={chiusure}
        onApriEvento={setEventoAperto}
      />

      {(eventoAperto || nuovo) && (
        <DialogEvento
          evento={eventoAperto}
          nuovo={nuovo}
          commesse={commesse}
          onClose={() => {
            setEventoAperto(null)
            setNuovo(null)
          }}
        />
      )}
    </div>
  )
}
