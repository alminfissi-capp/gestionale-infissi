'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { AlertTriangle, Tag, Plus, Package, TrendingUp, Wrench } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  calcolaPrezzoBase,
  applicaFinitura,
  calcolaTotaleRiga,
  calcolaPrezzoUnitarioLibero,
  calcolaCostoAcquistoUnitario,
  calcolaAccessorioGriglia,
  calcolaSpeseTrasportoPezzi,
  formatEuro,
} from '@/lib/pricing'
import type {
  CategoriaConListini,
  ListinoCompleto,
  ListinoLiberoCompleto,
  ProdottoListino,
} from '@/types/listino'
import type { AccessorioSelezionato, AccessorioGrigliaSelezionato, ArticoloWizard } from '@/types/preventivo'

export type ItemSel =
  | { tipo: 'griglia'; listino: ListinoCompleto; categoria: CategoriaConListini }
  | {
      tipo: 'libero'
      prodotto: ProdottoListino
      listinoLibero: ListinoLiberoCompleto
      categoria: CategoriaConListini
    }

interface Props {
  item: ItemSel | null
  aliquote: number[]
  initialValues?: ArticoloWizard
  isEditing?: boolean
  /** Articoli già nel preventivo (escluso quello in modifica) */
  articoliEsistenti: ArticoloWizard[]
  onAdd: (a: ArticoloWizard) => void
  onClose: () => void
}

// ─── Griglia form ────────────────────────────────────────────────────────────

type FinituraUnita = {
  nome: string
  aumento: number
  aumento_euro: number
  source: 'categoria' | 'listino'
}

