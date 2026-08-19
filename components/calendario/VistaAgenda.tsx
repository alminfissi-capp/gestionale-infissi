// components/calendario/VistaAgenda.tsx
'use client'

import { useMemo } from 'react'
import { aspettoDi, GIORNI_SETTIMANA } from '@/types/calendario'
import {
  etichettaEvento, impilaEventi, indiceGiornoSettimana, minutiDaOra,
  oraDaMinuti, raggruppaPerGiorno, statoGiorno,
} from '@/lib/calendario'
import type { AspettiTipo, Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

/** La giornata mostrata va dalle 7 alle 21: fuori non si prendono appuntamenti. */
const PRIMA_ORA = 7
const ULTIMA_ORA = 21
const ALTEZZA_ORA = 48

const ORE = Array.from({ length: ULTIMA_ORA - PRIMA_ORA + 1 }, (_, i) =>
  oraDaMinuti((PRIMA_ORA + i) * 60)
)

/** Posizione verticale di un evento, in pixel dall'inizio della giornata. */
function posizione(oraInizio: string, oraFine: string) {
  const base = PRIMA_ORA * 60
  const inizio = Math.max(minutiDaOra(oraInizio) - base, 0)
  const fine = Math.min(minutiDaOra(oraFine) - base, (ULTIMA_ORA - PRIMA_ORA) * 60)
  const px = (m: number) => (m / 60) * ALTEZZA_ORA
  return { top: px(inizio), height: Math.max(px(fine - inizio), 18) }
}

export default function VistaAgenda({
  giorni,
  eventi,
  aspetti,
  orari,
  chiusure,
  onApriEvento,
  onNuovoImpegno,
}: {
  /** Uno solo per la vista giorno, sette per la settimana. */
  giorni: string[]
  eventi: EventoConContesto[]
  aspetti: AspettiTipo
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento: (evento: EventoConContesto) => void
  onNuovoImpegno: (data: string, ora: string) => void
}) {
  const perGiorno = useMemo(() => raggruppaPerGiorno(eventi), [eventi])

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <div className={giorni.length > 1 ? 'min-w-[720px]' : ''}>
        {/* Testata coi giorni */}
        <div className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          <div className="w-14 shrink-0" />
          {giorni.map((data) => {
            const stato = statoGiorno(data, orari, chiusure)
            return (
              <div key={data} className="flex-1 px-2 py-1 text-center text-xs">
                <div className="font-medium text-gray-700 dark:text-gray-200">
                  {GIORNI_SETTIMANA[indiceGiornoSettimana(data)].slice(0, 3)}{' '}
                  {Number(data.slice(8, 10))}
                </div>
                {!stato.aperto && (
                  <div className="truncate text-[10px] text-red-600">{stato.motivoChiusura}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Fascia degli eventi di giornata */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <div className="w-14 shrink-0 px-2 py-1 text-[10px] uppercase text-gray-400">
            Giornata
          </div>
          {giorni.map((data) => (
            <div key={data} className="min-h-8 flex-1 space-y-0.5 border-l border-gray-100 p-1 dark:border-gray-800">
              {(perGiorno.get(data) ?? [])
                .filter((e) => e.tutto_il_giorno)
                .map((e) => (
                  <div
                    key={e.id}
                    onClick={() => onApriEvento(e)}
                    className="cursor-pointer truncate rounded-sm px-1 text-[11px]"
                    style={{
                      backgroundColor: aspettoDi(aspetti, e.tipo).sfondo,
                      color: aspettoDi(aspetti, e.tipo).testo,
                    }}
                  >
                    {etichettaEvento(e, aspetti)}
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* Griglia oraria */}
        <div className="flex">
          <div className="w-14 shrink-0">
            {ORE.map((ora) => (
              <div
                key={ora}
                className="border-b border-gray-100 pr-2 text-right text-[10px] text-gray-400 dark:border-gray-800"
                style={{ height: ALTEZZA_ORA }}
              >
                {ora}
              </div>
            ))}
          </div>

          {giorni.map((data) => {
            const aOrario = (perGiorno.get(data) ?? []).filter((e) => !e.tutto_il_giorno)
            const impilati = impilaEventi(aOrario)
            const colonne = impilati.reduce((max, e) => Math.max(max, e.riga + 1), 1)

            return (
              <div
                key={data}
                className="relative flex-1 border-l border-gray-100 dark:border-gray-800"
                style={{ height: ORE.length * ALTEZZA_ORA }}
              >
                {ORE.map((ora, i) => (
                  <div
                    key={ora}
                    onClick={() => onNuovoImpegno(data, ora)}
                    className="absolute inset-x-0 cursor-pointer border-b border-gray-100 dark:border-gray-800"
                    style={{ top: i * ALTEZZA_ORA, height: ALTEZZA_ORA }}
                  />
                ))}

                {impilati.map((e) => {
                  const p = posizione(e.ora_inizio, e.ora_fine)
                  return (
                    <div
                      key={e.id}
                      onClick={() => onApriEvento(e)}
                      className="absolute cursor-pointer overflow-hidden rounded-sm px-1 text-[11px] leading-tight shadow-sm"
                      style={{
                        top: p.top,
                        height: p.height,
                        left: `${(e.riga * 100) / colonne}%`,
                        width: `${100 / colonne}%`,
                        backgroundColor: aspettoDi(aspetti, e.tipo).sfondo,
                        color: aspettoDi(aspetti, e.tipo).testo,
                      }}
                      title={etichettaEvento(e, aspetti)}
                    >
                      <div className="font-mono text-[10px]">{e.ora_inizio.slice(0, 5)}</div>
                      <div className="truncate font-medium">{etichettaEvento(e, aspetti)}</div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
