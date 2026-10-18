'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { voceMostrata } from '@/lib/fppro/scelta'
import MiniaturaProfilo from './MiniaturaProfilo'
import type { AnteprimaProfilo } from '@/types/rilievo-fp'

export interface VoceScelta {
  id: string
  testo: string
  sotto?: string | null
  miniatura?: AnteprimaProfilo | null
}

interface Props {
  voci: VoceScelta[]
  preferiti?: Set<string>
  valore: string | null
  onScegli: (v: VoceScelta | null) => void
  segnaposto: string
  /** Prima riga dell'elenco per "nessuna scelta" (es. "Come la struttura") */
  etichettaNessuno?: string
  conMiniature?: boolean
  id?: string
  /** Come mostrare il valore salvato se non e' (piu') nell'elenco */
  riserva?: VoceScelta | null
  /** Con questo, ogni riga ha la stellina dei preferiti (non sceglie la voce e non chiude il menu) */
  onStella?: (v: VoceScelta, attiva: boolean) => void
}

const MAX_RISULTATI = 60

/**
 * Menu a tendina del rilievo: chiuso mostra la scelta; si apre, si cerca, si sceglie e
 * SI RICHIUDE subito. La ricerca la fa questo componente (testo + descrizione) e mostra
 * al massimo 60 righe, cosi' anche centinaia di colori o profili con miniatura restano veloci.
 */
export default function SceltaFp({ voci, preferiti, valore, onScegli, segnaposto, etichettaNessuno, conMiniature, id, riserva, onStella }: Props) {
  const [aperto, setAperto] = useState(false)
  const [cerca, setCerca] = useState('')
  const { voce: mostrata, fuoriCatalogo } = voceMostrata(voci, valore, riserva ?? null)
  const scelta = mostrata as VoceScelta | null

  const { pref, altri, oltre } = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const trovate = q ? voci.filter(v => `${v.testo} ${v.sotto ?? ''}`.toLowerCase().includes(q)) : voci
    const pref = !q && preferiti ? trovate.filter(v => preferiti.has(v.id)) : []
    const resto = trovate.filter(v => !pref.includes(v))
    return { pref, altri: resto.slice(0, MAX_RISULTATI), oltre: Math.max(0, resto.length - MAX_RISULTATI) }
  }, [cerca, voci, preferiti])

  const scegli = (v: VoceScelta | null) => {
    onScegli(v)
    setAperto(false)
    setCerca('')
  }

  const riga = (v: VoceScelta) => (
    <CommandItem key={v.id} value={v.id} onSelect={() => scegli(v)} className="gap-2">
      {conMiniature && <MiniaturaProfilo anteprima={v.miniatura} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{v.testo}</span>
        {v.sotto && <span className="block truncate text-xs text-muted-foreground">{v.sotto}</span>}
      </span>
      <Check className={cn('size-4 shrink-0 text-primary', valore === v.id ? 'opacity-100' : 'opacity-0')} />
      {onStella && (
        <button
          type="button"
          className="-my-1 shrink-0 rounded p-1 hover:bg-muted"
          aria-label={preferiti?.has(v.id) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
          // Solo la stella: la riga non viene scelta e il menu resta aperto.
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onStella(v, !preferiti?.has(v.id)) }}
        >
          <Star className={cn('size-4', preferiti?.has(v.id) ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')} />
        </button>
      )}
    </CommandItem>
  )

  return (
    <Popover open={aperto} onOpenChange={o => { setAperto(o); if (!o) setCerca('') }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={aperto}
          className={cn('h-auto min-h-9 w-full justify-between gap-2 px-2 py-1 text-left font-normal', conMiniature && 'min-h-12')}>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {conMiniature && scelta && <MiniaturaProfilo anteprima={scelta.miniatura} />}
            <span className="min-w-0">
              <span className={cn('block truncate text-sm', !scelta && 'text-muted-foreground')}>
                {scelta ? scelta.testo : (etichettaNessuno ?? segnaposto)}
              </span>
              {fuoriCatalogo
                ? <span className="block truncate text-xs text-amber-700">non più nel catalogo</span>
                : scelta?.sotto && <span className="block truncate text-xs text-muted-foreground">{scelta.sotto}</span>}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={segnaposto} value={cerca} onValueChange={setCerca} />
          <CommandList className="max-h-[min(24rem,60dvh)]">
            <CommandEmpty>Nessun risultato</CommandEmpty>
            {etichettaNessuno && !cerca && (
              <CommandGroup>
                <CommandItem value="__nessuno" onSelect={() => scegli(null)} className="gap-2">
                  <span className="flex-1 text-sm">{etichettaNessuno}</span>
                  <Check className={cn('size-4 shrink-0 text-primary', valore === null ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              </CommandGroup>
            )}
            {pref.length > 0 && <CommandGroup heading="Preferiti">{pref.map(riga)}</CommandGroup>}
            {altri.length > 0 && <CommandGroup heading={pref.length > 0 ? 'Tutti' : undefined}>{altri.map(riga)}</CommandGroup>}
            {oltre > 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Altri {oltre}: scrivi per cercare</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
