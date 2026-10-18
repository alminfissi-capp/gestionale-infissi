'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import DisegnoVoceSvg from './DisegnoVoceSvg'
import type { Lato, StrutturaLocale, VoceFpDati } from '@/types/rilievo-fp'

interface Props {
  struttura: Pick<StrutturaLocale, 'albero' | 'poligoni' | 'l_nominale' | 'h_nominale'>
  voce: Pick<VoceFpDati, 'larghezza' | 'altezza' | 'quote'>
  note: Partial<Record<Lato, string>>
  onNota: (lato: Lato, testo: string) => void
}

/**
 * Disegno della voce con, attaccati ai 4 lati, i campi liberi delle note del telaio:
 * sopra e sotto una riga, ai lati una colonna stretta.
 */
export default function DisegnoConNote({ struttura, voce, note, onNota }: Props) {
  const riga = (lato: 'alto' | 'basso') => (
    <Input
      value={note[lato] ?? ''}
      onChange={e => onNota(lato, e.target.value)}
      placeholder={`nota telaio ${lato}`}
      aria-label={`Nota telaio ${lato}`}
      className="h-7 px-2 text-xs md:text-xs"
    />
  )
  const colonna = (lato: 'sinistra' | 'destra') => (
    <Textarea
      value={note[lato] ?? ''}
      onChange={e => onNota(lato, e.target.value)}
      placeholder={`nota ${lato === 'sinistra' ? 'sx' : 'dx'}`}
      aria-label={`Nota telaio ${lato}`}
      className="h-full min-h-24 resize-none px-1.5 py-1 text-xs md:text-xs"
    />
  )
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] grid-rows-[auto_1fr_auto] gap-1">
      <div />
      {riga('alto')}
      <div />
      {colonna('sinistra')}
      <div className="rounded-md border bg-white p-2">
        <DisegnoVoceSvg struttura={struttura} voce={voce} className="mx-auto h-[min(48dvh,26rem)] w-full" />
      </div>
      {colonna('destra')}
      <div />
      {riga('basso')}
      <div />
    </div>
  )
}
