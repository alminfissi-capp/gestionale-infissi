'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SelettoreForma from '@/components/rilievo/SelettoreForma'
import DialogMisure from '@/components/rilievo/DialogMisure'
import CanvasVano from '@/components/rilievo/CanvasVano'
import DisegnaForma from '@/components/rilievo/DisegnaForma'
import type { FormaSerramentoDb } from '@/types/rilievo'
import { shapeToPath } from '@/types/rilievo'
import type { VanoMisurato } from '@/lib/rilievo'

interface Props {
  forme: FormaSerramentoDb[]
}

function ShapeThumb({ forma }: { forma: FormaSerramentoDb }) {
  const d = shapeToPath(forma.shape, 28)
  if (!d) return <div className="w-7 h-7 bg-gray-100 rounded shrink-0" />
  return (
    <svg viewBox="0 0 28 28" className="w-7 h-7 text-teal-600 shrink-0">
      <path d={d} fill="#ccf2f0" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function VaniRilievo({ forme }: Props) {
  const [vani, setVani] = useState<VanoMisurato[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selettoreAperto, setSelettoreAperto] = useState(false)
  const [disegnoAperto, setDisegnoAperto] = useState(false)
  const [formaDaMisurare, setFormaDaMisurare] = useState<FormaSerramentoDb | null>(null)

  const selectedVano = vani.find((v) => v.id === selectedId) ?? vani[vani.length - 1] ?? null

  const handleFormaSelezionata = (forma: FormaSerramentoDb) => {
    setSelettoreAperto(false)
    setFormaDaMisurare(forma)
  }

  const handleMisureConfermate = (
    forma: FormaSerramentoDb,
    valori: Record<string, number>,
    note: string,
    nomeVano: string
  ) => {
    const newVano: VanoMisurato = { id: crypto.randomUUID(), nome: nomeVano, forma, valori, note }
    setVani((prev) => [...prev, newVano])
    setSelectedId(newVano.id)
    setFormaDaMisurare(null)
  }

  const handleDelete = (id: string) => {
    setVani((prev) => {
      const next = prev.filter((v) => v.id !== id)
      if (selectedId === id) setSelectedId(next[next.length - 1]?.id ?? null)
      return next
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bg-white shrink-0">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/rilievo/nuovo">
            <ChevronLeft className="h-4 w-4" />
            Indietro
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Vani del cantiere</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {vani.length === 0
                ? 'Aggiungi i vani da rilevare'
                : `${vani.length} vano${vani.length !== 1 ? 'i' : ''} rilevato${vani.length !== 1 ? 'i' : ''}`}
            </p>
          </div>
          {vani.length > 0 && (
            <Button size="sm" disabled>
              Salva rilievo
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar vani (scroll orizzontale) */}
      {vani.length > 0 && (
        <div className="shrink-0 bg-white border-b px-3 py-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {vani.map((v, i) => {
              const isSelected = selectedVano?.id === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`flex items-center gap-1.5 shrink-0 pl-2 pr-1 py-1.5 rounded-xl border text-sm transition-all ${
                    isSelected
                      ? 'bg-teal-50 border-teal-400 text-teal-800 font-medium'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <ShapeThumb forma={v.forma} />
                  <span className="max-w-[90px] truncate text-xs">
                    {v.nome || v.forma.nome}
                  </span>
                  <span className="text-[10px] text-gray-400 font-normal">#{i + 1}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(v.id) }}
                    className="p-0.5 ml-0.5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    title="Rimuovi vano"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Area principale: canvas vano o empty state */}
      <div className="flex-1 overflow-hidden">
        {selectedVano ? (
          <CanvasVano key={selectedVano.id} vano={selectedVano} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none gap-2">
            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center">
              <Plus className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm">Nessun serramento aggiunto.</p>
            <p className="text-xs">Usa il tasto <strong className="text-gray-500">+</strong> in basso per iniziare.</p>
          </div>
        )}
      </div>

      {/* FAB aggiungi vano */}
      <div className="shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-3 flex items-center justify-center">
        <button
          onClick={() => setSelettoreAperto(true)}
          className="flex items-center justify-center w-12 h-12 rounded-xl border-2 border-gray-400 bg-white text-gray-600 hover:border-teal-500 hover:text-teal-600 hover:bg-teal-50 active:scale-95 transition-all shadow-sm"
          title="Aggiungi serramento"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* Dialogs */}
      <SelettoreForma
        open={selettoreAperto}
        onClose={() => setSelettoreAperto(false)}
        onSelect={handleFormaSelezionata}
        onDraw={() => setDisegnoAperto(true)}
        forme={forme}
      />
      <DisegnaForma
        key={String(disegnoAperto)}
        open={disegnoAperto}
        onClose={() => setDisegnoAperto(false)}
        onConferma={handleFormaSelezionata}
      />
      <DialogMisure
        key={formaDaMisurare?.id ?? 'none'}
        open={!!formaDaMisurare}
        forma={formaDaMisurare}
        onClose={() => setFormaDaMisurare(null)}
        onConferma={handleMisureConfermate}
      />
    </div>
  )
}
