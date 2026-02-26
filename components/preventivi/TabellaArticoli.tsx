'use client'

import Image from 'next/image'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ScontoSelect from './ScontoSelect'
import { calcolaTotaleRiga, formatEuro } from '@/lib/pricing'
import type { ArticoloWizard } from '@/types/preventivo'

interface Props {
  articoli: ArticoloWizard[]
  onChange: (articoli: ArticoloWizard[]) => void
}

export default function TabellaArticoli({ articoli, onChange }: Props) {
  if (articoli.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic text-center py-6">
        Nessun articolo aggiunto. Usa il modulo sopra per aggiungere prodotti.
      </p>
    )
  }

  const updateQuantita = (tempId: string, qty: number) => {
    onChange(
      articoli.map((a) => {
        if (a.tempId !== tempId) return a
        const newQty = Math.max(1, qty)
        return {
          ...a,
          quantita: newQty,
          prezzo_totale_riga: calcolaTotaleRiga(a.prezzo_unitario, newQty, a.sconto_articolo),
        }
      })
    )
  }

  const updateSconto = (tempId: string, sconto: number) => {
    onChange(
      articoli.map((a) => {
        if (a.tempId !== tempId) return a
        return {
          ...a,
          sconto_articolo: sconto,
          prezzo_totale_riga: calcolaTotaleRiga(a.prezzo_unitario, a.quantita, sconto),
        }
      })
    )
  }

  const updateNote = (tempId: string, value: string) => {
    onChange(
      articoli.map((a) =>
        a.tempId !== tempId ? a : { ...a, note: value || null }
      )
    )
  }

  const remove = (tempId: string) => {
    onChange(articoli.filter((a) => a.tempId !== tempId))
  }

  return (
    <div className="rounded-md border bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Prodotto</TableHead>
            <TableHead className="whitespace-nowrap">Dim. (mm)</TableHead>
            <TableHead>Finitura</TableHead>
            <TableHead className="w-20">Qtà</TableHead>
            <TableHead className="text-right whitespace-nowrap">€ Unit.</TableHead>
            <TableHead className="w-24">Sconto</TableHead>
            <TableHead className="text-right whitespace-nowrap">€ Totale</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {articoli.map((a) => (
            <TableRow key={a.tempId}>
              <TableCell>
                <div className="flex items-start gap-2">
                  {a.immagine_url && (
                    <Image
                      src={a.immagine_url}
                      alt={a.tipologia}
                      width={40}
                      height={32}
                      className="rounded border object-cover shrink-0 mt-0.5"
                    />
                  )}
                  <div>
                    <p className="font-medium text-sm">{a.tipologia}</p>
                    {a.categoria_nome && (
                      <p className="text-xs text-gray-400">{a.categoria_nome}</p>
                    )}
                    {a.misura_arrotondata && (
                      <Badge variant="outline" className="text-[10px] mt-0.5 text-amber-600 border-amber-300">
                        arrotondata
                      </Badge>
                    )}
                    <Input
                      type="text"
                      placeholder="Note articolo..."
                      value={a.note ?? ''}
                      onChange={(e) => updateNote(a.tempId, e.target.value)}
                      className="text-xs text-gray-400 border-0 px-0 h-6 mt-1 bg-transparent focus-visible:ring-0 shadow-none"
                    />
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {a.larghezza_mm}×{a.altezza_mm}
                {a.misura_arrotondata && (
                  <span className="text-gray-400 text-xs ml-1">
                    ({a.larghezza_listino_mm}×{a.altezza_listino_mm})
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {a.finitura_nome ?? '—'}
                {a.finitura_nome && (
                  <span className="text-xs text-gray-400 ml-1">+{a.finitura_aumento}%</span>
                )}
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={1}
                  value={a.quantita}
                  onChange={(e) => updateQuantita(a.tempId, parseInt(e.target.value) || 1)}
                  className="w-16 text-center h-8"
                />
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap">
                € {formatEuro(a.prezzo_unitario)}
              </TableCell>
              <TableCell>
                <ScontoSelect
                  value={a.sconto_articolo}
                  onChange={(v) => updateSconto(a.tempId, v)}
                  max={50}
                  className="h-8 text-xs"
                />
              </TableCell>
              <TableCell className="text-right font-medium text-sm whitespace-nowrap">
                € {formatEuro(a.prezzo_totale_riga)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:text-red-600"
                  onClick={() => remove(a.tempId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
