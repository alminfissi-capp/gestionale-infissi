// components/produzione/SemaforoCommessa.tsx
import { calcolaSemaforo } from '@/lib/avanzamento'
import type { Avanzamento } from '@/lib/avanzamento'

/**
 * Il semaforo di commessa, da leggere di sfuggita passando davanti allo
 * schermo: verde qualcuno ci sta lavorando adesso, giallo non ci lavora
 * nessuno, rosso c'è qualcosa di bloccato. Il rosso è una luce a sé e non
 * spegne le altre: è il caso che il semaforo serve a segnalare.
 */

type Luce = {
  chiave: 'verde' | 'giallo' | 'rosso'
  etichetta: string
  /** Colore della luce accesa, con l'alone. */
  acceso: string
  /** Colore della scritta accanto, lo stesso della luce. */
  testo: string
}

const LUCI: Luce[] = [
  {
    chiave: 'verde',
    etichetta: 'In corso',
    acceso: 'bg-green-500 shadow-[0_0_5px_1px_rgba(34,197,94,0.7)]',
    testo: 'text-green-600 dark:text-green-500',
  },
  {
    chiave: 'giallo',
    etichetta: 'Stand-by',
    acceso: 'bg-amber-400 shadow-[0_0_5px_1px_rgba(251,191,36,0.7)]',
    testo: 'text-amber-500',
  },
  {
    chiave: 'rosso',
    etichetta: 'Bloccata',
    acceso: 'bg-red-500 shadow-[0_0_5px_1px_rgba(239,68,68,0.7)]',
    testo: 'text-red-600 dark:text-red-500',
  },
]

export default function SemaforoCommessa({
  avanzamento,
  dimensione = 9,
}: {
  avanzamento: Avanzamento
  /** Diametro di una luce, in pixel. */
  dimensione?: number
}) {
  const semaforo = calcolaSemaforo(avanzamento)
  const accese = LUCI.filter((l) => semaforo[l.chiave]).map((l) => l.etichetta.toLowerCase())
  const descrizione = `Commessa: ${accese.join(' + ')}`

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      role="img"
      aria-label={descrizione}
      title={descrizione}
    >
      {/* Le scritte, una per luce, alte quanto la luce a cui stanno accanto */}
      <div className="flex flex-col gap-1 py-1.5">
        {LUCI.map((luce) => (
          <span
            key={luce.chiave}
            style={{ height: dimensione }}
            className={`flex items-center justify-end text-[9px] font-medium leading-none tracking-tight ${
              semaforo[luce.chiave] ? luce.testo : 'text-gray-300 dark:text-gray-700'
            }`}
          >
            {luce.etichetta}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-1 rounded-full bg-gray-800/90 px-1 py-1.5 dark:bg-gray-950">
        {LUCI.map((luce) => (
          <span
            key={luce.chiave}
            style={{ width: dimensione, height: dimensione }}
            className={`rounded-full ${
              semaforo[luce.chiave] ? luce.acceso : 'bg-gray-600/60 dark:bg-gray-800'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
