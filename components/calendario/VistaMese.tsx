// components/calendario/VistaMese.tsx
'use client'

import { useMemo, useState } from 'react'
import { aspettoDi, GIORNI_SETTIMANA } from '@/types/calendario'
import { etichettaEvento, raggruppaPerGiorno, settimaneDelMese, statoGiorno } from '@/lib/calendario'
import type { AspettiTipo, Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

/** Quante righe stanno in una cella prima di collassare in "+n altri". */
const EVENTI_PER_CELLA = 3

export default function VistaMese({
  anno,
  mese,
  eventi,
  aspetti,
  orari,
  chiusure,
  onApriEvento,
  onNuovoImpegno,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  aspetti: AspettiTipo
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento: (evento: EventoConContesto) => void
  onNuovoImpegno: (data: string) => void
}) {
  const settimane = useMemo(() => settimaneDelMese(anno, mese), [anno, mese])
  const perGiorno = useMemo(() => raggruppaPerGiorno(eventi), [eventi])
  const [espansi, setEspansi] = useState<Set<string>>(new Set())

  const mm = String(mese).padStart(2, '0')

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-medium dark:border-gray-700 dark:bg-gray-800">
        {GIORNI_SETTIMANA.map((g) => (
          <div key={g} className="px-2 py-1 text-gray-600 dark:text-gray-300">
            {g.slice(0, 3)}
          </div>
        ))}
      </div>

      {settimane.map((settimana) => (
        <div key={settimana[0]} className="grid grid-cols-7">
          {settimana.map((data) => {
            const delMese = data.slice(0, 7) === `${anno}-${mm}`
            const stato = statoGiorno(data, orari, chiusure)
            const tutti = perGiorno.get(data) ?? []
            const aperto = espansi.has(data)
            const mostrati = aperto ? tutti : tutti.slice(0, EVENTI_PER_CELLA)
            const nascosti = tutti.length - mostrati.length

            return (
              <div
                key={data}
                onClick={() => onNuovoImpegno(data)}
                className={`min-h-24 cursor-pointer border-b border-r border-gray-200 p-1 last:border-r-0 dark:border-gray-700 ${
                  delMese ? '' : 'bg-gray-50/60 dark:bg-gray-900/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      delMese
                        ? 'text-gray-700 dark:text-gray-200'
                        : 'text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    {Number(data.slice(8, 10))}
                  </span>
                  {!stato.aperto && (
                    <span className="truncate text-[10px] text-red-600" title={stato.motivoChiusura}>
                      {stato.motivoChiusura}
                    </span>
                  )}
                </div>

                <div className="mt-1 space-y-0.5">
                  {mostrati.map((e) => (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onApriEvento(e)
                      }}
                      className="truncate rounded-sm px-1 text-[11px] leading-tight"
                      style={{
                        backgroundColor: aspettoDi(aspetti, e.tipo).sfondo,
                        color: aspettoDi(aspetti, e.tipo).testo,
                      }}
                      title={etichettaEvento(e, aspetti)}
                    >
                      {!e.tutto_il_giorno && (
                        <span className="mr-1 font-mono">{e.ora_inizio.slice(0, 5)}</span>
                      )}
                      {etichettaEvento(e, aspetti)}
                    </div>
                  ))}

                  {nascosti > 0 && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setEspansi((prec) => new Set(prec).add(data))
                      }}
                      className="text-[11px] text-gray-500 hover:underline dark:text-gray-400"
                    >
                      +{nascosti} altri
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
