'use client'

import { useState, useTransition } from 'react'
import { X, Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FORME, type FormaSerramento } from '@/components/rilievo/SelettoreForma'
import type {
  FormaSerramentoCompleta,
  FormaSerramentoInput,
  MisuraInput,
  AngoloInput,
  SvgTemplate,
} from '@/types/rilievo'
import { createForma, updateForma } from '@/actions/rilievo'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  forma?: FormaSerramentoCompleta
  maxOrdine: number
}

function newMisura(ordine: number): MisuraInput {
  return { codice: '', nome: '', tipo: 'input', formula: null, unita: 'mm', ordine }
}
function newAngolo(ordine: number): AngoloInput {
  return { nome: '', tipo: 'libero', gradi: null, ordine }
}

export default function DialogForma({ open, onClose, forma, maxOrdine }: Props) {
  const isEdit = !!forma

  const [nome, setNome] = useState(forma?.nome ?? '')
  const [svgTemplate, setSvgTemplate] = useState<SvgTemplate>(forma?.svg_template ?? 'rettangolo')
  const [attiva, setAttiva] = useState(forma?.attiva ?? true)
  const [misure, setMisure] = useState<MisuraInput[]>(
    forma?.misure.map((m) => ({
      codice: m.codice,
      nome: m.nome,
      tipo: m.tipo,
      formula: m.formula,
      unita: m.unita,
      ordine: m.ordine,
    })) ?? [newMisura(0), newMisura(1)]
  )
  const [angoli, setAngoli] = useState<AngoloInput[]>(
    forma?.angoli.map((a) => ({
      nome: a.nome,
      tipo: a.tipo,
      gradi: a.gradi,
      ordine: a.ordine,
    })) ?? []
  )
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  const addMisura = () => setMisure((prev) => [...prev, newMisura(prev.length)])
  const removeMisura = (i: number) =>
    setMisure((prev) => prev.filter((_, idx) => idx !== i).map((m, idx) => ({ ...m, ordine: idx })))
  const updateMisura = (i: number, patch: Partial<MisuraInput>) =>
    setMisure((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))

  const addAngolo = () => setAngoli((prev) => [...prev, newAngolo(prev.length)])
  const removeAngolo = (i: number) =>
    setAngoli((prev) => prev.filter((_, idx) => idx !== i).map((a, idx) => ({ ...a, ordine: idx })))
  const updateAngolo = (i: number, patch: Partial<AngoloInput>) =>
    setAngoli((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))

  const canSave = nome.trim().length > 0 && misure.every((m) => m.codice.trim() && m.nome.trim())

  const handleSave = () => {
    if (!canSave) return
    const input: FormaSerramentoInput = {
      nome: nome.trim(),
      svg_template: svgTemplate,
      attiva,
      ordine: forma?.ordine ?? maxOrdine,
      misure: misure.map((m, i) => ({
        ...m,
        codice: m.codice.trim(),
        nome: m.nome.trim(),
        formula: m.tipo === 'calcolato' ? (m.formula?.trim() || null) : null,
        ordine: i,
      })),
      angoli: angoli.map((a, i) => ({
        ...a,
        nome: a.nome.trim(),
        gradi: a.tipo === 'fisso' ? (a.gradi ?? null) : null,
        ordine: i,
      })),
    }
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateForma(forma.id, input)
          toast.success('Forma aggiornata')
        } else {
          await createForma(input)
          toast.success('Forma creata')
        }
        onClose()
      } catch {
        toast.error('Errore nel salvataggio')
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <p className="text-base font-semibold text-gray-900">
            {isEdit ? 'Modifica forma' : 'Nuova forma'}
          </p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">

          {/* Nome + Stato */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome forma</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. Rettangolo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stato</label>
              <button
                type="button"
                onClick={() => setAttiva((v) => !v)}
                className={`mt-0.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  attiva
                    ? 'bg-teal-50 border-teal-300 text-teal-700'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`}
              >
                {attiva ? 'Attiva' : 'Inattiva'}
              </button>
            </div>
          </div>

          {/* Selettore SVG */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Icona / Template SVG</label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {FORME.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSvgTemplate(f.id as SvgTemplate)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                    svgTemplate === f.id
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-teal-300'
                  }`}
                >
                  <div className="w-9 h-9">{f.svg}</div>
                  <span className="text-[10px] leading-tight text-center font-medium line-clamp-2">
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Misure */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Misure (lati/dimensioni)</label>
              <button
                type="button"
                onClick={addMisura}
                className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Aggiungi
              </button>
            </div>
            <div className="space-y-2">
              {misure.map((m, i) => (
                <div key={i} className="flex gap-2 items-start bg-gray-50 rounded-lg p-2 border border-gray-200">
                  <GripVertical className="h-4 w-4 text-gray-300 mt-2 shrink-0" />
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <input
                      type="text"
                      placeholder="Cod. (es. L)"
                      value={m.codice}
                      onChange={(e) => updateMisura(i, { codice: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                      maxLength={4}
                    />
                    <input
                      type="text"
                      placeholder="Nome (es. Larghezza)"
                      value={m.nome}
                      onChange={(e) => updateMisura(i, { nome: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={m.tipo}
                        onChange={(e) => updateMisura(i, { tipo: e.target.value as 'input' | 'calcolato', formula: null })}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 flex-1"
                      >
                        <option value="input">Da rilevare</option>
                        <option value="calcolato">Calcolato</option>
                      </select>
                      <select
                        value={m.unita}
                        onChange={(e) => updateMisura(i, { unita: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 w-16"
                      >
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                    {m.tipo === 'calcolato' && (
                      <input
                        type="text"
                        placeholder="Formula (es. L / 2)"
                        value={m.formula ?? ''}
                        onChange={(e) => updateMisura(i, { formula: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMisura(i)}
                    className="mt-1.5 p-1 text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {misure.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Nessuna misura aggiunta</p>
              )}
            </div>
          </div>

          {/* Angoli */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Angoli</label>
              <button
                type="button"
                onClick={addAngolo}
                className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Aggiungi
              </button>
            </div>
            <div className="space-y-2">
              {angoli.map((a, i) => (
                <div key={i} className="flex gap-2 items-center bg-gray-50 rounded-lg p-2 border border-gray-200">
                  <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                  <input
                    type="text"
                    placeholder="Nome angolo (es. Angolo base)"
                    value={a.nome}
                    onChange={(e) => updateAngolo(i, { nome: e.target.value })}
                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <select
                    value={a.tipo}
                    onChange={(e) => updateAngolo(i, { tipo: e.target.value as 'fisso' | 'libero', gradi: null })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="libero">Da rilevare</option>
                    <option value="fisso">Fisso</option>
                  </select>
                  {a.tipo === 'fisso' && (
                    <input
                      type="number"
                      placeholder="°"
                      value={a.gradi ?? ''}
                      onChange={(e) => updateAngolo(i, { gradi: parseFloat(e.target.value) || null })}
                      className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAngolo(i)}
                    className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {angoli.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Nessun angolo da rilevare</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-3 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending}>
            {isPending ? 'Salvataggio...' : isEdit ? 'Aggiorna' : 'Crea forma'}
          </Button>
        </div>
      </div>
    </>
  )
}
