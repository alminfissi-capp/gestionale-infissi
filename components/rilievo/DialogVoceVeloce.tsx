'use client'

import { useState, useEffect } from 'react'
import { X, Check, ChevronsUpDown, GitFork, Grid3X3 } from 'lucide-react'
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
import PreviewSerramento, {
  APERTURE_BATTENTE,
  LABEL_APERTURA,
  defaultAperturaAnte,
} from '@/components/rilievo/PreviewSerramento'
import { makeGridTree, addSplit, updateSplit, deleteSplit, updateLeaf, findLeaf, getPath } from '@/lib/rilievo-vani'
import { useRilievoUiBlocchi } from '@/hooks/useRilievoUiBlocchi'
import type { VoceInput, OpzioniRilievo, VanoLeaf, TipoRiempimento } from '@/types/rilievo-veloce'

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
  struttura: null,
  n_ante: null,
  n_traverse: null,
  anta_principale: null,
  serie_profilo: null,
  h_davanzale_mm: null,
  pos_maniglia: null,
  telaio_top: null,
  telaio_left: null,
  telaio_bottom: null,
  telaio_right: null,
  note: '',
  tipo_apertura: null,
  apertura_ante: [],
  fuori_squadro: false,
  altezza_sx_mm: null,
  altezza_dx_mm: null,
  vani_tree: null,
}

const RIEMPIMENTI: { value: TipoRiempimento; label: string; color: string }[] = [
  { value: 'vetro',    label: 'Vetro',    color: '#dbeafe' },
  { value: 'pannello', label: 'Pannello', color: '#dcfce7' },
  { value: 'lamelle',  label: 'Lamelle',  color: '#fef9c3' },
  { value: 'doghe',    label: 'Doghe',    color: '#fce7f3' },
]

