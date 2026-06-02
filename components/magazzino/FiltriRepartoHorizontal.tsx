'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { REPARTI, type CountReparto } from '@/types/catalogo-esp'

type Props = {
  conteggiReparti: CountReparto[]
  totaleArticoli: number
}

export default function FiltriRepartoHorizontal({ conteggiReparti, totaleArticoli }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const repartoAttivo = params.get('reparto') ? Number(params.get('reparto')) : null

  function selectReparto(reparto: number | null) {
    const p = new URLSearchParams(params.toString())
    if (reparto === null) {
      p.delete('reparto')
    } else if (repartoAttivo === reparto) {
      p.delete('reparto')
    } else {
      p.set('reparto', String(reparto))
    }
    p.delete('pagina')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => selectReparto(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
          repartoAttivo === null
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900'
        }`}
      >
        Tutti
        <span className="ml-1.5 text-[11px] opacity-60">{totaleArticoli.toLocaleString('it-IT')}</span>
      </button>

      {conteggiReparti.map(({ reparto, cnt }) => {
        const attivo = reparto === repartoAttivo
        return (
          <button
            key={reparto}
            onClick={() => selectReparto(reparto)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
              attivo
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            {REPARTI[reparto] ?? `Rep. ${reparto}`}
            <span className="ml-1.5 text-[11px] opacity-60">{cnt.toLocaleString('it-IT')}</span>
          </button>
        )
      })}
    </div>
  )
}
