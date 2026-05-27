'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  TIPOLOGIA_LABELS,
  MATERIALE_LABELS,
  type TipologiaESP,
  type MaterialeESP,
  type CountTipologia,
  type CountMateriale,
} from '@/types/catalogo-esp'

type Props = {
  conteggiTipologie: CountTipologia[]
  conteggiMateriali: CountMateriale[]
  totaleArticoli: number
}

export default function FiltriCatalogoESP({ conteggiTipologie, conteggiMateriali, totaleArticoli }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const tipologiaAttiva = params.get('tipologia') as TipologiaESP | null
  const materialeAttivo = params.get('materiale') as MaterialeESP | null

  function setParam(key: string, value: string | null) {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    p.delete('pagina')
    router.push(`${pathname}?${p.toString()}`)
  }

  function toggleFiltro(key: string, value: string, attivo: boolean) {
    setParam(key, attivo ? null : value)
  }

  const haFiltriAttivi = tipologiaAttiva || materialeAttivo

  return (
    <aside className="w-52 shrink-0 flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground">{totaleArticoli.toLocaleString('it-IT')} articoli totali</p>
      </div>

      <Separator />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tipologia</p>
        <div className="flex flex-col gap-0.5">
          {conteggiTipologie.map(({ tipologia, cnt }) => (
            <button
              key={tipologia}
              onClick={() => toggleFiltro('tipologia', tipologia, tipologia === tipologiaAttiva)}
              className={`flex items-center justify-between px-2 py-1.5 rounded text-sm text-left hover:bg-muted transition-colors ${
                tipologia === tipologiaAttiva ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
              }`}
            >
              <span className="truncate">{TIPOLOGIA_LABELS[tipologia]}</span>
              <Badge variant="secondary" className="ml-1 text-xs shrink-0">{cnt.toLocaleString('it-IT')}</Badge>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Materiale</p>
        <div className="flex flex-col gap-0.5">
          {conteggiMateriali.map(({ materiale, cnt }) => (
            <button
              key={materiale}
              onClick={() => toggleFiltro('materiale', materiale, materiale === materialeAttivo)}
              className={`flex items-center justify-between px-2 py-1.5 rounded text-sm text-left hover:bg-muted transition-colors ${
                materiale === materialeAttivo ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
              }`}
            >
              <span className="truncate">{MATERIALE_LABELS[materiale]}</span>
              <Badge variant="secondary" className="ml-1 text-xs shrink-0">{cnt.toLocaleString('it-IT')}</Badge>
            </button>
          ))}
        </div>
      </div>

      {haFiltriAttivi && (
        <>
          <Separator />
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push(pathname)}>
            Rimuovi filtri
          </Button>
        </>
      )}
    </aside>
  )
}
