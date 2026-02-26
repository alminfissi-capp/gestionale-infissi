'use client'

import { useState, useMemo } from 'react'
import { Plus, AlertTriangle, Tag } from 'lucide-react'
import {
  calcolaPrezzoBase,
  applicaFinitura,
  calcolaTotaleRiga,
  formatEuro,
} from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ScontoSelect from './ScontoSelect'
import IconaCategoria from '@/components/listini/IconaCategoria'
import type { CategoriaConListini } from '@/types/listino'
import type { ArticoloWizard } from '@/types/preventivo'

interface Props {
  listini: CategoriaConListini[]
  onAdd: (articolo: ArticoloWizard) => void
}

// Finitura unificata (categoria + listino)
type FinituraUnita = {
  nome: string
  aumento: number       // %
  aumento_euro: number  // €
  source: 'categoria' | 'listino'
}

export default function FormArticolo({ listini, onAdd }: Props) {
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [listinoId, setListinoId] = useState<string>('')
  const [finituraIndex, setFinituraIndex] = useState<string>('-1')
  const [larghezza, setLarghezza] = useState<string>('')
  const [altezza, setAltezza] = useState<string>('')
  const [quantita, setQuantita] = useState<string>('1')
  const [scontoArticolo, setScontoArticolo] = useState(0)

  const categoriaSelezionata = useMemo(
    () => listini.find((c) => c.id === categoriaId),
    [listini, categoriaId]
  )

  const listinoSelezionato = useMemo(
    () => categoriaSelezionata?.listini.find((l) => l.id === listinoId),
    [categoriaSelezionata, listinoId]
  )

  // Finiture unite: categoria (ereditate) + listino (specifiche)
  const finitureDisponibili = useMemo((): FinituraUnita[] => {
    if (!categoriaSelezionata) return []
    const catFin: FinituraUnita[] = (categoriaSelezionata.finiture_categoria ?? []).map((f) => ({
      nome: f.nome,
      aumento: f.aumento_percentuale,
      aumento_euro: f.aumento_euro,
      source: 'categoria' as const,
    }))
    const listinoFin: FinituraUnita[] = (listinoSelezionato?.finiture ?? []).map((f) => ({
      nome: f.nome,
      aumento: f.aumento,
      aumento_euro: f.aumento_euro ?? 0,
      source: 'listino' as const,
    }))
    return [...catFin, ...listinoFin]
  }, [categoriaSelezionata, listinoSelezionato])

  const finitura = useMemo((): FinituraUnita | null => {
    const idx = parseInt(finituraIndex)
    if (idx < 0) return null
    return finitureDisponibili[idx] ?? null
  }, [finituraIndex, finitureDisponibili])

  const scontoMax = categoriaSelezionata?.sconto_massimo ?? 50

  // Reset sconto se supera il nuovo limite
  const handleCategoriaChange = (id: string) => {
    setCategoriaId(id)
    setListinoId('')
    setFinituraIndex('-1')
    setScontoArticolo(0)
  }

  const handleListinoChange = (id: string) => {
    setListinoId(id)
    setFinituraIndex('-1')
  }

  // Calcolo prezzo in real-time
  const calcolo = useMemo(() => {
    if (!listinoSelezionato) return null
    const L = parseInt(larghezza)
    const H = parseInt(altezza)
    if (!L || !H || L <= 0 || H <= 0) return null

    try {
      const { prezzo, larghezzaEffettiva, altezzaEffettiva, arrotondata } =
        calcolaPrezzoBase(
          listinoSelezionato.griglia,
          listinoSelezionato.larghezze,
          listinoSelezionato.altezze,
          L,
          H
        )
      const prezzoUnitario = finitura
        ? applicaFinitura(prezzo, finitura.aumento, finitura.aumento_euro)
        : prezzo
      const qty = Math.max(1, parseInt(quantita) || 1)
      const totalRiga = calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo)

      return {
        prezzoBase: prezzo,
        prezzoUnitario,
        totalRiga,
        larghezzaEffettiva,
        altezzaEffettiva,
        arrotondata,
        error: null,
      }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Errore calcolo', prezzoBase: 0, prezzoUnitario: 0, totalRiga: 0, larghezzaEffettiva: 0, altezzaEffettiva: 0, arrotondata: false }
    }
  }, [listinoSelezionato, larghezza, altezza, finitura, quantita, scontoArticolo])

  const canAdd =
    listinoSelezionato && calcolo && !calcolo.error && parseInt(quantita) > 0

  const handleAdd = () => {
    if (!listinoSelezionato || !calcolo || calcolo.error || !canAdd) return

    const qty = Math.max(1, parseInt(quantita) || 1)
    const L = parseInt(larghezza)
    const H = parseInt(altezza)

    const articolo: ArticoloWizard = {
      tempId: crypto.randomUUID(),
      listino_id: listinoSelezionato.id,
      tipologia: listinoSelezionato.tipologia,
      categoria_nome: categoriaSelezionata?.nome ?? null,
      larghezza_mm: L,
      altezza_mm: H,
      larghezza_listino_mm: calcolo.larghezzaEffettiva,
      altezza_listino_mm: calcolo.altezzaEffettiva,
      misura_arrotondata: calcolo.arrotondata,
      finitura_nome: finitura?.nome ?? null,
      finitura_aumento: finitura?.aumento ?? 0,
      finitura_aumento_euro: finitura?.aumento_euro ?? 0,
      quantita: qty,
      prezzo_base: calcolo.prezzoBase,
      prezzo_unitario: calcolo.prezzoUnitario,
      sconto_articolo: scontoArticolo,
      prezzo_totale_riga: calcolo.totalRiga,
      ordine: 0,
    }

    onAdd(articolo)

    // Reset mantenendo categoria e listino per velocizzare inserimento multiplo
    setLarghezza('')
    setAltezza('')
    setQuantita('1')
    setScontoArticolo(0)
    setFinituraIndex('-1')
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Aggiungi articolo</p>

      {/* Selezione categoria */}
      <div className="flex flex-wrap gap-2">
        {listini.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleCategoriaChange(cat.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              categoriaId === cat.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            <IconaCategoria icona={cat.icona} size="sm" /> {cat.nome}
          </button>
        ))}
      </div>

      {categoriaSelezionata && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Listino */}
          <div className="col-span-2 space-y-1.5">
            <Label>Prodotto</Label>
            <Select value={listinoId} onValueChange={handleListinoChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona prodotto..." />
              </SelectTrigger>
              <SelectContent>
                {categoriaSelezionata.listini.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.tipologia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Finitura */}
          {listinoSelezionato && finitureDisponibili.length > 0 && (
            <div className="col-span-2 space-y-1.5">
              <Label>Finitura</Label>
              <Select value={finituraIndex} onValueChange={setFinituraIndex}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Standard (nessuna maggiorazione)</SelectItem>
                  {finitureDisponibili.map((f, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      <span className="flex items-center gap-1.5">
                        {f.source === 'categoria' && (
                          <Tag className="h-3 w-3 text-gray-400 shrink-0" />
                        )}
                        {f.nome}
                        {f.aumento > 0 && ` +${f.aumento}%`}
                        {f.aumento_euro > 0 && ` +€${f.aumento_euro}`}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Dimensioni */}
          <div className="space-y-1.5">
            <Label>Larghezza (mm)</Label>
            <Input
              type="number"
              min={1}
              value={larghezza}
              onChange={(e) => setLarghezza(e.target.value)}
              placeholder="es. 800"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Altezza (mm)</Label>
            <Input
              type="number"
              min={1}
              value={altezza}
              onChange={(e) => setAltezza(e.target.value)}
              placeholder="es. 1200"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quantità</Label>
            <Input
              type="number"
              min={1}
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sconto{scontoMax < 50 ? ` (max ${scontoMax}%)` : ''}</Label>
            <ScontoSelect value={scontoArticolo} onChange={setScontoArticolo} max={scontoMax} />
          </div>
        </div>
      )}

      {/* Preview prezzo */}
      {calcolo && !calcolo.error && listinoSelezionato && (
        <div className="flex items-center gap-4 p-3 rounded-md bg-blue-50 text-sm">
          {calcolo.arrotondata && (
            <div className="flex items-center gap-1 text-amber-700 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Misura arrotondata a {calcolo.larghezzaEffettiva}×{calcolo.altezzaEffettiva} mm
            </div>
          )}
          <div className="flex gap-4 ml-auto">
            {finitura && (
              <span className="text-gray-500">
                Base: € {formatEuro(calcolo.prezzoBase)}
              </span>
            )}
            <span className="text-gray-700">
              Unitario: <strong>€ {formatEuro(calcolo.prezzoUnitario)}</strong>
            </span>
            <span className="text-blue-800 font-semibold">
              Totale riga: € {formatEuro(calcolo.totalRiga)}
            </span>
          </div>
        </div>
      )}

      {calcolo?.error && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          {calcolo.error}
        </p>
      )}

      <Button onClick={handleAdd} disabled={!canAdd} className="w-full sm:w-auto">
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi articolo
      </Button>
    </div>
  )
}
