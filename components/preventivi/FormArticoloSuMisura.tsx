'use client'

import { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { calcolaSuMisura, formatEuro } from '@/lib/pricing'
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
import type { CategoriaConListini, ListinoSuMisuraCompleto, FinituraSuMisura, AccessorioSuMisura } from '@/types/listino'
import type {
  AccessorioSuMisuraSelezionato,
  ConfigSuMisuraArticolo,
  ArticoloWizard,
} from '@/types/preventivo'

interface Props {
  categoria: CategoriaConListini
  aliquote: number[]
  initialValues?: ArticoloWizard | null
  isEditing?: boolean
  onAdd: (articolo: ArticoloWizard) => void
}

type ModoUtile = 'percentuale' | 'fisso'

export default function FormArticoloSuMisura({ categoria, aliquote, initialValues, isEditing, onAdd }: Props) {
  const listini = useMemo(() => categoria.listini_su_misura ?? [], [categoria])

  // ── Selezione prodotto ────────────────────────────────────────────────────
  const [listinoId, setListinoId] = useState<string>(
    initialValues?.config_su_misura?.listino_id ?? listini[0]?.id ?? ''
  )
  const listino: ListinoSuMisuraCompleto | undefined = listini.find((l) => l.id === listinoId)

  // ── Dimensioni ────────────────────────────────────────────────────────────
  const [larghezza, setLarghezza] = useState<string>(
    initialValues?.config_su_misura ? String(initialValues.config_su_misura.larghezza) : ''
  )
  const [altezza, setAltezza] = useState<string>(
    initialValues?.config_su_misura ? String(initialValues.config_su_misura.altezza) : ''
  )

  // ── Finitura ──────────────────────────────────────────────────────────────
  const [finituraId, setFinituraId] = useState<string>(
    initialValues?.config_su_misura?.finitura_id ?? ''
  )

  // ── Accessori selezionati: { [accessorio_id]: qty } ───────────────────────
  const [accessoriSel, setAccessoriSel] = useState<Record<string, number>>(() => {
    if (initialValues?.config_su_misura) {
      return Object.fromEntries(
        initialValues.config_su_misura.accessori.map((a) => [a.accessorio_id, a.qty])
      )
    }
    return {}
  })

  // ── Mano d'opera, spese varie e utile ────────────────────────────────────
  const [manoDopera, setManoDopera] = useState<string>(
    initialValues?.config_su_misura ? String(initialValues.config_su_misura.mano_dopera || '') : ''
  )
  const [modoSpese, setModoSpese] = useState<ModoUtile>(
    initialValues?.config_su_misura?.spese_varie_percentuale != null ? 'percentuale' : 'fisso'
  )
  const [speseVal, setSpeseVal] = useState<string>(
    initialValues?.config_su_misura
      ? String(initialValues.config_su_misura.spese_varie_percentuale ?? initialValues.config_su_misura.spese_varie_fisso ?? '')
      : ''
  )
  const [modoUtile, setModoUtile] = useState<ModoUtile>(
    initialValues?.config_su_misura?.utile_percentuale != null ? 'percentuale' : 'fisso'
  )
  const [utileVal, setUtileVal] = useState<string>(
    initialValues?.config_su_misura
      ? String(initialValues.config_su_misura.utile_percentuale ?? initialValues.config_su_misura.utile_fisso ?? '')
      : ''
  )

  // ── Quantità, sconto, IVA, note ───────────────────────────────────────────
  const [quantita, setQuantita] = useState<string>(String(initialValues?.quantita ?? 1))
  const [sconto, setSconto] = useState(initialValues?.sconto_articolo ?? 0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(initialValues?.aliquota_iva ?? null)
  const [note, setNote] = useState<string>(initialValues?.note ?? '')

  // Reset accessori quando cambia listino
  useEffect(() => {
    if (!initialValues) {
      setAccessoriSel({})
      setFinituraId('')
      setLarghezza('')
      setAltezza('')
    }
  }, [listinoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calcoli ───────────────────────────────────────────────────────────────
  const larghezzaN = parseFloat(larghezza) || 0
  const altezzaN = parseFloat(altezza) || 0
  const finitura = listino?.finiture.find((f) => f.id === finituraId) ?? null

  const { mq, prezzo_mq_finale, totale_prodotto } = useMemo(() => {
    if (!listino || larghezzaN <= 0 || altezzaN <= 0) {
      return { mq: 0, prezzo_mq_finale: listino?.prezzo_mq ?? 0, totale_prodotto: 0, maggiorazione_flat: 0 }
    }
    return calcolaSuMisura(larghezzaN, altezzaN, listino.prezzo_mq, listino.mq_minimo, finitura)
  }, [listino, larghezzaN, altezzaN, finitura])

  // Accessori totale
  const totale_accessori = useMemo(() => {
    if (!listino) return 0
    let tot = 0
    for (const gruppo of listino.gruppi_accessori) {
      for (const acc of gruppo.accessori) {
        const qty = accessoriSel[acc.id]
        if (qty != null && qty > 0) {
          const qtyEffettiva = acc.unita === 'mq' ? mq * qty : qty
          tot += acc.prezzo * qtyEffettiva
        } else if (gruppo.tipo_scelta === 'incluso') {
          // sempre incluso — usa qty_default
          const qtyEffettiva = acc.unita === 'mq' ? mq * acc.qty_default : acc.qty_default
          tot += acc.prezzo * qtyEffettiva
        }
      }
    }
    return tot
  }, [listino, accessoriSel, mq])

  const base = totale_prodotto + totale_accessori
  const manoDoperaN = parseFloat(manoDopera) || 0
  const speseValN = parseFloat(speseVal) || 0
  const spese_calcolate = modoSpese === 'percentuale' ? base * speseValN / 100 : speseValN
  const utileValN = parseFloat(utileVal) || 0
  const costi_totali = base + manoDoperaN + spese_calcolate
  const utile_calcolato = modoUtile === 'percentuale' ? costi_totali * utileValN / 100 : utileValN
  const prezzo_unitario = costi_totali + utile_calcolato

  const quantitaN = parseInt(quantita) || 1
  const prezzoDopoSconto = prezzo_unitario * (1 - sconto / 100)
  const totale_riga = prezzoDopoSconto * quantitaN

  // ── Gestione accessori UI ─────────────────────────────────────────────────
  const setAccessorioQty = (accId: string, qty: number | null) => {
    setAccessoriSel((prev) => {
      const next = { ...prev }
      if (qty == null || qty <= 0) delete next[accId]
      else next[accId] = qty
      return next
    })
  }

  const toggleAccessorioSingolo = (gruppoId: string, accId: string, accessori: AccessorioSuMisura[]) => {
    // rimuove tutti gli altri del gruppo, attiva/disattiva questo
    setAccessoriSel((prev) => {
      const next = { ...prev }
      for (const a of accessori) delete next[a.id]
      if (prev[accId]) delete next[accId]
      else next[accId] = 1
      return next
    })
  }

  const toggleAccessorioMultiplo = (accId: string, acc: AccessorioSuMisura) => {
    setAccessoriSel((prev) => {
      const next = { ...prev }
      if (next[accId]) delete next[accId]
      else next[accId] = acc.qty_modificabile ? acc.qty_default : 1
      return next
    })
  }

  // ── Calcola label finitura per la nota ───────────────────────────────────
  const getFinituraLabel = (f: FinituraSuMisura) => {
    const suffisso = f.tipo_maggiorazione === 'percentuale'
      ? `+${f.valore}%`
      : f.tipo_maggiorazione === 'mq'
        ? `+${formatEuro(f.valore)} €/mq`
        : `+${formatEuro(f.valore)} €`
    return `${f.nome} (${suffisso})`
  }

  // ── Aggiungi articolo ─────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!listino) { return }
    if (larghezzaN <= 0 || altezzaN <= 0) { return }

    // Raccogli accessori selezionati
    const accSel: AccessorioSuMisuraSelezionato[] = []
    if (listino) {
      for (const gruppo of listino.gruppi_accessori) {
        for (const acc of gruppo.accessori) {
          let qty: number | null = null
          if (gruppo.tipo_scelta === 'incluso') {
            qty = acc.qty_default
          } else {
            qty = accessoriSel[acc.id] ?? null
          }
          if (qty != null && qty > 0) {
            const qtyEffettiva = acc.unita === 'mq' ? mq * qty : qty
            accSel.push({
              accessorio_id: acc.id,
              gruppo_id: gruppo.id,
              nome: acc.nome,
              unita: acc.unita,
              qty: qtyEffettiva,
              prezzo_unitario: acc.prezzo,
              totale: acc.prezzo * qtyEffettiva,
            })
          }
        }
      }
    }

    const config: ConfigSuMisuraArticolo = {
      listino_id: listino.id,
      nome_prodotto: listino.nome,
      larghezza: larghezzaN,
      altezza: altezzaN,
      mq,
      finitura_id: finitura?.id ?? null,
      nome_finitura: finitura?.nome ?? null,
      tipo_maggiorazione_finitura: finitura?.tipo_maggiorazione ?? null,
      prezzo_mq_base: listino.prezzo_mq,
      prezzo_mq_finale,
      totale_prodotto,
      accessori: accSel,
      totale_accessori,
      mano_dopera: manoDoperaN,
      spese_varie_percentuale: modoSpese === 'percentuale' ? speseValN : null,
      spese_varie_fisso: modoSpese === 'fisso' ? speseValN : null,
      spese_varie_calcolate: spese_calcolate,
      utile_percentuale: modoUtile === 'percentuale' ? utileValN : null,
      utile_fisso: modoUtile === 'fisso' ? utileValN : null,
      utile_calcolato,
    }

    const noteBreakdown = [
      `${(larghezzaN / 1000).toFixed(3)} × ${(altezzaN / 1000).toFixed(3)} m = ${mq.toFixed(3)} mq`,
      finitura ? `Finitura: ${getFinituraLabel(finitura)}` : null,
      accSel.length > 0 ? `Accessori: ${accSel.map((a) => a.nome).join(', ')}` : null,
      manoDoperaN > 0 ? `Posa: ${formatEuro(manoDoperaN)} €` : null,
      spese_calcolate > 0
        ? `Spese varie: ${modoSpese === 'percentuale' ? `${speseValN}% = ${formatEuro(spese_calcolate)} €` : `${formatEuro(spese_calcolate)} €`}`
        : null,
      utile_calcolato > 0
        ? `Utile: ${modoUtile === 'percentuale' ? `${utileValN}% = ${formatEuro(utile_calcolato)} €` : `${formatEuro(utile_calcolato)} €`}`
        : null,
      note || null,
    ].filter(Boolean).join(' · ')

    const articolo: ArticoloWizard = {
      tempId: initialValues?.tempId ?? crypto.randomUUID(),
      tipo: 'su_misura',
      listino_id: null,
      listino_libero_id: null,
      prodotto_id: null,
      accessori_selezionati: null,
      accessori_griglia: null,
      tipologia: listino.nome + (finitura ? ` — ${finitura.nome}` : ''),
      categoria_nome: categoria.nome,
      larghezza_mm: larghezzaN,
      altezza_mm: altezzaN,
      larghezza_listino_mm: null,
      altezza_listino_mm: null,
      misura_arrotondata: false,
      finitura_nome: finitura?.nome ?? null,
      finitura_aumento: finitura?.tipo_maggiorazione === 'percentuale' ? finitura.valore : 0,
      finitura_aumento_euro: finitura?.tipo_maggiorazione === 'fisso' ? finitura.valore : 0,
      note: noteBreakdown || null,
      immagine_url: listino.immagine_url ?? null,
      quantita: quantitaN,
      prezzo_base: listino.prezzo_mq,
      prezzo_unitario,
      sconto_articolo: sconto,
      prezzo_totale_riga: totale_riga,
      costo_acquisto_unitario: listino.prezzo_acquisto_mq * mq,
      costo_posa: manoDoperaN,
      aliquota_iva: aliquotaIva,
      ordine: 0,
      config_su_misura: config,
    }

    onAdd(articolo)
  }

  if (listini.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8 text-center">
        Nessun prodotto in questa categoria.
        <br />Aggiungine uno dal modulo Listini.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Selezione prodotto */}
      <div className="space-y-1.5">
        <Label>Prodotto</Label>
        <Select value={listinoId} onValueChange={setListinoId}>
          <SelectTrigger><SelectValue placeholder="Seleziona prodotto..." /></SelectTrigger>
          <SelectContent>
            {listini.filter((l) => l.attivo).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.nome} — {formatEuro(l.prezzo_mq)} €/mq
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {listino && (
          <div className="flex items-start gap-3 mt-1">
            {listino.immagine_url && (
              <Image
                src={listino.immagine_url}
                alt={listino.nome}
                width={64}
                height={64}
                className="rounded-md object-cover border border-gray-200 shrink-0"
              />
            )}
            {listino.descrizione && (
              <p className="text-xs text-gray-400 self-center">{listino.descrizione}</p>
            )}
          </div>
        )}
      </div>

      {listino && (
        <>
          {/* Dimensioni */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Larghezza (mm)</Label>
              <Input
                type="number"
                min={listino.larghezza_min || 1}
                max={listino.larghezza_max < 9999 ? listino.larghezza_max : undefined}
                value={larghezza}
                onChange={(e) => setLarghezza(e.target.value)}
                placeholder={`${listino.larghezza_min}–${listino.larghezza_max < 9999 ? listino.larghezza_max : '∞'}`}
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Altezza (mm)</Label>
              <Input
                type="number"
                min={listino.altezza_min || 1}
                max={listino.altezza_max < 9999 ? listino.altezza_max : undefined}
                value={altezza}
                onChange={(e) => setAltezza(e.target.value)}
                placeholder={`${listino.altezza_min}–${listino.altezza_max < 9999 ? listino.altezza_max : '∞'}`}
                className="text-right"
              />
            </div>
          </div>
          {mq > 0 && (
            <p className="text-xs text-gray-500 -mt-2">
              {(larghezzaN / 1000).toFixed(3)} × {(altezzaN / 1000).toFixed(3)} m
              = <strong>{mq.toFixed(3)} mq</strong>
              {listino.mq_minimo > 0 && mq === listino.mq_minimo && ` (minimo fatturabile)`}
            </p>
          )}

          {/* Finitura */}
          {listino.finiture.length > 0 && (
            <div className="space-y-1.5">
              <Label>Finitura</Label>
              <Select value={finituraId} onValueChange={setFinituraId}>
                <SelectTrigger><SelectValue placeholder="Nessuna finitura" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessuna finitura</SelectItem>
                  {listino.finiture.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{getFinituraLabel(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Gruppi accessori */}
          {listino.gruppi_accessori.map((gruppo) => (
            <div key={gruppo.id} className="space-y-2">
              <Label className="text-sm">
                {gruppo.nome}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  {gruppo.tipo_scelta === 'singolo' ? '(scelta singola)' : gruppo.tipo_scelta === 'multiplo' ? '(multipla)' : '(incluso)'}
                </span>
              </Label>

              {gruppo.tipo_scelta === 'singolo' && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name={`gruppo-${gruppo.id}`}
                      checked={gruppo.accessori.every((a) => !accessoriSel[a.id])}
                      onChange={() => setAccessoriSel((prev) => {
                        const next = { ...prev }
                        gruppo.accessori.forEach((a) => delete next[a.id])
                        return next
                      })}
                    />
                    <span className="text-gray-500">Nessuno</span>
                  </label>
                  {gruppo.accessori.map((acc) => (
                    <AccessorioRow
                      key={acc.id}
                      acc={acc}
                      mq={mq}
                      selected={!!accessoriSel[acc.id]}
                      qty={accessoriSel[acc.id] ?? acc.qty_default}
                      onToggle={() => toggleAccessorioSingolo(gruppo.id, acc.id, gruppo.accessori)}
                      onQtyChange={(q) => setAccessorioQty(acc.id, q)}
                      inputType="radio"
                      name={`gruppo-${gruppo.id}`}
                    />
                  ))}
                </div>
              )}

              {gruppo.tipo_scelta === 'multiplo' && (
                <div className="space-y-1">
                  {gruppo.accessori.map((acc) => (
                    <AccessorioRow
                      key={acc.id}
                      acc={acc}
                      mq={mq}
                      selected={!!accessoriSel[acc.id]}
                      qty={accessoriSel[acc.id] ?? acc.qty_default}
                      onToggle={() => toggleAccessorioMultiplo(acc.id, acc)}
                      onQtyChange={(q) => setAccessorioQty(acc.id, q)}
                      inputType="checkbox"
                    />
                  ))}
                </div>
              )}

              {gruppo.tipo_scelta === 'incluso' && (
                <div className="space-y-1">
                  {gruppo.accessori.map((acc) => (
                    <AccessorioRow
                      key={acc.id}
                      acc={acc}
                      mq={mq}
                      selected
                      qty={accessoriSel[acc.id] ?? acc.qty_default}
                      onToggle={() => {}}
                      onQtyChange={(q) => setAccessorioQty(acc.id, q)}
                      inputType="incluso"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Mano d'opera */}
          <div className="space-y-1.5 border-t pt-3">
            <Label>Mano d&apos;opera / Posa (€)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={manoDopera}
              onChange={(e) => setManoDopera(e.target.value)}
              placeholder="0,00"
              className="text-right"
            />
          </div>

          {/* Spese varie */}
          <div className="space-y-1.5">
            <Label>Spese varie</Label>
            <div className="flex gap-2">
              <div className="flex rounded-md border overflow-hidden text-sm w-fit shrink-0">
                {(['percentuale', 'fisso'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModoSpese(m)}
                    className={`px-3 py-1.5 transition-colors ${modoSpese === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border-l'}`}
                  >
                    {m === 'percentuale' ? '%' : '€'}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                min={0}
                step={modoSpese === 'percentuale' ? 0.1 : 0.01}
                value={speseVal}
                onChange={(e) => setSpeseVal(e.target.value)}
                placeholder={modoSpese === 'percentuale' ? '0,0' : '0,00'}
                className="text-right flex-1"
              />
              <span className="self-center text-xs text-gray-400 shrink-0">{modoSpese === 'percentuale' ? '%' : '€'}</span>
            </div>
          </div>

          {/* Utile */}
          <div className="space-y-1.5">
            <Label>Utile / Margine</Label>
            <div className="flex gap-2">
              <div className="flex rounded-md border overflow-hidden text-sm w-fit shrink-0">
                {(['percentuale', 'fisso'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModoUtile(m)}
                    className={`px-3 py-1.5 transition-colors ${modoUtile === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border-l'}`}
                  >
                    {m === 'percentuale' ? '%' : '€'}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                min={0}
                step={modoUtile === 'percentuale' ? 0.1 : 0.01}
                value={utileVal}
                onChange={(e) => setUtileVal(e.target.value)}
                placeholder={modoUtile === 'percentuale' ? '0,0' : '0,00'}
                className="text-right flex-1"
              />
              <span className="self-center text-xs text-gray-400 shrink-0">{modoUtile === 'percentuale' ? '%' : '€'}</span>
            </div>
          </div>

          {/* Preview prezzi */}
          {mq > 0 && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Prodotto ({mq.toFixed(3)} mq × {formatEuro(prezzo_mq_finale)} €/mq)</span>
                <span>{formatEuro(totale_prodotto)} €</span>
              </div>
              {totale_accessori > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Accessori</span>
                  <span>{formatEuro(totale_accessori)} €</span>
                </div>
              )}
              {manoDoperaN > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Mano d&apos;opera</span>
                  <span>{formatEuro(manoDoperaN)} €</span>
                </div>
              )}
              {spese_calcolate > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Spese varie {modoSpese === 'percentuale' ? `(${speseValN}%)` : ''}</span>
                  <span>+{formatEuro(spese_calcolate)} €</span>
                </div>
              )}
              {utile_calcolato > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Utile {modoUtile === 'percentuale' ? `(${utileValN}%)` : ''}</span>
                  <span>+{formatEuro(utile_calcolato)} €</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-violet-800 border-t border-violet-200 pt-1 mt-1">
                <span>Prezzo unitario</span>
                <span>{formatEuro(prezzo_unitario)} €</span>
              </div>
              {quantitaN > 1 && (
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>× {quantitaN} = </span>
                  <span>{formatEuro(totale_riga)} €</span>
                </div>
              )}
            </div>
          )}

          {/* Quantità, Sconto, IVA */}
          <div className="grid grid-cols-3 gap-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label>Quantità</Label>
              <Input type="number" min={1} step={1} value={quantita} onChange={(e) => setQuantita(e.target.value)} className="text-right" />
            </div>
            <div className="space-y-1.5">
              <Label>Sconto %</Label>
              <ScontoSelect value={sconto} onChange={setSconto} />
            </div>
            <div className="space-y-1.5">
              <Label>IVA</Label>
              <Select
                value={aliquotaIva != null ? String(aliquotaIva) : 'null'}
                onValueChange={(v) => setAliquotaIva(v === 'null' ? null : Number(v))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">—</SelectItem>
                  {aliquote.map((a) => (
                    <SelectItem key={a} value={String(a)}>{a}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note aggiuntive</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note per il preventivo (opzionale)" />
          </div>

          <Button
            onClick={handleAdd}
            disabled={!listinoId || larghezzaN <= 0 || altezzaN <= 0}
            className="w-full bg-violet-600 hover:bg-violet-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {isEditing ? 'Aggiorna articolo' : 'Aggiungi articolo'}
          </Button>
        </>
      )}
    </div>
  )
}

// ── Sub-component: riga accessorio ────────────────────────────────────────────

interface AccessorioRowProps {
  acc: AccessorioSuMisura
  mq: number
  selected: boolean
  qty: number
  onToggle: () => void
  onQtyChange: (q: number) => void
  inputType: 'radio' | 'checkbox' | 'incluso'
  name?: string
}

function AccessorioRow({ acc, mq, selected, qty, onToggle, onQtyChange, inputType, name }: AccessorioRowProps) {
  const unitaLabel = acc.unita === 'pz' ? 'pz' : acc.unita === 'mq' ? 'mq' : 'ml'
  const qtyEffettiva = acc.unita === 'mq' && !acc.qty_modificabile ? mq * (selected ? qty : acc.qty_default) : selected ? qty : acc.qty_default
  const totale = acc.prezzo * qtyEffettiva

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${selected ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'}`}>
      {inputType !== 'incluso' ? (
        <input
          type={inputType}
          name={name}
          checked={selected}
          onChange={onToggle}
          className="shrink-0"
        />
      ) : (
        <span className="text-violet-500 shrink-0 text-xs font-medium">✓</span>
      )}
      <span className="flex-1 truncate">{acc.nome}</span>
      <span className="text-xs text-gray-400 shrink-0">
        {acc.prezzo > 0 ? `${formatEuro(acc.prezzo)} €/${unitaLabel}` : 'gratuito'}
      </span>
      {/* Input qty: mostra solo se selezionato e qty_modificabile (o incluso con qty_modificabile) */}
      {selected && acc.qty_modificabile && acc.unita !== 'mq' && (
        <Input
          type="number"
          min={0.01}
          step={acc.unita === 'pz' ? 1 : 0.1}
          value={qty}
          onChange={(e) => onQtyChange(parseFloat(e.target.value) || acc.qty_default)}
          className="w-16 h-7 text-xs text-right"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {selected && acc.prezzo > 0 && (
        <span className="text-xs font-medium text-violet-700 shrink-0">
          {formatEuro(totale)} €
        </span>
      )}
    </div>
  )
}
