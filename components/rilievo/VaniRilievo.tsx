'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SelettoreForma from '@/components/rilievo/SelettoreForma'
import DialogMisure from '@/components/rilievo/DialogMisure'
import type { FormaSerramentoDb } from '@/types/rilievo'
import { shapeToPath } from '@/types/rilievo'
import type { VanoMisurato } from '@/lib/rilievo'
import { extractCampiRilievo, calcolaRaggi } from '@/lib/rilievo'

interface Props {
  forme: FormaSerramentoDb[]
}

function ShapeThumb({ forma }: { forma: FormaSerramentoDb }) {
  const d = shapeToPath(forma.shape, 40)
  if (!d) return <div className="w-10 h-10 bg-gray-100 rounded" />
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10 text-teal-600 shrink-0">
      <path d={d} fill="#ccf2f0" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

function CardVano({
  vano,
  numero,
  onDelete,
}: {
  vano: VanoMisurato
  numero: number
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const campi = extractCampiRilievo(vano.forma.shape)
  const raggi = calcolaRaggi(vano.forma.shape, vano.valori)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header card */}
      <div className="flex items-center gap-3 px-4 py-3">
        <ShapeThumb forma={vano.forma} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-gray-400">#{numero}</span>
            <p className="text-sm font-semibold text-gray-800 truncate">
              {vano.nome || vano.forma.nome}
            </p>
          </div>
          {vano.nome && (
            <p className="text-xs text-gray-400 truncate">{vano.forma.nome}</p>
          )}
          {/* Sommario misure */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {campi.filter((c) => c.tipoMisura === 'input').map((c) => (
              <span key={c.nome} className="text-[11px] text-gray-600">
                <span className="text-gray-400">{c.nome}:</span>{' '}
                <span className="font-medium">{vano.valori[c.nome] ?? '—'} mm</span>
              </span>
            ))}
            {raggi.map((r) => (
              <span key={r.segmentoId} className="text-[11px] text-orange-600">
                R: <span className="font-medium">{r.R} mm</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Dettaglio espanso */}
      {expanded && (
        <div className="border-t bg-gray-50 px-4 py-3 space-y-3">
          {/* Tutte le misure */}
          {campi.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Misure</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {campi.map((c) => {
                  const val = vano.valori[c.nome]
                  return (
                    <div key={c.nome} className="flex items-center justify-between text-xs">
                      <span className={c.tipoMisura === 'calcolato' ? 'text-blue-600' : 'text-gray-600'}>
                        {c.nome}
                        {c.tipoMisura === 'calcolato' && (
                          <span className="ml-1 text-[9px] text-blue-400">(calc.)</span>
                        )}
                      </span>
                      <span className="font-semibold text-gray-800">
                        {val !== undefined ? `${val} mm` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Raggi archi */}
          {raggi.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Raggi archi</p>
              {raggi.map((r) => (
                <div key={r.segmentoId} className="flex items-center justify-between text-xs">
                  <span className="text-orange-600">
                    R ({r.nomeCorda}
                    {r.tipoArco === 'acuto' && <span className="ml-1 text-[9px] text-violet-600">gotico</span>})
                  </span>
                  <span className="font-bold text-orange-700">{r.R} mm</span>
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          {vano.note && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Note</p>
              <p className="text-xs text-gray-600">{vano.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function VaniRilievo({ forme }: Props) {
  const [vani, setVani] = useState<VanoMisurato[]>([])
  const [selettoreAperto, setSelettoreAperto] = useState(false)
  const [formaDaMisurare, setFormaDaMisurare] = useState<FormaSerramentoDb | null>(null)

  // Step 1: l'utente sceglie la forma dal selettore
  const handleFormaSelezionata = (forma: FormaSerramentoDb) => {
    setSelettoreAperto(false)
    setFormaDaMisurare(forma)
  }

  // Step 2: l'utente inserisce le misure nel dialog e conferma
  const handleMisureConfermate = (
    forma: FormaSerramentoDb,
    valori: Record<string, number>,
    note: string,
    nomeVano: string
  ) => {
    setVani((prev) => [
      ...prev,
      { id: crypto.randomUUID(), nome: nomeVano, forma, valori, note },
    ])
    setFormaDaMisurare(null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b bg-white">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
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
                : `${vani.length} serramento${vani.length > 1 ? 'i' : ''} rilevato${vani.length > 1 ? 'i' : ''}`}
            </p>
          </div>
          {vani.length > 0 && (
            <Button size="sm" disabled>
              Salva rilievo
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {vani.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
            <p className="text-sm">Nessun serramento aggiunto.</p>
            <p className="text-xs mt-1">Usa il tasto <strong>+</strong> in basso per iniziare.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {vani.map((v, i) => (
              <li key={v.id}>
                <CardVano
                  vano={v}
                  numero={i + 1}
                  onDelete={() => setVani((prev) => prev.filter((x) => x.id !== v.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FAB + */}
      <div className="shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-3 flex items-center justify-center">
        <button
          onClick={() => setSelettoreAperto(true)}
          className="flex items-center justify-center w-12 h-12 rounded-xl border-2 border-gray-400 bg-white text-gray-600 hover:border-teal-500 hover:text-teal-600 hover:bg-teal-50 active:scale-95 transition-all shadow-sm"
          title="Aggiungi serramento"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* Selettore forma */}
      <SelettoreForma
        open={selettoreAperto}
        onClose={() => setSelettoreAperto(false)}
        onSelect={handleFormaSelezionata}
        forme={forme}
      />

      {/* Dialog misure */}
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
