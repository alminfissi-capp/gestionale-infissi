'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FORME } from '@/components/rilievo/SelettoreForma'
import DialogForma from '@/components/rilievo/DialogForma'
import type { FormaSerramentoCompleta } from '@/types/rilievo'
import { deleteForma, toggleFormaAttiva } from '@/actions/rilievo'
import { toast } from 'sonner'

interface Props {
  forme: FormaSerramentoCompleta[]
}

export default function ImpostazioniRilievo({ forme: formeInit }: Props) {
  const [forme, setForme] = useState(formeInit)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FormaSerramentoCompleta | undefined>()
  const [isPending, startTransition] = useTransition()

  const openNew = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }
  const openEdit = (f: FormaSerramentoCompleta) => {
    setEditing(f)
    setDialogOpen(true)
  }

  const handleDelete = (f: FormaSerramentoCompleta) => {
    if (!confirm(`Eliminare la forma "${f.nome}"? L'operazione non è reversibile.`)) return
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

  const handleToggle = (f: FormaSerramentoCompleta) => {
    startTransition(async () => {
      try {
        await toggleFormaAttiva(f.id, !f.attiva)
        setForme((prev) => prev.map((x) => x.id === f.id ? { ...x, attiva: !x.attiva } : x))
      } catch {
        toast.error('Errore aggiornamento')
      }
    })
  }

  const maxOrdine = forme.length

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/rilievo">
            <ChevronLeft className="h-4 w-4" />
            Rilievo misure
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Forme serramento</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configura le tipologie di forma per il rilievo</p>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nuova forma
          </Button>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4">
        {forme.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
            <p className="text-sm">Nessuna forma configurata.</p>
            <p className="text-xs mt-1">Usa il tasto <strong>Nuova forma</strong> per iniziare.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {forme.map((f) => {
              const tmpl = FORME.find((x) => x.id === f.svg_template)
              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-4 bg-white rounded-xl border px-4 py-3 shadow-sm transition-opacity ${
                    f.attiva ? '' : 'opacity-50'
                  }`}
                >
                  {/* SVG preview */}
                  <div className="w-10 h-10 text-teal-600 shrink-0">
                    {tmpl?.svg ?? null}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{f.nome}</p>
                      {!f.attiva && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                          inattiva
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {f.misure.length} misur{f.misure.length === 1 ? 'a' : 'e'}
                      {f.angoli.length > 0 && ` · ${f.angoli.length} angol${f.angoli.length === 1 ? 'o' : 'i'}`}
                    </p>
                  </div>

                  {/* Azioni */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggle(f)}
                      disabled={isPending}
                      title={f.attiva ? 'Nascondi' : 'Mostra'}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                      {f.attiva ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => openEdit(f)}
                      title="Modifica"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(f)}
                      disabled={isPending}
                      title="Elimina"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <DialogForma
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setEditing(undefined)
        }}
        forma={editing}
        maxOrdine={maxOrdine}
      />
    </div>
  )
}