export default function DialogVoceVeloce({
  open, onClose, onSave, opzioni, initialValues, isEditing,
}: Props) {
  const [form, setForm] = useState<VoceInput>(initialValues ?? VOCE_VUOTA)
  const [accessoriOpen, setAccessoriOpen] = useState(false)
  const [telaioOpenLato, setTelaioOpenLato] = useState<'top' | 'left' | 'bottom' | 'right' | null>(null)
  const [selectedVanoId, setSelectedVanoId] = useState<string | null>(null)
  const [splitDir, setSplitDir] = useState<'montante' | 'traverso'>('montante')
  const [splitMm, setSplitMm] = useState<string>('500')
  const { getColore } = useRilievoUiBlocchi()

  useEffect(() => {
    if (open) {
      setForm(initialValues ?? VOCE_VUOTA)
      setSelectedVanoId(null)
    }
  }, [open, initialValues])

  const set = <K extends keyof VoceInput>(k: K, v: VoceInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const handleStrutturaChange = (value: string) => {
    set('struttura', value === '__none__' ? null : value)
  }

  const CYCLE_MANIGLIA: Array<'right' | 'left' | 'top' | 'bottom'> = ['right', 'left', 'top', 'bottom']

  const handleTipoAperturaChange = (tipo: VoceInput['tipo_apertura']) => {
    const n = form.n_ante ?? 0
    setForm((prev) => ({
      ...prev,
      tipo_apertura: tipo,
      apertura_ante: tipo && n > 0 ? defaultAperturaAnte(tipo, n, prev.n_traverse ?? 0) : [],
      vani_tree: null,  // reset tree se cambia il tipo globale
    }))
    setSelectedVanoId(null)
  }

  const handleAntaClick = (idx: number) => {
    if (form.tipo_apertura === 'battente') {
      set('anta_principale', idx)
    } else if (form.tipo_apertura === 'scorrevole' || form.tipo_apertura === 'alzante_scorrevole') {
      const CICLO = ['mobile_sx', 'mobile_dx', 'fisso']
      const curr = form.apertura_ante[idx] ?? 'mobile_sx'
      const next = CICLO[(CICLO.indexOf(curr) + 1) % CICLO.length]
      const newAnte = [...form.apertura_ante]
      newAnte[idx] = next
      set('apertura_ante', newAnte)
    } else {
      if (idx === form.anta_principale) {
        const curr = form.pos_maniglia ?? 'right'
        const next = CYCLE_MANIGLIA[(CYCLE_MANIGLIA.indexOf(curr) + 1) % CYCLE_MANIGLIA.length]
        set('pos_maniglia', next)
      } else {
        set('anta_principale', idx)
      }
    }
  }

  const handleNAnteChange = (raw: string) => {
    const n = raw === '' ? null : Math.max(1, Math.min(8, parseInt(raw) || 1))
    setForm((prev) => {
      const nRows = (prev.n_traverse ?? 0) + 1
      const totalCells = n != null ? n * nRows : 0
      return {
        ...prev,
        n_ante: n,
        vani_tree: null,
        anta_principale:
          n == null ? null
          : prev.anta_principale != null && prev.anta_principale < totalCells
            ? prev.anta_principale
            : 0,
        apertura_ante: prev.tipo_apertura && n != null
          ? defaultAperturaAnte(prev.tipo_apertura, n, prev.n_traverse ?? 0)
          : prev.apertura_ante,
      }
    })
    setSelectedVanoId(null)
  }

  const handleNTraverseChange = (raw: string) => {
    const n = raw === '' ? null : Math.max(0, Math.min(4, parseInt(raw) || 0))
    setForm((prev) => ({
      ...prev,
      n_traverse: n,
      vani_tree: null,
      anta_principale: 0,
      apertura_ante: prev.tipo_apertura && prev.n_ante != null
        ? defaultAperturaAnte(prev.tipo_apertura, prev.n_ante, n ?? 0)
        : prev.apertura_ante,
    }))
    setSelectedVanoId(null)
  }

  const toggleAccessorio = (val: string) => {
    setForm((prev) => ({
      ...prev,
      accessori: prev.accessori.includes(val)
        ? prev.accessori.filter((a) => a !== val)
        : [...prev.accessori, val],
    }))
  }

  // ── Fuori squadra ──────────────────────────────────────────
  const handleFuoriSquadroToggle = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      fuori_squadro: checked,
      altezza_sx_mm: checked ? (prev.altezza_mm ?? null) : null,
      altezza_dx_mm: checked ? (prev.altezza_mm ?? null) : null,
      altezza_mm: checked ? null : (prev.altezza_sx_mm ?? prev.altezza_dx_mm ?? null),
    }))
  }

  // ── Albero vani ──────────────────────────────────────────
  const isTreeMode = !!form.vani_tree

  const handleAttivaVani = () => {
    const nAnte = form.n_ante ?? 1
    const nTraverse = form.n_traverse ?? 0
    const wMm = form.larghezza_mm ?? 1000
    const effH = form.fuori_squadro
      ? Math.round(((form.altezza_sx_mm ?? 1000) + (form.altezza_dx_mm ?? 1000)) / 2)
      : (form.altezza_mm ?? 1000)
    const tree = makeGridTree(nAnte, nTraverse, form.tipo_apertura, form.apertura_ante, wMm, effH)
    setForm((prev) => ({ ...prev, vani_tree: tree }))
    setSelectedVanoId(null)
  }

  const handleResetVani = () => {
    setForm((prev) => ({ ...prev, vani_tree: null }))
    setSelectedVanoId(null)
  }

  const selectedLeaf: VanoLeaf | null = isTreeMode && selectedVanoId && form.vani_tree
    ? findLeaf(form.vani_tree, selectedVanoId)
    : null

  const handleUpdateSelectedLeaf = (patch: Partial<VanoLeaf>) => {
    if (!selectedVanoId || !form.vani_tree) return
    setForm((prev) => ({
      ...prev,
      vani_tree: updateLeaf(prev.vani_tree!, selectedVanoId, patch),
    }))
  }

  const handleAddSplit = () => {
    if (!selectedVanoId || !form.vani_tree) return
    const mm = Math.max(10, parseInt(splitMm) || 500)
    const newTree = addSplit(form.vani_tree, selectedVanoId, splitDir, mm)
    setForm((prev) => ({ ...prev, vani_tree: newTree }))
  }

  const handleUpdateSplit = (id: string, mm: number) => {
    if (!form.vani_tree) return
    setForm((prev) => ({ ...prev, vani_tree: updateSplit(prev.vani_tree!, id, mm) }))
  }

  const handleDeleteSplit = (id: string) => {
    if (!form.vani_tree) return
    setForm((prev) => ({ ...prev, vani_tree: deleteSplit(prev.vani_tree!, id) }))
    setSelectedVanoId(null)
  }

  const vaniWMm = form.larghezza_mm ?? 1000
  const vaniHMm = form.fuori_squadro
    ? Math.round(((form.altezza_sx_mm ?? 1000) + (form.altezza_dx_mm ?? 1000)) / 2)
    : (form.altezza_mm ?? 1000)
  const selectedPath = isTreeMode && selectedVanoId && form.vani_tree
    ? (getPath(form.vani_tree, selectedVanoId, vaniWMm, vaniHMm) ?? [])
    : []

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

  const strutturaOpt = opzioni.strutture.find((s) => s.valore === form.struttura)
  const serieFiltrate = opzioni.serie.length === 0 ? [] : (
    strutturaOpt
      ? opzioni.serie.filter(
          (s) => s.strutture_collegate.length === 0 || s.strutture_collegate.includes(strutturaOpt.id)
        )
      : opzioni.serie
  )

  const serieSelezionata = opzioni.serie.find((s) => s.valore === form.serie_profilo)
  const telaiFiltrati = opzioni.telai.length === 0 ? [] : (
    serieSelezionata
      ? opzioni.telai.filter(
          (t) => t.serie_collegate.length === 0 || t.serie_collegate.includes(serieSelezionata.id)
        )
      : opzioni.telai
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent fullscreen className="gap-0 p-0">

        {/* ── HEADER ── */}
        <DialogHeader className="px-6 pt-4 pb-3 shrink-0 border-b">
          <DialogTitle>{isEditing ? 'Modifica serramento' : 'Aggiungi serramento'}</DialogTitle>
        </DialogHeader>

        {/* ── CORPO ── */}
        <div className="flex-1 overflow-y-auto flex flex-col">

          {/* SEZIONE ALTA: 2 colonne compatte */}
          <div className="grid grid-cols-2 gap-x-6 px-6 pt-3 pb-3 border-b shrink-0">

            {/* ── COL SINISTRA ── */}
            <div className="space-y-2">

              {/* Voce + Qtà */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label>Voce / Posizione</Label>
                  <Input
                    placeholder="es. F1, Camera da letto…"
                    value={form.voce ?? ''}
                    onChange={(e) => set('voce', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Qtà</Label>
                  <Input
                    type="number" min={1}
                    value={form.quantita}
                    onChange={(e) => set('quantita', Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
              </div>

              {/* Larghezza + Altezza (o sx/dx se fuori squadra) */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Larghezza (mm)</Label>
                    <Input type="number" min={1} placeholder="es. 900"
                      value={form.larghezza_mm ?? ''}
                      onChange={(e) => set('larghezza_mm', e.target.value ? parseInt(e.target.value) : null)}
                    />
                  </div>
                  {!form.fuori_squadro ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Altezza (mm)</Label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                          <input type="checkbox" checked={form.fuori_squadro}
                            onChange={(e) => handleFuoriSquadroToggle(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-input accent-orange-500" />
                          Fuori squadra
                        </label>
                      </div>
                      <Input type="number" min={1} placeholder="es. 1200"
                        value={form.altezza_mm ?? ''}
                        onChange={(e) => set('altezza_mm', e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-orange-600">Fuori squadra</Label>
                        <button type="button" onClick={() => handleFuoriSquadroToggle(false)}
                          className="text-xs text-gray-400 hover:text-gray-600">✕ Reset</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div>
                          <div className="text-[10px] text-gray-400 mb-0.5">Sx (mm)</div>
                          <Input type="number" min={1} placeholder="—"
                            value={form.altezza_sx_mm ?? ''}
                            onChange={(e) => set('altezza_sx_mm', e.target.value ? parseInt(e.target.value) : null)}
                          />
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 mb-0.5">Dx (mm)</div>
                          <Input type="number" min={1} placeholder="—"
                            value={form.altezza_dx_mm ?? ''}
                            onChange={(e) => set('altezza_dx_mm', e.target.value ? parseInt(e.target.value) : null)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tipologia + (N. ante + N. traverse solo se non tree mode) + H Davanzale */}
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1 space-y-1.5">
                  <Label>Tipologia</Label>
                  <Select value={form.tipologia ?? '__none__'} onValueChange={(v) => set('tipologia', v === '__none__' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="Finestra">Finestra</SelectItem>
                      <SelectItem value="Porta">Porta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!isTreeMode && (
                  <>
                    <div className="space-y-1.5">
                      <Label>N. ante</Label>
                      <Input type="number" min={1} max={8} placeholder="—"
                        value={form.n_ante ?? ''}
                        onChange={(e) => handleNAnteChange(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Traverse</Label>
                      <Input type="number" min={0} max={4} placeholder="0"
                        value={form.n_traverse ?? ''}
                        onChange={(e) => handleNTraverseChange(e.target.value)}
                      />
                    </div>
                  </>
                )}
                {form.tipologia === 'Finestra' && (
                  <div className="space-y-1.5">
                    <Label>H Dav. (mm)</Label>
                    <Input type="number" min={0} placeholder="—"
                      value={form.h_davanzale_mm ?? ''}
                      onChange={(e) => set('h_davanzale_mm', e.target.value === '' ? null : parseInt(e.target.value) || null)}
                    />
                  </div>
                )}
              </div>

              {/* Tipo apertura (solo griglia legacy) */}
              {!isTreeMode && (
                <div className="space-y-1.5">
                  <Label>Tipo apertura</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      { val: null,                  label: '—' },
                      { val: 'battente',            label: 'Battente' },
                      { val: 'scorrevole',          label: 'Scorrevole' },
                      { val: 'alzante_scorrevole',  label: 'Alz. Scor.' },
                    ] as const).map(({ val, label }) => (
                      <button key={label} type="button"
                        onClick={() => handleTipoAperturaChange(val)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs border transition-colors',
                          form.tipo_apertura === val
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                        )}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Struttura */}
              <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('struttura')}` }}>
                <Label>Struttura</Label>
                {opzioni.strutture.length > 0 ? (
                  <Select value={form.struttura ?? '__none__'} onValueChange={handleStrutturaChange}>
                    <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      <SelectItem value="__none__">—</SelectItem>
                      {opzioni.strutture.map((s) => <SelectItem key={s.id} value={s.valore}>{s.valore}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input placeholder="es. Battente…" value={form.struttura ?? ''} onChange={(e) => set('struttura', e.target.value || null)} />
                )}
              </div>

              {/* Serie profilo */}
              {serieFiltrate.length > 0 && (
                <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('serie')}` }}>
                  <Label>Serie profilo{strutturaOpt ? ` — ${strutturaOpt.valore}` : ''}</Label>
                  <Select value={form.serie_profilo ?? '__none__'} onValueChange={(v) => set('serie_profilo', v === '__none__' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      <SelectItem value="__none__">—</SelectItem>
                      {serieFiltrate.map((s) => <SelectItem key={s.id} value={s.valore}>{s.valore}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

            </div>

            {/* ── COL DESTRA ── */}
            <div className="space-y-2">

              {/* Accessori */}
              {opzioni.accessori.length > 0 && (
                <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('accessorio')}` }}>
                  <Label>Finitura / Accessori</Label>
                  <Popover open={accessoriOpen} onOpenChange={setAccessoriOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className={cn(
                        'flex w-full min-h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent/30',
                        form.accessori.length === 0 && 'text-muted-foreground'
                      )}>
                        <div className="flex flex-wrap gap-1 flex-1 text-left">
                          {form.accessori.length === 0 ? <span>Seleziona accessori…</span> : form.accessori.map((a) => (
                            <Badge key={a} variant="secondary" className="text-xs">
                              {a}
                              <span role="button" className="ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleAccessorio(a) }}>
                                <X className="h-2.5 w-2.5" />
                              </span>
                            </Badge>
                          ))}
                        </div>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                      {opzioni.accessori.map((a) => (
                        <button key={a} type="button" onClick={() => toggleAccessorio(a)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                          <div className={cn('flex h-4 w-4 items-center justify-center rounded-sm border',
                            form.accessori.includes(a) ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}>
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
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('colore')}` }}>
                    <Label>Colore interno</Label>
                    <Select value={form.colore_interno ?? '__none__'} onValueChange={(v) => set('colore_interno', v === '__none__' ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        <SelectItem value="__none__">—</SelectItem>
                        {opzioni.colori.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <input id="bicolore" type="checkbox" checked={form.bicolore}
                      onChange={(e) => set('bicolore', e.target.checked)}
                      className="h-4 w-4 rounded border-input accent-primary" />
                    <Label htmlFor="bicolore" className="cursor-pointer font-normal">Bicolore</Label>
                  </div>
                </div>
                {form.bicolore && (
                  <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('colore')}` }}>
                    <Label>Colore esterno</Label>
                    <Select value={form.colore_esterno ?? '__none__'} onValueChange={(v) => set('colore_esterno', v === '__none__' ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        <SelectItem value="__none__">—</SelectItem>
                        {opzioni.colori.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Tipologia vetro */}
              {opzioni.vetri.length > 0 && (
                <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('vetro')}` }}>
                  <Label>Tipologia vetro</Label>
                  <Select value={form.tipologia_vetro ?? '__none__'} onValueChange={(v) => set('tipologia_vetro', v === '__none__' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      <SelectItem value="__none__">—</SelectItem>
                      {opzioni.vetri.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Anta ribalta + Serratura */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.anta_ribalta}
                    onChange={(e) => set('anta_ribalta', e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary" />
                  <span className="text-sm">Kit anta ribalta</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.serratura}
                    onChange={(e) => set('serratura', e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary" />
                  <span className="text-sm">Serratura</span>
                </label>
              </div>

              {/* Tipo serratura */}
              {form.serratura && opzioni.serrature.length > 0 && (
                <div className="space-y-1.5 pl-2 rounded-l-sm" style={{ borderLeft: `3px solid ${getColore('serratura')}` }}>
                  <Label>Tipo serratura</Label>
                  <Select value={form.tipo_serratura ?? '__none__'} onValueChange={(v) => set('tipo_serratura', v === '__none__' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      <SelectItem value="__none__">—</SelectItem>
                      {opzioni.serrature.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Note */}
              <div className="space-y-1.5">
                <Label>Note</Label>
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="Note aggiuntive…"
                  value={form.note ?? ''}
                  onChange={(e) => set('note', e.target.value)}
                />
              </div>

            </div>
          </div>

          {/* SEZIONE BASSA: preview + pannello configurazione */}
          <div className="flex gap-6 px-6 pt-3 pb-4 border-t border-dashed border-gray-100">

            {/* ── BLOCCO PREVIEW + TELAI ── */}
            <div className="w-72 shrink-0 flex flex-col">

              {/* Telaio superiore */}
              {telaiFiltrati.length > 0 && (
                <Popover open={telaioOpenLato === 'top'} onOpenChange={(o) => setTelaioOpenLato(o ? 'top' : null)}>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(
                      'mb-0.5 flex w-full items-center justify-center h-7 rounded-t-lg border border-b-0 text-xs gap-1.5 transition-colors',
                      form.telaio_top ? 'bg-teal-50 border-teal-300 text-teal-700 font-medium' : 'border-dashed border-gray-300 text-gray-400 hover:bg-gray-50'
                    )}>
                      <span>↑</span><span className="truncate">{form.telaio_top ?? 'Telaio superiore'}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-1 max-h-52 overflow-y-auto" side="top" align="center">
                    {[null, ...telaiFiltrati.map(t => t.valore)].map((v) => (
                      <button key={v ?? '__none__'} type="button"
                        onClick={() => { set('telaio_top', v); setTelaioOpenLato(null) }}
                        className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors', form.telaio_top === v && v !== null && 'bg-accent font-medium')}>
                        {v ?? '— nessuno'}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

              <div className="flex-1 flex items-stretch gap-0.5">

                {/* Telaio sinistro */}
                {telaiFiltrati.length > 0 && (
                  <Popover open={telaioOpenLato === 'left'} onOpenChange={(o) => setTelaioOpenLato(o ? 'left' : null)}>
                    <PopoverTrigger asChild>
                      <button type="button" className={cn(
                        'flex flex-col items-center justify-center w-8 shrink-0 rounded-l-lg border border-r-0 text-[10px] transition-colors',
                        form.telaio_left ? 'bg-teal-50 border-teal-300 text-teal-700 font-medium' : 'border-dashed border-gray-300 text-gray-400 hover:bg-gray-50'
                      )}>
                        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                          {form.telaio_left ?? '← Sin'}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-1 max-h-52 overflow-y-auto" side="left" align="center">
                      {[null, ...telaiFiltrati.map(t => t.valore)].map((v) => (
                        <button key={v ?? '__none__'} type="button"
                          onClick={() => { set('telaio_left', v); setTelaioOpenLato(null) }}
                          className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors', form.telaio_left === v && v !== null && 'bg-accent font-medium')}>
                          {v ?? '— nessuno'}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}

                {/* Preview */}
                {(form.struttura || (form.n_ante ?? 0) >= 1 || isTreeMode) ? (
                  <div className="flex-1 border bg-gray-50 p-2">
                    <PreviewSerramento
                      struttura={form.struttura}
                      nAnte={form.n_ante}
                      nTraverse={form.n_traverse}
                      larghezza={form.larghezza_mm}
                      altezza={form.fuori_squadro ? null : form.altezza_mm}
                      altezzaSx={form.altezza_sx_mm}
                      altezzaDx={form.altezza_dx_mm}
                      fuoriSquadro={form.fuori_squadro}
                      antaPrincipale={form.anta_principale}
                      posManiglia={form.pos_maniglia}
                      tipoApertura={form.tipo_apertura}
                      aperturaAnte={form.apertura_ante}
                      onSelectAnta={!isTreeMode && (form.n_ante ?? 0) >= 1 ? handleAntaClick : undefined}
                      vaniTree={form.vani_tree}
                      selectedVanoId={selectedVanoId}
                      onSelectVano={isTreeMode ? setSelectedVanoId : undefined}
                    />
                  </div>
                ) : (
                  <div className="flex-1 border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                    <span className="text-xs text-gray-300 text-center px-2">Imposta struttura o numero ante</span>
                  </div>
                )}

                {/* Telaio destro */}
                {telaiFiltrati.length > 0 && (
                  <Popover open={telaioOpenLato === 'right'} onOpenChange={(o) => setTelaioOpenLato(o ? 'right' : null)}>
                    <PopoverTrigger asChild>
                      <button type="button" className={cn(
                        'flex flex-col items-center justify-center w-8 shrink-0 rounded-r-lg border border-l-0 text-[10px] transition-colors',
                        form.telaio_right ? 'bg-teal-50 border-teal-300 text-teal-700 font-medium' : 'border-dashed border-gray-300 text-gray-400 hover:bg-gray-50'
                      )}>
                        <span style={{ writingMode: 'vertical-rl' }}>
                          {form.telaio_right ?? 'Des →'}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-1 max-h-52 overflow-y-auto" side="right" align="center">
                      {[null, ...telaiFiltrati.map(t => t.valore)].map((v) => (
                        <button key={v ?? '__none__'} type="button"
                          onClick={() => { set('telaio_right', v); setTelaioOpenLato(null) }}
                          className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors', form.telaio_right === v && v !== null && 'bg-accent font-medium')}>
                          {v ?? '— nessuno'}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Telaio inferiore */}
              {telaiFiltrati.length > 0 && (
                <Popover open={telaioOpenLato === 'bottom'} onOpenChange={(o) => setTelaioOpenLato(o ? 'bottom' : null)}>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(
                      'mt-0.5 flex w-full items-center justify-center h-7 rounded-b-lg border border-t-0 text-xs gap-1.5 transition-colors',
                      form.telaio_bottom ? 'bg-teal-50 border-teal-300 text-teal-700 font-medium' : 'border-dashed border-gray-300 text-gray-400 hover:bg-gray-50'
                    )}>
                      <span>↓</span><span className="truncate">{form.telaio_bottom ?? 'Telaio inferiore'}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-1 max-h-52 overflow-y-auto" side="bottom" align="center">
                    {[null, ...telaiFiltrati.map(t => t.valore)].map((v) => (
                      <button key={v ?? '__none__'} type="button"
                        onClick={() => { set('telaio_bottom', v); setTelaioOpenLato(null) }}
                        className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors', form.telaio_bottom === v && v !== null && 'bg-accent font-medium')}>
                        {v ?? '— nessuno'}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

            </div>

            {/* ── PANNELLO DESTRA ── */}
            <div className="flex-1 flex flex-col gap-2 pt-1 min-w-0">

              {/* Toggle modalità vani */}
              <div className="flex items-center gap-2">
                {!isTreeMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={handleAttivaVani}
                    disabled={(form.n_ante ?? 0) < 1}
                    title={(form.n_ante ?? 0) < 1 ? 'Imposta N. ante prima' : ''}
                  >
                    <GitFork className="h-3.5 w-3.5" />
                    Configura vani
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 text-gray-500 border-gray-200 hover:bg-gray-50"
                    onClick={handleResetVani}
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                    Modalità griglia
                  </Button>
                )}
                {isTreeMode && (
                  <span className="text-xs text-blue-600 font-medium">Vani avanzati attivi</span>
                )}
              </div>

              {/* ── Configurazione vano selezionato (tree mode) ── */}
              {isTreeMode && (
                <div className="flex flex-col gap-2 border rounded-lg p-2.5 bg-blue-50/30 overflow-y-auto max-h-[460px]">
                  {!selectedLeaf ? (
                    <div className="flex items-center justify-center h-20">
                      <p className="text-xs text-gray-400 text-center">Tocca un vano nel preview<br />per configurarlo</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-blue-700">Vano selezionato</p>

                      {/* N ante */}
                      <div className="flex items-center gap-2">
                        <div className="text-[11px] text-gray-500 font-medium w-16 shrink-0">N. ante</div>
                        <Input
                          type="number" min={1} max={8}
                          value={selectedLeaf.n_ante}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(8, parseInt(e.target.value) || 1))
                            handleUpdateSelectedLeaf({ n_ante: n, apertura_ante: Array(n).fill('') })
                          }}
                          className="w-16 h-7 text-xs text-center"
                        />
                      </div>

                      {/* Tipo apertura del vano */}
                      <div className="space-y-1">
                        <div className="text-[11px] text-gray-500 font-medium">Tipo apertura</div>
                        <div className="flex gap-1 flex-wrap">
                          {([
                            { val: null,                  label: 'Fisso' },
                            { val: 'battente',            label: 'Battente' },
                            { val: 'scorrevole',          label: 'Scorrevole' },
                            { val: 'alzante_scorrevole',  label: 'Alz. Scor.' },
                          ] as const).map(({ val, label }) => (
                            <button key={label} type="button"
                              onClick={() => handleUpdateSelectedLeaf({ tipo_apertura: val, apertura_ante: [] })}
                              className={cn(
                                'px-2 py-0.5 rounded text-xs border transition-colors',
                                selectedLeaf.tipo_apertura === val
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                              )}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Per-anta apertura (battente) */}
                      {selectedLeaf.tipo_apertura === 'battente' && (
                        <div className="space-y-1">
                          <div className="text-[11px] text-gray-500 font-medium">Apertura ante</div>
                          {Array.from({ length: selectedLeaf.n_ante }, (_, i) => (
                            <div key={i} className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-gray-400 w-10 shrink-0">Anta {i + 1}</span>
                              {APERTURE_BATTENTE.map((tipo) => (
                                <button key={tipo} type="button"
                                  onClick={() => {
                                    const arr = [...selectedLeaf.apertura_ante]
                                    arr[i] = tipo
                                    handleUpdateSelectedLeaf({ apertura_ante: arr })
                                  }}
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
                                    selectedLeaf.apertura_ante[i] === tipo
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                                  )}>
                                  {LABEL_APERTURA[tipo]}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Per-anta apertura (scorrevole) */}
                      {(selectedLeaf.tipo_apertura === 'scorrevole' || selectedLeaf.tipo_apertura === 'alzante_scorrevole') && (
                        <div className="space-y-1">
                          <div className="text-[11px] text-gray-500 font-medium">Apertura ante</div>
                          {Array.from({ length: selectedLeaf.n_ante }, (_, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-400 w-10 shrink-0">Anta {i + 1}</span>
                              {(['mobile_sx', 'mobile_dx', 'fisso'] as const).map((tipo) => (
                                <button key={tipo} type="button"
                                  onClick={() => {
                                    const arr = [...selectedLeaf.apertura_ante]
                                    arr[i] = tipo
                                    handleUpdateSelectedLeaf({ apertura_ante: arr })
                                  }}
                                  className={cn(
                                    'px-2 py-0.5 rounded text-xs border transition-colors',
                                    selectedLeaf.apertura_ante[i] === tipo
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                                  )}>
                                  {LABEL_APERTURA[tipo] ?? tipo}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Riempimento */}
                      <div className="space-y-1">
                        <div className="text-[11px] text-gray-500 font-medium">Riempimento</div>
                        <div className="flex gap-1.5">
                          {RIEMPIMENTI.map(({ value, label, color }) => (
                            <button key={value} type="button"
                              onClick={() => handleUpdateSelectedLeaf({ riempimento: value })}
                              className={cn(
                                'px-2 py-0.5 rounded text-xs border transition-colors',
                                selectedLeaf.riempimento === value
                                  ? 'border-blue-600 ring-1 ring-blue-600 font-medium'
                                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
                              )}
                              style={{ backgroundColor: selectedLeaf.riempimento === value ? color : undefined }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Gerarchia divisori */}
                      {selectedPath.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-blue-100">
                          <div className="text-[11px] text-gray-500 font-medium">Divisori</div>
                          {selectedPath.map(({ split, parentW, parentH }) => {
                            const isMontan = split.direzione === 'montante'
                            const maxMm = isMontan ? parentW : parentH
                            return (
                              <div key={split.id} className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-500 w-14 shrink-0">
                                  {isMontan ? '┃ Mont.' : '━ Trav.'}
                                </span>
                                <Input
                                  type="number" min={1} max={maxMm - 1} step={1}
                                  value={split.mm}
                                  onChange={(e) => handleUpdateSplit(split.id, Math.max(1, Math.min(maxMm - 1, parseInt(e.target.value) || split.mm)))}
                                  className="w-20 h-6 text-xs text-center"
                                />
                                <span className="text-[10px] text-gray-400">/ {maxMm} mm</span>
                                <button type="button"
                                  onClick={() => handleDeleteSplit(split.id)}
                                  className="ml-auto px-1.5 py-0.5 rounded text-[10px] border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                                  ✕
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Dividi vano */}
                      <div className="space-y-1.5 pt-1 border-t border-blue-100">
                        <div className="text-[11px] text-gray-500 font-medium">Dividi vano</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex gap-1">
                            <button type="button"
                              onClick={() => setSplitDir('montante')}
                              title="Montante (divisore verticale)"
                              className={cn(
                                'px-2 py-0.5 rounded text-xs border transition-colors',
                                splitDir === 'montante'
                                  ? 'bg-gray-700 border-gray-700 text-white'
                                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
                              )}>
                              ┃ Montante
                            </button>
                            <button type="button"
                              onClick={() => setSplitDir('traverso')}
                              title="Traversa (divisore orizzontale)"
                              className={cn(
                                'px-2 py-0.5 rounded text-xs border transition-colors',
                                splitDir === 'traverso'
                                  ? 'bg-gray-700 border-gray-700 text-white'
                                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
                              )}>
                              ━ Traversa
                            </button>
                          </div>
                          <Input
                            type="number" min={1} step={10}
                            value={splitMm}
                            onChange={(e) => setSplitMm(e.target.value)}
                            className="w-20 h-7 text-xs text-center"
                          />
                          <span className="text-xs text-gray-400">mm</span>
                          <Button type="button" size="sm" variant="outline"
                            className="h-7 text-xs px-2"
                            onClick={handleAddSplit}>
                            Dividi
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Configurazione anta (modalità griglia legacy) ── */}
              {!isTreeMode && form.tipo_apertura === 'battente' && (
                <>
                  <p className="text-xs font-medium text-gray-500">
                    {form.anta_principale !== null
                      ? `Anta ${form.anta_principale + 1} — tipo apertura`
                      : 'Tocca un\'anta nel preview per configurarla'}
                  </p>
                  {form.anta_principale !== null && (() => {
                    const idx = form.anta_principale
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {APERTURE_BATTENTE.map((tipo) => (
                          <button key={tipo} type="button"
                            onClick={() => {
                              const newAnte = [...form.apertura_ante]
                              newAnte[idx] = tipo
                              set('apertura_ante', newAnte)
                            }}
                            className={cn(
                              'px-2 py-1 rounded-md text-xs border transition-colors text-left',
                              form.apertura_ante[idx] === tipo
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                            )}>
                            {LABEL_APERTURA[tipo]}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </>
              )}
              {!isTreeMode && (form.tipo_apertura === 'scorrevole' || form.tipo_apertura === 'alzante_scorrevole') && (
                <p className="text-xs text-gray-400 leading-relaxed">
                  Tocca un&apos;anta nel preview per cambiarne il tipo:<br />
                  <span className="font-medium text-gray-600">← scorrevole sx → scorrevole dx · fisso</span>
                </p>
              )}
            </div>

          </div>
        </div>

        {/* ── FOOTER ── */}
        <DialogFooter className="px-6 py-4 shrink-0 border-t">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? 'Salva modifiche' : 'Aggiungi'}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}
