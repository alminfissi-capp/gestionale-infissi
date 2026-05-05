'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, TrendingUp, Wrench } from 'lucide-react'
import { applicaFinitura, calcolaPrezzoUnitarioLibero, calcolaTotaleRiga, formatEuro } from '@/lib/pricing'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import type { AccessorioSelezionato, ArticoloWizard } from '@/types/preventivo'

interface Props {
  listini: CategoriaConListini[]
  aliquote: number[]
  onAdd: (articolo: ArticoloWizard) => void
}

export default function FormArticoloLibero({ listini, aliquote, onAdd }: Props) {
  // Solo categorie libere
  const categorieLIbere = useMemo(
    () => listini.filter((c) => c.tipo === 'libero'),
    [listini]
  )

  const [categoriaId, setCategoriaId] = useState<string>('')
  const [listinoId, setListinoId] = useState<string>('')
  const [prodottoId, setProdottoId] = useState<string>('')
  const [finituraId, setFinituraId] = useState<string>('')
  const [accessoriQty, setAccessoriQty] = useState<Record<string, number>>({})
  const [quantita, setQuantita] = useState<string>('1')
  const [scontoArticolo, setScontoArticolo] = useState(0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(null)
  const [note, setNote] = useState<string>('')
  const [costoPosa, setCostoPosa] = useState<string>('')
  const [bypassCalcolo, setBypassCalcolo] = useState(false)
  const [costoProdottoBypass, setCostoProdottoBypass] = useState<string>('')
  const [modalitaPrezzo, setModalitaPrezzo] = useState<'manuale' | 'percentuale'>('manuale')
  const [prezzoManuale, setPrezzoManuale] = useState<string>('')
  const [percentualeUtile, setPercentualeUtile] = useState<string>('')

  const categoriaSelezionata = useMemo(
    () => categorieLIbere.find((c) => c.id === categoriaId),
    [categorieLIbere, categoriaId]
  )

  const listinoSelezionato = useMemo(
    () => categoriaSelezionata?.listini_liberi.find((l) => l.id === listinoId),
    [categoriaSelezionata, listinoId]
  )

  const prodottoSelezionato = useMemo(
    () => listinoSelezionato?.prodotti.find((p) => p.id === prodottoId),
    [listinoSelezionato, prodottoId]
  )

  const finitureDisponibili = useMemo(
    () => categoriaSelezionata?.finiture_categoria ?? [],
    [categoriaSelezionata]
  )

  const finituraSelezionata = useMemo(
    () => finitureDisponibili.find((f) => f.id === finituraId) ?? null,
    [finitureDisponibili, finituraId]
  )

  const scontoMax = categoriaSelezionata?.sconto_massimo ?? 50

  // Accessori selezionati (qty > 0)
  const accessoriSelezionati = useMemo((): AccessorioSelezionato[] => {
    if (!listinoSelezionato) return []
    return listinoSelezionato.accessori
      .filter((a) => (accessoriQty[a.id] ?? 0) > 0)
      .map((a) => ({
        id: a.id,
        nome: a.nome,
        prezzo: a.prezzo,
        prezzo_acquisto: a.prezzo_acquisto ?? 0,
        qty: accessoriQty[a.id] ?? 1,
      }))
  }, [listinoSelezionato, accessoriQty])

  const calcolo = useMemo(() => {
    if (!prodottoSelezionato) return null
    // Applica finitura al prezzo base del prodotto
    const prezzoConFinitura = finituraSelezionata
      ? applicaFinitura(
          prodottoSelezionato.prezzo,
          finituraSelezionata.aumento_percentuale,
          finituraSelezionata.aumento_euro
        )
      : prodottoSelezionato.prezzo
    const prezzoUnitario = calcolaPrezzoUnitarioLibero(prezzoConFinitura, accessoriSelezionati)
    const qty = Math.max(1, parseInt(quantita) || 1)
    const totalRiga = calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo)
    return {
      prezzoProdotto: prodottoSelezionato.prezzo,
      prezzoFinitura: prezzoConFinitura - prodottoSelezionato.prezzo,
      prezzoAccessori: prezzoUnitario - prezzoConFinitura,
      prezzoUnitario,
      totalRiga,
    }
  }, [prodottoSelezionato, finituraSelezionata, accessoriSelezionati, quantita, scontoArticolo])

  const handleCategoriaChange = (id: string) => {
    setCategoriaId(id)
    setListinoId('')
    setProdottoId('')
    setFinituraId('')
    setAccessoriQty({})
    setScontoArticolo(0)
  }

  const handleListinoChange = (id: string) => {
    setListinoId(id)
    setProdottoId('')
    setAccessoriQty({})
    setBypassCalcolo(false)
    setCostoProdottoBypass('')
    setPrezzoManuale('')
    setPercentualeUtile('')
  }

  const handleProdottoChange = (id: string) => {
    setProdottoId(id)
    setAccessoriQty({})
  }

  const toggleAccessorio = (accId: string, checked: boolean) => {
    setAccessoriQty((prev) => {
      const next = { ...prev }
      if (checked) {
        next[accId] = prev[accId] ?? 1
      } else {
        delete next[accId]
      }
      return next
    })
  }

  const setAccessorioQty = (accId: string, qty: number) => {
    setAccessoriQty((prev) => ({
      ...prev,
      [accId]: Math.max(1, qty),
    }))
  }

  const calcoloBypass = useMemo(() => {
    if (!bypassCalcolo) return null
    const costoProd = parseFloat(costoProdottoBypass) || 0
    const posa = parseFloat(costoPosa) || 0
    const qty = Math.max(1, parseInt(quantita) || 1)
    let prezzoUnitario = 0
    if (modalitaPrezzo === 'manuale') {
      prezzoUnitario = parseFloat(prezzoManuale) || 0
    } else {
      const perc = parseFloat(percentualeUtile) || 0
      prezzoUnitario = (costoProd + posa) * (1 + perc / 100)
    }
    const totalRiga = calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo)
    return { costoProd, posa, prezzoUnitario, totalRiga }
  }, [bypassCalcolo, costoProdottoBypass, costoPosa, quantita, modalitaPrezzo, prezzoManuale, percentualeUtile, scontoArticolo])

  const canAdd = !!prodottoSelezionato && parseInt(quantita) > 0 && (
    bypassCalcolo
      ? (calcoloBypass?.prezzoUnitario ?? 0) > 0
      : calcolo !== null
  )

  const handleAdd = () => {
    if (!canAdd || !prodottoSelezionato || !listinoSelezionato) return

    const qty = Math.max(1, parseInt(quantita) || 1)

    let articolo: ArticoloWizard

    if (bypassCalcolo && calcoloBypass) {
      articolo = {
        tempId: crypto.randomUUID(),
        tipo: 'listino_libero',
        listino_id: null,
        listino_libero_id: listinoSelezionato.id,
        prodotto_id: prodottoSelezionato.id,
        accessori_selezionati: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
        accessori_griglia: null,
        tipologia: `${listinoSelezionato.tipologia} — ${prodottoSelezionato.nome}`,
        categoria_nome: prodottoSelezionato.descrizione ?? null,
        larghezza_mm: null,
        altezza_mm: null,
        larghezza_listino_mm: null,
        altezza_listino_mm: null,
        misura_arrotondata: false,
        finitura_nome: finituraSelezionata?.nome ?? null,
        finitura_aumento: finituraSelezionata?.aumento_percentuale ?? 0,
        finitura_aumento_euro: finituraSelezionata?.aumento_euro ?? 0,
        immagine_url: prodottoSelezionato.immagine_url ?? null,
        note: note || null,
        quantita: qty,
        prezzo_base: null,
        prezzo_unitario: calcoloBypass.prezzoUnitario,
        sconto_articolo: scontoArticolo,
        prezzo_totale_riga: calcoloBypass.totalRiga,
        costo_acquisto_unitario: calcoloBypass.costoProd,
        costo_posa: calcoloBypass.posa,
        aliquota_iva: aliquotaIva,
        ordine: 0,
        bypass_calcolo: true,
        costo_prodotto_bypass: calcoloBypass.costoProd,
        modalita_prezzo_bypass: modalitaPrezzo,
        percentuale_utile_bypass: modalitaPrezzo === 'percentuale' ? (parseFloat(percentualeUtile) || null) : null,
      }
    } else {
      if (!calcolo) return
      const costoAccessoriUnit = accessoriSelezionati.reduce((sum, a) => sum + a.prezzo_acquisto * a.qty, 0)
      articolo = {
        tempId: crypto.randomUUID(),
        tipo: 'listino_libero',
        listino_id: null,
        listino_libero_id: listinoSelezionato.id,
        prodotto_id: prodottoSelezionato.id,
        accessori_selezionati: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
        accessori_griglia: null,
        tipologia: `${listinoSelezionato.tipologia} — ${prodottoSelezionato.nome}`,
        categoria_nome: prodottoSelezionato.descrizione ?? null,
        larghezza_mm: null,
        altezza_mm: null,
        larghezza_listino_mm: null,
        altezza_listino_mm: null,
        misura_arrotondata: false,
        finitura_nome: finituraSelezionata?.nome ?? null,
        finitura_aumento: finituraSelezionata?.aumento_percentuale ?? 0,
        finitura_aumento_euro: finituraSelezionata?.aumento_euro ?? 0,
        immagine_url: prodottoSelezionato.immagine_url ?? null,
        note: note || null,
        quantita: qty,
        prezzo_base: prodottoSelezionato.prezzo,
        prezzo_unitario: calcolo.prezzoUnitario,
        sconto_articolo: scontoArticolo,
        prezzo_totale_riga: calcolo.totalRiga,
        costo_acquisto_unitario: prodottoSelezionato.prezzo_acquisto + costoAccessoriUnit,
        costo_posa: parseFloat(costoPosa) || 0,
        aliquota_iva: aliquotaIva,
        ordine: 0,
        bypass_calcolo: false,
        costo_prodotto_bypass: null,
        modalita_prezzo_bypass: null,
        percentuale_utile_bypass: null,
      }
    }

    onAdd(articolo)

    // Reset mantenendo categoria e listino
    setProdottoId('')
    setFinituraId('')
    setAccessoriQty({})
    setQuantita('1')
    setScontoArticolo(0)
    setAliquotaIva(null)
    setNote('')
    setCostoPosa('')
    setBypassCalcolo(false)
    setCostoProdottoBypass('')
    setPrezzoManuale('')
    setPercentualeUtile('')
  }

  if (categorieLIbere.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-400 italic">
        Nessuna categoria catalogo disponibile. Crea prima una categoria di tipo &quot;Catalogo prodotti&quot; nella sezione Listini.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Aggiungi da catalogo</p>
        {prodottoSelezionato && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-medium text-orange-600 flex items-center gap-1">
              <Wrench className="h-3 w-3" />Calcolo manuale
            </span>
            <Switch
              size="sm"
              checked={bypassCalcolo}
              onCheckedChange={(v) => {
                setBypassCalcolo(v)
                if (!v) { setCostoProdottoBypass(''); setPrezzoManuale(''); setPercentualeUtile('') }
              }}
            />
          </label>
        )}
      </div>

      {/* Selezione categoria */}
      <div className="flex flex-wrap gap-2">
        {categorieLIbere.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleCategoriaChange(cat.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              categoriaId === cat.id
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
            }`}
          >
            <IconaCategoria icona={cat.icona} size="sm" /> {cat.nome}
          </button>
        ))}
      </div>

      {categoriaSelezionata && (
        <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Listino */}
          <div className="col-span-2 space-y-1.5">
            <Label>Listino</Label>
            <Select value={listinoId} onValueChange={handleListinoChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona listino..." />
              </SelectTrigger>
              <SelectContent>
                {categoriaSelezionata.listini_liberi.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.tipologia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prodotto */}
          {listinoSelezionato && (
            <div className="col-span-2 space-y-1.5">
              <Label>Prodotto</Label>
              <Select value={prodottoId} onValueChange={handleProdottoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona prodotto..." />
                </SelectTrigger>
                <SelectContent>
                  {listinoSelezionato.prodotti.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} — € {formatEuro(p.prezzo)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Anteprima prodotto */}
          {prodottoSelezionato?.immagine_url && (
            <div className="col-span-2 flex items-center gap-3">
              <Image
                src={prodottoSelezionato.immagine_url}
                alt={prodottoSelezionato.nome}
                width={80}
                height={60}
                className="rounded border object-cover shrink-0"
              />
              {prodottoSelezionato.descrizione && (
                <p className="text-xs text-gray-400">{prodottoSelezionato.descrizione}</p>
              )}
            </div>
          )}

          {/* Finitura */}
          {prodottoSelezionato && finitureDisponibili.length > 0 && (
            <div className="col-span-2 space-y-1.5">
              <Label>Finitura</Label>
              <Select value={finituraId} onValueChange={setFinituraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessuna finitura" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessuna finitura</SelectItem>
                  {finitureDisponibili.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                      {f.aumento_percentuale > 0 && ` +${f.aumento_percentuale}%`}
                      {f.aumento_euro > 0 && ` +€${formatEuro(f.aumento_euro)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Accessori */}
          {listinoSelezionato && listinoSelezionato.accessori.length > 0 && prodottoSelezionato && (
            <div className="col-span-4 space-y-1.5">
              <Label>Accessori</Label>
              <div className="rounded-md border bg-gray-50 p-3 space-y-2">
                {listinoSelezionato.accessori.map((acc) => {
                  const checked = (accessoriQty[acc.id] ?? 0) > 0
                  return (
                    <div key={acc.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`acc-${acc.id}`}
                        checked={checked}
                        onChange={(e) => toggleAccessorio(acc.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 cursor-pointer"
                      />
                      <label
                        htmlFor={`acc-${acc.id}`}
                        className="flex-1 text-sm text-gray-700 cursor-pointer"
                      >
                        {acc.nome}
                        <span className="text-gray-400 ml-1.5">€ {formatEuro(acc.prezzo)}</span>
                      </label>
                      {checked && (
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-gray-500">Qtà</Label>
                          <Input
                            type="number"
                            min={1}
                            value={accessoriQty[acc.id] ?? 1}
                            onChange={(e) =>
                              setAccessorioQty(acc.id, parseInt(e.target.value) || 1)
                            }
                            className="w-16 h-7 text-center text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quantità, sconto, IVA, note */}
          {prodottoSelezionato && (
            <>
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
                  placeholder="Note aggiuntive..."
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

            </>
          )}
        </div>

        {/* Campi bypass */}
        {bypassCalcolo && prodottoSelezionato && (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Calcolo manuale — il listino viene ignorato</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-amber-700">Costo prodotto (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costoProdottoBypass}
                  onChange={(e) => setCostoProdottoBypass(e.target.value)}
                  placeholder="0,00"
                  className="border-amber-200 focus-visible:ring-amber-400"
                />
              </div>

              <div className="col-span-2 sm:col-span-4 space-y-1.5">
                <Label>Modalità prezzo al cliente</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalitaPrezzo('manuale')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      modalitaPrezzo === 'manuale'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                    }`}
                  >
                    Prezzo manuale
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalitaPrezzo('percentuale')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      modalitaPrezzo === 'percentuale'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                    }`}
                  >
                    % utile
                  </button>
                </div>
              </div>

              {modalitaPrezzo === 'manuale' ? (
                <div className="col-span-2 space-y-1.5">
                  <Label>Prezzo al cliente (€)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={prezzoManuale}
                    onChange={(e) => setPrezzoManuale(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              ) : (
                <div className="col-span-2 space-y-1.5">
                  <Label>% utile da applicare</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={percentualeUtile}
                      onChange={(e) => setPercentualeUtile(e.target.value)}
                      placeholder="es. 30"
                      className="max-w-[120px]"
                    />
                    <span className="text-sm text-gray-500">%</span>
                    {calcoloBypass && calcoloBypass.prezzoUnitario > 0 && (
                      <span className="text-sm font-medium text-orange-700">
                        → € {formatEuro(calcoloBypass.prezzoUnitario)} /pz
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {calcoloBypass && calcoloBypass.prezzoUnitario > 0 && (
              <>
                <div className="flex items-center gap-4 p-3 rounded-md bg-orange-100 text-sm flex-wrap">
                  <span className="text-gray-700">
                    Unitario: <strong>€ {formatEuro(calcoloBypass.prezzoUnitario)}</strong>
                  </span>
                  <span className="text-orange-800 font-semibold ml-auto">
                    Totale riga: € {formatEuro(calcoloBypass.totalRiga)}
                  </span>
                </div>
                {(calcoloBypass.costoProd > 0 || calcoloBypass.posa > 0) && (() => {
                  const qty = Math.max(1, parseInt(quantita) || 1)
                  const costoTot = (calcoloBypass.costoProd + calcoloBypass.posa) * qty
                  const utile = calcoloBypass.totalRiga - costoTot
                  const percUtile = costoTot > 0 ? (utile / costoTot) * 100 : null
                  return (
                    <div className="flex items-center gap-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs flex-wrap">
                      <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span className="text-amber-800 font-medium">Interno:</span>
                      {calcoloBypass.costoProd > 0 && <span className="text-gray-600">Prodotto: <strong>€ {formatEuro(calcoloBypass.costoProd)}</strong>/pz</span>}
                      {calcoloBypass.posa > 0 && <span className="text-gray-600">Posa: <strong>€ {formatEuro(calcoloBypass.posa)}</strong>/pz</span>}
                      <span className="text-gray-600">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
                      <span className={`font-semibold ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        Utile: € {formatEuro(utile)}
                        {percUtile !== null && <span className="ml-1 font-normal opacity-80">({percUtile.toFixed(1).replace('.', ',')}%)</span>}
                      </span>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )}
        </>
      )}

      {/* Preview prezzo (solo modalità automatica) */}
      {!bypassCalcolo && calcolo && prodottoSelezionato && (
        <div className="flex items-center gap-4 p-3 rounded-md bg-teal-50 text-sm">
          <div className="flex gap-4 ml-auto flex-wrap">
            <span className="text-gray-500">
              Prodotto: <strong>€ {formatEuro(calcolo.prezzoProdotto)}</strong>
            </span>
            {calcolo.prezzoFinitura > 0 && (
              <span className="text-gray-500">
                Finitura: <strong>+€ {formatEuro(calcolo.prezzoFinitura)}</strong>
              </span>
            )}
            {calcolo.prezzoAccessori > 0 && (
              <span className="text-gray-500">
                Accessori: <strong>+€ {formatEuro(calcolo.prezzoAccessori)}</strong>
              </span>
            )}
            <span className="text-gray-700">
              Unitario: <strong>€ {formatEuro(calcolo.prezzoUnitario)}</strong>
            </span>
            <span className="text-teal-800 font-semibold">
              Totale riga: € {formatEuro(calcolo.totalRiga)}
            </span>
          </div>
        </div>
      )}

      {/* Preview costi interni (solo modalità automatica) */}
      {!bypassCalcolo && calcolo && prodottoSelezionato && (
        (() => {
          const qty = Math.max(1, parseInt(quantita) || 1)
          const costoAcqUnit = (prodottoSelezionato.prezzo_acquisto ?? 0)
            + accessoriSelezionati.reduce((sum, a) => sum + (a.prezzo_acquisto ?? 0) * a.qty, 0)
          const posaUnit = parseFloat(costoPosa) || 0
          const costoTot = (costoAcqUnit + posaUnit) * qty
          const utile = calcolo.totalRiga - costoTot
          if (costoAcqUnit === 0 && posaUnit === 0) return null
          return (
            <div className="flex items-center gap-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm flex-wrap">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="text-amber-800 text-xs font-medium">Interno:</span>
              <span className="text-gray-600 text-xs">Acq: <strong>€ {formatEuro(costoAcqUnit)}</strong>/pz</span>
              {posaUnit > 0 && <span className="text-gray-600 text-xs">Posa: <strong>€ {formatEuro(posaUnit)}</strong>/pz</span>}
              <span className="text-gray-600 text-xs">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
              <span className={`font-semibold text-xs ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                Utile: € {formatEuro(utile)}
              </span>
            </div>
          )
        })()
      )}

      <Button onClick={handleAdd} disabled={!canAdd} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700">
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi articolo
      </Button>
    </div>
  )
}
