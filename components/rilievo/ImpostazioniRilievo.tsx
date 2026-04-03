'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, Pencil, Trash2, Eye, EyeOff, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DialogForma from '@/components/rilievo/DialogForma'
import DialogFormeStandard from '@/components/rilievo/DialogFormeStandard'
import ImpostazioniOpzioniVeloce from '@/components/rilievo/ImpostazioniOpzioniVeloce'
import type { FormaSerramentoDb } from '@/types/rilievo'
import { shapeToPath } from '@/types/rilievo'
import { deleteForma, toggleFormaAttiva } from '@/actions/rilievo'
import { toast } from 'sonner'
import type { RilievoOpzione } from '@/types/rilievo-veloce'

interface Props {
  forme: FormaSerramentoDb[]
  opzioniVeloce: RilievoOpzione[]
}

function ShapePreview({ forma }: { forma: FormaSerramentoDb }) {
  const d = shapeToPath(forma.shape, 60)
  if (!d) {
    return (
      <div className="w-10 h-10 flex items-center justify-center text-gray-300 text-xs">
        —
      </div>
    )
  }
  return (
    <svg viewBox="0 0 60 60" className="w-10 h-10 text-teal-600">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function ImpostazioniRilievo({ forme: formeInit, opzioniVeloce }: Props) {
  const router = useRouter()
  const [forme, setForme] = useState(formeInit)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FormaSerramentoDb | undefined>()
  const [isPending, startTransition] = useTransition()
  const [standardOpen, setStandardOpen] = useState(false)
  const [tab, setTab] = useState<'forme' | 'veloce'>('forme')

  const openNew = () => { setEditing(undefined); setDialogOpen(true) }
  const openEdit = (f: FormaSerramentoDb) => { setEditing(f); setDialogOpen(true) }

  const handleDelete = (f: FormaSerramentoDb) => {
    if (!confirm(`Eliminare la forma "${f.nome}"?`)) return
    startTransition(async () => {
      try {
        await deleteForma(f.id)
        setForme((prev) => prev.filter((x) => x.id !== f.id))
        toast.success('Forma eliminata')
      } catch {
        toast.error('Errore eliminazione')
      }
    })
  }

  const handleToggle = (f: FormaSerramentoDb) => {
    startTransition(async () => {
      try {
        await toggleFormaAttiva(f.id, !f.attiva)
        setForme((prev) => prev.map((x) => x.id === f.id ? { ...x, attiva: !x.attiva } : x))
      } catch {
        toast.error('Errore aggiornamento')
      }
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b bg-white">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/rilievo">
            <ChevronLeft className="h-4 w-4" />
            Rilievo misure
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Impostazioni rilievo</h1>
            <p className="text-sm text-gray-500 mt-0.5">Forme serramento e opzioni rilievo veloce</p>
          </div>
          {tab === 'forme' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStandardOpen(true)}>
                <Shapes className="h-4 w-4 mr-1" /> Forme standard
              </Button>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" /> Nuova forma
              </Button>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          <button
            onClick={() => setTab('forme')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'forme' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Forme serramento
          </button>
          <button
            onClick={() => setTab('veloce')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'veloce' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Rilievo veloce
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'veloce' ? (
          <ImpostazioniOpzioniVeloce opzioni={opzioniVeloce} />
        ) : null}
        {tab === 'forme' && (forme.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 select-none px-8">
            <p className="text-sm font-medium mb-1">Nessuna forma configurata</p>
            <p className="text-xs">Usa <strong>Nuova forma</strong> per disegnare la prima forma serramento.</p>
            <p className="text-xs mt-1 text-gray-300">Potrai disegnare lati retti o curvi, configurare le misure da rilevare e gli angoli.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {forme.map((f) => (
              <div
                key={f.id}
                className={`flex items-center gap-4 bg-white rounded-xl border px-4 py-3 shadow-sm transition-opacity ${f.attiva ? '' : 'opacity-50'}`}
              >
                <ShapePreview forma={f} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{f.nome}</p>
                    {!f.attiva && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">inattiva</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {f.shape.segmenti.length} lat{f.shape.segmenti.length === 1 ? 'o' : 'i'}
                    {' · '}
                    {f.shape.segmenti.filter((s) => s.misuraNome).length} misur{f.shape.segmenti.filter((s) => s.misuraNome).length === 1 ? 'a' : 'e'} configurate
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggle(f)} disabled={isPending} title={f.attiva ? 'Nascondi' : 'Mostra'}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    {f.attiva ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(f)} title="Modifica"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(f)} disabled={isPending} title="Elimina"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <DialogForma
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(undefined); router.refresh() }}
        forma={editing}
        maxOrdine={forme.length}
      />

      <DialogFormeStandard
        open={standardOpen}
        onClose={() => { setStandardOpen(false); router.refresh() }}
      />
    </div>
  )
}
