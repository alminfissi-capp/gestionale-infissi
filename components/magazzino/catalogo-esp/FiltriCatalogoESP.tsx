'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { REPARTI, type CountReparto, type CountGruppo } from '@/types/catalogo-esp'

type Props = {
  conteggiReparti: CountReparto[]
  totaleArticoli: number
  gruppiReparto: CountGruppo[]
}

export default function FiltriCatalogoESP({ conteggiReparti, totaleArticoli }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const repartoAttivo = params.get('reparto') ? Number(params.get('reparto')) : null

  function selectReparto(reparto: number) {
    const p = new URLSearchParams(params.toString())
    if (repartoAttivo === reparto) {
      p.delete('reparto')
    } else {
      p.set('reparto', String(reparto))
    }
    p.delete('pagina')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <aside className="w-52 shrink-0 flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{totaleArticoli.toLocaleString('it-IT')} articoli totali</p>

      <Separator />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Reparto</p>
        <div className="flex flex-col gap-0.5">
          {conteggiReparti.map(({ reparto, cnt }) => {
            const attivo = reparto === repartoAttivo
            return (
              <button
                key={reparto}
                onClick={() => selectReparto(reparto)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm text-left hover:bg-muted transition-colors ${
                  attivo ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                }`}
              >
                <span className="truncate">{REPARTI[reparto] ?? `Rep. ${reparto}`}</span>
                <Badge variant="secondary" className="ml-1 text-xs shrink-0">{cnt.toLocaleString('it-IT')}</Badge>
              </button>
            )
          })}
        </div>
      </div>

    </aside>
  )
}
