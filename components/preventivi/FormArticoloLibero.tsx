'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { calcolaPrezzoUnitarioLibero, calcolaTotaleRiga, formatEuro } from '@/lib/pricing'
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
  const [accessoriQty, setAccessoriQty] = useState<Record<string, number>>({})
  const [quantita, setQuantita] = useState<string>('1')
  const [scontoArticolo, setScontoArticolo] = useState(0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(null)
  const [note, setNote] = useState<string>('')

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
        qty: accessoriQty[a.id] ?? 1,
      }))
  }, [listinoSelezionato, accessoriQty])

  const calcolo = useMemo(() => {
    if (!prodottoSelezionato) return null
    const prezzoUnitario = calcolaPrezzoUnitarioLibero(
      prodottoSelezionato.prezzo,
      accessoriSelezionati
    )
    const qty = Math.max(1, parseInt(quantita) || 1)
    const totalRiga = calcolaTotaleRiga(prezzoUnitario, qty, scontoArticolo)
    return {
      prezzoProdotto: prodottoSelezionato.prezzo,
      prezzoAccessori: prezzoUnitario - prodottoSelezionato.prezzo,
      prezzoUnitario,
      totalRiga,
    }
  }, [prodottoSelezionato, accessoriSelezionati, quantita, scontoArticolo])

  const handleCategoriaChange = (id: string) => {
    setCategoriaId(id)
    setListinoId('')
    setProdottoId('')
    setAccessoriQty({})
    setScontoArticolo(0)
  }

  const handleListinoChange = (id: string) => {
    setListinoId(id)
    setProdottoId('')
    setAccessoriQty({})
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

  const canAdd = !!prodottoSelezionato && calcolo !== null && parseInt(quantita) > 0

  const handleAdd = () => {
    if (!canAdd || !prodottoSelezionato || !listinoSelezionato || !calcolo) return

    const qty = Math.max(1, parseInt(quantita) || 1)

    const articolo: ArticoloWizard = {
      tempId: crypto.randomUUID(),
      tipo: 'listino_libero',
      listino_id: null,
      listino_libero_id: listinoSelezionato.id,
      prodotto_id: prodottoSelezionato.id,
      accessori_selezionati: accessoriSelezionati.length > 0 ? accessoriSelezionati : null,
      tipologia: `${listinoSelezionato.tipologia} — ${prodottoSelezionato.nome}`,
      categoria_nome: categoriaSelezionata?.nome ?? null,
      larghezza_mm: null,
      altezza_mm: null,
      larghezza_listino_mm: null,
      altezza_listino_mm: null,
      misura_arrotondata: false,
      finitura_nome: null,
      finitura_aumento: 0,
      finitura_aumento_euro: 0,
      immagine_url: prodottoSelezionato.immagine_url ?? null,
      note: note || null,
      quantita: qty,
      prezzo_base: prodottoSelezionato.prezzo,
      prezzo_unitario: calcolo.prezzoUnitario,
      sconto_articolo: scontoArticolo,
      prezzo_totale_riga: calcolo.totalRiga,
      aliquota_iva: aliquotaIva,
      ordine: 0,
    }

    onAdd(articolo)

    // Reset mantenendo categoria e listino
    setProdottoId('')
    setAccessoriQty({})
    setQuantita('1')
    setScontoArticolo(0)
    setAliquotaIva(null)
    setNote('')
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
      <p className="text-sm font-semibold text-gray-700">Aggiungi da catalogo</p>

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
            </>
          )}
        </div>
      )}

      {/* Preview prezzo */}
      {calcolo && prodottoSelezionato && (
        <div className="flex items-center gap-4 p-3 rounded-md bg-teal-50 text-sm">
          <div className="flex gap-4 ml-auto flex-wrap">
            <span className="text-gray-500">
              Prodotto: <strong>€ {formatEuro(calcolo.prezzoProdotto)}</strong>
            </span>
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

      <Button onClick={handleAdd} disabled={!canAdd} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700">
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi articolo
      </Button>
    </div>
  )
}
