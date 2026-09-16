'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { STATI_COMMESSA, labelStatoCommessa, statoCommessaBadgeClass } from '@/lib/stato-commessa'
import type { StatoCommessa } from '@/types/commessa'

/**
 * Il badge dello stato, uguale nell'elenco economico e nella pagina di
 * Produzione: e' lo stesso dato, quindi deve avere la stessa faccia e lo stesso
 * menu da tutte le parti.
 *
 * Senza il permesso di scrittura sulle Commesse resta un badge sbiadito e non
 * cliccabile: lo stato si legge ma non si tocca. E' solo un'indicazione, il
 * divieto vero e' in `updateStatoCommessa`.
 */
export default function BadgeStatoCommessa({
  stato,
  onChange,
  modificabile,
  dimensione = 'sm',
}: {
  stato: StatoCommessa
  onChange: (s: StatoCommessa) => void
  modificabile: boolean
  dimensione?: 'sm' | 'md'
}) {
  const base = `inline-flex items-center rounded border font-medium whitespace-nowrap ${
    dimensione === 'md' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[11px]'
  } ${statoCommessaBadgeClass(stato)}`

  if (!modificabile) {
    return (
      <span
        className={`${base} cursor-not-allowed opacity-50`}
        title="Solo chi ha la scrittura sulle Commesse può cambiare lo stato"
      >
        {labelStatoCommessa(stato)}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={base} title="Cambia stato">
          {labelStatoCommessa(stato)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {STATI_COMMESSA.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => onChange(s.value)}
            className={stato === s.value ? 'font-semibold' : ''}
          >
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
