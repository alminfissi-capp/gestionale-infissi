'use client'

import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/pricing'
import { calcolaTotaleRigaOrdine } from '@/lib/produzione'
import type { RigaOrdineInput } from '@/types/produzione'

interface Props {
  righe: RigaOrdineInput[]
  suggerimenti: string[]
  onChange: (righe: RigaOrdineInput[]) => void
}

export default function RigheOrdine({ righe, suggerimenti, onChange }: Props) {
  const aggiorna = (i: number, patch: Partial<RigaOrdineInput>) => {
    onChange(righe.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const aggiungi = () => {
    onChange([
      ...righe,
      { descrizione: '', quantita: 1, unita_misura: 'pz', prezzo_unitario: null, ordine: righe.length },
    ])
  }

  const rimuovi = (i: number) => {
    onChange(righe.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, ordine: idx })))
  }

  return (
    <div className="space-y-2">
      <datalist id="suggerimenti-righe">
        {suggerimenti.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {righe.map((riga, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input
            className="col-span-5"
            list="suggerimenti-righe"
            placeholder="Descrizione"
            value={riga.descrizione}
            onChange={(e) => aggiorna(i, { descrizione: e.target.value })}
          />
          <Input
            className="col-span-2"
            type="number"
            step="0.001"
            min="0.001"
            value={riga.quantita}
            onChange={(e) => aggiorna(i, { quantita: Number(e.target.value) })}
          />
          <Input
            className="col-span-1"
            value={riga.unita_misura}
            onChange={(e) => aggiorna(i, { unita_misura: e.target.value })}
          />
          <Input
            className="col-span-2"
            type="number"
            step="0.0001"
            placeholder="Prezzo"
            value={riga.prezzo_unitario ?? ''}
            onChange={(e) =>
              aggiorna(i, { prezzo_unitario: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
          <span className="col-span-1 text-sm text-right text-gray-600 dark:text-gray-400">
            {formatEuro(calcolaTotaleRigaOrdine(riga))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="col-span-1 h-8 w-8 p-0 text-red-600"
            onClick={() => rimuovi(i)}
            aria-label="Rimuovi riga"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={aggiungi} className="gap-2">
        <Plus className="h-4 w-4" /> Aggiungi riga
      </Button>
    </div>
  )
}
