'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSerieAccessoriFp, type SerieAccessoriFp } from '@/actions/rilievo-fp'
import { aggiungiAccessorio } from '@/lib/rilievo-unico'
import type { AccessorioAggiunto } from '@/types/rilievo-fp'
import DialogAccessorioFp from './DialogAccessorioFp'

const numero = (s: string): number | null => {
  const n = Number(s.replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}

/**
 * Accessori presi a mano dal catalogo di FP PRO (es. MEDISYSTEM: maniglione FIMET, motore
 * vasistas), con la quantita'. Sfogliare il catalogo richiede la rete; l'elenco no.
 */
export default function AccessoriAggiunti({ lista, isOnline, onCambia }: {
  lista: AccessorioAggiunto[]
  isOnline: boolean
  onCambia: (lista: AccessorioAggiunto[]) => void
}) {
  const [serie, setSerie] = useState<SerieAccessoriFp[] | null>(null)
  const [aperto, setAperto] = useState(false)
  const apri = async () => {
    if (!serie) {
      const r = await getSerieAccessoriFp()
      if ('errore' in r) { toast.error(r.errore); return }
      setSerie(r)
    }
    setAperto(true)
  }
  return (
    <div className="space-y-1">
      <p className="text-sm">Accessori aggiunti</p>
      {lista.map((a, i) => (
        <div key={`${a.serie}|${a.codice}`} className="flex items-center gap-1 text-xs">
          <span className="min-w-0 flex-1"><span className="block truncate">{a.descrizione || a.codice}</span><span className="block text-muted-foreground">{a.codice}</span></span>
          <Input aria-label={`Quantità ${a.codice}`} className="h-7 w-14" inputMode="numeric" value={a.quantita || ''}
            onChange={e => {
              const n = numero(e.target.value)
              onCambia(lista.map((x, j) => (j === i ? { ...x, quantita: n !== null && n >= 0 ? n : 0 } : x)))
            }} />
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Togli ${a.codice}`}
            onClick={() => onCambia(lista.filter((_, j) => j !== i))}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" disabled={!isOnline} onClick={() => void apri()}>
        <Plus className="size-4" />Aggiungi accessorio
      </Button>
      {!isOnline && <p className="text-xs text-muted-foreground">Serve la rete per sfogliare il catalogo.</p>}
      {aperto && serie && (
        <DialogAccessorioFp aperto serie={serie} onChiudi={() => setAperto(false)}
          onAggiungi={a => {
            onCambia(aggiungiAccessorio(lista, a))
            toast.success(`Aggiunto ${a.codice}`)
          }} />
      )}
    </div>
  )
}
