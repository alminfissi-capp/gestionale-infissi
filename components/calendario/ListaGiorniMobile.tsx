// components/calendario/ListaGiorniMobile.tsx
'use client'

import { aspettoDi } from '@/types/calendario'
import { etichettaEvento, statoGiorno } from '@/lib/calendario'
import { giorniDelMese } from './GrigliaGantt'
import type { AspettiTipo, Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

const soloOreMinuti = (ora: string) => ora.slice(0, 5)

export default function ListaGiorniMobile({
  anno,
  mese,
  eventi,
  aspetti,
  orari,
  chiusure,
  onApriEvento,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  aspetti: AspettiTipo
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento?: (evento: EventoConContesto) => void
}) {
  const giorni = giorniDelMese(anno, mese)

  return (
    <div className="space-y-3">
      {giorni.map((data) => {
        const stato = statoGiorno(data, orari, chiusure)
        const delGiorno = eventi
          .filter((e) => e.data === data)
          .sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio))

        // Un giorno aperto e vuoto non merita spazio su uno schermo stretto.
        if (stato.aperto && delGiorno.length === 0) return null

        return (
          <div key={data}>
            <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              {Number(data.slice(8, 10))} —{' '}
              {stato.aperto
                ? `${stato.apertura}–${stato.chiusura}`
                : `CHIUSO (${stato.motivoChiusura})`}
            </div>

            {stato.aperto && (
              <ul className="space-y-1">
                {delGiorno.map((e) => (
                  <li
                    key={e.id}
                    onClick={onApriEvento ? () => onApriEvento(e) : undefined}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                    style={{
                      backgroundColor: aspettoDi(aspetti, e.tipo).sfondo,
                      color: aspettoDi(aspetti, e.tipo).testo,
                    }}
                  >
                    <span className="shrink-0 font-mono">
                      {soloOreMinuti(e.ora_inizio)}–{soloOreMinuti(e.ora_fine)}
                    </span>
                    <span className="truncate font-medium">{etichettaEvento(e, aspetti)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
