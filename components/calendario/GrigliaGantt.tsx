// components/calendario/GrigliaGantt.tsx
'use client'

import { useMemo } from 'react'
import {
  fasciaGriglia,
  impilaEventi,
  minutiDaOra,
  oraDaMinuti,
  posizioneBarra,
  statoGiorno,
} from '@/lib/calendario'
import BarraEvento, { ALTEZZA_BARRA } from './BarraEvento'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

const ALTEZZA_MINIMA_RIGA = 34

/** Etichette a ora piena da mostrare in testata. */
function oreDellaFascia(inizio: string, fine: string): string[] {
  const ore: string[] = []
  const primaOra = Math.ceil(minutiDaOra(inizio) / 60) * 60
  for (let m = primaOra; m <= minutiDaOra(fine); m += 60) ore.push(oraDaMinuti(m))
  return ore
}

/** Tutti i giorni del mese in forma 'YYYY-MM-DD'. */
export function giorniDelMese(anno: number, mese: number): string[] {
  const ultimo = new Date(anno, mese, 0).getDate()
  const mm = String(mese).padStart(2, '0')
  return Array.from(
    { length: ultimo },
    (_, i) => `${anno}-${mm}-${String(i + 1).padStart(2, '0')}`
  )
}

export default function GrigliaGantt({
  anno,
  mese,
  eventi,
  orari,
  chiusure,
  onApriEvento,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento?: (evento: EventoConContesto) => void
}) {
  const fascia = useMemo(() => fasciaGriglia(orari), [orari])
  const ore = useMemo(() => oreDellaFascia(fascia.inizio, fascia.fine), [fascia])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])

  const eventiPerGiorno = useMemo(() => {
    const mappa = new Map<string, EventoConContesto[]>()
    for (const e of eventi) {
      if (!mappa.has(e.data)) mappa.set(e.data, [])
      mappa.get(e.data)!.push(e)
    }
    return mappa
  }, [eventi])

  return (
    <div className="gantt-scroll overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="min-w-[900px]">
        {/* Testata delle ore */}
        <div className="flex border-b border-gray-300 bg-gray-50 text-xs font-medium dark:border-gray-600 dark:bg-gray-800">
          <div className="w-14 shrink-0 border-r border-gray-300 px-2 py-1 dark:border-gray-600">
            Giorno
          </div>
          <div className="relative flex-1 py-1">
            {ore.map((ora) => (
              <span
                key={ora}
                className="absolute -translate-x-1/2 text-gray-600 dark:text-gray-300"
                style={{ left: `${posizioneBarra(ora, ora, fascia).sinistraPct}%` }}
              >
                {ora}
              </span>
            ))}
          </div>
        </div>

        {/* Una riga per giorno */}
        {giorni.map((data) => {
          const stato = statoGiorno(data, orari, chiusure)
          const delGiorno = eventiPerGiorno.get(data) ?? []
          const impilati = impilaEventi(delGiorno)
          const numeroRighe = impilati.reduce((max, e) => Math.max(max, e.riga + 1), 0)
          const altezza = Math.max(ALTEZZA_MINIMA_RIGA, numeroRighe * ALTEZZA_BARRA + 6)
          // `StatoGiorno` e' un'unione discriminata: gli orari esistono solo a
          // giorno aperto, quindi la fascia grigia si calcola dentro il ramo.
          const oltreChiusura = stato.aperto
            ? posizioneBarra(stato.chiusura, fascia.fine, fascia)
            : null

          return (
            <div
              key={data}
              className="gantt-giorno flex border-b border-gray-200 dark:border-gray-700"
              style={{ height: altezza }}
            >
              <div
                className={`flex w-14 shrink-0 items-center justify-center border-r border-gray-300 text-sm font-semibold dark:border-gray-600 ${
                  stato.aperto
                    ? 'bg-[#A6D64B] text-[#152300]'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {Number(data.slice(8, 10))}
              </div>

              <div className="relative flex-1">
                {/* Righe verticali a ora piena */}
                {ore.map((ora) => (
                  <div
                    key={ora}
                    className="absolute inset-y-0 w-px bg-gray-100 dark:bg-gray-800"
                    style={{ left: `${posizioneBarra(ora, ora, fascia).sinistraPct}%` }}
                  />
                ))}

                {stato.aperto ? (
                  <>
                    {/* Mezza giornata: la fascia oltre la chiusura e' grigia */}
                    {oltreChiusura && oltreChiusura.larghezzaPct > 0 && (
                      <div
                        className="absolute inset-y-0 bg-gray-200/70 dark:bg-gray-700/50"
                        style={{
                          left: `${oltreChiusura.sinistraPct}%`,
                          width: `${oltreChiusura.larghezzaPct}%`,
                        }}
                      />
                    )}
                    {impilati.map((e) => {
                      const p = posizioneBarra(e.ora_inizio, e.ora_fine, fascia)
                      return (
                        <BarraEvento
                          key={e.id}
                          evento={e}
                          sinistraPct={p.sinistraPct}
                          larghezzaPct={p.larghezzaPct}
                          riga={e.riga}
                          onClick={onApriEvento ? () => onApriEvento(e) : undefined}
                        />
                      )
                    })}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center bg-red-600 px-3 text-xs font-semibold text-white">
                    CHIUSO — {stato.motivoChiusura}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
