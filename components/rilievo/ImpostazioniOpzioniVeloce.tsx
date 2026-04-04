'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Eye, EyeOff, Check, X, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  upsertOpzione,
  deleteOpzione,
  toggleOpzioneAttiva,
  updateStruttureSerie,
} from '@/actions/rilievo-veloce'
import { toast } from 'sonner'
import type { RilievoOpzione, TipoOpzione } from '@/types/rilievo-veloce'

interface Props {
  opzioni: RilievoOpzione[]
}

// ─── Sezioni semplici ─────────────────────────────────────────

const TIPI_SEMPLICI: { tipo: TipoOpzione; label: string }[] = [
  { tipo: 'struttura', label: 'Strutture serramento' },
  { tipo: 'accessorio', label: 'Finitura / Accessori' },
  { tipo: 'colore',     label: 'Colori' },
  { tipo: 'vetro',      label: 'Tipologie vetro' },
  { tipo: 'serratura',  label: 'Tipi serratura' },
]

interface SezioneProps {
  tipo: TipoOpzione
  label: string
  items: RilievoOpzione[]
  onAdd: (tipo: TipoOpzione, valore: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggle: (id: string, attiva: boolean) => Promise<void>
}

function SezioneOpzioni({ tipo, label, items, onAdd, onDelete, onToggle }: SezioneProps) {
  const [adding, setAdding]       = useState(false)
  const [nuovoValore, setNuovo]   = useState('')
  const [isPending, start]        = useTransition()

  const handleAdd = () => {
    const v = nuovoValore.trim()
    if (!v) return
    start(async () => {
      try {
        await onAdd(tipo, v)
        setNuovo(''); setAdding(false)
        toast.success('Opzione aggiunta')
      } catch { toast.error('Errore aggiunta') }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
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
        <p className="text-xs text-gray-400 py-2">Nessuna opzione configurata.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-opacity ${item.attiva ? '' : 'opacity-50'}`}>
              <span className="flex-1 truncate text-gray-800">{item.valore}</span>
              {!item.attiva && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inattiva</span>}
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => { start(async () => { try { await onToggle(item.id, item.attiva) } catch { toast.error('Errore') } }) }}
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
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sezione Serie (con collegamento strutture) ───────────────

interface SezioneSeriePros {
  items: RilievoOpzione[]
  strutture: RilievoOpzione[]
  onAdd: (tipo: TipoOpzione, valore: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggle: (id: string, attiva: boolean) => Promise<void>
  onUpdateStrutture: (id: string, strutture_collegate: string[]) => Promise<void>
}

function SezioneSerieOpzioni({
  items, strutture,
  onAdd, onDelete, onToggle, onUpdateStrutture,
}: SezioneSeriePros) {
  const [adding, setAdding]                 = useState(false)
  const [nuovoValore, setNuovo]             = useState('')
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [pendingLinks, setPendingLinks]     = useState<Record<string, string[]>>({})
  const [isPending, start]                  = useTransition()

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
      return {
        ...prev,
        [serieId]: curr.includes(strutturaId) ? curr.filter((x) => x !== strutturaId) : [...curr, strutturaId],
      }
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Serie profili</h3>
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
        <p className="text-xs text-gray-400 py-2">Nessuna serie configurata.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const isExp     = expandedId === item.id
            const links     = isExp ? (pendingLinks[item.id] ?? item.strutture_collegate) : item.strutture_collegate
            const linkedNomi = strutture.filter((s) => item.strutture_collegate.includes(s.id)).map((s) => s.valore)

            return (
              <div key={item.id}
                className={`rounded-lg border transition-opacity ${item.attiva ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-gray-800">{item.valore}</span>

                  {/* Badge strutture collegate */}
                  {linkedNomi.length > 0 && !isExp && (
                    <div className="flex gap-1 flex-wrap max-w-[160px]">
                      {linkedNomi.map((n) => (
                        <span key={n} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {linkedNomi.length === 0 && !isExp && strutture.length > 0 && (
                    <span className="text-[10px] text-gray-400">tutte le strutture</span>
                  )}

                  {!item.attiva && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inattiva</span>}

                  <div className="flex items-center gap-0.5 shrink-0">
                    {strutture.length > 0 && (
                      <button onClick={() => toggleExpand(item.id, item.strutture_collegate)}
                        title="Collega strutture" disabled={isPending}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                        <Link2 className="h-3.5 w-3.5" />
                        {isExp ? <ChevronUp className="h-2.5 w-2.5 inline ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 inline ml-0.5" />}
                      </button>
                    )}
                    <button onClick={() => { start(async () => { try { await onToggle(item.id, item.attiva) } catch { toast.error('Errore') } }) }}
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

                {/* Panel collegamento strutture */}
                {isExp && (
                  <div className="border-t bg-gray-50 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">
                      Strutture compatibili — lascia tutto deselezionato per mostrare questa serie con qualsiasi struttura.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {strutture.map((s) => {
                        const checked = links.includes(s.id)
                        return (
                          <label key={s.id}
                            className={`flex items-center gap-1.5 cursor-pointer rounded-md border px-2.5 py-1 text-sm select-none transition-colors ${checked ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                            <input type="checkbox" className="sr-only" checked={checked}
                              onChange={() => toggleLink(item.id, s.id)} />
                            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                              {checked && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            {s.valore}
                          </label>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => saveLinks(item.id)} disabled={isPending}>
                        Salva
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setExpandedId(null)}>
                        Annulla
                      </Button>
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
  const router  = useRouter()
  const [opzioni, setOpzioni] = useState(opzioniInit)

  const byTipo = (tipo: TipoOpzione) => opzioni.filter((o) => o.tipo === tipo)

  const handleAdd = async (tipo: TipoOpzione, valore: string) => {
    await upsertOpzione(tipo, valore)
    router.refresh()
    setOpzioni((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        organization_id: '',
        tipo,
        valore,
        ordine: prev.filter((o) => o.tipo === tipo).length,
        attiva: true,
        strutture_collegate: [],
        created_at: new Date().toISOString(),
      },
    ])
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

  return (
    <div className="space-y-8">
      {TIPI_SEMPLICI.map(({ tipo, label }) => (
        <SezioneOpzioni
          key={tipo} tipo={tipo} label={label}
          items={byTipo(tipo)}
          onAdd={handleAdd} onDelete={handleDelete} onToggle={handleToggle}
        />
      ))}

      <SezioneSerieOpzioni
        items={byTipo('serie')}
        strutture={byTipo('struttura')}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onToggle={handleToggle}
        onUpdateStrutture={handleUpdateStrutture}
      />
    </div>
  )
}
