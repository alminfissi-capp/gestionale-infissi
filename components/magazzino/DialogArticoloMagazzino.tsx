'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { ChevronsUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { ComboboxField } from '@/components/ui/combobox-field'
import { cn } from '@/lib/utils'
import { createArticoloMagazzino, updateArticoloMagazzino } from '@/actions/magazzino'
import type { ArticoloMagazzinoConDettagli, ArticoloMagazzinoInput } from '@/types/magazzino'
import type { AnagraficaProdotto, CategoriaMagazzino, Fornitore, PosizioneMagazzino } from '@/types/magazzino'
import { UNITA_MISURA_LABELS } from '@/types/magazzino'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  articolo: ArticoloMagazzinoConDettagli | null
  prodotti: AnagraficaProdotto[]
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
  posizioni: PosizioneMagazzino[]
  onSaved: () => void
}

export default function DialogArticoloMagazzino({
  open, onOpenChange, articolo, prodotti, categorie, fornitori, posizioni, onSaved,
}: Props) {
  const [prodottoId, setProdottoId] = useState('')
  const [finitura, setFinitura] = useState('')
  const [quantita, setQuantita] = useState('0')
  const [quantita2, setQuantita2] = useState('')
  const [unitaMisura2, setUnitaMisura2] = useState('')
  const [posizioneId, setPosizioneId] = useState('')
  const [fornitoreId, setFornitoreId] = useState('')
  const [commessa, setCommessa] = useState('')
  const [note, setNote] = useState('')
  const [prodottoOpen, setProdottoOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const categorieMap = useMemo(() => new Map(categorie.map((c) => [c.id, c])), [categorie])

  useEffect(() => {
    if (!open) return
    if (articolo) {
      setProdottoId(articolo.prodotto_id ?? '')
      setFinitura(articolo.finitura ?? '')
      setQuantita(String(articolo.quantita))
      setQuantita2(articolo.quantita_2 != null ? String(articolo.quantita_2) : '')
      setUnitaMisura2(articolo.unita_misura_2 ?? '')
      setPosizioneId(articolo.posizione_id ?? '')
      setFornitoreId(articolo.fornitore_id ?? '')
      setCommessa(articolo.commessa ?? '')
      setNote(articolo.note ?? '')
    } else {
      setProdottoId('')
      setFinitura('')
      setQuantita('0')
      setQuantita2('')
      setUnitaMisura2('')
      setPosizioneId('')
      setFornitoreId('')
      setCommessa('')
      setNote('')
    }
  }, [open, articolo])

  const selectedProdotto = useMemo(() => prodotti.find((p) => p.id === prodottoId), [prodotti, prodottoId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prodottoId) { toast.error('Seleziona un prodotto'); return }
    const qty = parseFloat(quantita)
    if (isNaN(qty)) { toast.error('Quantità non valida'); return }

    const input: ArticoloMagazzinoInput = {
      prodotto_id: prodottoId,
      finitura: finitura.trim() || null,
      quantita: qty,
      quantita_2: quantita2 ? parseFloat(quantita2) : null,
      unita_misura_2: unitaMisura2.trim() || null,
      posizione_id: posizioneId || null,
      fornitore_id: fornitoreId || null,
      commessa: commessa.trim() || null,
      note: note.trim() || null,
    }

    setLoading(true)
    try {
      if (articolo) {
        await updateArticoloMagazzino(articolo.id, input)
        toast.success('Articolo aggiornato')
      } else {
        await createArticoloMagazzino(input)
        toast.success('Articolo aggiunto al magazzino')
      }
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  // Raggruppa prodotti per categoria
  const prodottiPerCategoria = useMemo(() => {
    const groups = new Map<string, AnagraficaProdotto[]>()
    for (const p of prodotti) {
      const key = p.categoria_id ?? '__nessuna__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return groups
  }, [prodotti])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{articolo ? 'Modifica articolo' : 'Aggiungi al magazzino'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Prodotto */}
          <div className="space-y-1.5">
            <Label>Prodotto *</Label>
            <Popover open={prodottoOpen} onOpenChange={setProdottoOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedProdotto
                    ? <span><span className="font-mono text-xs text-gray-400 mr-1">{selectedProdotto.codice}</span>{selectedProdotto.nome}</span>
                    : <span className="text-gray-400">Cerca prodotto...</span>}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[440px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cerca per codice o nome..." />
                  <CommandList className="max-h-64">
                    <CommandEmpty>Nessun prodotto trovato</CommandEmpty>
                    {Array.from(prodottiPerCategoria.entries()).map(([catId, prods]) => {
                      const cat = categorieMap.get(catId)
                      return (
                        <CommandGroup key={catId} heading={cat?.nome ?? 'Senza categoria'}>
                          {prods.map((p) => (
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
                      )
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Finitura */}
          <div className="space-y-1.5">
            <Label htmlFor="finitura">Finitura / Colore</Label>
            <Input id="finitura" value={finitura} onChange={(e) => setFinitura(e.target.value)} placeholder="es. RAL 9010, Anodizzato bronzo..." />
          </div>

          {/* Quantità */}
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
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty2">Quantità 2</Label>
              <div className="flex gap-1.5">
                <Input
                  id="qty2"
                  type="number"
                  step="0.001"
                  value={quantita2}
                  onChange={(e) => setQuantita2(e.target.value)}
                  placeholder="es. 6000"
                  className="flex-1"
                />
                <Input
                  value={unitaMisura2}
                  onChange={(e) => setUnitaMisura2(e.target.value)}
                  placeholder="UM"
                  className="w-16"
                />
              </div>
            </div>
          </div>

          {/* Posizione */}
          <div className="space-y-1.5">
            <Label>Posizione magazzino</Label>
            <ComboboxField
              options={[
                { value: '__none__', label: 'Nessuna' },
                ...posizioni.map((p) => ({ value: p.id, label: p.nome, sublabel: p.descrizione ?? undefined })),
              ]}
              value={posizioneId || '__none__'}
              onChange={(v) => setPosizioneId(v === '__none__' ? '' : v)}
              searchPlaceholder="Cerca posizione..."
            />
          </div>

          {/* Fornitore */}
          <div className="space-y-1.5">
            <Label>Fornitore</Label>
            <ComboboxField
              options={[
                { value: '__none__', label: 'Nessuno' },
                ...fornitori.map((f) => ({ value: f.id, label: f.nome })),
              ]}
              value={fornitoreId || '__none__'}
              onChange={(v) => setFornitoreId(v === '__none__' ? '' : v)}
              searchPlaceholder="Cerca fornitore..."
            />
          </div>

          {/* Commessa */}
          <div className="space-y-1.5">
            <Label htmlFor="commessa">Commessa</Label>
            <Input id="commessa" value={commessa} onChange={(e) => setCommessa(e.target.value)} placeholder="Nome commessa / cantiere" />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : articolo ? 'Salva modifiche' : 'Aggiungi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
