// components/produzione/SemaforoCommessa.tsx
import { calcolaSemaforo } from '@/lib/avanzamento'
import type { Avanzamento } from '@/lib/avanzamento'

/**
 * Il semaforo di commessa, da leggere di sfuggita passando davanti allo
 * schermo: verde qualcuno ci sta lavorando adesso, rosso qualcosa è fermo
 * per un problema, giallo nessuno ha ancora toccato niente. Verde e rosso
 * stanno accesi insieme quando c'è chi lavora e c'è chi è bloccato.
 */
export default function SemaforoCommessa({
  avanzamento,
  dimensione = 9,
}: {
  avanzamento: Avanzamento
  /** Diametro di una luce, in pixel. */
  dimensione?: number
}) {
  const { verde, giallo, rosso } = calcolaSemaforo(avanzamento)

  const luci: { acceso: boolean; classe: string; nome: string }[] = [
    { acceso: verde,  classe: 'bg-green-500 shadow-[0_0_5px_1px_rgba(34,197,94,0.7)]', nome: 'in lavorazione' },
    { acceso: giallo, classe: 'bg-amber-400 shadow-[0_0_5px_1px_rgba(251,191,36,0.7)]', nome: 'in stand-by' },
    { acceso: rosso,  classe: 'bg-red-500 shadow-[0_0_5px_1px_rgba(239,68,68,0.7)]',   nome: 'bloccata' },
  ]

  const accese = luci.filter((l) => l.acceso).map((l) => l.nome)
  const descrizione = `Commessa ${accese.join(' e ')}`

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-full bg-gray-800/90 px-1 py-1.5 dark:bg-gray-950"
      role="img"
      aria-label={descrizione}
      title={descrizione}
    >
      {luci.map((luce) => (
        <span
          key={luce.nome}
          style={{ width: dimensione, height: dimensione }}
          className={`rounded-full ${luce.acceso ? luce.classe : 'bg-gray-600/60 dark:bg-gray-800'}`}
        />
      ))}
    </div>
  )
}
