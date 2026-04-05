'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Trash2, Eye, EyeOff, Check, X, Link2, ChevronDown, ChevronUp,
  ChevronLeft, LayoutGrid, Wrench, Palette, Layers, Lock, Package, GripVertical, Frame,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  upsertOpzione, deleteOpzione, toggleOpzioneAttiva, updateStruttureSerie,
} from '@/actions/rilievo-veloce'
import { useRilievoUiBlocchi } from '@/hooks/useRilievoUiBlocchi'
import { toast } from 'sonner'
import type { RilievoOpzione, TipoOpzione } from '@/types/rilievo-veloce'

interface Props {
  opzioni: RilievoOpzione[]
}

// ─── Icone per tipo ───────────────────────────────────────────

function TipoIcon({ tipo, className }: { tipo: string; className?: string }) {
  const cls = className ?? 'h-7 w-7'
  switch (tipo) {
    case 'struttura':  return <LayoutGrid className={cls} />
    case 'accessorio': return <Wrench className={cls} />
    case 'colore':     return <Palette className={cls} />
    case 'vetro':      return <Layers className={cls} />
    case 'serratura':  return <Lock className={cls} />
    case 'serie':      return <Package className={cls} />
    case 'telaio':     return <Frame className={cls} />
    default:           return <LayoutGrid className={cls} />
  }
}

// ─── Blocco sortable ──────────────────────────────────────────

interface BloccoCardProps {
  id: string
  tipo: string
  label: string
  colore: string
  count: number
  onClick: () => void
  onColorChange: (c: string) => void
}

function BloccoCard({ id, tipo, label, colore, count, onClick, onColorChange }: BloccoCardProps) {
  const colorRef = useRef<HTMLInputElement>(null)
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Sfondo colorato */}
      <div
        className="p-4 h-32 flex flex-col justify-between"
        style={{ background: `linear-gradient(135deg, ${colore}ee, ${colore}bb)` }}
      >
        {/* Top row: icona + drag handle */}
        <div className="flex items-start justify-between">
          <div className="text-white/90">
            <TipoIcon tipo={tipo} />
          </div>
          {/* Drag handle — stopPropagation per non triggerare onClick */}
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="text-white/50 hover:text-white/90 transition-colors cursor-grab active:cursor-grabbing touch-none"
            title="Trascina per riposizionare"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        </div>

        {/* Bottom row: label + count */}
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{label}</p>
          <p className="text-white/70 text-xs mt-0.5">
            {count} {count === 1 ? 'voce' : 'voci'}
          </p>
        </div>

        {/* Color picker dot (angolo in basso a destra) */}
        <div
          className="absolute bottom-3 right-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-5 h-5 rounded-full border-2 border-white/60 hover:border-white cursor-pointer transition-colors shadow-sm"
            style={{ background: colore }}
            onClick={() => colorRef.current?.click()}
            title="Cambia colore"
          />
          <input
            ref={colorRef}
            type="color"
            value={colore}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-0 h-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sezione opzioni (dettaglio) ─────────────────────────────

