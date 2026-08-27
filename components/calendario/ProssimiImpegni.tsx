// components/calendario/ProssimiImpegni.tsx
import Link from 'next/link'
import { CalendarDays, ChevronRight, Landmark } from 'lucide-react'
import { getAspettiTipo, getProssimiImpegni } from '@/actions/calendario'
import { getAnticipiInScadenza } from '@/actions/banche'
import { formatEuro } from '@/lib/pricing'
import { etichettaEvento, indiceGiornoSettimana } from '@/lib/calendario'
import { aspettoDi, GIORNI_SETTIMANA } from '@/types/calendario'

/**
 * I prossimi sette giorni dell'agenda, in dashboard. Chi non ha il modulo
 * `calendario` non lo vede: l'action restituisce un elenco vuoto e il
 * riquadro non viene disegnato.
 */
export default async function ProssimiImpegni() {
  const [impegni, anticipi] = await Promise.all([
    getProssimiImpegni(7),
    // Finestra più larga degli impegni, di proposito: sette giorni bastano per un
    // appuntamento, non per un rientro da qualche migliaio di euro, che la liquidità
    // va programmata prima. Solo un promemoria: gli anticipi non sono eventi
    // dell'agenda e non entrano in nessun totale — il loro debito resta contato una
    // volta sola, nella riga "Banche" dei debiti.
    getAnticipiInScadenza(30),
  ])
  if (impegni.length === 0 && anticipi.length === 0) return null
  const aspetti = await getAspettiTipo()

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 shrink-0 text-teal-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Prossimi impegni
        </h2>
        <Link
          href="/calendario"
          className="ml-auto flex items-center text-xs text-teal-700 hover:underline dark:text-teal-400"
        >
          Calendario
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {impegni.map((e) => (
          <li key={e.id} className="flex min-w-0 items-center gap-2 py-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: aspettoDi(aspetti, e.tipo).sfondo }}
            />
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {GIORNI_SETTIMANA[indiceGiornoSettimana(e.data)].slice(0, 3)}{' '}
              {Number(e.data.slice(8, 10))}
            </span>
            {!e.tutto_il_giorno && (
              <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                {e.ora_inizio.slice(0, 5)}
              </span>
            )}
            <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
              {etichettaEvento(e, aspetti)}
            </span>
          </li>
        ))}
      </ul>

      {anticipi.length > 0 && (
        <div className={impegni.length > 0 ? 'mt-3 border-t border-gray-100 pt-3 dark:border-gray-800' : ''}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-500">
            <Landmark className="h-3.5 w-3.5 shrink-0" />
            Anticipi da restituire
          </p>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {anticipi.map((a) => (
              <li key={a.id} className="flex min-w-0 items-center gap-2 py-2 text-sm">
                <span
                  className={`shrink-0 text-xs ${
                    a.scaduto
                      ? 'font-medium text-rose-600 dark:text-rose-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {GIORNI_SETTIMANA[indiceGiornoSettimana(a.data_scadenza)].slice(0, 3)}{' '}
                  {Number(a.data_scadenza.slice(8, 10))}
                  {a.scaduto && ' · scaduto'}
                </span>
                <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                  {a.etichetta}
                </span>
                <span className="ml-auto shrink-0 font-medium text-gray-800 dark:text-gray-200">
                  {formatEuro(a.daRestituire)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
