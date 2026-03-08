'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AccessorioGrigliaInput } from '@/actions/listini'

interface Props {
  initialAccessori: AccessorioGrigliaInput[]
  onChange: (accessori: AccessorioGrigliaInput[]) => void
}

type AccessorioState = {
  tempId: string
  nome: string
  tipo_prezzo: 'pezzo' | 'mq' | 'percentuale'
  prezzo: string
  prezzo_acquisto: string
  mq_minimo: string
}

type GruppoState = {
  tempId: string
  gruppo: string
  gruppo_tipo: 'multiplo' | 'unico'
  accessori: AccessorioState[]
}

function inputToGroups(accessori: AccessorioGrigliaInput[]): GruppoState[] {
  const map = new Map<string, GruppoState>()
  const order: string[] = []
  for (const a of accessori) {
    if (!map.has(a.gruppo)) {
      map.set(a.gruppo, {
        tempId: crypto.randomUUID(),
        gruppo: a.gruppo,
        gruppo_tipo: a.gruppo_tipo,
        accessori: [],
      })
      order.push(a.gruppo)
    }
    map.get(a.gruppo)!.accessori.push({
      tempId: crypto.randomUUID(),
      nome: a.nome,
      tipo_prezzo: a.tipo_prezzo,
      prezzo: a.prezzo.toString(),
      prezzo_acquisto: a.prezzo_acquisto.toString(),
      mq_minimo: a.mq_minimo?.toString() ?? '',
    })
  }
  return order.map((g) => map.get(g)!)
}

function groupsToInput(groups: GruppoState[]): AccessorioGrigliaInput[] {
  const result: AccessorioGrigliaInput[] = []
  for (const g of groups) {
    for (const a of g.accessori) {
      result.push({
        gruppo: g.gruppo,
        gruppo_tipo: g.gruppo_tipo,
        nome: a.nome,
        tipo_prezzo: a.tipo_prezzo,
        prezzo: parseFloat(a.prezzo) || 0,
        prezzo_acquisto: parseFloat(a.prezzo_acquisto) || 0,
        mq_minimo: a.mq_minimo ? parseFloat(a.mq_minimo) : null,
      })
    }
  }
  return result
}

export default function FormAccessoriGriglia({ initialAccessori, onChange }: Props) {
  const [groups, setGroups] = useState<GruppoState[]>(() => inputToGroups(initialAccessori))

  useEffect(() => {
    onChange(groupsToInput(groups))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), gruppo: '', gruppo_tipo: 'multiplo', accessori: [] },
    ])
  }

  const removeGroup = (tempId: string) => {
    setGroups((prev) => prev.filter((g) => g.tempId !== tempId))
  }

  const updateGroup = (tempId: string, field: 'gruppo' | 'gruppo_tipo', value: string) => {
    setGroups((prev) => prev.map((g) => g.tempId === tempId ? { ...g, [field]: value } : g))
  }

  const addAccessorio = (groupTempId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.tempId === groupTempId
          ? {
              ...g,
              accessori: [
                ...g.accessori,
                { tempId: crypto.randomUUID(), nome: '', tipo_prezzo: 'pezzo' as const, prezzo: '', prezzo_acquisto: '', mq_minimo: '' },
              ],
            }
          : g
      )
    )
  }

  const removeAccessorio = (groupTempId: string, accTempId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.tempId === groupTempId
          ? { ...g, accessori: g.accessori.filter((a) => a.tempId !== accTempId) }
          : g
      )
    )
  }

  const updateAccessorio = (
    groupTempId: string,
    accTempId: string,
    field: keyof Omit<AccessorioState, 'tempId'>,
    value: string
  ) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.tempId === groupTempId
          ? { ...g, accessori: g.accessori.map((a) => a.tempId === accTempId ? { ...a, [field]: value } : a) }
          : g
      )
    )
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          Nessun accessorio configurato. Aggiungi un gruppo per iniziare.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.tempId} className="border rounded-lg p-4 space-y-3 bg-gray-50">
          {/* Header gruppo */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-gray-600">Nome gruppo</Label>
              <Input
                value={group.gruppo}
                onChange={(e) => updateGroup(group.tempId, 'gruppo', e.target.value)}
                placeholder="es. Tapparella, Vetro, Maniglia..."
                className="h-9"
              />
            </div>
            <div className="w-44 space-y-1.5">
              <Label className="text-xs text-gray-600">Tipo selezione</Label>
              <Select
                value={group.gruppo_tipo}
                onValueChange={(v) => updateGroup(group.tempId, 'gruppo_tipo', v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiplo">Multiplo</SelectItem>
                  <SelectItem value="unico">Unico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => removeGroup(group.tempId)}
              className="h-9 w-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md"
              title="Rimuovi gruppo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-gray-400">
            {group.gruppo_tipo === 'unico'
              ? 'Unico: nel preventivo si seleziona al massimo un accessorio di questo gruppo'
              : 'Multiplo: nel preventivo si possono selezionare più accessori di questo gruppo'}
          </p>

          {/* Accessori del gruppo */}
          {group.accessori.length > 0 && (
            <div className="space-y-2">
              {group.accessori.map((acc) => (
                <div key={acc.tempId} className="bg-white border rounded-md p-3 space-y-2">
                  {/* Riga 1: Nome + tipo prezzo + elimina */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-gray-500">Nome accessorio</Label>
                      <Input
                        value={acc.nome}
                        onChange={(e) => updateAccessorio(group.tempId, acc.tempId, 'nome', e.target.value)}
                        placeholder="es. Con tapparella in PVC"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-44 space-y-1">
                      <Label className="text-xs text-gray-500">Tipo prezzo</Label>
                      <Select
                        value={acc.tipo_prezzo}
                        onValueChange={(v) => updateAccessorio(group.tempId, acc.tempId, 'tipo_prezzo', v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pezzo">A pezzo</SelectItem>
                          <SelectItem value="mq">Al metro quadro</SelectItem>
                          <SelectItem value="percentuale">% prezzo base</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAccessorio(group.tempId, acc.tempId)}
                      className="h-8 w-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Riga 2: Prezzi */}
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-gray-500">
                        {acc.tipo_prezzo === 'percentuale' ? 'Percentuale (%)' : 'Prezzo vendita (€)'}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={acc.tipo_prezzo === 'percentuale' ? 0.1 : 0.01}
                        value={acc.prezzo}
                        onChange={(e) => updateAccessorio(group.tempId, acc.tempId, 'prezzo', e.target.value)}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-amber-700">Costo acquisto (€)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={acc.prezzo_acquisto}
                        onChange={(e) => updateAccessorio(group.tempId, acc.tempId, 'prezzo_acquisto', e.target.value)}
                        placeholder="0"
                        className="h-8 text-sm border-amber-200 focus-visible:ring-amber-400"
                      />
                    </div>
                    {acc.tipo_prezzo === 'mq' && (
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-gray-500">Mq minimi</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={acc.mq_minimo}
                          onChange={(e) => updateAccessorio(group.tempId, acc.tempId, 'mq_minimo', e.target.value)}
                          placeholder="es. 1.5"
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => addAccessorio(group.tempId)}
            className="text-xs h-8 text-gray-600"
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1" />
            Aggiungi accessorio
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addGroup}
      >
        <Plus className="h-4 w-4 mr-1" />
        Aggiungi gruppo accessori
      </Button>
    </div>
  )
}
