'use client'

import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SceltaFp, { type VoceScelta } from './SceltaFp'
import type { RifFp } from '@/types/rilievo-fp'

/**
 * Colori degli accessori in ordine di preferenza, come FP PRO: per ogni accessorio vale il
 * primo colore dell'elenco in cui esiste.
 */
export default function ColoriAccessori({ lista, voci, onCambia }: {
  lista: RifFp[]
  voci: VoceScelta[]
  onCambia: (lista: RifFp[]) => void
}) {
  const sposta = (i: number, dir: -1 | 1) => {
    const l = [...lista]
    const [c] = l.splice(i, 1)
    l.splice(i + dir, 0, c)
    onCambia(l)
  }
  return (
    <div className="space-y-1">
      {lista.map((c, i) => (
        <div key={c.fpId} className="flex items-center gap-1 text-sm">
          <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
          <span className="min-w-0 flex-1 truncate">{c.descrizione}</span>
          <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Sposta su" disabled={i === 0} onClick={() => sposta(i, -1)}><ArrowUp className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Sposta giu" disabled={i === lista.length - 1} onClick={() => sposta(i, 1)}><ArrowDown className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Togli" onClick={() => onCambia(lista.filter((_, j) => j !== i))}><X className="size-3.5" /></Button>
        </div>
      ))}
      <SceltaFp
        voci={voci.filter(x => !lista.some(c => String(c.fpId) === x.id))}
        valore={null}
        segnaposto="Cerca colore accessori"
        etichettaNessuno={lista.length ? 'Aggiungi un altro colore…' : 'Non indicato: aggiungi un colore…'}
        onScegli={x => { if (x) onCambia([...lista, { fpId: Number(x.id), descrizione: x.testo }]) }}
      />
    </div>
  )
}
