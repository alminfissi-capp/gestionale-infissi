'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Calculator, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FormaSerramentoDb } from '@/types/rilievo'
import { shapeToPath } from '@/types/rilievo'
import {
  extractCampiRilievo,
  evaluaFormule,
  calcolaRaggi,
  tuttiInputCompilati,
} from '@/lib/rilievo'

const TIPO_ARCO_FORMULA: Record<string, string> = {
  acuto:       'R = (L² + 4V²) / (4L)',
  tutto_sesto: 'R = (L² + 4F²) / (8F)',
  ribassato:   'R = (L² + 4F²) / (8F)',
  rialzato:    'R = (L² + 4F²) / (8F)',
  libero:      'R = (L² + 4F²) / (8F)',
}

interface Props {
  open: boolean
  forma: FormaSerramentoDb | null
  onClose: () => void
  onConferma: (forma: FormaSerramentoDb, valori: Record<string, number>, note: string, nomeVano: string) => void
}

export default function DialogMisure({ open, forma, onClose, onConferma }: Props) {
  const [inputValori, setInputValori] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [nomeVano, setNomeVano] = useState('')

  // Reset quando cambia la forma
  useEffect(() => {
    setInputValori({})
    setNote('')
    setNomeVano('')
  }, [forma?.id])

  const campi = useMemo(
    () => (forma ? extractCampiRilievo(forma.shape) : []),
    [forma]
  )

  // Valori numerici dagli input + formule calcolate
  const valoriNumerici = useMemo<Record<string, number>>(() => {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(inputValori)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0) parsed[k] = n
    }
    return forma ? evaluaFormule(forma.shape, parsed) : parsed
  }, [inputValori, forma])

  const raggi = useMemo(
    () => (forma ? calcolaRaggi(forma.shape, valoriNumerici) : []),
    [forma, valoriNumerici]
  )

  const isCompleto = useMemo(
    () => forma ? tuttiInputCompilati(forma.shape, valoriNumerici) : false,
    [forma, valoriNumerici]
  )

  const shapePath = forma ? shapeToPath(forma.shape, 120) : null

  if (!open || !forma) return null

  const handleConferma = () => {
    if (!isCompleto) return
    onConferma(forma, valoriNumerici, note, nomeVano)
  }

  const campiInput = campi.filter((c) => c.tipoMisura === 'input')
  const campiCalcolati = campi.filter((c) => c.tipoMisura === 'calcolato')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[96vh] flex flex-col sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:rounded-2xl sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div>
            <p className="text-base font-semibold text-gray-900">Inserisci misure</p>
            <p className="text-xs text-gray-500 mt-0.5">{forma.nome}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Anteprima forma */}
          {shapePath && (
            <div className="flex justify-center">
              <svg viewBox="0 0 120 120" className="w-28 h-28 text-teal-600">
                <path d={shapePath} fill="#ccf2f0" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
          )}

          {/* Nome vano (opzionale) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Descrizione vano <span className="text-gray-400 font-normal">(opzionale)</span>
            </label>
            <input
              type="text"
              value={nomeVano}
              onChange={(e) => setNomeVano(e.target.value)}
              placeholder="es. Camera letto – finestra sx"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Nessun campo configurato */}
          {campi.length === 0 && (
            <div className="text-center py-6 text-gray-400 text-sm">
              <Ruler className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nessuna misura configurata per questa forma.</p>
              <p className="text-xs mt-1">Apri le impostazioni e configura le misure dei lati.</p>
            </div>
          )}

          {/* Campi da rilevare (input) */}
          {campiInput.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-teal-600 shrink-0" />
                <p className="text-sm font-semibold text-gray-800">Da rilevare</p>
              </div>
              {campiInput.map((campo) => {
                const val = inputValori[campo.nome] ?? ''
                const isEmpty = val === '' || val === undefined
                return (
                  <div key={`${campo.segmentoId}-${campo.tipo}`}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {campo.nome}
                      {campo.tipo === 'freccia' && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                          {campo.tipoArco === 'acuto' ? 'altezza vertice' : 'freccia arco'}
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={val}
                        onChange={(e) =>
                          setInputValori((prev) => ({ ...prev, [campo.nome]: e.target.value }))
                        }
                        placeholder="0"
                        min={0}
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                          isEmpty ? 'border-gray-300' : 'border-teal-400 bg-teal-50/30'
                        }`}
                      />
                      <span className="text-xs text-gray-400 w-8">mm</span>
                    </div>
                    {/* Hint formula raggio per archi */}
                    {campo.tipo === 'freccia' && campo.tipoArco && (
                      <p className="text-[10px] text-orange-600 mt-0.5 ml-0.5">
                        {TIPO_ARCO_FORMULA[campo.tipoArco]}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Valori calcolati */}
          {campiCalcolati.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600 shrink-0" />
                <p className="text-sm font-semibold text-gray-800">Calcolati automaticamente</p>
              </div>
              <div className="bg-blue-50 rounded-xl border border-blue-100 divide-y divide-blue-100">
                {campiCalcolati.map((campo) => {
                  const val = valoriNumerici[campo.nome]
                  return (
                    <div
                      key={`${campo.segmentoId}-${campo.tipo}`}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{campo.nome}</p>
                        <p className="text-[10px] text-blue-500 font-mono">{campo.formula}</p>
                      </div>
                      <span className={`text-sm font-semibold ${val !== undefined ? 'text-blue-700' : 'text-gray-300'}`}>
                        {val !== undefined ? `${val} mm` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Raggi archi calcolati */}
          {raggi.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
                Raggi archi
              </p>
              <div className="bg-orange-50 rounded-xl border border-orange-100 divide-y divide-orange-100">
                {raggi.map((r) => (
                  <div key={r.segmentoId} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          R — {r.nomeCorda}
                          {r.tipoArco === 'acuto' && (
                            <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">gotico</span>
                          )}
                        </p>
                        <p className="text-[10px] text-orange-600">
                          L={r.corda} · {r.tipoArco === 'acuto' ? 'V' : 'F'}={r.freccia} mm
                        </p>
                      </div>
                      <span className="text-base font-bold text-orange-700">{r.R} mm</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(opzionale)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="es. Finestra con anta rotta, rilevare con cautela"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-3 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={handleConferma}
            disabled={campi.length > 0 && !isCompleto}
            title={!isCompleto ? 'Compila tutte le misure da rilevare' : ''}
          >
            Aggiungi vano
          </Button>
        </div>
      </div>
    </>
  )
}