interface SezioneProps {
  tipo: TipoOpzione
  items: RilievoOpzione[]
  onAdd: (tipo: TipoOpzione, valore: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggle: (id: string, attiva: boolean) => Promise<void>
}

function SezioneOpzioni({ tipo, items, onAdd, onDelete, onToggle }: SezioneProps) {
  const [adding, setAdding]     = useState(false)
  const [nuovoValore, setNuovo] = useState('')
  const [isPending, start]      = useTransition()

  const handleAdd = () => {
    const v = nuovoValore.trim()
    if (!v) return
    start(async () => {
      try { await onAdd(tipo, v); setNuovo(''); setAdding(false); toast.success('Opzione aggiunta') }
      catch { toast.error('Errore aggiunta') }
    })
  }

  return (
    <div className="space-y-2">
      {/* Pulsante aggiungi */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding || isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <Input autoFocus placeholder="Nuovo valore…" value={nuovoValore}
            onChange={(e) => setNuovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNuovo('') } }}
            className="h-8 text-sm" />
          <button onClick={handleAdd} disabled={!nuovoValore.trim() || isPending}
            className="p-1.5 rounded-md text-white bg-primary hover:bg-primary/90 disabled:opacity-50">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setAdding(false); setNuovo('') }}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {items.length === 0 && !adding ? (
        <p className="text-sm text-gray-400 py-4 text-center">Nessuna opzione. Clicca <strong>Aggiungi</strong> per iniziare.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-opacity ${item.attiva ? 'bg-white' : 'opacity-50 bg-gray-50'}`}>
              <span className="flex-1 truncate text-gray-800">{item.valore}</span>
              {!item.attiva && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inattiva</span>}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => start(async () => { try { await onToggle(item.id, item.attiva) } catch { toast.error('Errore') } })}
                  disabled={isPending} title={item.attiva ? 'Disattiva' : 'Attiva'}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  {item.attiva ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => { if (!confirm('Eliminare questa opzione?')) return; start(async () => { try { await onDelete(item.id); toast.success('Eliminata') } catch { toast.error('Errore') } }) }}
                  disabled={isPending} title="Elimina"
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sezione serie (con link strutture) ──────────────────────

interface SezioneSeriePros {
  items: RilievoOpzione[]
  strutture: RilievoOpzione[]
  onAdd: (tipo: TipoOpzione, valore: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggle: (id: string, attiva: boolean) => Promise<void>
  onUpdateStrutture: (id: string, strutture_collegate: string[]) => Promise<void>
}

function SezioneSerieOpzioni({
  items, strutture, onAdd, onDelete, onToggle, onUpdateStrutture,
}: SezioneSeriePros) {
  const [adding, setAdding]             = useState(false)
  const [nuovoValore, setNuovo]         = useState('')
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [pendingLinks, setPendingLinks] = useState<Record<string, string[]>>({})
  const [isPending, start]              = useTransition()

  const handleAdd = () => {
    const v = nuovoValore.trim()
    if (!v) return
    start(async () => {
      try { await onAdd('serie', v); setNuovo(''); setAdding(false); toast.success('Serie aggiunta') }
      catch { toast.error('Errore aggiunta') }
    })
  }

  const toggleExpand = (id: string, current: string[]) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setPendingLinks((prev) => ({ ...prev, [id]: current }))
  }

  const toggleLink = (serieId: string, strutturaId: string) => {
    setPendingLinks((prev) => {
      const curr = prev[serieId] ?? []
      return { ...prev, [serieId]: curr.includes(strutturaId) ? curr.filter((x) => x !== strutturaId) : [...curr, strutturaId] }
    })
  }

  const saveLinks = (id: string) => {
    const links = pendingLinks[id] ?? []
    start(async () => {
      try { await onUpdateStrutture(id, links); setExpandedId(null); toast.success('Strutture aggiornate') }
      catch { toast.error('Errore salvataggio') }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding || isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <Input autoFocus placeholder="Nome serie (es. Aliplast 5000)…" value={nuovoValore}
            onChange={(e) => setNuovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNuovo('') } }}
            className="h-8 text-sm" />
          <button onClick={handleAdd} disabled={!nuovoValore.trim() || isPending}
            className="p-1.5 rounded-md text-white bg-primary hover:bg-primary/90 disabled:opacity-50">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setAdding(false); setNuovo('') }}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {items.length === 0 && !adding ? (
        <p className="text-sm text-gray-400 py-4 text-center">Nessuna serie. Clicca <strong>Aggiungi</strong> per iniziare.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const isExp      = expandedId === item.id
            const links      = isExp ? (pendingLinks[item.id] ?? item.strutture_collegate) : item.strutture_collegate
            const linkedNomi = strutture.filter((s) => item.strutture_collegate.includes(s.id)).map((s) => s.valore)

            return (
              <div key={item.id} className={`rounded-lg border transition-opacity ${item.attiva ? 'bg-white' : 'opacity-50 bg-gray-50'}`}>
                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-gray-800">{item.valore}</span>
                  {linkedNomi.length > 0 && !isExp && (
                    <div className="flex gap-1 flex-wrap max-w-[160px]">
                      {linkedNomi.map((n) => (
                        <span key={n} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">{n}</span>
                      ))}
                    </div>
                  )}
                  {linkedNomi.length === 0 && !isExp && strutture.length > 0 && (
                    <span className="text-[10px] text-gray-400">tutte</span>
                  )}
                  {!item.attiva && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inattiva</span>}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {strutture.length > 0 && (
                      <button onClick={() => toggleExpand(item.id, item.strutture_collegate)}
                        title="Collega strutture" disabled={isPending}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center gap-0.5">
                        <Link2 className="h-3.5 w-3.5" />
                        {isExp ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                      </button>
                    )}
                    <button onClick={() => start(async () => { try { await onToggle(item.id, item.attiva) } catch { toast.error('Errore') } })}
                      disabled={isPending} title={item.attiva ? 'Disattiva' : 'Attiva'}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      {item.attiva ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { if (!confirm('Eliminare?')) return; start(async () => { try { await onDelete(item.id); toast.success('Eliminata') } catch { toast.error('Errore') } }) }}
                      disabled={isPending} title="Elimina"
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t bg-gray-50 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Strutture compatibili — vuoto = valida per tutte</p>
                    <div className="flex flex-wrap gap-2">
                      {strutture.map((s) => {
                        const checked = links.includes(s.id)
                        return (
                          <label key={s.id}
                            className={`flex items-center gap-1.5 cursor-pointer rounded-md border px-2.5 py-1 text-sm select-none transition-colors ${checked ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                            <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleLink(item.id, s.id)} />
                            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                              {checked && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            {s.valore}
                          </label>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => saveLinks(item.id)} disabled={isPending}>Salva</Button>
                      <Button size="sm" variant="outline" onClick={() => setExpandedId(null)}>Annulla</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Sezione telaio (con link serie) ─────────────────────────

interface SezioneTelaioProps {
  items: RilievoOpzione[]
  serie: RilievoOpzione[]
  onAdd: (tipo: TipoOpzione, valore: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggle: (id: string, attiva: boolean) => Promise<void>
  onUpdateStrutture: (id: string, serie_collegate: string[]) => Promise<void>
}

function SezioneTelaioOpzioni({
  items, serie, onAdd, onDelete, onToggle, onUpdateStrutture,
}: SezioneTelaioProps) {
  const [adding, setAdding]             = useState(false)
  const [nuovoValore, setNuovo]         = useState('')
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [pendingLinks, setPendingLinks] = useState<Record<string, string[]>>({})
  const [isPending, start]              = useTransition()

  const handleAdd = () => {
    const v = nuovoValore.trim()
    if (!v) return
    start(async () => {
      try { await onAdd('telaio', v); setNuovo(''); setAdding(false); toast.success('Tipo telaio aggiunto') }
      catch { toast.error('Errore aggiunta') }
    })
  }

  const toggleExpand = (id: string, current: string[]) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setPendingLinks((prev) => ({ ...prev, [id]: current }))
  }

  const toggleLink = (telaioId: string, serieId: string) => {
    setPendingLinks((prev) => {
      const curr = prev[telaioId] ?? []
      return { ...prev, [telaioId]: curr.includes(serieId) ? curr.filter((x) => x !== serieId) : [...curr, serieId] }
    })
  }

  const saveLinks = (id: string) => {
    const links = pendingLinks[id] ?? []
    start(async () => {
      try { await onUpdateStrutture(id, links); setExpandedId(null); toast.success('Serie aggiornate') }
      catch { toast.error('Errore salvataggio') }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding || isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <Input autoFocus placeholder="Tipo telaio (es. Battente, Ribalta, Fisso…)" value={nuovoValore}
            onChange={(e) => setNuovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNuovo('') } }}
            className="h-8 text-sm" />
          <button onClick={handleAdd} disabled={!nuovoValore.trim() || isPending}
            className="p-1.5 rounded-md text-white bg-primary hover:bg-primary/90 disabled:opacity-50">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setAdding(false); setNuovo('') }}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {items.length === 0 && !adding ? (
        <p className="text-sm text-gray-400 py-4 text-center">Nessun tipo telaio. Clicca <strong>Aggiungi</strong> per iniziare.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const isExp      = expandedId === item.id
            const links      = isExp ? (pendingLinks[item.id] ?? item.strutture_collegate) : item.strutture_collegate
            const linkedNomi = serie.filter((s) => item.strutture_collegate.includes(s.id)).map((s) => s.valore)

            return (
              <div key={item.id} className={`rounded-lg border transition-opacity ${item.attiva ? 'bg-white' : 'opacity-50 bg-gray-50'}`}>
                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-gray-800">{item.valore}</span>
                  {linkedNomi.length > 0 && !isExp && (
                    <div className="flex gap-1 flex-wrap max-w-[160px]">
                      {linkedNomi.map((n) => (
                        <span key={n} className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">{n}</span>
                      ))}
                    </div>
                  )}
                  {linkedNomi.length === 0 && !isExp && serie.length > 0 && (
                    <span className="text-[10px] text-gray-400">tutte le serie</span>
                  )}
                  {!item.attiva && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inattiva</span>}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {serie.length > 0 && (
                      <button onClick={() => toggleExpand(item.id, item.strutture_collegate)}
                        title="Collega serie profilo" disabled={isPending}
                        className="p-1.5 rounded-md text-gray-400 hover:text-teal-600 hover:bg-teal-50 flex items-center gap-0.5">
                        <Link2 className="h-3.5 w-3.5" />
                        {isExp ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                      </button>
                    )}
                    <button onClick={() => start(async () => { try { await onToggle(item.id, item.attiva) } catch { toast.error('Errore') } })}
                      disabled={isPending} title={item.attiva ? 'Disattiva' : 'Attiva'}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      {item.attiva ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { if (!confirm('Eliminare?')) return; start(async () => { try { await onDelete(item.id); toast.success('Eliminato') } catch { toast.error('Errore') } }) }}
                      disabled={isPending} title="Elimina"
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t bg-gray-50 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Serie profilo compatibili — vuoto = valido per tutte</p>
                    <div className="flex flex-wrap gap-2">
                      {serie.map((s) => {
                        const checked = links.includes(s.id)
                        return (
                          <label key={s.id}
                            className={`flex items-center gap-1.5 cursor-pointer rounded-md border px-2.5 py-1 text-sm select-none transition-colors ${checked ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                            <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleLink(item.id, s.id)} />
                            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-teal-600 border-teal-600' : 'border-gray-300'}`}>
                              {checked && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            {s.valore}
                          </label>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => saveLinks(item.id)} disabled={isPending}>Salva</Button>
                      <Button size="sm" variant="outline" onClick={() => setExpandedId(null)}>Annulla</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Componente principale ────────────────────────────────────

export default function ImpostazioniOpzioniVeloce({ opzioni: opzioniInit }: Props) {
  const [opzioni, setOpzioni]       = useState(opzioniInit)
  const [activeType, setActiveType] = useState<string | null>(null)
  const { blocchi, updateColore, reorder, getColore } = useRilievoUiBlocchi()

  // Sincronizza solo se arrivano props freschi dall'esterno (navigazione)
  useEffect(() => { setOpzioni(opzioniInit) }, [opzioniInit])

  const byTipo = (tipo: string) => opzioni.filter((o) => o.tipo === tipo)

  const handleAdd = async (tipo: TipoOpzione, valore: string) => {
    // upsertOpzione restituisce l'item con UUID reale → no tmp-ID, no router.refresh()
    const newItem = await upsertOpzione(tipo, valore)
    if (newItem) {
      setOpzioni((prev) => [...prev, newItem])
    }
  }

  const handleDelete = async (id: string) => {
    await deleteOpzione(id)
    setOpzioni((prev) => prev.filter((o) => o.id !== id))
  }

  const handleToggle = async (id: string, attiva: boolean) => {
    await toggleOpzioneAttiva(id, !attiva)
    setOpzioni((prev) => prev.map((o) => o.id === id ? { ...o, attiva: !attiva } : o))
  }

  const handleUpdateStrutture = async (id: string, strutture_collegate: string[]) => {
    await updateStruttureSerie(id, strutture_collegate)
    setOpzioni((prev) => prev.map((o) => o.id === id ? { ...o, strutture_collegate } : o))
  }

  // ── DnD ────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = blocchi.findIndex((b) => b.tipo === active.id)
    const newIdx = blocchi.findIndex((b) => b.tipo === over.id)
    if (oldIdx !== -1 && newIdx !== -1) reorder(oldIdx, newIdx)
  }

  // ── Vista dettaglio ────────────────────────────────────────
  if (activeType) {
    const blocco    = blocchi.find((b) => b.tipo === activeType)
    const colore    = getColore(activeType)
    const items     = byTipo(activeType)
    const strutture = byTipo('struttura')

    return (
      <div className="space-y-4">
        {/* Header dettaglio */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveType(null)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full shrink-0" style={{ background: colore }} />
            <span className="text-sm font-semibold text-gray-800">{blocco?.label}</span>
            <span className="text-xs text-gray-400">{items.length} {items.length === 1 ? 'voce' : 'voci'}</span>
          </div>
        </div>

        {/* Contenuto sezione */}
        {activeType === 'serie' ? (
          <SezioneSerieOpzioni
            items={items} strutture={strutture}
            onAdd={handleAdd} onDelete={handleDelete}
            onToggle={handleToggle} onUpdateStrutture={handleUpdateStrutture}
          />
        ) : activeType === 'telaio' ? (
          <SezioneTelaioOpzioni
            items={items} serie={byTipo('serie')}
            onAdd={handleAdd} onDelete={handleDelete}
            onToggle={handleToggle} onUpdateStrutture={handleUpdateStrutture}
          />
        ) : (
          <SezioneOpzioni
            tipo={activeType as TipoOpzione} items={items}
            onAdd={handleAdd} onDelete={handleDelete} onToggle={handleToggle}
          />
        )}
      </div>
    )
  }

  // ── Vista griglia ──────────────────────────────────────────
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocchi.map((b) => b.tipo)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {blocchi.map((blocco) => (
            <BloccoCard
              key={blocco.tipo}
              id={blocco.tipo}
              tipo={blocco.tipo}
              label={blocco.label}
              colore={blocco.colore}
              count={byTipo(blocco.tipo).filter((o) => o.attiva).length}
              onClick={() => setActiveType(blocco.tipo)}
              onColorChange={(c) => updateColore(blocco.tipo, c)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
