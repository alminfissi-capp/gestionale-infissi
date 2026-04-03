'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteRilievoVeloce } from '@/actions/rilievo-veloce'
import { toast } from 'sonner'
import type { RilievoVeloce } from '@/types/rilievo-veloce'

interface Props {
  rilievi: RilievoVeloce[]
}

function nomeCliente(r: RilievoVeloce): string {
  const s = r.cliente_snapshot
  if (s.tipo === 'azienda') return s.ragione_sociale || '—'
  return [s.nome, s.cognome].filter(Boolean).join(' ') || '—'
}

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function RilievoVeloceList({ rilievi: rilieviInit }: Props) {
  const router = useRouter()
  const [rilievi, setRilievi] = useState(rilieviInit)
  const [isPending, startTransition] = useTransition()

  const handleDelete = (r: RilievoVeloce) => {
    if (!confirm(`Eliminare il rilievo di "${nomeCliente(r)}"?`)) return
    startTransition(async () => {
      try {
        await deleteRilievoVeloce(r.id)
        setRilievi((prev) => prev.filter((x) => x.id !== r.id))
        toast.success('Rilievo eliminato')
      } catch {
        toast.error('Errore eliminazione')
      }
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rilievo veloce</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rilievi misure serramenti</p>
        </div>
        <Button asChild>
          <Link href="/rilievo/veloce/nuovo">
            <Plus className="h-4 w-4 mr-1" /> Nuovo rilievo
          </Link>
        </Button>
      </div>

      {rilievi.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 select-none">
          <FileText className="h-10 w-10 mb-3 text-gray-200" />
          <p className="text-sm font-medium">Nessun rilievo ancora</p>
          <p className="text-xs mt-1">Clicca <strong>Nuovo rilievo</strong> per iniziare a rilevare</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rilievi.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm hover:shadow transition-shadow"
            >
              <Link href={`/rilievo/veloce/${r.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{nomeCliente(r)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatData(r.created_at)}
                    {r.cliente_snapshot.cantiere ? ` · Cantiere: ${r.cliente_snapshot.cantiere}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </Link>
              <button
                onClick={() => handleDelete(r)}
                disabled={isPending}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                title="Elimina"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
