'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface ElementoLista { id: number; testo: string; sotto?: string | null }

interface Props {
  elementi: ElementoLista[]
  preferiti: Set<number>
  valore: number | null
  onScegli: (e: ElementoLista | null) => void
  segnaposto: string
  etichettaNessuno?: string
}

export default function ListaConRicerca({ elementi, preferiti, valore, onScegli, segnaposto, etichettaNessuno }: Props) {
  const [testo, setTesto] = useState('')
  const q = testo.trim().toLowerCase()
  const visibili = q.length >= 2
    ? elementi.filter(e => `${e.testo} ${e.sotto ?? ''}`.toLowerCase().includes(q)).slice(0, 40)
    : elementi.filter(e => preferiti.has(e.id) || e.id === valore)

  const riga = (e: ElementoLista) => (
    <li key={e.id}>
      <button type="button" onClick={() => onScegli(e)} className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left hover:bg-muted">
        <span className="flex-1">
          <span className="block text-sm">{e.testo}</span>
          {e.sotto && <span className="block text-xs text-muted-foreground">{e.sotto}</span>}
        </span>
        {valore === e.id && <Check className="size-4 text-primary" />}
      </button>
    </li>
  )

  return (
    <div className="space-y-2">
      <Input value={testo} onChange={e => setTesto(e.target.value)} placeholder={segnaposto} aria-label={segnaposto} />
      <ul className="max-h-72 overflow-y-auto rounded-md border divide-y">
        {etichettaNessuno && (
          <li>
            <button type="button" onClick={() => onScegli(null)} className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted">
              <span className="flex-1">{etichettaNessuno}</span>
              {valore === null && <Check className="size-4 text-primary" />}
            </button>
          </li>
        )}
        {visibili.map(riga)}
        {visibili.length === 0 && (
          <li className="px-3 py-3 text-xs text-muted-foreground">
            {q.length >= 2 ? 'Nessun risultato' : 'Scrivi almeno 2 lettere per cercare tra tutti'}
          </li>
        )}
      </ul>
    </div>
  )
}
