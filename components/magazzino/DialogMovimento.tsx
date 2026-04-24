'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronsUpDown, Check, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { createMovimento } from '@/actions/magazzino'
import type { ProdottoConCategoria } from '@/actions/magazzino'
import type { Fornitore } from '@/types/magazzino'
import { UNITA_MISURA_LABELS } from '@/types/magazzino'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  prodotti: ProdottoConCategoria[]
  fornitori: Fornitore[]
  defaultTipo?: 'entrata' | 'uscita'
}

const today = () => new Date().toISOString().slice(0, 10)

export default function DialogMovimento({ open, onOpenChange, prodotti, fornitori, defaultTipo = 'entrata' }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState<'entrata' | 'uscita'>(defaultTipo)
  const [prodottoId, setProdottoId] = useState<string>('')
  const [varianteId, setVarianteId] = useState<string>('')
  const [quantita, setQuantita] = useState('')
  const [prezzoUnitario, setPrezzoUnitario] = useState('')
  const [fornitoreId, setFornitoreId] = useState('')
  const [commessaRef, setCommessaRef] = useState('')
  const [data, setData] = useState(today())
  const [note, setNote] = useState('')
  const [prodottoOpen, setProdottoOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const selectedProdotto = useMemo(() => prodotti.find((p) => p.id === prodottoId), [prodotti, prodottoId])

  useEffect(() => {
    if (!open) return
    setTipo(defaultTipo)
    setProdottoId('')
    setVarianteId('')
    setQuantita('')
    setPrezzoUnitario('')
    setFornitoreId('')
    setCommessaRef('')
    setData(today())
    setNote('')
  }, [open, defaultTipo])

  useEffect(() => {
    setVarianteId('')
  }, [prodottoId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prodottoId) { toast.error('Seleziona un prodotto'); return }
    const qty = parseFloat(quantita)
    if (!qty || qty <= 0) { toast.error('Inserisci una quantità valida'); return }
    if (tipo === 'uscita' && !commessaRef.trim()) { toast.error('Inserisci il nome commessa'); return }

    setLoading(true)
    try {
      await createMovimento({
        tipo,
        prodotto_id: prodottoId,
        variante_id: varianteId || null,
        quantita: qty,
        prezzo_unitario: prezzoUnitario ? parseFloat(prezzoUnitario) : null,
        fornitore_id: tipo === 'entrata' && fornitoreId ? fornitoreId : null,
        commessa_ref: tipo === 'uscita' ? commessaRef.trim() : null,
        data,
        note: note.trim() || null,
      })
      toast.success(tipo === 'entrata' ? 'Carico registrato' : 'Scarico registrato')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo movimento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('entrata')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors',
                tipo === 'entrata'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              )}
            >
              <ArrowDownToLine className="h-4 w-4" />
              Carico (entrata)
            </button>
            <button
              type="button"
              onClick={() => setTipo('uscita')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors',
                tipo === 'uscita'
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              )}
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Scarico (uscita)
            </button>
          </div>

          {/* Prodotto */}
          <div className="space-y-1.5">
            <Label>Prodotto *</Label>
            <Popover open={prodottoOpen} onOpenChange={setProdottoOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedProdotto
                    ? <span><span className="font-mono text-xs text-gray-400 mr-1">{selectedProdotto.codice}</span>{selectedProdotto.nome}</span>
                    : <span className="text-gray-400">Cerca prodotto...</span>}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[440px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cerca per codice o nome..." />
                  <CommandList>
                    <CommandEmpty>Nessun prodotto trovato</CommandEmpty>
                    <CommandGroup>
                      {prodotti.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.codice} ${p.nome}`}
                          onSelect={() => { setProdottoId(p.id); setProdottoOpen(false) }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', prodottoId === p.id ? 'opacity-100' : 'opacity-0')} />
                          <span className="font-mono text-xs text-gray-400 mr-2">{p.codice}</span>
                          <span className="flex-1 truncate">{p.nome}</span>
                          <span className="text-xs text-gray-400 ml-2">{UNITA_MISURA_LABELS[p.unita_misura]}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Variante */}
          {selectedProdotto && selectedProdotto.varianti.length > 0 && (
            <div className="space-y-1.5">
              <Label>Variante colore</Label>
              <Select value={varianteId || '__none__'} onValueChange={(v) => setVarianteId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessuna variante specifica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna variante specifica</SelectItem>
                  {selectedProdotto.varianti.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome}{v.codice_variante ? ` — ${v.codice_variante}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quantità + data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty">
                Quantità *
                {selectedProdotto && <span className="text-gray-400 ml-1">({UNITA_MISURA_LABELS[selectedProdotto.unita_misura]})</span>}
              </Label>
              <Input
                id="qty"
                type="number"
                step="0.001"
                min="0.001"
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data *</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

          {/* Entrata: prezzo + fornitore */}
          {tipo === 'entrata' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prezzo">Prezzo unitario (€)</Label>
                <Input
                  id="prezzo"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={prezzoUnitario}
                  onChange={(e) => setPrezzoUnitario(e.target.value)}
                  placeholder="0.0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fornitore</Label>
                <Select value={fornitoreId || '__none__'} onValueChange={(v) => setFornitoreId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno</SelectItem>
                    {fornitori.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Uscita: commessa */}
          {tipo === 'uscita' && (
            <div className="space-y-1.5">
              <Label htmlFor="commessa">Commessa *</Label>
              <Input
                id="commessa"
                value={commessaRef}
                onChange={(e) => setCommessaRef(e.target.value)}
                placeholder="Nome commessa / cantiere"
              />
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : tipo === 'entrata' ? 'Registra carico' : 'Registra scarico'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