function FormGriglia({
  listino,
  categoria,
  aliquote,
  initialValues,
  isEditing,
  articoliEsistenti,
  onAdd,
}: {
  listino: ListinoCompleto
  categoria: CategoriaConListini
  aliquote: number[]
  initialValues?: ArticoloWizard
  isEditing?: boolean
  articoliEsistenti: ArticoloWizard[]
  onAdd: (a: ArticoloWizard) => void
}) {
  const [finituraIndex, setFinituraIndex] = useState(() => {
    if (!initialValues?.finitura_nome) return '-1'
    const catFin = (categoria.finiture_categoria ?? []).map((f) => f.nome)
    const listinoFin = (listino.finiture ?? []).map((f) => f.nome)
    const allNames = [...catFin, ...listinoFin]
    const idx = allNames.findIndex((n) => n === initialValues.finitura_nome)
    return idx >= 0 ? idx.toString() : '-1'
  })
  const [larghezza, setLarghezza] = useState(initialValues?.larghezza_mm?.toString() ?? '')
  const [altezza, setAltezza] = useState(initialValues?.altezza_mm?.toString() ?? '')
  const [quantita, setQuantita] = useState(initialValues?.quantita?.toString() ?? '1')
  const [scontoArticolo, setScontoArticolo] = useState(initialValues?.sconto_articolo ?? 0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(initialValues?.aliquota_iva ?? null)
  const [note, setNote] = useState(initialValues?.note ?? '')
  const [costoPosa, setCostoPosa] = useState(initialValues?.costo_posa?.toString() ?? '')
  const [accessoriSelezionati, setAccessoriSelezionati] = useState<AccessorioGrigliaSelezionato[]>(
    initialValues?.accessori_griglia ?? []
  )
  const [bypassCalcolo, setBypassCalcolo] = useState(initialValues?.bypass_calcolo ?? false)
  const [costoProdottoBypass, setCostoProdottoBypass] = useState(initialValues?.costo_prodotto_bypass?.toString() ?? '')
  const [modalitaPrezzo, setModalitaPrezzo] = useState<'manuale' | 'percentuale'>(initialValues?.modalita_prezzo_bypass ?? 'manuale')
  const [prezzoManuale, setPrezzoManuale] = useState(
    initialValues?.bypass_calcolo && initialValues?.modalita_prezzo_bypass === 'manuale'
      ? (initialValues?.prezzo_unitario?.toString() ?? '')
      : ''
  )
  const [percentualeUtile, setPercentualeUtile] = useState(initialValues?.percentuale_utile_bypass?.toString() ?? '')

  const gruppiAccessori = useMemo(() => {
    if (!listino.accessori_griglia?.length) return []
    const map = new Map<string, { tipo: 'multiplo' | 'unico'; accessori: typeof listino.accessori_griglia }>()
    const order: string[] = []
    for (const a of listino.accessori_griglia) {
      if (!map.has(a.gruppo)) {
        map.set(a.gruppo, { tipo: a.gruppo_tipo, accessori: [] })
        order.push(a.gruppo)
      }
      map.get(a.gruppo)!.accessori.push(a)
    }
    return order.map((g) => ({ gruppo: g, tipo: map.get(g)!.tipo, accessori: map.get(g)!.accessori }))
  }, [listino])

  const finitureDisponibili = useMemo((): FinituraUnita[] => {
    const catFin: FinituraUnita[] = (categoria.finiture_categoria ?? []).map((f) => ({
      nome: f.nome,
      aumento: f.aumento_percentuale,
      aumento_euro: f.aumento_euro,
      source: 'categoria' as const,
    }))
    const listinoFin: FinituraUnita[] = (listino.finiture ?? []).map((f) => ({
      nome: f.nome,
      aumento: f.aumento,
      aumento_euro: f.aumento_euro ?? 0,
      source: 'listino' as const,
    }))
    return [...catFin, ...listinoFin]
  }, [categoria, listino])

  const finitura = useMemo(() => {
    const idx = parseInt(finituraIndex)
    if (idx < 0) return null
    return finitureDisponibili[idx] ?? null
  }, [finituraIndex, finitureDisponibili])

  const scontoMax = categoria.sconto_massimo ?? 50

  const limiti = useMemo(() => {
    const lArr = [...listino.larghezze].sort((a, b) => a - b)
    const hArr = [...listino.altezze].sort((a, b) => a - b)
    return { maxL: lArr[lArr.length - 1], maxH: hArr[hArr.length - 1] }
  }, [listino])

  const larghezzaFuori = !!larghezza && parseInt(larghezza) > limiti.maxL
  const altezzaFuori = !!altezza && parseInt(altezza) > limiti.maxH

  const calcolo = useMemo(() => {
    const L = parseInt(larghezza)
    const H = parseInt(altezza)
    if (!L || !H || L <= 0 || H <= 0) return null
    try {
      const { prezzo, larghezzaEffettiva, altezzaEffettiva, arrotondata } =
        calcolaPrezzoBase(listino.griglia, listino.larghezze, listino.altezze, L, H)
      const prezzoConFinitura = finitura
        ? applicaFinitura(prezzo, finitura.aumento, finitura.aumento_euro)
        : prezzo
      const prezzoAccessori = accessoriSelezionati.reduce(
        (sum, a) => sum + calcolaAccessorioGriglia(a, L, H, prezzo), 0
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
      return {
        error: e instanceof Error ? e.message : 'Errore calcolo',
        prezzoBase: 0,
        prezzoConFinitura: 0,
        prezzoAccessori: 0,
        prezzoUnitario: 0,
        totalRiga: 0,
        larghezzaEffettiva: 0,
        altezzaEffettiva: 0,
        arrotondata: false,
      }
    }
  }, [listino, larghezza, altezza, finitura, quantita, scontoArticolo, accessoriSelezionati])

  const calcoloBypass = useMemo(() => {
    if (!bypassCalcolo) return null
    const costoProd = parseFloat(costoProdottoBypass) || 0
    const posa = parseFloat(costoPosa) || 0
    const qty = Math.max(1, parseInt(quantita) || 1)
    let prezzoUnitario = 0
    if (modalitaPrezzo === 'manuale') {
      prezzoUnitario = parseFloat(prezzoManuale) || 0
    } else {
      prezzoUnitario = (costoProd + posa) * (1 + (parseFloat(percentualeUtile) || 0) / 100)
    }
    return { costoProd, posa, prezzoUnitario, totalRiga: calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo) }
  }, [bypassCalcolo, costoProdottoBypass, costoPosa, quantita, modalitaPrezzo, prezzoManuale, percentualeUtile, scontoArticolo])

  const canAdd = bypassCalcolo
    ? (calcoloBypass?.prezzoUnitario ?? 0) > 0 && parseInt(quantita) > 0
    : !!(calcolo && !calcolo.error && parseInt(quantita) > 0)

  const handleAdd = () => {
    if (!canAdd) return
    const qty = Math.max(1, parseInt(quantita) || 1)
    const L = parseInt(larghezza) || 0
    const H = parseInt(altezza) || 0

    if (bypassCalcolo && calcoloBypass) {
      onAdd({
        tempId: isEditing && initialValues ? initialValues.tempId : crypto.randomUUID(),
        tipo: 'listino',
        listino_id: listino.id,
        listino_libero_id: null,
        prodotto_id: null,
        accessori_selezionati: null,
        accessori_griglia: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
        tipologia: listino.tipologia,
        categoria_nome: categoria.nome,
        larghezza_mm: L || null,
        altezza_mm: H || null,
        larghezza_listino_mm: null,
        altezza_listino_mm: null,
        misura_arrotondata: false,
        finitura_nome: finitura?.nome ?? null,
        finitura_aumento: finitura?.aumento ?? 0,
        finitura_aumento_euro: finitura?.aumento_euro ?? 0,
        immagine_url: listino.immagine_url ?? null,
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
      })
      return
    }

    if (!calcolo || calcolo.error) return
    const costoAcqUnit = calcolaCostoAcquistoUnitario(calcolo.prezzoBase, categoria.sconto_fornitore ?? 0)
    const costoAccessoriUnit = accessoriSelezionati.reduce(
      (sum, a) => sum + calcolaAccessorioGriglia({ ...a, prezzo: a.prezzo_acquisto }, L, H, calcolo.prezzoBase),
      0
    )
    onAdd({
      tempId: isEditing && initialValues ? initialValues.tempId : crypto.randomUUID(),
      tipo: 'listino',
      listino_id: listino.id,
      listino_libero_id: null,
      prodotto_id: null,
      accessori_selezionati: null,
      accessori_griglia: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
      tipologia: listino.tipologia,
      categoria_nome: categoria.nome,
      larghezza_mm: L,
      altezza_mm: H,
      larghezza_listino_mm: calcolo.larghezzaEffettiva,
      altezza_listino_mm: calcolo.altezzaEffettiva,
      misura_arrotondata: calcolo.arrotondata,
      finitura_nome: finitura?.nome ?? null,
      finitura_aumento: finitura?.aumento ?? 0,
      finitura_aumento_euro: finitura?.aumento_euro ?? 0,
      immagine_url: listino.immagine_url ?? null,
      note: note || null,
      quantita: qty,
      prezzo_base: calcolo.prezzoBase,
      prezzo_unitario: calcolo.prezzoUnitario,
      sconto_articolo: scontoArticolo,
      prezzo_totale_riga: calcolo.totalRiga,
      costo_acquisto_unitario: costoAcqUnit + costoAccessoriUnit,
      costo_posa: parseFloat(costoPosa) || 0,
      aliquota_iva: aliquotaIva,
      ordine: 0,
      bypass_calcolo: false,
      costo_prodotto_bypass: null,
      modalita_prezzo_bypass: null,
      percentuale_utile_bypass: null,
    })
  }

  return (
    <div className="space-y-4">
      {/* Immagine + titolo */}
      {listino.immagine_url && (
        <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
          <Image
            src={listino.immagine_url}
            alt={listino.tipologia}
            width={96}
            height={72}
            className="rounded-lg border object-cover shrink-0"
          />
          <div>
            <p className="font-semibold text-gray-900">{listino.tipologia}</p>
            <p className="text-sm text-gray-500">{categoria.nome}</p>
            <p className="text-xs text-gray-400 mt-1">
              {listino.altezze.length}H × {listino.larghezze.length}L
            </p>
          </div>
        </div>
      )}

      {/* Switch bypass */}
      <label className="flex items-center justify-end gap-2 cursor-pointer select-none">
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

      <div className="grid grid-cols-2 gap-3">
        {/* Finitura */}
        {finitureDisponibili.length > 0 && (
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
        {gruppiAccessori.length > 0 && (
          <div className="col-span-2 space-y-2">
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
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                      <input
                        type="radio"
                        name={`grp-${gruppo.gruppo}`}
                        checked={!accessoriSelezionati.some((a) => a.gruppo === gruppo.gruppo)}
                        onChange={() => setAccessoriSelezionati((p) => p.filter((a) => a.gruppo !== gruppo.gruppo))}
                        className="h-3.5 w-3.5"
                      />
                      <span>Nessuno</span>
                    </label>
                    {gruppo.accessori.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`grp-${gruppo.gruppo}`}
                          checked={accessoriSelezionati.some((a) => a.id === acc.id)}
                          onChange={() => setAccessoriSelezionati((p) => [
                            ...p.filter((a) => a.gruppo !== gruppo.gruppo),
                            { id: acc.id, nome: acc.nome, gruppo: acc.gruppo, tipo_prezzo: acc.tipo_prezzo, prezzo: acc.prezzo, prezzo_acquisto: acc.prezzo_acquisto, mq_minimo: acc.mq_minimo },
                          ])}
                          className="h-3.5 w-3.5"
                        />
                        <span>{acc.nome}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {gruppo.accessori.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={accessoriSelezionati.some((a) => a.id === acc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAccessoriSelezionati((p) => [...p, { id: acc.id, nome: acc.nome, gruppo: acc.gruppo, tipo_prezzo: acc.tipo_prezzo, prezzo: acc.prezzo, prezzo_acquisto: acc.prezzo_acquisto, mq_minimo: acc.mq_minimo }])
                            } else {
                              setAccessoriSelezionati((p) => p.filter((a) => a.id !== acc.id))
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

        {/* Larghezza */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Larghezza (mm)
            <span className="text-xs font-normal text-gray-400">max {limiti.maxL}</span>
          </Label>
          <Input
            type="number"
            min={1}
            value={larghezza}
            onChange={(e) => setLarghezza(e.target.value)}
            placeholder="es. 800"
            className={larghezzaFuori ? 'border-red-400 focus-visible:ring-red-400' : ''}
            autoFocus
          />
        </div>

        {/* Altezza */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Altezza (mm)
            <span className="text-xs font-normal text-gray-400">max {limiti.maxH}</span>
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

        {/* Quantità */}
        <div className="space-y-1.5">
          <Label>Quantità</Label>
          <Input
            type="number"
            min={1}
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
          />
        </div>

        {/* Sconto */}
        <div className="space-y-1.5">
          <Label>Sconto{scontoMax < 50 ? ` (max ${scontoMax}%)` : ''}</Label>
          <ScontoSelect value={scontoArticolo} onChange={setScontoArticolo} max={scontoMax} />
        </div>

        {/* IVA */}
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
                  <SelectItem key={a} value={a.toString()}>
                    {a}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Note */}
        <div className="col-span-2 space-y-1.5">
          <Label>Note articolo</Label>
          <Input
            type="text"
            placeholder="es. Profili, Vetri, Accessori..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {/* Costo posa */}
      <div className="space-y-1.5">
        <Label className="text-amber-700">Costo posa (€) — uso interno</Label>
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

      {/* Campi bypass */}
      {bypassCalcolo && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Calcolo manuale — listino ignorato</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-amber-700">Costo prodotto (€)</Label>
              <Input type="number" min={0} step={0.01} value={costoProdottoBypass} onChange={(e) => setCostoProdottoBypass(e.target.value)} placeholder="0,00" className="border-amber-200 focus-visible:ring-amber-400" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Modalità prezzo al cliente</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModalitaPrezzo('manuale')} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${modalitaPrezzo === 'manuale' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}>Prezzo manuale</button>
                <button type="button" onClick={() => setModalitaPrezzo('percentuale')} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${modalitaPrezzo === 'percentuale' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}>% utile</button>
              </div>
            </div>
            {modalitaPrezzo === 'manuale' ? (
              <div className="col-span-2 space-y-1.5">
                <Label>Prezzo al cliente (€)</Label>
                <Input type="number" min={0} step={0.01} value={prezzoManuale} onChange={(e) => setPrezzoManuale(e.target.value)} placeholder="0,00" />
              </div>
            ) : (
              <div className="col-span-2 space-y-1.5">
                <Label>% utile da applicare</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} step={0.1} value={percentualeUtile} onChange={(e) => setPercentualeUtile(e.target.value)} placeholder="es. 30" className="max-w-[120px]" />
                  <span className="text-sm text-gray-500">%</span>
                  {calcoloBypass && calcoloBypass.prezzoUnitario > 0 && (
                    <span className="text-sm font-medium text-orange-700">→ € {formatEuro(calcoloBypass.prezzoUnitario)} /pz</span>
                  )}
                </div>
              </div>
            )}
          </div>
          {calcoloBypass && calcoloBypass.prezzoUnitario > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-md bg-orange-100 text-sm flex-wrap">
              <span className="text-gray-700">Unitario: <strong>€ {formatEuro(calcoloBypass.prezzoUnitario)}</strong></span>
              <span className="text-orange-800 font-semibold ml-auto">Totale riga: € {formatEuro(calcoloBypass.totalRiga)}</span>
            </div>
          )}
          {calcoloBypass && (calcoloBypass.costoProd > 0 || calcoloBypass.posa > 0) && calcoloBypass.prezzoUnitario > 0 && (() => {
            const qty = Math.max(1, parseInt(quantita) || 1)
            const costoTot = (calcoloBypass.costoProd + calcoloBypass.posa) * qty
            const utile = calcoloBypass.totalRiga - costoTot
            const percUtile = costoTot > 0 ? (utile / costoTot) * 100 : null
            return (
              <div className="flex items-center gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs flex-wrap">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="text-amber-800 font-medium">Interno:</span>
                {calcoloBypass.costoProd > 0 && <span className="text-gray-600">Prodotto: <strong>€ {formatEuro(calcoloBypass.costoProd)}</strong>/pz</span>}
                {calcoloBypass.posa > 0 && <span className="text-gray-600">Posa: <strong>€ {formatEuro(calcoloBypass.posa)}</strong>/pz</span>}
                <span className="text-gray-600">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
                <span className={`font-semibold ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  Utile: € {formatEuro(utile)}{percUtile !== null && <span className="ml-1 font-normal opacity-80">({percUtile.toFixed(1).replace('.', ',')}%)</span>}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {/* Preview prezzo (solo automatica) */}
      {!bypassCalcolo && calcolo && !calcolo.error && (
        <div className="flex items-center gap-4 p-3 rounded-md bg-blue-50 text-sm flex-wrap">
          {calcolo.arrotondata && (
            <div className="flex items-center gap-1 text-amber-700 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Arrotondata a {calcolo.larghezzaEffettiva}×{calcolo.altezzaEffettiva} mm
            </div>
          )}
          <div className="flex gap-4 ml-auto flex-wrap">
            {(finitura || calcolo.prezzoAccessori > 0) && (
              <span className="text-gray-500">Base: € {formatEuro(calcolo.prezzoBase)}</span>
            )}
            {calcolo.prezzoAccessori > 0 && (
              <span className="text-gray-500">Acc: +€ {formatEuro(calcolo.prezzoAccessori)}</span>
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

      {/* Preview costi interni (solo automatica) */}
      {!bypassCalcolo && calcolo && !calcolo.error && (
        (() => {
          const qty = Math.max(1, parseInt(quantita) || 1)
          const L = parseInt(larghezza) || 0
          const H = parseInt(altezza) || 0
          const costoAcqUnit = calcolaCostoAcquistoUnitario(calcolo.prezzoBase, categoria.sconto_fornitore ?? 0)
          const costoAccessoriUnit = accessoriSelezionati.reduce(
            (sum, a) => sum + calcolaAccessorioGriglia({ ...a, prezzo: a.prezzo_acquisto }, L, H, calcolo.prezzoBase),
            0
          )
          const posaUnit = parseFloat(costoPosa) || 0
          const listinoIdsCat = new Set([
            ...categoria.listini.map((l) => l.id),
            ...(categoria.listini_liberi ?? []).map((l) => l.id),
          ])
          const esistentiCat = articoliEsistenti.filter(
            (a) =>
              (a.tipo === 'listino' && !!a.listino_id && listinoIdsCat.has(a.listino_id)) ||
              (a.tipo === 'listino_libero' && !!a.listino_libero_id && listinoIdsCat.has(a.listino_libero_id))
          )
          const pezziEsistenti = esistentiCat.reduce((s, a) => s + a.quantita, 0)
          const valoreEsistenti = esistentiCat.reduce((s, a) => s + a.prezzo_totale_riga, 0)
          const pezziTotCat = pezziEsistenti + qty
          const valoreTotCat = valoreEsistenti + calcolo.totalRiga
          const trasportoCat = calcolaSpeseTrasportoPezzi(pezziTotCat, categoria.trasporto_costo_unitario, categoria.trasporto_costo_minimo, categoria.trasporto_minimo_pezzi)
          const quotaTrasporto = valoreTotCat > 0 ? trasportoCat * (calcolo.totalRiga / valoreTotCat) : trasportoCat
          const costoTot = (costoAcqUnit + costoAccessoriUnit + posaUnit) * qty
          const utile = calcolo.totalRiga - costoTot
          const percUtile = costoTot > 0 ? (utile / costoTot) * 100 : null
          return (
            <div className="flex items-center gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs flex-wrap">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="text-amber-800 font-medium">Interno:</span>
              <span className="text-gray-600">Acq: <strong>€ {formatEuro(costoAcqUnit)}</strong>/pz</span>
              {costoAccessoriUnit > 0 && <span className="text-gray-600">Acc: <strong>€ {formatEuro(costoAccessoriUnit)}</strong>/pz</span>}
              {posaUnit > 0 && <span className="text-gray-600">Posa: <strong>€ {formatEuro(posaUnit)}</strong>/pz</span>}
              <span className="text-gray-600">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
              <span className={`font-semibold ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                Utile: € {formatEuro(utile)}
                {percUtile !== null && (
                  <span className="ml-1 font-normal opacity-80">({percUtile.toFixed(1).replace('.', ',')}%)</span>
                )}
              </span>
              {quotaTrasporto > 0 && (
                <span className="w-full text-gray-500 border-t border-amber-200 pt-1 mt-0.5">
                  Trasp (quota): <strong>€ {formatEuro(quotaTrasporto)}</strong>
                  <span className="ml-1.5 font-normal opacity-70">
                    — {pezziTotCat} pz tot. cat. → € {formatEuro(trasportoCat)} ripartiti
                  </span>
                </span>
              )}
            </div>
          )
        })()
      )}

      {!bypassCalcolo && calcolo?.error && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          {calcolo.error}
        </p>
      )}

      <Button onClick={handleAdd} disabled={!canAdd} className="w-full" size="lg">
        <Plus className="h-4 w-4 mr-1" />
        {isEditing ? 'Aggiorna articolo' : 'Aggiungi al preventivo'}
      </Button>
    </div>
  )
}

// ─── Libero form ─────────────────────────────────────────────────────────────

function FormLibero({
  prodotto,
  listinoLibero,
  categoria,
  aliquote,
  initialValues,
  isEditing,
  articoliEsistenti,
  onAdd,
}: {
  prodotto: ProdottoListino
  listinoLibero: ListinoLiberoCompleto
  categoria: CategoriaConListini
  aliquote: number[]
  initialValues?: ArticoloWizard
  isEditing?: boolean
  articoliEsistenti: ArticoloWizard[]
  onAdd: (a: ArticoloWizard) => void
}) {
  const [finituraIndex, setFinituraIndex] = useState(() => {
    if (!initialValues?.finitura_nome) return '-1'
    const idx = (categoria.finiture_categoria ?? []).findIndex((f) => f.nome === initialValues.finitura_nome)
    return idx >= 0 ? idx.toString() : '-1'
  })
  const [accessoriQty, setAccessoriQty] = useState<Record<string, number>>(() => {
    if (!initialValues?.accessori_selezionati) return {}
    return Object.fromEntries(initialValues.accessori_selezionati.map((a) => [a.id, a.qty]))
  })
  const [quantita, setQuantita] = useState(initialValues?.quantita?.toString() ?? '1')
  const [scontoArticolo, setScontoArticolo] = useState(initialValues?.sconto_articolo ?? 0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(initialValues?.aliquota_iva ?? null)
  const [note, setNote] = useState(initialValues?.note ?? '')
  const [costoPosa, setCostoPosa] = useState(initialValues?.costo_posa?.toString() ?? '')
  const [bypassCalcolo, setBypassCalcolo] = useState(initialValues?.bypass_calcolo ?? false)
  const [costoProdottoBypass, setCostoProdottoBypass] = useState(initialValues?.costo_prodotto_bypass?.toString() ?? '')
  const [modalitaPrezzo, setModalitaPrezzo] = useState<'manuale' | 'percentuale'>(initialValues?.modalita_prezzo_bypass ?? 'manuale')
  const [prezzoManuale, setPrezzoManuale] = useState(
    initialValues?.bypass_calcolo && initialValues?.modalita_prezzo_bypass === 'manuale'
      ? (initialValues?.prezzo_unitario?.toString() ?? '')
      : ''
  )
  const [percentualeUtile, setPercentualeUtile] = useState(initialValues?.percentuale_utile_bypass?.toString() ?? '')

  const scontoMax = categoria.sconto_massimo ?? 50

  const finitureDisponibili = useMemo(
    () => categoria.finiture_categoria ?? [],
    [categoria]
  )

  const finitura = useMemo(() => {
    const idx = parseInt(finituraIndex)
    if (idx < 0) return null
    return finitureDisponibili[idx] ?? null
  }, [finituraIndex, finitureDisponibili])

  const accessoriSelezionati = useMemo((): AccessorioSelezionato[] => {
    return listinoLibero.accessori
      .filter((a) => (accessoriQty[a.id] ?? 0) > 0)
      .map((a) => ({ id: a.id, nome: a.nome, prezzo: a.prezzo, prezzo_acquisto: a.prezzo_acquisto ?? 0, qty: accessoriQty[a.id] ?? 1 }))
  }, [listinoLibero, accessoriQty])

  const calcolo = useMemo(() => {
    const prezzoConFinitura = finitura
      ? applicaFinitura(prodotto.prezzo, finitura.aumento_percentuale, finitura.aumento_euro)
      : prodotto.prezzo
    const prezzoUnitario = calcolaPrezzoUnitarioLibero(prezzoConFinitura, accessoriSelezionati)
    const qty = Math.max(1, parseInt(quantita) || 1)
    const totalRiga = calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo)
    return {
      prezzoProdotto: prodotto.prezzo,
      prezzoFinitura: prezzoConFinitura - prodotto.prezzo,
      prezzoAccessori: prezzoUnitario - prezzoConFinitura,
      prezzoUnitario,
      totalRiga,
    }
  }, [prodotto, finitura, accessoriSelezionati, quantita, scontoArticolo])

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

  const setAccessorioQtyVal = (accId: string, qty: number) => {
    setAccessoriQty((prev) => ({ ...prev, [accId]: Math.max(1, qty) }))
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
      prezzoUnitario = (costoProd + posa) * (1 + (parseFloat(percentualeUtile) || 0) / 100)
    }
    return { costoProd, posa, prezzoUnitario, totalRiga: calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo) }
  }, [bypassCalcolo, costoProdottoBypass, costoPosa, quantita, modalitaPrezzo, prezzoManuale, percentualeUtile, scontoArticolo])

  const canAdd = bypassCalcolo
    ? (calcoloBypass?.prezzoUnitario ?? 0) > 0 && parseInt(quantita) > 0
    : parseInt(quantita) > 0

  const handleAdd = () => {
    if (!canAdd) return
    const qty = Math.max(1, parseInt(quantita) || 1)

    if (bypassCalcolo && calcoloBypass) {
      onAdd({
        tempId: isEditing && initialValues ? initialValues.tempId : crypto.randomUUID(),
        tipo: 'listino_libero',
        listino_id: null,
        listino_libero_id: listinoLibero.id,
        prodotto_id: prodotto.id,
        accessori_selezionati: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
        accessori_griglia: null,
        tipologia: `${listinoLibero.tipologia} — ${prodotto.nome}`,
        categoria_nome: prodotto.descrizione ?? null,
        larghezza_mm: null,
        altezza_mm: null,
        larghezza_listino_mm: null,
        altezza_listino_mm: null,
        misura_arrotondata: false,
        finitura_nome: finitura?.nome ?? null,
        finitura_aumento: finitura?.aumento_percentuale ?? 0,
        finitura_aumento_euro: finitura?.aumento_euro ?? 0,
        immagine_url: prodotto.immagine_url ?? null,
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
      })
      return
    }

    const costoAccessoriUnit = accessoriSelezionati.reduce((sum, a) => sum + a.prezzo_acquisto * a.qty, 0)
    onAdd({
      tempId: isEditing && initialValues ? initialValues.tempId : crypto.randomUUID(),
      tipo: 'listino_libero',
      listino_id: null,
      listino_libero_id: listinoLibero.id,
      prodotto_id: prodotto.id,
      accessori_selezionati: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
      accessori_griglia: null,
      tipologia: `${listinoLibero.tipologia} — ${prodotto.nome}`,
      categoria_nome: prodotto.descrizione ?? null,
      larghezza_mm: null,
      altezza_mm: null,
      larghezza_listino_mm: null,
      altezza_listino_mm: null,
      misura_arrotondata: false,
      finitura_nome: finitura?.nome ?? null,
      finitura_aumento: finitura?.aumento_percentuale ?? 0,
      finitura_aumento_euro: finitura?.aumento_euro ?? 0,
      immagine_url: prodotto.immagine_url ?? null,
      note: note || null,
      quantita: qty,
      prezzo_base: prodotto.prezzo,
      prezzo_unitario: calcolo.prezzoUnitario,
      sconto_articolo: scontoArticolo,
      prezzo_totale_riga: calcolo.totalRiga,
      costo_acquisto_unitario: prodotto.prezzo_acquisto + costoAccessoriUnit,
      costo_posa: parseFloat(costoPosa) || 0,
      aliquota_iva: aliquotaIva,
      ordine: 0,
      bypass_calcolo: false,
      costo_prodotto_bypass: null,
      modalita_prezzo_bypass: null,
      percentuale_utile_bypass: null,
    })
  }

  return (
    <div className="space-y-4">
      {/* Prodotto info */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
        {prodotto.immagine_url ? (
          <Image
            src={prodotto.immagine_url}
            alt={prodotto.nome}
            width={96}
            height={72}
            className="rounded-lg border object-cover shrink-0"
          />
        ) : (
          <div className="h-[72px] w-24 rounded-lg border bg-gray-200 flex items-center justify-center shrink-0">
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        )}
        <div>
          <p className="font-semibold text-gray-900">{prodotto.nome}</p>
          <p className="text-sm text-gray-500">
            {listinoLibero.tipologia} · {categoria.nome}
          </p>
          {prodotto.descrizione && (
            <p className="text-xs text-gray-400 mt-1">{prodotto.descrizione}</p>
          )}
          <p className="text-sm font-bold text-teal-700 mt-1">€ {formatEuro(prodotto.prezzo)}</p>
        </div>
      </div>

      {/* Switch bypass */}
      <label className="flex items-center justify-end gap-2 cursor-pointer select-none">
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

      {/* Finitura */}
      {finitureDisponibili.length > 0 && (
        <div className="space-y-1.5">
          <Label>Finitura</Label>
          <Select value={finituraIndex} onValueChange={setFinituraIndex}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-1">Standard (nessuna maggiorazione)</SelectItem>
              {finitureDisponibili.map((f, i) => (
                <SelectItem key={f.id} value={i.toString()}>
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3 w-3 text-gray-400 shrink-0" />
                    {f.nome}
                    {f.aumento_percentuale > 0 && ` +${f.aumento_percentuale}%`}
                    {f.aumento_euro > 0 && ` +€${formatEuro(f.aumento_euro)}`}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Accessori */}
      {listinoLibero.accessori.length > 0 && (
        <div className="space-y-1.5">
          <Label>Accessori</Label>
          <div className="rounded-md border bg-gray-50 p-3 space-y-2">
            {listinoLibero.accessori.map((acc) => {
              const checked = (accessoriQty[acc.id] ?? 0) > 0
              return (
                <div key={acc.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`acc-cfg-${acc.id}`}
                    checked={checked}
                    onChange={(e) => toggleAccessorio(acc.id, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 cursor-pointer"
                  />
                  <label
                    htmlFor={`acc-cfg-${acc.id}`}
                    className="flex-1 text-sm text-gray-700 cursor-pointer"
                  >
                    {acc.nome}
                    <span className="text-gray-400 ml-1.5">€ {formatEuro(acc.prezzo)}</span>
                  </label>
                  {checked && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Qtà</span>
                      <Input
                        type="number"
                        min={1}
                        value={accessoriQty[acc.id] ?? 1}
                        onChange={(e) =>
                          setAccessorioQtyVal(acc.id, parseInt(e.target.value) || 1)
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Quantità</Label>
          <Input
            type="number"
            min={1}
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
            autoFocus
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
                  <SelectItem key={a} value={a.toString()}>
                    {a}%
                  </SelectItem>
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
          <Label className="text-amber-700">Costo posa (€) — uso interno</Label>
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

      {/* Campi bypass */}
      {bypassCalcolo && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Calcolo manuale — listino ignorato</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-amber-700">Costo prodotto (€)</Label>
              <Input type="number" min={0} step={0.01} value={costoProdottoBypass} onChange={(e) => setCostoProdottoBypass(e.target.value)} placeholder="0,00" className="border-amber-200 focus-visible:ring-amber-400" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Modalità prezzo al cliente</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModalitaPrezzo('manuale')} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${modalitaPrezzo === 'manuale' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}>Prezzo manuale</button>
                <button type="button" onClick={() => setModalitaPrezzo('percentuale')} className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${modalitaPrezzo === 'percentuale' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}>% utile</button>
              </div>
            </div>
            {modalitaPrezzo === 'manuale' ? (
              <div className="col-span-2 space-y-1.5">
                <Label>Prezzo al cliente (€)</Label>
                <Input type="number" min={0} step={0.01} value={prezzoManuale} onChange={(e) => setPrezzoManuale(e.target.value)} placeholder="0,00" />
              </div>
            ) : (
              <div className="col-span-2 space-y-1.5">
                <Label>% utile da applicare</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} step={0.1} value={percentualeUtile} onChange={(e) => setPercentualeUtile(e.target.value)} placeholder="es. 30" className="max-w-[120px]" />
                  <span className="text-sm text-gray-500">%</span>
                  {calcoloBypass && calcoloBypass.prezzoUnitario > 0 && (
                    <span className="text-sm font-medium text-orange-700">→ € {formatEuro(calcoloBypass.prezzoUnitario)} /pz</span>
                  )}
                </div>
              </div>
            )}
          </div>
          {calcoloBypass && calcoloBypass.prezzoUnitario > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-md bg-orange-100 text-sm flex-wrap">
              <span className="text-gray-700">Unitario: <strong>€ {formatEuro(calcoloBypass.prezzoUnitario)}</strong></span>
              <span className="text-orange-800 font-semibold ml-auto">Totale riga: € {formatEuro(calcoloBypass.totalRiga)}</span>
            </div>
          )}
          {calcoloBypass && (calcoloBypass.costoProd > 0 || calcoloBypass.posa > 0) && calcoloBypass.prezzoUnitario > 0 && (() => {
            const qty = Math.max(1, parseInt(quantita) || 1)
            const costoTot = (calcoloBypass.costoProd + calcoloBypass.posa) * qty
            const utile = calcoloBypass.totalRiga - costoTot
            const percUtile = costoTot > 0 ? (utile / costoTot) * 100 : null
            return (
              <div className="flex items-center gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs flex-wrap">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="text-amber-800 font-medium">Interno:</span>
                {calcoloBypass.costoProd > 0 && <span className="text-gray-600">Prodotto: <strong>€ {formatEuro(calcoloBypass.costoProd)}</strong>/pz</span>}
                {calcoloBypass.posa > 0 && <span className="text-gray-600">Posa: <strong>€ {formatEuro(calcoloBypass.posa)}</strong>/pz</span>}
                <span className="text-gray-600">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
                <span className={`font-semibold ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  Utile: € {formatEuro(utile)}{percUtile !== null && <span className="ml-1 font-normal opacity-80">({percUtile.toFixed(1).replace('.', ',')}%)</span>}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {/* Preview prezzo (solo automatica) */}
      {!bypassCalcolo && (
        <div className="flex items-center gap-4 p-3 rounded-md bg-teal-50 text-sm flex-wrap">
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

      {/* Preview costi interni (solo automatica) */}
      {!bypassCalcolo && (() => {
        const qty = Math.max(1, parseInt(quantita) || 1)
        const costoAcqUnit = (prodotto.prezzo_acquisto ?? 0)
          + accessoriSelezionati.reduce((sum, a) => sum + (a.prezzo_acquisto ?? 0) * a.qty, 0)
        const posaUnit = parseFloat(costoPosa) || 0
        const listinoIdsCat = new Set([
          ...(categoria.listini ?? []).map((l) => l.id),
          ...(categoria.listini_liberi ?? []).map((l) => l.id),
        ])
        const esistentiCat = articoliEsistenti.filter(
          (a) =>
            (a.tipo === 'listino' && !!a.listino_id && listinoIdsCat.has(a.listino_id)) ||
            (a.tipo === 'listino_libero' && !!a.listino_libero_id && listinoIdsCat.has(a.listino_libero_id))
        )
        const pezziEsistenti = esistentiCat.reduce((s, a) => s + a.quantita, 0)
        const valoreEsistenti = esistentiCat.reduce((s, a) => s + a.prezzo_totale_riga, 0)
        const pezziTotCat = pezziEsistenti + qty
        const valoreTotCat = valoreEsistenti + calcolo.totalRiga
        const trasportoCat = calcolaSpeseTrasportoPezzi(pezziTotCat, categoria.trasporto_costo_unitario, categoria.trasporto_costo_minimo, categoria.trasporto_minimo_pezzi)
        const quotaTrasporto = valoreTotCat > 0 ? trasportoCat * (calcolo.totalRiga / valoreTotCat) : trasportoCat
        const costoTot = (costoAcqUnit + posaUnit) * qty
        const utile = calcolo.totalRiga - costoTot
        const percUtile = costoTot > 0 ? (utile / costoTot) * 100 : null
        if (costoAcqUnit === 0 && posaUnit === 0 && quotaTrasporto === 0) return null
        return (
          <div className="flex items-center gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs flex-wrap">
            <TrendingUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-amber-800 font-medium">Interno:</span>
            <span className="text-gray-600">Acq: <strong>€ {formatEuro(costoAcqUnit)}</strong>/pz</span>
            {posaUnit > 0 && <span className="text-gray-600">Posa: <strong>€ {formatEuro(posaUnit)}</strong>/pz</span>}
            <span className="text-gray-600">Costo tot: <strong>€ {formatEuro(costoTot)}</strong></span>
            <span className={`font-semibold ml-auto ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              Utile: € {formatEuro(utile)}
              {percUtile !== null && (
                <span className="ml-1 font-normal opacity-80">({percUtile.toFixed(1).replace('.', ',')}%)</span>
              )}
            </span>
            {quotaTrasporto > 0 && (
              <span className="w-full text-gray-500 border-t border-amber-200 pt-1 mt-0.5">
                Trasp (quota): <strong>€ {formatEuro(quotaTrasporto)}</strong>
                <span className="ml-1.5 font-normal opacity-70">
                  — {pezziTotCat} pz tot. cat. → € {formatEuro(trasportoCat)} ripartiti
                </span>
              </span>
            )}
          </div>
        )
      })()}

      <Button
        onClick={handleAdd}
        disabled={!canAdd}
        className="w-full bg-teal-600 hover:bg-teal-700"
        size="lg"
      >
        <Plus className="h-4 w-4 mr-1" />
        {isEditing ? 'Aggiorna articolo' : 'Aggiungi al preventivo'}
      </Button>
    </div>
  )
}

// ─── Dialog wrapper ───────────────────────────────────────────────────────────

export default function DialogConfigurazione({ item, aliquote, initialValues, isEditing, articoliEsistenti, onAdd, onClose }: Props) {
  const title =
    item?.tipo === 'griglia'
      ? item.listino.tipologia
      : item?.tipo === 'libero'
      ? item.prodotto.nome
      : 'Configura articolo'

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Modifica: ${title}` : title}</DialogTitle>
        </DialogHeader>

        {item?.tipo === 'griglia' && (
          <FormGriglia
            key={`${item.listino.id}-${initialValues?.tempId ?? 'new'}`}
            listino={item.listino}
            categoria={item.categoria}
            aliquote={aliquote}
            initialValues={initialValues}
            isEditing={isEditing}
            articoliEsistenti={articoliEsistenti}
            onAdd={onAdd}
          />
        )}

        {item?.tipo === 'libero' && (
          <FormLibero
            key={`${item.prodotto.id}-${initialValues?.tempId ?? 'new'}`}
            prodotto={item.prodotto}
            listinoLibero={item.listinoLibero}
            categoria={item.categoria}
            aliquote={aliquote}
            initialValues={initialValues}
            isEditing={isEditing}
            articoliEsistenti={articoliEsistenti}
            onAdd={onAdd}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
