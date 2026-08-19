// components/calendario/CalendarioAmministrazione.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { aggiungiGiorni, settimanaDi } from '@/lib/calendario'
import { ASPETTO_TIPO, TIPI_ADMIN } from '@/types/calendario'
import VistaMese from './VistaMese'
import VistaAgenda from './VistaAgenda'
import DialogEventoAdmin, { type NuovoImpegno } from './DialogEventoAdmin'
import { NOMI_MESI } from './CalendarioProduzione'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

export type VistaCalendario = 'mese' | 'settimana' | 'giorno'

const ETICHETTA_VISTA: Record<VistaCalendario, string> = {
  mese: 'Mese',
  settimana: 'Settimana',
  giorno: 'Giorno',
}

const formattaGiorno = (data: string) =>
  `${Number(data.slice(8, 10))} ${NOMI_MESI[Number(data.slice(5, 7)) - 1]} ${data.slice(0, 4)}`

export default function CalendarioAmministrazione({
  vista,
  data,
  eventi,
  orari,
  chiusure,
  commesse,
  modificabile,
}: {
  vista: VistaCalendario
  /** Giorno di riferimento: il mese, la settimana o il giorno mostrato. */
  data: string
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  commesse: CommessaOpzione[]
  modificabile: boolean
}) {
  const router = useRouter()
  const [inCorso, startTransition] = useTransition()
  const [eventoAperto, setEventoAperto] = useState<EventoConContesto | null>(null)
  const [nuovo, setNuovo] = useState<NuovoImpegno | null>(null)

  const anno = Number(data.slice(0, 4))
  const mese = Number(data.slice(5, 7))

  const vaiA = (nuovaData: string, nuovaVista: VistaCalendario = vista) => {
    startTransition(() => {
      router.push(`/calendario?vista=${nuovaVista}&data=${nuovaData}`)
    })
  }

  const scorri = (verso: 1 | -1) => {
    if (vista === 'mese') {
      const d = new Date(anno, mese - 1 + verso, 1)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      vaiA(`${d.getFullYear()}-${mm}-01`)
      return
    }
    vaiA(aggiungiGiorni(data, verso * (vista === 'settimana' ? 7 : 1)))
  }

  const oggi = new Date()
  const dataOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`

  const titolo = vista === 'mese'
    ? `${NOMI_MESI[mese - 1]} ${anno}`
    : vista === 'giorno'
      ? formattaGiorno(data)
      : `${formattaGiorno(settimanaDi(data)[0])} – ${formattaGiorno(settimanaDi(data)[6])}`

  const apriNuovo = (giorno: string, ora = '09:00') => {
    if (!modificabile) return
    const [h, m] = ora.split(':')
    const fine = `${String(Number(h) + 1).padStart(2, '0')}:${m}`
    setNuovo({ data: giorno, ora_inizio: ora, ora_fine: fine, tipo: 'appuntamento' })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <Button variant="outline" size="sm" onClick={() => scorri(-1)} disabled={inCorso}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-56 text-center text-lg font-semibold">{titolo}</h1>
          <Button variant="outline" size="sm" onClick={() => scorri(1)} disabled={inCorso}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => vaiA(dataOggi)} disabled={inCorso}>
            Oggi
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-gray-200 dark:border-gray-700">
            {(Object.keys(ETICHETTA_VISTA) as VistaCalendario[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => vaiA(data, v)}
                className={`px-3 py-1 text-xs ${
                  v === vista
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                {ETICHETTA_VISTA[v]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            {TIPI_ADMIN.map((tipo) => (
              <span key={tipo} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: ASPETTO_TIPO[tipo].sfondo }}
                />
                {ASPETTO_TIPO[tipo].label}
              </span>
            ))}
          </div>

          {modificabile && (
            <Button size="sm" onClick={() => apriNuovo(dataOggi)}>
              <Plus className="mr-1 h-4 w-4" />
              Nuovo impegno
            </Button>
          )}
        </div>
      </div>

      {vista === 'mese' ? (
        <VistaMese
          anno={anno}
          mese={mese}
          eventi={eventi}
          orari={orari}
          chiusure={chiusure}
          onApriEvento={setEventoAperto}
          onNuovoImpegno={(giorno) => apriNuovo(giorno)}
        />
      ) : (
        <VistaAgenda
          giorni={vista === 'settimana' ? settimanaDi(data) : [data]}
          eventi={eventi}
          orari={orari}
          chiusure={chiusure}
          onApriEvento={setEventoAperto}
          onNuovoImpegno={apriNuovo}
        />
      )}

      {(eventoAperto || nuovo) && (
        <DialogEventoAdmin
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
