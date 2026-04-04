'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Eye, EyeOff, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  upsertOpzione,
  deleteOpzione,
  toggleOpzioneAttiva,
} from '@/actions/rilievo-veloce'
import { toast } from 'sonner'
import type { RilievoOpzione, TipoOpzione } from '@/types/rilievo-veloce'

interface Props {
  opzioni: RilievoOpzione[]
}

const TIPI: { tipo: TipoOpzione; label: string }[] = [
  { tipo: 'serie',      label: 'Serie profili' },
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
  const [adding, setAdding] = useState(false)
  const [nuovoValore, setNuovoValore] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleAdd = () => {
    const v = nuovoValore.trim()
    if (!v) return
    startTransition(async () => {
      try {
        await onAdd(tipo, v)
        setNuovoValore('')
        setAdding(false)
        toast.success('Opzione aggiunta')
      } catch {
        toast.error('Errore aggiunta opzione')
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Eliminare questa opzione?')) return
    startTransition(async () => {
      try {
        await onDelete(id)
        toast.success('Opzione eliminata')
      } catch {
        toast.error('Errore eliminazione')
      }
    })
  }

  const handleToggle = (id: string, attiva: boolean) => {
    startTransition(async () => {
      try {
        await onToggle(id, !attiva)
      } catch {
        toast.error('Errore aggiornamento')
      }
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

      {/* Form aggiunta inline */}
      {adding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="Nuovo valore…"
            value={nuovoValore}
            onChange={(e) => setNuovoValore(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAdding(false); setNuovoValore('') }
            }}
            className="h-8 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={!nuovoValore.trim() || isPending}
            className="p-1.5 rounded-md text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setAdding(false); setNuovoValore('') }}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {items.length === 0 && !adding ? (
        <p className="text-xs text-gray-400 py-2">Nessuna opzione configurata.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-opacity ${item.attiva ? '' : 'opacity-50'}`}
            >
              <span className="flex-1 truncate text-gray-800">{item.valore}</span>
              {!item.attiva && (
                <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inattiva</span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleToggle(item.id, item.attiva)}
                  disabled={isPending}
                  title={item.attiva ? 'Disattiva' : 'Attiva'}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {item.attiva ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={isPending}
                  title="Elimina"
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
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

export default function ImpostazioniOpzioniVeloce({ opzioni: opzioniInit }: Props) {
  const router = useRouter()
  const [opzioni, setOpzioni] = useState(opzioniInit)

  const byTipo = (tipo: TipoOpzione) => opzioni.filter((o) => o.tipo === tipo)

  const handleAdd = async (tipo: TipoOpzione, valore: string) => {
    await upsertOpzione(tipo, valore)
    router.refresh()
    // ottimistico: aggiunge temporaneamente
    setOpzioni((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        organization_id: '',
        tipo,
        valore,
        ordine: prev.filter((o) => o.tipo === tipo).length,
        attiva: true,
        created_at: new Date().toISOString(),
      },
    ])
  }

  const handleDelete = async (id: string) => {
    await deleteOpzione(id)
    setOpzioni((prev) => prev.filter((o) => o.id !== id))
  }

  const handleToggle = async (id: string, attiva: boolean) => {
    await toggleOpzioneAttiva(id, attiva)
    setOpzioni((prev) => prev.map((o) => o.id === id ? { ...o, attiva } : o))
  }

  return (
    <div className="space-y-8">
      {TIPI.map(({ tipo, label }) => (
        <SezioneOpzioni
          key={tipo}
          tipo={tipo}
          label={label}
          items={byTipo(tipo)}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onToggle={handleToggle}
        />
      ))}
    </div>
  )
}
