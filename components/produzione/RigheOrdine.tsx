'use client'

import { useState } from 'react'
import { Trash2, Plus, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatEuro } from '@/lib/pricing'
import { calcolaTotaleRigaOrdine } from '@/lib/produzione'
import DialogSelezioneArticolo, { type ArticoloScelto } from './DialogSelezioneArticolo'
import type { RigaOrdineInput } from '@/types/produzione'

interface Props {
  righe: RigaOrdineInput[]
  onChange: (righe: RigaOrdineInput[]) => void
}

// Tracce colonna condivise fra intestazione e righe (solo desktop).
const COLS = 'lg:grid-cols-[84px_1fr_130px_130px_64px_104px_92px_40px]'

function Campo({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {label && (
        <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400 lg:hidden">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

export default function RigheOrdine({ righe, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const aggiorna = (i: number, patch: Partial<RigaOrdineInput>) => {
    onChange(righe.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const aggiungi = () => {
    onChange([
      ...righe,
      {
        descrizione: '',
        codice_articolo: null,
        finitura: null,
        quantita: 1,
        unita_misura: 'pz',
        prezzo_unitario: null,
        ordine: righe.length,
      },
    ])
  }

  const rimuovi = (i: number) => {
    onChange(righe.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, ordine: idx })))
  }

  const aggiungiDaMagazzino = (articoli: ArticoloScelto[]) => {
    // Scarta le righe ancora vuote prima di accodare i prodotti scelti.
    const esistenti = righe.filter(
      (r) => r.descrizione.trim() !== '' || (r.codice_articolo?.trim() ?? '') !== ''
    )
    const nuove: RigaOrdineInput[] = articoli.map((a) => ({
      descrizione: a.descrizione,
      codice_articolo: a.codice,
      finitura: null,
      quantita: 1,
      unita_misura: a.um || 'pz',
      prezzo_unitario: a.prezzo_acquisto,
      ordine: 0,
    }))
    onChange([...esistenti, ...nuove].map((r, idx) => ({ ...r, ordine: idx })))
  }

  return (
    <div className="space-y-2">
      {/* Intestazioni colonne — solo desktop */}
      <div
        className={`hidden ${COLS} gap-2 px-1 text-xs font-medium text-gray-500 dark:text-gray-400 lg:grid`}
      >
        <span>Quantità</span>
        <span>Descrizione</span>
        <span>Cod. Articolo</span>
        <span>Finitura</span>
        <span>U.M.</span>
        <span>Prezzo</span>
        <span className="text-right">Totale</span>
        <span />
      </div>

      {righe.map((riga, i) => (
        <div
          key={i}
          className={`grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800 lg:items-start lg:rounded-none lg:border-0 lg:p-0 ${COLS}`}
        >
          <Campo label="Quantità">
            <Input
              type="number"
              step="0.001"
              min="0.001"
              value={riga.quantita}
              onChange={(e) => aggiorna(i, { quantita: Number(e.target.value) })}
            />
          </Campo>

          <Campo label="Descrizione" className="col-span-2 lg:col-span-1">
            <Textarea
              rows={1}
              placeholder="Descrizione"
              value={riga.descrizione}
              onChange={(e) => aggiorna(i, { descrizione: e.target.value })}
              className="min-h-9 resize-none py-2 leading-snug"
            />
          </Campo>

          <Campo label="Cod. Articolo">
            <Input
              placeholder="Codice"
              value={riga.codice_articolo ?? ''}
              onChange={(e) => aggiorna(i, { codice_articolo: e.target.value })}
            />
          </Campo>

          <Campo label="Finitura">
            <Input
              placeholder="Finitura"
              value={riga.finitura ?? ''}
              onChange={(e) => aggiorna(i, { finitura: e.target.value })}
            />
          </Campo>

          <Campo label="U.M.">
            <Input
              value={riga.unita_misura}
              onChange={(e) => aggiorna(i, { unita_misura: e.target.value })}
            />
          </Campo>

          <Campo label="Prezzo">
            <Input
              type="number"
              step="0.0001"
              placeholder="Prezzo"
              value={riga.prezzo_unitario ?? ''}
              onChange={(e) =>
                aggiorna(i, { prezzo_unitario: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </Campo>

          <Campo label="Totale" className="col-span-1 lg:text-right">
            <span className="block text-sm text-gray-600 dark:text-gray-400 lg:leading-9">
              {formatEuro(calcolaTotaleRigaOrdine(riga))}
            </span>
          </Campo>

          <div className="col-span-1 flex lg:justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-red-600 lg:h-8 lg:w-8 lg:p-0"
              onClick={() => rimuovi(i)}
              aria-label="Rimuovi riga"
            >
              <Trash2 className="h-4 w-4" />
              <span className="ml-2 lg:hidden">Rimuovi</span>
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={aggiungi} className="gap-2">
          <Plus className="h-4 w-4" /> Aggiungi riga
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="gap-2"
        >
          <Package className="h-4 w-4" /> Aggiungi da magazzino
        </Button>
      </div>

      <DialogSelezioneArticolo
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={aggiungiDaMagazzino}
      />
    </div>
  )
}
