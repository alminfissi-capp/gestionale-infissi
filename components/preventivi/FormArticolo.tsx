'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { Plus, AlertTriangle, Tag, TrendingUp } from 'lucide-react'
import {
  calcolaPrezzoBase,
  applicaFinitura,
  calcolaTotaleRiga,
  calcolaCostoAcquistoUnitario,
  calcolaAccessorioGriglia,
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
import type { ArticoloWizard, AccessorioGrigliaSelezionato } from '@/types/preventivo'

interface Props {
  listini: CategoriaConListini[]
  aliquote: number[]
  onAdd: (articolo: ArticoloWizard) => void
}

// Finitura unificata (categoria + listino)
type FinituraUnita = {
  nome: string
  aumento: number       // %
  aumento_euro: number  // €
  source: 'categoria' | 'listino'
}

export default function FormArticolo({ listini, aliquote, onAdd }: Props) {
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [listinoId, setListinoId] = useState<string>('')
  const [finituraIndex, setFinituraIndex] = useState<string>('-1')
  const [larghezza, setLarghezza] = useState<string>('')
  const [altezza, setAltezza] = useState<string>('')
  const [quantita, setQuantita] = useState<string>('1')
  const [scontoArticolo, setScontoArticolo] = useState(0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(null)
  const [note, setNote] = useState<string>('')
  const [costoPosa, setCostoPosa] = useState<string>('')
  const [accessoriGrigliaSelezionati, setAccessoriGrigliaSelezionati] = useState<AccessorioGrigliaSelezionato[]>([])

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

  // Gruppi accessori del listino selezionato
  const gruppiAccessori = useMemo(() => {
    if (!listinoSelezionato?.accessori_griglia?.length) return []
    const map = new Map<string, { tipo: 'multiplo' | 'unico'; accessori: typeof listinoSelezionato.accessori_griglia }>()
    const order: string[] = []
    for (const a of listinoSelezionato.accessori_griglia) {
      if (!map.has(a.gruppo)) {
        map.set(a.gruppo, { tipo: a.gruppo_tipo, accessori: [] })
        order.push(a.gruppo)
      }
      map.get(a.gruppo)!.accessori.push(a)
    }
    return order.map((g) => ({ gruppo: g, tipo: map.get(g)!.tipo, accessori: map.get(g)!.accessori }))
  }, [listinoSelezionato])

  const scontoMax = categoriaSelezionata?.sconto_massimo ?? 50

  const limiti = useMemo(() => {
    if (!listinoSelezionato) return null
    const lArr = [...listinoSelezionato.larghezze].sort((a, b) => a - b)
    const hArr = [...listinoSelezionato.altezze].sort((a, b) => a - b)
    return { maxL: lArr[lArr.length - 1], maxH: hArr[hArr.length - 1] }
  }, [listinoSelezionato])

  const larghezzaFuori = limiti !== null && parseInt(larghezza) > limiti.maxL
  const altezzaFuori = limiti !== null && parseInt(altezza) > limiti.maxH

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
    setAccessoriGrigliaSelezionati([])
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
      const prezzoConFinitura = finitura
        ? applicaFinitura(prezzo, finitura.aumento, finitura.aumento_euro)
        : prezzo
      const prezzoAccessori = accessoriGrigliaSelezionati.reduce(
        (sum, a) => sum + calcolaAccessorioGriglia(a, L, H, prezzo),
        0
      )
      const prezzoUnitario = prezzoConFinitura + prezzoAccessori
      const qty = Math.max(1, parseInt(quantita) || 1)
      const totalRiga = calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo)

      return {
        prezzoBase: prezzo,
        prezzoConFinitura,
        prezzoAccessori,
        prezzoUnitario,
        totalRiga,
        larghezzaEffettiva,
        altezzaEffettiva,
        arrotondata,
        error: null,
      }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Errore calcolo', prezzoBase: 0, prezzoConFinitura: 0, prezzoAccessori: 0, prezzoUnitario: 0, totalRiga: 0, larghezzaEffettiva: 0, altezzaEffettiva: 0, arrotondata: false }
    }
  }, [listinoSelezionato, larghezza, altezza, finitura, quantita, scontoArticolo, accessoriGrigliaSelezionati])

  const canAdd =
    listinoSelezionato && calcolo && !calcolo.error && parseInt(quantita) > 0

  const handleAdd = () => {
    if (!listinoSelezionato || !calcolo || calcolo.error || !canAdd) return

    const qty = Math.max(1, parseInt(quantita) || 1)
    const L = parseInt(larghezza)
    const H = parseInt(altezza)

    const articolo: ArticoloWizard = {
      tempId: crypto.randomUUID(),
      tipo: 'listino',
      listino_id: listinoSelezionato.id,
      listino_libero_id: null,
      prodotto_id: null,
      accessori_selezionati: null,
      accessori_griglia: accessoriGrigliaSelezionati.length > 0 ? accessoriGrigliaSelezionati : null,
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
      immagine_url: listinoSelezionato.immagine_url ?? null,
      note: note || null,
      quantita: qty,
      prezzo_base: calcolo.prezzoBase,
      prezzo_unitario: calcolo.prezzoUnitario,
      sconto_articolo: scontoArticolo,
      prezzo_totale_riga: calcolo.totalRiga,
      costo_acquisto_unitario: 0,
      costo_posa: parseFloat(costoPosa) || 0,
      aliquota_iva: aliquotaIva,
      ordine: 0,
    }

    onAdd(articolo)

    // Reset mantenendo categoria e listino per velocizzare inserimento multiplo
    setLarghezza('')
    setAltezza('')
    setQuantita('1')
    setScontoArticolo(0)
    setAliquotaIva(null)
    setFinituraIndex('-1')
    setNote('')
    setCostoPosa('')
    setAccessoriGrigliaSelezionati([])
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

          {/* Anteprima immagine listino */}
          {listinoSelezionato?.immagine_url && (
            <div className="col-span-2 flex items-center gap-3">
              <Image
                src={listinoSelezionato.immagine_url}
                alt={listinoSelezionato.tipologia}
                width={80}
                height={60}
                className="rounded border object-cover shrink-0"
              />
              <p className="text-xs text-gray-400">Immagine prodotto</p>
            </div>
          )}

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

          {/* Accessori griglia */}
          {listinoSelezionato && gruppiAccessori.length > 0 && (
            <div className="col-span-2 sm:col-span-4 space-y-2">
              <Label>Accessori</Label>
              {gruppiAccessori.map((gruppo) => (
                <div key={gruppo.gruppo} className="border rounded-md p-3 space-y-1.5 bg-gray-50">
                  <p className="text-xs font-medium text-gray-700">
                    {gruppo.gruppo}
                    <span className="ml-2 text-gray-400 font-normal">
                      ({gruppo.tipo === 'unico' ? 'scelta singola' : 'selezione multipla'})
                    </span>
                  </p>
                  {gruppo.tipo === 'unico' ? (
                    // Radio: nessuno + ogni accessorio
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                        <input
                          type="radio"
                          name={`gruppo-${gruppo.gruppo}`}
                          checked={!accessoriGrigliaSelezionati.some((a) => a.gruppo === gruppo.gruppo)}
                          onChange={() =>
                            setAccessoriGrigliaSelezionati((prev) =>
                              prev.filter((a) => a.gruppo !== gruppo.gruppo)
                            )
                          }
                          className="h-3.5 w-3.5"
                        />
                        <span>Nessuno</span>
                      </label>
                      {gruppo.accessori.map((acc) => (
                        <label key={acc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name={`gruppo-${gruppo.gruppo}`}
                            checked={accessoriGrigliaSelezionati.some((a) => a.id === acc.id)}
                            onChange={() =>
                              setAccessoriGrigliaSelezionati((prev) => [
                                ...prev.filter((a) => a.gruppo !== gruppo.gruppo),
                                {
                                  id: acc.id,
                                  nome: acc.nome,
                                  gruppo: acc.gruppo,
                                  tipo_prezzo: acc.tipo_prezzo,
                                  prezzo: acc.prezzo,
                                  prezzo_acquisto: acc.prezzo_acquisto,
                                  mq_minimo: acc.mq_minimo,
                                },
                              ])
                            }
                            className="h-3.5 w-3.5"
                          />
                          <span>{acc.nome}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    // Checkbox: selezione multipla
                    <div className="space-y-1">
                      {gruppo.accessori.map((acc) => (
                        <label key={acc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={accessoriGrigliaSelezionati.some((a) => a.id === acc.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAccessoriGrigliaSelezionati((prev) => [
                                  ...prev,
                                  {
                                    id: acc.id,
                                    nome: acc.nome,
                                    gruppo: acc.gruppo,
                                    tipo_prezzo: acc.tipo_prezzo,
                                    prezzo: acc.prezzo,
                                    prezzo_acquisto: acc.prezzo_acquisto,
                                    mq_minimo: acc.mq_minimo,
                                  },
                                ])
                              } else {
                                setAccessoriGrigliaSelezionati((prev) =>
                                  prev.filter((a) => a.id !== acc.id)
                                )
                              }
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span>{acc.nome}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Dimensioni */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Larghezza (mm)
              {limiti && (
                <span className="text-xs font-normal text-gray-400">max {limiti.maxL}</span>
              )}
            </Label>
            <Input
              type="number"
              min={1}
              value={larghezza}
              onChange={(e) => setLarghezza(e.target.value)}
              placeholder="es. 800"
              className={larghezzaFuori ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Altezza (mm)
              {limiti && (
                <span className="text-xs font-normal text-gray-400">max {limiti.maxH}</span>
              )}
            </Label>
            <Input
              type="number"
              min={1}
              value={altezza}
              onChange={(e) => setAltezza(e.target.value)}
              placeholder="es. 1200"
              className={altezzaFuori ? 'border-red-400 focus-visible:ring-red-400' : ''}
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
          {aliquote.length > 0 && (
            <div className="space-y-1.5">
              <Label>IVA</Label>
              <Select
                value={aliquotaIva != null ? aliquotaIva.toString() : 'none'}
                onValueChange={(v) => setAliquotaIva(v === 'none' ? null : parseFloat(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {aliquote.map((a) => (
                    <SelectItem key={a} value={a.toString()}>{a}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2 space-y-1.5">
            <Label>Note articolo</Label>
            <Input
              type="text"
              placeholder="es. Profili, Vetri, Accessori..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-amber-700">Costo posa (€) — interno</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={costoPosa}
              onChange={(e) => setCostoPosa(e.target.value)}
              placeholder="0,00"
              className="border-amber-200 focus-visible:ring-amber-400"
            />
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

      {/* Preview costi interni */}
      {calcolo && !calcolo.error && categoriaSelezionata && (
        (() => {
          const qty = Math.max(1, parseInt(quantita) || 1)
          const L = parseInt(larghezza) || 0
          const H = parseInt(altezza) || 0
          const costoAcqUnit = calcolaCostoAcquistoUnitario(calcolo.prezzoBase, categoriaSelezionata.sconto_fornitore ?? 0)
          const costoAccessoriUnit = accessoriGrigliaSelezionati.reduce(
            (sum, a) => sum + calcolaAccessorioGriglia({ ...a, prezzo: a.prezzo_acquisto }, L, H, calcolo.prezzoBase),
            0
          )
          const posaUnit = parseFloat(costoPosa) || 0
          const costoTot = (costoAcqUnit + costoAccessoriUnit + posaUnit) * qty
          const utile = calcolo.totalRiga - costoTot
          const percUtile = costoTot > 0 ? (utile / costoTot) * 100 : null
          return (
            <div className="flex items-center gap-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm flex-wrap">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="text-amber-800 text-xs font-medium">Interno:</span>
              <span className="text-gray-600 text-xs">Acq: <strong>€ {formatEuro(costoAcqUnit)}</strong>/pz</span>
              {costoAccessoriUnit > 0 && <span className="text-gray-600 text-xs">Acc: <strong>€ {formatEuro(costoAccessoriUnit)}</strong>/pz</span>}
              {posaUnit > 0 && <span className="text-gray-600 text-xs">Posa: <strong>€ {formatEuro(posaUnit)}</strong>/pz</span>}
              <span className="text-gray-600 text-xs">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
              <span className={`font-semibold text-xs ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                Utile: € {formatEuro(utile)}
                {percUtile !== null && (
                  <span className="ml-1 font-normal opacity-80">({percUtile.toFixed(1).replace('.', ',')}%)</span>
                )}
              </span>
            </div>
          )
        })()
      )}

      <Button onClick={handleAdd} disabled={!canAdd} className="w-full sm:w-auto">
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi articolo
      </Button>
    </div>
  )
}
