'use client'

import { useState, useEffect } from 'react'
import { X, Check, ChevronsUpDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { VoceInput, OpzioniRilievo } from '@/types/rilievo-veloce'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (voce: VoceInput) => void
  opzioni: OpzioniRilievo
  initialValues?: VoceInput
  isEditing?: boolean
}

const VOCE_VUOTA: VoceInput = {
  ordine: 0,
  voce: '',
  quantita: 1,
  tipologia: '',
  larghezza_mm: null,
  altezza_mm: null,
  accessori: [],
  colore_interno: null,
  bicolore: false,
  colore_esterno: null,
  tipologia_vetro: null,
  anta_ribalta: false,
  serratura: false,
  tipo_serratura: null,
  note: '',
}

export default function DialogVoceVeloce({
  open, onClose, onSave, opzioni, initialValues, isEditing,
}: Props) {
  const [form, setForm] = useState<VoceInput>(initialValues ?? VOCE_VUOTA)
  const [accessoriOpen, setAccessoriOpen] = useState(false)

  useEffect(() => {
    if (open) setForm(initialValues ?? VOCE_VUOTA)
  }, [open, initialValues])

  const set = <K extends keyof VoceInput>(k: K, v: VoceInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const toggleAccessorio = (val: string) => {
    setForm((prev) => ({
      ...prev,
      accessori: prev.accessori.includes(val)
        ? prev.accessori.filter((a) => a !== val)
        : [...prev.accessori, val],
    }))
  }

  const handleSave = () => {
    onSave({
      ...form,
      voce: form.voce?.trim() || null,
      tipologia: form.tipologia?.trim() || null,
      note: form.note?.trim() || null,
      colore_esterno: form.bicolore ? form.colore_esterno : null,
      tipo_serratura: form.serratura ? form.tipo_serratura : null,
    } as VoceInput)
    onClose()
  }

  const canSave = !!form.tipologia?.trim() || !!form.voce?.trim()

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modifica serramento' : 'Aggiungi serramento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Riga 1: Voce + Quantità */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Voce / Posizione</Label>
              <Input
                placeholder="es. F1, Bagno, Camera letto…"
                value={form.voce ?? ''}
                onChange={(e) => set('voce', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quantità</Label>
              <Input
                type="number"
                min={1}
                value={form.quantita}
                onChange={(e) => set('quantita', Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          {/* Tipologia */}
          <div className="space-y-1.5">
            <Label>Tipologia / Descrizione</Label>
            <Input
              placeholder="es. Finestra a 2 ante, Porta scorrevole…"
              value={form.tipologia ?? ''}
              onChange={(e) => set('tipologia', e.target.value)}
            />
          </div>

          {/* Misure */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Larghezza (mm)</Label>
              <Input
                type="number"
                min={1}
                placeholder="es. 900"
                value={form.larghezza_mm ?? ''}
                onChange={(e) => set('larghezza_mm', e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Altezza (mm)</Label>
              <Input
                type="number"
                min={1}
                placeholder="es. 1200"
                value={form.altezza_mm ?? ''}
                onChange={(e) => set('altezza_mm', e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
          </div>

          {/* Accessori — multi-select */}
          {opzioni.accessori.length > 0 && (
            <div className="space-y-1.5">
              <Label>Finitura / Accessori</Label>
              <Popover open={accessoriOpen} onOpenChange={setAccessoriOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full min-h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      form.accessori.length === 0 && 'text-muted-foreground'
                    )}
                  >
                    <div className="flex flex-wrap gap-1 flex-1 text-left">
                      {form.accessori.length === 0 ? (
                        <span>Seleziona accessori…</span>
                      ) : (
                        form.accessori.map((a) => (
                          <Badge key={a} variant="secondary" className="text-xs">
                            {a}
                            <span
                              role="button"
                              className="ml-1 cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); toggleAccessorio(a) }}
                            >
                              <X className="h-2.5 w-2.5" />
                            </span>
                          </Badge>
                        ))
                      )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                  {opzioni.accessori.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAccessorio(a)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                    >
                      <div className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border',
                        form.accessori.includes(a)
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input'
                      )}>
                        {form.accessori.includes(a) && <Check className="h-3 w-3" />}
                      </div>
                      {a}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Colore interno + Bicolore */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Colore interno</Label>
                <Select
                  value={form.colore_interno ?? '__none__'}
                  onValueChange={(v) => set('colore_interno', v === '__none__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona…" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="__none__">—</SelectItem>
                    {opzioni.colori.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <input
                  id="bicolore"
                  type="checkbox"
                  checked={form.bicolore}
                  onChange={(e) => set('bicolore', e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="bicolore" className="cursor-pointer font-normal">Bicolore</Label>
              </div>
            </div>

            {form.bicolore && (
              <div className="space-y-1.5">
                <Label>Colore esterno</Label>
                <Select
                  value={form.colore_esterno ?? '__none__'}
                  onValueChange={(v) => set('colore_esterno', v === '__none__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona…" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="__none__">—</SelectItem>
                    {opzioni.colori.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Tipologia vetro */}
          {opzioni.vetri.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tipologia vetro</Label>
              <Select
                value={form.tipologia_vetro ?? '__none__'}
                onValueChange={(v) => set('tipologia_vetro', v === '__none__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona…" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="__none__">—</SelectItem>
                  {opzioni.vetri.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Anta ribalta + Serratura */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.anta_ribalta}
                onChange={(e) => set('anta_ribalta', e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">Kit anta ribalta</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.serratura}
                onChange={(e) => set('serratura', e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">Serratura</span>
            </label>
          </div>

          {/* Tipo serratura — visibile solo se serratura = true */}
          {form.serratura && opzioni.serrature.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tipo serratura</Label>
              <Select
                value={form.tipo_serratura ?? '__none__'}
                onValueChange={(v) => set('tipo_serratura', v === '__none__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona…" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="__none__">—</SelectItem>
                  {opzioni.serrature.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Note</Label>
            <textarea
              className="w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Note aggiuntive…"
              value={form.note ?? ''}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? 'Salva modifiche' : 'Aggiungi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
